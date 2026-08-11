import { NextResponse } from 'next/server';

/**
 * `GET /api/version` — what code is this container running?
 *
 * The API has the same endpoint. Four images are built and tagged
 * independently, so one stamp cannot speak for the others: on 2026-08-10 the
 * four UAT images spanned 18h41m of build times. Checking only the API would
 * have called a deploy live while this portal served days-old code — and most
 * changes in this repo are front-end, so that is the common case, not the edge.
 *
 * Route handler, not a page: this reads server-side `process.env` at request
 * time. A `NEXT_PUBLIC_*` value would be inlined into the client bundle at
 * build time and could go stale against the running server.
 *
 * Values come from Dockerfile ARGs (see docker-compose.deploy.yml). Running
 * `next dev` leaves them unset and reports `dev` — a working tree has no
 * single commit, and saying otherwise would let a dev server pass a deploy check.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    app: 'admin',
    commit: process.env.GIT_COMMIT || 'dev',
    builtAt: process.env.BUILT_AT || null,
  });
}
