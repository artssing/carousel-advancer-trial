import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsEventEnvelope } from '@authentik/utils';

const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];

/**
 * Analytics MVP（docs/proposals/analytics-tagging-spec.md）。
 * Ingestion 開放畀 guest（OptionalJwt — anonymous_id 就夠）；
 * query endpoints admin-only（analytics 只喺 admin console 呈現 — 平台中立紅線）。
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  private async requireAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!u || !u.roles.some((r) => ADMIN_ROLES.includes(r))) {
      throw new ForbiddenException('需要 admin 權限');
    }
  }

  /** Batch ingest — fire-and-forget semantics：永遠 200，internally best-effort。 */
  @Post('events')
  @UseGuards(OptionalJwtAuthGuard)
  async ingest(
    @CurrentUser() user: CurrentUserData | undefined,
    @Body() body: { events: AnalyticsEventEnvelope[] },
  ) {
    try {
      return await this.analytics.ingest(body?.events ?? [], user?.userId ?? null);
    } catch {
      return { accepted: 0 }; // 唔好令 client 主 flow 見到 error
    }
  }

  // ── Admin-only queries ──────────────────────────────────────────────────

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard)
  async overview(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    return this.analytics.overview();
  }

  @Get('admin/guest-member-split')
  @UseGuards(JwtAuthGuard)
  async split(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.guestMemberSplit(Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90));
  }

  @Get('admin/top-searches')
  @UseGuards(JwtAuthGuard)
  async topSearches(
    @CurrentUser() user: CurrentUserData,
    @Query('days') days?: string,
    @Query('zeroOnly') zeroOnly?: string,
  ) {
    await this.requireAdmin(user.userId);
    return this.analytics.topSearches(
      Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90),
      zeroOnly === '1' || zeroOnly === 'true',
    );
  }

  @Get('admin/funnel/purchase')
  @UseGuards(JwtAuthGuard)
  async purchaseFunnel(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.purchaseFunnel(Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90));
  }

  @Get('admin/events')
  @UseGuards(JwtAuthGuard)
  async explore(@CurrentUser() user: CurrentUserData, @Query('q') q?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.explore(q ?? '');
  }

  /** 每小時/每分鐘 activity（founder 2026-07-14 enhancement） */
  @Get('admin/timeseries')
  @UseGuards(JwtAuthGuard)
  async timeseries(
    @CurrentUser() user: CurrentUserData,
    @Query('interval') interval?: string,
    @Query('minutes') minutes?: string,
    @Query('event') event?: string,
  ) {
    await this.requireAdmin(user.userId);
    const iv: 'hour' | 'minute' = interval === 'minute' ? 'minute' : 'hour';
    // minute 上限 3 小時、hour 上限 7 日 — 防 admin 一 query 拉爆
    const maxSpan = iv === 'minute' ? 180 : 7 * 24 * 60;
    const span = Math.min(Math.max(parseInt(minutes ?? '', 10) || (iv === 'minute' ? 60 : 24 * 60), 10), maxSpan);
    // event 名經 SSOT 白名單 — 唔准 free-text 入 SQL path
    const ev = event && ['page_view', 'session_started', 'search_performed', 'listing_viewed', 'checkout_completed'].includes(event)
      ? event : 'page_view';
    return this.analytics.timeseries(iv, span, ev);
  }

  /** 每個 listing 嘅 views + 停留時間（founder 2026-07-14 enhancement） */
  @Get('admin/listings')
  @UseGuards(JwtAuthGuard)
  async listingStats(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.listingStats(Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90));
  }

  // ── A1 charts（analytics-charts-ia-proposal.md，founder 2026-07-14 批）──

  @Get('admin/order-outcomes')
  @UseGuards(JwtAuthGuard)
  async orderOutcomes(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.orderOutcomes(Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90));
  }

  @Get('admin/funnel/purchase-by-tier')
  @UseGuards(JwtAuthGuard)
  async purchaseFunnelByTier(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.purchaseFunnelByTier(Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90));
  }

  @Get('admin/north-star')
  @UseGuards(JwtAuthGuard)
  async northStar(@CurrentUser() user: CurrentUserData) {
    await this.requireAdmin(user.userId);
    return this.analytics.northStar();
  }

  @Get('admin/sla-health')
  @UseGuards(JwtAuthGuard)
  async slaHealth(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.slaHealth(Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 90));
  }

  @Get('admin/zero-result-trend')
  @UseGuards(JwtAuthGuard)
  async zeroResultTrend(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    await this.requireAdmin(user.userId);
    return this.analytics.zeroResultTrend(Math.min(Math.max(parseInt(days ?? '14', 10) || 14, 1), 30));
  }
}
