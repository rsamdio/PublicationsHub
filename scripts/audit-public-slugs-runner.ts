/**
 * Fetches public catalog mirrors and reports invalid slugs.
 */
import {
  fetchAllPublicEditionsMap,
  fetchAllPublicSeriesMap
} from '../lib/firebase/rtdb-rest.ts';
import { isValidSlug, looksLikeUrlOrPath } from '../lib/urls.ts';

type Finding = {
  kind: 'series' | 'edition';
  id: string;
  slug: string;
  title: string;
  reason: string;
};

function reasonFor(slug: string): string {
  if (!slug) return 'empty (falls back to document id in URLs)';
  if (looksLikeUrlOrPath(slug)) return 'looks like a URL or path';
  if (!isValidSlug(slug)) return 'fails isValidSlug (lowercase letters, numbers, hyphens)';
  return 'unknown';
}

async function main() {
  const [seriesMap, editionsMap] = await Promise.all([
    fetchAllPublicSeriesMap(),
    fetchAllPublicEditionsMap()
  ]);

  const findings: Finding[] = [];

  for (const [id, s] of Object.entries(seriesMap || {})) {
    const slug = s?.slug != null ? String(s.slug).trim() : '';
    if (slug && !isValidSlug(slug)) {
      findings.push({
        kind: 'series',
        id,
        slug,
        title: s?.title || '',
        reason: reasonFor(slug)
      });
    }
  }

  for (const [id, ed] of Object.entries(editionsMap || {})) {
    const slug = ed?.slug != null ? String(ed.slug).trim() : '';
    if (slug && !isValidSlug(slug)) {
      findings.push({
        kind: 'edition',
        id,
        slug,
        title: ed?.title || '',
        reason: reasonFor(slug)
      });
    }
  }

  if (!findings.length) {
    console.log('[OK] No invalid public slugs in RTDB mirrors.');
    process.exit(0);
  }

  console.error(`[FAIL] ${findings.length} invalid public slug(s):\n`);
  for (const f of findings) {
    console.error(
      `- ${f.kind} ${f.id} title=${JSON.stringify(f.title)} slug=${JSON.stringify(f.slug)} (${f.reason})`
    );
  }
  console.error(
    '\nRename these in Admin/Studio, then re-run npm run validate:slugs:live.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('[FAIL] audit-public-slugs:', err?.message || err);
  process.exit(1);
});