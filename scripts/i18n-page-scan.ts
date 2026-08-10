/**
 * Report the Chinese still hardcoded in everything a page renders — the page
 * file AND every local module it imports, transitively.
 *
 * Why not just grep the page: on 2026-08-10 checkout/[orderId]/page.tsx was
 * fully wired and the screen still showed a Chinese fee panel, because the
 * panel is a component. "Page done" is not "screen done", and grepping the page
 * file cannot tell the difference. The original copy extraction had the same
 * blind spot — it walked pages only, which is why no component ever got keys.
 *
 *   npx tsx scripts/i18n-page-scan.ts 'apps/consumer/app/checkout/[orderId]/page.tsx'
 *   npx tsx scripts/i18n-page-scan.ts --all apps/consumer
 *
 * Only `@/…` and relative imports are followed. Packages are out of scope:
 * `@authentik/ui` has its own namespace and its own reckoning.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const HAN = /[一-鿿]/;
const LITERAL = /(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`|>\s*([^<>{}\n]*?)\s*<)/g;

/** Comments are not shipped to users; counting them only creates noise. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function resolveImport(spec: string, from: string, appRoot: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(appRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

function countChinese(src: string): number {
  let n = 0;
  for (const m of stripComments(src).matchAll(LITERAL)) {
    const text = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (text && HAN.test(text)) n++;
  }
  return n;
}

function scan(entry: string, appRoot: string) {
  const seen = new Set<string>();
  const queue = [path.resolve(ROOT, entry)];
  const hits: [number, string][] = [];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    const n = countChinese(src);
    if (n) hits.push([n, path.relative(ROOT, f)]);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveImport(m[1], f, path.resolve(ROOT, appRoot));
      if (r) queue.push(r);
    }
  }
  const total = hits.reduce((a, [n]) => a + n, 0);
  return { files: seen.size, total, hits: hits.sort((a, b) => b[0] - a[0]) };
}

const args = process.argv.slice(2);
if (args[0] === '--all') {
  const appRoot = args[1] ?? 'apps/consumer';
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!['.next', 'node_modules'].includes(e.name)) walk(path.join(d, e.name));
      } else if (e.name === 'page.tsx') pages.push(path.join(d, e.name));
    }
  };
  walk(path.join(ROOT, appRoot, 'app'));
  const rows = pages
    .map((p) => ({ page: path.relative(path.join(ROOT, appRoot, 'app'), p), ...scan(p, appRoot) }))
    .sort((a, b) => b.total - a.total);
  console.log(`${appRoot} — 每個 page 連埋佢 import 嘅嘢\n`);
  for (const r of rows) {
    console.log(`  ${String(r.total).padStart(5)}  ${r.page}${r.total === 0 ? '   ✓' : ''}`);
  }
  console.log(`\n合計 ${rows.reduce((a, r) => a + r.total, 0)}（同一個 component 會喺多個 page 重覆計）`);
} else {
  const entry = args[0];
  if (!entry) {
    console.log("用法: npx tsx scripts/i18n-page-scan.ts <page.tsx> | --all <apps/consumer>");
    process.exit(1);
  }
  const appRoot = entry.split('/').slice(0, 2).join('/');
  const r = scan(entry, appRoot);
  console.log(`${entry}\n  掃 ${r.files} 個檔，剩 ${r.total} 個中文字串`);
  for (const [n, f] of r.hits) console.log(`   ${String(n).padStart(4)}  ${f}`);
}
