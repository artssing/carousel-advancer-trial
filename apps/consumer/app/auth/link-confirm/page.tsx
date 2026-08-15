'use client';

// useSearchParams needs dynamic rendering.
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { getClientLocale, createT } from '@certifine/web-kit';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@certifine/ui';
import { setToken } from '@/lib/api';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function LinkConfirmPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

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
      if (!r.ok) throw new Error((await r.json()).message ?? _t('auth.link.error'));
      const { accessToken } = await r.json();
      setToken(accessToken);
      router.push('/' as any);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? _t('auth.link.error'));
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
        <p className="text-sm text-red-600">{_t('auth.link.invalidToken')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            {_t('auth.link.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>{_t('auth.link.emailIntro')}</p>
            <p className="mt-2 font-mono text-xs text-slate-700">{email}</p>
            <p className="mt-1 text-slate-600">{_t('auth.link.displayNameLabel')}<span className="font-medium">{existingDisplayName}</span></p>
          </div>

          <p className="text-sm text-slate-700">
            {_t('auth.link.afterNote', {
              google: _t('auth.link.googleLogin'),
              email: _t('auth.link.emailLogin'),
            })}
          </p>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {_t('auth.linkConfirm.warning')}
            </span>
          </div>

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={cancel} className="flex-1" disabled={busy}>{_t('auth.link.cancel')}</Button>
            <Button onClick={confirm} disabled={busy} className="flex-1">
              {busy ? _t('auth.link.busy') : _t('auth.link.confirm')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
