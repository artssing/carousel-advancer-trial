import { Controller, Get } from '@nestjs/common';

/**
 * `GET /api/version` — what code is this process actually running?
 *
 * Deliberately unauthenticated and dependency-free: it must answer while the
 * database is down, because "is the new build live?" and "is the app healthy?"
 * are different questions and conflating them is how a stale deploy hides.
 *
 * Why this exists: on 2026-08-01 QA spent 11 minutes producing a FAIL report
 * against an API container running two-day-old code. On 2026-08-10 the same
 * trap reappeared — the UAT containers were 8 days behind the working tree,
 * and the only way to notice was reading `docker images` by eye. A liveness
 * check cannot catch either: an old build answers 200 just as happily as a new
 * one. Comparing `commit` against the SHA you meant to deploy can.
 *
 * Values are baked at image build time (Dockerfile ARG → ENV). Running from
 * source — `npm run dev` — leaves them unset, and `dev` is the honest answer:
 * a working tree has no single commit, and pretending otherwise would let a
 * dev server pass a deploy check.
 */
@Controller('version')
export class VersionController {
  private readonly startedAt = new Date().toISOString();

  @Get()
  get() {
    return {
      version: process.env.APP_VERSION || '0.0.0',
      commit: process.env.GIT_COMMIT || 'dev',
      builtAt: process.env.BUILT_AT || null,
      env: process.env.APP_ENV || process.env.NODE_ENV || 'unknown',
      startedAt: this.startedAt,
    };
  }
}
