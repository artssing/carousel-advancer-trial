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
import { PayoutIntentKind, PayoutMethodType, PayoutStatus } from '@prisma/client';
import { AuthService } from '../auth/auth.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

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

  /**
   * Internal executor — payout-method row creation. NOT exposed directly:
   * adding a payout method is the classic account-takeover step 1 (add own
   * account, then drain), so it's gated behind 2FA（founder 2026-07-13）.
   * Reach it via initiateAddMethod() → confirmAddMethod().
   */
  private async createMethod(userId: string, dto: {
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

  /**
   * Shared validation for a payout request (used by BOTH initiate — so the
   * user learns about problems BEFORE burning an OTP — and the final create).
   * Returns the validated method + integer amount.
   */
  private async validatePayoutRequest(userId: string, dto: { payoutMethodId: string; amountHKD: number }) {
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
    return { method, amount };
  }

  /**
   * Internal executor — payout-request row creation. NOT exposed directly:
   * withdrawals require 2FA（founder 2026-07-13）. Reach it via
   * initiatePayout() → confirmPayout(), which passes the verified channel.
   */
  private async createRequest(
    userId: string,
    dto: { payoutMethodId: string; amountHKD: number },
    verified: { via: string; at: Date },
  ) {
    const { method, amount } = await this.validatePayoutRequest(userId, dto);

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
          verifiedVia: verified.via,
          verifiedAt: verified.at,
        },
      });
    });

    this.scheduleMockTransitions(created.id, 0);
    return created;
  }

  // ── 2FA step-up（founder 2026-07-13 拍板 — docs/proposals/payout-2fa-proposal.md）──
  //
  // 「提款 + 新增收款戶口」兩個閘都要 2FA（Q1）。MVP channel = Email OTP（Q4；
  // SMS 待真 provider 後升做首選）。冇 verified email → 擋 + 引導驗證（Q2）。
  // 全額都驗，唔設細額豁免（Q3）。兩 portal 同一套（Q5）。
  //
  // 防 replay 核心：OTP bind 落一個 PayoutIntent（凍結 payload、10 分鐘 TTL、
  // 一次性）。金額/戶口改咗 = 新 intent = 新 OTP。

  private static readonly INTENT_TTL_MS = 10 * 60_000;

  /** "peanut@x.com" → "p*****@x.com" — show enough to recognise, not enumerate. */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
  }

  /**
   * Gate: user must have a verified contact channel before any payout action.
   * Founder Q2: 擋住 + 引導先驗證 — no exemption for legacy users (exempted
   * accounts are exactly the ones attackers hunt for).
   * MVP = email only; phone/SMS joins in Phase 2.
   */
  private async requireVerifiedChannel(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.emailVerified) {
      throw new ForbiddenException(
        '為保障你嘅資金安全，提款相關操作需要先驗證電郵。請到「帳戶設定」完成電郵驗證。',
      );
    }
    return user;
  }

  private async createIntent(
    userId: string,
    kind: PayoutIntentKind,
    payload: Record<string, unknown>,
    email: string,
    ipAddress: string | undefined,
  ) {
    const intent = await this.prisma.payoutIntent.create({
      data: {
        userId,
        kind,
        payload: payload as any,
        channel: 'EMAIL',
        expiresAt: new Date(Date.now() + WalletService.INTENT_TTL_MS),
      },
    });
    const { expiresInSeconds } = await this.auth.sendEmailOtp(email, 'PAYOUT_CONFIRM', ipAddress, userId);
    return {
      intentId: intent.id,
      channel: 'EMAIL' as const,
      maskedTarget: this.maskEmail(email),
      otpExpiresInSeconds: expiresInSeconds,
    };
  }

  /**
   * Load + single-use-consume an intent, then verify the OTP code.
   * Consumption is a guarded update（consumedAt: null）— a second confirm on
   * the same intent (double-submit / second device) hits count=0 → 409.
   * NOTE: intent is consumed BEFORE the executor runs; if the executor then
   * fails (e.g. balance changed), the user re-initiates with a fresh OTP —
   * a used code must never become retryable.
   */
  private async consumeIntent(userId: string, intentId: string, kind: PayoutIntentKind, code: string, email: string) {
    const intent = await this.prisma.payoutIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.userId !== userId || intent.kind !== kind) {
      throw new NotFoundException('驗證請求不存在，請重新發起');
    }
    if (intent.consumedAt) {
      throw new ConflictException('呢個請求已經處理咗');
    }
    if (intent.expiresAt < new Date()) {
      throw new BadRequestException('驗證請求已過期，請重新發起提款');
    }
    // Verify OTP first (attempt-counting lives in consumeEmailOtp) — wrong
    // code must NOT consume the intent, so the user can retry within limits.
    await this.auth.consumeEmailOtp(email, code, 'PAYOUT_CONFIRM');
    const consumed = await this.prisma.payoutIntent.updateMany({
      where: { id: intentId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new ConflictException('呢個請求已經處理咗');
    }
    return intent;
  }

  /** Step 1 of 提款: validate everything, freeze intent, send OTP. */
  async initiatePayout(
    userId: string,
    dto: { payoutMethodId: string; amountHKD: number },
    ipAddress: string | undefined,
  ) {
    const user = await this.requireVerifiedChannel(userId);
    const { amount } = await this.validatePayoutRequest(userId, dto);
    // Pre-check balance so the user learns BEFORE burning an OTP; the
    // authoritative atomic re-check stays inside createRequest's transaction.
    const balance = await this.getBalance(userId);
    if (amount > balance.availableHKD) {
      throw new ConflictException(`可提取餘額不足（HKD ${balance.availableHKD}）`);
    }
    return this.createIntent(
      userId,
      PayoutIntentKind.PAYOUT_REQUEST,
      { payoutMethodId: dto.payoutMethodId, amountHKD: amount },
      user.email,
      ipAddress,
    );
  }

  /** Step 2 of 提款: verify code, execute the frozen intent. */
  async confirmPayout(userId: string, intentId: string, code: string) {
    const user = await this.requireVerifiedChannel(userId);
    const intent = await this.consumeIntent(
      userId, intentId, PayoutIntentKind.PAYOUT_REQUEST, code, user.email,
    );
    const payload = intent.payload as { payoutMethodId: string; amountHKD: number };
    return this.createRequest(userId, payload, { via: intent.channel, at: new Date() });
  }

  /** Step 1 of 新增收款戶口: validate account format, freeze intent, send OTP. */
  async initiateAddMethod(
    userId: string,
    dto: {
      type: PayoutMethodTypeKey;
      accountIdentifier: string;
      bankCode?: string;
      accountName: string;
      isDefault?: boolean;
    },
    ipAddress: string | undefined,
  ) {
    const user = await this.requireVerifiedChannel(userId);
    // Validate format upfront — same "fail before OTP" principle.
    const v = validatePayoutAccount(dto.type, dto.accountIdentifier, dto.bankCode);
    if (!v.ok) throw new BadRequestException(v.reason ?? 'Invalid account data');
    return this.createIntent(
      userId,
      PayoutIntentKind.ADD_METHOD,
      { ...dto },
      user.email,
      ipAddress,
    );
  }

  /** Step 2 of 新增收款戶口: verify code, create the method. */
  async confirmAddMethod(userId: string, intentId: string, code: string) {
    const user = await this.requireVerifiedChannel(userId);
    const intent = await this.consumeIntent(
      userId, intentId, PayoutIntentKind.ADD_METHOD, code, user.email,
    );
    const payload = intent.payload as {
      type: PayoutMethodTypeKey;
      accountIdentifier: string;
      bankCode?: string;
      accountName: string;
      isDefault?: boolean;
    };
    return this.createMethod(userId, payload);
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
