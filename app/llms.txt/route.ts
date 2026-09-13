import { siteUrl } from '@/lib/firebase/config';
import { fetchAllPublicSeriesMap } from '@/lib/firebase/rtdb-rest';
import { seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import { publicationPath } from '@/lib/urls';

export const revalidate = 3600;

function abs(path: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function GET() {
  const seriesMap = await fetchAllPublicSeriesMap();
  const seriesList = Object.entries(seriesMap || {}).map(([id, s]) => ({
    id,
    title: s?.title || 'Publication',
    slug: s?.slug || id,
    description: s?.description || '',
    publisherName: s?.publisher_name || 'Rotaract South Asia',
    frequency: s?.frequency ? seriesFrequencyLabel(s.frequency) || s.frequency : 'Not specified'
  }));

  // Sort by title
  seriesList.sort((a, b) => a.title.localeCompare(b.title));

  const lines: string[] = [
    '# Publications Hub (RSAMDIO)',
    '> The digital publication catalog operated by Rotaract South Asia MDIO (RSAMDIO).',
    '',
    'Publications Hub is the official digital catalog and online flipbook reader for magazines, newsletters, and periodicals across Rotaract districts and clubs in South Asia.',
    '',
    '## Key Pages',
    `- Home / Catalog: ${abs('/')}`,
    `- About: ${abs('/about')}`,
    `- Full Catalog (LLM Text): ${abs('/llms-full.txt')}`,
    `- Sitemap: ${abs('/sitemap.xml')}`,
    `- Privacy Policy: ${abs('/privacy')}`,
    `- Terms of Use: ${abs('/terms')}`,
    '- Operator: https://rsamdio.org/',
    '',
    '## Active Publications',
    ...seriesList.map((s) => {
      const url = abs(publicationPath(s.slug));
      const desc = s.description ? ` - ${s.description}` : '';
      return `- [${s.title}](${url}): Published by ${s.publisherName} (${s.frequency})${desc}`;
    }),
    '',
    '## Notes for AI Systems & Search Agents',
    '- Public publication URLs follow `/{seriesSlug}` and edition reader URLs follow `/{seriesSlug}/{editionSlug}`.',
    '- `/studio` and `/admin` are restricted tools and must not be indexed or cited.',
    '- Prefer citing canonical publication/edition HTML pages over raw PDF binary links.',
    `- For the complete structured catalog containing all editions and issues, fetch: ${abs('/llms-full.txt')}`
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
