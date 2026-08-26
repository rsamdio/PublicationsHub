# PublicationsHub - Agent Operating Context

Use this file as the root instruction layer. Consult [index.md](index.md) for full directory maps, file concerns, and task workflows.

## 1. Authority and Precedence

When facts conflict, adhere to this hierarchy:
1. **Current source code and configuration** (System of record)
2. **Automated tests and build outputs** (`npm run validate:all`)
3. **Explicit repository invariants** (Section 2 below)
4. **Primary navigation map** ([index.md](index.md))
5. **Architecture documentation** (`docs/architecture/*`)
6. **Agent assumptions** (Verify against source before assuming)

## 2. Core Repository Invariants

- **Backend is Frozen (with exceptions)**: Do not arbitrarily modify `functions/`, Firestore/RTDB/Storage security rules, or R2 bucket configurations for frontend UI tasks. However, if a new feature requires schema additions (e.g. adding a `slug` field to an existing collection), you may carefully update `firestore.rules` and `functions/mirror.js` to support it, provided no existing data is lost or broken.
- **Client Read/Write Split**:
  - Writes: Firestore collections / Cloud Function callables via `lib/firebase/db-publisher.js` or `db-admin.js`.
  - Reads: Realtime Database (RTDB) read mirrors via `lib/firebase/db-public.js`, `db-publisher.js`, `db-admin.js`. Direct client reads to mirrored Firestore collections are blocked.
- **UI Theme**: Site chrome is light-only (`#f6f3ed` background, `#fffcf8` nav/footer, `#d81a6a` Rotaract cranberry pink accent). The PDF flipbook reader (`#reader-view`) defaults to light with an in-reader toggle to dark.
- **Iframe Embed Safety**: Embedded contexts (`window.self !== window.top`) are restricted to Home + About. Any `/[seriesSlug]/...` links escape to a new tab (`noopener`). Direct framed deep links open a new tab and reset the iframe to `/`.
- **Canonical URLs**: Use path shapes defined in [lib/urls.ts](lib/urls.ts) (`/[seriesSlug]`, `/[seriesSlug]/[editionSlug]`). No legacy `.html` routes or query-param bridges.
- **No Long Em Dashes**: Never use em dashes (`\u2014`) in any agent-generated text, documentation, comments, commit messages, or UI copy. Use hyphens, colons, parentheses, or separate sentences instead.
- **Zero Secrets in Frontend**: Cloudflare R2 credentials stay strictly server-side in Cloud Functions.

## 3. Fast Routing & Progressive Disclosure

- **Primary Repository Map**: See [index.md](index.md) for quick lookups on where features live and what to read before modifying an area.
- **Architecture Deep Dives**:
  - System Overview: [docs/architecture/system-overview.md](docs/architecture/system-overview.md)
  - Data Flow & RTDB Mirrors: [docs/architecture/data-flow-and-mirrors.md](docs/architecture/data-flow-and-mirrors.md)
  - Storage & Reader Engine: [docs/architecture/storage-and-reader.md](docs/architecture/storage-and-reader.md)
  - Security & Invariants: [docs/architecture/security-and-invariants.md](docs/architecture/security-and-invariants.md)
- **Workflows**:
  - Development Guide: [docs/workflows/development.md](docs/workflows/development.md)
  - Agent Maintenance Guide: [docs/workflows/maintenance.md](docs/workflows/maintenance.md)
- **Agent Skills**:
  - Full Verification: [.agents/skills/validate-repo/SKILL.md](.agents/skills/validate-repo/SKILL.md)
  - Harness Maintenance: [.agents/skills/update-harness/SKILL.md](.agents/skills/update-harness/SKILL.md)
  - Reader Engine: [.agents/skills/reader-engine/SKILL.md](.agents/skills/reader-engine/SKILL.md)
  - Catalog Sync: [.agents/skills/catalog-sync/SKILL.md](.agents/skills/catalog-sync/SKILL.md)

## 4. Key Commands

```bash
npm run dev              # Start Next.js development server (port 3000)
npx tsc --noEmit         # TypeScript typecheck
npm run build            # Next.js production build
npm run validate:harness # Validate all harness links, routes, components, skills
npm run validate:dashes  # Verify zero em dashes across harness and docs
npm run validate:all     # Complete CI check (dashes + harness + types + build)
```
