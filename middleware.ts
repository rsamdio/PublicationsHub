import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { lookupSlugRedirect } from '@/lib/seo/slug-redirects';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const dest = lookupSlugRedirect(pathname);
  if (!dest) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = dest;
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: [
    /*
     * Match all pathnames except static assets and Next internals.
     * Broken slugs may contain encoded slashes (%2F) in a single segment.
     */
    '/((?!_next/static|_next/image|favicon.ico|images/|fonts/|vendor/|api/).*)'
  ]
};
