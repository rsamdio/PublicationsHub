'use client';

import { useState } from 'react';
import Image from 'next/image';
import { safeHttpUrl } from '@/lib/urls';

type CoverImageProps = {
  /** Full-resolution cover URL (falls back to `thumbUrl` if missing). */
  fullUrl?: string | null;
  /** Small cover thumbnail URL; used as `src` when a full URL is also available (with `srcSet` to the full image). */
  thumbUrl?: string | null;
  sizes: string;
  /** Extra classes appended after the shared `shelf-cover-img` class. */
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  alt?: string;
};

/**
 * Shared cover `<img>` for grids: thumb `src` + optional `srcSet` to full, fading in via
 * `shelf-cover-img--loaded` once decoded (see `globals.css` / `lib/catalog/cover-markup.js`).
 */
export function CoverImage({
  fullUrl,
  thumbUrl,
  sizes,
  className = '',
  loading = 'lazy',
  fetchPriority,
  alt = ''
}: CoverImageProps) {
  const full = safeHttpUrl(fullUrl);
  const thumb = safeHttpUrl(thumbUrl);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!full && !thumb) return null;

  // Prefer lightweight thumbnail (512px WebP) for catalog grids; fall back to full if missing.
  const src = thumb || full;
  if (!src) return null;

  return (
    <Image
      alt={alt}
      className={`shelf-cover-img ${isLoaded ? 'shelf-cover-img--loaded' : ''} ${className}`}
      src={src}
      sizes={sizes}
      width={300}
      height={400}
      loading={loading}
      priority={fetchPriority === 'high' || loading === 'eager'}
      unoptimized
      onLoad={() => setIsLoaded(true)}
      onError={() => setIsLoaded(true)}
      style={{ objectFit: 'cover' }}
    />
  );
}
