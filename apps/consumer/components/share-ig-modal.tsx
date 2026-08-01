'use client';

/**
 * Social-share wizard (MVP — docs/proposals/ig-share-proposal.md).
 *
 * 3-step guided flow so a casual seller gets a polished branded asset with
 * zero design effort: ① pick photos ② pick format (Story/Feed) + template
 * ③ preview + share. Compositing is pure client-side HTML5 canvas — no
 * external service, no per-use cost.
 *
 * Share paths:
 *  - Image + caption (mobile): navigator.share({ files }) opens the native
 *    share sheet (IG listed if installed). Caption is also copied to the
 *    clipboard because IG's share target drops text.
 *  - Link (desktop + mobile): a dedicated 1.91:1 OG card is generated and
 *    uploaded on click, then WhatsApp / Facebook unfurl it from /s/:id.
 *  - Fallback: download PNG + copy caption.
 *
 * Platform-neutrality (CLAUDE.md core legal posture): the asset carries a
 * small "via CERTI·FINE" corner mark — attribution, never a guarantee. No
 * "平台保證/認證" wording anywhere; condition is labelled 賣家申報.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Share2, Download, Copy, Check, ChevronLeft } from 'lucide-react';
import { formatHKD, conditionLabel, type ShareChannel } from '@authentik/utils';
import { uploadSharePreview } from '@/lib/api';
import { track } from '@/lib/analytics';

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

const NAVY = '#0a2540'; // default info-bar background
const INK = '#101828';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Darken an average RGB to a deep, still-tinted background (white text stays
 *  legible). Keeps the photo's hue but pins the brightest channel to ~64/255. */
function darkenToBg(r: number, g: number, b: number): string {
  const mx = Math.max(r, g, b, 1);
  const scale = 64 / mx;
  return `#${hex2(r * scale)}${hex2(g * scale)}${hex2(b * scale)}`;
}

/** Sample the hero photo's dominant colours → a few deep-tone background
 *  candidates so the seller isn't stuck with navy. NAVY stays first (default). */
function extractPalette(img: HTMLImageElement): string[] {
  const S = 32;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const cx = c.getContext('2d')!;
  cx.drawImage(img, 0, 0, S, S);
  const { data } = cx.getImageData(0, 0, S, S);
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 200) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 245 && mn > 245) continue; // skip near-white
    if (mx < 14) continue;              // skip near-black
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`; // coarse 3-bit bins
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const top = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((e) => darkenToBg(e.r / e.n, e.g / e.n, e.b / e.n));
  const out = [NAVY];
  for (const col of top) if (!out.includes(col)) out.push(col);
  return out.slice(0, 4);
}

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

/** Small top-right corner attribution mark (never overlaps the title bar). */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, onLight: boolean) {
  ctx.save();
  ctx.font = '600 26px Georgia, serif';
  ctx.textAlign = 'right';
  if (onLight) {
    ctx.fillStyle = '#98a2b3';
  } else {
    // white over photo — add a soft shadow so it stays legible on bright images
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 8;
  }
  ctx.fillText('via CERTI·FINE', w - 44, 58);
  ctx.restore();
  ctx.textAlign = 'left';
}

async function composite(l: ShareListing, photos: string[], format: Format, template: Template, bgColor: string): Promise<HTMLCanvasElement> {
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
    drawGrid({ x: 0, y: 0, w, h: h - barH }, bgColor);
    ctx.fillStyle = bgColor;
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
    drawWatermark(ctx, w, false);
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
    drawWatermark(ctx, w, true);
  }
  return canvas;
}

/** Link-preview card size. Facebook/WhatsApp/X all unfurl at ~1.91:1. */
const OG_DIMS = { w: 1200, h: 630 };

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Dedicated 1.91:1 card for LINK previews (Facebook / WhatsApp unfurls).
 *
 * The Story/Feed collage is 9:16 or 1:1 — Facebook crops that to a narrow strip
 * and cuts the whole price band off, and WhatsApp tends to drop a preview whose
 * image is far off its expected ratio. Same content, laid out for the aspect
 * the crawlers actually render. The photo goes full-bleed with a scrim so the
 * text stays legible over any image.
 */
async function compositeOg(l: ShareListing, photos: string[], bgColor: string): Promise<HTMLCanvasElement> {
  const { w, h } = OG_DIMS;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgs = await Promise.all(photos.slice(0, MAX_COLLAGE_PHOTOS).map(loadImage));

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  const cells = collageCells(imgs.length, { x: 0, y: 0, w, h });
  cells.forEach((c, i) => { if (imgs[i]) drawCover(ctx, imgs[i]!, c.x, c.y, c.w, c.h); });

  const scrimTop = h * 0.34;
  const grad = ctx.createLinearGradient(0, scrimTop, 0, h);
  grad.addColorStop(0, hexToRgba(bgColor, 0));
  grad.addColorStop(0.55, hexToRgba(bgColor, 0.86));
  grad.addColorStop(1, hexToRgba(bgColor, 0.98));
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimTop, w, h - scrimTop);

  const cond = conditionLabel(l.condition as any);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 44px "Noto Sans HK", sans-serif';
  const titleLines = wrapText(ctx, l.title, w - 112, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 56, h - 164 + i * 54);
  });
  ctx.font = '800 58px "Noto Sans HK", sans-serif';
  ctx.fillStyle = '#7ee2b8';
  const price = formatHKD(l.priceHKD);
  ctx.fillText(price, 56, h - 48);
  if (cond) {
    const priceW = ctx.measureText(price).width;
    ctx.font = '400 26px "Noto Sans HK", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.fillText(`成色：${cond}（賣家申報）`, 56 + priceW + 28, h - 52);
  }
  drawWatermark(ctx, w, false);
  return canvas;
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

export function ShareIgModal({
  listing,
  onClose,
  entry = 'listing_detail',
}: {
  listing: ShareListing;
  onClose: () => void;
  /** Which surface opened the wizard — seller (my-listings) vs buyer (listing). */
  entry?: 'listing_detail' | 'my_listings';
}) {
  const [step, setStep] = useState(1);
  // Multi-select collage（founder 2026-07-12）：順序 = 排位，#1 = 主相。Cap 4。
  const [photos, setPhotos] = useState<string[]>(listing.images[0] ? [listing.images[0]] : []);
  const [format, setFormat] = useState<Format>('story');
  const [template, setTemplate] = useState<Template>('photo');
  const [bgColor, setBgColor] = useState<string>(NAVY);
  const [palette, setPalette] = useState<string[]>([NAVY]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** /s/:id link whose og:image is the OG card. Built on first share click and
   *  cached, so sharing to a second app costs no extra upload. */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharingKind, setSharingKind] = useState<'whatsapp' | 'facebook' | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // Lock body scroll + Esc to close — same idiom as the top-nav mobile drawer
  // (docs/lessons.md: reuse the known pattern, don't invent a second one).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    track('share_modal_opened', { listing_id: listing.id, entry });
    // Open is a one-shot funnel entry — re-firing on prop identity change would
    // inflate the top of the funnel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Funnel exit — every share path lands here so channels stay comparable. */
  function trackShare(channel: ShareChannel) {
    track('share_action_completed', {
      listing_id: listing.id,
      channel,
      format,
      template,
      photo_count: photos.length,
    });
  }

  function goToStep(next: 2 | 3) {
    track('share_step_advanced', { listing_id: listing.id, step: next, photo_count: photos.length });
    setStep(next);
  }

  const link = useMemo(
    () => `${typeof window !== 'undefined' ? window.location.origin : ''}/listing/${listing.id}?utm_source=social&utm_medium=share`,
    [listing.id],
  );
  const caption = useMemo(() => buildCaption(listing, link), [listing, link]);
  const canWebShare = typeof navigator !== 'undefined' && !!navigator.canShare;

  // Derive background palette from the hero photo (photos[0]).
  const hero = photos[0];
  useEffect(() => {
    if (!hero) { setPalette([NAVY]); setBgColor(NAVY); return; }
    let stale = false;
    loadImage(hero)
      .then((img) => {
        if (stale) return;
        let pal = [NAVY];
        try { pal = extractPalette(img); } catch { pal = [NAVY]; }
        setPalette(pal);
        setBgColor((prev) => (pal.includes(prev) ? prev : NAVY));
      })
      .catch(() => { if (!stale) { setPalette([NAVY]); setBgColor(NAVY); } });
    return () => { stale = true; };
  }, [hero]);

  // Re-render preview whenever step 3 inputs settle. Nothing is uploaded here —
  // the OG card is built and stored only when the user actually clicks a share
  // button, so browsing the wizard costs no storage. Any cached share URL is
  // dropped because the card it points at no longer matches these inputs.
  useEffect(() => {
    if (step !== 3) return;
    let stale = false;
    setRendering(true);
    setRenderError(false);
    setShareUrl(null);
    composite(listing, photos, format, template, bgColor)
      .then((canvas) => {
        if (stale) return;
        canvasRef.current = canvas;
        setPreviewUrl(canvas.toDataURL('image/png'));
      })
      .catch(() => { if (!stale) setRenderError(true); })
      .finally(() => { if (!stale) setRendering(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, photos.join(','), format, template, bgColor, listing]);

  /** Never throws — clipboard access can be denied (insecure context, policy),
   *  and a failed copy must not abort the image share that awaits it. */
  async function copyCaption(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      return false;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    return true;
  }

  function download() {
    // Reuse the already-rendered data URL — re-encoding the canvas costs a
    // second full PNG serialisation for an identical result.
    const href = previewUrl ?? canvasRef.current?.toDataURL('image/png');
    if (!href) return;
    const a = document.createElement('a');
    a.download = `certifine-${listing.id}.png`;
    a.href = href;
    a.click();
  }

  // Link share (option B) — desktop + mobile. Builds + uploads the 1.91:1 OG
  // card on click (showing progress on the button), then jumps straight to the
  // share intent. Uploading lazily keeps storage to what's actually shared; the
  // result is cached so a second app costs nothing. If the upload fails (logged
  // out, offline) we still share the plain listing link, whose og:image is the
  // listing's first photo.
  async function shareLink(kind: 'whatsapp' | 'facebook') {
    if (sharingKind) return;
    const targetFor = (url: string) =>
      kind === 'whatsapp'
        ? `https://wa.me/?text=${encodeURIComponent(buildCaption(listing, url))}`
        : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

    trackShare(kind === 'whatsapp' ? 'link_whatsapp' : 'link_facebook');

    if (shareUrl) {
      const target = targetFor(shareUrl);
      const win = window.open(target, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = target;
      return;
    }

    // Open the tab NOW, inside the user gesture — a window.open issued after
    // the upload await is treated as unsolicited and gets blocked. NOT
    // 'noopener' here: that makes window.open return null, and we need the
    // handle to point the tab at the target once the OG card is stored
    // (win.opener is nulled below instead). Give it a holding message so the
    // second or so of upload doesn't look like a broken blank tab.
    const win = window.open('', '_blank');
    if (win) {
      win.opener = null;
      win.document.write(
        '<title>準備緊…</title><body style="margin:0;display:grid;place-items:center;height:100vh;font:600 15px/1.5 system-ui,sans-serif;color:#475467">準備緊分享圖片…</body>',
      );
      win.document.close();
    }
    setSharingKind(kind);
    let url = link;
    try {
      const ogCanvas = await compositeOg(listing, photos, bgColor);
      const blob: Blob | null = await new Promise((res) =>
        ogCanvas.toBlob(res, 'image/jpeg', 0.82),
      );
      if (!blob) throw new Error('OG card render failed');
      const { id } = await uploadSharePreview(blob, listing.id, 'share.jpg');
      url = `${window.location.origin}/s/${id}`;
      setShareUrl(url);
    } catch {
      /* fall back to the plain listing link — its og:image is the first photo */
    } finally {
      setSharingKind(null);
    }

    const target = targetFor(url);
    if (win && !win.closed) win.location.href = target;
    // Pop-up blocked (or the user closed the tab) — navigate here instead so
    // the share never silently does nothing.
    else window.location.href = target;
  }

  // Web Share API L2 — the ONLY web path that carries the actual generated
  // image into a specific app (WhatsApp / Facebook / Messenger / IG …). Passing
  // `text` lets apps that accept it (WhatsApp / Messenger) prefill the caption;
  // IG drops text so we also copy it to the clipboard as a fallback. Desktop
  // browsers without file-share fall back to download + copy-caption.
  async function share() {
    if (!canvasRef.current) return;
    await copyCaption();
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `certifine-${listing.id}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        trackShare('native');
        try {
          await navigator.share({ files: [file], text: caption, title: listing.title });
        } catch { /* user cancelled share sheet */ }
      } else {
        download();
        trackShare('download');
      }
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-sh3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner scroll layer — separate from the rounded/overflow-hidden shell
            so the scrollbar never squares off the right-side corners. */}
        <div className="overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} aria-label="上一步" className="rounded-full p-1 text-neutral-text-muted hover:bg-surface-2">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h3 className="font-display-serif text-[19px] font-bold text-ink">分享商品</h3>
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
              onClick={() => goToStep(2)}
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
              onClick={() => goToStep(3)}
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

            {/* Background colour picker — derived from the hero photo. Only the
                「大相 + 價錢帶」template has a coloured info bar. */}
            {template === 'photo' && palette.length > 1 && (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-text-hint">底色（跟相片配色）</div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {palette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setBgColor(c);
                        track('share_bg_color_selected', {
                          listing_id: listing.id,
                          color: c,
                          is_default: c === NAVY,
                        });
                      }}
                      aria-label={`底色 ${c}`}
                      className={`h-8 w-8 rounded-full border transition ${bgColor === c ? 'border-white ring-2 ring-brand-600' : 'border-line hover:scale-105'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Caption preview */}
            <div className="mt-4 rounded-lg border border-line bg-surface-1 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-text-hint">Caption（撳分享時自動複製）</div>
              <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-neutral-text">{caption}</pre>
            </div>

            {/* Link share (B) — desktop + mobile, one button per app */}
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-text-hint">分享連結（電腦、手機都用得）</div>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => shareLink('whatsapp')}
                  disabled={sharingKind !== null || rendering || renderError}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#25D366' }}
                >
                  {sharingKind === 'whatsapp' ? (
                    <><Spinner /> 準備緊…</>
                  ) : (
                    'WhatsApp'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => shareLink('facebook')}
                  disabled={sharingKind !== null || rendering || renderError}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#1877F2' }}
                >
                  {sharingKind === 'facebook' ? (
                    <><Spinner /> 準備緊…</>
                  ) : (
                    'Facebook'
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-text-hint">
                預覽卡會用你揀嘅相同價錢，按 Facebook / WhatsApp 嘅闊版尺寸另外生成。
              </p>
            </div>

            {/* Image+text share guide (mobile native sheet) */}
            <div className="mt-3 rounded-lg bg-verify-soft px-3 py-2.5 text-[12px] leading-relaxed text-brand-800">
              撳「分享圖片 + 文字」→ 手機分享面板揀 WhatsApp / Facebook / Messenger / IG，張圖同文字會一齊帶埋。IG Story 記得用「連結」貼圖貼住商品 link。
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {canWebShare && (
                <button type="button" onClick={share} disabled={rendering || renderError} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-sh2 hover:bg-brand-700 disabled:opacity-50">
                  <Share2 className="h-4 w-4" /> 分享圖片 + 文字
                </button>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { download(); trackShare('download'); }} disabled={rendering || renderError} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2 disabled:opacity-50">
                  <Download className="h-4 w-4" /> 下載圖片
                </button>
                <button type="button" onClick={() => { void copyCaption(); trackShare('copy_caption'); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2">
                  {copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />} {copied ? '已複製' : '複製文案'}
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
