# SEO & GEO

Canonical site: `NEXT_PUBLIC_SITE_URL` (default `https://publications.rsamdio.org`).

## Title contract

| Surface | Title |
|---------|--------|
| Home | `Publications Hub \| Rotaract South Asia MDIO` (absolute) |
| About | `About \| Publications Hub \| Rotaract South Asia MDIO` |
| Publication `/[seriesSlug]` | `{Series} \| Publications Hub \| Rotaract South Asia MDIO` |
| Edition `/[seriesSlug]/[editionSlug]` | `{Edition} - {Series} \| Publications Hub \| Rotaract South Asia MDIO` |
| Privacy / Terms | `{Page} \| Publications Hub \| Rotaract South Asia MDIO` |
| Studio / Admin | Short titles + `noindex` |

Helpers: [`lib/seo/metadata.ts`](../lib/seo/metadata.ts), [`lib/seo/jsonld.ts`](../lib/seo/jsonld.ts), [`lib/seo/dates.ts`](../lib/seo/dates.ts).

## Crawl / citation surfaces (GEO)

Public pages aim to be **citable without executing client JS**:

| Route | HTML facts | JSON-LD |
|-------|------------|---------|
| `/` | Definitional sentence + hero catalog counts; interactive shelf below | `WebSite`, `Organization` (`@id`), `ItemList` (from [`lib/seo/geo-catalog.ts`](../lib/seo/geo-catalog.ts)) |
| `/about` | Mission / audience / how to read & publish | `AboutPage`, `WebSite`, `Organization` |
| `/[seriesSlug]` | Interactive publication UI; enriched `sr-only` crawl summary | `CreativeWorkSeries` + `hasPart` + `BreadcrumbList` |
| `/[seriesSlug]/[editionSlug]` | Enriched `sr-only` crawl summary (reader stays full-screen) | `PublicationIssue` + `MediaObject` (PDF) + `BreadcrumbList` |

Stable `@id`s: `{site}/#organization`, `{site}/#website`, `{seriesUrl}#series`, `{editionUrl}#issue`.

## Crawl config

- `/robots.txt` - [`app/robots.ts`](../app/robots.ts): disallow `/studio`, `/admin`; explicit allow for GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, cohere-ai, Amazonbot, Diffbot, Meta-ExternalAgent
- `/sitemap.xml` - [`app/sitemap.ts`](../app/sitemap.ts): home, about, legal, all public series + editions; `lastModified` from dates when present
- `/llms.txt` - [`app/llms.txt/route.ts`](../app/llms.txt/route.ts) and `/llms-full.txt` - [`app/llms-full.txt/route.ts`](../app/llms-full.txt/route.ts): dynamic markdown catalog feeds for AI agents and assistants
- `IndexNow` - [`public/fc66e32136887908af4a8222ec18b665.txt`](../public/fc66e32136887908af4a8222ec18b665.txt), [`scripts/submit-indexnow.mjs`](../scripts/submit-indexnow.mjs): instant URL indexing to Bing, Yandex, Seznam, and Naver upon publication or Netlify production deploy

## Post-deploy checklist

1. Open `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/about` on production.
2. Confirm staff paths disallowed and AI bot allows present.
3. Submit/refresh sitemap in Google Search Console.
4. Spot-check share previews for home, one series, one edition (**Edition - Series** title).
5. **View Source** (no JS):
   - Home: definitional sentence, catalog counts/list, `ItemList` JSON-LD
   - Series: visible facts + `BreadcrumbList` + `hasPart`
   - Edition: `sr-only` facts + `PublicationIssue` + `MediaObject` + breadcrumbs
6. URL Inspection for 3-5 publications after crawl.

## Off-site authority (ops, not code)

1. RSAMDIO.org landing + link to Publications Hub with the definitional sentence  
2. Promote specific `/[seriesSlug]/[editionSlug]` URLs in district channels  
3. Wikidata / `sameAs` when eligible  
4. Mentions → links recovery for clubs already using the product  
5. Quarterly Perplexity / AI Overview probes for “RSAMDIO Publications Hub” / “Rotaract South Asia publications”

## Notes

- Default OG fallback image: `/images/ogimage.webp` (1200×630).
- Twitter card handle: `@rsa_mdio` (`twitter:site` and `twitter:creator`).
- Interactive shelf/reader remain client-side; SSR layers above are for citation and crawl.
- Do not index Studio/Admin; do not treat PDF body text as the primary snippet source.
