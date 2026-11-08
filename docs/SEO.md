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

## URL slug policy

Public path segments must be lowercase `a-z0-9` with optional hyphens (`july-2026`). Studio and Admin reject pasted URLs, paths, `%` encodings, and reserved root routes. Write helpers in [`lib/urls.ts`](../lib/urls.ts) and [`lib/firebase/db-publisher.js`](../lib/firebase/db-publisher.js) enforce the same rules; Firestore rules require a valid slug on create.

Known broken historical addresses 301 via [`lib/seo/slug-redirects.ts`](../lib/seo/slug-redirects.ts) and [`middleware.ts`](../middleware.ts). After renaming live records, keep that map aligned with the new canonicals:

| Target after rename | Notes |
|---|---|
| `/the-wings-log` | Wings Log series (D3191) |
| `/the-wings-log/july-2026` | Wings Log July 2026 edition |
| `/kairav/july-2026` | KAIRAV July |
| `/kairav/august-2026` | KAIRAV August |

Checks:

- `npm run validate:slugs` (unit policy + redirect map; part of `validate:all`)
- `npm run validate:slugs:live` (RTDB audit; run after renames / before crawl)

Missing series/edition routes call `notFound()` (HTTP 404, `noindex`). Sitemap and llms feeds never emit URL-like stored slugs (they fall back to document id).

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
7. Confirm the four historical broken URLs 301 to the targets above, and that sitemap lists only the new addresses.
8. Confirm a nonsense path returns HTTP 404 (not a soft 200 "not found" document).
9. Run `npm run validate:slugs:live` after Admin renames.

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
