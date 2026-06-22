'use client';

// useSearchParams needs dynamic rendering.
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@authentik/ui';
import { setToken } from '@/lib/api';
import { UserCheck } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function CompleteProfilePage() {
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
    if (!displayName.trim()) { setErr('請輸入顯示名稱'); return; }
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
      if (!r.ok) throw new Error((await r.json()).message ?? '完成資料失敗');
      const { accessToken } = await r.json();
      setToken(accessToken);
      router.push('/' as any);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? '完成資料失敗');
    } finally {
      setBusy(false);
    }
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
            <UserCheck className="h-5 w-5 text-brand-600" />
            完善你嘅帳戶資料
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            用 Google 登入完成。請確認以下資料才完成註冊：
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>電郵（不可更改）</Label>
              <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                {email}
              </p>
            </div>

            <div>
              <Label htmlFor="displayName">顯示名稱 <span className="text-red-500">*</span></Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="呢個係其他用戶會見到嘅名"
                maxLength={40}
                required
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">
                我哋從 Google 拎咗你嘅名做預設，可以改成你想用嘅花名。
              </p>
            </div>

            {suggestedAvatar && (
              <div>
                <Label>頭像</Label>
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
                    使用 Google 頭像
                  </label>
                </div>
              </div>
            )}

            {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? '處理中…' : '完成註冊'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
