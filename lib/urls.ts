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

/** @deprecated Studio overlay only: public reader uses path `/[seriesSlug]/[editionSlug]`. */
export const READ_HASH_SEGMENT = 'r';

export function formatReadLocationHash(editionRef: string): string {
  const ref = editionRef != null ? String(editionRef).trim() : '';
  if (!ref) return '';
  return `#/${READ_HASH_SEGMENT}/${encodeURIComponent(ref)}`;
}

export function isReaderLocationHash(hash: string): boolean {
  return /^#\/?(r|read)\//i.test(hash || '');
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseReadRefFromHash(hash: string): string | null {
  const h = hash || '';
  const short = /^#\/?r\/([^?#]+)\/?$/i.exec(h);
  if (short) return safeDecodeURIComponent(short[1].trim());
  const leg = /^#\/?read\/([^?#]+)\/?$/i.exec(h);
  if (leg) return safeDecodeURIComponent(leg[1].trim());
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
    seriesId: safeDecodeURIComponent(m[1]),
    editionId: safeDecodeURIComponent(m[2])
  };
}

export function parsePublicationPath(pathname: string): string | null {
  const m = /^\/([^/]+)\/?$/.exec(pathname || '');
  if (!m) return null;
  return safeDecodeURIComponent(m[1]);
}

export const SLUG_MAX_LENGTH = 60;

/**
 * True when raw input looks like a URL, path, or percent-encoded junk
 * that must not be accepted as a public slug (even before sanitize).
 */
export function looksLikeUrlOrPath(raw: string): boolean {
  const s = raw != null ? String(raw).trim() : '';
  if (!s) return false;
  if (/[/%]/.test(s)) return true;
  if (/\./.test(s)) return true;
  if (/:\/\//i.test(s)) return true;
  if (/^https?/i.test(s)) return true;
  if (/%[0-9a-f]{2}/i.test(s)) return true;
  return false;
}

/**
 * Normalize a free-text title or slug draft into a lowercase hyphenated slug.
 * Truncates to SLUG_MAX_LENGTH then trims hyphens so results stay isValidSlug-compatible.
 */
export function sanitizeSlug(raw: string): string {
  const base = (raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base.substring(0, SLUG_MAX_LENGTH).replace(/^-|-$/g, '');
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || '');
}

const RESERVED_SLUGS = new Set([
  'about',
  'admin',
  'studio',
  'privacy',
  'terms',
  'api',
  'auth',
  'login',
  'p',
  'e',
  'b',
  'public',
  'catalog',
  'images',
  'fonts',
  'vendor',
  '_next',
  'sitemap',
  'sitemap.xml',
  'robots',
  'robots.txt',
  'manifest',
  'manifest.json',
  'manifest.webmanifest',
  'favicon.ico',
  'sw.js',
  'llms',
  'llms.txt',
  'llms-full',
  'llms-full.txt',
  'not-found',
  '_not-found'
]);

export function isReservedSlug(s: string): boolean {
  return RESERVED_SLUGS.has((s || '').toLowerCase());
}

export type SlugKind = 'series' | 'edition';

export type NormalizeSlugResult =
  | { ok: true; slug: string; error: null }
  | { ok: false; slug: string; error: string };

/**
 * Normalize and validate a slug field value.
 * Empty input yields ok with slug '' (caller may auto-derive from title).
 * URL-like or invalid input yields ok:false with a clear error.
 */
export function normalizeSlugInput(
  raw: string | null | undefined,
  opts?: { kind?: SlugKind; allowEmpty?: boolean }
): NormalizeSlugResult {
  const kind = opts?.kind || 'series';
  const allowEmpty = opts?.allowEmpty !== false;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (!trimmed) {
    if (allowEmpty) return { ok: true, slug: '', error: null };
    return { ok: false, slug: '', error: 'URL slug is required.' };
  }
  if (looksLikeUrlOrPath(trimmed)) {
    return {
      ok: false,
      slug: '',
      error:
        'That looks like a web link or path. Use a short name like july-2026 (letters, numbers, and hyphens only).'
    };
  }
  const slug = sanitizeSlug(trimmed);
  if (!slug || !isValidSlug(slug)) {
    return {
      ok: false,
      slug: '',
      error:
        'URL slug must use lowercase letters, numbers, and hyphens only (for example july-2026).'
    };
  }
  if (kind === 'series' && isReservedSlug(slug)) {
    return {
      ok: false,
      slug,
      error: `"${slug}" is a reserved system route and cannot be used.`
    };
  }
  return { ok: true, slug, error: null };
}

/**
 * Assert a non-empty public slug (after normalize). For write guards.
 */
export function assertPublicSlug(
  slug: string,
  opts?: { kind?: SlugKind }
): NormalizeSlugResult {
  const kind = opts?.kind || 'series';
  if (!slug) {
    return { ok: false, slug: '', error: 'URL slug is required.' };
  }
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      slug: '',
      error:
        'URL slug must use lowercase letters, numbers, and hyphens only (for example july-2026).'
    };
  }
  if (kind === 'series' && isReservedSlug(slug)) {
    return {
      ok: false,
      slug,
      error: `"${slug}" is a reserved system route and cannot be used.`
    };
  }
  return { ok: true, slug, error: null };
}

export type SlugEntry = {
  id: string;
  slug?: string | null;
  series_id?: string | null;
};

/**
 * Public resolvers match document id before slug. Conflict if candidate
 * equals another entry's slug or id in scope (case-insensitive).
 */
export function findSlugConflict(opts: {
  kind: SlugKind;
  slug: string;
  selfId: string;
  seriesId?: string | null;
  seriesEntries?: SlugEntry[] | null;
  editionEntries?: SlugEntry[] | null;
}): { id: string; reason: 'slug' | 'id' } | null {
  const candidate = (opts.slug || '').toLowerCase();
  if (!candidate) return null;
  const selfId = String(opts.selfId || '');

  if (opts.kind === 'series') {
    for (const entry of opts.seriesEntries || []) {
      const id = String(entry.id || '');
      if (!id || id === selfId) continue;
      if (id.toLowerCase() === candidate) {
        return { id, reason: 'id' };
      }
      const other = entry.slug != null ? String(entry.slug).trim().toLowerCase() : '';
      if (other && other === candidate) {
        return { id, reason: 'slug' };
      }
    }
    return null;
  }

  const seriesId =
    opts.seriesId != null && String(opts.seriesId).trim()
      ? String(opts.seriesId).trim()
      : '';
  for (const entry of opts.editionEntries || []) {
    const id = String(entry.id || '');
    if (!id || id === selfId) continue;
    const entrySeries =
      entry.series_id != null && String(entry.series_id).trim()
        ? String(entry.series_id).trim()
        : id;
    if (seriesId && entrySeries !== seriesId) continue;
    if (id.toLowerCase() === candidate) {
      return { id, reason: 'id' };
    }
    const other = entry.slug != null ? String(entry.slug).trim().toLowerCase() : '';
    if (other && other === candidate) {
      return { id, reason: 'slug' };
    }
  }
  return null;
}

export function conflictErrorMessage(
  kind: SlugKind,
  slug: string,
  reason: 'slug' | 'id'
): string {
  if (kind === 'series') {
    return reason === 'id'
      ? `The URL slug "${slug}" matches another publication's id and would be unreachable.`
      : `The URL slug "${slug}" is already in use by another publication.`;
  }
  return reason === 'id'
    ? `The URL slug "${slug}" matches another edition's id in this publication and would be unreachable.`
    : `An edition with the URL slug "${slug}" already exists in this publication.`;
}

/** Build a set of taken lowercase segments (ids + slugs) for suggestUniqueSlug. */
export function buildTakenSlugSet(
  entries: SlugEntry[] | null | undefined,
  selfId?: string
): Set<string> {
  const taken = new Set<string>();
  const self = selfId != null ? String(selfId) : '';
  for (const entry of entries || []) {
    const id = String(entry.id || '');
    if (!id || id === self) continue;
    taken.add(id.toLowerCase());
    const slug = entry.slug != null ? String(entry.slug).trim().toLowerCase() : '';
    if (slug) taken.add(slug);
  }
  return taken;
}

/**
 * Prefer `base`, otherwise `base-2`, `base-3`, ... until free.
 */
export function suggestUniqueSlug(base: string, taken: Set<string>): string {
  const normalized = sanitizeSlug(base);
  const root = normalized || 'edition';
  if (!taken.has(root) && isValidSlug(root) && !isReservedSlug(root)) {
    return root;
  }
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const maxRoot = SLUG_MAX_LENGTH - suffix.length;
    const clipped = root.substring(0, Math.max(1, maxRoot)).replace(/-$/, '');
    const candidate = `${clipped}${suffix}`;
    if (
      isValidSlug(candidate) &&
      !taken.has(candidate) &&
      !isReservedSlug(candidate)
    ) {
      return candidate;
    }
  }
  return `${root.substring(0, 40)}-${Date.now().toString(36)}`;
}

/**
 * Path segment for public URLs: prefer valid slug, else document id.
 * Never returns a URL-like stored slug.
 */
export function publicPathSegment(
  slug: string | null | undefined,
  fallbackId: string
): string {
  const id = fallbackId != null ? String(fallbackId).trim() : '';
  const s = slug != null ? String(slug).trim() : '';
  if (s && isValidSlug(s)) return s;
  return id;
}
