const fs = require('fs');
let content = fs.readFileSync('lib/client/dashboard/main.js', 'utf8');

// 1. Add imports from @/lib/urls
if (!content.includes("import { sanitizeSlug")) {
  content = content.replace(
    "import { showToast, studioConfirm } from '@/lib/client/dashboard/studio-feedback.js';",
    "import { showToast, studioConfirm } from '@/lib/client/dashboard/studio-feedback.js';\nimport { sanitizeSlug, isReservedSlug, publicationPath, editionPath } from '@/lib/urls';"
  );
}

// 2. Add new DOM elements for slug
const elsToInject = `const newSeriesSlug = document.getElementById('new-series-slug');
const newSeriesSlugPreview = document.getElementById('new-series-slug-preview');
const seriesEditSlug = document.getElementById('series-edit-slug');
const seriesEditSlugPreview = document.getElementById('series-edit-slug-preview');
const uploadSlug = document.getElementById('upload-slug');
const uploadSlugPreview = document.getElementById('upload-slug-preview');
const editSlug = document.getElementById('edit-slug');
const editSlugPreview = document.getElementById('edit-slug-preview');

const uploadFormBody = document.getElementById('upload-form-body');
const uploadSuccessPanel = document.getElementById('upload-success-panel');
const uploadSuccessCover = document.getElementById('upload-success-cover');
const uploadSuccessTitle = document.getElementById('upload-success-title');
const uploadSuccessDate = document.getElementById('upload-success-date');
const uploadSuccessUrl = document.getElementById('upload-success-url');
const uploadSuccessCopy = document.getElementById('upload-success-copy');
const uploadSuccessAnother = document.getElementById('upload-success-another');
const uploadSuccessViewLive = document.getElementById('upload-success-view-live');
const uploadSuccessDone = document.getElementById('upload-success-done');`;

if (!content.includes("const newSeriesSlug")) {
  content = content.replace(
    "const newSeriesTitle = document.getElementById('new-series-title');",
    elsToInject + "\nconst newSeriesTitle = document.getElementById('new-series-title');"
  );
}

// 3. Update createSeries logic to include slug
content = content.replace(
  `const { data, error } = await createSeries({
    publisherId: currentPublisherId,
    title,
    description,
    frequency
  });`,
  `const slug = (newSeriesSlug?.value || '').trim();
  const { data, error } = await createSeries({
    publisherId: currentPublisherId,
    title,
    description,
    frequency,
    slug: slug || null
  });`
);

// 4. Update updateSeries logic to include slug
content = content.replace(
  `const { error } = await updateSeries(sid, {
      title,
      description: description || null,
      frequency
    });`,
  `const slug = (seriesEditSlug?.value || '').trim();
    const { error } = await updateSeries(sid, {
      title,
      description: description || null,
      frequency,
      slug: slug || null
    });`
);

// 5. Update insertPublishedEdition logic to include slug
// And change the success card logic
const oldInsert = `const ins = await insertPublishedEdition({
      publisher_id: currentPublisherId,
      series_id: seriesId,
      title,
      description: description || null,
      pdf_url: up.download_url,
      cover_url: coverUrl,
      cover_thumb_url: coverThumbUrl,
      pdf_repo_path: up.path || null,
      publisher_name: pubName,
      series_title: seriesTitle,
      issue_date: issueRaw
    });
    if (ins.error) {
      uploadError.textContent = ins.error.message || 'Saved file but Firestore write failed';
      uploadError.classList.remove('hidden');
      return;
    }
    const seriesUrl = \`\${location.origin}/p/\${encodeURIComponent(seriesId)}\`;
    const editionUrl = ins.data?.id
      ? \`\${seriesUrl}/e/\${encodeURIComponent(ins.data.id)}\`
      : seriesUrl;
    uploadSuccess.textContent = '';
    const successMsg = document.createElement('span');
    successMsg.textContent = 'Published to the catalog. ';
    const viewLink = document.createElement('a');
    viewLink.href = editionUrl;
    viewLink.target = '_blank';
    viewLink.rel = 'noopener noreferrer';
    viewLink.textContent = 'View public page';
    viewLink.className = 'underline font-medium';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy link';
    copyBtn.className =
      'ml-2 text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(editionUrl);
        showToast('Public link copied.', { type: 'success' });
      } catch (_) {
        showToast('Could not copy - long-press the link to copy.', { type: 'error' });
      }
    });
    uploadSuccess.append(successMsg, viewLink, document.createTextNode(' '), copyBtn);
    uploadSuccess.classList.remove('hidden');
    showToast('Edition published to the catalog.', { type: 'success' });`;

const newInsert = `const slug = (uploadSlug?.value || '').trim();
    const ins = await insertPublishedEdition({
      publisher_id: currentPublisherId,
      series_id: seriesId,
      title,
      description: description || null,
      pdf_url: up.download_url,
      cover_url: coverUrl,
      cover_thumb_url: coverThumbUrl,
      pdf_repo_path: up.path || null,
      publisher_name: pubName,
      series_title: seriesTitle,
      issue_date: issueRaw,
      slug: slug || null
    });
    if (ins.error) {
      uploadError.textContent = ins.error.message || 'Saved file but Firestore write failed';
      uploadError.classList.remove('hidden');
      return;
    }
    
    // Show success panel
    if (uploadFormBody && uploadSuccessPanel) {
      uploadFormBody.classList.add('hidden');
      uploadSuccessPanel.classList.remove('hidden');
      
      const resolvedSeriesSlug = series?.slug || seriesId;
      const editionUrl = location.origin + editionPath(resolvedSeriesSlug, ins.data?.id ? (slug || ins.data.id) : '');
      
      if (uploadSuccessCover) {
        uploadSuccessCover.src = coverUrl || coverThumbUrl || '';
        uploadSuccessCover.classList.toggle('hidden', !coverUrl && !coverThumbUrl);
      }
      if (uploadSuccessTitle) uploadSuccessTitle.textContent = title;
      if (uploadSuccessDate) uploadSuccessDate.textContent = formatDate(issueRaw);
      if (uploadSuccessUrl) uploadSuccessUrl.value = editionUrl;
      if (uploadSuccessViewLive) uploadSuccessViewLive.href = editionUrl;
      
      if (uploadSuccessCopy) {
        uploadSuccessCopy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(editionUrl);
            showToast('Public link copied.', { type: 'success' });
          } catch (_) {
            showToast('Could not copy - long-press the link to copy.', { type: 'error' });
          }
        };
      }
    } else {
      showToast('Edition published to the catalog.', { type: 'success' });
    }`;

content = content.replace(oldInsert, newInsert);

// 6. Update updateEdition logic to include slug
content = content.replace(
  `const { error } = await updateEdition(edId, {
      title,
      description: description || null,
      series_id: sid,
      series_title: seriesTitle,
      issue_date: issueRaw
    });`,
  `const slug = (editSlug?.value || '').trim();
    const { error } = await updateEdition(edId, {
      title,
      description: description || null,
      series_id: sid,
      series_title: seriesTitle,
      issue_date: issueRaw,
      slug: slug || null
    });`
);

// 7. Add auto-generate and live preview logic for slugs
const scriptAdditions = `
// Slug preview and auto-gen logic
function updateSlugPreview(inputEl, previewEl, isSeries, seriesContextId) {
  if (!inputEl || !previewEl) return;
  const raw = inputEl.value.trim();
  const titleVal = isSeries ? 
    (inputEl === newSeriesSlug ? newSeriesTitle?.value : seriesEditTitle?.value) :
    (inputEl === uploadSlug ? uploadTitle?.value : editTitle?.value);
    
  let slug = raw;
  if (!slug && titleVal) {
    slug = sanitizeSlug(titleVal);
  } else if (slug) {
    slug = sanitizeSlug(slug);
  }
  
  if (slug && isReservedSlug(slug)) {
    previewEl.textContent = 'This slug is reserved and cannot be used.';
    previewEl.classList.remove('text-slate-500', 'dark:text-slate-400');
    previewEl.classList.add('text-red-500', 'dark:text-red-400');
    return;
  }
  
  previewEl.classList.add('text-slate-500', 'dark:text-slate-400');
  previewEl.classList.remove('text-red-500', 'dark:text-red-400');
  
  if (!slug) {
    previewEl.textContent = '';
    return;
  }
  
  if (isSeries) {
    previewEl.textContent = 'Live URL will be: hub.rsamdio.org' + publicationPath(slug);
  } else {
    // Edition
    const s = seriesItems.find(s => s.id === seriesContextId);
    const seriesSlug = s?.slug || seriesContextId || '{series}';
    previewEl.textContent = 'Live URL will be: hub.rsamdio.org' + editionPath(seriesSlug, slug);
  }
}

newSeriesTitle?.addEventListener('input', () => updateSlugPreview(newSeriesSlug, newSeriesSlugPreview, true));
newSeriesSlug?.addEventListener('input', () => updateSlugPreview(newSeriesSlug, newSeriesSlugPreview, true));

seriesEditTitle?.addEventListener('input', () => updateSlugPreview(seriesEditSlug, seriesEditSlugPreview, true));
seriesEditSlug?.addEventListener('input', () => updateSlugPreview(seriesEditSlug, seriesEditSlugPreview, true));

uploadTitle?.addEventListener('input', () => updateSlugPreview(uploadSlug, uploadSlugPreview, false, selectSeriesUpload?.value));
uploadSlug?.addEventListener('input', () => updateSlugPreview(uploadSlug, uploadSlugPreview, false, selectSeriesUpload?.value));
selectSeriesUpload?.addEventListener('change', () => updateSlugPreview(uploadSlug, uploadSlugPreview, false, selectSeriesUpload?.value));

editTitle?.addEventListener('input', () => updateSlugPreview(editSlug, editSlugPreview, false, editSeries?.value));
editSlug?.addEventListener('input', () => updateSlugPreview(editSlug, editSlugPreview, false, editSeries?.value));
editSeries?.addEventListener('change', () => updateSlugPreview(editSlug, editSlugPreview, false, editSeries?.value));

uploadSuccessAnother?.addEventListener('click', () => {
  uploadFormBody?.classList.remove('hidden');
  uploadSuccessPanel?.classList.add('hidden');
  uploadForm?.reset();
  if (selectSeriesUpload && selectedContentSeriesId) {
    selectSeriesUpload.value = selectedContentSeriesId;
  }
  updateSlugPreview(uploadSlug, uploadSlugPreview, false, selectSeriesUpload?.value);
});

uploadSuccessDone?.addEventListener('click', () => {
  uploadClose?.click();
});
`;

if (!content.includes("function updateSlugPreview")) {
  content += scriptAdditions;
}

// Ensure the modals bind the values on open:
content = content.replace(
  `seriesEditId.value = seriesId;
    seriesEditTitle.value = series.title || '';`,
  `seriesEditId.value = seriesId;
    seriesEditTitle.value = series.title || '';
    if (seriesEditSlug) seriesEditSlug.value = series.slug || '';
    updateSlugPreview(seriesEditSlug, seriesEditSlugPreview, true);`
);

content = content.replace(
  `editTitle.value = ed.title || '';
    editDescription.value = ed.description || '';`,
  `editTitle.value = ed.title || '';
    editDescription.value = ed.description || '';
    if (editSlug) editSlug.value = ed.slug || '';
    updateSlugPreview(editSlug, editSlugPreview, false, ed.series_id);`
);

content = content.replace(
  `function openNewPublicationModal() {
  newPublicationForm?.reset();`,
  `function openNewPublicationModal() {
  newPublicationForm?.reset();
  if (newSeriesSlugPreview) newSeriesSlugPreview.textContent = '';`
);

content = content.replace(
  `function openUploadModal() {
  uploadForm?.reset();`,
  `function openUploadModal() {
  uploadForm?.reset();
  if (uploadFormBody) uploadFormBody.classList.remove('hidden');
  if (uploadSuccessPanel) uploadSuccessPanel.classList.add('hidden');
  if (uploadSlugPreview) uploadSlugPreview.textContent = '';`
);

fs.writeFileSync('lib/client/dashboard/main.js', content, 'utf8');
console.log('Patched main.js successfully');
