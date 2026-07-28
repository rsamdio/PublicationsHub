import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/firebase/config';

const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended'
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/studio', '/admin']
      },
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        allow: '/' as const,
        disallow: ['/studio', '/admin']
      }))
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
