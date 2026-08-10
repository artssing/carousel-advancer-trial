'use client';

// useSearchParams needs dynamic rendering.
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { getClientLocale, createT } from '@authentik/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@authentik/ui';
import { setToken } from '@/lib/api';
import { UserCheck } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function CompleteProfilePage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const suggestedName = params.get('suggestedName') ?? '';
  const suggestedAvatar = params.get('avatar') ?? '';

  const [displayName, setDisplayName] = useState(suggestedName);
  const [useAvatar, setUseAvatar] = useState(!!suggestedAvatar);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!displayName.trim()) { setErr(_t('auth.completeProfile.error.nameRequired')); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/auth/google/complete-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completeToken: token,
          displayName: displayName.trim(),
          useSuggestedAvatar: useAvatar,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message ?? _t('auth.completeProfile.error.failed'));
      const { accessToken } = await r.json();
      setToken(accessToken);
      router.push('/' as any);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? _t('auth.completeProfile.error.failed'));
    } finally {
      setBusy(false);
    }
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
            <UserCheck className="h-5 w-5 text-brand-600" />
            {_t('auth.completeProfile.page.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            {_t('auth.completeProfile.intro')}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>{_t('auth.completeProfile.emailLabel')}</Label>
              <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                {email}
              </p>
            </div>

            <div>
              <Label htmlFor="displayName">{_t('auth.completeProfile.displayNameLabel')} <span className="text-red-500">*</span></Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={_t('auth.completeProfile.namePlaceholder')}
                maxLength={40}
                required
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">
                {_t('auth.completeProfile.nameHint')}
              </p>
            </div>

            {suggestedAvatar && (
              <div>
                <Label>{_t('auth.completeProfile.avatarLabel')}</Label>
                <div className="mt-1 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={suggestedAvatar} alt="" className="h-12 w-12 rounded-full" />
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={useAvatar}
                      onChange={(e) => setUseAvatar(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    {_t('auth.completeProfile.useGoogleAvatar')}
                  </label>
                </div>
              </div>
            )}

            {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? _t('auth.completeProfile.busy') : _t('auth.completeProfile.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
