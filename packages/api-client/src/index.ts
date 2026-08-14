/**
 * The API contract, generated from `apps/api/openapi.json`.
 *
 * `schema.ts` is machine-written — do not hand-edit it, and do not hand-write
 * types that duplicate it. Regenerate with `npm run api:contract` from the repo
 * root; CI fails if the checked-in copy is stale, which is the whole point: once
 * the repos split, this file is the only thing keeping the web's idea of the
 * API and the API itself in agreement.
 */
export type { paths, components, operations } from './schema';

export * from './types';
export * from './client';
