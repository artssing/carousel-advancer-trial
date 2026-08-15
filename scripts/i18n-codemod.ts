/**
 * i18n codemod — wire a page to t() by looking its Chinese copy up in the SSOT.
 *
 * The point of this script is that we are NOT inventing keys. 79% of the Chinese
 * strings still hardcoded in unwired pages already exist verbatim in
 * `locales/ssot.json`, because the copy was extracted once and the keys were
 * written, but the pages were never changed to call t(). So the safe mechanical
 * move is: reverse-index the SSOT by its zh value, and replace only the literals
 * that resolve to exactly one key. Everything else is reported and left alone —
 * a codemod that guesses is worse than no codemod, because a wrong key silently
 * renders the key name to a user instead of failing.
 *
 *   npx tsx scripts/i18n-codemod.ts apps/consumer/app/login/page.tsx        # dry run
 *   npx tsx scripts/i18n-codemod.ts apps/consumer/app/login/page.tsx --write
 *
 * Ambiguity is resolved one way only: if a Chinese string maps to several keys
 * and exactly one of them lives in the namespace matching the page (login/, and
 * so on), that one wins. Any remaining tie is a human decision.
 *
 * After running: `npx tsc -p tsconfig.build.json` is NOT needed (no utils change),
 * but `npm run type-check` is, and the page must be read by a human before commit.
 */
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SSOT = path.join(ROOT, 'locales/ssot.json');

const HAN = /[一-鿿]/;

type Edit = { start: number; end: number; text: string };
type Skip = { line: number; zh: string; why: string; candidates?: string[] };

// ── SSOT reverse index: zh string → full dot keys ────────────────────────────
function buildIndex(): Map<string, string[]> {
  const ssot = JSON.parse(fs.readFileSync(SSOT, 'utf8')) as Record<
    string,
    Record<string, { zh?: string; en?: string } | string>
  >;
  const rev = new Map<string, string[]>();
  for (const [ns, items] of Object.entries(ssot)) {
    for (const [k, v] of Object.entries(items)) {
      const zh = typeof v === 'string' ? v : v?.zh;
      if (!zh) continue;
      const full = `${ns}.${k}`;
      const arr = rev.get(zh);
      if (arr) arr.push(full);
      else rev.set(zh, [full]);
    }
  }
  return rev;
}

/**
 * Namespace guess from the file path — `app/login/page.tsx` → `login`.
 *
 * The guess is often wrong for nested routes: `app/orders/[id]/page.tsx` reads
 * as `orders`, but its copy lives under `orderDetail`, which left a dozen keys
 * looking ambiguous when one candidate was obviously right. Pass `--ns=<name>`
 * to say so directly.
 */
function preferredNamespace(file: string, override: string | null): string | null {
  if (override) return override;
  const m = file.match(/app\/(?:\(.*?\)\/)?([a-zA-Z0-9-]+)\//);
  return m ? m[1] : null;
}

/**
 * Which namespaces a file is even allowed to borrow from.
 *
 * Without this the reverse index happily hands a consumer page a key like
 * `admin.users.drawer.resetPassword.doneButton` just because both strings are
 * 「完成」. It renders correctly today and is wrong the moment anyone edits the
 * admin copy — the same cross-portal coupling CLAUDE.md bans for colour tokens.
 */
function allowedNamespaces(file: string): (ns: string) => boolean {
  if (file.includes('apps/admin/')) return (ns) => ns === 'admin' || ns === 'layout';
  if (file.includes('apps/authenticator/')) return (ns) => ns === 'authenticator' || ns === 'layout';
  // consumer: everything except the other two portals
  return (ns) => ns !== 'admin' && ns !== 'authenticator';
}

function resolveKey(
  zh: string,
  rev: Map<string, string[]>,
  prefer: string | null,
  allowed: (ns: string) => boolean,
): { key?: string; candidates?: string[]; rejected?: string[] } {
  const all = rev.get(zh);
  if (!all || all.length === 0) return {};
  const cands = all.filter((c) => allowed(c.slice(0, c.indexOf('.'))));
  if (cands.length === 0) return { rejected: all };
  if (cands.length === 1) return { key: cands[0] };
  if (prefer) {
    const narrowed = cands.filter((c) => c.startsWith(prefer + '.'));
    if (narrowed.length === 1) return { key: narrowed[0] };
  }
  return { candidates: cands };
}

// ── The boilerplate every wired page carries (matches browse/top-nav) ────────
const BOILERPLATE = `  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

`;

function run(file: string, write: boolean, nsOverride: string | null) {
  const abs = path.resolve(ROOT, file);
  const src = fs.readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rev = buildIndex();
  const prefer = preferredNamespace(file, nsOverride);

  if (/\bconst\s+_t\b/.test(src)) {
    console.log(`${file}: 已經 wire 咗（見到 _t），略過`);
    return;
  }
  for (const clash of ['locale', 'setLocale']) {
    if (new RegExp(`\\b(const|let)\\s+\\[?\\s*${clash}\\b`).test(src)) {
      console.log(`${file}: 已經有 \`${clash}\` 變數，boilerplate 會撞名 — 要人手處理`);
      return;
    }
  }

  const edits: Edit[] = [];
  const skips: Skip[] = [];
  const usedKeys: string[] = [];
  const allowed = allowedNamespaces(file);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  // `_t` only exists inside the component. Module-scope constant maps (status
  // labels, timeline steps) are the common case here and must NOT be rewritten:
  // they would compile against an undefined `_t`. Report them for a human, who
  // has to decide between moving them inside or making them a function of locale.
  //
  // Shared components use named exports (`export function ConversationPane`),
  // not a default export, so the target is: the default export if there is one,
  // otherwise the first exported PascalCase function. Anything in a second
  // component in the same file stays out of scope and gets reported.
  let bodyStart = -1;
  let bodyEnd = -1;
  let componentName = '';
  const isExported = (stmt: ts.FunctionDeclaration) =>
    stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (stmt: ts.FunctionDeclaration) =>
    stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const stmt of sf.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.body) continue;
    const pascal = /^[A-Z]/.test(stmt.name?.text ?? '');
    const pick = isDefault(stmt) || (bodyStart < 0 && isExported(stmt) && pascal);
    if (!pick) continue;
    bodyStart = stmt.body.getStart(sf);
    bodyEnd = stmt.body.getEnd();
    componentName = stmt.name?.text ?? '';
    if (isDefault(stmt)) break; // a default export always wins
  }
  const inComponent = (pos: number) => bodyStart >= 0 && pos > bodyStart && pos < bodyEnd;

  const report = (pos: number, zh: string, why: string, candidates?: string[]) =>
    skips.push({ line: lineOf(pos), zh, why, candidates });

  const take = (zh: string, node: ts.Node, wrap: (k: string) => string) => {
    const pos = node.getStart(sf);
    if (!inComponent(pos)) return report(pos, zh, 'module scope，`_t` 唔喺 scope 入面');
    const { key, candidates, rejected } = resolveKey(zh, rev, prefer, allowed);
    if (key) {
      edits.push({ start: pos, end: node.getEnd(), text: wrap(key) });
      usedKeys.push(key);
    } else if (rejected) {
      report(pos, zh, '淨係喺第二個 portal 嘅 namespace 搵到 — 唔借', rejected);
    } else {
      report(pos, zh, candidates ? '多過一個 key' : 'ssot 冇呢句', candidates);
    }
  };

  const visit = (node: ts.Node) => {
    // Never touch import paths, and never touch what a developer reads in a log.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console'
    )
      return;

    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      const trimmed = raw.trim();
      if (trimmed && HAN.test(trimmed)) {
        const off = raw.indexOf(trimmed);
        const start = node.getStart(sf) + off;
        if (!inComponent(start)) {
          report(start, trimmed, 'module scope，`_t` 唔喺 scope 入面');
          return;
        }
        const { key, candidates, rejected } = resolveKey(trimmed, rev, prefer, allowed);
        if (key) {
          edits.push({ start, end: start + trimmed.length, text: `{_t('${key}')}` });
          usedKeys.push(key);
        } else if (rejected) {
          report(start, trimmed, '淨係喺第二個 portal 嘅 namespace 搵到 — 唔借', rejected);
        } else {
          report(start, trimmed, candidates ? '多過一個 key' : 'ssot 冇呢句', candidates);
        }
      }
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const zh = node.text;
      if (HAN.test(zh)) {
        const inJsxAttr = node.parent && ts.isJsxAttribute(node.parent);
        take(zh, node, (k) => (inJsxAttr ? `{_t('${k}')}` : `_t('${k}')`));
      }
      return;
    }

    // A template literal with ${} holes needs a params object, which is a
    // judgement call about what the placeholder is named. Leave it to a human.
    if (ts.isTemplateExpression(node)) {
      const text = node.getText(sf);
      if (HAN.test(text)) report(node.getStart(sf), text.slice(0, 50), '模板字串有 ${} — 要人手揀 params');
      return;
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  // ── report ────────────────────────────────────────────────────────────────
  console.log(`\n=== ${file} ===`);
  console.log(`可自動替換: ${edits.length}   要人手: ${skips.length}`);
  if (skips.length) {
    console.log('\n-- 冇郁，要你決定 --');
    const cap = process.env.I18N_LIST_ALL ? skips.length : 40;
    for (const s of skips.slice(0, cap)) {
      console.log(`  L${s.line}  ${s.why}  「${s.zh.slice(0, 60)}」`);
      if (s.candidates) console.log(`        候選: ${s.candidates.join(' , ')}`);
    }
    if (skips.length > cap) console.log(`  … 仲有 ${skips.length - cap} 條（I18N_LIST_ALL=1 睇晒）`);
  }

  if (!write) {
    console.log('\n（dry run — 加 --write 先會改檔）');
    return;
  }
  if (edits.length === 0) {
    console.log('冇嘢可以自動改。');
    return;
  }

  // Apply edits back-to-front so earlier offsets stay valid.
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }

  // Extend the existing @certifine/web-kit import rather than adding a second one.
  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*'@authentik\/utils';/;
  const m = out.match(importRe);
  if (m) {
    const names = m[1];
    const add = ['getClientLocale', 'createT'].filter((n) => !new RegExp(`\\b${n}\\b`).test(names));
    if (add.length) {
      // The existing list may end in a trailing comma, a newline, or both —
      // normalise before appending or we emit `TabRole,, getClientLocale`.
      const body = names.replace(/[\s,]*$/, '');
      const multiline = names.includes('\n');
      out = out.replace(
        importRe,
        multiline
          ? `import {${body},\n  ${add.join(', ')},\n} from '@certifine/web-kit';`
          : `import { ${body.trim()}, ${add.join(', ')} } from '@certifine/web-kit';`,
      );
    }
  } else {
    out = out.replace(
      /(^import .*?;\n)/m,
      `$1import { getClientLocale, createT } from '@certifine/web-kit';\n`,
    );
  }

  // Insert the boilerplate as the first statements of the default-exported component.
  // Anchor on the component the edits were scoped to, not on `export default`:
  // shared components are named exports.
  const anchor = componentName
    ? new RegExp(`function\\s+${componentName}\\s*\\(([\\s\\S]*?)\\)\\s*\\{\\n`)
    : /export default function\s+\w+\s*\([^)]*\)\s*\{\n/;
  const comp = out.match(anchor);
  if (!comp || comp.index === undefined) {
    console.log(`搵唔到 ${componentName || 'export default'} 個 function 開頭 — boilerplate 要人手加`);
  } else {
    const at = comp.index + comp[0].length;
    out = out.slice(0, at) + BOILERPLATE + out.slice(at);
  }

  fs.writeFileSync(abs, out, 'utf8');
  console.log(`\n改咗 ${edits.length} 處，用咗 ${new Set(usedKeys).size} 個唯一 key。`);
  console.log('下一步：npm run type-check，然後人手讀一次個 diff。');
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const nsArg = args.find((a) => a.startsWith('--ns='));
const nsOverride = nsArg ? nsArg.slice('--ns='.length) : null;
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.log('用法: npx tsx scripts/i18n-codemod.ts <file.tsx> [more.tsx] [--ns=<namespace>] [--write]');
  process.exit(1);
}
for (const f of files) run(f, write, nsOverride);
