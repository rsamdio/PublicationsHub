# Architecture: System Overview

This document describes the high-level frontend architecture, Next.js App Router structure, UI component hierarchy, and styling tokens for **PublicationsHub**.

## 1. Application Architecture

PublicationsHub is a Next.js 15 application using the App Router, React 19, TypeScript, and Tailwind CSS 3. It serves public readers, publisher teams, and platform administrators.

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 15 Frontend                     │
├─────────────────┬─────────────────────┬─────────────────────┤
│  Public Readers │  Publisher Teams    │ Platform Staff      │
│  - Home (/)     │  - Studio (/studio) │ - Admin (/admin)    │
│  - Detail (Slug) │  - Roster / Invites │ - Catalog Backfill  │
│  - Reader (Slug) │  - PDF/Cover Upload │ - User Management   │
└────────┬────────┴──────────┬──────────┴──────────┬──────────┘
         │                   │                     │
         ▼                   ▼                     ▼
┌──────────────────┐ ┌────────────────────────────────────────┐
│ RTDB Read Mirror │ │ Firestore (System of Record) / Functions│
│ (Zero auth read) │ │ (Authenticated writes & server callables) │
└──────────────────┘ └────────────────────────────────────────┘
```

## 2. Route Hierarchy

| Route | Page File | Rendering | Primary Responsibility |
|---|---|---|---|
| `/` | `app/page.tsx` | Static (ISR 60s) | Main catalog shelf with infinite scrolling cards |
| `/about` | `app/about/page.tsx` | Static | Platform mission and reader/publisher guide |
| `/[seriesSlug]` | `app/[seriesSlug]/page.tsx` | Dynamic SSR | Series landing page with edition cards and share modal |
| `/[seriesSlug]/[editionSlug]` | `app/[seriesSlug]/[editionSlug]/page.tsx` | Dynamic SSR | PDF flipbook reader shell with same-origin vendor scripts |
| `/studio` | `app/studio/page.tsx` | Static (Client SPA) | Publisher dashboard with Google Auth |
| `/admin` | `app/admin/page.tsx` | Static (Client SPA) | Platform staff dashboard with role/tier checks |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | Static | Legal compliance and policy pages |
| `/robots.txt`, `/sitemap.xml` | `app/robots.ts`, `app/sitemap.ts` | Dynamic | Search engine & AI crawler indexing |

## 3. UI Component System

- `ShelfCatalog.tsx`: Handles public library browsing. Fetches published editions from RTDB, groups editions into series objects, renders an initial batch of 12 series cards, and uses IntersectionObserver for infinite scroll pagination.
- `PublicationDetail.tsx`: Renders series banner, metadata (cadence, publisher, description), and edition cards with click-to-read triggers.
- `EditionReader.tsx`: Mounts the PDF flipbook viewer via `lib/client/viewer.js` and `ReaderChrome.tsx`.
- `FramedDeepLinkEscape.tsx`: Embed safety guardrail. When embedded in an iframe on external domains, intercepts publication links and escapes them to new top-level tabs.
- `SiteNav.tsx` & `SiteFooter.tsx`: Global navigation header and footer with canonical branding.

## 4. Theme & Styling Tokens

- Background color: `bg-background-light` (`#f6f3ed`)
- Surface color: `#fffcf8`
- Primary brand accent: Rotaract cranberry pink (`#d81a6a`)
- Text colors: Slate 900 (`#0f172a`) for headings, Slate 600 (`#475569`) for body
- Font family: Inter (`@fontsource/inter`) with fallback sans-serif
- Reader theme: Defaults to light with an in-reader toggle for dark mode (`pubhub-reader-theme` in localStorage)
