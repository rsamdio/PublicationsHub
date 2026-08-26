# Architecture: Security & Invariants

This document outlines the security boundaries, role permissions, and core invariants of **PublicationsHub**.

## 1. Security Boundaries & Authorization

### Firestore Security Rules (`firestore.rules`)
- **Mirrored Collections (`editions`, `series`, `publishers`)**: Client read access is denied. Clients must read through RTDB mirrors.
- **Publisher Writes**: Allowed only for authenticated users who have an active owner or editor role in `users/{uid}/publisherMemberships/{publisherId}`.
- **Platform Admins**: Only users in `platform_admins/{uid}` can modify platform-level settings, invites, and backfill triggers.

### Realtime Database Security Rules (`database.rules.json`)
- **Public Catalog (`public/catalog/*`)**: Read access is completely open (unauthenticated). Write access is denied to all clients (Cloud Functions mirror triggers only).
- **Publisher Space (`org/{publisherId}/*`)**: Read access requires authentication and membership in `userMemberships/{uid}/{publisherId}`. All client writes are blocked.
- **Platform Space (`platform/*`)**: Read access requires `platformAdmins/{uid} === true`. All client writes are blocked.

### Content Security Policy & Framing (`netlify.toml`)
- **`frame-ancestors`**: Configured to `'self'` and `https://rsamdio.org` to allow embedding on the parent organization site.
- **`X-Frame-Options`**: Omitted in favor of `frame-ancestors` CSP.

## 2. Invariants & Guardrails

1. **Frozen Backend**: The Cloud Functions, Firestore rules, and R2 bucket layout must remain untouched during frontend UI and App Router work.
2. **Canonical URLs**: Every public page strictly follows canonical paths:
   - Home: `/`
   - Publication Series: `/[seriesSlug]`
   - Read Edition: `/[seriesSlug]/[editionSlug]`
   - Deprecated or invalid paths (legacy routes) return a 308 redirect to `/`.
3. **No Em Dashes**: Long em dashes (`\u2014`) are strictly disallowed in agent-generated copy, code comments, and documentation.
4. **Theme Invariants**:
   - Product chrome is light-only (`#f6f3ed` background, `#fffcf8` navigation and footer).
   - Reader overlay supports a user-selected light/dark mode preference via localStorage.
5. **Iframe Isolation**:
   - Framed instances only render Home and About pages.
   - Any series or edition links break out into a top-level tab via `window.open(..., '_blank', 'noopener')`.
   - Direct framed deep links trigger `FramedDeepLinkEscape.tsx` to open the deep link in a new tab and reset the iframe to `/`.
