/**
 * Permanent redirects for known broken public slugs (pasted external URLs).
 * After manual rename in Admin/Studio, these old addresses 301 to the new canonicals.
 *
 * Keys are pathname forms without origin (leading slash). Both encoded and decoded
 * variants are listed where browsers/crawlers may request either.
 */

export const SLUG_REDIRECTS: Record<string, string> = {
  // The Wings Log (D3191) series: leading "r" was cut from rotaract3191.org
  '/otaract3191.org%2Fpublications%2Fdistrict%2Fjuly-2026': '/the-wings-log',
  '/otaract3191.org/publications/district/july-2026': '/the-wings-log',

  // The Wings Log, July 2026: same broken string repeated as edition slug
  '/otaract3191.org%2Fpublications%2Fdistrict%2Fjuly-2026/otaract3191.org%2Fpublications%2Fdistrict%2Fjuly-2026':
    '/the-wings-log/july-2026',
  '/otaract3191.org/publications/district/july-2026/otaract3191.org/publications/district/july-2026':
    '/the-wings-log/july-2026',

  // KAIRAV (D3020)
  '/kairav/https%3A%2F%2Frotaract3020.org%2Fmagazines%2FJULY2026': '/kairav/july-2026',
  '/kairav/https://rotaract3020.org/magazines/JULY2026': '/kairav/july-2026',
  '/kairav/https%3A%2F%2Frotaract3020.org%2Fmagazines%2FAUGUST2026': '/kairav/august-2026',
  '/kairav/https://rotaract3020.org/magazines/AUGUST2026': '/kairav/august-2026'
};

/** Normalize a request pathname for redirect lookup (preserve encoding in segments). */
export function lookupSlugRedirect(pathname: string): string | null {
  if (!pathname) return null;
  const raw = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const noTrailing =
    raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (SLUG_REDIRECTS[noTrailing]) return SLUG_REDIRECTS[noTrailing];

  let decoded = noTrailing;
  try {
    decoded = decodeURIComponent(noTrailing);
  } catch {
    decoded = noTrailing;
  }
  if (decoded !== noTrailing && SLUG_REDIRECTS[decoded]) {
    return SLUG_REDIRECTS[decoded];
  }

  // Re-encode each path segment of the decoded form for map keys that use %2F.
  const reencoded =
    '/' +
    decoded
      .replace(/^\//, '')
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
  if (SLUG_REDIRECTS[reencoded]) return SLUG_REDIRECTS[reencoded];

  return null;
}
