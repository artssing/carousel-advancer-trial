/**
 * Admin API endpoints — minimal MVP.
 *
 * Auth: ALL endpoints require JWT + user must have one of the admin roles.
 * Future: replace with proper RBAC + audit log.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { stripeAdapter } from '../payments/stripe-adapter';

const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];
const OPS_ADMIN_ROLES = ['OPS_ADMIN', 'SUPER_ADMIN']; // Q3=A — suspend gated to this tier

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private async requireAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!u || !u.roles.some((r) => ADMIN_ROLES.includes(r))) {
      throw new ForbiddenException('需要 admin 權限');
    }
  }

  /** Higher tier — required for suspend, role-change, force-refund (Q3=A). */
  private async requireOpsAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!u || !u.roles.some((r) => OPS_ADMIN_ROLES.includes(r))) {
      throw new ForbiddenException('需要 OPS_ADMIN 或 SUPER_ADMIN 權限');
    }
  }

  private logAdminAction(input: {
    actorId: string;
    targetUserId?: string;
    targetOrderId?: string;
    action: string;
    payload?: any;
  }) {
    return this.prisma.adminAction.create({
      data: {
        actorId: input.actorId,
        targetUserId: input.targetUserId ?? null,
        targetOrderId: input.targetOrderId ?? null,
        action: input.action,
        payload: input.payload ?? null,
      },
    });
  }

  @Get('overview')
  async overview(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    const [users, listings, orders, disputes, kycPending, sellerReviews] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.listing.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'DISPUTED' } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.sellerReview.count(),
    ]);
    return { users, listings, orders, disputes, kycPending, sellerReviews };
  }

  @Get('disputes')
  async disputes(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    return this.prisma.order.findMany({
      where: { status: 'DISPUTED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        listing: { select: { id: true, title: true } },
        buyer: { select: { id: true, displayName: true, email: true } },
        seller: { select: { id: true, displayName: true, email: true } },
        authenticator: { select: { id: true, displayName: true } },
      },
    });
  }

  @Get('kyc-queue')
  async kycQueue(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    return this.prisma.user.findMany({
      where: { kycStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, email: true, displayName: true, createdAt: true, roles: true },
    });
  }

  @Patch('kyc/:userId/approve')
  async approveKyc(@CurrentUser() user: CurrentUserData, @Param('userId') target: string) {
    await this.requireAdmin(user.userId);
    return this.prisma.user.update({
      where: { id: target },
      data: { kycStatus: 'VERIFIED' },
      select: { id: true, email: true, kycStatus: true },
    });
  }

  @Patch('kyc/:userId/reject')
  async rejectKyc(@CurrentUser() user: CurrentUserData, @Param('userId') target: string) {
    await this.requireAdmin(user.userId);
    return this.prisma.user.update({
      where: { id: target },
      data: { kycStatus: 'REJECTED' },
      select: { id: true, email: true, kycStatus: true },
    });
  }

  @Get('users')
  async users(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    const all = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, email: true, displayName: true, kycStatus: true, roles: true, createdAt: true,
        suspendedAt: true, suspendedReason: true,
        emailVerified: true, avatarUrl: true,
        _count: { select: { proposedOffers: true, sellerReviewsReceived: true } },
      },
    });
    return all;
  }

  /**
   * Detailed user profile for the right-side drawer.
   * Includes:
   *   - core profile + suspend state
   *   - recent 5 orders across all roles (buyer / seller / authenticator) — Lesson #6
   *   - linked OAuth providers
   *   - recent admin actions taken on this user
   */
  @Get('users/:id')
  async userDetail(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.requireAdmin(user.userId);
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        authenticator: { select: { id: true, displayName: true, status: true, starRating: true, completedCount: true } },
        oauthAccounts: { select: { provider: true, createdAt: true } },
        _count: { select: { proposedOffers: true, sellerReviewsReceived: true, listings: true } },
      },
    });
    if (!u) throw new NotFoundException('User not found');

    // Recent 5 orders across all 3 roles (Lesson #6 — cover buyer/seller/auth)
    const authId = u.authenticator?.id;
    const recentOrders = await this.prisma.order.findMany({
      where: {
        OR: [
          { buyerId: id },
          { sellerId: id },
          ...(authId ? [{ authenticatorId: authId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, status: true, salePriceHKD: true, createdAt: true,
        buyerId: true, sellerId: true, authenticatorId: true,
        listing: { select: { id: true, title: true } },
      },
    });

    // Recent admin actions targeting this user
    const recentActions = await this.prisma.adminAction.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Resolve actor displayNames for the action list
    const actorIds = Array.from(new Set(recentActions.map((a) => a.actorId)));
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, displayName: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    // Strip passwordHash from response
    const { passwordHash, ...safe } = u as any;

    return {
      ...safe,
      recentOrders: recentOrders.map((o) => ({
        ...o,
        role: o.buyerId === id ? 'BUYER' : o.sellerId === id ? 'SELLER' : 'AUTHENTICATOR',
      })),
      recentActions: recentActions.map((a) => ({
        ...a,
        actor: actorMap.get(a.actorId) ?? null,
      })),
    };
  }

  /** Suspend user — blocks login + naturally freezes any in-flight escrow (Q1=B). */
  @Patch('users/:id/suspend')
  async suspendUser(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    if (id === user.userId) {
      throw new BadRequestException('唔可以暫停自己嘅帳戶');
    }
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入暫停原因');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.suspendedAt) throw new BadRequestException('帳戶已經被暫停');

    // Prevent suspending other admins (only SUPER_ADMIN can)
    const isTargetAdmin = target.roles.some((r) => ADMIN_ROLES.includes(r));
    if (isTargetAdmin) {
      const me = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { roles: true } });
      if (!me?.roles.includes('SUPER_ADMIN')) {
        throw new ForbiddenException('只有 SUPER_ADMIN 可以暫停其他 admin');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { suspendedAt: new Date(), suspendedReason: reason, suspendedById: user.userId },
        select: { id: true, suspendedAt: true, suspendedReason: true, suspendedById: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.suspend',
          payload: { reason },
        },
      }),
    ]);
    return updated;
  }

  // ── KYC three-way toggle (any → any) — OPS_ADMIN+ ────────────────────
  /**
   * Sets KYC to PENDING / VERIFIED / REJECTED.
   * Q1=A: if newStatus === REJECTED, also auto-suspend the user (single transaction)
   * so they cannot continue placing Tier 3 orders.
   */
  @Patch('users/:id/kyc')
  async setKyc(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { status: 'PENDING' | 'VERIFIED' | 'REJECTED'; reason?: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const newStatus = body?.status;
    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(newStatus as any)) {
      throw new BadRequestException('Invalid KYC status');
    }
    const reason = (body?.reason ?? '').trim();
    if (newStatus !== 'VERIFIED' && !reason) {
      // For REJECTED / PENDING (force re-KYC), require justification
      throw new BadRequestException('請輸入原因（REJECTED / 重新審核 需註明）');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.kycStatus === newStatus) {
      throw new BadRequestException(`KYC 狀態已經係 ${newStatus}`);
    }

    const fromStatus = target.kycStatus;
    const autoSuspend = newStatus === 'REJECTED' && !target.suspendedAt;

    const ops: any[] = [
      this.prisma.user.update({
        where: { id },
        data: {
          kycStatus: newStatus,
          ...(autoSuspend ? {
            suspendedAt: new Date(),
            suspendedReason: `KYC rejected: ${reason}`,
            suspendedById: user.userId,
          } : {}),
        },
        select: { id: true, kycStatus: true, suspendedAt: true, suspendedReason: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.kycChange',
          payload: { from: fromStatus, to: newStatus, reason, autoSuspended: autoSuspend },
        },
      }),
    ];
    if (autoSuspend) {
      ops.push(this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.suspend',
          payload: { reason: `Auto: KYC rejected (${reason})`, cascade: 'kycChange' },
        },
      }));
    }
    const [updated] = await this.prisma.$transaction(ops);
    return updated;
  }

  // ── Role change — tiered RBAC + safety guards ────────────────────────
  /**
   * Set the full role array for a user. Tiered RBAC:
   *   OPS_ADMIN: can change BUYER/SELLER/AUTHENTICATOR/OPS_AGENT
   *              (Q2=A — OPS_AGENT can already add AUTHENTICATOR role,
   *              actually we require OPS_ADMIN to keep the boundary clean;
   *              Q2=A only relaxes the actor side, not the role-being-granted side.
   *              See coordinator note. Final: OPS_ADMIN+ for any role change.)
   *   SUPER_ADMIN: can change all roles including OPS_ADMIN/SUPER_ADMIN.
   *
   * Safety:
   *   - Cannot remove your last admin role from yourself
   *   - Cannot remove the last SUPER_ADMIN from the system
   *   - AUTHENTICATOR removal with active Authenticator record requires confirmation
   *     (server allows; UI shows warning)
   */
  @Patch('users/:id/roles')
  async setRoles(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { roles: string[] },
  ) {
    await this.requireOpsAdmin(user.userId);

    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { authenticator: { select: { id: true, status: true } } },
    });
    if (!target) throw new NotFoundException('User not found');

    const VALID = ['BUYER', 'SELLER', 'AUTHENTICATOR', 'OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];
    const newRoles = Array.from(new Set((body?.roles ?? []).filter((r) => VALID.includes(r))));
    if (newRoles.length === 0) {
      throw new BadRequestException('User 至少要有一個角色');
    }
    const oldRoles = target.roles;
    const added = newRoles.filter((r) => !oldRoles.includes(r as any));
    const removed = oldRoles.filter((r) => !newRoles.includes(r));
    if (added.length === 0 && removed.length === 0) {
      throw new BadRequestException('冇任何角色改動');
    }

    // Tier check: changing OPS_ADMIN / SUPER_ADMIN requires SUPER_ADMIN actor
    const touchesSuper = [...added, ...removed].some((r) => r === 'OPS_ADMIN' || r === 'SUPER_ADMIN');
    if (touchesSuper) {
      const me = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { roles: true } });
      if (!me?.roles.includes('SUPER_ADMIN')) {
        throw new ForbiddenException('改 OPS_ADMIN / SUPER_ADMIN 角色需要 SUPER_ADMIN 權限');
      }
    }

    // Self last-admin-role guard
    if (id === user.userId) {
      const wouldBeAdminAfter = newRoles.some((r) => ADMIN_ROLES.includes(r));
      if (!wouldBeAdminAfter) {
        throw new BadRequestException('唔可以移除自己嘅最後一個 admin role');
      }
    }

    // Last SUPER_ADMIN guard
    if (oldRoles.includes('SUPER_ADMIN') && !newRoles.includes('SUPER_ADMIN')) {
      const remainingSupers = await this.prisma.user.count({
        where: { roles: { has: 'SUPER_ADMIN' }, id: { not: id } },
      });
      if (remainingSupers === 0) {
        throw new BadRequestException('唔可以移除系統最後一個 SUPER_ADMIN');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { roles: newRoles as any },
        select: { id: true, roles: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.roleChange',
          payload: {
            from: oldRoles,
            to: newRoles,
            added, removed,
            authenticatorActiveAtRemoval:
              removed.includes('AUTHENTICATOR') && target.authenticator?.status === 'ACTIVE',
          },
        },
      }),
    ]);
    return updated;
  }

  // ── Email verified toggle ────────────────────────────────────────────
  @Patch('users/:id/email-verified')
  async setEmailVerified(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { value: boolean; reason?: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.emailVerified === body.value) {
      throw new BadRequestException(`Email verified 已經係 ${body.value}`);
    }
    // Reverting verified → unverified requires reason
    if (target.emailVerified && !body.value && !(body.reason ?? '').trim()) {
      throw new BadRequestException('降級 emailVerified 需要原因');
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { emailVerified: body.value },
        select: { id: true, emailVerified: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.emailVerifiedChange',
          payload: { from: target.emailVerified, to: body.value, reason: body.reason ?? null },
        },
      }),
    ]);
    return updated;
  }

  // ── Reset password (mock until SMTP) — P1 ────────────────────────────
  /**
   * Q3=A: generate 8-char temp password, return it ONCE in response.
   * Ops 自行通知 user (WhatsApp etc). Plaintext NEVER logged.
   * 將來 SMTP 接好之後改為 send link，唔再 return plaintext.
   */
  @Post('users/:id/reset-password')
  async resetPassword(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.requireOpsAdmin(user.userId);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const tempPassword = generateTempPassword(10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.passwordReset',
          // Do NOT log plaintext; just record the action.
          payload: { method: 'temp_password_generated' },
        },
      }),
    ]);
    return {
      tempPassword,
      warning: '請即時通知 user 並提醒佢首次登入後立即改密碼。此密碼只顯示一次。',
    };
  }

  // ── Admin notes (append-only version history, Q4=A) ──────────────────
  @Post('users/:id/notes')
  async addNote(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    await this.requireAdmin(user.userId); // OPS_AGENT+ can write notes
    const text = (body?.body ?? '').trim();
    if (!text) throw new BadRequestException('Note 唔可以係空');
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    const note = await this.prisma.adminNote.create({
      data: { userId: id, authorId: user.userId, body: text },
      include: { user: false },
    });
    return note;
  }

  @Get('users/:id/notes')
  async listNotes(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.requireAdmin(user.userId);
    const notes = await this.prisma.adminNote.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Resolve author displayNames
    const authorIds = Array.from(new Set(notes.map((n) => n.authorId)));
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, displayName: true, email: true },
    });
    const map = new Map(authors.map((a) => [a.id, a]));
    return notes.map((n) => ({ ...n, author: map.get(n.authorId) ?? null }));
  }

  // ── Display name override — OPS_ADMIN+ + audit (Q5=A flag notify) ─────
  @Patch('users/:id/display-name')
  async overrideDisplayName(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { displayName: string; reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const newName = (body?.displayName ?? '').trim();
    const reason = (body?.reason ?? '').trim();
    if (!newName) throw new BadRequestException('顯示名稱不可為空');
    if (newName.length > 40) throw new BadRequestException('顯示名稱太長 (max 40)');
    if (!reason) throw new BadRequestException('請輸入原因');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.displayName === newName) {
      throw new BadRequestException('顯示名稱冇變');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { displayName: newName },
        select: { id: true, displayName: true },
      }),
      // Q5=A: flag this should notify user (SMTP/push not built yet; flag for backlog).
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.displayNameOverride',
          payload: { from: target.displayName, to: newName, reason, shouldNotifyUser: true },
        },
      }),
      // Sync to Authenticator.displayName if linked (Lesson #8 SSOT)
      this.prisma.authenticator.updateMany({
        where: { userId: id },
        data: { displayName: newName },
      }),
    ]);
    return updated;
  }

  @Patch('users/:id/unsuspend')
  async unsuspendUser(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.requireOpsAdmin(user.userId);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (!target.suspendedAt) throw new BadRequestException('帳戶冇被暫停');

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { suspendedAt: null, suspendedReason: null, suspendedById: null },
        select: { id: true, suspendedAt: true, suspendedReason: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: id,
          action: 'user.unsuspend',
          payload: { previousReason: target.suspendedReason },
        },
      }),
    ]);
    return updated;
  }

  /**
   * Platform finance summary — only `ONLINE_ESCROW` orders count toward revenue.
   * `OFFLINE_CASH` 面交現金交易平台收唔到撮合費，所以唔計（founder ruling 2026-06-10）。
   */
  // ── PlatformConfig admin endpoints ──────────────────────────────────
  @Get('platform-config')
  async listConfig(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    return this.prisma.platformConfig.findMany({ orderBy: { key: 'asc' } });
  }

  @Patch('platform-config/:key')
  async setConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('key') key: string,
    @Body() body: { value: any },
  ) {
    await this.requireOpsAdmin(user.userId);
    const existing = await this.prisma.platformConfig.findUnique({ where: { key } });
    const before = existing?.value ?? null;
    const updated = await this.prisma.platformConfig.upsert({
      where: { key },
      create: { key, value: body.value },
      update: { value: body.value },
    });
    await this.prisma.adminAction.create({
      data: {
        actorId: user.userId,
        action: 'platformConfig.update',
        payload: { key, before, after: body.value },
      },
    });
    return updated;
  }

  @Get('finance/summary')
  async financeSummary(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);

    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // Lifetime revenue: COMPLETED ONLINE_ESCROW only
    const lifetime = await this.prisma.order.aggregate({
      where: { status: 'COMPLETED', paymentMethod: 'ONLINE_ESCROW' },
      _sum: { platformFeeHKD: true },
      _count: true,
    });

    // MTD
    const mtdStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
    const mtd = await this.prisma.order.aggregate({
      where: {
        status: 'COMPLETED',
        paymentMethod: 'ONLINE_ESCROW',
        completedAt: { gte: mtdStart },
      },
      _sum: { platformFeeHKD: true },
      _count: true,
    });

    // Excluded (offline cash, for transparency)
    const offlineCount = await this.prisma.order.count({
      where: { status: 'COMPLETED', paymentMethod: 'OFFLINE_CASH' },
    });

    // Escrow currently held = active payments AUTHORIZED (not yet captured)
    const escrowAgg = await this.prisma.payment.aggregate({
      where: { status: 'AUTHORIZED' },
      _sum: { amountHKD: true },
    });

    // Payouts pending payout to authenticators / sellers
    const pendingPayouts = await this.prisma.payoutRequest.aggregate({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amountHKD: true },
    });

    return {
      lifetimeRevenueHKD: lifetime._sum.platformFeeHKD ?? 0,
      lifetimeOrders: lifetime._count,
      mtdRevenueHKD: mtd._sum.platformFeeHKD ?? 0,
      mtdOrders: mtd._count,
      mtdMonth: currentMonth,
      escrowHeldHKD: escrowAgg._sum.amountHKD ?? 0,
      pendingPayoutsHKD: pendingPayouts._sum.amountHKD ?? 0,
      offlineCashCompletedCount: offlineCount,
      note: '只計線上託管 (ONLINE_ESCROW) 已完成訂單；OFFLINE_CASH 面交現金平台唔抽佣，唔計入收入。',
    };
  }

  /**
   * PriceChange audit log — admin can review all seller price modifications
   * (DIRECT_EDIT / PENDING / APPLIED / CANCELLED). Each row is annotated with
   * a `suspicious` boolean computed against simple heuristics:
   *   - ≥ 3 drops in past 7 days for the same seller
   *   - Direct edit raising price by > 50% (could be setup for fake "discount")
   *   - A PENDING drop superseded within 24h (gaming pattern)
   *
   * Filters (all optional):
   *   ?status=PENDING|APPLIED|CANCELLED|DIRECT_EDIT
   *   ?sellerEmail=alice@demo.hk  (substring match)
   *   ?from=YYYY-MM-DD  ?to=YYYY-MM-DD
   *   ?suspicious=1  (server pre-filter)
   *   ?limit=50  ?offset=0
   */
  @Get('price-changes')
  async priceChanges(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
    @Query('sellerEmail') sellerEmail?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('suspicious') suspicious?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    await this.requireAdmin(user.userId);

    const where: any = {};
    if (status && ['PENDING', 'APPLIED', 'CANCELLED', 'DIRECT_EDIT'].includes(status)) {
      where.status = status;
    }
    if (from || to) {
      where.requestedAt = {};
      if (from) where.requestedAt.gte = new Date(from);
      if (to)   where.requestedAt.lte = new Date(to + 'T23:59:59.999Z');
    }
    if (sellerEmail) {
      where.seller = { is: { email: { contains: sellerEmail, mode: 'insensitive' } } };
    }

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetStr ?? '0', 10) || 0;

    const rows = await this.prisma.priceChange.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        listing: { select: { id: true, title: true, status: true, originalPriceHKD: true } },
      },
    });
    const total = await this.prisma.priceChange.count({ where });

    // Bulk-fetch sellers (denormalised sellerId on row)
    const sellerIds = Array.from(new Set(rows.map((r) => r.sellerId)));
    const sellers = sellerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const sellerById = new Map(sellers.map((s) => [s.id, s]));

    // Heuristic 1: drops-per-seller in past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dropCounts = await this.prisma.priceChange.groupBy({
      by: ['sellerId'],
      where: {
        sellerId: { in: sellerIds },
        status: { in: ['PENDING', 'APPLIED'] },
        requestedAt: { gte: sevenDaysAgo },
      },
      _count: true,
    });
    const recentDropCount = new Map(dropCounts.map((d) => [d.sellerId, d._count]));

    const annotated = rows.map((r) => {
      const seller = sellerById.get(r.sellerId);
      const reasons: string[] = [];
      // H1: high drop velocity
      if ((recentDropCount.get(r.sellerId) ?? 0) >= 3) reasons.push('7 日內 ≥3 次減價');
      // H2: direct edit raising price by > 50%
      if (r.status === 'DIRECT_EDIT' && r.newPriceHKD > r.oldPriceHKD * 1.5) {
        reasons.push(`即時加價 +${Math.round((r.newPriceHKD / r.oldPriceHKD - 1) * 100)}%`);
      }
      // H3: superseded within 24h
      if (r.status === 'CANCELLED' && r.cancelReason === 'SUPERSEDED' && r.cancelledAt
          && r.cancelledAt.getTime() - r.requestedAt.getTime() < 24 * 60 * 60 * 1000) {
        reasons.push('24 小時內被覆蓋');
      }
      return {
        id: r.id,
        listingId: r.listingId,
        listingTitle: r.listing?.title ?? '(已刪除)',
        listingStatus: r.listing?.status ?? null,
        sellerId: r.sellerId,
        sellerEmail: seller?.email ?? '(已刪除)',
        sellerDisplayName: seller?.displayName ?? null,
        oldPriceHKD: r.oldPriceHKD,
        newPriceHKD: r.newPriceHKD,
        deltaHKD: r.newPriceHKD - r.oldPriceHKD,
        deltaPct: Math.round(((r.newPriceHKD - r.oldPriceHKD) / r.oldPriceHKD) * 100),
        status: r.status,
        requestedAt: r.requestedAt,
        effectiveAt: r.effectiveAt,
        appliedAt: r.appliedAt,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        suspicious: reasons.length > 0,
        suspiciousReasons: reasons,
      };
    });

    const filtered = suspicious === '1' ? annotated.filter((r) => r.suspicious) : annotated;
    return {
      items: filtered,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  // ═══ P0 — Orders admin (search / detail / escrow overrides) ═══════════
  // Red lines (docs/proposals/admin-portal-gap-audit.md §C): money actions
  // are STATE TRANSITIONS computed from existing order data — never a
  // free-amount editor. Every override requires a reason → AdminAction.

  @Get('orders')
  async adminOrders(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    await this.requireAdmin(user.userId);
    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetStr ?? '0', 10) || 0;
    const where: any = {};
    if (status) where.status = status;
    if (q?.trim()) {
      const t = q.trim();
      where.OR = [
        { id: { contains: t } },
        { buyer: { is: { email: { contains: t, mode: 'insensitive' } } } },
        { seller: { is: { email: { contains: t, mode: 'insensitive' } } } },
        { listing: { is: { title: { contains: t, mode: 'insensitive' } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          listing: { select: { id: true, title: true } },
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          authenticator: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, hasMore: offset + items.length < total };
  }

  @Get('orders/:id')
  async adminOrderDetail(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.requireAdmin(user.userId);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        listing: { select: { id: true, title: true, status: true, images: true, category: true } },
        buyer: { select: { id: true, displayName: true, email: true } },
        seller: { select: { id: true, displayName: true, email: true } },
        authenticator: { select: { id: true, displayName: true, storeName: true } },
        payments: { orderBy: { createdAt: 'asc' } },
        evidenceFiles: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, kind: true, mimeType: true, mediaUrl: true, uploaderUserId: true, createdAt: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const actions = await this.prisma.adminAction.findMany({
      where: { targetOrderId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { ...order, adminActions: actions };
  }

  /**
   * Force-refund a stuck / disputed order — OPS_ADMIN+.
   * Order → REFUNDED, escrow released, listing back to ACTIVE.
   * Payment: AUTHORIZED hold → CANCELLED; CAPTURED → REFUNDED.
   */
  @Patch('orders/:id/force-refund')
  async forceRefund(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入原因');
    const order = await this.prisma.order.findUnique({ where: { id }, include: { payments: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (['COMPLETED', 'REFUNDED'].includes(order.status)) {
      throw new BadRequestException(`訂單已係終態 ${order.status}，唔可以 force-refund`);
    }
    const fromStatus = order.status;
    // Gateway FIRST, DB after — otherwise DB can claim REFUNDED while the
    // buyer never got money back. Mock mode tolerates gateway failure (its
    // in-memory store forgets intents on API restart).
    for (const p of order.payments) {
      if (!p.gatewayRef) continue;
      try {
        if (p.status === 'AUTHORIZED') await stripeAdapter.cancelIntent(p.gatewayRef);
        else if (p.status === 'CAPTURED') await stripeAdapter.refundIntent(p.gatewayRef);
      } catch (e: any) {
        if (stripeAdapter.mode !== 'mock') {
          throw new BadRequestException(`Gateway ${p.status === 'CAPTURED' ? 'refund' : 'cancel'} 失敗：${e?.message} — 未改訂單狀態，請重試`);
        }
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status: 'REFUNDED', escrowHeld: false },
      });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: 'ACTIVE' } });
      for (const p of order.payments) {
        if (p.status === 'AUTHORIZED') {
          await tx.payment.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        } else if (p.status === 'CAPTURED') {
          await tx.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
        }
      }
      await tx.adminAction.create({
        data: {
          actorId: user.userId,
          targetOrderId: id,
          targetUserId: order.buyerId,
          action: 'order.forceRefund',
          payload: { reason, fromStatus },
        },
      });
    });
    return { id, status: 'REFUNDED', fromStatus };
  }

  /**
   * Force-release escrow to seller — OPS_ADMIN+ (e.g. buyer unresponsive
   * past SLA after goods delivered). Order → COMPLETED, payment captured.
   */
  @Patch('orders/:id/release-escrow')
  async releaseEscrow(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入原因');
    const order = await this.prisma.order.findUnique({ where: { id }, include: { payments: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (['COMPLETED', 'REFUNDED'].includes(order.status)) {
      throw new BadRequestException(`訂單已係終態 ${order.status}，唔可以 release`);
    }
    const fromStatus = order.status;
    const now = new Date();
    // Capture the held funds at the gateway before recording CAPTURED.
    for (const p of order.payments) {
      if (p.status !== 'AUTHORIZED' || !p.gatewayRef) continue;
      try {
        await stripeAdapter.captureIntent(p.gatewayRef);
      } catch (e: any) {
        if (stripeAdapter.mode !== 'mock') {
          throw new BadRequestException(`Gateway capture 失敗：${e?.message} — 未改訂單狀態，請重試`);
        }
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: now, escrowHeld: false },
      });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: 'SOLD' } });
      for (const p of order.payments) {
        if (p.status === 'AUTHORIZED') {
          await tx.payment.update({ where: { id: p.id }, data: { status: 'CAPTURED', capturedAt: now } });
        }
      }
      await tx.adminAction.create({
        data: {
          actorId: user.userId,
          targetOrderId: id,
          targetUserId: order.sellerId,
          action: 'order.releaseEscrow',
          payload: { reason, fromStatus },
        },
      });
    });
    return { id, status: 'COMPLETED', fromStatus };
  }

  /**
   * Resolve a DISPUTED order — OPS_ADMIN+. resolution = REFUND_BUYER |
   * RELEASE_SELLER. Note is mandatory and must speak to the named
   * authenticator's verdict, never a platform authenticity judgement
   * (L'Oréal v eBay posture — enforced by copy in admin UI).
   */
  @Patch('disputes/:id/resolve')
  async resolveDispute(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { resolution: 'REFUND_BUYER' | 'RELEASE_SELLER'; note: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const note = (body?.note ?? '').trim();
    if (!note) throw new BadRequestException('請輸入處理備註');
    if (!['REFUND_BUYER', 'RELEASE_SELLER'].includes(body?.resolution)) {
      throw new BadRequestException('Invalid resolution');
    }
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DISPUTED') {
      throw new BadRequestException(`只可以處理 DISPUTED 訂單（而家係 ${order.status}）`);
    }
    const result = body.resolution === 'REFUND_BUYER'
      ? await this.forceRefund(user, id, { reason: `爭議裁決：${note}` })
      : await this.releaseEscrow(user, id, { reason: `爭議裁決：${note}` });
    await this.logAdminAction({
      actorId: user.userId,
      targetOrderId: id,
      action: 'dispute.resolve',
      payload: { resolution: body.resolution, note },
    });
    return result;
  }

  // ═══ P0 — Payout queue ═════════════════════════════════════════════════

  @Get('finance/payouts')
  async payoutQueue(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
  ) {
    await this.requireAdmin(user.userId);
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
  }

  /**
   * Advance a payout through its state machine — OPS_ADMIN+.
   * PENDING → PROCESSING | FAILED；PROCESSING → SUCCEEDED | FAILED | REVERSED.
   * The bank transfer itself happens outside the platform; this records it.
   */
  @Patch('finance/payouts/:id')
  async setPayoutStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { status: string; failureReason?: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const po = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Payout not found');
    const allowed: Record<string, string[]> = {
      PENDING: ['PROCESSING', 'FAILED'],
      PROCESSING: ['SUCCEEDED', 'FAILED', 'REVERSED'],
    };
    const next = body?.status;
    if (!allowed[po.status]?.includes(next)) {
      throw new BadRequestException(`唔可以由 ${po.status} 轉去 ${next}`);
    }
    const failureReason = (body?.failureReason ?? '').trim();
    if ((next === 'FAILED' || next === 'REVERSED') && !failureReason) {
      throw new BadRequestException('FAILED / REVERSED 需要原因');
    }
    const terminal = ['SUCCEEDED', 'FAILED', 'REVERSED'].includes(next);
    const [updated] = await this.prisma.$transaction([
      this.prisma.payoutRequest.update({
        where: { id },
        data: {
          status: next as any,
          failureReason: failureReason || null,
          ...(terminal ? { processedAt: new Date() } : {}),
        },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: po.userId,
          action: 'payout.statusChange',
          payload: { payoutId: id, reference: po.reference, from: po.status, to: next, failureReason: failureReason || null },
        },
      }),
    ]);
    return updated;
  }

  // ═══ P0 — Listing moderation ═══════════════════════════════════════════

  @Get('listings')
  async adminListings(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    await this.requireAdmin(user.userId);
    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetStr ?? '0', 10) || 0;
    const where: any = {};
    if (status) where.status = status;
    if (q?.trim()) {
      const t = q.trim();
      where.OR = [
        { id: { contains: t } },
        { title: { contains: t, mode: 'insensitive' } },
        { brand: { contains: t, mode: 'insensitive' } },
        { seller: { is: { email: { contains: t, mode: 'insensitive' } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true, title: true, priceHKD: true, category: true, brand: true,
          status: true, createdAt: true, images: true,
          removedAt: true, removedByRole: true, removedReason: true,
          seller: { select: { id: true, displayName: true, email: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items, total, hasMore: offset + items.length < total };
  }

  /** Take down a listing (counterfeit report / legal takedown) — OPS_ADMIN+. */
  @Patch('listings/:id/remove')
  async removeListing(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入下架原因');
    const listing = await this.prisma.listing.findUnique({ where: { id }, select: { status: true, sellerId: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status === 'REMOVED') throw new BadRequestException('已經係 REMOVED');
    const [updated] = await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id },
        data: { status: 'REMOVED', removedAt: new Date(), removedByRole: 'ADMIN', removedReason: reason },
        select: { id: true, status: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: listing.sellerId,
          action: 'listing.remove',
          payload: { listingId: id, reason, fromStatus: listing.status },
        },
      }),
    ]);
    return updated;
  }

  /** Restore an admin-removed listing back to ACTIVE — OPS_ADMIN+. */
  @Patch('listings/:id/restore')
  async restoreListing(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入原因');
    const listing = await this.prisma.listing.findUnique({ where: { id }, select: { status: true, sellerId: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'REMOVED') throw new BadRequestException(`只可以還原 REMOVED（而家係 ${listing.status}）`);
    const [updated] = await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id },
        data: { status: 'ACTIVE', removedAt: null, removedByRole: null, removedReason: null },
        select: { id: true, status: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: listing.sellerId,
          action: 'listing.restore',
          payload: { listingId: id, reason },
        },
      }),
    ]);
    return updated;
  }

  // ═══ Authenticator lifecycle（founder 2026-07-13 MVP）══════════════════
  // 申請審批 queue + 鑑定師名單 suspend/remove。審批 = 准入 marketplace，
  // 唔代表平台為鑑定結果背書（L'Oréal v eBay — copy 由 admin UI enforce）。
  // 星級 / completedCount / disputeRate 演算法派生，永不喺呢度手改。

  /** 申請 queue（default 只列 in-flight）。 */
  @Get('authenticator-applications')
  async authenticatorApplications(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
  ) {
    await this.requireAdmin(user.userId);
    const where: any = status
      ? { status }
      : { status: { in: ['SUBMITTED', 'NEEDS_MORE_INFO'] } };
    const apps = await this.prisma.authenticatorApplication.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return apps;
  }

  /** 批核 → 建立 Authenticator（ACTIVE）+ 加 AUTHENTICATOR role。OPS_ADMIN+。 */
  @Patch('authenticator-applications/:id/approve')
  async approveAuthenticator(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    await this.requireOpsAdmin(user.userId);
    const app = await this.prisma.authenticatorApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === 'APPROVED') throw new BadRequestException('已經批核咗');
    const existing = await this.prisma.authenticator.findUnique({ where: { userId: app.userId } });
    if (existing) throw new BadRequestException('此用戶已經係鑑定師');
    const target = await this.prisma.user.findUnique({ where: { id: app.userId }, select: { roles: true } });
    if (!target) throw new NotFoundException('申請人帳戶不存在');

    const [authRow] = await this.prisma.$transaction([
      this.prisma.authenticator.create({
        data: {
          userId: app.userId,
          displayName: app.displayName,
          storeName: app.storeName,
          categories: app.categories,
          feeRatePct: app.feeRatePct,
          feeMinHKD: app.feeMinHKD,
          bio: app.bio,
          yearsExperience: app.yearsExperience,
          locationAddress: app.locationAddress,
          district: app.district,
          eAndOInsuranceExpiresAt: app.eAndOExpiresAt,
          status: 'ACTIVE',
        },
        select: { id: true, displayName: true, status: true },
      }),
      this.prisma.authenticatorApplication.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: user.userId, reviewedAt: new Date(), reviewNote: null },
      }),
      this.prisma.user.update({
        where: { id: app.userId },
        data: { roles: Array.from(new Set([...target.roles, 'AUTHENTICATOR'])) as any },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: app.userId,
          action: 'authenticator.approve',
          payload: { applicationId: id, displayName: app.displayName },
        },
      }),
    ]);
    return authRow;
  }

  /** 拒絕（終態）/ 要求補交（可再交）。OPS_ADMIN+，兩者都要 reason。 */
  @Patch('authenticator-applications/:id/reject')
  async rejectAuthenticator(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { reason: string; needsMoreInfo?: boolean },
  ) {
    await this.requireOpsAdmin(user.userId);
    const reason = (body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('請輸入原因');
    const app = await this.prisma.authenticatorApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');
    if (['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(app.status)) {
      throw new BadRequestException(`申請已係終態 ${app.status}`);
    }
    const newStatus = body?.needsMoreInfo ? 'NEEDS_MORE_INFO' : 'REJECTED';
    const [updated] = await this.prisma.$transaction([
      this.prisma.authenticatorApplication.update({
        where: { id },
        data: { status: newStatus, reviewNote: reason, reviewedById: user.userId, reviewedAt: new Date() },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: app.userId,
          action: newStatus === 'NEEDS_MORE_INFO' ? 'authenticator.needsMoreInfo' : 'authenticator.reject',
          payload: { applicationId: id, reason },
        },
      }),
    ]);
    return updated;
  }

  /** 鑑定師名單（可 filter status / 搜尋）。 */
  @Get('authenticators')
  async adminAuthenticators(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    await this.requireAdmin(user.userId);
    const where: any = {};
    if (status) where.status = status;
    if (q?.trim()) {
      const t = q.trim();
      where.OR = [
        { displayName: { contains: t, mode: 'insensitive' } },
        { storeName: { contains: t, mode: 'insensitive' } },
        { user: { is: { email: { contains: t, mode: 'insensitive' } } } },
      ];
    }
    return this.prisma.authenticator.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, displayName: true, storeName: true, status: true, categories: true,
        starRating: true, completedCount: true, disputeRate: true,
        eAndOInsuranceExpiresAt: true, createdAt: true,
        user: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Suspend / Unsuspend / Remove 鑑定師 — OPS_ADMIN+。
   * In-flight 訂單保護：suspend/remove 唔會自動影響已 IN_PROGRESS 嘅單
   * （escrow 已 hold）；新單 server 只揀 ACTIVE。有進行中單時 remove 要
   * admin 先手動 reassign / force-refund（呢度只擋 remove）。
   */
  @Patch('authenticators/:id/status')
  async setAuthenticatorStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'; reason?: string },
  ) {
    await this.requireOpsAdmin(user.userId);
    const next = body?.status;
    if (!['ACTIVE', 'SUSPENDED', 'REMOVED'].includes(next)) {
      throw new BadRequestException('Invalid status');
    }
    const reason = (body?.reason ?? '').trim();
    if (next !== 'ACTIVE' && !reason) throw new BadRequestException('SUSPEND / REMOVE 需要原因');
    const auth = await this.prisma.authenticator.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!auth) throw new NotFoundException('Authenticator not found');
    if (auth.status === next) throw new BadRequestException(`狀態已經係 ${next}`);

    // Remove 前擋 in-flight 單（有單就要 admin 先處理）
    if (next === 'REMOVED') {
      const TERMINAL = ['COMPLETED', 'REFUNDED', 'DISPUTED', 'AUTH_FAILED'];
      const inflight = await this.prisma.order.count({
        where: { authenticatorId: id, status: { notIn: TERMINAL as any } },
      });
      if (inflight > 0) {
        throw new BadRequestException(`有 ${inflight} 張進行中訂單，請先 reassign 或退款再移除`);
      }
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.authenticator.update({
        where: { id }, data: { status: next as any }, select: { id: true, status: true },
      }),
      this.prisma.adminAction.create({
        data: {
          actorId: user.userId,
          targetUserId: auth.userId,
          action: `authenticator.${next.toLowerCase()}`,
          payload: { authenticatorId: id, from: auth.status, to: next, reason: reason || null },
        },
      }),
    ]);
    return updated;
  }
}

function generateTempPassword(len: number): string {
  // Easy-to-communicate alphabet: no 0/O/l/1/I to avoid confusion when ops
  // dictates the password to user via WhatsApp.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
