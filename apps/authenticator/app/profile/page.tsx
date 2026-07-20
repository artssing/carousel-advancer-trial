'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StarRating } from '@authentik/ui';
import { CATEGORIES, formatHKD, type CategoryId } from '@authentik/utils';
import { api, hasToken, type AuthenticatorProfile } from '@/lib/api';
import { AuthTopline, AuthContent } from '@/components/auth-topline';
import { EAndOWarning } from '@/components/eando-warning';

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

  const [feePct, setFeePct] = useState('');
  const [feeMin, setFeeMin] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [hours, setHours] = useState('');
  const [acceptsMeetup, setAcceptsMeetup] = useState(false);

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    api.me()
      .then((me) => {
        if (!me.authenticator) { setError('此帳號並非鑑定師'); return; }
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
    return (
      <>
        <AuthTopline title="鑑定師檔案" subtitle="公開資料會顯示於你的鑑定師頁面" />
        <AuthContent><div className="h-40 animate-pulse rounded-xl bg-surface-2" /></AuthContent>
      </>
    );
  }
  if (error && !profile) {
    return (
      <>
        <AuthTopline title="鑑定師檔案" />
        <AuthContent><p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p></AuthContent>
      </>
    );
  }
  if (!profile) return null;

  const categoryHints = (profile.categories ?? [])
    .map((c) => ENUM_TO_CATEGORY[c])
    .filter((id): id is CategoryId => Boolean(id))
    .map((id) => CATEGORIES[id]);

  const initial = profile.displayName.slice(0, 1);
  const disputeRatePct = (profile as any).disputeRate != null
    ? `${((profile as any).disputeRate * 100).toFixed(1)}%`
    : null;

  return (
    <>
      <AuthTopline
        title="鑑定師檔案"
        subtitle="公開資料會顯示於你的鑑定師頁面"
        action={
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-authBrand-500 px-5 py-2 text-[14px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600 disabled:opacity-40"
          >
            {saving ? '儲存中…' : '儲存變更'}
          </button>
        }
      />
      <AuthContent>
        <EAndOWarning eAndOInsuranceExpiresAt={profile.eAndOInsuranceExpiresAt} />

        {/* ═══ Two-column L3 layout: form + preview ═══ */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ── Left: editable form ── */}
          <div className="space-y-4">
            {/* 店舖資料 */}
            <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                店舖資料
              </div>
              <Field label="店舖名稱" hint="公開">
                <input
                  value={profile.storeName ?? profile.displayName}
                  readOnly
                  className="w-full rounded-lg border border-line-2 bg-surface-2 px-3.5 py-2.5 text-[14px] text-neutral-text-muted"
                />
              </Field>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="地區">
                  <input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                  />
                </Field>
                <Field label="從業年資">
                  <input
                    type="number"
                    min={0}
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                  />
                </Field>
              </div>
              <Field label="店舖地址" hint="面交時顯示予買賣雙方">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                />
              </Field>
              <Field label="營業時間">
                <input
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="例：週一至週六 11:00–19:00"
                  className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                />
              </Field>
              <Field label="專業簡介" hint="公開" nomargin>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="例：前拍賣行手袋部門鑑定師，八年經驗，專攻 Chanel 及 Hermès…"
                  className="w-full resize-none rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                />
              </Field>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-neutral-text-muted">
                <input
                  type="checkbox"
                  checked={acceptsMeetup}
                  onChange={(e) => setAcceptsMeetup(e.target.checked)}
                  className="h-4 w-4 accent-authBrand-500"
                />
                接受面交鑑定（買家可揀你嘅地點當場鑑定 + 交收）
              </label>

              {/* 分店 pointer */}
              <div className="mt-3 rounded-lg border border-authBrand-border bg-authBrand-soft p-3 text-[12px] text-authBrand-900">
                <p className="font-semibold">分店地址已搬去獨立頁面</p>
                <p className="mt-0.5">
                  而家可以管理多間分店。
                  <Link href="/branches" className="ml-1 font-semibold underline">前往分店地址管理 →</Link>
                </p>
              </div>
            </div>

            {/* 收費設定 */}
            <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                收費設定
              </div>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="費率" hint="% of 貨價">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={30}
                    value={feePct}
                    onChange={(e) => setFeePct(e.target.value)}
                    placeholder="2.0"
                    className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                  />
                </Field>
                <Field label="最低收費" hint="HKD" nomargin>
                  <input
                    type="number"
                    min={0}
                    value={feeMin}
                    onChange={(e) => setFeeMin(e.target.value)}
                    placeholder="600"
                    className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500"
                  />
                </Field>
              </div>

              {categoryHints.length > 0 && (
                <div className="mt-4 rounded-lg border border-authBrand-border bg-authBrand-soft p-3 text-[12px] text-authBrand-900">
                  <p className="font-semibold">品類建議範圍（AI 監控基準）</p>
                  <ul className="mt-1 space-y-0.5">
                    {categoryHints.map((c) => (
                      <li key={c.id}>
                        {c.labelZh}：約 {Math.round(c.authFeeRate * 1000) / 10}%、最低 {formatHKD(c.authFeeMin)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-authBrand-900/70">
                    平台會以 AI 監控費率是否偏離同品類基準；異常會提示，但你可自訂。
                  </p>
                </div>
              )}
            </div>

            {/* 合約與 E&O */}
            <div className="rounded-xl border border-verdict-incon-border bg-white p-6 shadow-auth-sh1">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-verdict-incon">
                合約與 E&O 保險
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <p className="text-[14px] font-bold text-neutral-text">E&O 專業責任保險</p>
                  {(profile as any).eAndOPolicyRef && (
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-text-hint">
                      保單 #{(profile as any).eAndOPolicyRef}
                    </p>
                  )}
                </div>
                {profile.eAndOInsuranceExpiresAt ? (
                  <span className="rounded-full bg-verdict-pass-soft px-3 py-1 text-[11px] font-semibold text-verdict-pass">
                    有效至 {new Date(profile.eAndOInsuranceExpiresAt).toISOString().slice(0, 7)}
                  </span>
                ) : (
                  <span className="rounded-full bg-verdict-incon-soft px-3 py-1 text-[11px] font-semibold text-verdict-incon">
                    未提供
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-lg bg-verdict-incon-soft p-3 text-[12px] leading-relaxed text-verdict-incon">
                ⚠ 保險到期前 30 日系統會提醒續保。
                <b>保險失效期間你將無法接單</b>，因為所有鑑定判定必須有 E&O 承保。
              </div>

              <button className="mt-3 w-full rounded-lg border border-line-2 bg-white px-4 py-2.5 text-[13px] font-semibold text-neutral-text shadow-auth-sh1 transition hover:border-authBrand-500 hover:text-authBrand-500">
                上載續保證明
              </button>
            </div>
          </div>

          {/* ── Right: sticky public preview ── */}
          <aside className="lg:sticky lg:top-[82px]">
            <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                公開頁面預覽
              </div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-authBrand-100 to-authBrand-200 text-[18px] font-bold text-authBrand-900">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-neutral-text">{profile.displayName}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StarRating value={profile.starRating} size="sm" />
                  </div>
                  {profile.storeName && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-text-hint">
                      {profile.storeName}
                    </p>
                  )}
                </div>
              </div>

              <div className="my-3 flex gap-4 border-y border-line py-3">
                <div className="flex-1">
                  <div className="text-[16px] font-extrabold text-authBrand-900">{profile.completedCount}</div>
                  <div className="font-mono text-[11px] text-neutral-text-hint">鑑定單</div>
                </div>
                {disputeRatePct && (
                  <div className="flex-1">
                    <div className="text-[16px] font-extrabold text-verdict-pass">{disputeRatePct}</div>
                    <div className="font-mono text-[11px] text-neutral-text-hint">爭議率</div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-[16px] font-extrabold text-authBrand-900">{profile.starRating}</div>
                  <div className="font-mono text-[11px] text-neutral-text-hint">評分</div>
                </div>
              </div>

              <p className="text-[12px] leading-relaxed text-neutral-text-hint">
                ★ 星級與爭議率由平台按實際完成單數演算派生，
                <b>不可手動修改</b>。此為演算法信任指標，非平台背書。
              </p>
            </div>
          </aside>
        </div>

        {/* Save state banners */}
        {error && (
          <p className="mt-4 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</p>
        )}
        {saved && (
          <p className="mt-4 rounded-lg bg-verdict-pass-soft px-4 py-2.5 text-sm text-verdict-pass">
            已儲存
          </p>
        )}
      </AuthContent>
    </>
  );
}

function Field({
  label, hint, nomargin, children,
}: { label: string; hint?: string; nomargin?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${nomargin ? '' : 'mb-3.5'}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">
        {label}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-neutral-text-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
