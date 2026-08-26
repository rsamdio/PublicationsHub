import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('lib/client/dashboard/main.js', 'utf8');

// 1. Add new DOM elements for slug generation and remove preview elements
content = content.replace(
  /const newSeriesSlug = document\.getElementById\('new-series-slug'\);\nconst newSeriesSlugPreview = document\.getElementById\('new-series-slug-preview'\);\nconst seriesEditSlug = document\.getElementById\('series-edit-slug'\);\nconst seriesEditSlugPreview = document\.getElementById\('series-edit-slug-preview'\);\nconst uploadSlug = document\.getElementById\('upload-slug'\);\nconst uploadSlugPreview = document\.getElementById\('upload-slug-preview'\);\nconst editSlug = document\.getElementById\('edit-slug'\);\nconst editSlugPreview = document\.getElementById\('edit-slug-preview'\);/,
  `const newSeriesSlug = document.getElementById('new-series-slug');
const newSeriesSlugGen = document.getElementById('new-series-slug-gen');
const seriesEditSlug = document.getElementById('series-edit-slug');
const seriesEditSlugGen = document.getElementById('series-edit-slug-gen');
const seriesEditSlugDisplay = document.getElementById('series-edit-slug-display');
const seriesEditSlugDisplayVal = document.getElementById('series-edit-slug-display-val');
const seriesEditSlugEditBtn = document.getElementById('series-edit-slug-edit-btn');
const seriesEditSlugRow = document.getElementById('series-edit-slug-row');
const uploadSlug = document.getElementById('upload-slug');
const uploadSlugGen = document.getElementById('upload-slug-gen');
const editSlug = document.getElementById('edit-slug');
const editSlugGen = document.getElementById('edit-slug-gen');
const editSlugDisplay = document.getElementById('edit-slug-display');
const editSlugDisplayVal = document.getElementById('edit-slug-display-val');
const editSlugEditBtn = document.getElementById('edit-slug-edit-btn');
const editSlugRow = document.getElementById('edit-slug-row');`
);

// 2. Remove editSeries select completely
content = content.replace(
  /const editSeries = document\.getElementById\('edit-series'\);\n/,
  ''
);

// Remove populateEditSeriesDropdown function entirely
content = content.replace(
  /function populateEditSeriesDropdown\(selectedSeriesId\) \{[\s\S]*?editSeries\.value = seriesItems\[0\]\.id;\n  \}\n\}\n/,
  ''
);

// 3. Remove populateEditSeriesDropdown call from openEditEditionModal
content = content.replace(
  /populateEditSeriesDropdown\(edition\.seriesId\);\n\s*/,
  ''
);

// Remove seriesId logic from save edited edition (we just keep the current seriesId)
content = content.replace(
  /const seriesId = editSeries\?\.value;\n\s*if \(\!seriesId\) \{\n\s*editError\.textContent = 'Please select a series\.';\n\s*editError\.classList\.remove\('hidden'\);\n\s*setSubmitBusy\(editSave, false\);\n\s*return;\n\s*\}/,
  'const seriesId = editingEdition?.seriesId || "";'
);

// 4. Update the slug generation logic and UI toggling
content = content.replace(
  /\/\*\* Live URL preview logic \*\*\/[\s\S]*?editSeries\?\.addEventListener\('change', \(\) => updateSlugPreview\(editSlug, editSlugPreview, false, editSeries\?\.value\)\);/,
  `/** Live URL slug generation and UI */
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

attachSlugGenerator(newSeriesSlug, newSeriesSlugGen, newSeriesTitle);
attachSlugGenerator(uploadSlug, uploadSlugGen, uploadTitle);
attachSlugGenerator(editSlug, editSlugGen, editTitle);
attachSlugGenerator(seriesEditSlug, seriesEditSlugGen, seriesEditTitle);

attachSlugEditToggle(editSlugEditBtn, editSlugDisplay, editSlugRow);
attachSlugEditToggle(seriesEditSlugEditBtn, seriesEditSlugDisplay, seriesEditSlugRow);
attachAutoTextarea('.studio-auto-textarea');
`
);

// 5. Update openEditEditionModal to populate the display slug and reset toggle
content = content.replace(
  /editSlug\.value = edition\.slug \|\| '';\n\s*updateSlugPreview\(editSlug, editSlugPreview, false, edition\.seriesId\);/,
  `editSlug.value = edition.slug || '';
    if (editSlugDisplayVal) editSlugDisplayVal.textContent = edition.slug || '';
    if (editSlugDisplay) editSlugDisplay.classList.remove('hidden');
    if (editSlugRow) editSlugRow.classList.add('hidden');`
);

// 6. Update openEditSeriesModal to populate the display slug and reset toggle
content = content.replace(
  /seriesEditSlug\.value = series\.slug \|\| '';\n\s*updateSlugPreview\(seriesEditSlug, seriesEditSlugPreview, true\);/,
  `seriesEditSlug.value = series.slug || '';
    if (seriesEditSlugDisplayVal) seriesEditSlugDisplayVal.textContent = series.slug || '';
    if (seriesEditSlugDisplay) seriesEditSlugDisplay.classList.remove('hidden');
    if (seriesEditSlugRow) seriesEditSlugRow.classList.add('hidden');`
);

// 7. Remove uploadSlugPreview update
content = content.replace(
  /updateSlugPreview\(uploadSlug, uploadSlugPreview, false, seriesId\);/,
  ''
);

// 8. Remove newSeriesSlugPreview update
content = content.replace(
  /updateSlugPreview\(newSeriesSlug, newSeriesSlugPreview, true\);/,
  ''
);


writeFileSync('lib/client/dashboard/main.js', content, 'utf8');
console.log('Finished updating main.js');
