import Link from 'next/link';

// Cross-app link to authenticator portal — env-driven so production / public-test
// deployment can override (Lesson #4: never hardcode cross-app URLs).
const AUTHENTICATOR_URL =
  process.env.NEXT_PUBLIC_AUTHENTICATOR_URL ?? 'http://localhost:3001';

/**
 * L3 Footer — 4-column layout with wordmark + disclaimer, plus 買賣 / 信任 / 關於
 * link columns. Matches design-samples/final-L3/home.html .footer spec.
 *
 * The platform-neutral disclaimer copy is legally significant (Lesson: L'Oréal
 * v eBay + CLAUDE.md information intermediary stance) and MUST NOT be trimmed.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-2 text-sm">
      <div className="mx-auto flex max-w-container-l3 flex-wrap justify-between gap-10 px-4 py-11 sm:px-6">
        {/* Col 1 — brand + disclaimer */}
        <div className="max-w-[280px]">
          <div className="text-[18px] font-extrabold tracking-[0.2em] text-ink">
            AUTHEN<span className="text-brand-600">·</span>TIK
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-text-hint">
            資訊中介平台。貨品真偽由具名鑑定師負責，平台不作真偽保證。
            © {new Date().getFullYear()} Authentik HK Ltd.
          </p>
        </div>

        {/* Col 2 — 買賣 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            買賣
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/browse" className="block text-neutral-text-muted transition hover:text-ink">
              瀏覽商品
            </Link>
            <Link href="/sell" className="block text-neutral-text-muted transition hover:text-ink">
              刊登出售
            </Link>
            <Link href={'/about#authenticators' as any} className="block text-neutral-text-muted transition hover:text-ink">
              鑑定師名冊
            </Link>
          </div>
        </div>

        {/* Col 3 — 信任 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            信任
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              鑑定機制
            </Link>
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              款項託管
            </Link>
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              爭議處理
            </Link>
          </div>
        </div>

        {/* Col 4 — 關於 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            關於
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/terms" className="block text-neutral-text-muted transition hover:text-ink">
              服務條款
            </Link>
            <Link href="/privacy" className="block text-neutral-text-muted transition hover:text-ink">
              私隱政策
            </Link>
            <a
              href="mailto:hello@authentik.hk"
              className="block text-neutral-text-muted transition hover:text-ink"
            >
              聯絡
            </a>
            <a
              href={AUTHENTICATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-neutral-text-muted transition hover:text-ink"
            >
              鑑定家入口
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
