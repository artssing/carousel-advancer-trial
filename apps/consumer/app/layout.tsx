import './globals.css';
import type { Metadata } from 'next';
import { TopNav } from '@/components/top-nav';
import { ConditionalFooter } from '@/components/conditional-footer';

export const metadata: Metadata = {
  title: 'Authentik HK — 認證二手交易平台',
  description: '香港首個按品類認證的 C2C 二手平台。每件 HKD 10,000 以上商品強制經第三方鑑定。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Normal flow: body scrolls naturally for most pages. /messages is app-like
  // and the ConditionalFooter hides the global footer there so the messages
  // layout fills viewport exactly without forcing a body scroll.
  return (
    <html lang="zh-HK">
      <body>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="flex-1">{children}</main>
          <ConditionalFooter />
        </div>
      </body>
    </html>
  );
}
