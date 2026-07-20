'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Overview {
  users: number; listings: number; orders: number;
  disputes: number; kycPending: number; sellerReviews: number;
}

export default function AdminHome() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.overview().then(setData).catch((e) => setError(e?.message ?? '無法載入'));
  }, []);

  const kpis = [
    { label: 'Total users', value: data?.users ?? '—', link: '/users' },
    { label: 'Total listings', value: data?.listings ?? '—', link: null },
    { label: 'Total orders', value: data?.orders ?? '—', link: null },
    { label: 'Open disputes', value: data?.disputes ?? '—', link: '/disputes' },
    { label: 'KYC pending', value: data?.kycPending ?? '—', link: '/users/kyc' },
    { label: 'Seller reviews', value: data?.sellerReviews ?? '—', link: null },
  ];

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Operations Overview</h1>
      <p className="mt-1 text-sm text-slate-400">Real-time KPIs · 5-min refresh</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => {
          // Lesson #20：hover affordance 只可以落有 link 嘅 tile — link:null 嘅
          // tile 唔可以有 hover:border（睇落郁得但撳落冇反應）。
          const Inner = (
            <div className={`rounded-xl border border-slate-800 bg-slate-900 p-5 ${
              k.link ? 'cursor-pointer transition hover:border-slate-700' : ''
            }`}>
              <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value}</p>
            </div>
          );
          return k.link ? (
            <Link key={k.label} href={k.link as any}>{Inner}</Link>
          ) : <div key={k.label}>{Inner}</div>;
        })}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <QuickLink href="/disputes" title="處理爭議" desc="進入 dispute queue，逐張 review" />
        <QuickLink href="/users/kyc" title="KYC 審批" desc="審批 / 拒絕 pending KYC" />
        <QuickLink href="/users" title="用戶列表" desc="查所有 user、角色、KYC 狀態" />
      </div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href as any} className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-brand-600">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{desc}</p>
    </Link>
  );
}
