'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent } from '@certifine/ui';
import { api, hasToken, clearToken, ApiError, AUTH_CHANGE_EVENT } from '@/lib/api';
import {
  User as UserIcon, Lock, Store, ShieldCheck, ExternalLink, Camera,
  Check, AlertTriangle, Loader2, Mail, Eye, EyeOff, Phone,
} from 'lucide-react';
import { formatHKPhoneDisplay } from '@certifine/domain';
import { getClientLocale, createT } from '@certifine/web-kit';
import { AccountSidebar } from '@/components/account/account-sidebar';

const AUTHENTICATOR_URL = process.env.NEXT_PUBLIC_AUTHENTICATOR_URL ?? 'http://localhost:3001';

type Section = 'personal' | 'security' | 'shop' | 'authenticator';

type Me = Awaited<ReturnType<typeof api.me>>;

export default function ProfilePage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('personal');

  useEffect(() => {
    if (!hasToken()) { router.replace('/login?next=/account/profile'); return; }
    api.me().then(setMe).catch((e: any) => {
      if (e?.status === 401) { clearToken(); router.replace('/login'); }
      else setError(e?.message ?? _t('account.profile.error.load'));
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="mx-auto max-w-5xl p-6 text-sm text-slate-500">{_t('account.profile.loading')}</div>;
  if (error) return <div className="mx-auto max-w-5xl p-6 text-sm text-red-600">{error}</div>;
  if (!me) return null;

  const isSeller = me.roles.includes('SELLER');
  const isAuth = !!me.authenticator;

  const sections: Array<{ key: Section; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'personal', label: _t('account.profile.tab.personal'), icon: <UserIcon className="h-4 w-4" />, show: true },
    { key: 'security', label: _t('account.profile.tab.security'), icon: <Lock className="h-4 w-4" />, show: true },
    { key: 'shop', label: _t('account.profile.tab.shop'), icon: <Store className="h-4 w-4" />, show: isSeller },
    { key: 'authenticator', label: _t('account.profile.tab.authenticator'), icon: <ShieldCheck className="h-4 w-4" />, show: isAuth },
  ];

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[220px_1fr]">
        <AccountSidebar />

        <section>
          <header className="mb-5">
            <h1 className="font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
              {_t('account.profile.heading')}
            </h1>
            <p className="mt-1.5 text-[13px] text-neutral-text-hint">
              {_t('account.profile.page.subtitle')}
              {isSeller && (
                <>
                  {' '}{_t('account.profile.publicIntro')}
                  <Link href={`/seller/${me.id}`} className="ml-1 font-semibold text-brand-600 hover:underline">{_t('account.profile.page.sellerProfileLinkLabel')}</Link>
                </>
              )}
            </p>
          </header>

          {/* L3 underline sub-section tabs (matches payouts pattern) */}
          <div className="mb-5 flex gap-1 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain border-b border-line">
            {sections.filter((s) => s.show).map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`flex shrink-0 -mb-px items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-[14px] font-semibold transition ${
                    active ? 'border-brand-600 text-ink' : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {section === 'personal' && <PersonalSection me={me} onChange={setMe} />}
            {section === 'security' && <SecuritySection me={me} />}
            {section === 'shop' && isSeller && <ShopSection me={me} />}
            {section === 'authenticator' && isAuth && <AuthenticatorSection me={me} />}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Personal ───────────────────────────────────────────────────────────────

function PersonalSection({ me, onChange }: { me: Me; onChange: (m: Me) => void }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const [displayName, setDisplayName] = useState(me.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  // Persisted uncompressed source — kept so the customer can re-crop without re-uploading.
  const [avatarOriginalUrl, setAvatarOriginalUrl] = useState<string | null>(me.avatarOriginalUrl);
  const [avatarCropZoom, setAvatarCropZoom] = useState<number | null>(me.avatarCropZoom);
  const [avatarCropX, setAvatarCropX] = useState<number | null>(me.avatarCropX);
  const [avatarCropY, setAvatarCropY] = useState<number | null>(me.avatarCropY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Cropper state: opens after file pick OR after clicking "再次調整".
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropImg, setCropImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  // Translation in viewport pixels (offset from center)
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  const dirty = displayName.trim() !== me.displayName
    || avatarUrl !== me.avatarUrl
    || avatarOriginalUrl !== me.avatarOriginalUrl
    || avatarCropZoom !== me.avatarCropZoom
    || avatarCropX !== me.avatarCropX
    || avatarCropY !== me.avatarCropY;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErr(_t('account.profile.avatar.onlyImages')); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // Downscale the original to ≤ 800×800 JPEG q0.85 so we stay under the
        // 512KB server cap while still keeping enough resolution to re-crop.
        const MAX = 800;
        const sourceRatio = Math.min(1, MAX / Math.max(img.width, img.height));
        const ow = Math.round(img.width * sourceRatio);
        const oh = Math.round(img.height * sourceRatio);
        const oc = document.createElement('canvas');
        oc.width = ow; oc.height = oh;
        oc.getContext('2d')!.drawImage(img, 0, 0, ow, oh);
        const compressed = oc.toDataURL('image/jpeg', 0.85);
        const compressedImg = new Image();
        compressedImg.onload = () => {
          setCropSrc(compressed);
          setCropImg(compressedImg);
          // Fresh upload → reset crop transform
          setZoom(1);
          setTx(0);
          setTy(0);
        };
        compressedImg.src = compressed;
      };
      img.src = data;
    };
    reader.readAsDataURL(f);
    // Allow re-picking the same file later
    if (fileRef.current) fileRef.current.value = '';
  }

  /** Re-open the cropper using the saved original — no re-upload needed. */
  function recropExisting() {
    if (!avatarOriginalUrl) return;
    const img = new Image();
    img.onload = () => {
      setCropSrc(avatarOriginalUrl);
      setCropImg(img);
      setZoom(avatarCropZoom ?? 1);
      setTx(avatarCropX ?? 0);
      setTy(avatarCropY ?? 0);
    };
    img.src = avatarOriginalUrl;
  }

  /**
   * Max |tx|/|ty| so the image always covers the whole 200px viewport.
   * Cover-fit + zoom ≥ 1 guarantees w,h ≥ size, so bounds are ≥ 0.
   */
  function cropBounds(img: HTMLImageElement, z: number) {
    const size = 200;
    const baseRatio = Math.max(size / img.width, size / img.height);
    const ratio = baseRatio * z;
    return {
      maxTx: (img.width * ratio - size) / 2,
      maxTy: (img.height * ratio - size) / 2,
    };
  }

  const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v));

  function applyCrop() {
    if (!cropImg) return;
    const size = 200;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    // Canvas 透明 pixel 喺 JPEG export 會變黑 — 白底 fill 做保險。
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // Cover-fit base ratio so the smaller side fills the viewport (no letterbox).
    const baseRatio = Math.max(size / cropImg.width, size / cropImg.height);
    const ratio = baseRatio * zoom;
    const w = cropImg.width * ratio;
    const h = cropImg.height * ratio;
    // tx/ty are in viewport pixels — clamp so the crop never exposes an
    // uncovered edge (the「黑邊」bug), then translate.
    const { maxTx, maxTy } = cropBounds(cropImg, zoom);
    const ctx2 = clamp(tx, maxTx);
    const cty = clamp(ty, maxTy);
    ctx.drawImage(cropImg, (size - w) / 2 + ctx2, (size - h) / 2 + cty, w, h);
    const data = c.toDataURL('image/jpeg', 0.85);
    if (data.length > 256 * 1024) {
      setErr(_t('account.profile.avatar.stillTooLarge'));
      return;
    }
    setAvatarUrl(data);
    // Persist the compressed source + crop params so the customer can
    // re-open the cropper later without re-uploading. Store the CLAMPED
    // offsets so re-crop reopens exactly where the export landed.
    setAvatarOriginalUrl(cropSrc);
    setAvatarCropZoom(zoom);
    setAvatarCropX(ctx2);
    setAvatarCropY(cty);
    setCropSrc(null);
    setCropImg(null);
  }

  function cancelCrop() {
    setCropSrc(null);
    setCropImg(null);
  }

  function onCropPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
  }

  function onCropPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !cropImg) return;
    // Clamp live so the viewport can never show an uncovered edge — what the
    // customer sees while dragging = exactly what the export produces.
    const { maxTx, maxTy } = cropBounds(cropImg, zoom);
    setTx(clamp(dragRef.current.startTx + (e.clientX - dragRef.current.startX), maxTx));
    setTy(clamp(dragRef.current.startTy + (e.clientY - dragRef.current.startY), maxTy));
  }

  /** Zoom-out shrinks the image — re-clamp offsets so edges stay covered. */
  function onZoomChange(z: number) {
    setZoom(z);
    if (!cropImg) return;
    const { maxTx, maxTy } = cropBounds(cropImg, z);
    setTx((v) => clamp(v, maxTx));
    setTy((v) => clamp(v, maxTy));
  }

  function onCropPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  async function save() {
    setErr(null); setSaving(true); setSaved(false);
    try {
      const updated = await api.updateMe({
        displayName: displayName.trim() !== me.displayName ? displayName.trim() : undefined,
        avatarUrl: avatarUrl !== me.avatarUrl ? (avatarUrl ?? '') : undefined,
        avatarOriginalUrl: avatarOriginalUrl !== me.avatarOriginalUrl ? (avatarOriginalUrl ?? '') : undefined,
        avatarCropZoom: avatarCropZoom !== me.avatarCropZoom ? avatarCropZoom : undefined,
        avatarCropX: avatarCropX !== me.avatarCropX ? avatarCropX : undefined,
        avatarCropY: avatarCropY !== me.avatarCropY ? avatarCropY : undefined,
      });
      onChange({
        ...me,
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl,
        avatarOriginalUrl: updated.avatarOriginalUrl,
        avatarCropZoom: updated.avatarCropZoom,
        avatarCropX: updated.avatarCropX,
        avatarCropY: updated.avatarCropY,
      });
      // Notify top-nav (and any other observers) so the avatar updates without reload.
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : _t('account.profile.save.failed'));
    } finally {
      setSaving(false);
    }
  }

  const initial = (displayName || me.email).slice(0, 1).toUpperCase();

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <h2 className="text-base font-semibold">{_t('account.profile.personal.heading')}</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                : initial}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700"
              aria-label={_t('account.profile.avatar.changeAria')}
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          </div>
          <div className="text-xs text-slate-500">
            <p>{_t('account.profile.avatar.note')}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {avatarOriginalUrl && !cropSrc && (
                <button onClick={recropExisting} className="text-brand-600 hover:underline">
                  {_t('account.profile.avatar.adjustAgain')}
                </button>
              )}
              {avatarUrl && (
                <button
                  onClick={() => {
                    setAvatarUrl(null);
                    setAvatarOriginalUrl(null);
                    setAvatarCropZoom(null);
                    setAvatarCropX(null);
                    setAvatarCropY(null);
                  }}
                  className="text-red-600 hover:underline"
                >
                  {_t('account.profile.avatar.remove')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Crop editor — opens after picking a file. Drag to reposition + zoom slider. */}
        {cropSrc && cropImg && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-medium text-slate-700">{_t('account.profile.crop.heading')}</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div
                className="relative h-[200px] w-[200px] shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-brand-200 touch-none select-none"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
                style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
              >
                {(() => {
                  const size = 200;
                  const baseRatio = Math.max(size / cropImg.width, size / cropImg.height);
                  const ratio = baseRatio * zoom;
                  const w = cropImg.width * ratio;
                  const h = cropImg.height * ratio;
                  const left = (size - w) / 2 + tx;
                  const top = (size - h) / 2 + ty;
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cropSrc}
                      alt=""
                      draggable={false}
                      className="absolute pointer-events-none max-w-none"
                      style={{ width: w, height: h, left, top }}
                    />
                  );
                })()}
              </div>
              <div className="flex w-full flex-1 flex-col gap-3">
                <label className="block text-xs text-slate-700">
                  <span className="block">{_t('account.profile.crop.zoom')}</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                    className="mt-1 w-full"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-400">{_t('account.profile.crop.dragHint')}</span>
                </label>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyCrop}>{_t('account.profile.crop.confirm')}</Button>
                  <Button size="sm" variant="outline" onClick={cancelCrop}>{_t('account.profile.crop.cancel')}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setZoom(1); setTx(0); setTy(0); }}>{_t('account.profile.crop.reset')}</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DisplayName */}
        <label className="block text-sm">
          <span className="block text-slate-700">{_t('account.profile.displayName')}</span>
          <input
            type="text"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {_t('account.profile.displayNameHint')}
          </span>
        </label>

        {/* Other fields P1 placeholder */}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          {_t('account.profile.comingSoon')}
        </div>

        {err && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : _t('account.profile.save')}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-700">
              <Check className="h-3 w-3" /> {_t('account.profile.saved')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Security ──────────────────────────────────────────────────────────────

function SecuritySection({ me }: { me: Me }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{_t('account.profile.email.heading')}</h2>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Mail className="h-4 w-4 text-slate-400" />
            <span className="flex-1">{me.email}</span>
            <Lock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500">
            {_t('account.profile.email.note')}<a className="text-brand-600 hover:underline" href="mailto:support@certifine.hk">support@certifine.hk</a>{_t('account.profile.supportEmailSuffix')}
          </p>
        </CardContent>
      </Card>

      {/* Mobile phone — read-only. Founder ruling 2026-06-19: 帳號與安全
          顯示 phone，但唔可以喺呢度更改（管理 phone 嘅 UI 屬 backlog）。 */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-base font-semibold">{_t('account.profile.phone.heading')}</h2>
          {me.phone && me.phoneVerified ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Phone className="h-4 w-4 text-slate-400" />
                <span className="flex-1 font-mono">{formatHKPhoneDisplay(me.phone)}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{_t('account.profile.phone.verifiedBadge')}</span>
                <Lock className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">
                {_t('account.profile.phone.note')}<a className="text-brand-600 hover:underline" href="mailto:support@certifine.hk">support@certifine.hk</a>{_t('account.profile.supportEmailSuffix')}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Phone className="h-4 w-4 text-amber-500" />
                <span className="flex-1">{_t('account.profile.phone.none')}</span>
              </div>
              <p className="text-xs text-slate-500">
                {_t('account.profile.phone.comingSoon')}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <PasswordCard />

      <Card>
        <CardContent className="p-5">
          <h2 className="text-base font-semibold">{_t('account.profile.account.heading')}</h2>
          <dl className="mt-2 space-y-1 text-sm text-slate-700">
            <div className="flex justify-between"><dt className="text-slate-500">{_t('account.profile.account.id')}</dt><dd className="font-mono text-xs">{me.id}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{_t('account.profile.account.joined')}</dt><dd>{new Date(me.createdAt).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{_t('account.profile.account.role')}</dt><dd className="text-xs">{me.roles.join(' · ')}</dd></div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordCard() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const [open, setOpen] = useState(false);
  // 2-step flow (Founder ruling 2026-06-21): 先入舊密碼 → 確認之後先見新密碼欄
  const [step, setStep] = useState<'OLD' | 'NEW'>('OLD');
  const [cur, setCur] = useState('');
  const [next1, setNext1] = useState('');
  const [next2, setNext2] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [postChange, setPostChange] = useState(false); // Q1 — ask user prompt

  function reset() { setStep('OLD'); setCur(''); setNext1(''); setNext2(''); setErr(null); }

  function onNextFromOld() {
    setErr(null);
    if (!cur) { setErr(_t('account.profile.password.error.currentRequired')); return; }
    // Server validates correctness on final submit; if wrong, returns to OLD step.
    setStep('NEW');
  }

  async function submit() {
    setErr(null);
    if (next1.length < 8) { setErr(_t('account.profile.password.error.min')); return; }
    if (next1 !== next2) { setErr(_t('account.profile.password.error.mismatch')); return; }
    if (next1 === cur) { setErr(_t('account.profile.password.error.sameAsOld')); return; }
    setBusy(true);
    try {
      await api.changePassword(cur, next1);
      reset();
      setOpen(false);
      setPostChange(true); // Show Q1 prompt
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : _t('account.profile.password.error.failed');
      setErr(msg);
      // Old-password wrong → bounce back to step 1 so user re-enters.
      // These compare against the API's message, not UI copy — do not translate.
      if (msg.includes('舊密碼') || msg.includes('Old password') || msg.includes('Invalid')) {
        setStep('OLD');
        setNext1(''); setNext2('');
      }
    } finally {
      setBusy(false);
    }
  }

  function logoutAndRedirect() {
    clearToken();
    router.replace('/login');
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold">{_t('account.profile.password.heading')}</h2>
        {!open ? (
          <>
            <p className="text-sm text-slate-600">{_t('account.profile.password.intro')}</p>
            <Button variant="secondary" onClick={() => setOpen(true)}>{_t('account.profile.password.change')}</Button>
          </>
        ) : (
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
              <span className={step === 'OLD' ? 'text-brand-700' : 'text-emerald-600'}>
                {step === 'NEW' && <Check className="mr-0.5 inline h-3 w-3" />}{_t('account.profile.password.step1')}
              </span>
              <span className="text-slate-300">›</span>
              <span className={step === 'NEW' ? 'text-brand-700' : 'text-slate-400'}>{_t('account.profile.password.step2')}</span>
            </div>

            {step === 'OLD' ? (
              <>
                <label className="block text-sm">
                  <span className="block text-slate-700">{_t('account.profile.password.current')}</span>
                  <div className="relative mt-1">
                    <input
                      type={showCur ? 'text' : 'password'}
                      value={cur}
                      onChange={(e) => setCur(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter' && cur) onNextFromOld(); }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button type="button" onClick={() => setShowCur(!showCur)} className="absolute inset-y-0 right-2 text-slate-400 hover:text-slate-700">
                      {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                {err && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { reset(); setOpen(false); }} className="flex-1">{_t('account.profile.password.cancel')}</Button>
                  <Button onClick={onNextFromOld} disabled={!cur} className="flex-1">{_t('account.profile.password.next')}</Button>
                </div>
              </>
            ) : (
              <>
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {_t('account.profile.password.verified')}
                </p>
                <label className="block text-sm">
                  <span className="block text-slate-700">{_t('account.profile.password.new')}</span>
                  <div className="relative mt-1">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={next1}
                      onChange={(e) => setNext1(e.target.value)}
                      autoFocus
                      className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute inset-y-0 right-2 text-slate-400 hover:text-slate-700">
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <span className="mt-1 block text-xs text-slate-500">{_t('account.profile.password.newHint')}</span>
                </label>
                <label className="block text-sm">
                  <span className="block text-slate-700">{_t('account.profile.password.confirm')}</span>
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={next2}
                    onChange={(e) => setNext2(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                {err && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep('OLD')} className="flex-1">{_t('account.profile.password.back')}</Button>
                  <Button onClick={submit} disabled={busy || !next1 || !next2} className="flex-1">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : _t('account.profile.password.update')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Q1 — post-change prompt: ask user whether to log out other sessions */}
        {postChange && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPostChange(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-base font-semibold">{_t('account.profile.password.doneTitle')}</h3>
              </div>
              <p className="text-sm text-slate-600">
                {_t('account.profile.password.doneBody')}
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => setPostChange(false)} className="flex-1">{_t('account.profile.password.stayLoggedIn')}</Button>
                <Button onClick={logoutAndRedirect} className="flex-1">{_t('account.profile.password.reLogin')}</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Shop (SELLER) ─────────────────────────────────────────────────────────

function ShopSection({ me }: { me: Me }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const links = [
    { href: '/my-listings', label: _t('account.profile.shop.link.listings'), desc: _t('account.profile.shop.link.listingsDesc') },
    { href: '/orders', label: _t('account.profile.shop.link.orders'), desc: _t('account.profile.shop.link.ordersDesc') },
    { href: '/account/wallet', label: _t('account.profile.shop.link.wallet'), desc: _t('account.profile.shop.link.walletDesc') },
    { href: `/seller/${me.id}`, label: _t('account.profile.shop.link.public'), desc: _t('account.profile.shop.link.publicDesc'), external: true },
  ];
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold">{_t('account.profile.shop.heading')}</h2>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href as any}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition hover:border-brand-300 hover:bg-brand-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{l.label}</p>
                  <p className="text-xs text-slate-500">{l.desc}</p>
                </div>
                {l.external
                  ? <ExternalLink className="h-4 w-4 text-slate-400" />
                  : <span className="text-slate-300">→</span>}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Authenticator ─────────────────────────────────────────────────────────

function AuthenticatorSection({ me }: { me: Me }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  if (!me.authenticator) return null;
  const a = me.authenticator;
  const statusTone =
    a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800'
    : a.status === 'PENDING' ? 'bg-amber-100 text-amber-800'
    : 'bg-slate-100 text-slate-700';
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold">{_t('account.profile.auth.heading')}</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">{_t('account.profile.auth.status')}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
            {a.status}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {_t('account.profile.auth.note')}
        </p>
        <a
          href={`${AUTHENTICATOR_URL}/profile`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {_t('account.profile.auth.goToPortal')} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
