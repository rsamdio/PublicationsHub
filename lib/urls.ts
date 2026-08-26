/**
 * Canonical public URL helpers (Next.js App Router).
 * Greenfield path routes for public; hash helpers remain for /studio overlay only.
 */

export function publicationPath(seriesId: string): string {
  const id = seriesId != null ? String(seriesId).trim() : '';
  if (!id) return '/';
  return `/${encodeURIComponent(id)}`;
}

export function editionPath(seriesId: string, editionId: string): string {
  const sid = seriesId != null ? String(seriesId).trim() : '';
  const eid = editionId != null ? String(editionId).trim() : '';
  if (!sid || !eid) return sid ? publicationPath(sid) : '/';
  return `/${encodeURIComponent(sid)}/${encodeURIComponent(eid)}`;
}

export function getSeriesCanonicalIdForPublication(pub: {
  id?: string;
  series_id?: string | null;
} | null | undefined): string {
  if (!pub?.id) return '';
  const sid = pub.series_id != null && String(pub.series_id).trim();
  if (sid) return String(pub.series_id).trim();
  return String(pub.id).trim();
}

export function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).href;
}

/**
 * Allow only absolute http(s) URLs (blocks javascript:, data:, etc.).
 * Returns '' when missing or unsafe.
 */
export function safeHttpUrl(value: string | null | undefined): string {
  const s = value != null ? String(value).trim() : '';
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

export function buildEditionDeepLink(
  editionId: string,
  seriesCanonicalId?: string | null
): string {
  const eid = editionId != null ? String(editionId).trim() : '';
  if (!eid) return '/';
  const sidRaw =
    seriesCanonicalId != null && String(seriesCanonicalId).trim()
      ? String(seriesCanonicalId).trim()
      : '';
  const sid = sidRaw || eid;
  const path = editionPath(sid, eid);
  return typeof window !== 'undefined' ? absoluteUrl(path) : path;
}

export function buildSeriesPagePath(canonicalId: string): string {
  return publicationPath(canonicalId);
}

/** @deprecated Studio overlay only — public reader uses path `/[seriesSlug]/[editionSlug]`. */
export const READ_HASH_SEGMENT = 'r';

export function formatReadLocationHash(editionRef: string): string {
  const ref = editionRef != null ? String(editionRef).trim() : '';
  if (!ref) return '';
  return `#/${READ_HASH_SEGMENT}/${encodeURIComponent(ref)}`;
}

export function isReaderLocationHash(hash: string): boolean {
  return /^#\/?(r|read)\//i.test(hash || '');
}

export function parseReadRefFromHash(hash: string): string | null {
  const h = hash || '';
  const short = /^#\/?r\/([^?#]+)\/?$/i.exec(h);
  if (short) return decodeURIComponent(short[1].trim());
  const leg = /^#\/?read\/([^?#]+)\/?$/i.exec(h);
  if (leg) return decodeURIComponent(leg[1].trim());
  return null;
}

export function readEditionRefFromHash(): string | null {
  return parseReadRefFromHash(
    typeof location !== 'undefined' ? location.hash || '' : ''
  );
}

/** Parse `/[seriesSlug]/[editionSlug]` from a pathname. */
export function parseEditionPath(
  pathname: string
): { seriesId: string; editionId: string } | null {
  const m = /^\/([^/]+)\/([^/]+)\/?$/.exec(pathname || '');
  if (!m) return null;
  return {
    seriesId: decodeURIComponent(m[1]),
    editionId: decodeURIComponent(m[2])
  };
}

export function parsePublicationPath(pathname: string): string | null {
  const m = /^\/([^/]+)\/?$/.exec(pathname || '');
  if (!m) return null;
  return decodeURIComponent(m[1]);
}

export function sanitizeSlug(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || '');
}

const RESERVED_SLUGS = new Set([
  'about', 'admin', 'studio', 'privacy', 'terms', 'api', 'auth', 'login',
  'p', 'e', 'b', 'public', 'catalog', 'images', 'fonts', 'vendor', '_next',
  'sitemap.xml', 'robots.txt', 'manifest.json', 'favicon.ico', 'sw.js'
]);

export function isReservedSlug(s: string): boolean {
  return RESERVED_SLUGS.has((s || '').toLowerCase());
}
