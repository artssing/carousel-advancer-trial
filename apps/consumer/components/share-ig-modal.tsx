'use client';

/**
 * Share-to-Instagram wizard (MVP — docs/proposals/ig-share-proposal.md).
 *
 * 3-step guided flow so a casual seller gets a polished branded asset with
 * zero design effort: ① pick photo ② pick format (Story/Feed) + template
 * ③ preview + share. Compositing is pure client-side HTML5 canvas — no
 * external service, no per-use cost.
 *
 * Share paths:
 *  - Mobile: navigator.share({ files }) opens the native share sheet (IG
 *    listed if installed). Caption is pre-copied to clipboard because IG's
 *    share target drops text.
 *  - Desktop / unsupported: download PNG + copy caption buttons.
 *
 * Platform-neutrality (CLAUDE.md core legal posture): the asset carries a
 * small "via CERTI·FINE" corner mark — attribution, never a guarantee. No
 * "平台保證/認證" wording anywhere; condition is labelled 賣家申報.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Share2, Download, Copy, Check, ChevronLeft } from 'lucide-react';
import { formatHKD, conditionLabel } from '@authentik/utils';

export interface ShareListing {
  id: string;
  title: string;
  priceHKD: number;
  images: string[];
  condition?: string | null;
  brand?: string | null;
}

type Format = 'story' | 'feed';
type Template = 'photo' | 'clean';

const FORMAT_DIMS: Record<Format, { w: number; h: number; label: string; hint: string }> = {
  story: { w: 1080, h: 1920, label: 'Story', hint: '可加連結貼圖，導流最好' },
  feed:  { w: 1080, h: 1080, label: 'Feed 帖文', hint: '方形帖文（caption 冇得 click link）' },
};

const NAVY = '#0a2540';
const INK = '#101828';

function buildCaption(l: ShareListing, link: string): string {
  const lines = [l.title, formatHKD(l.priceHKD)];
  const cond = conditionLabel(l.condition as any);
  if (cond) lines.push(`成色：${cond}（賣家申報）`);
  lines.push(`睇多啲：${link}`);
  const brandTag = l.brand ? ` #${l.brand.replace(/\s+/g, '')}` : '';
  lines.push(`#Certifine #香港二手${brandTag}`);
  return lines.join('\n');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // canvas export needs untainted source
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** drawImage with cover-fit crop into the given rect. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

type CellRect = { x: number; y: number; w: number; h: number };

/**
 * Collage layouts（founder 2026-07-12，Coordinator design）— auto-layout by
 * photo count，fixed lookup 唔係自由編輯器（casual seller 零 design 功夫）：
 *   1 張 = 全區（原有行為）
 *   2 張 = 長軸 50/50（Story 上下 / Feed 左右）
 *   3 張 = hero（#1 佔左 62%）+ 右邊兩張上下
 *   4 張 = 2×2 equal grid（4 張做 hero 會令 thumbnail 太細）
 * Cap 4 張：1080px 下 5 格會令單格 <340px，唔清。
 */
function collageCells(count: number, r: CellRect): CellRect[] {
  const G = 6; // gutter px（用 template 背景色填）
  if (count <= 1) return [r];
  if (count === 2) {
    if (r.h >= r.w) {
      const h = (r.h - G) / 2;
      return [
        { x: r.x, y: r.y, w: r.w, h },
        { x: r.x, y: r.y + h + G, w: r.w, h },
      ];
    }
    const w = (r.w - G) / 2;
    return [
      { x: r.x, y: r.y, w, h: r.h },
      { x: r.x + w + G, y: r.y, w, h: r.h },
    ];
  }
  if (count === 3) {
    const heroW = r.w * 0.62;
    const sideX = r.x + heroW + G;
    const sideW = r.w - heroW - G;
    const sideH = (r.h - G) / 2;
    return [
      { x: r.x, y: r.y, w: heroW, h: r.h },
      { x: sideX, y: r.y, w: sideW, h: sideH },
      { x: sideX, y: r.y + sideH + G, w: sideW, h: sideH },
    ];
  }
  // 4
  const w = (r.w - G) / 2;
  const h = (r.h - G) / 2;
  return [
    { x: r.x, y: r.y, w, h },
    { x: r.x + w + G, y: r.y, w, h },
    { x: r.x, y: r.y + h + G, w, h },
    { x: r.x + w + G, y: r.y + h + G, w, h },
  ];
}

const MAX_COLLAGE_PHOTOS = 4;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (ctx.measureText(cur + ch).width > maxWidth) {
      lines.push(cur);
      cur = ch;
      if (lines.length === maxLines) break;
    } else {
      cur += ch;
    }
  }
  if (lines.length < maxLines && cur) {
    lines.push(cur);
  } else if (lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? '';
    lines[maxLines - 1] = last.slice(0, -1) + '…';
  }
  return lines;
}

async function composite(l: ShareListing, photos: string[], format: Format, template: Template): Promise<HTMLCanvasElement> {
  const { w, h } = FORMAT_DIMS[format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgs = await Promise.all(photos.slice(0, MAX_COLLAGE_PHOTOS).map(loadImage));
  const cond = conditionLabel(l.condition as any);
  // Collage：template 繼續擁有 info bar / 留白；layout 只負責細分 photo 區。
  const drawGrid = (area: CellRect, bg: string) => {
    if (imgs.length > 1) { ctx.fillStyle = bg; ctx.fillRect(area.x, area.y, area.w, area.h); }
    const cells = collageCells(imgs.length, area);
    cells.forEach((c, i) => { if (imgs[i]) drawCover(ctx, imgs[i]!, c.x, c.y, c.w, c.h); });
  };

  if (template === 'photo') {
    // 大相 + 底部資訊帶
    const barH = format === 'story' ? 380 : 300;
    drawGrid({ x: 0, y: 0, w, h: h - barH }, NAVY);
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 52px "Noto Sans HK", sans-serif';
    const titleLines = wrapText(ctx, l.title, w - 140, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, 70, h - barH + 95 + i * 68));
    ctx.font = '800 72px "Noto Sans HK", sans-serif';
    ctx.fillStyle = '#7ee2b8';
    ctx.fillText(formatHKD(l.priceHKD), 70, h - 80);
    if (cond) {
      ctx.font = '400 36px "Noto Sans HK", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      const priceW = ctx.measureText(formatHKD(l.priceHKD)).width;
      ctx.fillText(`成色：${cond}（賣家申報）`, 70 + priceW + 260, h - 80);
    }
    ctx.font = '600 30px Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.textAlign = 'right';
    ctx.fillText('via CERTI·FINE', w - 60, h - barH + 70);
    ctx.textAlign = 'left';
  } else {
    // 簡約白底
    ctx.fillStyle = '#faf9f7';
    ctx.fillRect(0, 0, w, h);
    const margin = 90;
    const photoH = format === 'story' ? h - 640 : h - 440;
    drawGrid({ x: margin, y: margin, w: w - margin * 2, h: photoH }, '#faf9f7');
    ctx.fillStyle = INK;
    ctx.font = '600 54px "Noto Sans HK", sans-serif';
    const titleLines = wrapText(ctx, l.title, w - margin * 2, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, margin, margin + photoH + 110 + i * 70));
    ctx.font = '800 76px "Noto Sans HK", sans-serif';
    ctx.fillStyle = NAVY;
    ctx.fillText(formatHKD(l.priceHKD), margin, h - 130);
    if (cond) {
      ctx.font = '400 34px "Noto Sans HK", sans-serif';
      ctx.fillStyle = '#667085';
      ctx.fillText(`成色：${cond}（賣家申報）`, margin, h - 70);
    }
    ctx.font = '600 30px Georgia, serif';
    ctx.fillStyle = '#98a2b3';
    ctx.textAlign = 'right';
    ctx.fillText('via CERTI·FINE', w - margin, h - 70);
    ctx.textAlign = 'left';
  }
  return canvas;
}

export function ShareIgModal({ listing, onClose }: { listing: ShareListing; onClose: () => void }) {
  const [step, setStep] = useState(1);
  // Multi-select collage（founder 2026-07-12）：順序 = 排位，#1 = 主相。Cap 4。
  const [photos, setPhotos] = useState<string[]>(listing.images[0] ? [listing.images[0]] : []);
  const [format, setFormat] = useState<Format>('story');
  const [template, setTemplate] = useState<Template>('photo');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const link = useMemo(
    () => `${typeof window !== 'undefined' ? window.location.origin : ''}/listing/${listing.id}?utm_source=ig&utm_medium=share`,
    [listing.id],
  );
  const caption = useMemo(() => buildCaption(listing, link), [listing, link]);
  const canWebShare = typeof navigator !== 'undefined' && !!navigator.canShare;

  // Re-render preview whenever step 3 inputs settle.
  useEffect(() => {
    if (step !== 3) return;
    let stale = false;
    setRendering(true);
    setRenderError(false);
    composite(listing, photos, format, template)
      .then((canvas) => {
        if (stale) return;
        canvasRef.current = canvas;
        setPreviewUrl(canvas.toDataURL('image/png'));
      })
      .catch(() => { if (!stale) setRenderError(true); })
      .finally(() => { if (!stale) setRendering(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, photos.join(','), format, template, listing]);

  async function copyCaption() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.download = `authentik-${listing.id}.png`;
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  }

  async function share() {
    if (!canvasRef.current) return;
    await copyCaption();
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `authentik-${listing.id}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch { /* user cancelled share sheet */ }
      } else {
        download();
      }
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl bg-white p-6 shadow-sh3 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} aria-label="上一步" className="rounded-full p-1 text-neutral-text-muted hover:bg-surface-2">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h3 className="font-display-serif text-[19px] font-bold text-ink">分享去 Instagram</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="rounded-full p-1 text-neutral-text-muted hover:bg-surface-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mt-3 flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-brand-600' : 'bg-surface-2'}`} />
          ))}
        </div>
        <div className="mt-2 text-[12px] text-neutral-text-hint">
          {step === 1 && '① 揀相（可多選，最多 4 張合成一張）'}
          {step === 2 && '② 揀格式同樣式'}
          {step === 3 && '③ 預覽 + 分享'}
        </div>

        {/* Step 1 — photos multi-select（tap 順序 = 排位；再 tap 取消；#1 = 主相） */}
        {step === 1 && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {listing.images.map((src) => {
                const idx = photos.indexOf(src);
                const selected = idx >= 0;
                const atCap = photos.length >= MAX_COLLAGE_PHOTOS;
                return (
                  <button
                    key={src}
                    type="button"
                    disabled={!selected && atCap}
                    onClick={() =>
                      setPhotos((prev) =>
                        prev.includes(src) ? prev.filter((p) => p !== src) : [...prev, src],
                      )
                    }
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 disabled:opacity-40 ${selected ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line hover:border-neutral-text-hint'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                        {photos.length > 1 ? idx + 1 : <Check className="h-3 w-3" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-neutral-text-hint">
              {photos.length > 1
                ? `已揀 ${photos.length} 張 — 第 1 張做主相，會自動合成一張`
                : '揀多過一張會自動合成 collage'}
            </p>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={photos.length === 0}
              className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-sh2 hover:bg-brand-700 disabled:opacity-50"
            >
              下一步
            </button>
          </>
        )}

        {/* Step 2 — format + template */}
        {step === 2 && (
          <>
            {/* 兩組都必選（founder 2026-07-12）— 加 section label + 剔號令狀態清晰 */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">格式</span>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] text-brand-700">✓ {FORMAT_DIMS[format].label}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {(Object.keys(FORMAT_DIMS) as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-xl border-2 p-4 text-left ${format === f ? 'border-brand-600 bg-verify-soft' : 'border-line hover:border-neutral-text-hint'}`}
                >
                  <div className="text-sm font-bold text-ink">{FORMAT_DIMS[f].label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-neutral-text-muted">{FORMAT_DIMS[f].hint}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">樣式</span>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] text-brand-700">✓ {template === 'photo' ? '大相 + 價錢帶' : '簡約白底'}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {([['photo', '大相 + 價錢帶', '相片做主角，底部深藍資訊帶'], ['clean', '簡約白底', '白底留白，襯淺色相']] as [Template, string, string][]).map(([t, label, hint]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTemplate(t)}
                  className={`rounded-xl border-2 p-4 text-left ${template === t ? 'border-brand-600 bg-verify-soft' : 'border-line hover:border-neutral-text-hint'}`}
                >
                  <div className="text-sm font-bold text-ink">{label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-neutral-text-muted">{hint}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-5 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-sh2 hover:bg-brand-700"
            >
              生成預覽
            </button>
          </>
        )}

        {/* Step 3 — preview + share */}
        {step === 3 && (
          <>
            <div className={`mx-auto mt-4 overflow-hidden rounded-xl border border-line bg-surface-2 ${format === 'story' ? 'max-w-[240px]' : 'max-w-[320px]'}`}>
              {rendering ? (
                <div className={`animate-pulse bg-surface-2 ${format === 'story' ? 'aspect-[9/16]' : 'aspect-square'}`} />
              ) : renderError ? (
                <div className="p-6 text-center text-xs text-danger">生成失敗 — 相片來源唔支援跨域讀取，試下揀第二張相。</div>
              ) : previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="分享預覽" className="w-full" />
              ) : null}
            </div>

            {/* Caption preview */}
            <div className="mt-4 rounded-lg border border-line bg-surface-1 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-text-hint">Caption（撳分享時自動複製）</div>
              <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-neutral-text">{caption}</pre>
            </div>

            {/* IG steps guide */}
            <div className="mt-3 rounded-lg bg-verify-soft px-3 py-2.5 text-[12px] leading-relaxed text-brand-800">
              出 Story 貼士：① share sheet 揀 Instagram → ② 喺 Story 編輯器撳貼圖加「連結」貼住商品 link → ③ 分享
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {canWebShare && (
                <button type="button" onClick={share} disabled={rendering || renderError} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-sh2 hover:bg-brand-700 disabled:opacity-50">
                  <Share2 className="h-4 w-4" /> 分享（已複製 caption）
                </button>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={download} disabled={rendering || renderError} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2 disabled:opacity-50">
                  <Download className="h-4 w-4" /> 下載圖片
                </button>
                <button type="button" onClick={copyCaption} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2">
                  {copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />} {copied ? '已複製' : '複製文案'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
