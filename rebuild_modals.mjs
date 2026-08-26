import { readFileSync, writeFileSync } from 'fs';

// Shared CSS classes
const INPUT_CLS = 'block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-2.5 px-3 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow';
const LABEL_CLS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';
const TEXTAREA_CLS = 'studio-auto-textarea block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-2.5 px-3 resize-none focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow overflow-hidden';
const SELECT_CLS = 'block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-2.5 px-3 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow';
const BTN_CANCEL = 'px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-surface-dark transition-colors';
const BTN_PRIMARY = 'px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-dark shadow-sm shadow-primary/25 transition-colors';
const BTN_EMERALD = 'px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition-colors';

// Reusable slug widget HTML (read-only display + Edit/Generate pattern)
// In "new" mode (no existing slug): just show the input directly but as a compact chip-style field
// In "edit" mode: show current slug as readonly chip, with "Edit" button; when editing, show input + "Generate" button
function slugWidget({ idDisplay, idInput, idEditBtn, idRegenBtn, idRow, prefix = '/', forNew = false }) {
  if (forNew) {
    // For new records: show the input directly (no existing slug to display)
    return `
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="${idInput}" class="${LABEL_CLS.replace(' mb-1.5','')}" style="margin-bottom:0">URL slug <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
            <button type="button" id="${idRegenBtn}" class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark px-2 py-1 rounded-lg hover:bg-primary/8 transition-colors">
              <span class="material-icons text-sm">auto_awesome</span>Generate from title
            </button>
          </div>
          <div class="relative flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-shadow">
            <span class="pl-3 text-slate-400 dark:text-slate-500 text-sm font-mono select-none shrink-0">${prefix}</span>
            <input type="text" id="${idInput}" autocomplete="off" class="flex-1 bg-transparent text-slate-900 dark:text-white text-sm py-2.5 pr-3 font-mono outline-none placeholder-slate-400" placeholder="auto-generated-from-title"/>
          </div>
        </div>`;
  }
  // Edit mode
  return `
        <div>
          <label class="${LABEL_CLS}">URL slug</label>
          <div id="${idDisplay}" class="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#15202B]/60 px-3 py-2.5">
            <span class="text-slate-400 dark:text-slate-500 text-sm font-mono shrink-0">${prefix}</span>
            <span id="${idDisplay}-val" class="flex-1 text-sm font-mono text-slate-700 dark:text-slate-200 truncate"></span>
            <button type="button" id="${idEditBtn}" class="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-primary px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span class="material-icons text-sm">edit</span>Edit
            </button>
          </div>
          <div id="${idRow}" class="hidden mt-2 space-y-1.5">
            <div class="relative flex items-center rounded-lg border border-primary/60 bg-white dark:bg-[#15202B] focus-within:ring-2 focus-within:ring-primary/40 transition-shadow">
              <span class="pl-3 text-slate-400 dark:text-slate-500 text-sm font-mono select-none shrink-0">${prefix}</span>
              <input type="text" id="${idInput}" autocomplete="off" class="flex-1 bg-transparent text-slate-900 dark:text-white text-sm py-2.5 pr-3 font-mono outline-none"/>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xs text-slate-500 dark:text-slate-400">Edit the URL-safe identifier for this page.</p>
              <button type="button" id="${idRegenBtn}" class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark px-2 py-1 rounded-lg hover:bg-primary/8 transition-colors shrink-0">
                <span class="material-icons text-sm">auto_awesome</span>Generate
              </button>
            </div>
          </div>
        </div>`;
}

const FREQ_OPTIONS = `
            <option value="monthly">Monthly</option>
            <option value="bimonthly">Bimonthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half Yearly</option>
            <option value="one_time">One Time</option>`;

// ─── NEW PUBLICATION MODAL ──────────────────────────────────────────────────
const newPubModal = `
  <!-- New publication modal -->
  <div id="new-publication-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-lg my-8 bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[18px]">library_add</span>
          </span>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">New publication</h2>
        </div>
        <button type="button" id="new-publication-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close"><span class="material-icons text-xl">close</span></button>
      </div>
      <form id="new-publication-form" class="p-6 space-y-4 overflow-y-auto">
        <div>
          <label for="new-series-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="new-series-title" required autocomplete="off" class="${INPUT_CLS}" placeholder="e.g. RSA Chronicles"/>
        </div>
        ${slugWidget({ idDisplay:'', idInput:'new-series-slug', idEditBtn:'', idRegenBtn:'new-series-slug-gen', idRow:'', prefix:'/', forNew:true })}
        <div>
          <label for="new-series-desc" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="new-series-desc" rows="2" class="${TEXTAREA_CLS}" placeholder="Short summary for the publications catalog"></textarea>
        </div>
        <div>
          <label for="new-series-frequency" class="${LABEL_CLS}">Frequency</label>
          <select id="new-series-frequency" name="frequency" required class="${SELECT_CLS}">${FREQ_OPTIONS}
          </select>
        </div>
        <div>
          <label for="new-series-cover-file" class="${LABEL_CLS}">Cover image <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <input type="file" id="new-series-cover-file" accept="image/jpeg,image/png,image/webp" class="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20 transition-colors"/>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5">JPEG, PNG, or WebP. You can add or change the cover later.</p>
        </div>
        <p id="series-form-error" class="text-sm text-red-500 dark:text-red-400 hidden rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2"></p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" id="new-publication-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="btn-new-publication-submit" class="${BTN_PRIMARY}">Create publication</button>
        </div>
      </form>
    </div>
  </div>`;

// ─── UPLOAD MODAL ──────────────────────────────────────────────────────────
const uploadModal = `
  <!-- Upload modal -->
  <div id="upload-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-lg my-8 bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[18px]">cloud_upload</span>
          </span>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Publish edition</h2>
            <p id="upload-publication-name" class="text-xs text-primary font-medium mt-0.5 truncate max-w-[18rem]">-</p>
          </div>
        </div>
        <button type="button" id="upload-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close"><span class="material-icons text-xl">close</span></button>
      </div>
      <form id="upload-form" class="p-0">
        <div id="upload-form-body" class="p-6 space-y-4 overflow-y-auto">
          <input type="hidden" id="upload-publication-slug"/>
          <div>
            <label for="upload-title" class="${LABEL_CLS}">Edition title</label>
            <input type="text" id="upload-title" required class="${INPUT_CLS}" placeholder="e.g. August 2026"/>
          </div>
          ${slugWidget({ idDisplay:'', idInput:'upload-slug', idEditBtn:'', idRegenBtn:'upload-slug-gen', idRow:'', prefix:'/', forNew:true })}
          <div>
            <label for="upload-description" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
            <textarea id="upload-description" rows="2" class="${TEXTAREA_CLS}" placeholder="One or two sentences about this edition…"></textarea>
          </div>
          <div>
            <label for="upload-issue-date" class="${LABEL_CLS}">Issue date</label>
            <input type="date" id="upload-issue-date" required class="${INPUT_CLS}"/>
          </div>
          <div>
            <label for="upload-file" class="${LABEL_CLS}">PDF file <span class="text-xs text-slate-400 font-normal">(max 65 MB)</span></label>
            <input type="file" id="upload-file" accept=".pdf" required class="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20 transition-colors"/>
          </div>
          <p id="upload-error" class="text-sm text-red-500 dark:text-red-400 hidden rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2"></p>
          <p id="upload-success" class="text-sm text-emerald-600 dark:text-emerald-400 hidden"></p>
          <div id="upload-progress-panel" class="hidden rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 px-4 py-3 flex items-center gap-3" role="status" aria-live="polite">
            <span class="studio-spinner shrink-0" aria-hidden="true"></span>
            <div class="min-w-0">
              <p id="upload-progress-title" class="text-sm font-semibold text-slate-900 dark:text-white">Publishing…</p>
              <p id="upload-progress-detail" class="text-xs text-slate-500 dark:text-text-secondary mt-0.5 leading-relaxed"></p>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="upload-cancel" class="${BTN_CANCEL}">Cancel</button>
            <button type="submit" id="upload-submit" class="${BTN_PRIMARY}">Publish</button>
          </div>
        </div>
        
        <div id="upload-success-panel" class="hidden p-6 sm:p-8 text-center space-y-5">
          <div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
            <span class="material-icons text-emerald-500 dark:text-emerald-400 text-3xl">check_circle</span>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Edition published!</h3>
            <p class="text-sm text-slate-500 dark:text-text-secondary">Your edition is now live and available to readers.</p>
          </div>
          <div class="bg-slate-50 dark:bg-[#15202B] rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 text-left">
            <img id="upload-success-cover" src="" alt="" class="w-12 h-16 object-cover rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 shrink-0"/>
            <div class="min-w-0 flex-1">
              <p id="upload-success-title" class="font-semibold text-slate-900 dark:text-white truncate text-sm"></p>
              <p id="upload-success-date" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5"></p>
              <div class="mt-2.5 flex items-center gap-1.5">
                <input type="text" id="upload-success-url" readonly class="w-full text-xs font-mono bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary/50"/>
                <button type="button" id="upload-success-copy" class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  <span class="material-icons text-sm">content_copy</span>
                </button>
              </div>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 justify-center pt-1">
            <button type="button" id="upload-success-another" class="${BTN_CANCEL}">Upload another</button>
            <a href="#" id="upload-success-view-live" target="_blank" rel="noopener noreferrer" class="${BTN_PRIMARY} inline-flex items-center gap-2">
              View live<span class="material-icons text-sm">open_in_new</span>
            </a>
            <button type="button" id="upload-success-done" class="px-5 py-2.5 text-sm font-semibold text-white bg-slate-800 dark:bg-slate-200 dark:text-slate-900 rounded-xl hover:bg-slate-700 dark:hover:bg-white transition-colors">Done</button>
          </div>
        </div>
      </form>
    </div>
  </div>`;

// ─── EDIT EDITION MODAL ────────────────────────────────────────────────────
const editEditionModal = `
  <!-- Edit edition modal -->
  <div id="edit-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-lg my-8 bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <span class="material-icons text-emerald-500 text-[18px]">edit</span>
          </span>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">Edit edition</h2>
        </div>
        <button type="button" id="edit-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close"><span class="material-icons text-xl">close</span></button>
      </div>
      <form id="edit-form" class="p-6 space-y-4 overflow-y-auto">
        <input type="hidden" id="edit-edition-id" value=""/>
        <div>
          <label for="edit-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="edit-title" required class="${INPUT_CLS}"/>
        </div>
        ${slugWidget({ idDisplay:'edit-slug-display', idInput:'edit-slug', idEditBtn:'edit-slug-edit-btn', idRegenBtn:'edit-slug-gen', idRow:'edit-slug-row', prefix:'/' })}
        <div>
          <label for="edit-description" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="edit-description" rows="2" class="${TEXTAREA_CLS}"></textarea>
        </div>
        <div>
          <label for="edit-issue-date" class="${LABEL_CLS}">Issue date</label>
          <input type="date" id="edit-issue-date" class="${INPUT_CLS}"/>
        </div>
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#15202B]/60 px-3 py-3 flex items-center justify-between gap-3">
          <p class="text-xs text-slate-500 dark:text-text-secondary leading-relaxed">Cover is auto-generated from the first PDF page.</p>
          <button type="button" id="edit-regenerate-cover" class="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-dark px-2.5 py-1.5 rounded-lg hover:bg-primary/8 transition-colors whitespace-nowrap">
            <span class="material-icons text-sm">image</span>Regenerate
          </button>
        </div>
        <p id="edit-cover-hint" class="text-xs text-amber-600 dark:text-amber-400 hidden"></p>
        <p id="edit-error" class="text-sm text-red-500 dark:text-red-400 hidden rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2"></p>
        <p id="edit-success" class="text-sm text-emerald-600 dark:text-emerald-400 hidden"></p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" id="edit-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="edit-save" class="${BTN_EMERALD}">Save changes</button>
        </div>
      </form>
    </div>
  </div>`;

// ─── EDIT SERIES MODAL ─────────────────────────────────────────────────────
const editSeriesModal = `
  <!-- Edit series modal -->
  <div id="series-edit-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-lg my-8 bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[18px]">edit</span>
          </span>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">Edit publication</h2>
        </div>
        <button type="button" id="series-edit-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close"><span class="material-icons text-xl">close</span></button>
      </div>
      <form id="series-edit-form" class="p-6 space-y-4 overflow-y-auto">
        <input type="hidden" id="series-edit-id" value=""/>
        <div>
          <label for="series-edit-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="series-edit-title" required autocomplete="off" class="${INPUT_CLS}"/>
        </div>
        ${slugWidget({ idDisplay:'series-edit-slug-display', idInput:'series-edit-slug', idEditBtn:'series-edit-slug-edit-btn', idRegenBtn:'series-edit-slug-gen', idRow:'series-edit-slug-row', prefix:'/' })}
        <div>
          <label for="series-edit-desc" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="series-edit-desc" rows="2" class="${TEXTAREA_CLS}" placeholder="Short summary for the publications catalog"></textarea>
        </div>
        <div>
          <label for="series-edit-frequency" class="${LABEL_CLS}">Frequency</label>
          <select id="series-edit-frequency" name="frequency" required class="${SELECT_CLS}">${FREQ_OPTIONS}
          </select>
        </div>
        <div>
          <label class="${LABEL_CLS}">Cover image <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f172a]/80 p-3 flex items-center justify-center min-h-[6rem] mb-2">
            <p id="series-edit-cover-empty" class="text-sm text-slate-400 dark:text-slate-500 text-center hidden">No cover yet.</p>
            <img id="series-edit-cover-preview" width="96" height="128" class="max-h-36 w-auto max-w-[7rem] rounded-lg object-cover shadow border border-slate-200 dark:border-slate-600 hidden" alt="Publication cover"/>
          </div>
          <input type="file" id="series-edit-cover-file" accept="image/jpeg,image/png,image/webp" class="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20 transition-colors"/>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5">JPEG, PNG, or WebP. Leave blank to keep current cover.</p>
        </div>
        <p id="series-edit-error" class="text-sm text-red-500 dark:text-red-400 hidden rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2"></p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" id="series-edit-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="series-edit-save" class="${BTN_PRIMARY}">Save</button>
        </div>
      </form>
    </div>
  </div>`;

const rawContent = readFileSync('lib/client/studio-body.ts', 'utf8');
// Get the actual HTML string
const htmlVal = eval(rawContent.replace('export const studioBodyHtml = ', 'var x = ') + '; x');

// Replace modals by their comment markers
let newHtml = htmlVal;

// Replace new publication modal
newHtml = newHtml.replace(
  /\s*<!-- New publication modal -->[\s\S]*?(?=\s*<!-- Upload modal -->)/,
  '\n\n' + newPubModal + '\n\n'
);

// Replace upload modal
newHtml = newHtml.replace(
  /\s*<!-- Upload modal -->[\s\S]*?(?=\s*<!-- Edit edition modal -->)/,
  '\n\n' + uploadModal + '\n\n'
);

// Replace edit edition modal
newHtml = newHtml.replace(
  /\s*<!-- Edit edition modal -->[\s\S]*?(?=\s*<!-- Edit series modal -->)/,
  '\n\n' + editEditionModal + '\n\n'
);

// Replace edit series modal
newHtml = newHtml.replace(
  /\s*<!-- Edit series modal -->[\s\S]*?(?=\s*<!-- Reader overlay -->)/,
  '\n\n' + editSeriesModal + '\n\n'
);

// Rebuild the TS file
const comment = '/* Studio shell - header aligned with public SiteNav; footer Studio→Home when on studio */\n';
const escaped = JSON.stringify(newHtml);
writeFileSync('lib/client/studio-body.ts', `${comment}export const studioBodyHtml = ${escaped};\n`, 'utf8');
console.log('Done. New HTML length:', newHtml.length);
