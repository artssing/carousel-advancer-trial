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
}

function generateTempPassword(len: number): string {
  // Easy-to-communicate alphabet: no 0/O/l/1/I to avoid confusion when ops
  // dictates the password to user via WhatsApp.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
