'use client';

/**
 * Ack v2 QR 交收 scan 站（founder 2026-07-10）。
 * 鑑定師用部機鏡頭 scan 買家（取貨）/ 賣家（到店交貨）嘅 60 秒輪換 QR：
 *   scan → server 驗證 → 大確認卡（商品相 + 對方名 + 單號）→「確認交收」
 *   BUYER_PICKUP  → COMPLETED + 放款
 *   SELLER_DROPOFF → 影 ≥3 張接收相 → CUSTODY
 * 冇 fallback（founder：冇電 = 交收唔到）。
 */
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CheckCircle2, ImagePlus, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';

type ScanResult = Awaited<ReturnType<typeof api.orders.qrScan>>;

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const scanningRef = useRef(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Permission priming（founder 2026-07-14）：已授權 = 入頁即開；未授權 = 說明
  // 卡 + 「啟動相機」button，user gesture 先問（批准率最高，唔會冇上下文彈 popup）。
  const [camState, setCamState] = useState<'checking' | 'need_prompt' | 'starting' | 'active'>('checking');
  const [scanned, setScanned] = useState<{ token: string; result: ScanResult } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ── Camera + decode loop ──
  const cancelledRef = useRef(false);
  // 每次 startCamera 攞一個 sequence number；getUserMedia resolve 時如果唔係
  // 最新一次（strict-mode double-mount / 快速 re-entry），條 stream 即刻停 —
  // 防「孤兒 stream 冇人揸住，離開 /scan 相機都仲開住」（founder 2026-07-14 bug）。
  const startSeqRef = useRef(0);

  async function startCamera() {
    const seq = ++startSeqRef.current;
    try {
      setCameraError(null);
      setCamState('starting'); // 即時 feedback — 撳咗掣一定見到反應
      // 唔 support（非 HTTPS/localhost、舊 browser）— getUserMedia 直頭唔存在
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamState('need_prompt');
        setCameraError('呢個 browser 環境唔支援相機（需要 HTTPS 或 localhost）');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Stale call（unmount 咗 / 有更新嘅 call）→ 即場釋放，唔准留低孤兒 stream
      if (cancelledRef.current || seq !== startSeqRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // 換 stream 前先停舊嗰條（重複 start 唔會疊加佔用相機）
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setCamState('active');
      // <video> 喺 camState==='active' 先 mount — 呢刻 React 未 re-render，
      // ref 仲係 null，所以掛 stream 交畀下面個 effect 做（撞正就順手掛埋）。
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tick = async () => {
        if (cancelledRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState === v.HAVE_ENOUGH_DATA && scanningRef.current) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height);
          if (code?.data) {
            scanningRef.current = false;
            setScanError(null);
            try {
              const result = await api.orders.qrScan(code.data);
              setScanned({ token: code.data, result });
            } catch (e: any) {
              setScanError(e?.message ?? 'QR 碼無效');
              // resume scanning after brief pause
              setTimeout(() => { scanningRef.current = true; }, 1500);
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setCamState('need_prompt');
      // 分 error 類型出指引 — 一旦 hard-deny，browser 唔會再彈 prompt，
      // 撳幾多次都冇用，必須明確教用戶去邊度解封。
      const name = e?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(
          '相機權限被封鎖咗，browser 唔會再彈詢問視窗。請撳網址列嘅 🔒（或相機 icon）→ 允許相機，然後再撳「啟動相機」。用緊 Mac 嘅話，都要檢查 系統設定 → 私隱與保安 → 相機 有冇畀呢個 browser。',
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setCameraError('搵唔到相機裝置 — 請確認部機有相機，或者外置鏡頭插好咗。');
      } else if (name === 'NotReadableError') {
        setCameraError('相機被另一個 app 佔用緊 — 閂咗其他用緊相機嘅 app 再試。');
      } else {
        setCameraError('開唔到鏡頭 — 請喺 browser 設定畀相機權限，然後再撳「啟動相機」');
      }
    }
  }

  // Stream 掛上 <video>：video 元素 mount 完（camState active）先執行。
  useEffect(() => {
    if (camState === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camState]);

  useEffect(() => {
    cancelledRef.current = false;
    // 已授權先 auto-start；未授權/查唔到（Safari 舊版）就顯示 priming 卡，
    // 等 user gesture 先觸發 permission prompt。
    (async () => {
      try {
        const st = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (st.state === 'granted') { void startCamera(); return; }
      } catch { /* Safari 唔 support query('camera') → fall through */ }
      setCamState('need_prompt');
    })();
    return () => {
      cancelledRef.current = true;
      // Bump seq — in-flight getUserMedia 返嚟會自知 stale 而自我釋放
      startSeqRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetScan() {
    setScanned(null);
    setScanError(null);
    setPhotos([]);
    setDone(null);
    scanningRef.current = true;
  }

  function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setPhotos((prev) => [...prev, r.result as string]);
      r.readAsDataURL(f);
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  async function confirm() {
    if (!scanned) return;
    const isDropoff = scanned.result.role === 'SELLER_DROPOFF';
    if (isDropoff && photos.length < 3) return;
    setBusy(true);
    setScanError(null);
    try {
      await api.orders.qrConfirm(scanned.token, isDropoff ? photos : undefined);
      setDone(isDropoff ? '已接收件貨 — 可以開始鑑定' : '交收完成 — 訂單已放款');
    } catch (e: any) {
      setScanError(e?.message ?? '確認失敗');
    } finally {
      setBusy(false);
    }
  }

  const r = scanned?.result;
  const isDropoff = r?.role === 'SELLER_DROPOFF';

  return (
    <div className="mx-auto max-w-[560px] px-4 py-8">
      <h1 className="font-display-serif text-[24px] font-bold text-ink">QR 交收</h1>
      <p className="mt-1 text-sm text-neutral-text-muted">
        Scan 買家（取貨）或賣家（到店交貨）App 上嘅 QR 碼
      </p>

      {/* ── Done state ── */}
      {done && (
        <div className="mt-6 rounded-xl border border-verify-border bg-verify-soft p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-verdict-pass" />
          <p className="mt-2 font-bold text-ink">{done}</p>
          <button
            type="button"
            onClick={resetScan}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-authBrand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-authBrand-600"
          >
            <RefreshCw className="h-4 w-4" /> Scan 下一個
          </button>
        </div>
      )}

      {/* ── Confirmation card ── */}
      {scanned && r && !done && (
        <div className="mt-6 rounded-xl border border-authBrand-200 bg-white p-5 shadow-auth-sh1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-authBrand-700">
              {isDropoff ? '賣家到店交貨' : '買家到店取貨'} · 比對成功
            </p>
            <button type="button" onClick={resetScan} aria-label="重新 scan" className="rounded-full p-1 text-neutral-text-hint hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-4">
            {r.order.listingImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.order.listingImage} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-2 text-2xl">👜</div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{r.order.listingTitle}</p>
              <p className="mt-0.5 text-sm text-neutral-text-muted">
                {isDropoff ? '賣家' : '買家'}：<b>{r.order.counterpartyName}</b>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-text-hint">#{r.order.id.slice(0, 8)}</p>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-surface-1 px-3 py-2 text-[12px] leading-relaxed text-neutral-text-muted">
            ⚠ 請目測核對：手上件貨同上面商品相一致{isDropoff ? '' : '，同埋交收對象係本人'}。
          </p>

          {/* Drop-off: ≥3 receipt photos */}
          {isDropoff && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink">接收相片（至少 3 張）</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line-2 text-neutral-text-hint hover:border-authBrand-500 hover:text-authBrand-500"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={onPhotoPick} className="hidden" />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={busy || (isDropoff && photos.length < 3)}
            className="mt-4 w-full rounded-lg bg-authBrand-500 py-3 text-sm font-bold text-white shadow-auth-btn hover:bg-authBrand-600 disabled:opacity-50"
          >
            {busy ? '處理中…' : isDropoff ? `確認接收（${photos.length}/3 相）` : '確認交收（完成訂單 + 放款）'}
          </button>
        </div>
      )}

      {/* ── Camera viewport ── */}
      {!scanned && !done && (
        <div className="mt-6">
          {camState !== 'active' ? (
            /* Permission priming（founder 2026-07-14）：講明點解要相機，
               user gesture 先觸發 browser prompt */
            <div className="flex h-[320px] items-center justify-center rounded-xl border border-line bg-surface-1 p-6 text-center">
              <div className="max-w-xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-authBrand-500/10">
                  <Camera className="h-6 w-6 text-authBrand-500" />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">掃描 QR 需要用相機</p>
                <p className="mt-1 text-[12px] text-neutral-text-muted">
                  相機畫面只用嚟即場解碼 QR，唔會錄影或者上傳。
                </p>
                {cameraError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-verdict-fail">{cameraError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  disabled={camState === 'checking' || camState === 'starting'}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-authBrand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-authBrand-600 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {camState === 'checking' ? '檢查權限中…' : camState === 'starting' ? '開緊相機…' : '啟動相機'}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="h-[320px] w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 rounded-2xl border-2 border-white/80" />
              </div>
            </div>
          )}
          {scanError && (
            <p className="mt-3 rounded-lg border border-verdict-fail bg-red-50 px-3 py-2 text-sm text-verdict-fail">
              {scanError}
            </p>
          )}
          <p className="mt-3 text-center text-[12px] text-neutral-text-hint">
            對準對方 App 上嘅 QR 碼 · 碼每 60 秒更新，過期請對方刷新
          </p>
        </div>
      )}
    </div>
  );
}
