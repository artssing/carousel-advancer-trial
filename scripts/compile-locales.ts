/**
 * compile-locales.ts
 *
 * Reads locales/ssot.json and generates packages/utils/src/locales/data.ts
 * with flat key→value maps for zh and en.
 *
 * Run: npx tsx scripts/compile-locales.ts
 * Run before: npm run build (inside packages/utils)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SSOT_PATH = path.join(ROOT, 'locales', 'ssot.json');
const OUT_PATH = path.join(ROOT, 'packages', 'utils', 'src', 'locales', 'data.ts');

interface SsotEntry {
  zh: string;
  en: string;
}

interface SsotNamespace {
  [key: string]: SsotEntry;
}

interface SsotJson {
  [namespace: string]: SsotNamespace;
}

function flatten(ssot: SsotJson): { zh: Record<string, string>; en: Record<string, string> } {
  const zh: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const [ns, keys] of Object.entries(ssot)) {
    for (const [key, entry] of Object.entries(keys)) {
      const flatKey = `${ns}.${key}`;
      zh[flatKey] = entry.zh;
      en[flatKey] = entry.en || entry.zh; // fallback to zh if en empty
    }
  }
  return { zh, en };
}

function formatMap(obj: Record<string, string>): string {
  const entries = Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      // Escape backticks and template literals
      const escaped = v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
      return `  "${k}": \`${escaped}\``;
    });
  return `{\n${entries.join(',\n')}\n}`;
}

// Read SSOT
const raw = fs.readFileSync(SSOT_PATH, 'utf-8');
const ssot: SsotJson = JSON.parse(raw);
const { zh, en } = flatten(ssot);

// Generate .ts file
const ts = `// Auto-generated from locales/ssot.json — DO NOT EDIT BY HAND
// Run: npx tsx scripts/compile-locales.ts

export type TKey = keyof typeof zhMap;

export const zhMap: Record<string, string> = ${formatMap(zh)};

export const enMap: Record<string, string> = ${formatMap(en)};

export const DEFAULT_LOCALE: TLocale = 'zh';
export type TLocale = 'zh' | 'en';
`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, ts, 'utf-8');

const zhCount = Object.keys(zh).length;
console.log(`✓ Compiled ${zhCount} locale entries`);
console.log(`  → ${OUT_PATH}`);
