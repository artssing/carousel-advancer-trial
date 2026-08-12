'use client';

/**
 * Drag-to-resize for the messages sidebar.
 *
 * Founder asked for this so a long message can be read from the list. Worth
 * being honest about what it does and does not fix: widening the column makes
 * one LINE longer, it does not reveal a paragraph — the two-line clamp on the
 * preview is what actually addresses that. This is the power-user complement,
 * for people who want a permanently roomier list.
 *
 * Desktop only. On mobile the layout is not two columns at all, it is two
 * screens, so a drag handle there would be a target that does nothing.
 *
 * The width is stored per portal in localStorage rather than on the server:
 * it is a per-device display preference, and syncing it across devices would
 * mean an API for something nobody would notice working.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 310;
/** The chat pane stops being usable below this — bubbles wrap to one word. */
const CHAT_MIN = 420;
/** Context pane on lg; reserved so dragging cannot squeeze it out. */
const CONTEXT_W = 292;

function clampWidth(px: number, viewport: number): number {
  const room = viewport - CHAT_MIN - (viewport >= 1024 ? CONTEXT_W : 0);
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, room));
  return Math.round(Math.max(SIDEBAR_MIN, Math.min(max, px)));
}

export interface UseSidebarWidth {
  /** Current width in px. Feed to `style={{ '--sidebar-w': `${width}px` }}`. */
  width: number;
  /** Spread onto the handle element. */
  handleProps: {
    role: 'separator';
    'aria-orientation': 'vertical';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-label': string;
    tabIndex: 0;
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
  dragging: boolean;
}

export function useSidebarWidth(
  storageKey: string,
  label: string,
  onCommit?: (width: number) => void,
): UseSidebarWidth {
  // SSR renders the default; reading localStorage during render would not match
  // the server output and React would discard the markup.
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startW = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved > 0) {
      setWidth(clampWidth(saved, window.innerWidth));
    }
  }, [storageKey]);

  // A window that shrank below the stored width would otherwise leave the chat
  // pane unusable until the user thought to drag the handle back.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w, window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const commit = useCallback((next: number) => {
    window.localStorage.setItem(storageKey, String(next));
    onCommit?.(next);
  }, [storageKey, onCommit]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = width;
    setDragging(true);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      setWidth(clampWidth(startW.current + (ev.clientX - startX.current), window.innerWidth));
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture?.(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDragging(false);
      setWidth((w) => { commit(w); return w; });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }, [width, commit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setWidth((w) => {
      const next = clampWidth(w + (e.key === 'ArrowRight' ? 16 : -16), window.innerWidth);
      commit(next);
      return next;
    });
  }, [commit]);

  const onDoubleClick = useCallback(() => {
    setWidth(clampWidth(SIDEBAR_DEFAULT, window.innerWidth));
    commit(SIDEBAR_DEFAULT);
  }, [commit]);

  return {
    width,
    dragging,
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': width,
      'aria-valuemin': SIDEBAR_MIN,
      'aria-valuemax': SIDEBAR_MAX,
      'aria-label': label,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick,
    },
  };
}

/**
 * The grab strip. 8px of hit area around a 1px visual line — a 1px target is
 * not pointable, and the visible weight should stay at the border it replaces.
 */
export function SidebarResizeHandle({
  dragging,
  accent = 'bg-brand-600',
  ...rest
}: { dragging: boolean; accent?: string } & UseSidebarWidth['handleProps']) {
  return (
    <div
      {...rest}
      className="group relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none md:block"
      style={{ marginLeft: -4, marginRight: -4 }}
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition ${
          dragging ? accent : 'bg-transparent group-hover:bg-line-2'
        }`}
      />
    </div>
  );
}
