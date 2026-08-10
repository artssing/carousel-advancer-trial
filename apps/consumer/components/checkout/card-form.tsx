'use client';

/** Full credit card form — BIN-aware formatting, Luhn on blur, auto-tab between
 *  fields, inline validation. Mock-mode: parent passes selected card number
 *  for visual debugging; production: stripe Elements would replace this. */
import { useRef, useState, useEffect } from 'react';
import { getClientLocale, createT } from '@authentik/utils';
import {
  BRAND_SPECS, detectBrand, digitsOnly, formatCardNumber, formatExpiry,
  luhnCheck, validateExpiry, validateCardholderName, type CardBrand,
} from '@/lib/payment-methods';

export interface CardFormValue {
  number: string;          // digits only
  expiry: string;          // "MMYY" digits
  cvv: string;
  name: string;
  brand: CardBrand;
}

export interface CardFormProps {
  value: CardFormValue;
  onChange: (v: CardFormValue) => void;
  /** When true, parent will read errors and gate submit */
  showErrors: boolean;
}

const BRAND_BADGE: Record<CardBrand, string> = {
  visa: 'VISA', mc: 'Mastercard', amex: 'Amex', unionpay: 'UnionPay', unknown: '',
};

export function CardForm({ value, onChange, showErrors }: CardFormProps) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const brand = detectBrand(value.number);
  const spec = BRAND_SPECS[brand];
  const numberError = touched.number || showErrors
    ? (value.number.length !== spec.length ? _t('checkout.card.error.numberLength', { len: spec.length }) :
       !luhnCheck(value.number) ? _t('checkout.card.error.numberInvalid') : null)
    : null;
  const expiryError = touched.expiry || showErrors
    ? (value.expiry.length < 4 ? _t('checkout.card.error.expiryRequired')
       : validateExpiry(value.expiry).reason ? _t(validateExpiry(value.expiry).reason!) : null)
    : null;
  const cvvError = touched.cvv || showErrors
    ? (value.cvv.length !== spec.cvvLength ? _t('checkout.card.error.cvvLength', { len: spec.cvvLength }) : null)
    : null;
  const nameError = touched.name || showErrors
    ? (validateCardholderName(value.name).reason ? _t(validateCardholderName(value.name).reason!) : null)
    : null;

  // Sync brand to parent whenever it changes
  useEffect(() => {
    if (brand !== value.brand) onChange({ ...value, brand });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  function handleNumber(raw: string) {
    const d = digitsOnly(raw).slice(0, spec.length);
    onChange({ ...value, number: d, brand: detectBrand(d) });
    if (d.length === spec.length) expiryRef.current?.focus();
  }
  function handleExpiry(raw: string) {
    const d = digitsOnly(raw).slice(0, 4);
    onChange({ ...value, expiry: d });
    if (d.length === 4) cvvRef.current?.focus();
  }
  function handleCvv(raw: string) {
    const d = digitsOnly(raw).slice(0, spec.cvvLength);
    onChange({ ...value, cvv: d });
    // No auto-advance — prevents accidental submit
  }
  function handleName(raw: string) {
    onChange({ ...value, name: raw.slice(0, 60) });
  }

  return (
    <div className="space-y-3">
      {/* Card number */}
      <div>
        <label className="text-xs font-medium text-slate-700">{_t('checkout.card.numberLabel')}</label>
        <div className="relative mt-1">
          <input
            type="text"
            value={formatCardNumber(value.number, brand)}
            onChange={(e) => handleNumber(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, number: true }))}
            placeholder="1234 5678 9012 3456"
            inputMode="numeric"
            autoComplete="cc-number"
            className={`h-11 w-full rounded-lg border bg-white px-3 pr-20 font-mono text-sm tracking-wider outline-none transition ${
              numberError ? 'border-rose-400 focus:ring-2 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
            }`}
            aria-invalid={!!numberError}
          />
          {brand !== 'unknown' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {BRAND_BADGE[brand]}
            </span>
          )}
        </div>
        {numberError && <p className="mt-1 text-[11px] text-rose-600">{numberError}</p>}
      </div>

      {/* Expiry + CVV side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">{_t('checkout.card.expiryLabel')}</label>
          <input
            ref={expiryRef}
            type="text"
            value={formatExpiry(value.expiry)}
            onChange={(e) => handleExpiry(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, expiry: true }))}
            placeholder="MM / YY"
            inputMode="numeric"
            autoComplete="cc-exp"
            className={`mt-1 h-11 w-full rounded-lg border bg-white px-3 font-mono text-sm tracking-wider outline-none transition ${
              expiryError ? 'border-rose-400' : 'border-slate-300 focus:border-brand-400'
            }`}
            aria-invalid={!!expiryError}
          />
          {expiryError && <p className="mt-1 text-[11px] text-rose-600">{expiryError}</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">
            CVV{' '}
            <span className="text-slate-400" title={brand === 'amex' ? _t('checkout.card.cvvHintAmex') : _t('checkout.card.cvvHint')}>
              ⓘ
            </span>
          </label>
          <input
            ref={cvvRef}
            type="text"
            value={value.cvv}
            onChange={(e) => handleCvv(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, cvv: true }))}
            placeholder={spec.cvvLength === 4 ? _t('checkout.card.cvvPlaceholder4') : _t('checkout.card.cvvPlaceholder3')}
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={spec.cvvLength}
            className={`mt-1 h-11 w-full rounded-lg border bg-white px-3 font-mono text-sm tracking-wider outline-none transition ${
              cvvError ? 'border-rose-400' : 'border-slate-300 focus:border-brand-400'
            }`}
            aria-invalid={!!cvvError}
          />
          {cvvError && <p className="mt-1 text-[11px] text-rose-600">{cvvError}</p>}
        </div>
      </div>

      {/* Cardholder name */}
      <div>
        <label className="text-xs font-medium text-slate-700">{_t('checkout.card.nameLabel')}</label>
        <input
          ref={nameRef}
          type="text"
          value={value.name}
          onChange={(e) => handleName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="CHAN TAI MAN"
          autoComplete="cc-name"
          className={`mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm uppercase outline-none transition ${
            nameError ? 'border-rose-400' : 'border-slate-300 focus:border-brand-400'
          }`}
          aria-invalid={!!nameError}
        />
        {nameError && <p className="mt-1 text-[11px] text-rose-600">{nameError}</p>}
      </div>

      {/* Save card — disabled with Phase 2 label (lesson #11) */}
      <label className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <input type="checkbox" disabled className="h-3.5 w-3.5" />
        <span>{_t('checkout.card.saveCard')}</span>
        <span className="ml-auto rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">Phase 2</span>
      </label>
    </div>
  );
}

/** Return true iff form passes all validations — caller gates submit. */
export function isCardFormValid(v: CardFormValue): boolean {
  const spec = BRAND_SPECS[v.brand];
  return (
    v.number.length === spec.length &&
    luhnCheck(v.number) &&
    v.expiry.length === 4 &&
    validateExpiry(v.expiry).ok &&
    v.cvv.length === spec.cvvLength &&
    validateCardholderName(v.name).ok
  );
}
