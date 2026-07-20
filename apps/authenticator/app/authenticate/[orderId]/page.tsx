'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Label, Input, Badge,
  HandoverHistoryTimeline, type HandoverRound, ConfirmDialog,
} from '@authentik/ui';

const MAX_REPHOTO = 2;
const MEETUP_AUTH_PHASE_A: string[] = ['PAID', 'HANDOVER_TO_AUTH', 'SELLER_ACK_PENDING'];
import { formatHKD } from '@authentik/utils';
import {
  Camera, Video, FileSignature, ArrowLeft, CheckCircle2, ChevronDown, Handshake,
  Package, MapPin, MessageCircle, ShieldCheck, AlertTriangle, ExternalLink, Clock,
  ChevronRight, Image as ImageIcon, Upload, X, FileVideo, FileImage,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { PhotoUploader } from '@/components/photo-uploader';
import Link from 'next/link';
import { AuthTopline, AuthContent } from '@/components/auth-topline';

// ─── Cross-app navigation ──────────────────────────────────────────────────
// Authenticator portal on port 3001; /seller, /listing routes only exist on
// consumer (3008). Always open consumer URLs in a new tab — NEVER next/link.
import { XLink } from '@/components/x-link';

// ─── Constants ─────────────────────────────────────────────────────────────
const CATEGORY_CHECKLIST: Record<string, string[]> = {
  HANDBAG: ['外觀：縫線整齊度、皮料紋理', '五金：刻字深度、電鍍光澤', '內裏：標籤字體、序號', '隨附：購買單據、防塵袋、原裝盒'],
  WATCH: ['錶盤：字體、指針對位', '錶殼：拋光、螺絲紋路', '機芯：走字聲、後蓋刻字', '隨附：保卡、盒子、說明書'],
  IPHONE: ['IMEI 對應序號', '螢幕品質、Home/Face ID', '端口磨損程度', '電池健康度'],
  POKEMON_CARD: ['印刷品質、字體對位', '卡面光澤與反光', '卡背紋路深度', 'PSA / BGS 紙盒真偽（如有）'],
  SNEAKER: ['材質感：皮革/布面品質', '縫線均勻度', '鞋底模具紋路', '尺碼標籤字體'],
  DESIGNER_TOY: ['盲盒封膜完整', '公仔塗裝精細度', '廠商標誌位置', '配件齊全'],
  OTHER: ['外觀品質', '品牌標誌真偽', '材質感', '附件完整性'],
};

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: '等待付款', PAID: '已付款', SHIPPED_TO_AUTHENTICATOR: '待簽收',
  AUTHENTICATING: '鑑定中', AUTH_PASSED: '鑑定通過', AUTH_FAILED: '鑑定不通過',
  SHIPPED_TO_BUYER: '已寄出至買家', DELIVERED: '已送達', COMPLETED: '已完成',
  DISPUTED: '爭議中', REFUNDED: '已退款',
};

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '寄送', MEETUP_AUTH: '鑑定師面交', MEETUP_3WAY: '三方面交', MEETUP_DIRECT: '雙方面交',
};

const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];

// ─── SLA helper ────────────────────────────────────────────────────────────
function slaInfo(receivedAt: string | null | undefined): {
  label: string; tone: 'green' | 'amber' | 'red' | 'pending';
} {
  if (!receivedAt) return { label: '面交後計時開始', tone: 'pending' };
  const deadline = new Date(receivedAt).getTime() + 48 * 60 * 60 * 1000;
  const msLeft = deadline - Date.now();
  if (msLeft <= 0) return { label: '已逾期', tone: 'red' };
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  const label = `距截止 ${h} 小時 ${m} 分`;
  if (h >= 24) return { label, tone: 'green' };
  if (h >= 12) return { label, tone: 'amber' };
  return { label, tone: 'red' };
}

export default function AuthenticatePage({ params }: { params: { orderId: string } }) {
  const { orderId } = params;
  const router = useRouter();

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mismatchFlags, setMismatchFlags] = useState<Record<string, boolean>>({});
  const [verdict, setVerdict] = useState<'PASSED' | 'FAILED' | 'INCONCLUSIVE' | null>(null);
  const [inconclusiveOpen, setInconclusiveOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Verdict confirm dialog — gates the irreversible verdict submit so a stray
   *  click can't release escrow / refund. Opens after preflight validation
   *  (verdict + evidence + signature checks) so the dialog only appears when
   *  the submit would otherwise be valid. */
  const [verdictConfirmOpen, setVerdictConfirmOpen] = useState(false);
  /** Dispute confirm dialog — replaces window.prompt with a styled UI that
   *  also captures the reason in the dialog itself (requireReason). */
  const [disputeConfirmOpen, setDisputeConfirmOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [me, setMe] = useState<{ id: string } | null>(null);

  // ── Context panel state ────────────────────────────────────────────────
  const [activeImg, setActiveImg] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [buyerExpanded, setBuyerExpanded] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<{
    soldAsSellerCount: number;
    activeListingsCount: number;
    kycVerified: boolean;
  } | null>(null);

  // ── Evidence media upload state ────────────────────────────────────────
  // Files upload + commit to the server immediately on selection (not held
  // back until verdict submit) — so a crashed tab / browser refresh doesn't
  // lose evidence already selected. Server is the source of truth: verdict
  // submission re-checks committed-evidence count (race-safe), this client
  // list is just for display + the "uploading in progress" guard.
  interface EvidenceFile {
    id: string;
    file: File;
    previewUrl: string; // object URL (image) or empty (video, we just show name)
    isVideo: boolean;
    status: 'uploading' | 'done' | 'error';
    error?: string;
  }
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  // Server-committed evidence, fetched on load so a re-opened tab shows prior uploads.
  const [committedEvidence, setCommittedEvidence] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_EVIDENCE_BYTES = 500 * 1024 * 1024; // 500MB ceiling — matches server ParseFilePipeBuilder cap

  useEffect(() => {
    api.orders.listEvidence(orderId).then(setCommittedEvidence).catch(() => {});
  }, [orderId]);

  function onEvidenceSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setSubmitError(null);
    const files = Array.from(e.target.files ?? []);
    const tooBig = files.filter((f) => f.size > MAX_EVIDENCE_BYTES);
    const valid = files.filter((f) => f.size <= MAX_EVIDENCE_BYTES);
    if (tooBig.length > 0) {
      setSubmitError(`部分檔案大過 500MB，已略過 ${tooBig.length} 個檔案。`);
    }
    e.target.value = '';
    valid.forEach((f) => {
      const isVideo = f.type.startsWith('video/');
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setEvidence((prev) => [
        ...prev,
        { id, file: f, previewUrl: isVideo ? '' : URL.createObjectURL(f), isVideo, status: 'uploading' },
      ]);
      api.orders
        .uploadEvidence(orderId, f)
        .then((committed) => {
          setEvidence((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'done' } : x)));
          setCommittedEvidence((prev) => [...prev, committed]);
        })
        .catch((err) => {
          setEvidence((prev) =>
            prev.map((x) => (x.id === id ? { ...x, status: 'error', error: err?.message ?? '上傳失敗' } : x)),
          );
        });
    });
  }

  // Only errored (never-committed) entries can be cleared from the list —
  // successfully uploaded evidence is immutable once committed server-side.
  function removeEvidence(id: string) {
    setEvidence((prev) => {
      const found = prev.find((x) => x.id === id);
      if (found && found.status !== 'done' && found.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  const evidenceUploading = evidence.some((e) => e.status === 'uploading');
  const evidenceCommittedCount = committedEvidence.length;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      evidence.forEach((e) => { if (e.previewUrl) URL.revokeObjectURL(e.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.me().then((m) => setMe({ id: m.id })).catch(() => {});
  }, []);

  // Load order
  useEffect(() => {
    api.orders
      .get(orderId)
      .then(setOrder)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  // P1: 30s polling scoped to MEETUP_AUTH Phase A — so milan sees seller's
  // re-photo request / cancel without manual refresh.
  useEffect(() => {
    if (!order) return;
    if (order.deliveryMethod !== 'MEETUP_AUTH') return;
    if (!MEETUP_AUTH_PHASE_A.includes(order.status)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.orders.get(orderId).then(setOrder).catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [order?.id, order?.status, order?.deliveryMethod, orderId]);

  // Fetch seller factual signals lazily (any logged-in role can call this)
  useEffect(() => {
    const sellerId = order?.seller?.id;
    if (!sellerId) return;
    let active = true;
    api.users.sellerProfile(sellerId)
      .then((p) => {
        if (!active) return;
        setSellerInfo({
          soldAsSellerCount: p.soldAsSellerCount,
          activeListingsCount: p.activeListingsCount,
          kycVerified: p.kycVerified,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [order?.seller?.id]);

  // Restore checklist + mismatch state from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checklist-${orderId}`);
      if (saved) setChecked(JSON.parse(saved));
      const savedMismatch = sessionStorage.getItem(`mismatch-${orderId}`);
      if (savedMismatch) setMismatchFlags(JSON.parse(savedMismatch));
    } catch {}
  }, [orderId]);

  function onCheckChange(item: string, val: boolean) {
    setChecked((c) => {
      const next = { ...c, [item]: val };
      try { sessionStorage.setItem(`checklist-${orderId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function onMismatchToggle(item: string) {
    setMismatchFlags((m) => {
      const next = { ...m, [item]: !m[item] };
      try { sessionStorage.setItem(`mismatch-${orderId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Auto-fill notes with mismatch bullets when verdict is FAILED/INCONCLUSIVE
  // and user hasn't already written something.
  useEffect(() => {
    if (verdict === 'PASSED') return;
    const flagged = Object.entries(mismatchFlags).filter(([, v]) => v).map(([k]) => k);
    if (flagged.length === 0) return;
    const bullet = flagged.map((f) => `• ${f}：與描述不符`).join('\n');
    setNotes((prev) => {
      // Only auto-fill if notes is empty or only contains previous auto-generated bullets
      const isAutoOrEmpty = prev.trim() === '' || prev.split('\n').every((line) => line.trim().startsWith('• '));
      return isAutoOrEmpty ? bullet : prev;
    });
  }, [mismatchFlags, verdict]);

  // Receipt photos for SHIP markReceived / MEETUP_AUTH auth-receive-ack
  const [receiptPhotos, setReceiptPhotos] = useState<string[]>([]);
  const [receiptConfirmOpen, setReceiptConfirmOpen] = useState(false);

  // Return photos for FAILED verdict
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);

  async function onMarkReceivedShip() {
    if (receiptPhotos.length < 3) { setSubmitError('請上載至少 3 張收件 unboxing 相'); return; }
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.markReceived(orderId, receiptPhotos);
      setOrder(updated);
      setReceiptPhotos([]);
      setReceiptConfirmOpen(false);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  async function onStartMeetupHandover() {
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.startMeetupHandover(orderId);
      setOrder(updated);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  async function onAuthReceiveAck() {
    if (receiptPhotos.length < 3) { setSubmitError('請上載至少 3 張接收時嘅相'); return; }
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.authReceiveAck(orderId, receiptPhotos);
      setOrder(updated);
      setReceiptPhotos([]);
      setReceiptConfirmOpen(false);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  async function onUploadReturnPhotos() {
    if (returnPhotos.length < 3) { setSubmitError('請上載至少 3 張退貨相'); return; }
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.uploadReturnPhotos(orderId, returnPhotos);
      setOrder(updated);
      setReturnPhotos([]);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  async function onAuthDeliveryAck() {
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.authDeliveryAck(orderId);
      setOrder(updated);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  function onDispute() {
    setDisputeConfirmOpen(true);
  }
  async function doDispute(reason?: string) {
    setDisputeConfirmOpen(false);
    const r = (reason ?? '').trim();
    if (!r) return; // dialog already gates this, belt-and-braces
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.dispute(orderId, r);
      setOrder(updated);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  async function onStartMeetupAuth() {
    setBusy(true); setSubmitError(null);
    try {
      const updated = await api.orders.startMeetupAuth(orderId);
      setOrder(updated);
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '操作失敗');
    } finally { setBusy(false); }
  }

  // Button click → preflight validation → open ConfirmDialog. The dialog's
  // onConfirm calls doSubmitVerdict(). Splitting it this way keeps validation
  // errors inline (above the button) instead of buried inside the dialog.
  function onSubmitVerdict() {
    if (!verdict) { setSubmitError('請揀鑑定結果'); return; }
    if (evidenceUploading) {
      setSubmitError('證據檔案仲在上載中，請等候完成');
      return;
    }
    if (evidenceCommittedCount === 0) {
      setSubmitError('請至少上載一個鑑定影片 / 圖片證據');
      return;
    }
    if (!signature.trim()) { setSubmitError('請輸入電子簽名（你的全名）'); return; }
    // Ack v2 (D): MEETUP_3WAY PASSED = 即場交收 + 放款 — 必須明確確認
    // 「貨物已當面交予買家」（「真」同「交咗貨」係兩件事，分開記錄）。
    if (order.deliveryMethod === 'MEETUP_3WAY' && verdict === 'PASSED' && !handedOver) {
      setSubmitError('三方面交：請先剔「貨物已當面交予買家」— 提交後訂單即完成並放款');
      return;
    }
    setSubmitError(null);
    setVerdictConfirmOpen(true);
  }

  const [handedOver, setHandedOver] = useState(false);

  async function doSubmitVerdict() {
    // Re-assert the preflight invariant: dialog only opens after onSubmitVerdict
    // validates verdict !== null. The guard satisfies TS narrowing across the
    // function boundary + is a belt-and-braces safety against any future caller.
    if (!verdict) return;
    setVerdictConfirmOpen(false);
    setBusy(true); setSubmitError(null);
    try {
      // MEETUP_AUTH dual-ack flow uses separate verdict endpoint;
      // SHIP / MEETUP_3WAY / MEETUP_DIRECT use existing
      if (order.deliveryMethod === 'MEETUP_AUTH' && order.status === 'CUSTODY') {
        await api.orders.submitVerdictMeetup(orderId, verdict, notes);
      } else {
        await api.orders.submitVerdict(orderId, verdict, notes);
      }
      setSubmitSuccess(
        verdict === 'PASSED' ? '✓ 已提交：真品'
        : verdict === 'FAILED' ? '✗ 已提交：假貨'
        : '已提交：無法判定'
      );
      try {
        sessionStorage.removeItem(`checklist-${orderId}`);
        sessionStorage.removeItem(`mismatch-${orderId}`);
      } catch {}
    } catch (e: any) {
      setSubmitError(e instanceof ApiError ? e.message : '提交失敗');
    } finally { setBusy(false); }
  }

  if (loading) return (
    <>
      <AuthTopline title="鑑定工作台" subtitle="載入中…" />
      <AuthContent><div className="h-40 animate-pulse rounded-xl bg-surface-2" /></AuthContent>
    </>
  );
  if (error) return (
    <>
      <AuthTopline title="鑑定工作台" />
      <AuthContent><p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p></AuthContent>
    </>
  );
  if (!order) return null;

  const checklist: string[] =
    CATEGORY_CHECKLIST[order.listing?.category as string] ??
    CATEGORY_CHECKLIST.OTHER ??
    ['外觀品質', '品牌標誌真偽', '材質感', '附件完整性'];
  const isCompleted = ['AUTH_PASSED', 'AUTH_FAILED', 'SHIPPED_TO_BUYER', 'DELIVERED', 'COMPLETED'].includes(order.status);
  const isMeetup = MEETUP_METHODS.includes(order.deliveryMethod ?? '');
  const is3Way = order.deliveryMethod === 'MEETUP_3WAY';
  const images: string[] = order.listing?.images ?? [];
  const safeActive = Math.min(activeImg, Math.max(0, images.length - 1));
  const sla = (order.status === 'AUTHENTICATING' || order.status === 'CUSTODY') ? slaInfo(order.receivedByAuthAt) : null;

  // ── Success confirmation ──────────────────────────────────────────────
  if (submitSuccess) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-ink">{submitSuccess}</h2>
        <p className="mt-2 text-sm text-neutral-text-muted">
          鑑定費：{formatHKD(order.authFeeHKD)} · 簽名人：{signature}
        </p>
        <p className="mt-1 text-xs text-neutral-text-hint">#{orderId.slice(0, 8)} · {order.listing?.title}</p>
        <Button className="mt-6" onClick={() => router.push('/inbox')}>
          返回 Inbox
        </Button>
      </div>
    );
  }

  // ─── Zone A — Listing & parties context panel ───────────────────────────
  const contextPanel = (
    <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      {/* ── Listing card ───────────────────────────────────────────────── */}
      <Card className="w-full">
        <CardHeader className="border-b border-line">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-text-hint">
            賣家上架嘅貨品
          </p>
          <CardTitle className="text-base">
            <XLink
              href={`/listing/${order.listing?.id}`}
              className="inline-flex items-center gap-1 hover:text-authBrand-600 hover:underline"
              title="開新分頁睇上架詳情"
            >
              {order.listing?.title ?? '—'}
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />
            </XLink>
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-text-muted">
            <span className="font-medium text-neutral-text">{formatHKD(order.salePriceHKD ?? 0)}</span>
            {order.listing?.category && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5">{order.listing.category}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          {/* Main image */}
          {images.length > 0 ? (
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[safeActive]}
                alt={`上架圖 ${safeActive + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-2 text-xs text-neutral-text-hint">
              <div className="text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-neutral-text-hint" />
                <p className="mt-1">賣家未提供圖片</p>
              </div>
            </div>
          )}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${i === safeActive ? 'border-authBrand-500' : 'border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Description */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-text-hint">
              賣家原 description
            </p>
            <div
              className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-text ${descExpanded ? '' : 'line-clamp-6 lg:line-clamp-none'}`}
            >
              {order.listing?.description?.trim() || <span className="text-neutral-text-hint">賣家未填寫描述</span>}
            </div>
            {order.listing?.description && (order.listing.description.length > 200) && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1 text-xs text-authBrand-500 hover:underline lg:hidden"
              >
                {descExpanded ? '收起 ▲' : '睇完整描述 ▼'}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Seller card ────────────────────────────────────────────────── */}
      <Card className="w-full">
        <CardHeader className="border-b border-line">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-text-hint">
            賣家
          </p>
        </CardHeader>
        <CardContent className="p-3">
          <XLink
            href={`/seller/${order.seller?.id}`}
            className="group flex items-center gap-2 rounded-lg hover:bg-surface-2"
            title="開新分頁睇賣家檔案"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-authBrand-soft text-sm font-semibold text-authBrand-600">
              {(order.seller?.displayName ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-text group-hover:text-authBrand-600">
                {order.seller?.displayName ?? '—'}
              </p>
              <p className="text-[10px] text-neutral-text-hint group-hover:text-authBrand-500">
                睇賣家檔案 →
              </p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />
          </XLink>

          {/* Factual signals — algorithm-derived only, no platform endorsement */}
          {sellerInfo && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {sellerInfo.kycVerified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                  title="賣家已通過 KYC 實名驗證"
                >
                  <ShieldCheck className="h-3 w-3" />KYC 驗證
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-neutral-text-muted">
                已售 {sellerInfo.soldAsSellerCount} 件
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-neutral-text-muted">
                上架 {sellerInfo.activeListingsCount}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Buyer mini-card (collapsible) ──────────────────────────────── */}
      <Card className="w-full">
        <button
          type="button"
          onClick={() => setBuyerExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-text-hint">
              買家
            </p>
            <p className="mt-0.5 text-sm font-medium text-neutral-text">
              {order.buyer?.displayName ?? '—'}
            </p>
          </div>
          {buyerExpanded
            ? <ChevronDown className="h-4 w-4 text-neutral-text-hint" />
            : <ChevronRight className="h-4 w-4 text-neutral-text-hint" />}
        </button>
        {buyerExpanded && (
          <div className="border-t border-line px-4 py-3 text-xs text-neutral-text-muted">
            <p>買家為交易對手方。鑑定真偽主要對賣家描述作判斷，買家資料一般唔影響鑑定結論。</p>
          </div>
        )}
      </Card>
    </div>
  );

  // ─── Zone B — Working panel (status flow + workspace) ──────────────────
  const workingPanel = (
    <div className="space-y-4">
      {/* SLA countdown */}
      {sla && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          sla.tone === 'red' ? 'border-red-200 bg-red-50 text-red-700'
          : sla.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800'
          : sla.tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-line bg-surface-2 text-neutral-text-muted'
        }`}>
          <Clock className="h-4 w-4 shrink-0" />
          <span className="font-medium">{sla.label}</span>
          <span className="text-xs opacity-70">· 48h SLA</span>
        </div>
      )}

      {/* Already completed */}
      {isCompleted && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <p className="font-medium text-emerald-800">
              鑑定已完成：{order.authVerdict === 'PASSED' ? '✓ 真品' : order.authVerdict === 'FAILED' ? '✗ 假貨' : '無法判定'}
            </p>
            {order.authNotes && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-700">{order.authNotes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* SHIP: Mark received (v4 dual-ack — requires ≥3 unboxing photos) */}
      {order.status === 'SHIPPED_TO_AUTHENTICATOR' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <p className="font-medium text-amber-900">貨品已到？請拍攝 unboxing 相，至少 3 張。賣家會 view 後 ack。</p>
            <PhotoUploader
              photos={receiptPhotos}
              onChange={setReceiptPhotos}
              minRequired={3}
              label="收件相片"
            />
            <Button onClick={onMarkReceivedShip} disabled={busy || receiptPhotos.length < 3}>
              {busy ? '處理中…' : '確認收件並提交相片'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH dual-ack: Step 1 — start handover (PAID) */}
      {order.status === 'PAID' && order.deliveryMethod === 'MEETUP_AUTH' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-900">
              賣家已嚟你嘅店面交付商品？撳「準備接收」之後再影 ≥3 張相確認收貨。
            </p>
            <Button className="mt-3" onClick={onStartMeetupHandover} disabled={busy}>
              {busy ? '處理中…' : '賣家已到，準備接收'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH dual-ack: Step 2A — upload photos + auth-receive-ack (HANDOVER_TO_AUTH) */}
      {order.status === 'HANDOVER_TO_AUTH' && (
        <Card className={order.rePhotoCount > 0 ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'}>
          <CardContent className="space-y-3 p-4">
            {/* Re-photo context banner with structured rejection reason */}
            {order.rePhotoCount > 0 && (() => {
              const history = (order.handoverHistory ?? []) as HandoverRound[];
              const lastRejected = [...history].reverse().find((r) => r.rejectedAt);
              return (
                <div className="rounded border border-rose-300 bg-white p-3">
                  <p className="text-sm font-medium text-rose-900">
                    ⚠ 賣家要求重拍（第 {order.rePhotoCount} 次，總共最多 {MAX_REPHOTO} 次）
                  </p>
                  {lastRejected?.rejectionPresets && lastRejected.rejectionPresets.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {lastRejected.rejectionPresets.map((p) => (
                        <span key={p} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {lastRejected?.rejectionComment && (
                    <p className="mt-2 whitespace-pre-line rounded bg-rose-50 p-2 text-xs italic text-neutral-text">
                      賣家補充：「{lastRejected.rejectionComment}」
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-rose-700">
                    請按上述要求重新拍攝（仍係最少 3 張）。
                    {order.rePhotoCount >= MAX_REPHOTO && (
                      <span className="ml-1 font-medium">
                        ⚠ 賣家已用盡重拍機會 — 今次後賣家只能選擇確認或取消交易。
                      </span>
                    )}
                  </p>
                </div>
              );
            })()}
            <p className="font-medium text-amber-900">
              請拍攝商品狀況相片（最少 3 張），完成後撳「已接收」，等賣家 view 相確認。
            </p>
            <PhotoUploader
              photos={receiptPhotos}
              onChange={setReceiptPhotos}
              minRequired={3}
              label="接收商品相片（賣家會 view + ack）"
            />
            <Button onClick={onAuthReceiveAck} disabled={busy || receiptPhotos.length < 3}>
              {busy ? '處理中…' : '影相完成，已接收'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH: Step 2B — waiting seller ack. Show full audit trail for transparency. */}
      {order.status === 'SELLER_ACK_PENDING' && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-medium text-neutral-text">
              ✓ 第 {order.rePhotoCount + 1} 次相片已上載。等待賣家 view 後確認交付。
            </p>
            <HandoverHistoryTimeline
              history={(order.handoverHistory ?? []) as HandoverRound[]}
              maxRePhoto={MAX_REPHOTO}
              collapseSingleRound
            />
            <p className="text-xs text-neutral-text-muted">
              如賣家逾 7 日唔 ack，訂單會自動取消，買家會獲全額退款。
              {order.rePhotoCount >= MAX_REPHOTO && (
                <span className="ml-1">
                  賣家已用盡重拍機會，只剩「確認交付」或「取消交易」兩個出路。
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* SHIP: waiting seller ack on auth-received photos */}
      {order.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK' && (
        <Card>
          <CardContent className="p-4">
            <p className="font-medium text-neutral-text">✓ 收件 + 影相完成。等賣家 view 相確認 condition match。</p>
            {order.authReceiptPhotos?.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {order.authReceiptPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="h-16 w-16 shrink-0 rounded object-cover" />
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-text-muted">
              賣家 ack 後自動進入鑑定階段。
            </p>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH: Step 4 — awaiting buyer pickup */}
      {order.status === 'AWAITING_BUYER_PICKUP' && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <p className="font-medium text-emerald-900">
              ✓ 鑑定通過。買家會嚟取貨，請喺現場引導買家撳「已收到」。
            </p>
            <p className="mt-1 text-xs text-emerald-700">無 timeout — 鑑定師持貨等買家來。</p>
          </CardContent>
        </Card>
      )}

      {/* SHIP: Buyer received, waiting auth ack on unboxing photos */}
      {order.status === 'DELIVERED_PENDING_AUTH_ACK' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <p className="font-medium text-amber-900">
              買家已收貨並上載 unboxing 相。請 view 後 ack 完成交易。
            </p>
            {order.deliveryReceiptPhotos?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {order.deliveryReceiptPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="h-20 w-20 shrink-0 rounded object-cover" />
                ))}
              </div>
            )}
            <Button onClick={onAuthDeliveryAck} disabled={busy}>
              {busy ? '處理中…' : '確認買家收貨 · 釋放款項'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH / SHIP FAILED: auth uploads return photos */}
      {order.status === 'REFUNDED' && order.authVerdict && order.authVerdict !== 'PASSED' && !order.returnPhotosUploadedAt && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="space-y-3 p-4">
            <p className="font-medium text-red-900">
              鑑定不通過。買家已退款。請上載 ≥3 張退貨相，等賣家來取時佢會 view + ack。
            </p>
            <PhotoUploader
              photos={returnPhotos}
              onChange={setReturnPhotos}
              minRequired={3}
              label="退貨相片"
            />
            <Button onClick={onUploadReturnPhotos} disabled={busy || returnPhotos.length < 3}>
              {busy ? '處理中…' : '上載退貨相'}
            </Button>
          </CardContent>
        </Card>
      )}
      {order.status === 'REFUNDED' && order.returnPhotosUploadedAt && !order.returnSellerAckAt && (
        <Card>
          <CardContent className="p-4 text-sm text-neutral-text-muted">
            ✓ 退貨相已上載。等賣家嚟取回。
            {order.returnPhotos?.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {order.returnPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="h-16 w-16 shrink-0 rounded object-cover" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MEETUP_3WAY / MEETUP_DIRECT (unchanged): Start meetup auth */}
      {order.status === 'PAID' && (order.deliveryMethod === 'MEETUP_3WAY' || order.deliveryMethod === 'MEETUP_DIRECT') && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-900">
              面交鑑定：買家{is3Way ? '同賣家' : ''}已到場？確認開始鑑定。
            </p>
            {order.meetupLocation && (
              <p className="mt-1 text-sm text-amber-700">📍 {order.meetupLocation}</p>
            )}
            <Button className="mt-3" onClick={onStartMeetupAuth} disabled={busy}>
              {busy ? '處理中…' : '確認開始面交鑑定'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dispute button — show for all live states */}
      {!isCompleted && !['DISPUTED', 'REFUNDED'].includes(order.status) && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onDispute}
            disabled={busy}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            提出爭議
          </button>
        </div>
      )}
      {order.status === 'DISPUTED' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-red-900">⚠ 交易已凍結（DISPUTED）</p>
            <p className="mt-1 text-red-700">
              Authentik HK 為資訊中介，唔裁決爭議。請拎相片 + IM 對話作為證據，自行同對方解決（包括法律途徑）。
            </p>
          </CardContent>
        </Card>
      )}

      {/* SHIP: Waiting for seller */}
      {order.status === 'PAID' && !isMeetup && (
        <Card>
          <CardContent className="p-4 text-sm text-neutral-text-muted">
            等待賣家寄出貨品…
          </CardContent>
        </Card>
      )}

      {/* ── Active authentication workspace ──────────────────────────── */}
      {!isCompleted && (order.status === 'AUTHENTICATING' || order.status === 'CUSTODY') && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>1. 鑑定證據（影片 / 圖片）</CardTitle>
              <p className="mt-1 text-xs text-neutral-text-muted">
                請上載鑑定過程嘅錄影同 / 或關鍵特寫圖片。最少 1 個檔案。每個檔案最大 50MB。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Hidden real file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={onEvidenceSelected}
              />
              {/* Upload trigger */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-32 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-2 text-sm text-neutral-text-muted transition hover:border-authBrand-500 hover:bg-surface-2 hover:text-authBrand-500"
              >
                {isMeetup ? (
                  <>
                    <Video className="h-6 w-6" />
                    <span>面交錄影檔 + 關鍵圖片（撳開啟相機 / 揀檔案）</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span>撳呢度揀鑑定影片 / 圖片（支援 .mp4 .mov .jpg .png）</span>
                  </>
                )}
              </button>

              {/* Selected files list */}
              {evidence.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-text-hint">
                    已揀檔案（{evidence.length}）· 已上載 {evidenceCommittedCount} 個
                  </p>
                  <div className="space-y-1.5">
                    {evidence.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 rounded-lg border border-line bg-white p-2"
                      >
                        {ev.isVideo ? (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-neutral-text-muted">
                            <FileVideo className="h-5 w-5" />
                          </div>
                        ) : ev.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ev.previewUrl}
                            alt={ev.file.name}
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-neutral-text-muted">
                            <FileImage className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-neutral-text">{ev.file.name}</p>
                          <p className="text-[10px] text-neutral-text-hint">
                            {ev.isVideo ? '影片' : '圖片'} · {(ev.file.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                          {ev.status === 'uploading' && (
                            <p className="text-[10px] text-authBrand-500">上載中…</p>
                          )}
                          {ev.status === 'done' && (
                            <p className="flex items-center gap-1 text-[10px] text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> 已上載
                            </p>
                          )}
                          {ev.status === 'error' && (
                            <p className="text-[10px] text-red-600">{ev.error ?? '上載失敗'}</p>
                          )}
                        </div>
                        {ev.status !== 'done' && (
                          <button
                            type="button"
                            onClick={() => removeEvidence(ev.id)}
                            disabled={ev.status === 'uploading'}
                            className="shrink-0 rounded p-1 text-neutral-text-hint hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            aria-label="移除"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclosure: backend storage backlog */}
              <p className="rounded bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-text-muted">
                ⓘ 證據檔案目前只儲存喺你嘅瀏覽器，<strong>提交鑑定前唔好離開呢頁</strong>。上傳到平台儲存（永久存檔／爭議仲裁）係 backlog feature。
              </p>

              {is3Way && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  三方面交：請確保買家、賣家同時在場。鑑定結論需向雙方當面宣讀後才提交。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. 鑑定 Checklist</CardTitle>
              <p className="mt-1 text-xs text-neutral-text-muted">
                逐項對比實物與賣家描述。FAILED / INCONCLUSIVE 時可以喺右邊 flag 「與描述不符」嘅項目。
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {checklist.map((item) => (
                <div
                  key={item}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-2 ${
                    mismatchFlags[item] ? 'border-red-200 bg-red-50/50' : 'border-line'
                  }`}
                >
                  <label className="flex flex-1 items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-line-2"
                      checked={!!checked[item]}
                      onChange={(e) => onCheckChange(item, e.target.checked)}
                    />
                    {item}
                  </label>
                  {(verdict === 'FAILED' || verdict === 'INCONCLUSIVE') && (
                    <button
                      type="button"
                      onClick={() => onMismatchToggle(item)}
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                        mismatchFlags[item]
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-surface-2 text-neutral-text-muted hover:bg-red-100 hover:text-red-700'
                      }`}
                      title="標記此項與賣家描述不符"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      不符
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. 結論</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={verdict === 'PASSED' ? 'primary' : 'outline'}
                  onClick={() => setVerdict('PASSED')}
                >
                  ✓ 真品 Authentic
                </Button>
                <Button
                  variant={verdict === 'FAILED' ? 'danger' : 'outline'}
                  onClick={() => setVerdict('FAILED')}
                >
                  ✗ 假貨 Counterfeit
                </Button>
                <Button
                  variant={verdict === 'INCONCLUSIVE' ? 'primary' : 'outline'}
                  onClick={() => { setVerdict('INCONCLUSIVE'); setInconclusiveOpen(true); }}
                >
                  無法判定
                </Button>
              </div>

              {/* Mismatch hint */}
              {(verdict === 'FAILED' || verdict === 'INCONCLUSIVE') && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <p className="font-medium">建議：喺上面 Checklist 每項旁邊按「不符」標記同賣家描述唔吻合嘅地方。</p>
                  <p className="mt-0.5 text-red-700">
                    系統會自動將你標記咗嘅項目寫入下面 Notes，方便日後爭議仲裁時引用。
                  </p>
                </div>
              )}

              {/* INCONCLUSIVE 後果說明 */}
              {verdict === 'INCONCLUSIVE' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-sm font-medium text-amber-800"
                    onClick={() => setInconclusiveOpen((o) => !o)}
                  >
                    ⚠ 「無法判定」後果說明
                    <ChevronDown className={`h-4 w-4 transition ${inconclusiveOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {inconclusiveOpen && (
                    <div className="mt-2 space-y-1.5 text-xs text-amber-700">
                      <p>選擇「無法判定」代表你無法對這件貨品作出明確鑑定結論。後續處理：</p>
                      <ul className="list-inside list-disc space-y-1 pl-1">
                        <li>平台將通知買賣雙方，訂單會進入退款流程</li>
                        <li>買家將獲<strong>全額退款</strong>（如使用線上託管）</li>
                        <li>貨品由賣家安排取回</li>
                        <li>你的鑑定費將按合約釐定是否適用 — 視乎具體情況可能部分收取或豁免</li>
                      </ul>
                      <p className="pt-1 font-medium">如有疑問，建議先聯絡平台再提交。</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="notes">補充說明（買家可見）</Label>
                <textarea
                  id="notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line-2 px-3 py-2 text-sm"
                  placeholder="任何需向買家披露的細節…"
                />
                <p className="mt-1 text-[10px] text-neutral-text-hint">
                  FAILED / INCONCLUSIVE 時，標記咗「不符」嘅 checklist 項目會自動寫入呢度。可自由 edit 補充說明。
                </p>
              </div>

              {/* Ack v2 (D): 3WAY PASSED = 即場完成 + 放款 — 交收確認 checkbox */}
              {order.deliveryMethod === 'MEETUP_3WAY' && verdict === 'PASSED' && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-authBrand-200 bg-authBrand-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={handedOver}
                    onChange={(e) => setHandedOver(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-authBrand-500"
                  />
                  <span className="text-xs leading-relaxed text-ink">
                    <b>貨物已當面交予買家</b> — 三方同場，提交 PASSED 後訂單即完成並放款（買家唔使再確認）
                  </span>
                </label>
              )}

              <div>
                <Label htmlFor="sign">電子簽名（輸入你的全名以確認）</Label>
                <Input
                  id="sign"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="鑑定師全名"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-neutral-text-muted">
                  簽名提交後，本鑑定結果將具法律效力。鑑定錯誤將按你的合約 + E&O 保險條款追償。
                </p>
              </div>

              {submitError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
              )}

              <Button disabled={busy} onClick={onSubmitVerdict}>
                <FileSignature className="mr-2 h-4 w-4" />
                {busy ? '提交中…' : '簽名並提交鑑定結果'}
              </Button>

              {/* Irreversible verdict — confirm dialog gates the submit so a
                  stray click can't release escrow / refund. Founder ruling
                  2026-06-24: critical actions need a styled confirm step. */}
              <ConfirmDialog
                open={verdictConfirmOpen}
                onCancel={() => setVerdictConfirmOpen(false)}
                onConfirm={() => { doSubmitVerdict(); }}
                title={
                  verdict === 'PASSED' ? '確認提交：真品（PASSED）'
                  : verdict === 'FAILED' ? '確認提交：假貨（FAILED）'
                  : '確認提交：無法判定（INCONCLUSIVE）'
                }
                description={
                  <div className="space-y-2">
                    <p>
                      {verdict === 'PASSED'
                        ? <>提交後將通知買家到場取貨，escrow 將於買家確認收貨後釋放畀賣家。</>
                        : verdict === 'FAILED'
                        ? <>提交後買家將獲<strong className="text-red-700">全額退款</strong>，貨品退回賣家。</>
                        : <>提交後訂單轉入爭議流程，平台會介入處理。</>}
                    </p>
                    <p className="text-xs text-neutral-text-muted">
                      訂單貨價：<span className="font-medium text-neutral-text">{formatHKD(order.salePriceHKD ?? 0)}</span>
                      ｜ 鑑定費：<span className="font-medium text-neutral-text">{formatHKD(order.authFeeHKD)}</span>
                    </p>
                    <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      ⚠️ 鑑定結果提交後<strong>不可撤回</strong>。鑑定錯誤將按合約 + E&O 保險條款追償。
                    </p>
                  </div>
                }
                confirmLabel={
                  verdict === 'PASSED' ? '我確認，提交真品結果'
                  : verdict === 'FAILED' ? '我確認，提交假貨結果'
                  : '我確認，提交無法判定'
                }
                cancelLabel="再睇下"
                severity={verdict === 'FAILED' ? 'danger' : 'warning'}
                busy={busy}
              />
            </CardContent>
          </Card>

          {/* Dispute confirm — replaces window.prompt. Requires reason so the
              dispute log always carries a justification from the authenticator. */}
          <ConfirmDialog
            open={disputeConfirmOpen}
            onCancel={() => setDisputeConfirmOpen(false)}
            onConfirm={(reason) => doDispute(reason)}
            title="提出爭議"
            description={
              <p>
                提出後訂單會凍結，平台會介入處理。請清楚簡述原因（將寫入 audit log，買賣雙方可見）。
              </p>
            }
            confirmLabel="提交爭議"
            cancelLabel="取消"
            severity="warning"
            busy={busy}
            requireReason
            reasonLabel="爭議原因"
            reasonPlaceholder="例：商品同 listing 描述不符；證據相發現偽造痕跡…"
          />
        </>
      )}
    </div>
  );

  const statusPillCls = isCompleted
    ? order.authVerdict === 'PASSED'
      ? 'bg-verdict-pass-soft text-verdict-pass'
      : order.authVerdict === 'FAILED'
      ? 'bg-verdict-fail-soft text-verdict-fail'
      : 'bg-verdict-incon-soft text-verdict-incon'
    : 'bg-authBrand-soft text-authBrand-600';

  return (
    <>
      <AuthTopline
        title="鑑定工作台"
        subtitle={
          <span>
            <Link href="/inbox" className="font-semibold text-authBrand-500 hover:text-authBrand-600">
              收件匣
            </Link>
            {' / 訂單 '}
            <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
          </span>
        }
        action={
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${statusPillCls}`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
            <button
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-text shadow-auth-sh1 transition hover:border-authBrand-500 hover:text-authBrand-500"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              訊息買賣雙方
            </button>
          </div>
        }
      />
      <AuthContent>
      {/* Delivery / location meta strip */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {order.deliveryMethod && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[12px] text-neutral-text-muted">
            {isMeetup ? <Handshake className="h-3 w-3" /> : <Package className="h-3 w-3" />}
            {DELIVERY_LABEL[order.deliveryMethod] ?? order.deliveryMethod}
          </span>
        )}
        {order.meetupLocation && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[12px] text-neutral-text-muted">
            <MapPin className="h-3 w-3" /> {order.meetupLocation}
          </span>
        )}
        <span className="ml-auto text-[13px] text-neutral-text-muted">
          鑑定費：<span className="font-bold text-verdict-pass">{formatHKD(order.authFeeHKD)}</span>
        </span>
      </div>

      {chatOpen && me && order && (
        <ConversationDrawer
          orderId={orderId}
          currentUserId={me.id}
          counterpartyName={`${order.buyer?.displayName ?? '買家'} / ${order.seller?.displayName ?? '賣家'}`}
          listingTitle={order.listing?.title ?? ''}
          listingLinkId={order.listing?.id}
          listingImage={order.listing?.images?.[0]}
          counterpartySellerId={order.seller?.id}
          counterpartyBuyerId={order.buyer?.id}
          orderStatus={order.status}
          conversationType="order"
          onClose={() => setChatOpen(false)}
          readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(order.status)}
          readOnlyReason={
            order.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
            : order.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
            : order.status === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
            : undefined
          }
        />
      )}

      {/* Two-column layout: context (Zone A) | working (Zone B) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="w-full">{contextPanel}</div>
        <div className="w-full">{workingPanel}</div>
      </div>
      </AuthContent>
    </>
  );
}
