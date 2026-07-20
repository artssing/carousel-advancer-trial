import './globals.css';
import type { Metadata } from 'next';
import { Noto_Serif_HK } from 'next/font/google';
import { TopNav } from '@/components/top-nav';
import { BannerBar } from '@/components/banner-bar';
import { ChromeHeightObserver } from '@/components/chrome-height-observer';
import { ConditionalFooter } from '@/components/conditional-footer';
import { AnalyticsProvider } from '@/components/analytics-provider';

// L3 display serif — bound to Tailwind `font-display-serif` via CSS var.
// Only preload weights actually used by design headings (700 = display bold).
const notoSerifHK = Noto_Serif_HK({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-serif-hk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Authentik HK — 認證二手交易平台',
  description: '香港首個按品類認證的 C2C 二手平台。每件 HKD 10,000 以上商品強制經第三方鑑定。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Normal flow: body scrolls naturally for most pages. /messages is app-like
  // and the ConditionalFooter hides the global footer there so the messages
  // layout fills viewport exactly without forcing a body scroll.
  return (
    <html lang="zh-HK" className={notoSerifHK.variable}>
      <body>
        <AnalyticsProvider />
        <div className="flex min-h-screen flex-col">
          {/* Banner always sticky; nav hides on scroll-down, returns on
              scroll-up. Sub-rails follow via `--chrome-h`. */}
          <ChromeHeightObserver banner={<BannerBar />} nav={<TopNav />} />
          <main className="flex-1">{children}</main>
          <ConditionalFooter />
        </div>
      </body>
    </html>
  );
}
