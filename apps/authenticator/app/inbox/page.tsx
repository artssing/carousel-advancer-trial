'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatHKD } from '@authentik/utils';
import { Package, Handshake, MapPin, MessageCircle, Search, X } from 'lucide-react';
import { api, type InboxOrder } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { XLink } from '@/components/x-link';
import { AuthTopline, AuthContent } from '@/components/auth-topline';

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: '等買家付款',
  PAID: '等待收件',
  SHIPPED_TO_AUTHENTICATOR: '待簽收',
  AUTH_RECEIVED_PENDING_SELLER_ACK: '等賣家 ack 收件',
  HANDOVER_TO_AUTH: '面交待影相',
  SELLER_ACK_PENDING: '等賣家 ack 交付',
  CUSTODY: '保管中（待鑑定）',
  AUTHENTICATING: '鑑定中',
  AUTH_PASSED: '通過',
  AUTH_FAILED: '不通過',
  AWAITING_BUYER_PICKUP: '等買家取貨',
  SHIPPED_TO_BUYER: '已寄買家',
  DELIVERED: '已送達',
  DELIVERED_PENDING_AUTH_ACK: '等我 ack 買家收件',
  COMPLETED: '已完成',
  REFUNDED: '已退款',
  DISPUTED: '爭議中',
};

const AUTH_ACTION_STATUSES = new Set([
  'SHIPPED_TO_AUTHENTICATOR',
  'AUTHENTICATING',
  'HANDOVER_TO_AUTH',
  'CUSTODY',
  'DELIVERED_PENDING_AUTH_ACK',
]);
const TERMINAL_STATUSES = new Set([
  'AUTH_PASSED', 'AUTH_FAILED', 'COMPLETED', 'REFUNDED', 'DISPUTED',
]);

const CATEGORY_LABEL: Record<string, string> = {
  HANDBAG: '手袋', IPHONE: 'iPhone', POKEMON_CARD: '寶可夢卡',
  WATCH: '手錶', SNEAKER: '波鞋', DESIGNER_TOY: '潮玩', OTHER: '其他',
};

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '寄送', MEETUP_AUTH: '鑑定師面交', MEETUP_3WAY: '三方面交', MEETUP_DIRECT: '雙方面交',
};

const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];
function isMeetup(o: InboxOrder) { return MEETUP_METHODS.includes(o.deliveryMethod ?? ''); }

function matchesQuery(o: InboxOrder, qLower: string): boolean {
  if (!qLower) return true;
  if (o.id.toLowerCase().startsWith(qLower)) return true;
  const title = (o.listing?.title ?? '').toLowerCase();
  if (title.includes(qLower)) return true;
  const brand = ((o.listing as any)?.brand ?? '').toLowerCase();
  if (brand && brand.includes(qLower)) return true;
  const buyer = (o.buyer?.displayName ?? '').toLowerCase();
  if (buyer.includes(qLower)) return true;
  const seller = (o.seller?.displayName ?? '').toLowerCase();
  if (seller.includes(qLower)) return true;
  return false;
}

function slaLabel(order: InboxOrder): { text: string; cls: string } | null {
  if (order.status === 'AUTHENTICATING' && order.receivedByAuthAt) {
    const received = new Date(order.receivedByAuthAt).getTime();
    const deadline = received + 48 * 60 * 60 * 1000;
    const msLeft = deadline - Date.now();
    if (msLeft <= 0) return { text: '⚠ 已逾期', cls: 'bg-verdict-fail-soft text-verdict-fail' };
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    const text = `⏱ 剩 ${h}小時 ${m}分`;
    if (h >= 24) return { text, cls: 'bg-verdict-pass-soft text-verdict-pass' };
    if (h >= 12) return { text, cls: 'bg-verdict-incon-soft text-verdict-incon' };
    return { text, cls: 'bg-verdict-fail-soft text-verdict-fail' };
  }
  if (order.status === 'SHIPPED_TO_AUTHENTICATOR') {
    return { text: '⏱ 收件後計時 48h', cls: 'bg-surface-2 text-neutral-text-muted' };
  }
  if (order.status === 'PAID') {
    return { text: '⏱ 寄到 / 面交後計時', cls: 'bg-surface-2 text-neutral-text-muted' };
  }
  return null;
}

function DeliveryIcon({ method }: { method: string | null }) {
  if (MEETUP_METHODS.includes(method ?? '')) {
    return <Handshake className="h-3.5 w-3.5 text-verdict-incon" />;
  }
  return <Package className="h-3.5 w-3.5 text-authBrand-500" />;
}

export default function InboxPage() {
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setMe({ id: m.id })).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    api.orders.inbox()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function doAction(orderId: string, action: () => Promise<any>) {
    setActionBusy(orderId);
    try { await action(); fetchData(); }
    catch (e: any) { setError(e.message ?? '操作失敗'); }
    finally { setActionBusy(null); }
  }

  const qLower = query.trim().toLowerCase();
  const visibleOrders = qLower ? orders.filter((o) => matchesQuery(o, qLower)) : orders;
  const actionRequired = visibleOrders.filter((o) =>
    AUTH_ACTION_STATUSES.has(o.status) ||
    (o.status === 'PAID' && isMeetup(o))
  );
  const done = visibleOrders.filter((o) => TERMINAL_STATUSES.has(o.status));
  const actionIds = new Set(actionRequired.map((o) => o.id));
  const doneIds = new Set(done.map((o) => o.id));
  const waiting = visibleOrders.filter((o) => !actionIds.has(o.id) && !doneIds.has(o.id));
  const noResults = !!qLower && visibleOrders.length === 0;

  const todayMeetup = orders.filter((o) => o.status === 'PAID' && isMeetup(o)).length;

  if (loading) {
    return (
      <>
        <AuthTopline title="收件匣" subtitle="載入中…" />
        <AuthContent><div className="h-40 animate-pulse rounded-xl bg-surface-2" /></AuthContent>
      </>
    );
  }
  if (error) {
    return (
      <>
        <AuthTopline title="收件匣" />
        <AuthContent><p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p></AuthContent>
      </>
    );
  }

  return (
    <>
      <AuthTopline
        title="收件匣"
        subtitle={`${actionRequired.length} 宗待處理 · ${todayMeetup} 宗今日面交`}
      />
      <AuthContent>
        {/* Search */}
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-text-hint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋商品名稱、買賣家、品牌或訂單 ID（首 8 字）"
            className="h-11 w-full rounded-xl border border-line-2 bg-white pl-10 pr-10 text-[14px] shadow-[inset_0_1px_2px_rgba(38,48,94,0.03)] outline-none transition focus:border-authBrand-500"
            aria-label="搜尋訂單"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-text-hint hover:bg-surface-2"
              aria-label="清除搜尋"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {qLower && (
          <p className="mb-4 text-[12px] text-authBrand-500">
            過濾結果 · {actionRequired.length} 待處理 · {waiting.length} 進行中 · {done.length} 已完成
          </p>
        )}

        {noResults && (
          <div className="rounded-xl border border-dashed border-line-2 bg-surface-2 p-6 text-center">
            <p className="text-[14px] font-semibold text-neutral-text">揾唔到符合「{query.trim()}」嘅訂單</p>
            <p className="mt-1 text-[12px] text-neutral-text-hint">
              試試輸入訂單 ID 首 8 個字、買賣家名稱、商品品牌或商品標題關鍵字。
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-3 rounded-lg border border-line-2 bg-white px-3 py-1 text-[12px] hover:bg-surface-2"
            >
              清除搜尋
            </button>
          </div>
        )}

        {/* ═══ Tier 1: Action Required ═══ */}
        {actionRequired.length > 0 && (
          <Group
            dot="verdict-incon"
            title="需要你處理"
            count={`${actionRequired.length} 宗`}
          >
            {actionRequired.map((o) => {
              const sla = slaLabel(o);
              const meetup = isMeetup(o);
              const busy = actionBusy === o.id;
              return (
                <ActionCard
                  key={o.id}
                  order={o}
                  sla={sla}
                  meetup={meetup}
                  busy={busy}
                  copiedId={copiedId}
                  setCopiedId={setCopiedId}
                  onStart={() => doAction(o.id, () => api.orders.startMeetupAuth(o.id))}
                  onFallbackConfirm={(phone, photos) =>
                    doAction(o.id, () => api.orders.custodyPhoneFallback(o.id, phone, photos))
                  }
                  onChat={() => setChatOrderId(o.id)}
                />
              );
            })}
          </Group>
        )}

        {actionRequired.length === 0 && !noResults && !qLower && (
          <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-neutral-text-hint shadow-auth-sh1">
            目前無需要你立即處理嘅訂單。
          </div>
        )}

        {/* ═══ Tier 2: Waiting ═══ */}
        {waiting.length > 0 && (
          <Group
            dot="authBrand"
            title="等待中 / 進行中"
            count={`${waiting.length} 宗`}
          >
            {waiting.map((o) => (
              <CompactRow key={o.id} order={o} statusLabel={STATUS_LABEL[o.status] ?? o.status} />
            ))}
          </Group>
        )}

        {/* ═══ Tier 3: Terminal ═══ */}
        {done.length > 0 && (
          <Group
            dot="pass"
            title="已完成 / 終結"
            count={`${done.length} 宗`}
          >
            {done.map((o) => {
              const isPassed = o.status === 'COMPLETED' || o.authVerdict === 'PASSED';
              const isFailed = o.status === 'DISPUTED' || o.authVerdict === 'FAILED';
              const label =
                o.status === 'COMPLETED' ? '✓ 已完成'
                : o.status === 'REFUNDED' ? '已退款'
                : o.status === 'DISPUTED' ? '⚠ 爭議中'
                : o.authVerdict === 'PASSED' ? '✓ 真品'
                : o.authVerdict === 'FAILED' ? '✕ 假貨'
                : o.authVerdict === 'INCONCLUSIVE' ? '？ 無法判定'
                : STATUS_LABEL[o.status] ?? o.status;
              const pillCls = isPassed
                ? 'bg-verdict-pass-soft text-verdict-pass'
                : isFailed
                ? 'bg-verdict-fail-soft text-verdict-fail'
                : 'bg-verdict-incon-soft text-verdict-incon';
              return (
                <CompactRow
                  key={o.id}
                  order={o}
                  statusLabel={label}
                  statusPillCls={pillCls}
                />
              );
            })}
          </Group>
        )}
      </AuthContent>

      {chatOrderId && me && (() => {
        const o = orders.find((x) => x.id === chatOrderId);
        if (!o) return null;
        return (
          <ConversationDrawer
            orderId={chatOrderId}
            currentUserId={me.id}
            counterpartyName={`${o.buyer.displayName} / ${o.seller.displayName}`}
            listingTitle={o.listing.title}
            listingLinkId={o.listing.id}
            listingImage={o.listing.images?.[0]}
            counterpartySellerId={o.seller.id}
            counterpartyBuyerId={o.buyer.id}
            orderStatus={o.status}
            conversationType="order"
            onClose={() => setChatOrderId(null)}
            readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(o.status)}
            readOnlyReason={
              o.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
              : o.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
              : o.status === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
              : undefined
            }
          />
        );
      })()}
    </>
  );
}

// ═══ Group section header (dot + title + count) ═══
function Group({
  dot, title, count, children,
}: {
  dot: 'authBrand' | 'verdict-incon' | 'pass';
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  const dotCls =
    dot === 'authBrand' ? 'bg-authBrand-500'
    : dot === 'verdict-incon' ? 'bg-verdict-incon'
    : 'bg-verdict-pass';
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
        <h2 className="text-[15px] font-bold text-authBrand-900">{title}</h2>
        <span className="text-[12px] font-semibold text-neutral-text-hint">{count}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

// ═══ Action-required card (rich) ═══
function ActionCard({
  order: o, sla, meetup, busy, copiedId, setCopiedId, onStart, onFallbackConfirm, onChat,
}: {
  order: InboxOrder;
  sla: { text: string; cls: string } | null;
  meetup: boolean;
  busy: boolean;
  copiedId: string | null;
  setCopiedId: (v: string | null) => void;
  onStart: () => void;
  onFallbackConfirm: (sellerPhone: string, photos: string[]) => void;
  onChat: () => void;
}) {
  // Custody gate（founder 2026-07-14）：MEETUP_AUTH 唔准一鍵開始 —
  // 正路 = QR scan；賣家用唔到 QR = 電話號碼核實 fallback。
  const isMeetupAuth = o.deliveryMethod === 'MEETUP_AUTH';
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fbPhone, setFbPhone] = useState('');
  const [fbPhotos, setFbPhotos] = useState<string[]>([]);
  const fbFileRef = useRef<HTMLInputElement | null>(null);

  function onFbPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((f) => {
      const r = new FileReader();
      r.onload = () => setFbPhotos((prev) => [...prev, r.result as string]);
      r.readAsDataURL(f);
    });
    if (fbFileRef.current) fbFileRef.current.value = '';
  }
  return (
    // 成個卡 clickable（lesson #19/#20 stretched-link）：title Link overlay 蓋全卡，
    // 內部 interactive（XLink/copy/action buttons）用 relative 升層。
    <div className="relative cursor-pointer rounded-xl border border-line bg-white p-4 shadow-auth-sh1 transition hover:shadow-auth-sh2">
      <div className="flex items-start gap-3.5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-authBrand-100 to-authBrand-200">
          {o.listing.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-[9px] font-bold text-authBrand-500">
              {(o.listing as any).brand ?? 'ITEM'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/authenticate/${o.id}`}
              className="line-clamp-1 text-[14px] font-semibold text-neutral-text after:absolute after:inset-0 after:content-[''] hover:text-authBrand-500"
            >
              {o.listing.title}
            </Link>
            <span className="shrink-0 text-[15px] font-extrabold text-authBrand-900">
              {formatHKD(o.salePriceHKD)}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-neutral-text-hint">
            {CATEGORY_LABEL[o.listing.category] ?? o.listing.category}
            {' · '}
            <span className="inline-flex items-center gap-0.5">
              <DeliveryIcon method={o.deliveryMethod} />
              {DELIVERY_LABEL[o.deliveryMethod ?? ''] ?? o.deliveryMethod}
            </span>
            {o.meetupLocation && (
              <span className="inline-flex items-center gap-0.5 ml-1">
                · <MapPin className="ml-0.5 h-3 w-3" /> {o.meetupLocation}
              </span>
            )}
            {' · '}鑑定費：
            <span className="font-semibold text-verdict-pass">{formatHKD(o.authFeeHKD)}</span>
          </p>
          <p className="relative mt-1 text-[11px] text-neutral-text-hint">
            賣家：
            <XLink href={`/seller/${o.seller.id}`} className="text-neutral-text-muted hover:text-authBrand-500 hover:underline">
              {o.seller.displayName}
            </XLink>
            {' · '}買家：
            <XLink href={`/buyer/${o.buyer.id}`} className="text-neutral-text-muted hover:text-authBrand-500 hover:underline">
              {o.buyer.displayName}
            </XLink>
            {' · '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard?.writeText(o.id).then(() => {
                  setCopiedId(o.id);
                  setTimeout(() => setCopiedId(copiedId === o.id ? null : copiedId), 1500);
                }).catch(() => {});
              }}
              className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] hover:bg-line"
              title="點擊複製訂單 ID"
            >
              {copiedId === o.id ? '✓ 已複製' : `#${o.id.slice(0, 8).toUpperCase()} ⎘`}
            </button>
          </p>
          {sla && (
            <div className="mt-1.5 inline-flex">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sla.cls}`}>
                {sla.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="relative mt-3.5 flex flex-wrap gap-2">
        {/* MEETUP_AUTH：必須經 QR（或電話 fallback）先入 custody — 冇一鍵 override */}
        {isMeetupAuth && o.status === 'PAID' && (
          <>
            <Link
              href="/scan"
              className="rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
            >
              掃描賣家 QR 交收 →
            </Link>
            <button
              type="button"
              onClick={() => setFallbackOpen((v) => !v)}
              className="rounded-lg border border-line-2 bg-white px-3 py-2 text-[12px] text-neutral-text-muted transition hover:border-authBrand-500 hover:text-authBrand-500"
            >
              賣家用唔到 QR？
            </button>
          </>
        )}
        {/* MEETUP_3WAY：三方同場，冇 custody transfer — 保留一鍵開始 */}
        {meetup && !isMeetupAuth && o.status === 'PAID' && (
          <button
            disabled={busy}
            onClick={onStart}
            className="rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600 disabled:opacity-40"
          >
            {busy ? '處理中…' : '開始面交鑑定'}
          </button>
        )}
        {o.status === 'SHIPPED_TO_AUTHENTICATOR' && (
          <Link
            href={`/authenticate/${o.id}`}
            className="rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
          >
            確認收件 + 影相 →
          </Link>
        )}
        {o.status === 'AUTHENTICATING' && (
          <Link
            href={`/authenticate/${o.id}`}
            className="rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
          >
            進入鑑定工作台
          </Link>
        )}
        <button
          onClick={onChat}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-white px-4 py-2 text-[13px] font-semibold text-neutral-text shadow-auth-sh1 transition hover:border-authBrand-500 hover:text-authBrand-500"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          訊息
        </button>
      </div>

      {/* Custody 電話 fallback panel（founder 2026-07-14）：賣家登記電話核實
          身分 + ≥3 相 → CUSTODY，custodyVia=PHONE_FALLBACK 留 audit */}
      {isMeetupAuth && o.status === 'PAID' && fallbackOpen && (
        <div className="relative mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3.5">
          <p className="text-[12px] font-semibold text-neutral-text">賣家身分核實（QR 用唔到時先用）</p>
          <p className="mt-0.5 text-[11px] text-neutral-text-hint">
            請賣家講出佢登記嘅電話號碼 — 必須同帳戶登記完全一致；同時影至少 3 張接收相。
          </p>
          <input
            type="tel"
            value={fbPhone}
            onChange={(e) => setFbPhone(e.target.value)}
            placeholder="+852 XXXX XXXX"
            className="mt-2 w-full max-w-[220px] rounded-lg border border-line-2 bg-white px-3 py-2 text-[13px] outline-none focus:border-authBrand-500"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fbFileRef} type="file" accept="image/*" multiple hidden onChange={onFbPhotoPick} />
            <button
              type="button"
              onClick={() => fbFileRef.current?.click()}
              className="rounded-lg border border-line-2 bg-white px-3 py-1.5 text-[12px] text-neutral-text transition hover:border-authBrand-500"
            >
              影相／上載（{fbPhotos.length}/3+）
            </button>
            {fbPhotos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt="" className="h-9 w-9 rounded object-cover" />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => { setFallbackOpen(false); setFbPhone(''); setFbPhotos([]); }}
              className="rounded-lg border border-line-2 bg-white px-3 py-1.5 text-[12px] text-neutral-text-muted"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || !fbPhone.trim() || fbPhotos.length < 3}
              onClick={() => onFallbackConfirm(fbPhone.trim(), fbPhotos)}
              className="rounded-lg bg-authBrand-500 px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-authBrand-600 disabled:opacity-40"
            >
              {busy ? '處理中…' : '核實電話 + 確認接收'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Compact row (waiting / done tiers) ═══
function CompactRow({
  order: o, statusLabel, statusPillCls,
}: {
  order: InboxOrder;
  statusLabel: string;
  statusPillCls?: string;
}) {
  return (
    <Link
      href={`/authenticate/${o.id}`}
      className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-auth-sh1 transition hover:shadow-auth-sh2"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-gradient-to-br from-authBrand-100 to-authBrand-200">
        {o.listing.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[8px] font-bold text-authBrand-500">
            {(o.listing as any).brand ?? 'ITEM'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-neutral-text">{o.listing.title}</p>
        <p className="truncate text-[11px] text-neutral-text-hint">
          {formatHKD(o.salePriceHKD)} · {CATEGORY_LABEL[o.listing.category] ?? o.listing.category}
          {' · '}
          <span className="inline-flex items-center gap-0.5">
            <DeliveryIcon method={o.deliveryMethod} />
            {DELIVERY_LABEL[o.deliveryMethod ?? ''] ?? o.deliveryMethod}
          </span>
          {' · '}賣家 {o.seller.displayName}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          statusPillCls ?? 'bg-surface-2 text-neutral-text-muted'
        }`}
      >
        {statusLabel}
      </span>
    </Link>
  );
}
