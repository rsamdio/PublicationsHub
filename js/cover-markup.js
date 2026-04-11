/**
 * Shared cover `<img>` markup for grids (thumb `src` + optional `srcset` to full).
 */

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

/**
 * @param {string} fullUrl
 * @param {string} thumbUrl
 * @param {string} sizes
 * @param {string} className — extra classes (leading space added)
 * @param {'lazy' | 'eager'} loading
 * @param {'high' | null} fetchpriority
 */
export function buildCoverImgHtml(fullUrl, thumbUrl, sizes, className, loading, fetchpriority) {
  const full = fullUrl ? String(fullUrl).trim() : '';
  const thumb = thumbUrl ? String(thumbUrl).trim() : '';
  if (!full && !thumb) return '';
  const cls = className ? ` ${className}` : '';
  const loadAttr = loading ? ` loading="${loading}"` : '';
  const fetchAttr = fetchpriority ? ` fetchpriority="${fetchpriority}"` : '';
  const escFull = escapeHtml(full);
  const escThumb = escapeHtml(thumb);
  if (escThumb && escFull && escThumb !== escFull) {
    const srcset = `${escThumb} 512w, ${escFull} 1200w`;
    return `<img alt="" class="shelf-cover-img${cls}" src="${escThumb}" srcset="${srcset}" sizes="${sizes}" width="300" height="400"${loadAttr} decoding="async"${fetchAttr}/>`;
  }
  return `<img alt="" class="shelf-cover-img${cls}" src="${escFull || escThumb}" width="300" height="400" sizes="${sizes}"${loadAttr} decoding="async"${fetchAttr}/>`;
}

/** Fade in `.shelf-cover-img` after load (see `index.html` / `publication.html` styles). */
export function wireCoverImgReveal(root) {
  if (!root) return;
  root.querySelectorAll('img.shelf-cover-img').forEach((img) => {
    const reveal = () => {
      img.classList.add('shelf-cover-img--loaded');
    };
    if (img.complete && img.naturalWidth > 0) {
      requestAnimationFrame(reveal);
      return;
    }
    img.addEventListener('load', reveal, { once: true });
    img.addEventListener('error', reveal, { once: true });
  });
}
