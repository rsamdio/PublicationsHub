# PublicationsHub - Repository Map & Navigation Index

This is the primary navigation layer for AI coding agents and human developers. Use this file to route directly to authoritative code files, components, architecture specifications, and workflows.

## 1. Quick Repository Overview

| Property | Value |
|---|---|
| Project Type | Multi-tenant digital publication library & flipbook reader |
| Frontend Stack | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3 |
| Backend Stack (Frozen) | Cloud Functions Gen 2 (Node 22), Firestore, Realtime Database (RTDB), Cloudflare R2 |
| Deployment | Netlify (`@netlify/plugin-nextjs`) + Firebase Functions (`us-central1`) |
| Canonical URL | `https://publications.rsamdio.org` |
| Primary Accent | Rotaract Cranberry Pink (`#d81a6a`), Light Chrome (`#f6f3ed`) |

## 2. Directory Structure Map

```
PublicationsHub/
├── AGENTS.md                  # Root agent operating context and global invariants
├── index.md                   # Primary navigation layer (this file)
├── README.md                  # Human-facing introduction and onboarding
├── app/                       # Next.js App Router (pages, layouts, metadata)
│   ├── layout.tsx             # Root layout (analytics, font, theme colors)
│   ├── page.tsx               # Home catalog route (/)
│   ├── about/page.tsx         # About page (/about)
│   ├── admin/page.tsx         # Platform staff dashboard (/admin)
│   ├── studio/page.tsx        # Publisher management dashboard (/studio)
│   ├── [seriesSlug]/          # Publication routes
│   │   ├── page.tsx           # Series detail view
│   │   └── [editionSlug]/     # Edition reader routes
│   │       └── page.tsx       # Edition flipbook reader (/[seriesSlug]/[editionSlug])
│   ├── privacy/page.tsx       # Privacy policy (/privacy)
│   ├── terms/page.tsx         # Terms of service (/terms)
│   ├── manifest.ts            # Web application manifest (/manifest.webmanifest)
│   ├── robots.ts              # Search & AI crawler directives
│   ├── sitemap.ts             # Dynamic sitemap from RTDB catalog
│   ├── globals.css            # Global CSS, Tailwind utilities, reader styles
│   └── not-found.tsx          # 404 page
├── components/                # Reusable React UI components
│   ├── AdminApp.tsx           # Mounts platform staff interface
│   ├── CoverImage.tsx         # Responsive publication cover component with fallback
│   ├── EditionReader.tsx      # Mounts PDF flipbook reader engine
│   ├── FramedDeepLinkEscape.tsx # Iframe security and navigation escape handler
│   ├── GoogleAnalytics.tsx    # GA4 script tag loader
│   ├── JsonLd.tsx             # Structured data schema injector
│   ├── MaterialIconsFont.tsx  # Material Symbols icon font loader
│   ├── NavigationProgressBar.tsx # Client-side routing progress indicator
│   ├── PublicationCrawlSummary.tsx # Accessible sr-only crawl facts for SEO/GEO
│   ├── PublicationDetail.tsx  # Series overview, edition list, share triggers
│   ├── ReaderChrome.tsx       # Reader toolbar, theme toggle, page navigation
│   ├── ShareMenu.tsx          # Native share dialog with clipboard fallback
│   ├── ShelfCatalog.tsx       # Public library grid, 12 cards/batch, infinite scroll
│   ├── SiteFooter.tsx         # Global footer with links and copyright
│   ├── SiteNav.tsx            # Global header navigation
│   └── StudioApp.tsx          # Mounts publisher studio interface
├── lib/                       # Core library modules
│   ├── urls.ts                # Canonical URL helpers (/[seriesSlug], /[seriesSlug]/[editionSlug])
│   ├── catalog/               # Catalog helpers
│   │   ├── catalog-series.js  # Groups flat editions into series hierarchy
│   │   ├── cover-markup.js    # HTML helpers for cover images
│   │   ├── edition-sort.js    # Sorts editions by issue date and creation date
│   │   ├── frequency-label.js # Translates cadence enum (monthly, quarterly, etc.)
│   │   ├── hydrate-pub-icons.js # Client icon hydration
│   │   └── icons-public.js    # Public SVG icons
│   ├── client/                # Imperative client engines
│   │   ├── admin/main.js      # Platform staff portal imperative logic
│   │   ├── admin-body.ts      # HTML shell for Admin SPA
│   │   ├── dashboard/main.js  # Publisher Studio imperative logic
│   │   ├── dashboard/studio-feedback.js # Feedback toast / dialog helper
│   │   ├── studio-body.ts     # HTML shell for Studio SPA
│   │   ├── viewer.js          # Flipbook reader engine (PDF.js + StPageFlip)
│   │   ├── reader-chrome.ts   # Reader controls and UI bindings
│   │   ├── is-embedded.ts     # Detects iframe environment
│   │   ├── pdf-first-page-webp.js # Browser-side cover extraction from PDF
│   │   ├── privacy-main.ts    # Privacy policy content generator
│   │   └── terms-main.ts      # Terms of service content generator
│   ├── firebase/              # Firebase & storage client libraries
│   │   ├── auth.js            # Google sign-in and session management
│   │   ├── config.ts          # Environment configuration defaults
│   │   ├── db-admin.js        # Platform admin RTDB and callable writes
│   │   ├── db-public.js       # Public catalog RTDB reads (no auth)
│   │   ├── db-publisher.js    # Publisher RTDB reads and Firestore writes
│   │   ├── db.js              # Base Firestore instance (deprecated for reads)
│   │   ├── init.ts            # Firebase app initialization
│   │   ├── rtdb-rest.ts       # REST fallback for RTDB queries
│   │   └── storage.js         # PDF and cover upload handler (multipart + staging)
│   └── seo/                   # Search engine optimization
│       ├── dates.ts           # Date formatting helpers for metadata
│       ├── geo-catalog.ts     # Generates ItemList schema for GEO/AI search
│       ├── jsonld.ts          # Structured data builders (CreativeWorkSeries, PublicationIssue)
│       └── metadata.ts        # Next.js Metadata defaults and templates
├── functions/                 # Backend Cloud Functions (FROZEN)
│   ├── index.js               # Upload HTTP handlers and publisher callables
│   ├── extra-exports.js       # Platform admin callables and backfill triggers
│   ├── mirror.js              # Firestore to RTDB real-time synchronization
│   ├── r2.js                  # Cloudflare R2 S3-compatible storage helper
│   └── cover-encode.js        # Server-side WebP cover thumbnail generator
├── public/                    # Static public assets
│   ├── fonts/                 # Local font assets
│   ├── images/                # Logos, favicons, social cards
│   ├── llms.txt               # LLM guidance document
│   ├── st-page-flip.css       # Page flip engine styling
│   └── vendor/                # Vendored PDF.js and StPageFlip bundles
├── scripts/                   # Tooling and maintenance scripts
│   ├── validate-harness.mjs   # Validates markdown links, routes, and components
│   ├── check-em-dashes.mjs    # Enforces zero long em dashes in agent content
│   ├── migrate-publications.mjs # Legacy publications collection migrator
│   ├── grant-storage-signed-url-iam.sh # Cloud Functions IAM provisioning script
│   └── storage-cors.json      # CORS policy configuration for Firebase Storage
├── docs/                      # Deep documentation
│   ├── architecture/          # Architecture deep dives
│   │   ├── system-overview.md # Next.js frontend structure & rendering
│   │   ├── data-flow-and-mirrors.md # Firestore writes, RTDB mirrors, functions
│   │   ├── storage-and-reader.md # R2 storage, PDF.js, StPageFlip, prefetching
│   │   └── security-and-invariants.md # Security rules, CSP, auth, embed isolation
│   ├── workflows/             # Development and operational workflows
│   │   ├── development.md     # UI, component, and catalog development
│   │   └── maintenance.md     # Agent harness synchronization workflow
│   ├── FIRESTORE_SCHEMA.md    # Detailed Firestore collections & RTDB mirror paths
│   ├── STORAGE.md             # R2 and Storage configuration guide
│   ├── SEO.md                 # Search and generative AI optimization guide
│   └── MIGRATION.md           # Migration instructions for legacy publications
└── .agents/skills/            # Reusable Agent Skills
    ├── validate-repo/SKILL.md # Full repo verification skill
    ├── update-harness/SKILL.md # Harness synchronization skill
    ├── reader-engine/SKILL.md # PDF viewer & flipbook customization skill
    └── catalog-sync/SKILL.md  # RTDB catalog and series grouping skill
```

## 3. Feature and Concern Routing Map

When working on a specific task, consult this table to know which files to inspect:

| Feature / Concern | Authoritative Code Files | Related Documentation | Relevant Skills |
|---|---|---|---|
| **Public Shelf / Catalog** | `components/ShelfCatalog.tsx`, `lib/catalog/catalog-series.js`, `lib/firebase/db-public.js` | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | [catalog-sync](.agents/skills/catalog-sync/SKILL.md) |
| **Series Detail Page** | `app/[seriesSlug]/page.tsx`, `components/PublicationDetail.tsx`, `lib/catalog/edition-sort.js` | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | [catalog-sync](.agents/skills/catalog-sync/SKILL.md) |
| **PDF Flipbook Reader** | `app/[seriesSlug]/[editionSlug]/page.tsx`, `components/EditionReader.tsx`, `lib/client/viewer.js`, `lib/client/reader-chrome.ts` | [docs/architecture/storage-and-reader.md](docs/architecture/storage-and-reader.md) | [reader-engine](.agents/skills/reader-engine/SKILL.md) |
| **Iframe Embed Safety** | `components/FramedDeepLinkEscape.tsx`, `lib/client/is-embedded.ts`, `netlify.toml` | [docs/architecture/security-and-invariants.md](docs/architecture/security-and-invariants.md) | [reader-engine](.agents/skills/reader-engine/SKILL.md) |
| **Publisher Studio (/studio)** | `app/studio/page.tsx`, `components/StudioApp.tsx`, `lib/client/dashboard/main.js`, `lib/firebase/db-publisher.js` | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | [validate-repo](.agents/skills/validate-repo/SKILL.md) |
| **Platform Admin (/admin)** | `app/admin/page.tsx`, `components/AdminApp.tsx`, `lib/client/admin/main.js`, `lib/firebase/db-admin.js` | [docs/architecture/security-and-invariants.md](docs/architecture/security-and-invariants.md) | [validate-repo](.agents/skills/validate-repo/SKILL.md) |
| **SEO, OpenGraph & JSON-LD** | `lib/seo/metadata.ts`, `lib/seo/jsonld.ts`, `lib/seo/geo-catalog.ts`, `app/sitemap.ts`, `app/robots.ts` | [docs/SEO.md](docs/SEO.md) | [validate-repo](.agents/skills/validate-repo/SKILL.md) |
| **File Uploads & R2 Storage** | `lib/firebase/storage.js`, `functions/index.js`, `functions/r2.js` | [docs/STORAGE.md](docs/STORAGE.md) | [reader-engine](.agents/skills/reader-engine/SKILL.md) |
| **Database Mirrors & Triggers** | `functions/mirror.js`, `lib/firebase/db-public.js`, `database.rules.json` | [docs/architecture/data-flow-and-mirrors.md](docs/architecture/data-flow-and-mirrors.md) | [catalog-sync](.agents/skills/catalog-sync/SKILL.md) |
| **Harness & Link Validation** | `scripts/validate-harness.mjs`, `scripts/check-em-dashes.mjs`, `AGENTS.md` | [docs/workflows/maintenance.md](docs/workflows/maintenance.md) | [update-harness](.agents/skills/update-harness/SKILL.md) |

## 4. Commands Reference

| Action | Command | Notes |
|---|---|---|
| **Development** | `npm run dev` | Starts local Next.js dev server at `http://localhost:3000` |
| **Typecheck** | `npx tsc --noEmit` | Validates TypeScript types across the entire project |
| **Build** | `npm run build` | Next.js production build (`next build`) |
| **Validate Harness** | `npm run validate:harness` | Checks all markdown links, routes, components, and skills |
| **Validate Em Dashes** | `npm run validate:dashes` | Ensures no long em dashes exist in agent docs and files |
| **Full Validation** | `npm run validate:all` | Runs em dash check + harness check + typecheck + build |
| **Data Migration** | `npm run migrate` | Runs legacy publications migration script |

## 5. Architectural Invariants and Boundaries

1. **Frontend only scope**: The Cloud Functions backend, Firestore security rules, RTDB rules, and Cloudflare R2 bucket are frozen. Do not alter backend files for frontend feature requests.
2. **Client segregation**: Public reads only touch RTDB mirrors (`public/catalog/...`). Authenticated publisher/admin writes touch Firestore collections or callables. Direct Firestore reads for mirrored data are rejected by security rules.
3. **No em dashes**: Em dashes (`\u2014`) are strictly disallowed in agent-generated text. Use hyphens, colons, parentheses, or separate sentences.
4. **Theme**: Light-only chrome (`#f6f3ed`), cranberry pink accent (`#d81a6a`). Flipbook reader defaults to light with in-reader dark toggle.
5. **Zero secret leakage**: R2 keys and admin credentials must never be bundled into client code.
