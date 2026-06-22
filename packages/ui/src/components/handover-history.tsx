import * as React from 'react';
import { cn } from '../lib/cn';

/** Single round of MEETUP_AUTH Phase A handover photos (audit trail entry). */
export type HandoverRound = {
  round: number;
  photos: string[];
  uploadedAt: string;
  ackedAt?: string;
  rejectedAt?: string;
  rejectionPresets?: string[];
  rejectionComment?: string;
};

export interface HandoverHistoryTimelineProps {
  history: HandoverRound[];
  /** Max allowed re-photo rounds — for "X/MAX" labels. */
  maxRePhoto: number;
  /** Hide round numbers if only 1 round and not yet rejected (cleaner UI for first-time). */
  collapseSingleRound?: boolean;
  className?: string;
}

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-HK', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

/**
 * Transparent audit-trail of every handover photo round + seller's reaction.
 * Shared between consumer order detail page + authenticator workbench so all
 * 3 parties see identical information.
 *
 * Per CLAUDE.md lesson #11: every visible UI element has real semantics — no
 * placeholder rounds, no fake data.
 */
export function HandoverHistoryTimeline({
  history,
  maxRePhoto,
  collapseSingleRound = false,
  className,
}: HandoverHistoryTimelineProps) {
  if (!history.length) {
    return (
      <p className={cn('text-xs text-slate-500', className)}>
        鑑定師仲未上載接收相片。
      </p>
    );
  }

  // Single-round + not rejected → simpler "just photos" view
  if (collapseSingleRound && history.length === 1 && !history[0]?.rejectedAt) {
    const r = history[0]!;
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs text-slate-500">鑑定師接收相片 · {fmtTime(r.uploadedAt)}</p>
        <PhotoStrip photos={r.photos} />
      </div>
    );
  }

  return (
    <ol className={cn('space-y-3', className)}>
      {history.map((r, idx) => {
        const isLatest = idx === history.length - 1;
        const status: 'acked' | 'rejected' | 'pending' = r.ackedAt
          ? 'acked'
          : r.rejectedAt
            ? 'rejected'
            : 'pending';
        const borderColor =
          status === 'acked' ? 'border-emerald-300 bg-emerald-50'
          : status === 'rejected' ? 'border-rose-300 bg-rose-50'
          : 'border-amber-300 bg-amber-50';
        return (
          <li
            key={r.round}
            className={cn('rounded-lg border p-3', borderColor)}
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">
                {r.round === 1 ? '第 1 次（首次接收）' : `第 ${r.round} 次（重拍）`}
                {isLatest && status === 'pending' && (
                  <span className="ml-2 inline-flex items-center rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    最新 · 等賣家確認
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                上載 {fmtTime(r.uploadedAt)}
              </p>
            </div>
            <PhotoStrip photos={r.photos} />
            {status === 'acked' && (
              <p className="mt-2 text-xs text-emerald-700">
                ✓ 賣家已確認 · {r.ackedAt ? fmtTime(r.ackedAt) : ''}
              </p>
            )}
            {status === 'rejected' && (
              <div className="mt-2 rounded border border-rose-200 bg-white/60 p-2 text-xs">
                <p className="font-medium text-rose-800">
                  ✗ 賣家拒絕 · {r.rejectedAt ? fmtTime(r.rejectedAt) : ''}
                  <span className="ml-1 text-[10px] text-rose-600">
                    （已用 {r.round}/{maxRePhoto + 1} 次嘗試）
                  </span>
                </p>
                {r.rejectionPresets && r.rejectionPresets.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.rejectionPresets.map((p) => (
                      <span
                        key={p}
                        className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                {r.rejectionComment && (
                  <p className="mt-1 whitespace-pre-line italic text-slate-700">
                    「{r.rejectionComment}」
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PhotoStrip({ photos }: { photos: string[] }) {
  if (!photos.length) {
    return <p className="text-[11px] italic text-slate-400">（無相片）</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((src, i) => (
        <a
          key={i}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-100 transition hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`relay ${i + 1}`}
            className="h-full w-full object-cover"
          />
        </a>
      ))}
    </div>
  );
}

/** Preset rejection tags shown to seller when requesting re-photo. */
export const RE_PHOTO_PRESETS = [
  '相片唔夠清晰',
  '角度不足，睇唔到關鍵位置',
  '光線太暗 / 反光',
  '漏拍商品瑕疵',
  '漏拍配件 / 附件',
  '商品擺位錯誤',
] as const;
