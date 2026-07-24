import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/firebase/config';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/studio', '/admin']
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
