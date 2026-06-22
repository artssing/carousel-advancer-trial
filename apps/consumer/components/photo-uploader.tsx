'use client';

/**
 * PhotoUploader — multi-file image picker storing base64 data URLs.
 *
 * Used in dual-ack flows (MEETUP_AUTH + SHIP) for handover evidence.
 * Min 3 photos enforced on submit.
 */
import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

const MAX_PHOTOS = 8;
// 50MB sanity ceiling — anything bigger is almost certainly accidental
// (4K video frame export etc). Phone photos 5-15MB pass through compression.
const HARD_INPUT_MAX = 50 * 1024 * 1024;
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.82;

/** Compress an image File → JPEG base64 data URL (resize + quality). */
async function compressImageToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取相片失敗'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('無法解碼呢張相'));
      img.onload = () => {
        const { width, height } = img;
        const ratio = Math.min(1, COMPRESS_MAX_DIM / Math.max(width, height));
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context 不支援'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', COMPRESS_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface Props {
  /** Existing photos (data URLs) to display read-only above the uploader */
  existingPhotos?: string[];
  /** Local newly-added photos in this session */
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Minimum required count for the action that consumes these photos */
  minRequired?: number;
  /** Label shown above uploader */
  label?: string;
  /** Hint shown below uploader */
  hint?: string;
  disabled?: boolean;
}

export function PhotoUploader({
  existingPhotos = [],
  photos,
  onChange,
  minRequired = 3,
  label,
  hint,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    let oversize = 0;
    for (const f of files) {
      if (f.size > HARD_INPUT_MAX) { oversize++; continue; }
      valid.push(f);
    }
    if (oversize > 0) setError(`已略過 ${oversize} 張超過 50MB 嘅相`);
    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = valid.slice(0, remaining);
    if (toAdd.length === 0) {
      e.target.value = '';
      return;
    }
    try {
      // Compress each (resize + JPEG quality) — handles iPhone HEIC / 10MB shots.
      const dataUrls = await Promise.all(toAdd.map(compressImageToDataURL));
      onChange([...photos, ...dataUrls]);
    } catch (err: any) {
      setError(err?.message ?? '相片處理失敗');
    }
    e.target.value = '';
  }

  function remove(i: number) {
    onChange(photos.filter((_, idx) => idx !== i));
  }

  const total = existingPhotos.length + photos.length;
  const isShort = total < minRequired;

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-slate-700">{label}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFilesSelected}
        disabled={disabled}
      />
      <div className="grid grid-cols-4 gap-2">
        {existingPhotos.map((src, i) => (
          <div key={`exist-${i}`} className="relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`existing ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1 py-0.5 text-center text-[9px] text-white">已上載</div>
          </div>
        ))}
        {photos.map((src, i) => (
          <div key={`new-${i}`} className="relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`new ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {total < MAX_PHOTOS && !disabled && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[10px]">加相</span>
          </button>
        )}
      </div>
      <p className={`text-[10px] ${isShort ? 'text-red-600' : 'text-slate-400'}`}>
        {hint ?? `已上載 ${total} / ${MAX_PHOTOS} 張 · 最少 ${minRequired} 張`}
      </p>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
