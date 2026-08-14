/**
 * Text normalisation shared by the API and the web.
 *
 * Lived in `brands.ts`, but it is not about brands — it is the function that
 * decides whether two strings are "the same" for lookup. Both sides must
 * normalise byte-identically or a search silently misses, so it belongs in
 * domain while the brand registry does not.
 */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
