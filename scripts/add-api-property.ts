/**
 * Codemod: put `@ApiProperty` / `@ApiPropertyOptional` on every DTO property.
 *
 * Normally the `@nestjs/swagger` CLI plugin does this at compile time. It does
 * not work in this repo — `nest build` dies with a bare TypeScript
 * `Debug Failure.` the moment the plugin transforms any class, on swagger v7
 * and v8, on TS 5.5 and 5.9, with the plugin scoped to a single file. Loading
 * the plugin but matching no files builds fine, so it is the transform itself.
 * Rather than keep digging into a TypeScript internal assertion with no stack,
 * the decorators are written into the source (founder 2026-08-14).
 *
 * The tradeoff, stated plainly: the type now appears twice — once in the
 * TypeScript annotation, once in the decorator. They can drift. What keeps
 * that survivable is that they sit on adjacent lines, so a reviewer sees both
 * in one glance, and this codemod is re-runnable: it rewrites existing
 * `@ApiProperty` lines it previously generated rather than appending a second.
 *
 * Usage: npx tsx scripts/add-api-property.ts [--check]
 *   --check exits non-zero if any file would change (for CI).
 */
import * as ts from 'typescript';
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'fs';
import * as path from 'path';

const CHECK = process.argv.includes('--check');
const ROOT = path.join(__dirname, '..');

/** Literal-union types become an OpenAPI enum; nothing else can express them. */
function literalUnion(type: ts.TypeNode | undefined): string[] | null {
  if (!type || !ts.isUnionTypeNode(type)) return null;
  const vals: string[] = [];
  for (const m of type.types) {
    if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) vals.push(m.literal.text);
    else if (m.kind === ts.SyntaxKind.NullKeyword) continue;
    else return null;
  }
  return vals.length ? vals : null;
}

function isNullable(type: ts.TypeNode | undefined): boolean {
  return !!type && ts.isUnionTypeNode(type)
    && type.types.some((m) => m.kind === ts.SyntaxKind.NullKeyword);
}

function arrayElement(type: ts.TypeNode | undefined): string | null {
  if (!type) return null;
  if (ts.isArrayTypeNode(type)) return type.elementType.getText();
  return null;
}

/** The decorator source line for one property. */
/** Names imported as VALUES from @prisma/client — i.e. real enum objects. */
function collectRuntimeEnums(src: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== '@prisma/client') continue;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const el of named.elements) out.add(el.name.text);
  }
  return out;
}

let runtimeEnums = new Set<string>();

function decoratorFor(prop: ts.PropertyDeclaration, src: ts.SourceFile): string {
  const optional = !!prop.questionToken
    || (ts.getDecorators(prop) ?? []).some((d) => d.getText(src).startsWith('@IsOptional'));
  const name = optional ? 'ApiPropertyOptional' : 'ApiProperty';

  const opts: string[] = [];
  const enumVals = literalUnion(prop.type);
  const elem = arrayElement(prop.type);

  const prim = (t: string) => /^(string|number|boolean)$/.test(t);
  if (enumVals) {
    opts.push(`enum: [${enumVals.map((v) => `'${v}'`).join(', ')}]`);
  } else if (elem) {
    // design:type for an array is just `Array`; the element type has to be said.
    if (prim(elem)) opts.push(`type: [${cap(elem)}]`);
    else if (runtimeEnums.has(elem)) opts.push(`enum: ${elem}, isArray: true`);
    else opts.push(`type: [String]`);
  } else if (prop.type && !prim(prop.type.getText()) && runtimeEnums.has(prop.type.getText())) {
    // Prisma enums are real runtime objects, so swagger can read the members.
    opts.push(`enum: ${prop.type.getText()}`);
  } else if (prop.type && ts.isTypeReferenceNode(prop.type)) {
    // A type-only alias (e.g. `PayoutMethodTypeKey`) has no runtime value to
    // point at; it is a string union at runtime, so say String rather than
    // letting design:type report Object and emit a shapeless schema.
    opts.push('type: String');
  }
  if (isNullable(prop.type)) opts.push('nullable: true');

  return `  @${name}(${opts.length ? `{ ${opts.join(', ')} }` : ''})`;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function processFile(file: string): boolean {
  const original = readFileSync(file, 'utf8');
  const src = ts.createSourceFile(file, original, ts.ScriptTarget.ES2022, true);
  runtimeEnums = collectRuntimeEnums(src);
  const lines = original.split('\n');
  const inserts: { line: number; text: string }[] = [];
  const drop = new Set<number>();

  src.forEachChild(function visit(node) {
    // Only classes named *Dto. Scanning controllers for the three DTOs declared
    // inline there also walked the controllers themselves, and decorating a
    // controller's private field puts it in the public contract.
    if (ts.isClassDeclaration(node) && node.name?.text.endsWith('Dto')) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const decorators = ts.getDecorators(member) ?? [];
        // Re-runnable: remove what a previous run wrote, then write it fresh.
        for (const d of decorators) {
          const t = d.getText(src);
          if (t.startsWith('@ApiProperty') || t.startsWith('@ApiPropertyOptional')) {
            drop.add(src.getLineAndCharacterOfPosition(d.getStart(src)).line);
          }
        }
        const first = decorators[0] ?? member;
        const line = src.getLineAndCharacterOfPosition(first.getStart(src)).line;
        inserts.push({ line, text: decoratorFor(member, src) });
      }
    }
    node.forEachChild(visit);
  });

  if (!inserts.length) return false;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Emit the replacement BEFORE honouring the drop: on a re-run the line
    // being dropped IS the previous @ApiProperty, and it is also the anchor
    // the new one is keyed to. Checking `drop` first skipped the insert and
    // silently stripped every decorator in the file.
    for (const ins of inserts) if (ins.line === i) out.push(ins.text);
    if (drop.has(i)) continue;
    out.push(lines[i]!);
  }

  let text = out.join('\n');
  if (!/from '@nestjs\/swagger'/.test(text)) {
    text = `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';\n` + text;
  }
  // Only import what is used, or noUnusedLocals-style lint noise follows.
  const usedReq = /@ApiProperty\(/.test(text);
  const usedOpt = /@ApiPropertyOptional\(/.test(text);
  const names = [usedReq && 'ApiProperty', usedOpt && 'ApiPropertyOptional'].filter(Boolean);
  text = text.replace(
    /import \{[^}]*\} from '@nestjs\/swagger';/,
    `import { ${names.join(', ')} } from '@nestjs/swagger';`,
  );

  if (text === original) return false;
  if (!CHECK) writeFileSync(file, text);
  return true;
}

// Not just dto*.ts: three DTO classes are declared inline in their controller
// (UpdateMeDto, ChangePasswordDto, SellerReviewDto), and a schema that is
// missing from the contract is worse than one that is ugly to find.
const files = [
  ...globSync('apps/api/src/**/dto*.ts', { cwd: ROOT }),
  ...globSync('apps/api/src/**/*.controller.ts', { cwd: ROOT }),
].map((f: string) => path.join(ROOT, f));

let changed = 0;
for (const f of files) {
  if (processFile(f)) {
    changed++;
    // eslint-disable-next-line no-console
    console.log(`${CHECK ? 'would change' : 'updated'}: ${path.relative(ROOT, f)}`);
  }
}
// eslint-disable-next-line no-console
console.log(`${files.length} DTO files scanned, ${changed} ${CHECK ? 'stale' : 'updated'}`);
if (CHECK && changed) process.exit(1);
