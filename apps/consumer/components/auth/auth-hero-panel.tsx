import { Check, ShieldCheck } from 'lucide-react';

/**
 * Shared left-side hero panel used by /login and /register.
 *
 * ⚠️ Do NOT add fake stats / testimonials / "已驗證" product cards to this panel.
 * Coordinator + founder ruling 2026-07-05:
 *   - No fake trade counts (「12,400+ 已驗證交易」etc.) — platform pre-launch
 *   - No fake testimonials (「Alice C. 話…」) — no consenting user exists
 *   - No fake floating "已驗證" listing cards — L'Oréal v eBay: platform can't
 *     claim "已驗證" without pointing to a named authenticator + real order
 *
 * Visual decoration IS OK: abstract radial glow blobs + product-agnostic shield
 * illustration are pure aesthetics, no data claims involved.
 *
 * When founder later ships real launch stats, add a new `stats?: {…}` prop and
 * render below the trust-points list — don't fabricate placeholders.
 */
const TRUST_POINTS = [
  '具名鑑定師把關，星級由演算法派生',
  '款項託管，鑑定通過先放款',
  '瀏覽免驗證，30 秒開始探索',
];

export function AuthHeroPanel() {
  return (
    <div className="relative hidden flex-col justify-center overflow-hidden bg-gradient-to-br from-ink via-[#0d3350] to-[#0f4a5f] px-[8%] py-16 text-white lg:flex">
      {/* Abstract radial glow blobs — pure decoration, no data claims. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-[180px] -top-[160px] h-[620px] w-[620px] rounded-full opacity-90 blur-[8px]"
        style={{
          background:
            'radial-gradient(circle, rgba(0,196,140,0.28), transparent 62%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[160px] -left-[140px] h-[420px] w-[420px] rounded-full opacity-90"
        style={{
          background:
            'radial-gradient(circle, rgba(0,135,102,0.22), transparent 60%)',
        }}
      />

      {/* Watermark shield — abstract trust icon, no product/data. */}
      <ShieldCheck
        aria-hidden
        className="pointer-events-none absolute -right-6 top-1/2 h-[280px] w-[280px] -translate-y-1/2 text-white/[0.04]"
        strokeWidth={1.2}
      />

      {/* Corner brand wordmark */}
      <p className="relative z-10 mb-auto text-[18px] font-extrabold tracking-[0.22em]">
        AUTHEN<span className="text-brand-400">·</span>TIK
      </p>

      {/* Main content — mid-vertical */}
      <div className="relative z-10 -mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-400">
          Authenticated Resale · Hong Kong
        </p>
        <h1 className="mt-3.5 max-w-[440px] font-display-serif text-[38px] font-bold leading-[1.18] tracking-[-0.01em] text-white">
          加入 Authentik，<br />
          只買賣被驗證過的正品。
        </h1>
        <p className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-[#a8c0d4]">
          每宗高價交易都有具名鑑定師把關、款項全程託管。買得安心，賣得放心。
        </p>
        <div className="mt-7 flex flex-col gap-3">
          {TRUST_POINTS.map((t) => (
            <div key={t} className="flex items-start gap-3 text-[14px] text-[#cdd9e6]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400/20 ring-1 ring-brand-400/40">
                <Check className="h-3 w-3 text-brand-400" strokeWidth={3} />
              </span>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Subtle bottom accent line */}
      <div className="relative z-10 mt-auto flex items-center gap-2 pt-6 text-[11px] tracking-[0.16em] text-[#9db4cc]">
        <span className="h-px w-8 bg-brand-400/60" />
        SINCE 2026 · HONG KONG
      </div>

      {/*
        Reserved slot for real launch stats (behind a real-data feature flag).
        Until founder ships real numbers, this stays empty by design.
        NEVER hardcode placeholder "12,400+" or similar here.
      */}
    </div>
  );
}
