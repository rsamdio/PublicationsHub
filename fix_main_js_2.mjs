import fs from 'fs';

let content = fs.readFileSync('lib/client/dashboard/main.js', 'utf8');

// 1. Remove fillEditSeriesSelect and its call
content = content.replace(
  /function fillEditSeriesSelect\(selectedSeriesId\) \{[\s\S]*?\}\n/,
  ''
);
content = content.replace(
  /fillEditSeriesSelect\(ed\.series_id\);\n/,
  ''
);

// 2. Append the slug generation logic at the bottom if it doesn't exist
if (!content.includes('attachSlugEditToggle')) {
  content += `\n
/** Live URL slug generation and UI */
function attachSlugGenerator(inputEl, genBtnEl, titleEl) {
  if (!genBtnEl || !inputEl || !titleEl) return;
  genBtnEl.addEventListener('click', () => {
    const titleVal = titleEl.value.trim();
    if (titleVal) {
      inputEl.value = sanitizeSlug(titleVal);
    }
  });
}

function attachSlugEditToggle(editBtnEl, displayEl, rowEl) {
  if (!editBtnEl || !displayEl || !rowEl) return;
  editBtnEl.addEventListener('click', () => {
    displayEl.classList.add('hidden');
    rowEl.classList.remove('hidden');
  });
}

function attachAutoTextarea(selector) {
  document.querySelectorAll(selector).forEach(el => {
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight) + 'px';
    };
    el.addEventListener('input', resize);
    // Observe when modal opens to resize
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) resize();
    });
    observer.observe(el);
  });
}

attachSlugGenerator(newSeriesSlug, document.getElementById('new-series-slug-gen'), newSeriesTitle);
attachSlugGenerator(uploadSlug, document.getElementById('upload-slug-gen'), uploadTitle);
attachSlugGenerator(editSlug, document.getElementById('edit-slug-gen'), editTitle);
attachSlugGenerator(seriesEditSlug, document.getElementById('series-edit-slug-gen'), document.getElementById('series-edit-title'));

attachSlugEditToggle(
  document.getElementById('edit-slug-edit-btn'), 
  document.getElementById('edit-slug-display'), 
  document.getElementById('edit-slug-row')
);
attachSlugEditToggle(
  document.getElementById('series-edit-slug-edit-btn'), 
  document.getElementById('series-edit-slug-display'), 
  document.getElementById('series-edit-slug-row')
);
attachAutoTextarea('.studio-auto-textarea');
`;
}

fs.writeFileSync('lib/client/dashboard/main.js', content, 'utf8');
console.log('Fixed main.js logic.');
