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
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@certifine/ui';
import { getClientLocale, createT } from '@certifine/web-kit';
import { api, setToken, ApiError } from '@/lib/api';

const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'IDLE' | 'CHECKING' | 'ERROR'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [showLocalForm, setShowLocalForm] = useState(false);
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

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
          setError(_t('authenticator.login.error.noAuthenticator'));
          setStatus('ERROR');
          return;
        }
        router.push('/');
        router.refresh();
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : _t('authenticator.login.error.verifyFailed'));
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
        setError(_t('authenticator.login.error.noAuthenticator'));
        return;
      }
      router.push('/');
      router.refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : _t('authenticator.login.error.loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShieldCheck className="h-7 w-7 text-emerald-600" />
          <span className="text-xl font-semibold">{_t('authenticator.login.page.header')}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{_t('authenticator.login.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {status === 'CHECKING' && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                {_t('authenticator.login.status.checking')}
              </p>
            )}

            {status !== 'CHECKING' && !showLocalForm && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  {_t('authenticator.login.sso.description')}
                </p>
                <Button onClick={onSsoLogin} className="w-full">
                  {_t('authenticator.login.sso.btn')}
                </Button>
                {error && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowLocalForm(true)}
                  className="block w-full text-center text-[10px] text-slate-400 underline hover:text-slate-600"
                >
                  {_t('authenticator.login.sso.showLocalForm')}
                </button>
              </div>
            )}

            {showLocalForm && (
              <form onSubmit={onLocalSubmit} className="space-y-4">
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  {_t('authenticator.login.local.devNotice')}
                </p>
                <div>
                  <Label htmlFor="email">{_t('authenticator.login.local.email.label')}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="milan@authentik.hk" className="mt-1" required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">{_t('authenticator.login.local.password.label')}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" required autoComplete="current-password" />
                </div>
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? _t('authenticator.login.local.submitBtn.busy') : _t('authenticator.login.local.submitBtn')}
                </Button>
                <button type="button" onClick={() => setShowLocalForm(false)} className="block w-full text-center text-[10px] text-slate-400 underline">
                  {_t('authenticator.login.local.backToSso')}
                </button>
              </form>
            )}

            <p className="mt-4 whitespace-pre-line text-center text-xs text-slate-500">
              {_t('authenticator.login.demoCredentials')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
