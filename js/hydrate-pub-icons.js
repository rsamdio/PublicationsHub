import { pubIcon } from './icons-public.js';

function run() {
  document.querySelectorAll('[data-pub-icon]').forEach((el) => {
    const name = el.getAttribute('data-pub-icon');
    if (!name) return;
    const cls = el.getAttribute('class') || '';
    el.outerHTML = pubIcon(name, cls);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
} else {
  run();
}
