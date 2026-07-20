'use client';

// useSearchParams needs dynamic rendering.
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@authentik/ui';
import { setToken } from '@/lib/api';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function LinkConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const existingDisplayName = params.get('displayName') ?? '';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/auth/google/link-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkToken: token }),
      });
      if (!r.ok) throw new Error((await r.json()).message ?? '連接失敗');
      const { accessToken } = await r.json();
      setToken(accessToken);
      router.push('/' as any);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? '連接失敗');
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    router.push('/login' as any);
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-sm text-red-600">連結無效或已過期，請重新登入。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            連接 Google 帳戶
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>我哋發現你已經有 Certifine 帳戶用緊電郵：</p>
            <p className="mt-2 font-mono text-xs text-slate-700">{email}</p>
            <p className="mt-1 text-slate-600">顯示名稱：<span className="font-medium">{existingDisplayName}</span></p>
          </div>

          <p className="text-sm text-slate-700">
            確認連接之後，下次你可以用 <strong>Google 登入</strong> 或者 <strong>原本嘅電郵 + 密碼</strong> 登入同一個帳戶。
          </p>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              如果呢個 Google 帳戶唔係你嘅 — 請即刻撳「取消」並通知我哋。連接後 Google 帳戶都可以登入你嘅 Certifine 帳戶。
            </span>
          </div>

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={cancel} className="flex-1" disabled={busy}>取消</Button>
            <Button onClick={confirm} disabled={busy} className="flex-1">
              {busy ? '處理中…' : '確認連接'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
