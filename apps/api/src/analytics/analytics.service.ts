import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isAnalyticsEventName, type AnalyticsEventEnvelope } from '@authentik/utils';

/**
 * Analytics MVP（docs/proposals/analytics-tagging-spec.md，founder 2026-07-14 拍板）。
 *
 * 原則（spec §0）：
 *  • Fire-and-forget — ingest 失敗只 log，永不影響主 flow。
 *  • Event name 白名單 validate 靠 packages/utils SSOT，唔認識嘅 event 直接 drop。
 *  • session_heartbeat 唔落 DB（高 volume）— 只更新 in-memory presence。
 *  • env 隔離：由 DATABASE_URL 推斷 UAT/PROD，admin query 只睇本環境。
 */

type PresenceEntry = {
  lastActiveAt: number;
  userId: string | null;
  role: string;
  portal: string;
};

/** spec §4：last_active_at 2 分鐘內 = online（heartbeat 60s + 一次 miss buffer） */
const ONLINE_WINDOW_MS = 2 * 60_000;

@Injectable()
export class AnalyticsService {
  private readonly log = new Logger(AnalyticsService.name);

  /** key = anonymousId（guest）或 userId（member）。In-memory：restart 後 2 分鐘內自然重建。 */
  private presence = new Map<string, PresenceEntry>();

  /** UAT/PROD 由 db name 推斷（跟 start.sh 環境 split，冇獨立 env var） */
  readonly envName: 'PROD' | 'UAT' =
    (process.env.DATABASE_URL ?? '').includes('authentik_uat') ? 'UAT' : 'PROD';

  constructor(private readonly prisma: PrismaService) {}

  // ── Ingestion ────────────────────────────────────────────────────────────
  async ingest(events: AnalyticsEventEnvelope[], authedUserId: string | null) {
    let accepted = 0;
    const rows: Array<Record<string, unknown>> = [];

    for (const e of events ?? []) {
      if (!e || typeof e !== 'object') continue;
      if (!isAnalyticsEventName(e.event_name)) continue; // SSOT 白名單外 = drop
      if (!e.anonymous_id || !e.session_id || !e.event_id) continue;

      // 防 spoof：user_id 以 JWT 為準 — client 聲稱嘅 user_id 唔可信。
      const userId = authedUserId ?? null;

      // Presence：任何 event 都更新 last active（heartbeat 係主要來源）
      this.touchPresence(e, userId);

      // identity merge（spec §3）：user_login 寫 mapping（唔改寫舊 event）
      if (e.event_name === 'user_login' && userId) {
        const prev = (e.properties as any)?.previous_anonymous_id ?? e.anonymous_id;
        this.linkIdentity(String(prev), userId);
      }

      // 高 volume：heartbeat 唔落 DB
      if (e.event_name === 'session_heartbeat') { accepted += 1; continue; }

      rows.push({
        eventName: e.event_name,
        eventId: e.event_id,
        occurredAt: new Date(e.occurred_at),
        env: this.envName,
        portal: e.portal,
        anonymousId: e.anonymous_id,
        userId,
        role: e.role,
        sessionId: e.session_id,
        pagePath: e.page_path ?? '',
        referrer: e.referrer ?? null,
        device: e.device ?? 'DESKTOP',
        properties: (e.properties ?? {}) as any,
      });
      accepted += 1;
    }

    if (rows.length) {
      // skipDuplicates：eventId unique = client retry 去重
      await this.prisma.analyticsEvent
        .createMany({ data: rows as any, skipDuplicates: true })
        .catch((err) => this.log.warn(`analytics ingest drop ${rows.length} rows: ${err.message}`));
    }
    return { accepted };
  }

  private touchPresence(e: AnalyticsEventEnvelope, userId: string | null) {
    const key = userId ?? `anon:${e.anonymous_id}`;
    this.presence.set(key, {
      lastActiveAt: Date.now(),
      userId,
      role: e.role,
      portal: e.portal,
    });
    // 輕量 GC：map 大過 5000 就掃一次過期
    if (this.presence.size > 5000) {
      const cutoff = Date.now() - ONLINE_WINDOW_MS;
      for (const [k, v] of this.presence) if (v.lastActiveAt < cutoff) this.presence.delete(k);
    }
  }

  private linkIdentity(anonymousId: string, userId: string) {
    this.prisma.analyticsIdentityLink
      .upsert({
        where: { anonymousId_userId: { anonymousId, userId } },
        create: { anonymousId, userId },
        update: {},
      })
      .catch(() => {}); // fire-and-forget
  }

  // ── Admin queries ────────────────────────────────────────────────────────

  /** spec §4.2：3 counter + guest/member split */
  overview() {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    let membersOnline = 0;
    let guestsOnline = 0;
    let authenticatorsOnline = 0;
    for (const v of this.presence.values()) {
      if (v.lastActiveAt < cutoff) continue;
      if (v.portal === 'AUTHENTICATOR' && v.userId) { authenticatorsOnline += 1; continue; }
      if (v.userId) membersOnline += 1;
      else guestsOnline += 1;
    }
    return { membersOnline, guestsOnline, authenticatorsOnline, asOf: new Date().toISOString() };
  }

  /** 過去 N 日 guest vs member session 數（用 session_started event） */
  async guestMemberSplit(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await this.prisma.analyticsEvent.groupBy({
      by: ['role'],
      where: { env: this.envName, eventName: 'session_started', occurredAt: { gte: since } },
      _count: { _all: true },
    });
    const guest = rows.filter((r) => r.role === 'GUEST').reduce((s, r) => s + r._count._all, 0);
    const member = rows.filter((r) => r.role !== 'GUEST').reduce((s, r) => s + r._count._all, 0);
    return { days, guest, member };
  }

  /** spec §6：top searches + zero-result 排行 */
  async topSearches(days: number, zeroOnly: boolean, limit = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        env: this.envName,
        eventName: zeroOnly ? 'search_zero_result' : 'search_performed',
        occurredAt: { gte: since },
      },
      select: { properties: true },
      orderBy: { occurredAt: 'desc' },
      take: 5000, // catalog 規模細，in-memory 聚合夠用（同 browse relevance ranking 同一判斷）
    });
    const agg = new Map<string, { count: number; totalResults: number; zero: number }>();
    for (const ev of events) {
      const p = ev.properties as any;
      const q = String(p?.query_raw ?? '').trim().toLowerCase();
      if (!q) continue;
      const cur = agg.get(q) ?? { count: 0, totalResults: 0, zero: 0 };
      cur.count += 1;
      cur.totalResults += Number(p?.result_count ?? 0);
      if (Number(p?.result_count ?? 0) === 0) cur.zero += 1;
      agg.set(q, cur);
    }
    return [...agg.entries()]
      .map(([query, v]) => ({
        query,
        count: v.count,
        avgResults: v.count ? Math.round(v.totalResults / v.count) : 0,
        zeroCount: v.zero,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * spec §5.1 購買 funnel（MVP：即時 count query；materialized snapshot = Phase 2）。
   * 最後一步「訂單完成」直接查 Order table（order_status_changed server-side
   * instrumentation 要 orders.service central transition helper 重構 — Phase 2）。
   */
  async purchaseFunnel(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const count = (eventName: string) =>
      this.prisma.analyticsEvent.count({
        where: { env: this.envName, eventName, occurredAt: { gte: since } },
      });
    const [viewed, started, completed, ordersCompleted] = await Promise.all([
      count('listing_viewed'),
      count('checkout_started'),
      count('checkout_completed'),
      this.prisma.order.count({ where: { status: 'COMPLETED', completedAt: { gte: since } } }),
    ]);
    return {
      days,
      steps: [
        { name: 'listing_viewed', label: '睇過商品', count: viewed },
        { name: 'checkout_started', label: '進入結帳', count: started },
        { name: 'checkout_completed', label: '完成付款', count: completed },
        { name: 'order_completed', label: '訂單完成', count: ordersCompleted },
      ],
    };
  }

  /**
   * 時間粒度 activity（founder 2026-07-14 enhancement）：每小時/每分鐘 event 數。
   * minute = 近距離即時觀察（上限 3 小時）；hour = 日常趨勢（上限 7 日）。
   */
  async timeseries(interval: 'hour' | 'minute', spanMinutes: number, eventName: string) {
    const since = new Date(Date.now() - spanMinutes * 60_000);
    // interval 唔可以 parameterize 入 date_trunc — 白名單後直接內插字面值
    const trunc = interval === 'minute' ? 'minute' : 'hour';
    const rows = await this.prisma.$queryRawUnsafe<Array<{ bucket: Date; count: bigint }>>(
      `SELECT date_trunc('${trunc}', "occurredAt") AS bucket, COUNT(*)::bigint AS count
       FROM "AnalyticsEvent"
       WHERE env = $1 AND "eventName" = $2 AND "occurredAt" >= $3
       GROUP BY 1 ORDER BY 1`,
      this.envName, eventName, since,
    );
    // 補零 bucket — chart 唔好跳格
    const stepMs = interval === 'minute' ? 60_000 : 3_600_000;
    const byTime = new Map(rows.map((r) => [new Date(r.bucket).getTime(), Number(r.count)]));
    const buckets: Array<{ t: string; count: number }> = [];
    const start = Math.floor(since.getTime() / stepMs) * stepMs;
    for (let t = start; t <= Date.now(); t += stepMs) {
      buckets.push({ t: new Date(t).toISOString(), count: byTime.get(t) ?? 0 });
    }
    return { interval, eventName, buckets };
  }

  /**
   * 每個 listing 嘅 view 數 + 停留時間（founder 2026-07-14 enhancement）。
   * views/unique 由 listing_viewed；avg dwell 由 listing_view_ended（client
   * clamp 30 分鐘）。Title join 返 Listing table 畀 admin 認得出邊件貨。
   */
  async listingStats(days: number, limit = 50) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      listing_id: string; views: bigint; unique_viewers: bigint; avg_dwell: number | null;
    }>>(
      `SELECT properties->>'listing_id' AS listing_id,
              COUNT(*) FILTER (WHERE "eventName" = 'listing_viewed')::bigint AS views,
              COUNT(DISTINCT "anonymousId") FILTER (WHERE "eventName" = 'listing_viewed')::bigint AS unique_viewers,
              AVG((properties->>'dwell_seconds')::numeric) FILTER (WHERE "eventName" = 'listing_view_ended')::float AS avg_dwell
       FROM "AnalyticsEvent"
       WHERE env = $1 AND "eventName" IN ('listing_viewed', 'listing_view_ended')
         AND "occurredAt" >= $2 AND properties->>'listing_id' IS NOT NULL
       GROUP BY 1 ORDER BY views DESC LIMIT $3`,
      this.envName, since, limit,
    );
    const ids = rows.map((r) => r.listing_id);
    const [listings, orderCounts] = ids.length
      ? await Promise.all([
          this.prisma.listing.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true, priceHKD: true, status: true },
          }),
          // A1-2：view-to-order conversion — 訂單數直查 Order table
          this.prisma.order.groupBy({
            by: ['listingId'],
            where: { listingId: { in: ids }, createdAt: { gte: since }, status: { not: 'AWAITING_PAYMENT' } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const byId = new Map(listings.map((l) => [l.id, l]));
    const ordersByListing = new Map(orderCounts.map((o) => [o.listingId, o._count._all]));
    return rows.map((r) => {
      const views = Number(r.views);
      const orders = ordersByListing.get(r.listing_id) ?? 0;
      return {
        listingId: r.listing_id,
        title: byId.get(r.listing_id)?.title ?? '（已刪除／搵唔到）',
        priceHKD: byId.get(r.listing_id)?.priceHKD ?? null,
        status: byId.get(r.listing_id)?.status ?? null,
        views,
        uniqueViewers: Number(r.unique_viewers),
        avgDwellSeconds: r.avg_dwell != null ? Math.round(r.avg_dwell) : null,
        orders,
        conversionRate: views > 0 ? orders / views : null,
      };
    });
  }

  // ── A1 charts（founder 2026-07-14 批 — analytics-charts-ia-proposal.md）──

  /** A1-4：付款後啲單最終去咗邊（直查 Order table）。 */
  async orderOutcomes(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since }, status: { not: 'AWAITING_PAYMENT' } },
      _count: { _all: true },
    });
    const bucket = (statuses: string[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
    const terminal = ['COMPLETED', 'AUTH_FAILED', 'DISPUTED', 'REFUNDED'];
    return {
      days,
      buckets: [
        { name: 'COMPLETED', label: '完成', count: bucket(['COMPLETED']) },
        { name: 'AUTH_FAILED', label: '鑑定不通過', count: bucket(['AUTH_FAILED']) },
        { name: 'DISPUTED', label: '爭議中', count: bucket(['DISPUTED']) },
        { name: 'REFUNDED', label: '已退款', count: bucket(['REFUNDED']) },
        {
          name: 'IN_FLIGHT',
          label: '進行中',
          count: rows.filter((r) => !terminal.includes(r.status)).reduce((s, r) => s + r._count._all, 0),
        },
      ],
    };
  }

  /** A1-1：購買 funnel 按 tier 拆（event properties.tier；訂單完成步用 salePriceHKD 推 tier）。 */
  async purchaseFunnelByTier(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const eventRows = await this.prisma.$queryRawUnsafe<Array<{ event_name: string; tier: string | null; count: bigint }>>(
      `SELECT "eventName" AS event_name, properties->>'tier' AS tier, COUNT(*)::bigint AS count
       FROM "AnalyticsEvent"
       WHERE env = $1 AND "eventName" IN ('listing_viewed','checkout_started','checkout_completed')
         AND "occurredAt" >= $2
       GROUP BY 1, 2`,
      this.envName, since,
    );
    const orderRows = await this.prisma.$queryRawUnsafe<Array<{ tier: number; count: bigint }>>(
      `SELECT CASE WHEN "salePriceHKD" >= 10000 THEN 3 WHEN "salePriceHKD" >= 1000 THEN 2 ELSE 1 END AS tier,
              COUNT(*)::bigint AS count
       FROM "Order" WHERE status = 'COMPLETED' AND "completedAt" >= $1
       GROUP BY 1`,
      since,
    );
    const steps = ['listing_viewed', 'checkout_started', 'checkout_completed'] as const;
    const tiers = [1, 2, 3].map((tier) => ({
      tier,
      steps: [
        ...steps.map((s) => ({
          name: s,
          count: eventRows
            .filter((r) => r.event_name === s && Number(r.tier) === tier)
            .reduce((sum, r) => sum + Number(r.count), 0),
        })),
        {
          name: 'order_completed',
          count: orderRows.filter((r) => Number(r.tier) === tier).reduce((s, r) => s + Number(r.count), 0),
        },
      ],
    }));
    return { days, tiers };
  }

  /** North-star KPI（spec §8 承諾；A1 批准落地）。 */
  async northStar() {
    const d30 = new Date(Date.now() - 30 * 86400_000);
    const [mauRows, gmv, verdicts, slaOrders, paidCount, disputedCount] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where: { env: this.envName, occurredAt: { gte: d30 }, userId: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.order.aggregate({
        where: { status: 'COMPLETED', completedAt: { gte: d30 } },
        _sum: { salePriceHKD: true, platformFeeHKD: true },
      }),
      this.prisma.order.groupBy({
        by: ['authVerdict'],
        where: { authCompletedAt: { gte: d30 }, authVerdict: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { authCompletedAt: { gte: d30 }, receivedByAuthAt: { not: null } },
        select: { receivedByAuthAt: true, authCompletedAt: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: d30 }, status: { not: 'AWAITING_PAYMENT' } } }),
      this.prisma.order.count({ where: { createdAt: { gte: d30 }, status: { in: ['DISPUTED', 'REFUNDED'] } } }),
    ]);
    const verdictTotal = verdicts.reduce((s, v) => s + v._count._all, 0);
    const passed = verdicts.find((v) => v.authVerdict === 'PASSED')?._count._all ?? 0;
    const slaMet = slaOrders.filter(
      (o) => o.authCompletedAt!.getTime() - o.receivedByAuthAt!.getTime() <= 48 * 3600_000,
    ).length;
    const gmvHKD = gmv._sum.salePriceHKD ?? 0;
    return {
      mau: mauRows.length,
      gmvHKD,
      authPassRate: verdictTotal ? passed / verdictTotal : null,
      slaMetRate: slaOrders.length ? slaMet / slaOrders.length : null,
      disputeRate: paidCount ? disputedCount / paidCount : null,
      takeRate: gmvHKD ? (gmv._sum.platformFeeHKD ?? 0) / gmvHKD : null,
    };
  }

  /** A1-5：鑑定師 SLA 健康度（authCompletedAt - receivedByAuthAt，紅線 48h）。 */
  async slaHealth(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const orders = await this.prisma.order.findMany({
      where: {
        authCompletedAt: { gte: since },
        receivedByAuthAt: { not: null },
        authenticatorId: { not: null },
      },
      select: {
        authenticatorId: true,
        receivedByAuthAt: true,
        authCompletedAt: true,
        authenticator: { select: { displayName: true } },
      },
    });
    const agg = new Map<string, { name: string; totalHours: number; count: number; breaches: number }>();
    for (const o of orders) {
      const hours = (o.authCompletedAt!.getTime() - o.receivedByAuthAt!.getTime()) / 3600_000;
      const cur = agg.get(o.authenticatorId!) ?? {
        name: o.authenticator?.displayName ?? o.authenticatorId!,
        totalHours: 0, count: 0, breaches: 0,
      };
      cur.totalHours += hours;
      cur.count += 1;
      if (hours > 48) cur.breaches += 1;
      agg.set(o.authenticatorId!, cur);
    }
    return [...agg.values()]
      .map((a) => ({
        name: a.name,
        jobs: a.count,
        avgHours: Math.round((a.totalHours / a.count) * 10) / 10,
        breaches: a.breaches,
      }))
      .sort((a, b) => b.avgHours - a.avgHours);
  }

  /** A1-3：zero-result trend — top 5 query 每日次數（supply gap 惡化/好轉）。 */
  async zeroResultTrend(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const events = await this.prisma.analyticsEvent.findMany({
      where: { env: this.envName, eventName: 'search_zero_result', occurredAt: { gte: since } },
      select: { occurredAt: true, properties: true },
      take: 5000,
    });
    const totals = new Map<string, number>();
    const daily = new Map<string, Map<string, number>>(); // query → day → count
    for (const ev of events) {
      const q = String((ev.properties as any)?.query_raw ?? '').trim().toLowerCase();
      if (!q) continue;
      totals.set(q, (totals.get(q) ?? 0) + 1);
      const day = ev.occurredAt.toISOString().slice(0, 10);
      const m = daily.get(q) ?? new Map();
      m.set(day, (m.get(day) ?? 0) + 1);
      daily.set(q, m);
    }
    const top5 = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q]) => q);
    const allDays: string[] = [];
    for (let t = since.getTime(); t <= Date.now(); t += 86400_000) {
      allDays.push(new Date(t).toISOString().slice(0, 10));
    }
    return {
      days: allDays,
      series: top5.map((q) => ({
        query: q,
        counts: allDays.map((d) => daily.get(q)?.get(d) ?? 0),
      })),
    };
  }

  /** spec §5.1 raw event explorer：搜 user / anonymous / session / order id */
  async explore(q: string, limit = 200) {
    const query = q.trim();
    if (!query) return [];
    // user id 先經 identity link 拉埋所有 anonymousId（spec §3 merge 查詢）
    const links = await this.prisma.analyticsIdentityLink.findMany({
      where: { userId: query },
      select: { anonymousId: true },
    });
    const anonIds = links.map((l) => l.anonymousId);
    return this.prisma.analyticsEvent.findMany({
      where: {
        env: this.envName,
        OR: [
          { userId: query },
          { anonymousId: query },
          { sessionId: query },
          ...(anonIds.length ? [{ anonymousId: { in: anonIds } }] : []),
          // order_id 收埋喺 properties（checkout_completed 等）
          { properties: { path: ['order_id'], equals: query } },
          { properties: { path: ['listing_id'], equals: query } },
        ],
      },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
  }
}
