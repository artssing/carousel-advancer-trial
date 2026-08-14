import type { paths } from './schema';

/**
 * Helpers for pinning a call site to the generated contract.
 *
 * **Requests only, and that is not an oversight.** The controllers declare no
 * return types to swagger, so every operation in `schema.ts` has an empty
 * `responses` — `content?: never`. Typing responses would mean writing a
 * response DTO for ~153 endpoints whose shapes are ad-hoc Prisma selects with
 * `include`, which is a much larger job than P1c and should be decided on its
 * own merits (2026-08-14).
 *
 * What this does cover is the half that just became load-bearing: the API now
 * runs `forbidNonWhitelisted`, so a portal that sends one field the DTO does
 * not declare gets a 400 at runtime. `ApiBody` turns that into a type error.
 *
 * Usage:
 *
 * ```ts
 * const body: ApiBody<'/api/orders/qr/scan', 'post'> = { token };
 * ```
 */

type Op<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

/** The JSON request body an operation accepts. */
export type ApiBody<P extends keyof paths, M extends keyof paths[P]> =
  Op<P, M> extends { requestBody?: { content: { 'application/json': infer B } } } ? B
  : Op<P, M> extends { requestBody: { content: { 'application/json': infer B } } } ? B
  : never;

/** The path parameters an operation needs (`{id}` and friends). */
export type ApiParams<P extends keyof paths, M extends keyof paths[P]> =
  Op<P, M> extends { parameters: { path: infer T } } ? T : never;

/** Every path string the API serves. Useful for exhaustiveness checks. */
export type ApiPath = keyof paths;
