'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock, XCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { sellCategories } from '@authentik/utils';
import { api, hasToken } from '@/lib/api';

/**
 * Authenticator onboarding — functional apply form + status page（founder
 * 2026-07-13 MVP：申請 + 審批）。PUBLIC route。
 * 提交 → POST /authenticators/applications → admin queue 審批。
 * 已申請 / 已批核 → 顯示狀態。星級不由此填 — 演算法派生（平台中立）。
 */
const CATS = sellCategories(); // { id, apiEnum, shortLabel/label, emoji }

const APP_STATUS: Record<string, { label: string; tone: string; icon: any; note: string }> = {
  SUBMITTED: { label: '審核中', tone: 'text-authBrand-600 bg-authBrand-soft border-authBrand-border', icon: Clock, note: '我哋會喺 1–3 個工作天內審批，有結果會通知你。' },
  NEEDS_MORE_INFO: { label: '需補交資料', tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertCircle, note: '請按下面備註補交，然後重新提交。' },
  APPROVED: { label: '已批核', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: Check, note: '你已經係認證鑑定師，可以開始接單。' },
  REJECTED: { label: '未通過', tone: 'text-red-700 bg-red-50 border-red-200', icon: XCircle, note: '如有疑問可聯絡客服，或重新遞交新申請。' },
  WITHDRAWN: { label: '已撤回', tone: 'text-neutral-text-hint bg-surface-2 border-line', icon: XCircle, note: '你已撤回申請，可以重新遞交。' },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<{ authenticator: any | null; application: any | null } | null>(null);

  // Form
  const [displayName, setDisplayName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [years, setYears] = useState('');
  const [bio, setBio] = useState('');
  const [feeRatePct, setFeeRatePct] = useState('6');
  const [feeMinHKD, setFeeMinHKD] = useState('200');
  const [district, setDistrict] = useState('');
  const [eoExpiry, setEoExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadMine() {
    setLoading(true);
    api.application.mine()
      .then((r) => {
        setExisting(r);
        const a = r.application;
        if (a && ['SUBMITTED', 'NEEDS_MORE_INFO'].includes(a.status)) {
          // Prefill from in-flight app so seller can edit + resubmit
          setDisplayName(a.displayName ?? '');
          setStoreName(a.storeName ?? '');
          setCats(a.categories ?? []);
          setYears(a.yearsExperience != null ? String(a.yearsExperience) : '');
          setBio(a.bio ?? '');
          setFeeRatePct(String(Math.round((a.feeRatePct ?? 0.06) * 100)));
          setFeeMinHKD(String(a.feeMinHKD ?? 200));
          setDistrict(a.district ?? '');
          setEoExpiry(a.eAndOExpiresAt ? a.eAndOExpiresAt.slice(0, 10) : '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    loadMine();
  }, []);

  function toggleCat(apiEnum: string) {
    setCats((prev) => prev.includes(apiEnum) ? prev.filter((x) => x !== apiEnum) : [...prev, apiEnum]);
  }

  async function submit() {
    setError(null);
    if (!displayName.trim()) { setError('請填寫鑑定師 / 店名'); return; }
    if (cats.length === 0) { setError('請至少揀一個鑑定專長'); return; }
    setBusy(true);
    try {
      await api.application.submit({
        displayName: displayName.trim(),
        storeName: storeName.trim() || undefined,
        categories: cats,
        yearsExperience: years ? parseInt(years, 10) : undefined,
        bio: bio.trim() || undefined,
        feeRatePct: feeRatePct ? parseFloat(feeRatePct) / 100 : undefined,
        feeMinHKD: feeMinHKD ? parseInt(feeMinHKD, 10) : undefined,
        district: district.trim() || undefined,
        eAndOExpiresAt: eoExpiry || undefined,
      });
      loadMine();
    } catch (e: any) {
      setError(e?.message ?? '提交失敗');
      setBusy(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex h-[64px] max-w-[900px] items-center justify-between px-6">
          <Link href="/" className="text-[19px] font-extrabold tracking-[0.18em] text-authBrand-900">
            CERTI<span className="text-authBrand-500">·</span>FINE
          </Link>
          <span className="font-mono text-[12px] text-neutral-text-hint">鑑定師申請</span>
        </div>
      </header>
      <div className="mx-auto max-w-[620px] px-6 pb-20 pt-9">{children}</div>
    </div>
  );

  if (loading) return <Shell><p className="text-sm text-neutral-text-muted">載入中…</p></Shell>;

  if (!hasToken()) {
    return (
      <Shell>
        <h1 className="text-[26px] font-bold text-authBrand-900">申請成為鑑定師</h1>
        <p className="mt-3 text-[14px] text-neutral-text-muted">請先登入你嘅平台帳戶先可以遞交申請。</p>
        <Link href="/login" className="mt-5 inline-block rounded-lg bg-authBrand-500 px-6 py-2.5 text-[14px] font-bold text-white shadow-auth-btn hover:bg-authBrand-600">
          去登入 →
        </Link>
      </Shell>
    );
  }

  // Already an active authenticator
  if (existing?.authenticator?.status === 'ACTIVE') {
    return (
      <Shell>
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="font-bold text-emerald-800">你已經係認證鑑定師</p>
            <p className="mt-0.5 text-[13px] text-emerald-700">可以喺工作台開始接單。</p>
          </div>
        </div>
        <button onClick={() => router.push('/')} className="mt-5 rounded-lg bg-authBrand-500 px-6 py-2.5 text-[14px] font-bold text-white shadow-auth-btn hover:bg-authBrand-600">
          去工作台 →
        </button>
      </Shell>
    );
  }

  // Has a terminal / in-flight application → status page (SUBMITTED shows read-only status;
  // NEEDS_MORE_INFO / REJECTED / WITHDRAWN allow re-edit below the status card)
  const app = existing?.application;
  const canEdit = !app || ['NEEDS_MORE_INFO', 'REJECTED', 'WITHDRAWN'].includes(app.status);
  const meta = app ? APP_STATUS[app.status] : null;

  return (
    <Shell>
      <h1 className="text-[26px] font-bold text-authBrand-900">申請成為鑑定師</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-text-muted">
        你嘅資歷會構成公開檔案。星級唔由此填 —— 純由日後完成單數與爭議率演算派生，平台不可手改。
      </p>

      {/* Status card */}
      {app && meta && (
        <div className={`mt-5 rounded-xl border p-4 ${meta.tone}`}>
          <div className="flex items-center gap-2">
            <meta.icon className="h-4 w-4" />
            <span className="text-sm font-bold">申請狀態：{meta.label}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed">{meta.note}</p>
          {app.reviewNote && (
            <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-[12px] font-medium">審批備註：{app.reviewNote}</p>
          )}
          {app.status === 'SUBMITTED' && (
            <button
              onClick={() => api.application.withdraw().then(loadMine)}
              className="mt-3 text-[12px] font-semibold underline hover:opacity-70"
            >
              撤回申請
            </button>
          )}
        </div>
      )}

      {/* Form — hidden while awaiting review (SUBMITTED) */}
      {canEdit && (
        <>
          {app && <p className="mt-5 text-[13px] font-semibold text-neutral-text">{app.status === 'NEEDS_MORE_INFO' ? '補交資料後重新提交：' : '重新遞交申請：'}</p>}
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">鑑定師 / 店名 *</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：Milan 名牌鑑定" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">實體店名（選填）</span>
                <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="例：Milan Station" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-semibold text-neutral-text-muted">
                鑑定專長 * <span className="ml-1 text-[11px] font-normal text-neutral-text-hint">可多選，決定可接單品類</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CATS.map((c) => {
                  const active = cats.includes(c.apiEnum);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCat(c.apiEnum)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${active ? 'border-authBrand-border bg-authBrand-soft text-authBrand-600' : 'border-line-2 bg-white text-neutral-text-muted hover:border-authBrand-500 hover:text-authBrand-500'}`}>
                      {c.emoji} {c.shortLabel} {active && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">從業年資</span>
                <input value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ''))} placeholder="例：8" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">所在區域</span>
                <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="例：旺角" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">收費率（% 貨價）</span>
                <input value={feeRatePct} onChange={(e) => setFeeRatePct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="6" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">最低收費（HK$）</span>
                <input value={feeMinHKD} onChange={(e) => setFeeMinHKD(e.target.value.replace(/\D/g, ''))} placeholder="200" className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">E&O 保險到期日</span>
              <input type="date" value={eoExpiry} onChange={(e) => setEoExpiry(e.target.value)} className="w-full rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">
                專業簡介 <span className="ml-1 text-[11px] font-normal text-neutral-text-hint">公開，建議 50–150 字</span>
              </span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="例：前拍賣行手袋部門鑑定師，專攻 Chanel 及 Hermès…" className="w-full resize-none rounded-lg border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-authBrand-500" />
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-authBrand-border bg-authBrand-soft p-3.5 text-[12px] leading-relaxed text-authBrand-900">
            審核只核實你嘅身分與資歷真確性，不代表平台為你嘅鑑定結果背書。所有鑑定責任由你按合約及 E&O 保險承擔。
          </div>

          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}

          <button onClick={submit} disabled={busy}
            className="mt-6 w-full rounded-lg bg-authBrand-500 py-3 text-[15px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600 disabled:opacity-50">
            {busy ? '提交中…' : '提交申請'}
          </button>
        </>
      )}
    </Shell>
  );
}
