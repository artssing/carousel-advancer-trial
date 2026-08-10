/**
 * Fail if any t()/_t() call names a key that does not exist in locales/ssot.json.
 *
 * Why this exists: t() deliberately falls back to the key itself when it misses,
 * so a typo is invisible to TypeScript, invisible to the build, and renders
 * `orders.status.authenticating` to a user's screen. That exact key was wrong in
 * the orders page on 2026-08-10 and nothing caught it until the keys were
 * checked by hand.
 *
 *   npx tsx scripts/i18n-check-keys.ts
 *
 * Only literal keys can be checked. `_t(SOME_MAP[x])` is skipped by design —
 * those are reported as a count so a page that hides everything behind
 * indirection cannot look clean by accident.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SSOT = path.join(ROOT, 'locales/ssot.json');
const ROOTS = ['apps/consumer', 'apps/authenticator', 'apps/admin', 'packages/ui'];
const SKIP = new Set(['.next', 'node_modules', 'dist', '.turbo']);

const ssot = JSON.parse(fs.readFileSync(SSOT, 'utf8')) as Record<string, Record<string, unknown>>;
const known = new Set<string>();
for (const [ns, items] of Object.entries(ssot)) {
  for (const k of Object.keys(items)) known.add(`${ns}.${k}`);
}

const files: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(path.join(dir, e.name));
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      files.push(path.join(dir, e.name));
    }
  }
};
for (const r of ROOTS) {
  const abs = path.join(ROOT, r);
  if (fs.existsSync(abs)) walk(abs);
}

const literal = /\b_?t\(\s*'([a-zA-Z][\w.]*)'/g;
const dynamic = /\b_?t\(\s*[A-Za-z_$][\w$]*[[.]/g;

let bad = 0;
let checked = 0;
let dyn = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  dyn += (src.match(dynamic) ?? []).length;
  for (const m of src.matchAll(literal)) {
    const key = m[1];
    // `t('…')` is also a plausible shape for unrelated one-letter helpers, so
    // only treat something as a key once it looks like one (has a dot).
    if (!key.includes('.')) continue;
    checked++;
    if (!known.has(key)) {
      const line = src.slice(0, m.index).split('\n').length;
      console.log(`  ✗ ${rel}:${line}  ${key}`);
      bad++;
    }
  }
}

console.log(`\n檢查咗 ${checked} 個字面 key（另有 ${dyn} 個由變數傳入，查唔到）`);
if (bad > 0) {
  console.log(`FAIL — ${bad} 個 key 唔存在，會直接將 key 名印俾用戶睇`);
  process.exit(1);
}
console.log('PASS — 全部字面 key 都喺 ssot.json 搵到');
