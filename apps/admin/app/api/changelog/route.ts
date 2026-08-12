import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * `GET /api/changelog` — the repo's CHANGELOG.md, as text.
 *
 * Served from the file rather than copied into the app so there is exactly one:
 * the changelog a release is written against and the changelog the founder
 * reads in admin are the same bytes, and they ship inside the same image as the
 * version the badge reports. A changelog that can disagree with the running
 * build is worse than none.
 *
 * The Dockerfile copies the repo wholesale to /repo and the server runs from
 * /repo/apps/admin, so the file sits two levels up. `next dev` has the same
 * shape. The second candidate covers a runner that starts at the repo root.
 */
export const dynamic = 'force-dynamic';

const CANDIDATES = [
  path.join(process.cwd(), '..', '..', 'CHANGELOG.md'),
  path.join(process.cwd(), 'CHANGELOG.md'),
];

export async function GET() {
  for (const p of CANDIDATES) {
    try {
      const body = await readFile(p, 'utf8');
      return new NextResponse(body, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    } catch {
      // try the next location
    }
  }
  return NextResponse.json(
    { error: 'CHANGELOG.md not found in this image' },
    { status: 404 },
  );
}
