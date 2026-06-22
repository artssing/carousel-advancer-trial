'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StarRating,
  Badge,
  Input,
  Label,
  Button,
} from '@authentik/ui';
import { CATEGORIES, formatHKD, type CategoryId } from '@authentik/utils';
import { api, hasToken, type AuthenticatorProfile } from '@/lib/api';

const ENUM_TO_CATEGORY: Record<string, CategoryId> = {
  HANDBAG: 'handbag',
  IPHONE: 'iphone',
  POKEMON_CARD: 'pokemon_card',
  WATCH: 'watch',
  SNEAKER: 'sneaker',
  DESIGNER_TOY: 'designer_toy',
  OTHER: 'other',
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthenticatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // editable form state
  const [feePct, setFeePct] = useState('');     // percentage, e.g. "7" => 0.07
  const [feeMin, setFeeMin] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [hours, setHours] = useState('');
  const [acceptsMeetup, setAcceptsMeetup] = useState(false);

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        if (!me.authenticator) {
          setError('此帳號並非鑑定師');
          return;
        }
        const a = me.authenticator;
        setProfile(a);
        setFeePct(a.feeRatePct != null ? String(Math.round(a.feeRatePct * 1000) / 10) : '');
        setFeeMin(a.feeMinHKD != null ? String(a.feeMinHKD) : '');
        setBio(a.bio ?? '');
        setYears(a.yearsExperience != null ? String(a.yearsExperience) : '');
        setAddress(a.locationAddress ?? '');
        setDistrict(a.district ?? '');
        setHours(a.businessHours ?? '');
        setAcceptsMeetup(!!a.acceptsMeetup);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function onSave() {
    setError(null);
    setSaved(false);
    const pctNum = feePct === '' ? undefined : Number(feePct) / 100;
    if (pctNum != null && (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 0.3)) {
      setError('收費百分比須介乎 0% 至 30%');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateMe({
        feeRatePct: pctNum,
        feeMinHKD: feeMin === '' ? undefined : Number(feeMin),
        bio: bio.trim(),
        yearsExperience: years === '' ? undefined : Number(years),
        locationAddress: address.trim(),
        district: district.trim(),
        businessHours: hours.trim(),
        acceptsMeetup,
      });
      setProfile((p) => (p ? { ...p, ...updated } : updated));
      setSaved(true);
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-slate-500">載入中…</div>;
  }
  if (error && !profile) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-red-600">{error}</div>;
  }
  if (!profile) return null;

  // 品類建議收費範圍（AI 監控基準）
  const categoryHints = (profile.categories ?? [])
    .map((c) => ENUM_TO_CATEGORY[c])
    .filter((id): id is CategoryId => Boolean(id))
    .map((id) => CATEGORIES[id]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">公開 Profile</h1>
      <p className="mt-1 text-sm text-slate-500">這是買家在平台看到的鑑定店資訊</p>

      {/* Identity (read-only, algorithm-derived) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>店面 / 個人資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-slate-200" />
            <div>
              <p className="font-medium">{profile.displayName}</p>
              {profile.storeName && <p className="text-xs text-slate-500">{profile.storeName}</p>}
              <div className="mt-1 flex items-center gap-2">
                <StarRating value={profile.starRating} size="sm" showValue />
                <Badge variant="gold">{profile.starRating} 星鑑定師</Badge>
                <span className="text-xs text-slate-400">已鑑定 {profile.completedCount} 件</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            星級、已鑑定件數及爭議率由系統演算法生成，不可手動修改。
          </p>

          <div>
            <Label htmlFor="bio">簡介</Label>
            <textarea
              id="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="例：專營二手名牌手袋十五年，每年鑑定逾 5,000 件。"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="years">年資（年）</Label>
              <Input
                id="years"
                type="number"
                min={0}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          {/* 分店地址 — 已遷移至獨立頁面 /branches（支援多分店）*/}
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">
            <p className="font-medium">分店地址已搬去獨立頁面</p>
            <p className="mt-1 text-brand-800/80">
              而家可以管理多間分店（總店 / 分店 / 寄存點）。
              {' '}
              <a href="/branches" className="font-semibold underline">前往分店地址管理 →</a>
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptsMeetup}
              onChange={(e) => setAcceptsMeetup(e.target.checked)}
              className="h-4 w-4"
            />
            接受面交鑑定（買家可揀到你的地點當場鑑定 + 交收）
          </label>
        </CardContent>
      </Card>

      {/* Self-pricing */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>自訂收費</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            鑑定費 = 貨價 × 收費百分比，並設最低收費。買家落單時會見到你針對該件貨的實際報價。
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="feePct">收費百分比（%）</Label>
              <Input
                id="feePct"
                type="number"
                step="0.1"
                min={0}
                max={30}
                value={feePct}
                onChange={(e) => setFeePct(e.target.value)}
                placeholder="例：7"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="feeMin">最低收費（HKD）</Label>
              <Input
                id="feeMin"
                type="number"
                min={0}
                value={feeMin}
                onChange={(e) => setFeeMin(e.target.value)}
                placeholder="例：250"
                className="mt-1"
              />
            </div>
          </div>

          {categoryHints.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">品類建議範圍（AI 監控基準）</p>
              <ul className="mt-1 space-y-0.5">
                {categoryHints.map((c) => (
                  <li key={c.id}>
                    {c.labelZh}：約 {Math.round(c.authFeeRate * 1000) / 10}%、最低 {formatHKD(c.authFeeMin)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-slate-400">
                收費可自訂，但偏離建議範圍過多可能會被系統檢視。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* E&O insurance (read-only display) */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>E&O 保險證明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {profile.eAndOInsuranceExpiresAt ? (
            <>
              <p>
                狀態：<span className="text-emerald-600">有效</span>
              </p>
              <p>有效期至：{new Date(profile.eAndOInsuranceExpiresAt).toLocaleDateString('zh-HK')}</p>
            </>
          ) : (
            <p className="text-amber-600">尚未提供 E&O 保險證明</p>
          )}
          <Button variant="outline" size="sm" className="mt-3">
            上載續保證明
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已儲存</p>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? '儲存中…' : '儲存改動'}
        </Button>
      </div>
    </div>
  );
}
