'use client';

/**
 * Authenticator portal login — Founder ruling 2026-06-19 Q4=A:
 * SSO via consumer login. Page acts as bouncer:
 *
 *   1. On mount: if URL has `#token=...`, pick it up + verify the user has
 *      authenticator role, then redirect to dashboard.
 *   2. Otherwise: redirect browser to consumer /login?returnUrl=<this URL>.
 *      Consumer login handles email/phone/Google and bounces back with token.
 *
 * A fallback "direct login" form is kept hidden behind a toggle for dev
 * convenience and when consumer portal is unreachable.
 */

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@authentik/ui';
import { api, setToken, ApiError } from '@/lib/api';

const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'IDLE' | 'CHECKING' | 'ERROR'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [showLocalForm, setShowLocalForm] = useState(false);

  // Local-form state (dev fallback)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // On mount: pick up hash token from consumer SSO bounce
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('token');
    if (!token) return;
    setStatus('CHECKING');
    setToken(token);
    window.history.replaceState(null, '', window.location.pathname);
    api.me()
      .then((me) => {
        if (!me.authenticator) {
          setError('此帳號未有鑑定師身份。如需申請，請前往入網申請頁。');
          setStatus('ERROR');
          return;
        }
        router.push('/');
        router.refresh();
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : '驗証失敗，請重新登入');
        setStatus('ERROR');
      });
  }, [router]);

  function onSsoLogin() {
    const returnUrl = `${window.location.origin}/login`;
    window.location.href = `${CONSUMER_URL}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  async function onLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { accessToken } = await api.auth.login({ email, password });
      setToken(accessToken);
      const me = await api.me();
      if (!me.authenticator) {
        setError('此帳號未有鑑定師身份。如需申請，請前往入網申請頁。');
        return;
      }
      router.push('/');
      router.refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : '登入失敗，請重試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShieldCheck className="h-7 w-7 text-emerald-600" />
          <span className="text-xl font-semibold">Authenticator Portal</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>鑑定師登入</CardTitle>
          </CardHeader>
          <CardContent>
            {status === 'CHECKING' && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                驗証緊鑑定師身份…
              </p>
            )}

            {status !== 'CHECKING' && !showLocalForm && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  鑑定師同消費者共用登入系統。撳下面按鈕跳轉到 Authentik HK 登入頁（支援電郵、手機號碼、Google）。
                </p>
                <Button onClick={onSsoLogin} className="w-full">
                  繼續至 Authentik HK 登入
                </Button>
                {error && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowLocalForm(true)}
                  className="block w-full text-center text-[10px] text-slate-400 underline hover:text-slate-600"
                >
                  使用內部登入（dev fallback）
                </button>
              </div>
            )}

            {showLocalForm && (
              <form onSubmit={onLocalSubmit} className="space-y-4">
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  Dev fallback — 正常情況下應該用上方 SSO
                </p>
                <div>
                  <Label htmlFor="email">電郵</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="milan@authentik.hk" className="mt-1" required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">密碼</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" required autoComplete="current-password" />
                </div>
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? '登入中…' : '登入'}
                </Button>
                <button type="button" onClick={() => setShowLocalForm(false)} className="block w-full text-center text-[10px] text-slate-400 underline">
                  返回 SSO
                </button>
              </form>
            )}

            <p className="mt-4 text-center text-xs text-slate-500">
              Demo：milan@authentik.hk · procheck@authentik.hk · cardlab@authentik.hk
              <br />密碼：password123
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
