/**
 * MTR heavy-rail network SSOT (lesson #8 — user-pickable enum-like data lives
 * in packages/utils; pages derive via helpers, never hardcode parallel lists).
 *
 * Founder ruling 2026-07-08: seller 所在區域 must be a REAL structured pick —
 * full MTR station network (not the 28-district shortlist), typeahead
 * suggestions while typing, free text never accepted as a final value.
 *
 * Station keys = official MTR 3-letter station codes (stable, printed on
 * station signage / used by MTR open data) — do NOT invent new codes.
 * Light Rail (輕鐵) stops are intentionally excluded — meetup granularity is
 * heavy-rail stations; 輕鐵 riders pick the nearest 屯馬/東鐵 interchange.
 *
 * Stored value on Listing.sellerDistrict = station code string (e.g. "MOK").
 * Legacy values (old DistrictKey enums like "MK", or raw free text) still
 * render via locationLabel()'s fallback chain — zero migration required.
 */

import { districtLabel } from './districts';

export type MTRLineKey =
  | 'ISL' | 'TWL' | 'KTL' | 'TKL' | 'TCL'
  | 'TML' | 'EAL' | 'SIL' | 'AEL' | 'DRL';

export interface MTRLineConfig {
  key: MTRLineKey;
  label: string;   // 繁中 line name
  color: string;   // official MTR line colour (hex) — HK riders' mental model
  /** Station codes in geographic order along the line. */
  stations: string[];
}

export interface MTRStationConfig {
  code: string;    // official MTR station code, e.g. "MOK"
  label: string;   // 繁中 station name (無「站」字 — display adds it)
}

// ── Stations (code → 中文名) ──────────────────────────────────────────────
export const MTR_STATIONS: readonly MTRStationConfig[] = [
  // 港島綫
  { code: 'KET', label: '堅尼地城' }, { code: 'HKU', label: '香港大學' },
  { code: 'SYP', label: '西營盤' },   { code: 'SHW', label: '上環' },
  { code: 'CEN', label: '中環' },     { code: 'ADM', label: '金鐘' },
  { code: 'WAC', label: '灣仔' },     { code: 'CAB', label: '銅鑼灣' },
  { code: 'TIH', label: '天后' },     { code: 'FOH', label: '炮台山' },
  { code: 'NOP', label: '北角' },     { code: 'QUB', label: '鰂魚涌' },
  { code: 'TAK', label: '太古' },     { code: 'SWH', label: '西灣河' },
  { code: 'SKW', label: '筲箕灣' },   { code: 'HFC', label: '杏花邨' },
  { code: 'CHW', label: '柴灣' },
  // 荃灣綫（唔重複 interchange）
  { code: 'TST', label: '尖沙咀' },   { code: 'JOR', label: '佐敦' },
  { code: 'YMT', label: '油麻地' },   { code: 'MOK', label: '旺角' },
  { code: 'PRE', label: '太子' },     { code: 'SSP', label: '深水埗' },
  { code: 'CSW', label: '長沙灣' },   { code: 'LCK', label: '荔枝角' },
  { code: 'MEF', label: '美孚' },     { code: 'LAK', label: '荔景' },
  { code: 'KWF', label: '葵芳' },     { code: 'KWH', label: '葵興' },
  { code: 'TWH', label: '大窩口' },   { code: 'TSW', label: '荃灣' },
  // 觀塘綫
  { code: 'WHA', label: '黃埔' },     { code: 'HOM', label: '何文田' },
  { code: 'SKM', label: '石硤尾' },   { code: 'KOT', label: '九龍塘' },
  { code: 'LOF', label: '樂富' },     { code: 'WTS', label: '黃大仙' },
  { code: 'DIH', label: '鑽石山' },   { code: 'CHH', label: '彩虹' },
  { code: 'KOB', label: '九龍灣' },   { code: 'NTK', label: '牛頭角' },
  { code: 'KWT', label: '觀塘' },     { code: 'LAT', label: '藍田' },
  { code: 'YAT', label: '油塘' },     { code: 'TIK', label: '調景嶺' },
  // 將軍澳綫
  { code: 'TKO', label: '將軍澳' },   { code: 'HAH', label: '坑口' },
  { code: 'POA', label: '寶琳' },     { code: 'LHP', label: '康城' },
  // 東涌綫
  { code: 'HOK', label: '香港' },     { code: 'KOW', label: '九龍' },
  { code: 'OLY', label: '奧運' },     { code: 'NAC', label: '南昌' },
  { code: 'TSY', label: '青衣' },     { code: 'SUN', label: '欣澳' },
  { code: 'TUC', label: '東涌' },
  // 機場快綫 / 迪士尼綫
  { code: 'AIR', label: '機場' },     { code: 'AWE', label: '博覽館' },
  { code: 'DIS', label: '迪士尼' },
  // 南港島綫
  { code: 'OCP', label: '海洋公園' }, { code: 'WCH', label: '黃竹坑' },
  { code: 'LET', label: '利東' },     { code: 'SOH', label: '海怡半島' },
  // 屯馬綫
  { code: 'TUM', label: '屯門' },     { code: 'SIH', label: '兆康' },
  { code: 'TIS', label: '天水圍' },   { code: 'LOP', label: '朗屏' },
  { code: 'YUL', label: '元朗' },     { code: 'KSR', label: '錦上路' },
  { code: 'TWW', label: '荃灣西' },   { code: 'AUS', label: '柯士甸' },
  { code: 'ETS', label: '尖東' },     { code: 'HUH', label: '紅磡' },
  { code: 'TKW', label: '土瓜灣' },   { code: 'SUW', label: '宋皇臺' },
  { code: 'KAT', label: '啟德' },     { code: 'TAW', label: '大圍' },
  { code: 'HIK', label: '顯徑' },     { code: 'CKT', label: '車公廟' },
  { code: 'STW', label: '沙田圍' },   { code: 'CIO', label: '第一城' },
  { code: 'SHM', label: '石門' },     { code: 'TSH', label: '大水坑' },
  { code: 'HEO', label: '恆安' },     { code: 'MOS', label: '馬鞍山' },
  { code: 'WKS', label: '烏溪沙' },
  // 東鐵綫
  { code: 'EXC', label: '會展' },     { code: 'MKK', label: '旺角東' },
  { code: 'SHT', label: '沙田' },     { code: 'FOT', label: '火炭' },
  { code: 'RAC', label: '馬場' },     { code: 'UNI', label: '大學' },
  { code: 'TAP', label: '大埔墟' },   { code: 'TWO', label: '太和' },
  { code: 'FAN', label: '粉嶺' },     { code: 'SHS', label: '上水' },
  { code: 'LOW', label: '羅湖' },     { code: 'LMC', label: '落馬洲' },
] as const;

// ── Lines (geographic station order) ─────────────────────────────────────
export const MTR_LINES: readonly MTRLineConfig[] = [
  {
    key: 'ISL', label: '港島綫', color: '#0075C2',
    stations: ['KET','HKU','SYP','SHW','CEN','ADM','WAC','CAB','TIH','FOH','NOP','QUB','TAK','SWH','SKW','HFC','CHW'],
  },
  {
    key: 'TWL', label: '荃灣綫', color: '#E60012',
    stations: ['CEN','ADM','TST','JOR','YMT','MOK','PRE','SSP','CSW','LCK','MEF','LAK','KWF','KWH','TWH','TSW'],
  },
  {
    key: 'KTL', label: '觀塘綫', color: '#00A040',
    stations: ['WHA','HOM','YMT','MOK','PRE','SKM','KOT','LOF','WTS','DIH','CHH','KOB','NTK','KWT','LAT','YAT','TIK'],
  },
  {
    key: 'TKL', label: '將軍澳綫', color: '#7D499D',
    stations: ['NOP','QUB','YAT','TIK','TKO','HAH','POA','LHP'],
  },
  {
    key: 'TCL', label: '東涌綫', color: '#F7943E',
    stations: ['HOK','KOW','OLY','NAC','LAK','TSY','SUN','TUC'],
  },
  {
    key: 'TML', label: '屯馬綫', color: '#9C5E31',
    stations: ['TUM','SIH','TIS','LOP','YUL','KSR','TWW','MEF','NAC','AUS','ETS','HUH','HOM','TKW','SUW','KAT','DIH','HIK','TAW','CKT','STW','CIO','SHM','TSH','HEO','MOS','WKS'],
  },
  {
    key: 'EAL', label: '東鐵綫', color: '#53B7E8',
    stations: ['ADM','EXC','HUH','MKK','KOT','TAW','SHT','FOT','RAC','UNI','TAP','TWO','FAN','SHS','LOW','LMC'],
  },
  {
    key: 'SIL', label: '南港島綫', color: '#CBD300',
    stations: ['ADM','OCP','WCH','LET','SOH'],
  },
  {
    key: 'AEL', label: '機場快綫', color: '#00888A',
    stations: ['HOK','KOW','TSY','AIR','AWE'],
  },
  {
    key: 'DRL', label: '迪士尼綫', color: '#F173AC',
    stations: ['SUN','DIS'],
  },
] as const;

const STATION_BY_CODE = new Map(MTR_STATIONS.map((s) => [s.code, s]));
const LINE_BY_KEY = new Map(MTR_LINES.map((l) => [l.key, l]));

// ── Whole-line candidate tokens ───────────────────────────────────────────
// Founder 2026-07-08: seller can offer an ENTIRE line (成條荃灣綫) as one
// candidate. Stored token = "LINE:<lineKey>" inside the same CSV column —
// prefixed so it can never collide with a station code or legacy value.
const LINE_TOKEN_PREFIX = 'LINE:';

export function lineToken(key: MTRLineKey): string {
  return `${LINE_TOKEN_PREFIX}${key}`;
}

/** Parse a stored token back to its line config, or null if not a line token. */
export function lineFromToken(token: string): MTRLineConfig | null {
  if (!token.startsWith(LINE_TOKEN_PREFIX)) return null;
  return LINE_BY_KEY.get(token.slice(LINE_TOKEN_PREFIX.length) as MTRLineKey) ?? null;
}

/** Station config by official code, or null. */
export function mtrStation(code: string | null | undefined): MTRStationConfig | null {
  if (!code) return null;
  return STATION_BY_CODE.get(code) ?? null;
}

/** Lines serving a station (for line-colour badges next to suggestions). */
export function linesForStation(code: string): MTRLineConfig[] {
  return MTR_LINES.filter((l) => l.stations.includes(code));
}

/** Ordered stations of one line (geographic order). */
export function stationsOfLine(key: MTRLineKey): MTRStationConfig[] {
  const line = MTR_LINES.find((l) => l.key === key);
  if (!line) return [];
  return line.stations
    .map((c) => STATION_BY_CODE.get(c))
    .filter((s): s is MTRStationConfig => !!s);
}

/**
 * Typeahead: match stations whose 中文名 contains the query (also matches
 * station code, case-insensitive). Empty query returns [].
 */
export function searchStations(query: string, limit = 8): MTRStationConfig[] {
  const q = query.trim();
  if (!q) return [];
  const qUpper = q.toUpperCase();
  return MTR_STATIONS
    .filter((s) => s.label.includes(q) || s.code === qUpper)
    .slice(0, limit);
}

/**
 * Parse a stored sellerDistrict value into station codes / legacy tokens.
 * Multi-candidate picks are stored CSV in the same String? column
 * (e.g. "MOK,TST") — zero schema migration.
 */
export function stationCodesFromValue(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Display resolver for stored location values — fallback chain per token:
 *   1. whole-line token "LINE:TWL" → 「荃灣綫沿綫」
 *   2. MTR station code → 「旺角站」
 *   3. legacy DistrictKey enum → districtLabel() → 「旺角」
 *   4. legacy raw free text → as-is (self-heals when the seller re-picks
 *      through the structured picker).
 * CSV multi-candidate values render joined: 「荃灣綫沿綫 · 旺角站」.
 */
export function stationDisplayLabel(value: string | null | undefined): string | null {
  const tokens = stationCodesFromValue(value);
  if (tokens.length === 0) return null;
  return tokens
    .map((t) => {
      const line = lineFromToken(t);
      if (line) return `${line.label}沿綫`;
      const st = STATION_BY_CODE.get(t);
      if (st) return `${st.label}站`;
      return districtLabel(t) ?? t;
    })
    .join(' · ');
}
