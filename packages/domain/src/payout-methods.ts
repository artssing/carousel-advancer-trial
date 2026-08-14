/**
 * Payout method SSOT — keep in sync with Prisma `PayoutMethodType` enum.
 * UI 揀 method、format、validate 全部 derive 自呢度，唔可以 page 自己定義 parallel list。
 */

export type PayoutMethodTypeKey = 'FPS_PHONE' | 'FPS_EMAIL' | 'FPS_ID' | 'BANK_LOCAL';

export interface PayoutMethodTypeMeta {
  key: PayoutMethodTypeKey;
  label: string;        // 繁中（HK）label
  shortLabel: string;   // chip / list 短 label
  icon: string;
  placeholder: string;
  helper: string;       // input helper / hint
  /** 是否需要 bankCode 額外 input */
  needsBank: boolean;
}

export const PAYOUT_METHOD_TYPES: readonly PayoutMethodTypeMeta[] = [
  {
    key: 'FPS_PHONE',
    label: '轉數快（手機號碼）',
    shortLabel: 'FPS 手機',
    icon: '📱',
    placeholder: '+852 5123 4567',
    helper: '請輸入已綁定轉數快嘅手機號碼，含國家碼或本地號碼。',
    needsBank: false,
  },
  {
    key: 'FPS_EMAIL',
    label: '轉數快（電郵）',
    shortLabel: 'FPS 電郵',
    icon: '✉️',
    placeholder: 'name@example.com',
    helper: '請輸入已綁定轉數快嘅電郵地址。',
    needsBank: false,
  },
  {
    key: 'FPS_ID',
    label: '轉數快（FPS ID）',
    shortLabel: 'FPS ID',
    icon: '🔢',
    placeholder: '1234567',
    helper: '7 位數字 FPS Identifier。',
    needsBank: false,
  },
  {
    key: 'BANK_LOCAL',
    label: '本地銀行戶口',
    shortLabel: '銀行',
    icon: '🏦',
    placeholder: '012-345-67890123',
    helper: '請揀銀行 + 輸入完整戶口號碼（含分行）。',
    needsBank: true,
  },
] as const;

export function payoutMethodLabel(key: PayoutMethodTypeKey): string {
  return PAYOUT_METHOD_TYPES.find((m) => m.key === key)?.label ?? key;
}

export function payoutMethodIcon(key: PayoutMethodTypeKey): string {
  return PAYOUT_METHOD_TYPES.find((m) => m.key === key)?.icon ?? '💳';
}

/** HK clearing-code → bank name. Source: HKMA. */
export const HK_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '003', name: 'Standard Chartered Bank (HK)' },
  { code: '004', name: 'HSBC' },
  { code: '009', name: 'China Construction Bank (Asia)' },
  { code: '012', name: 'Bank of China (HK)' },
  { code: '015', name: 'Bank of East Asia' },
  { code: '016', name: 'DBS Bank (HK)' },
  { code: '018', name: 'China CITIC Bank International' },
  { code: '020', name: 'Hang Seng Bank' },
  { code: '024', name: 'Hang Seng (private)' },
  { code: '025', name: 'Wing Lung Bank / CMB Wing Lung' },
  { code: '027', name: 'Bank of Communications (HK)' },
  { code: '028', name: 'Public Bank (Hong Kong)' },
  { code: '035', name: 'OCBC Wing Hang' },
  { code: '038', name: 'Tai Sang Bank' },
  { code: '039', name: 'Chiyu Banking Corporation' },
  { code: '040', name: 'Dah Sing Bank' },
  { code: '041', name: 'Chong Hing Bank' },
  { code: '043', name: 'Nanyang Commercial Bank' },
  { code: '061', name: 'Tai Yau Bank' },
  { code: '072', name: 'Industrial and Commercial Bank of China (Asia)' },
  { code: '128', name: 'Fubon Bank (HK)' },
  { code: '250', name: 'Citibank (HK)' },
  { code: '388', name: 'ZA Bank' },
  { code: '390', name: 'Airstar Bank' },
  { code: '391', name: 'WeLab Bank' },
  { code: '392', name: 'Mox Bank' },
  { code: '393', name: 'PAObank' },
  { code: '395', name: 'Livi Bank' },
];

export function bankName(code: string | null | undefined): string {
  if (!code) return '';
  return HK_BANKS.find((b) => b.code === code)?.name ?? `Bank ${code}`;
}

/** Mask account identifier for display (***1234). */
export function maskAccount(identifier: string, keep = 4): string {
  const digits = identifier.replace(/\s+/g, '');
  if (digits.length <= keep) return digits;
  return '****' + digits.slice(-keep);
}

/** Validate without throwing — returns { ok, reason? } */
export function validatePayoutAccount(
  type: PayoutMethodTypeKey,
  identifier: string,
  bankCode?: string,
): { ok: boolean; reason?: string } {
  const v = identifier.trim();
  if (!v) return { ok: false, reason: '請輸入帳戶資料' };
  switch (type) {
    case 'FPS_PHONE': {
      const digits = v.replace(/\D+/g, '');
      if (digits.length < 8) return { ok: false, reason: '電話號碼太短' };
      if (digits.length > 15) return { ok: false, reason: '電話號碼太長' };
      return { ok: true };
    }
    case 'FPS_EMAIL':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, reason: '電郵格式錯誤' };
      return { ok: true };
    case 'FPS_ID': {
      const digits = v.replace(/\D+/g, '');
      if (digits.length < 6 || digits.length > 9) return { ok: false, reason: 'FPS ID 應為 6–9 位數字' };
      return { ok: true };
    }
    case 'BANK_LOCAL': {
      if (!bankCode) return { ok: false, reason: '請揀銀行' };
      if (!HK_BANKS.some((b) => b.code === bankCode)) return { ok: false, reason: '銀行代碼無效' };
      const digits = v.replace(/[\s-]+/g, '');
      if (digits.length < 6 || digits.length > 17) return { ok: false, reason: '戶口號碼長度不正確' };
      return { ok: true };
    }
  }
}

/** Display label combining method + masked identifier. */
export function payoutMethodDisplayLabel(
  type: PayoutMethodTypeKey,
  identifier: string,
  bankCode?: string | null,
): string {
  const meta = PAYOUT_METHOD_TYPES.find((m) => m.key === type);
  const masked = type === 'FPS_EMAIL'
    ? identifier.replace(/^(.{2}).+(@.+)$/, '$1***$2')
    : maskAccount(identifier);
  if (type === 'BANK_LOCAL') return `${bankName(bankCode)} ${masked}`;
  return `${meta?.shortLabel ?? type} ${masked}`;
}

// ── Cashout limits (P0) ─────────────────────────────────────────────
export const PAYOUT_MIN_HKD = 50;
export const PAYOUT_MAX_HKD = 50_000;

// ── Status labels ───────────────────────────────────────────────────
export type PayoutStatusKey = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REVERSED';

export const PAYOUT_STATUS_META: Record<
  PayoutStatusKey,
  { label: string; tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate' }
> = {
  PENDING:    { label: '待處理',  tone: 'amber'   },
  PROCESSING: { label: '處理中',  tone: 'blue'    },
  SUCCEEDED:  { label: '已完成',  tone: 'emerald' },
  FAILED:     { label: '失敗',    tone: 'red'     },
  REVERSED:   { label: '已撤回',  tone: 'slate'   },
};

/** Generate a human-readable reference. "PO-YYYYMMDD-XXXX" */
export function generatePayoutReference(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${y}${m}${d}-${rand}`;
}
