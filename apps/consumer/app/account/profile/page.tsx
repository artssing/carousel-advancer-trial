'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent } from '@authentik/ui';
import { api, hasToken, clearToken, ApiError, AUTH_CHANGE_EVENT } from '@/lib/api';
import {
  User as UserIcon, Lock, Store, ShieldCheck, ExternalLink, Camera,
  Check, AlertTriangle, Loader2, Mail, Eye, EyeOff, Phone,
} from 'lucide-react';
import { formatHKPhoneDisplay } from '@authentik/utils';

const AUTHENTICATOR_URL = process.env.NEXT_PUBLIC_AUTHENTICATOR_URL ?? 'http://localhost:3001';

type Section = 'personal' | 'security' | 'shop' | 'authenticator';

type Me = Awaited<ReturnType<typeof api.me>>;

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('personal');

  useEffect(() => {
    if (!hasToken()) { router.replace('/login?next=/account/profile'); return; }
    api.me().then(setMe).catch((e: any) => {
      if (e?.status === 401) { clearToken(); router.replace('/login'); }
      else setError(e?.message ?? '載入失敗');
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="mx-auto max-w-5xl p-6 text-sm text-slate-500">載入中…</div>;
  if (error) return <div className="mx-auto max-w-5xl p-6 text-sm text-red-600">{error}</div>;
  if (!me) return null;

  const isSeller = me.roles.includes('SELLER');
  const isAuth = !!me.authenticator;

  const sections: Array<{ key: Section; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'personal', label: '個人資料', icon: <UserIcon className="h-4 w-4" />, show: true },
    { key: 'security', label: '帳號與安全', icon: <Lock className="h-4 w-4" />, show: true },
    { key: 'shop', label: '我的商店', icon: <Store className="h-4 w-4" />, show: isSeller },
    { key: 'authenticator', label: '鑑定師 Portal', icon: <ShieldCheck className="h-4 w-4" />, show: isAuth },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">我的帳號</h1>
        <p className="mt-1 text-xs text-slate-500">
          管理你嘅個人資料、密碼同帳號設定。
          {isSeller && (
            <>
              其他人喺賣家頁見到嘅資料：
              <Link href={`/seller/${me.id}`} className="ml-1 text-brand-600 hover:underline">查看公開頁面 →</Link>
            </>
          )}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* Sidebar (desktop) / Tab strip (mobile) */}
        <aside className="md:sticky md:top-20 md:self-start">
          <nav className="flex gap-2 overflow-x-auto md:flex-col md:gap-1">
            {sections.filter((s) => s.show).map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  section === s.key
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-4">
          {section === 'personal' && <PersonalSection me={me} onChange={setMe} />}
          {section === 'security' && <SecuritySection me={me} />}
          {section === 'shop' && isSeller && <ShopSection me={me} />}
          {section === 'authenticator' && isAuth && <AuthenticatorSection me={me} />}
        </div>
      </div>
    </div>
  );
}

// ─── Personal ───────────────────────────────────────────────────────────────

function PersonalSection({ me, onChange }: { me: Me; onChange: (m: Me) => void }) {
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
      setErr('只接受圖片檔案'); return;
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

  function applyCrop() {
    if (!cropImg) return;
    const size = 200;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    // Cover-fit base ratio so the smaller side fills the viewport (no letterbox).
    const baseRatio = Math.max(size / cropImg.width, size / cropImg.height);
    const ratio = baseRatio * zoom;
    const w = cropImg.width * ratio;
    const h = cropImg.height * ratio;
    // tx/ty are in viewport pixels — translate the image by that amount.
    ctx.drawImage(cropImg, (size - w) / 2 + tx, (size - h) / 2 + ty, w, h);
    const data = c.toDataURL('image/jpeg', 0.85);
    if (data.length > 256 * 1024) {
      setErr('Avatar 仍然太大，請揀細啲嘅圖');
      return;
    }
    setAvatarUrl(data);
    // Persist the compressed source + crop params so the customer can
    // re-open the cropper later without re-uploading.
    setAvatarOriginalUrl(cropSrc);
    setAvatarCropZoom(zoom);
    setAvatarCropX(tx);
    setAvatarCropY(ty);
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
    if (!dragRef.current) return;
    setTx(dragRef.current.startTx + (e.clientX - dragRef.current.startX));
    setTy(dragRef.current.startTy + (e.clientY - dragRef.current.startY));
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
      setErr(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const initial = (displayName || me.email).slice(0, 1).toUpperCase();

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <h2 className="text-base font-semibold">個人資料</h2>

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
              aria-label="更換頭像"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          </div>
          <div className="text-xs text-slate-500">
            <p>JPG / PNG · 自動壓縮成 200×200</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {avatarOriginalUrl && !cropSrc && (
                <button onClick={recropExisting} className="text-brand-600 hover:underline">
                  再次調整位置
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
                  移除頭像
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Crop editor — opens after picking a file. Drag to reposition + zoom slider. */}
        {cropSrc && cropImg && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-medium text-slate-700">調整頭像位置</p>
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
                  <span className="block">縮放</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="mt-1 w-full"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-400">拖拉頭像可微調位置</span>
                </label>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyCrop}>確認</Button>
                  <Button size="sm" variant="outline" onClick={cancelCrop}>取消</Button>
                  <Button size="sm" variant="outline" onClick={() => { setZoom(1); setTx(0); setTy(0); }}>重設</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DisplayName */}
        <label className="block text-sm">
          <span className="block text-slate-700">顯示名稱</span>
          <input
            type="text"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="mt-1 block text-xs text-slate-500">
            其他用戶喺賣家頁 / 對話 / 評價會見到呢個名字。
          </span>
        </label>

        {/* Other fields P1 placeholder */}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          📌 電話、地區、自我介紹、頭像庫等功能即將推出。
        </div>

        {err && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '儲存變更'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-700">
              <Check className="h-3 w-3" /> 已儲存
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Security ──────────────────────────────────────────────────────────────

function SecuritySection({ me }: { me: Me }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-base font-semibold">電郵地址</h2>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Mail className="h-4 w-4 text-slate-400" />
            <span className="flex-1">{me.email}</span>
            <Lock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500">
            Email 唔可以更改。如需更換，請聯絡 <a className="text-brand-600 hover:underline" href="mailto:support@authentik.hk">support@authentik.hk</a>。
          </p>
        </CardContent>
      </Card>

      {/* Mobile phone — read-only. Founder ruling 2026-06-19: 帳號與安全
          顯示 phone，但唔可以喺呢度更改（管理 phone 嘅 UI 屬 backlog）。 */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-base font-semibold">手機號碼</h2>
          {me.phone && me.phoneVerified ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Phone className="h-4 w-4 text-slate-400" />
                <span className="flex-1 font-mono">{formatHKPhoneDisplay(me.phone)}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">已驗証</span>
                <Lock className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">
                手機號碼唔可以喺呢度更改。如需更換，請聯絡 <a className="text-brand-600 hover:underline" href="mailto:support@authentik.hk">support@authentik.hk</a>。
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Phone className="h-4 w-4 text-amber-500" />
                <span className="flex-1">尚未綁定手機號碼</span>
              </div>
              <p className="text-xs text-slate-500">
                綁定手機可以日後用作快速登入 + 接收重要交易通知。綁定功能稍後推出。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <PasswordCard />

      <Card>
        <CardContent className="p-5">
          <h2 className="text-base font-semibold">帳戶資訊</h2>
          <dl className="mt-2 space-y-1 text-sm text-slate-700">
            <div className="flex justify-between"><dt className="text-slate-500">帳戶 ID</dt><dd className="font-mono text-xs">{me.id}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">加入日期</dt><dd>{new Date(me.createdAt).toLocaleDateString('zh-HK')}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">角色</dt><dd className="text-xs">{me.roles.join(' · ')}</dd></div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordCard() {
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
    if (!cur) { setErr('請輸入現有密碼'); return; }
    // Server validates correctness on final submit; if wrong, returns to OLD step.
    setStep('NEW');
  }

  async function submit() {
    setErr(null);
    if (next1.length < 8) { setErr('新密碼至少 8 個字符'); return; }
    if (next1 !== next2) { setErr('兩次輸入嘅新密碼唔一致'); return; }
    if (next1 === cur) { setErr('新密碼不能同舊密碼一樣'); return; }
    setBusy(true);
    try {
      await api.changePassword(cur, next1);
      reset();
      setOpen(false);
      setPostChange(true); // Show Q1 prompt
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '密碼修改失敗';
      setErr(msg);
      // Old-password wrong → bounce back to step 1 so user re-enters
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
        <h2 className="text-base font-semibold">登入密碼</h2>
        {!open ? (
          <>
            <p className="text-sm text-slate-600">為帳戶安全，建議定期更換密碼。</p>
            <Button variant="secondary" onClick={() => setOpen(true)}>修改密碼</Button>
          </>
        ) : (
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
              <span className={step === 'OLD' ? 'text-brand-700' : 'text-emerald-600'}>
                {step === 'NEW' && <Check className="mr-0.5 inline h-3 w-3" />}1. 驗證現有密碼
              </span>
              <span className="text-slate-300">›</span>
              <span className={step === 'NEW' ? 'text-brand-700' : 'text-slate-400'}>2. 設定新密碼</span>
            </div>

            {step === 'OLD' ? (
              <>
                <label className="block text-sm">
                  <span className="block text-slate-700">現有密碼</span>
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
                  <Button variant="secondary" onClick={() => { reset(); setOpen(false); }} className="flex-1">取消</Button>
                  <Button onClick={onNextFromOld} disabled={!cur} className="flex-1">下一步</Button>
                </div>
              </>
            ) : (
              <>
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  ✓ 已驗證現有密碼 — 請設定新密碼
                </p>
                <label className="block text-sm">
                  <span className="block text-slate-700">新密碼</span>
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
                  <span className="mt-1 block text-xs text-slate-500">至少 8 個字符。建議混合大小寫、數字。</span>
                </label>
                <label className="block text-sm">
                  <span className="block text-slate-700">再次確認新密碼</span>
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={next2}
                    onChange={(e) => setNext2(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                {err && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep('OLD')} className="flex-1">返回</Button>
                  <Button onClick={submit} disabled={busy || !next1 || !next2} className="flex-1">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '更新密碼'}
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
                <h3 className="text-base font-semibold">密碼已更新</h3>
              </div>
              <p className="text-sm text-slate-600">
                為咗安全起見，建議重新登入所有裝置。
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => setPostChange(false)} className="flex-1">保持登入</Button>
                <Button onClick={logoutAndRedirect} className="flex-1">重新登入</Button>
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
  const links = [
    { href: '/my-listings', label: '我的商品', desc: '管理上架商品、查看銷售統計' },
    { href: '/orders', label: '我的訂單', desc: '買入 / 賣出訂單' },
    { href: '/account/wallet', label: '我的錢包', desc: '提取銷售收入' },
    { href: `/seller/${me.id}`, label: '查看公開賣家頁面', desc: '其他用戶睇到嘅你', external: true },
  ];
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold">我的商店</h2>
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
  if (!me.authenticator) return null;
  const a = me.authenticator;
  const statusTone =
    a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800'
    : a.status === 'PENDING' ? 'bg-amber-100 text-amber-800'
    : 'bg-slate-100 text-slate-700';
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold">鑑定師 Portal</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">狀態</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
            {a.status}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          你嘅鑑定師資料（店名、收費、分店等）喺鑑定師專用 portal 管理。
        </p>
        <a
          href={`${AUTHENTICATOR_URL}/profile`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          前往鑑定師 Portal <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
