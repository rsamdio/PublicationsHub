import { siteUrl } from '@/lib/firebase/config';
import {
  fetchAllPublicEditionsMap,
  fetchAllPublicSeriesMap,
  editionsForSeries,
  toIsoDate
} from '@/lib/firebase/rtdb-rest';
import { seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import { editionPath, publicationPath, publicPathSegment } from '@/lib/urls';

export const revalidate = 3600;

function abs(path: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function GET() {
  const [seriesMap, editionsMap] = await Promise.all([
    fetchAllPublicSeriesMap(),
    fetchAllPublicEditionsMap()
  ]);

  const lines: string[] = [
    '# Publications Hub - Complete Digital Catalog (RSAMDIO)',
    '> Full machine-readable catalog of publication series and editions published across Rotaract South Asia.',
    '',
    'Operated by Rotaract South Asia MDIO (https://rsamdio.org/).',
    `Catalog Home: ${abs('/')}`,
    `Summary: ${abs('/llms.txt')}`,
    `Sitemap: ${abs('/sitemap.xml')}`,
    '',
    '---',
    ''
  ];

  const seriesEntries = Object.entries(seriesMap || {});
  seriesEntries.sort((a, b) => (a[1]?.title || '').localeCompare(b[1]?.title || ''));

  for (const [seriesId, s] of seriesEntries) {
    if (!seriesId || !s) continue;
    const seriesSlug = publicPathSegment(s.slug, seriesId);
    if (!seriesSlug) continue;
    const seriesUrl = abs(publicationPath(seriesSlug));
    const publisher = s.publisher_name || 'Rotaract South Asia';
    const freq = s.frequency ? seriesFrequencyLabel(s.frequency) || s.frequency : 'Not specified';
    const seriesEditions = editionsForSeries(editionsMap, seriesId);

    lines.push(`## ${s.title || 'Publication'}`);
    lines.push(`- **Publisher:** ${publisher}`);
    lines.push(`- **Frequency:** ${freq}`);
    lines.push(`- **Canonical URL:** ${seriesUrl}`);
    if (s.description) {
      lines.push(`- **Description:** ${s.description}`);
    }
    lines.push(`- **Total Editions:** ${seriesEditions.length}`);
    lines.push('');

    if (seriesEditions.length > 0) {
      lines.push('### Published Editions:');
      for (const ed of seriesEditions) {
        const editionSlug = publicPathSegment(ed.slug, ed.id);
        if (!editionSlug) continue;
        const edUrl = abs(editionPath(seriesSlug, editionSlug));
        const dateStr = toIsoDate(ed.issue_date ?? ed.created_at);
        const dateLabel = dateStr ? ` (${dateStr})` : '';
        const title = ed.title || 'Edition';
        lines.push(`- [${title}](${edUrl})${dateLabel}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
