'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@authentik/ui';
import { api, setToken, ApiError } from '@/lib/api';
import { normalizeHKPhone, formatHKPhoneDisplay } from '@authentik/utils';

type Step = 'BASIC' | 'PHONE_INPUT' | 'PHONE_OTP' | 'DONE';

export default function RegisterPage() {
  const router = useRouter();
  // Step 1 — basic account
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('BASIC');

  // Step 2 — optional phone
  const [phoneInput, setPhoneInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const phoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (otpSentAt) {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [otpSentAt]);

  const resendCooldownSec = otpSentAt
    ? Math.max(0, 60 - Math.floor((now - otpSentAt) / 1000))
    : 0;

  async function onSubmitBasic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.register({ email, password, displayName });
      setToken(res.accessToken);
      setStep('PHONE_INPUT');
    } catch (err: any) {
      setError(err.message ?? '註冊失敗');
    } finally {
      setLoading(false);
    }
  }

  async function onSendOtp() {
    setError(null);
    const normalised = normalizeHKPhone(phoneInput);
    if (!normalised) {
      setError('請輸入有效嘅香港 8 位手機號碼（5/6/8/9 字頭）');
      return;
    }
    setLoading(true);
    try {
      await api.phoneSendOtp(normalised, 'REGISTER_PHONE');
      phoneRef.current = normalised;
      setOtpSentAt(Date.now());
      setStep('PHONE_OTP');
    } catch (err: any) {
      setError(err.message ?? '發送驗証碼失敗');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    setError(null);
    if (!phoneRef.current) { setStep('PHONE_INPUT'); return; }
    if (otpCode.length !== 6) { setError('請輸入 6 位驗証碼'); return; }
    setLoading(true);
    try {
      await api.phoneVerifyOtp(phoneRef.current, otpCode, 'REGISTER_PHONE');
      setStep('DONE');
      setTimeout(() => { router.push('/'); router.refresh(); }, 1200);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setError('此手機號碼已連結另一個帳戶');
      } else {
        setError(err.message ?? '驗証失敗');
      }
    } finally {
      setLoading(false);
    }
  }

  function onSkipPhone() {
    router.push('/');
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>
            {step === 'BASIC' && '建立帳戶'}
            {step === 'PHONE_INPUT' && '加入手機號碼（選填）'}
            {step === 'PHONE_OTP' && '驗証手機號碼'}
            {step === 'DONE' && '完成！'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Dev mode banner — Lesson #11 */}
          {step !== 'BASIC' && step !== 'DONE' && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              [開發模式] OTP 驗証碼喺 API console 印出，唔會發送真實短訊。固定驗証碼：<code className="font-mono font-bold">888888</code>
            </p>
          )}

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {step === 'BASIC' && (
            <form onSubmit={onSubmitBasic} className="space-y-3">
              <div>
                <Label htmlFor="name">顯示名稱</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="email">電郵</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="pw">密碼（至少 6 字）</Label>
                <Input id="pw" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '建立中…' : '下一步'}
              </Button>
              <p className="text-center text-xs text-slate-500">
                已有帳戶？<Link href="/login" className="text-brand-600 hover:underline">立即登入</Link>
              </p>
            </form>
          )}

          {step === 'PHONE_INPUT' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                綁定手機可日後用作快速登入 + 接收重要交易通知。可以稍後再加。
              </p>
              <div>
                <Label htmlFor="phone">手機號碼</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">+852</span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="9123 4567"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <Button onClick={onSendOtp} className="w-full" disabled={loading || !phoneInput}>
                {loading ? '發送中…' : '發送驗証碼'}
              </Button>
              <button
                type="button"
                onClick={onSkipPhone}
                className="block w-full text-center text-xs text-slate-400 underline hover:text-slate-600"
              >
                跳過呢一步
              </button>
            </div>
          )}

          {step === 'PHONE_OTP' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                驗証碼已發送到 <span className="font-medium text-slate-700">{phoneRef.current ? formatHKPhoneDisplay(phoneRef.current) : ''}</span>
              </p>
              <div>
                <Label htmlFor="otp">6 位驗証碼</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="mt-1 text-center font-mono text-2xl tracking-[0.5em]"
                  autoFocus
                />
              </div>
              <Button onClick={onVerifyOtp} className="w-full" disabled={loading || otpCode.length !== 6}>
                {loading ? '驗証中…' : '確認'}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setStep('PHONE_INPUT'); setOtpCode(''); setError(null); }}
                  className="text-slate-500 underline hover:text-slate-700"
                >
                  返回修改號碼
                </button>
                <button
                  type="button"
                  onClick={onSendOtp}
                  disabled={resendCooldownSec > 0 || loading}
                  className="text-brand-600 disabled:text-slate-300"
                >
                  {resendCooldownSec > 0 ? `重新發送（${resendCooldownSec}s）` : '重新發送'}
                </button>
              </div>
            </div>
          )}

          {step === 'DONE' && (
            <div className="space-y-2 py-6 text-center">
              <p className="text-2xl">✓</p>
              <p className="font-semibold text-emerald-700">手機已成功綁定</p>
              <p className="text-xs text-slate-500">即將跳轉…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
