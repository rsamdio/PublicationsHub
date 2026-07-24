import { pubIcon } from './icons-public.js';

/** Replace `[data-pub-icon]` placeholders with inline SVGs within `root` (or document). */
export function hydratePubIcons(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('[data-pub-icon]').forEach((el) => {
    const name = el.getAttribute('data-pub-icon');
    if (!name) return;
    const cls = el.getAttribute('class') || '';
    el.outerHTML = pubIcon(name, cls);
  });
}
