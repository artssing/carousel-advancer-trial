import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  generatePayoutReference,
  payoutMethodDisplayLabel,
  PAYOUT_MAX_HKD,
  PAYOUT_MIN_HKD,
  PayoutMethodTypeKey,
  validatePayoutAccount,
} from '@authentik/utils';
import { PayoutMethodType, PayoutStatus } from '@prisma/client';

/**
 * Wallet / Cashout service. ALL MOCK — no real FPS / bank / Stripe Connect.
 * Mock state machine:
 *   PENDING ──3s──> PROCESSING ──5s──> 95% SUCCEEDED / 5% FAILED
 * onModuleInit rehydrates pending/processing timers from DB (lesson: don't
 * keep state only in-memory — survive API restart).
 */
@Injectable()
export class WalletService implements OnModuleInit {
  private readonly log = new Logger(WalletService.name);
  /**
   * Status that locks seller / authenticator funds:
   *  • Any DISPUTED order — funds held until admin resolves
   *  • Non-terminal in-flight states — order not yet COMPLETED
   * Terminal states releasing funds: COMPLETED (subject to 72hr eligibility)
   * Terminal states with no funds: AUTH_FAILED variants / CANCELED / AUTO_CANCELED
   */
  private readonly LOCKED_STATUSES = [
    'AWAITING_PAYMENT',
    'PAID',
    'HANDOVER_TO_AUTH',
    'SELLER_ACK_PENDING',
    'CUSTODY',
    'AUTHENTICATING',
    'AUTH_PASSED',
    'SHIPPED_TO_BUYER',
    'DELIVERED',
    'AWAITING_AUTH_RECEIPT',
    'AUTH_RECEIVED',
    'SHIP_PENDING_BUYER_ACK',
    'DISPUTED',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Rehydrate timers for any PENDING / PROCESSING PayoutRequest left after restart.
    const rows = await this.prisma.payoutRequest.findMany({
      where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
    });
    for (const r of rows) {
      const ageMs = Date.now() - new Date(r.createdAt).getTime();
      this.scheduleMockTransitions(r.id, ageMs);
    }
    if (rows.length > 0) {
      this.log.log(`Rehydrated ${rows.length} pending payout timer(s)`);
    }
  }

  // ── Balance ─────────────────────────────────────────────────────────────
  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authenticator: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const authId = user.authenticator?.id;

    // Seller side: Order.sellerNetHKD
    const sellerOrders = await this.prisma.order.findMany({
      where: { sellerId: userId },
      select: {
        id: true, status: true, salePriceHKD: true, sellerNetHKD: true,
        completedAt: true, cashoutEligibleAt: true,
        listing: { select: { id: true, title: true } },
      },
    });

    // Auth side: Order.authFeeHKD where the order points at this authenticator
    const authOrders = authId
      ? await this.prisma.order.findMany({
          where: { authenticatorId: authId },
          select: {
            id: true, status: true, authFeeHKD: true,
            completedAt: true, cashoutEligibleAt: true,
            listing: { select: { id: true, title: true } },
          },
        })
      : [];

    const now = new Date();
    let locked = 0;
    let pendingHold = 0;       // COMPLETED but cashoutEligibleAt > now
    let availableGross = 0;     // COMPLETED + eligible
    const breakdown: Array<{
      orderId: string; listingId: string; listingTitle: string; role: 'SELLER' | 'AUTHENTICATOR';
      amountHKD: number; bucket: 'LOCKED' | 'PENDING' | 'AVAILABLE'; status: string;
      eligibleAt: string | null; completedAt: string | null;
    }> = [];

    const classify = (
      role: 'SELLER' | 'AUTHENTICATOR',
      o: { id: string; status: string; completedAt: Date | null; cashoutEligibleAt: Date | null;
           listing: { id: string; title: string } },
      amount: number,
    ) => {
      if (amount <= 0) return;
      let bucket: 'LOCKED' | 'PENDING' | 'AVAILABLE';
      if (this.LOCKED_STATUSES.includes(o.status)) {
        locked += amount;
        bucket = 'LOCKED';
      } else if (o.status === 'COMPLETED') {
        const eligible = o.cashoutEligibleAt && o.cashoutEligibleAt <= now;
        if (eligible) { availableGross += amount; bucket = 'AVAILABLE'; }
        else { pendingHold += amount; bucket = 'PENDING'; }
      } else {
        // Other terminal states (AUTH_FAILED variants, CANCELED) — no payable amount
        return;
      }
      breakdown.push({
        orderId: o.id, listingId: o.listing.id, listingTitle: o.listing.title,
        role, amountHKD: amount, bucket, status: o.status,
        eligibleAt: o.cashoutEligibleAt?.toISOString() ?? null,
        completedAt: o.completedAt?.toISOString() ?? null,
      });
    };

    for (const o of sellerOrders) classify('SELLER', o, o.sellerNetHKD);
    for (const o of authOrders)   classify('AUTHENTICATOR', o, o.authFeeHKD);

    // Subtract pending / processing / succeeded payout requests from availableGross.
    // Failed / Reversed don't reduce.
    const outstanding = await this.prisma.payoutRequest.aggregate({
      where: { userId, status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING, PayoutStatus.SUCCEEDED] } },
      _sum: { amountHKD: true },
    });
    const cashedOut = outstanding._sum.amountHKD ?? 0;
    // 「處理中」= 已申請提款但未到帳（PENDING + PROCESSING）
    const inFlight = await this.prisma.payoutRequest.aggregate({
      where: { userId, status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
      _sum: { amountHKD: true },
      _count: true,
    });
    const inFlightHKD = inFlight._sum.amountHKD ?? 0;
    const available = Math.max(0, availableGross - cashedOut);

    const fee = await this.getPayoutFeeHKD();

    return {
      lockedHKD: locked,
      pendingHoldHKD: pendingHold,
      availableHKD: available,
      inFlightHKD,                       // 已申請提款，仲係處理中（未到買家戶口）
      inFlightCount: inFlight._count,
      grossEarnedHKD: availableGross,    // before subtracting past cashouts
      cashedOutHKD: cashedOut,
      payoutFeeHKD: fee,
      minHKD: PAYOUT_MIN_HKD,
      maxHKD: PAYOUT_MAX_HKD,
      hasAuthenticatorRole: !!authId,
      breakdown,
    };
  }

  async getPayoutFeeHKD(): Promise<number> {
    const row = await this.prisma.platformConfig.findUnique({ where: { key: 'payoutFeeHKD' } });
    const v = row?.value as { amount?: number } | null;
    return Math.max(0, Math.min(100, v?.amount ?? 0));
  }

  // ── Methods CRUD ────────────────────────────────────────────────────────
  async listMethods(userId: string) {
    return this.prisma.payoutMethod.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createMethod(userId: string, dto: {
    type: PayoutMethodTypeKey;
    accountIdentifier: string;
    bankCode?: string;
    accountName: string;
    isDefault?: boolean;
  }) {
    const v = validatePayoutAccount(dto.type, dto.accountIdentifier, dto.bankCode);
    if (!v.ok) throw new BadRequestException(v.reason ?? 'Invalid account data');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Soft name-match heuristic: lowercase strip-non-alpha, contains check.
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, '');
    const nameMatchesKyc =
      norm(dto.accountName).length > 0 &&
      (norm(user.displayName).includes(norm(dto.accountName)) ||
       norm(dto.accountName).includes(norm(user.displayName)));

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.payoutMethod.updateMany({
          where: { userId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      // First method auto-default
      const count = await tx.payoutMethod.count({ where: { userId, deletedAt: null } });
      return tx.payoutMethod.create({
        data: {
          userId,
          type: dto.type as PayoutMethodType,
          accountIdentifier: dto.accountIdentifier.trim(),
          bankCode: dto.bankCode?.trim() || null,
          accountName: dto.accountName.trim(),
          nameMatchesKyc,
          isDefault: dto.isDefault || count === 0,
          isVerified: true, // mock
        },
      });
    });
  }

  async setDefaultMethod(userId: string, methodId: string) {
    const m = await this.prisma.payoutMethod.findUnique({ where: { id: methodId } });
    if (!m || m.userId !== userId || m.deletedAt) throw new NotFoundException('Method not found');
    await this.prisma.$transaction([
      this.prisma.payoutMethod.updateMany({
        where: { userId, deletedAt: null },
        data: { isDefault: false },
      }),
      this.prisma.payoutMethod.update({
        where: { id: methodId },
        data: { isDefault: true },
      }),
    ]);
    return { ok: true };
  }

  async deleteMethod(userId: string, methodId: string) {
    const m = await this.prisma.payoutMethod.findUnique({ where: { id: methodId } });
    if (!m || m.userId !== userId || m.deletedAt) throw new NotFoundException('Method not found');
    const active = await this.prisma.payoutRequest.count({
      where: { payoutMethodId: methodId, status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
    });
    if (active > 0) {
      throw new ConflictException('此提款帳戶有未完成嘅提款，請等處理完才刪除。');
    }
    await this.prisma.payoutMethod.update({
      where: { id: methodId },
      data: { deletedAt: new Date(), isDefault: false },
    });
    return { ok: true };
  }

  // ── Requests ────────────────────────────────────────────────────────────
  async listRequests(userId: string) {
    return this.prisma.payoutRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRequest(userId: string, requestId: string) {
    const r = await this.prisma.payoutRequest.findUnique({ where: { id: requestId } });
    if (!r || r.userId !== userId) throw new NotFoundException('Payout not found');
    return r;
  }

  async createRequest(userId: string, dto: { payoutMethodId: string; amountHKD: number }) {
    const method = await this.prisma.payoutMethod.findUnique({ where: { id: dto.payoutMethodId } });
    if (!method || method.userId !== userId || method.deletedAt) {
      throw new NotFoundException('Payout method not found');
    }
    const amount = Math.floor(Number(dto.amountHKD));
    if (!Number.isFinite(amount) || amount < PAYOUT_MIN_HKD) {
      throw new BadRequestException(`最低提款金額 HKD ${PAYOUT_MIN_HKD}`);
    }
    if (amount > PAYOUT_MAX_HKD) {
      throw new BadRequestException(`單次提款上限 HKD ${PAYOUT_MAX_HKD.toLocaleString()}`);
    }

    const fee = await this.getPayoutFeeHKD();

    // Atomic balance check inside transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const balance = await this.getBalance(userId); // re-check inside tx (read-only)
      if (amount > balance.availableHKD) {
        throw new ConflictException(`可提取餘額不足（HKD ${balance.availableHKD}）`);
      }
      return tx.payoutRequest.create({
        data: {
          userId,
          payoutMethodId: method.id,
          methodSnapshot: {
            type: method.type,
            accountIdentifier: method.accountIdentifier,
            bankCode: method.bankCode,
            accountName: method.accountName,
            displayLabel: payoutMethodDisplayLabel(
              method.type as PayoutMethodTypeKey,
              method.accountIdentifier,
              method.bankCode,
            ),
          },
          amountHKD: amount,
          feeHKD: fee,
          netHKD: amount - fee,
          status: PayoutStatus.PENDING,
          reference: generatePayoutReference(),
        },
      });
    });

    this.scheduleMockTransitions(created.id, 0);
    return created;
  }

  // ── Mock state machine ──────────────────────────────────────────────────
  /** Schedule transitions, accounting for already-elapsed time (rehydrate). */
  private scheduleMockTransitions(requestId: string, alreadyElapsedMs: number) {
    const PENDING_MS = 3_000;
    const PROCESSING_MS = 5_000;

    const toProcessingAt = Math.max(0, PENDING_MS - alreadyElapsedMs);
    const toFinalAt = Math.max(0, PENDING_MS + PROCESSING_MS - alreadyElapsedMs);

    setTimeout(async () => {
      try {
        await this.prisma.payoutRequest.updateMany({
          where: { id: requestId, status: PayoutStatus.PENDING },
          data: { status: PayoutStatus.PROCESSING },
        });
      } catch (e) {
        this.log.warn(`mock PENDING→PROCESSING failed for ${requestId}: ${(e as Error).message}`);
      }
    }, toProcessingAt);

    setTimeout(async () => {
      try {
        const cur = await this.prisma.payoutRequest.findUnique({ where: { id: requestId } });
        if (!cur || cur.status !== PayoutStatus.PROCESSING) return;
        const fail = Math.random() < 0.05;
        const failReasons = ['BANK_REJECTED', 'INVALID_ACCOUNT', 'BENEFICIARY_MISMATCH'];
        await this.prisma.payoutRequest.update({
          where: { id: requestId },
          data: {
            status: fail ? PayoutStatus.FAILED : PayoutStatus.SUCCEEDED,
            failureReason: fail ? failReasons[Math.floor(Math.random() * failReasons.length)] : null,
            processedAt: new Date(),
          },
        });
      } catch (e) {
        this.log.warn(`mock final transition failed for ${requestId}: ${(e as Error).message}`);
      }
    }, toFinalAt);
  }
}
