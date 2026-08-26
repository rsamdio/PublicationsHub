import type { MetadataRoute } from 'next';
import { DEFAULT_DESCRIPTION, SITE_NAME } from '@/lib/seo/metadata';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} - Rotaract South Asia MDIO`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f3ed',
    theme_color: '#f6f3ed',
    icons: [
      {
        src: '/images/favicon.webp',
        sizes: 'any',
        type: 'image/webp'
      },
      {
        src: '/images/rsamdio.webp',
        sizes: '192x192',
        type: 'image/webp'
      },
      {
        src: '/images/rsamdio.webp',
        sizes: '512x512',
        type: 'image/webp'
      }
    ]
  };
}
