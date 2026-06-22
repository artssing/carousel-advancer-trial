'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { accessToken } = await api.login(email, password);
      setToken(accessToken);
      const me = await api.me();
      if (!me.roles?.some((r) => ADMIN_ROLES.includes(r))) {
        setError('呢個帳號冇 admin 權限');
        setBusy(false);
        return;
      }
      router.replace('/');
    } catch (e: any) {
      setError(e?.message ?? '登入失敗');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100">
        <h1 className="text-xl font-bold">Admin Console</h1>
        <p className="mt-1 text-xs text-slate-500">內部使用 · 需要 admin role</p>
        <div className="mt-4 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {error && <p className="rounded bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? '登入中…' : '登入'}
          </button>
        </div>
      </form>
    </div>
  );
}
