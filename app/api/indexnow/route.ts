import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/firebase/config';

const INDEXNOW_API_ENDPOINT = 'https://api.indexnow.org/indexnow';
const INDEXNOW_KEY = 'fc66e32136887908af4a8222ec18b665';
const DISALLOWED_PREFIXES = ['/admin', '/studio'];

function normalizeTargetUrl(rawUrl: string, baseSiteUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const base = baseSiteUrl.replace(/\/$/, '');
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawList: string[] = [];

    if (Array.isArray(body.urls)) {
      rawList.push(...body.urls);
    } else if (typeof body.url === 'string') {
      rawList.push(body.url);
    }

    const currentSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || siteUrl || 'https://publications.rsamdio.org';
    const parsedBase = new URL(currentSiteUrl);
    const host = parsedBase.host;
    const keyLocation = `${currentSiteUrl.replace(/\/$/, '')}/${INDEXNOW_KEY}.txt`;

    const cleanUrls = Array.from(
      new Set(
        rawList
          .map((u) => normalizeTargetUrl(u, currentSiteUrl))
          .filter((u): u is string => u != null)
      )
    );

    if (cleanUrls.length === 0) {
      return NextResponse.json(
        { error: 'No valid canonical URLs provided for submission.' },
        { status: 400 }
      );
    }

    const payload = {
      host,
      key: INDEXNOW_KEY,
      keyLocation,
      urlList: cleanUrls
    };

    const res = await fetch(INDEXNOW_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'PublicationsHub-IndexNow-Route/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    if (res.status === 200 || res.status === 202) {
      return NextResponse.json({
        success: true,
        status: res.status,
        submitted: cleanUrls
      });
    }

    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      {
        error: `IndexNow API returned status ${res.status}`,
        detail
      },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to notify IndexNow', message },
      { status: 500 }
    );
  }
}
