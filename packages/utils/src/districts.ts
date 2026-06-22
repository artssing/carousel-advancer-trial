/**
 * Hong Kong districts SSOT. Used by:
 *   - Authenticator Branch records (Branch.districtKey)
 *   - Listing.sellerDistrict
 *   - Browse / checkout location filters
 *
 * Lesson #8: never hardcode this list elsewhere — always import the helpers.
 * Stored value = enum key (e.g. "MK"); display via districtLabel().
 */

export type DistrictKey =
  | 'CENTRAL' | 'WANCHAI' | 'CWB' | 'NORTH_POINT' | 'QUARRY_BAY' | 'SHAU_KEI_WAN'
  | 'TST' | 'MK' | 'JORDAN' | 'YAU_MA_TEI' | 'PRINCE_EDWARD'
  | 'SHAM_SHUI_PO' | 'KOWLOON_CITY' | 'KWUN_TONG' | 'WONG_TAI_SIN'
  | 'SHA_TIN' | 'TAI_PO' | 'TAI_WAI' | 'FANLING' | 'SHEUNG_SHUI'
  | 'TUEN_MUN' | 'YUEN_LONG' | 'TIN_SHUI_WAI' | 'TSUEN_WAN' | 'KWAI_FONG'
  | 'TUNG_CHUNG' | 'OTHER';

export interface DistrictConfig {
  key: DistrictKey;
  label: string;            // Chinese display label
  region: 'HK' | 'KLN' | 'NT';  // 港島 / 九龍 / 新界
  order: number;
}

export const DISTRICTS: DistrictConfig[] = [
  // ── 港島 (Hong Kong Island) ──
  { key: 'CENTRAL',      label: '中環',           region: 'HK',  order: 1 },
  { key: 'WANCHAI',      label: '灣仔',           region: 'HK',  order: 2 },
  { key: 'CWB',          label: '銅鑼灣',         region: 'HK',  order: 3 },
  { key: 'NORTH_POINT',  label: '北角',           region: 'HK',  order: 4 },
  { key: 'QUARRY_BAY',   label: '鰂魚涌',         region: 'HK',  order: 5 },
  { key: 'SHAU_KEI_WAN', label: '筲箕灣',         region: 'HK',  order: 6 },
  // ── 九龍 (Kowloon) ──
  { key: 'TST',          label: '尖沙咀',         region: 'KLN', order: 10 },
  { key: 'JORDAN',       label: '佐敦',           region: 'KLN', order: 11 },
  { key: 'YAU_MA_TEI',   label: '油麻地',         region: 'KLN', order: 12 },
  { key: 'MK',           label: '旺角',           region: 'KLN', order: 13 },
  { key: 'PRINCE_EDWARD',label: '太子',           region: 'KLN', order: 14 },
  { key: 'SHAM_SHUI_PO', label: '深水埗',         region: 'KLN', order: 15 },
  { key: 'KOWLOON_CITY', label: '九龍城',         region: 'KLN', order: 16 },
  { key: 'KWUN_TONG',    label: '觀塘',           region: 'KLN', order: 17 },
  { key: 'WONG_TAI_SIN', label: '黃大仙',         region: 'KLN', order: 18 },
  // ── 新界 (New Territories) ──
  { key: 'SHA_TIN',      label: '沙田',           region: 'NT',  order: 30 },
  { key: 'TAI_WAI',      label: '大圍',           region: 'NT',  order: 31 },
  { key: 'TAI_PO',       label: '大埔',           region: 'NT',  order: 32 },
  { key: 'FANLING',      label: '粉嶺',           region: 'NT',  order: 33 },
  { key: 'SHEUNG_SHUI',  label: '上水',           region: 'NT',  order: 34 },
  { key: 'TUEN_MUN',     label: '屯門',           region: 'NT',  order: 35 },
  { key: 'YUEN_LONG',    label: '元朗',           region: 'NT',  order: 36 },
  { key: 'TIN_SHUI_WAI', label: '天水圍',         region: 'NT',  order: 37 },
  { key: 'TSUEN_WAN',    label: '荃灣',           region: 'NT',  order: 38 },
  { key: 'KWAI_FONG',    label: '葵芳 / 葵涌',     region: 'NT',  order: 39 },
  { key: 'TUNG_CHUNG',   label: '東涌',           region: 'NT',  order: 40 },
  { key: 'OTHER',        label: '其他',           region: 'NT',  order: 99 },
];

export function allDistricts(): DistrictConfig[] {
  return [...DISTRICTS].sort((a, b) => a.order - b.order);
}

export function districtsByRegion(): Record<'HK' | 'KLN' | 'NT', DistrictConfig[]> {
  const out: Record<'HK' | 'KLN' | 'NT', DistrictConfig[]> = { HK: [], KLN: [], NT: [] };
  for (const d of allDistricts()) out[d.region].push(d);
  return out;
}

/** Resolve a stored districtKey to its display label. Falls back to the key
 *  itself for legacy free-text values not yet migrated. */
export function districtLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return DISTRICTS.find((d) => d.key === key)?.label ?? key;
}

/** Reverse map for backfill: try to recognise a legacy free-text district. */
export function districtKeyFromLabel(label: string | null | undefined): DistrictKey | null {
  if (!label) return null;
  const trimmed = label.trim();
  const hit = DISTRICTS.find((d) => d.label === trimmed || d.key === trimmed.toUpperCase());
  return hit?.key ?? null;
}
