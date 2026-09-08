#!/usr/bin/env node

/**
 * Submits canonical URLs to the IndexNow protocol (Microsoft Bing, Yandex, Seznam, etc.).
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs                 # Discover from sitemap / RTDB and submit
 *   node scripts/submit-indexnow.mjs --dry-run       # Print URLs without sending
 *   node scripts/submit-indexnow.mjs --url=/about    # Submit single URL
 *   node scripts/submit-indexnow.mjs --build         # Netlify CI build mode (skips non-production)
 */

const INDEXNOW_API_ENDPOINT = 'https://api.indexnow.org/indexnow';
const DEFAULT_KEY = 'fc66e32136887908af4a8222ec18b665';
const DEFAULT_SITE_URL = 'https://publications.rsamdio.org';
const RTDB_BASE_URL = 'https://rsapublicationhub-default-rtdb.asia-southeast1.firebasedatabase.app';

const STATIC_ROUTES = ['/', '/about', '/privacy', '/terms'];
const DISALLOWED_PREFIXES = ['/admin', '/studio'];

function parseArgs(args) {
  const flags = {
    dryRun: false,
    build: false,
    force: false,
    url: null,
    key: DEFAULT_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--build') {
      flags.build = true;
    } else if (arg === '--force') {
      flags.force = true;
    } else if (arg.startsWith('--url=')) {
      flags.url = arg.slice('--url='.length).trim();
    } else if (arg.startsWith('--key=')) {
      flags.key = arg.slice('--key='.length).trim();
    } else if (arg.startsWith('--site-url=')) {
      flags.siteUrl = arg.slice('--site-url='.length).trim().replace(/\/$/, '');
    }
  }

  return flags;
}

function normalizeUrl(rawUrl, siteUrl) {
  if (!rawUrl) return null;
  const base = siteUrl.replace(/\/$/, '');
  let fullUrl = rawUrl.trim();

  if (fullUrl.startsWith('/')) {
    fullUrl = `${base}${fullUrl}`;
  }

  try {
    const parsed = new URL(fullUrl);
    const parsedBase = new URL(base);
    if (parsed.hostname !== parsedBase.hostname) {
      return null;
    }
    for (const prefix of DISALLOWED_PREFIXES) {
      if (parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)) {
        return null;
      }
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

async function fetchSitemapUrls(siteUrl) {
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'PublicationsHub-IndexNow-Submitter/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      return [];
    }
    const xml = await res.text();
    const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
    const urls = matches.map((m) => m[1].trim());
    return urls;
  } catch {
    return [];
  }
}

async function fetchFallbackCatalogUrls(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const urls = new Set(STATIC_ROUTES.map((r) => (r === '/' ? `${base}/` : `${base}${r}`)));

  try {
    const [seriesRes, editionsRes] = await Promise.all([
      fetch(`${RTDB_BASE_URL}/platform/series.json`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${RTDB_BASE_URL}/platform/editions.json`, { signal: AbortSignal.timeout(5000) })
    ]);

    const seriesData = seriesRes.ok ? await seriesRes.json() : null;
    const editionsData = editionsRes.ok ? await editionsRes.json() : null;

    if (seriesData && typeof seriesData === 'object') {
      for (const [seriesId, s] of Object.entries(seriesData)) {
        if (!seriesId || !s) continue;
        const slug = s.slug || seriesId;
        urls.add(`${base}/${encodeURIComponent(slug)}`);
      }
    }

    if (editionsData && typeof editionsData === 'object') {
      for (const [editionId, ed] of Object.entries(editionsData)) {
        if (!editionId || !ed) continue;
        const seriesId = ed.series_id || editionId;
        const s = seriesData?.[seriesId];
        const seriesSlug = s?.slug || seriesId;
        const editionSlug = ed.slug || editionId;
        urls.add(`${base}/${encodeURIComponent(seriesSlug)}/${encodeURIComponent(editionSlug)}`);
      }
    }
  } catch {
    // If RTDB is unreachable, static routes remain in set.
  }

  return Array.from(urls);
}

async function checkRemoteKey(siteUrl, key) {
  const keyUrl = `${siteUrl.replace(/\/$/, '')}/${key}.txt`;
  try {
    const res = await fetch(keyUrl, {
      headers: { 'User-Agent': 'PublicationsHub-IndexNow-Validator/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      return { ok: false, status: res.status, keyUrl };
    }
    const text = (await res.text()).trim();
    const matches = text === key;
    return { ok: matches, status: res.status, keyUrl, remoteContent: text };
  } catch (err) {
    return { ok: false, status: 0, keyUrl, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = parseArgs(args);

  // CI build mode handling: Netlify sets CONTEXT
  if (flags.build) {
    const netlifyContext = process.env.CONTEXT;
    if (netlifyContext && netlifyContext !== 'production') {
      console.log(`[IndexNow] Netlify build context is "${netlifyContext}". Skipping submission on non-production deploy.`);
      process.exit(0);
    }
  }

  const parsedBase = new URL(flags.siteUrl);
  const host = parsedBase.host;
  const keyLocation = `${flags.siteUrl.replace(/\/$/, '')}/${flags.key}.txt`;

  console.log(`[IndexNow] Host: ${host}`);
  console.log(`[IndexNow] Key Location: ${keyLocation}`);

  let targetUrls = [];

  if (flags.url) {
    const single = normalizeUrl(flags.url, flags.siteUrl);
    if (!single) {
      console.error(`[IndexNow] Error: Invalid URL or disallowed path: ${flags.url}`);
      process.exit(1);
    }
    targetUrls = [single];
  } else {
    console.log('[IndexNow] Discovering canonical URLs from live sitemap...');
    const sitemapUrls = await fetchSitemapUrls(flags.siteUrl);

    if (sitemapUrls.length > 0) {
      console.log(`[IndexNow] Discovered ${sitemapUrls.length} URLs from sitemap.`);
      targetUrls = sitemapUrls;
    } else {
      console.log('[IndexNow] Sitemap unreachable or empty. Falling back to public catalog discovery...');
      const fallbackUrls = await fetchFallbackCatalogUrls(flags.siteUrl);
      console.log(`[IndexNow] Discovered ${fallbackUrls.length} fallback URLs.`);
      targetUrls = fallbackUrls;
    }
  }

  // Filter and deduplicate URLs
  const cleanUrls = Array.from(
    new Set(
      targetUrls
        .map((u) => normalizeUrl(u, flags.siteUrl))
        .filter(Boolean)
    )
  );

  if (cleanUrls.length === 0) {
    console.log('[IndexNow] No valid URLs to submit.');
    process.exit(0);
  }

  console.log(`[IndexNow] Preparing to submit ${cleanUrls.length} URLs.`);

  if (flags.dryRun) {
    console.log('[IndexNow] Dry run enabled. URLs that would be submitted:');
    cleanUrls.forEach((u) => console.log(`  - ${u}`));
    console.log('[IndexNow] Dry run complete. No network requests sent.');
    process.exit(0);
  }

  // Verify key accessibility on remote host
  if (!flags.force) {
    console.log(`[IndexNow] Verifying key availability at ${keyLocation}...`);
    const keyCheck = await checkRemoteKey(flags.siteUrl, flags.key);
    if (!keyCheck.ok) {
      console.warn(`[IndexNow] Notice: Remote verification key not detected or mismatched at ${keyLocation}`);
      if (flags.build) {
        console.warn('[IndexNow] Build mode active: skipping submission without failing the build.');
        process.exit(0);
      }
      console.warn('[IndexNow] Use --force to proceed anyway.');
      process.exit(1);
    }
    console.log('[IndexNow] Ownership key verified successfully on remote host.');
  }

  const payload = {
    host,
    key: flags.key,
    keyLocation,
    urlList: cleanUrls
  };

  console.log(`[IndexNow] Submitting ${cleanUrls.length} URLs to ${INDEXNOW_API_ENDPOINT}...`);

  try {
    const res = await fetch(INDEXNOW_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'PublicationsHub-IndexNow-Submitter/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    if (res.status === 200) {
      console.log('[IndexNow] Success: 200 OK. URLs submitted and accepted by IndexNow network.');
    } else if (res.status === 202) {
      console.log('[IndexNow] Accepted: 202. URLs received; key validation is in progress.');
    } else {
      const errorText = await res.text();
      console.warn(`[IndexNow] Response status ${res.status}: ${res.statusText}`);
      if (errorText) {
        console.warn(`[IndexNow] Details: ${errorText}`);
      }
      if (flags.build) {
        console.warn('[IndexNow] Build mode active: ignoring failure so deployment is not disrupted.');
        process.exit(0);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(`[IndexNow] Network error connecting to IndexNow: ${err.message}`);
    if (flags.build) {
      console.warn('[IndexNow] Build mode active: ignoring network failure so deployment is not disrupted.');
      process.exit(0);
    }
    process.exit(1);
  }
}

main();
