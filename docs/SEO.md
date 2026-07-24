# SEO

Canonical site: `NEXT_PUBLIC_SITE_URL` (default `https://publications.rsamdio.org`).

## Title contract

| Surface | Title |
|---------|--------|
| Home | `Publications Hub \| Rotaract South Asia MDIO` (absolute) |
| Publication `/p/[seriesId]` | `{Series} \| Publications Hub \| Rotaract South Asia MDIO` |
| Edition `/p/.../e/...` | `{Edition} – {Series} \| Publications Hub \| Rotaract South Asia MDIO` |
| Privacy / Terms | `{Page} \| Publications Hub \| Rotaract South Asia MDIO` |
| Studio / Admin | Short titles + `noindex` |

Helpers: [`lib/seo/metadata.ts`](../lib/seo/metadata.ts), [`lib/seo/jsonld.ts`](../lib/seo/jsonld.ts).

## Crawl surfaces

- `/robots.txt` — App Router [`app/robots.ts`](../app/robots.ts) (disallows `/studio`, `/admin`)
- `/sitemap.xml` — [`app/sitemap.ts`](../app/sitemap.ts) (home, legal, all public series + editions from RTDB)

## Post-deploy checklist

1. Open `/robots.txt` and `/sitemap.xml` on production; confirm Sitemap URL and staff paths are disallowed.
2. Submit sitemap in Google Search Console.
3. Spot-check share previews (Facebook Sharing Debugger / Twitter Card Validator / iMessage) for:
   - Home
   - One publication `/p/{seriesId}`
   - One edition `/p/{seriesId}/e/{editionId}` (title must show **Edition – Series**)
4. View Source on a publication URL: confirm `<h1>`, description, and JSON-LD in the HTML without relying on client JS.
5. URL Inspection in Search Console for 3–5 publications after the first crawl.

## Notes

- Default OG fallback image: `/images/ogimg.webp` (optional later: 1200×630 asset).
- Publication bodies stay interactive client-side; crawlable summary is server-rendered (`PublicationCrawlSummary`).
