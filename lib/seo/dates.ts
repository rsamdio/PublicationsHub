/** Parse RTDB issue_date / created_at into an ISO string for sitemap lastmod and JSON-LD. */
export function toIsoDate(v: number | string | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return new Date(v).toISOString();
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Date object for Next sitemap `lastModified`, or undefined when unknown. */
export function toLastModified(v: number | string | null | undefined): Date | undefined {
  const iso = toIsoDate(v);
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
