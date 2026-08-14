/**
 * Every endpoint the portals call must exist in the generated contract.
 *
 * Why this rather than typing all 89 call sites: the controllers declare no
 * return types to swagger, so `schema.ts` has empty responses and can only pin
 * request bodies (see packages/api-client/src/typed.ts). Rewriting every call
 * to gain that half is a big mechanical change; this check gets the property
 * that actually protects the split — the web cannot call a route the API does
 * not serve — over all three portals at once, and it keeps working when
 * someone renames a route in the api repo.
 *
 * It reads the paths out of the `lib/api.ts` files, normalises `${id}` to the
 * OpenAPI `{id}` form, and looks each one up. Template holes are matched
 * positionally, since the client's variable name and the controller's
 * parameter name need not agree.
 *
 * Usage: npx tsx scripts/check-api-contract-coverage.ts
 */
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const spec = JSON.parse(readFileSync(path.join(ROOT, 'apps/api/openapi.json'), 'utf8'));

// Path holes are matched by position, not by name: the client's variable and
// the controller's parameter need not agree. /api/orders/{id}/ship becomes
// /api/orders/<hole>/ship on both sides before comparison.
const shape = (p: string) => p.replace(/\{[^}]+\}/g, '*');
const known = new Set<string>(Object.keys(spec.paths).map(shape));

// Built from a string: a backtick inside a regex literal trips esbuild.
const BACKTICK = String.fromCharCode(96);
const APOS = String.fromCharCode(39);
const OPEN = new RegExp("req<[^>]*>\\(\\s*([" + BACKTICK + APOS + "])", "g");

/**
 * Read one quoted path starting at `i`, honouring NESTED template holes.
 *
 * A naive regex stops at the first closing quote, which is wrong for the query
 * builders: `/authenticators${category ? `?category=${category}` : ''}` has a
 * whole template literal inside the hole. Six call sites reported as missing
 * turned out to be this, not real drift.
 */
function readPath(src: string, i: number, quote: string): string | null {
  let out = '';
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i]!;
    if (depth === 0 && c === quote) return out;
    if (c === '$' && src[i + 1] === '{') { depth++; i++; out += '*'; continue; }
    if (depth > 0) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
      continue;
    }
    out += c;
  }
  return null;
}

let missing = 0;
let checked = 0;

for (const rel of globSync('apps/*/lib/api.ts', { cwd: ROOT })) {
  const file = path.join(ROOT, rel);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(OPEN)) {
    const raw = readPath(src, m.index! + m[0]!.length, m[1]!);
    if (raw === null) continue;
    // Collapse runs of holes: a nested template can emit more than one.
    const p = ('/api' + raw.split('?')[0]!).replace(/\*+/g, '*');
    checked++;
    // A trailing hole is ambiguous: `/authenticators${qs}` is the collection
    // route with a query string, while `/orders/${id}` is a path parameter.
    // Accept either reading rather than reporting drift that is not there.
    const ok = known.has(p) || (p.endsWith('*') && known.has(p.replace(/\/?\*$/, '')));
    if (!ok) {
      missing++;
      const line = src.slice(0, m.index).split('\n').length;
      // eslint-disable-next-line no-console
      console.log(`\x1b[33m✗\x1b[0m ${rel}:${line}  ${p}`);
    }
  }
}

// eslint-disable-next-line no-console
console.log(
  missing
    ? `\n${missing}/${checked} call sites hit a path the contract does not declare.\n` +
      `Either the route was renamed in apps/api, or openapi.json is stale — run \`npm run api:contract\`.`
    : `\x1b[32m✓\x1b[0m ${checked} portal call sites, all present in the contract`,
);
process.exit(missing ? 1 : 0);
