import './globals.css';
import type { Metadata } from 'next';
import { TopNav } from '@/components/top-nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Authentik HK — 認證二手交易平台',
  description: '香港首個按品類認證的 C2C 二手平台。每件 HKD 10,000 以上商品強制經第三方鑑定。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
