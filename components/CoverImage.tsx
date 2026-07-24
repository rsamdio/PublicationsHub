'use client';

import { useEffect, useRef } from 'react';
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      img.classList.add('shelf-cover-img--loaded');
    }
  }, [full, thumb]);

  if (!full && !thumb) return null;

  const reveal = (event: React.SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.classList.add('shelf-cover-img--loaded');
  };

  const hasSrcSet = Boolean(thumb && full && thumb !== full);
  const src = hasSrcSet ? thumb : full || thumb;
  const srcSet = hasSrcSet ? `${thumb} 512w, ${full} 1200w` : undefined;

  return (
    <img
      ref={imgRef}
      alt={alt}
      className={`shelf-cover-img${className ? ` ${className}` : ''}`}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={300}
      height={400}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onLoad={reveal}
      onError={reveal}
    />
  );
}
