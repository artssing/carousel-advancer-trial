import Link from 'next/link';
import { ShieldCheck, Search, ShoppingBag, User } from 'lucide-react';
import { Button } from '@authentik/ui';

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <span>Authentik HK</span>
        </Link>
        <nav className="ml-6 hidden gap-4 text-sm text-slate-600 md:flex">
          <Link href="/browse">瀏覽</Link>
          <Link href="/browse?cat=handbag">手袋</Link>
          <Link href="/browse?cat=iphone">iPhone</Link>
          <Link href="/browse?cat=pokemon_card">Pokemon Card</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/browse" className="rounded-lg p-2 hover:bg-slate-100">
            <Search className="h-4 w-4" />
          </Link>
          <Link href="/orders" className="rounded-lg p-2 hover:bg-slate-100">
            <ShoppingBag className="h-4 w-4" />
          </Link>
          <Link href="/login" className="rounded-lg p-2 hover:bg-slate-100">
            <User className="h-4 w-4" />
          </Link>
          <Link href="/sell">
            <Button size="sm">上架</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
