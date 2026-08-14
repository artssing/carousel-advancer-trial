/**
 * The API contract, generated from `apps/api/openapi.json`.
 *
 * `schema.ts` is machine-written — do not hand-edit it, and do not hand-write
 * types that duplicate it. Regenerate with `npm run api:contract` from the repo
 * root. Once the repos split, this file is the only thing keeping the web's
 * idea of the API and the API itself in agreement.
 *
 * This package used to also ship a hand-written `ApiClient` class and a
 * `types.ts` of hand-maintained interfaces. Both were written on day one
 * (2026-05-27, the scaffold commit), covered 8 endpoints, were never touched
 * again, and were never imported by a single line of app code — each portal
 * grew its own `lib/api.ts` instead (1149 lines, 89 endpoints in consumer
 * alone). They were deleted 2026-08-14 rather than regenerated: the repo-split
 * proposal had named them as the drift risk, which was wrong. The drift risk is
 * the three `lib/api.ts`, and those are what should consume the types below.
 */
export type { paths, components, operations } from './schema';
