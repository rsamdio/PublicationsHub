import { readFileSync, writeFileSync } from 'fs';

// Tighter CSS classes
const INPUT_CLS = 'block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-1.5 px-2.5 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow';
const LABEL_CLS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
const TEXTAREA_CLS = 'studio-auto-textarea block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-1.5 px-2.5 resize-none focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow overflow-hidden min-h-[2.5rem]';
const SELECT_CLS = 'block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] text-slate-900 dark:text-white text-sm py-1.5 px-2.5 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-shadow';
const BTN_CANCEL = 'px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-surface-dark transition-colors';
const BTN_PRIMARY = 'px-4 py-1.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-dark shadow-sm shadow-primary/25 transition-colors';
const BTN_EMERALD = 'px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors';

function slugWidget({ idDisplay, idInput, idEditBtn, idRegenBtn, idRow, prefix = '/', forNew = false }) {
  if (forNew) {
    return `
        <div>
          <label for="${idInput}" class="${LABEL_CLS}">URL slug <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <div class="relative flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15202B] focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-shadow">
            <span class="pl-2.5 text-slate-400 dark:text-slate-500 text-sm font-mono select-none shrink-0">${prefix}</span>
            <input type="text" id="${idInput}" autocomplete="off" class="flex-1 bg-transparent text-slate-900 dark:text-white text-sm py-1.5 pr-2 font-mono outline-none placeholder-slate-400" placeholder="auto-generated-from-title"/>
            <button type="button" id="${idRegenBtn}" class="shrink-0 mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-dark px-1.5 py-1 rounded hover:bg-primary/10 transition-colors">
              <span class="material-icons text-[14px]">auto_awesome</span>Generate
            </button>
          </div>
        </div>`;
  }
  return `
        <div>
          <label class="${LABEL_CLS}">URL slug</label>
          <div id="${idDisplay}" class="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#15202B]/60 px-2.5 py-1.5">
            <span class="text-slate-400 dark:text-slate-500 text-sm font-mono shrink-0">${prefix}</span>
            <span id="${idDisplay}-val" class="flex-1 text-sm font-mono text-slate-700 dark:text-slate-200 truncate"></span>
            <button type="button" id="${idEditBtn}" class="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-primary px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span class="material-icons text-[14px]">edit</span>Edit
            </button>
          </div>
          <div id="${idRow}" class="hidden mt-1.5">
            <div class="relative flex items-center rounded-lg border border-primary/60 bg-white dark:bg-[#15202B] focus-within:ring-2 focus-within:ring-primary/40 transition-shadow">
              <span class="pl-2.5 text-slate-400 dark:text-slate-500 text-sm font-mono select-none shrink-0">${prefix}</span>
              <input type="text" id="${idInput}" autocomplete="off" class="flex-1 bg-transparent text-slate-900 dark:text-white text-sm py-1.5 pr-2 font-mono outline-none"/>
              <button type="button" id="${idRegenBtn}" class="shrink-0 mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-dark px-1.5 py-1 rounded hover:bg-primary/10 transition-colors">
                <span class="material-icons text-[14px]">auto_awesome</span>Generate
              </button>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Edit the URL-safe identifier for this page.</p>
          </div>
        </div>`;
}

const customSelectWidget = (id) => `
    <div class="relative custom-select" id="${id}-wrapper">
      <input type="hidden" id="${id}" name="frequency" value="monthly" />
      <button type="button" class="flex items-center justify-between ${SELECT_CLS} text-left" id="${id}-btn" aria-haspopup="listbox" aria-expanded="false">
        <span id="${id}-label" class="block truncate">Monthly</span>
        <span class="material-icons text-slate-400 text-[16px] pointer-events-none shrink-0">expand_more</span>
      </button>
      <ul id="${id}-list" class="absolute z-[70] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202B] py-1 text-sm shadow-xl focus:outline-none hidden" tabindex="-1" role="listbox">
        <li class="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800" role="option" data-value="monthly">
          <span class="block truncate font-medium">Monthly</span>
          <span class="absolute inset-y-0 right-0 flex items-center pr-3 text-primary hidden checkmark"><span class="material-icons text-[16px]">check</span></span>
        </li>
        <li class="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800" role="option" data-value="bimonthly">
          <span class="block truncate font-normal">Bimonthly</span>
          <span class="absolute inset-y-0 right-0 flex items-center pr-3 text-primary hidden checkmark"><span class="material-icons text-[16px]">check</span></span>
        </li>
        <li class="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800" role="option" data-value="quarterly">
          <span class="block truncate font-normal">Quarterly</span>
          <span class="absolute inset-y-0 right-0 flex items-center pr-3 text-primary hidden checkmark"><span class="material-icons text-[16px]">check</span></span>
        </li>
        <li class="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800" role="option" data-value="half_yearly">
          <span class="block truncate font-normal">Half Yearly</span>
          <span class="absolute inset-y-0 right-0 flex items-center pr-3 text-primary hidden checkmark"><span class="material-icons text-[16px]">check</span></span>
        </li>
        <li class="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800" role="option" data-value="one_time">
          <span class="block truncate font-normal">One Time</span>
          <span class="absolute inset-y-0 right-0 flex items-center pr-3 text-primary hidden checkmark"><span class="material-icons text-[16px]">check</span></span>
        </li>
      </ul>
    </div>`;

// Cover side-by-side layout widget
const coverWidget = (idPreview, idFile, idEmpty, allowClear = false) => `
          <label class="${LABEL_CLS}">Cover image <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <div class="flex items-start gap-4">
            <div class="shrink-0 w-16 h-20 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f172a]/80 flex items-center justify-center overflow-hidden">
              <p id="${idEmpty}" class="text-[10px] text-slate-400 dark:text-slate-500 text-center px-1 ${allowClear ? 'hidden' : ''}">No cover</p>
              <img id="${idPreview}" class="w-full h-full object-cover ${allowClear ? '' : 'hidden'}" alt=""/>
            </div>
            <div class="flex-1">
              <input type="file" id="${idFile}" accept="image/jpeg,image/png,image/webp" class="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20 transition-colors"/>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">JPEG, PNG, or WebP. ${allowClear ? 'Leave blank to keep current cover.' : 'You can add or change the cover later.'}</p>
            </div>
          </div>`;

const newPubModal = `
  <!-- New publication modal -->
  <div id="new-publication-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-[28rem] bg-white dark:bg-card-dark rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full">
      <div class="flex justify-between items-center px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[16px]">library_add</span>
          </span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">New publication</h2>
        </div>
        <button type="button" id="new-publication-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><span class="material-icons text-lg">close</span></button>
      </div>
      <form id="new-publication-form" class="p-5 space-y-3 overflow-y-auto">
        <div>
          <label for="new-series-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="new-series-title" required autocomplete="off" class="${INPUT_CLS}" placeholder="e.g. RSA Chronicles"/>
        </div>
        ${slugWidget({ idDisplay:'', idInput:'new-series-slug', idEditBtn:'', idRegenBtn:'new-series-slug-gen', idRow:'', prefix:'/', forNew:true })}
        <div>
          <label for="new-series-desc" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="new-series-desc" rows="1" class="${TEXTAREA_CLS}" placeholder="Short summary"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="new-series-frequency" class="${LABEL_CLS}">Frequency</label>
            ${customSelectWidget('new-series-frequency')}
          </div>
          <div>
            <!-- spacing for grid layout -->
          </div>
        </div>
        <div>
          <label for="new-series-cover-file" class="${LABEL_CLS}">Cover image <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <input type="file" id="new-series-cover-file" accept="image/jpeg,image/png,image/webp" class="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20"/>
        </div>
        <p id="series-form-error" class="text-[13px] text-red-500 dark:text-red-400 hidden bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded"></p>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" id="new-publication-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="btn-new-publication-submit" class="${BTN_PRIMARY}">Create publication</button>
        </div>
      </form>
    </div>
  </div>`;

const uploadModal = `
  <!-- Upload modal -->
  <div id="upload-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-xl bg-white dark:bg-card-dark rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full">
      <div class="flex justify-between items-center px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[16px]">cloud_upload</span>
          </span>
          <div>
            <h2 class="text-sm font-bold text-slate-900 dark:text-white">Publish edition</h2>
            <p id="upload-publication-name" class="text-[11px] text-primary font-medium truncate max-w-[15rem]">-</p>
          </div>
        </div>
        <button type="button" id="upload-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><span class="material-icons text-lg">close</span></button>
      </div>
      <form id="upload-form" class="p-0">
        <div id="upload-form-body" class="p-5 space-y-3 overflow-y-auto">
          <input type="hidden" id="upload-publication-slug"/>
          <div>
            <label for="upload-title" class="${LABEL_CLS}">Edition title</label>
            <input type="text" id="upload-title" required class="${INPUT_CLS}" placeholder="e.g. August 2026"/>
          </div>
          ${slugWidget({ idDisplay:'', idInput:'upload-slug', idEditBtn:'', idRegenBtn:'upload-slug-gen', idRow:'', prefix:'/', forNew:true })}
          <div>
            <label for="upload-description" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
            <textarea id="upload-description" rows="1" class="${TEXTAREA_CLS}" placeholder="Brief summary..."></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="upload-issue-date" class="${LABEL_CLS}">Issue date</label>
              <input type="date" id="upload-issue-date" required class="${INPUT_CLS}"/>
            </div>
          </div>
          <div>
            <label for="upload-file" class="${LABEL_CLS}">PDF file <span class="text-[11px] text-slate-400 font-normal">(max 65 MB)</span></label>
            <input type="file" id="upload-file" accept=".pdf" required class="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20"/>
          </div>
          <p id="upload-error" class="text-[13px] text-red-500 dark:text-red-400 hidden bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded"></p>
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" id="upload-cancel" class="${BTN_CANCEL}">Cancel</button>
            <button type="submit" id="upload-submit" class="${BTN_PRIMARY}">Publish</button>
          </div>
        </div>
        
        <div id="upload-success-panel" class="hidden p-6 text-center space-y-4">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
            <span class="material-icons text-emerald-500 dark:text-emerald-400 text-2xl">check_circle</span>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Edition published!</h3>
          </div>
          <div class="bg-slate-50 dark:bg-[#15202B] rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3 text-left">
            <img id="upload-success-cover" src="" alt="" class="w-10 h-14 object-cover rounded shadow-sm border border-slate-200 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 shrink-0"/>
            <div class="min-w-0 flex-1">
              <p id="upload-success-title" class="font-semibold text-slate-900 dark:text-white truncate text-sm"></p>
              <div class="mt-1.5 flex items-center gap-1">
                <input type="text" id="upload-success-url" readonly class="w-full text-[11px] font-mono bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-600 dark:text-slate-400 focus:outline-none"/>
                <button type="button" id="upload-success-copy" class="shrink-0 p-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <span class="material-icons text-[14px]">content_copy</span>
                </button>
              </div>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 justify-center pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" id="upload-success-another" class="${BTN_CANCEL}">Upload another</button>
            <button type="button" id="upload-success-done" class="${BTN_PRIMARY}">Done</button>
          </div>
        </div>
      </form>
    </div>
  </div>`;

const editEditionModal = `
  <!-- Edit edition modal -->
  <div id="edit-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-xl bg-white dark:bg-card-dark rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full">
      <div class="flex justify-between items-center px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="w-7 h-7 rounded bg-emerald-500/10 flex items-center justify-center">
            <span class="material-icons text-emerald-500 text-[16px]">edit</span>
          </span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Edit edition</h2>
        </div>
        <button type="button" id="edit-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><span class="material-icons text-lg">close</span></button>
      </div>
      <form id="edit-form" class="p-5 space-y-3 overflow-y-auto">
        <input type="hidden" id="edit-edition-id" value=""/>
        <div>
          <label for="edit-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="edit-title" required class="${INPUT_CLS}"/>
        </div>
        ${slugWidget({ idDisplay:'edit-slug-display', idInput:'edit-slug', idEditBtn:'edit-slug-edit-btn', idRegenBtn:'edit-slug-gen', idRow:'edit-slug-row', prefix:'/' })}
        <div>
          <label for="edit-description" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="edit-description" rows="1" class="${TEXTAREA_CLS}"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="edit-issue-date" class="${LABEL_CLS}">Issue date</label>
            <input type="date" id="edit-issue-date" class="${INPUT_CLS}"/>
          </div>
        </div>
        <div class="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#15202B]/60 px-3 py-2 flex items-center justify-between gap-3">
          <p class="text-[11px] text-slate-500 dark:text-text-secondary leading-relaxed">Cover is auto-generated from the first PDF page.</p>
          <button type="button" id="edit-regenerate-cover" class="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-dark px-2 py-1 rounded hover:bg-primary/10 transition-colors whitespace-nowrap">
            <span class="material-icons text-[14px]">image</span>Regen Cover
          </button>
        </div>
        <p id="edit-cover-hint" class="text-xs text-amber-600 dark:text-amber-400 hidden"></p>
        <p id="edit-error" class="text-[13px] text-red-500 dark:text-red-400 hidden bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded"></p>
        <p id="edit-success" class="text-[13px] text-emerald-600 dark:text-emerald-400 hidden"></p>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" id="edit-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="edit-save" class="${BTN_EMERALD}">Save changes</button>
        </div>
      </form>
    </div>
  </div>`;

const editSeriesModal = `
  <!-- Edit series modal -->
  <div id="series-edit-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
    <div class="w-full max-w-[28rem] bg-white dark:bg-card-dark rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full">
      <div class="flex justify-between items-center px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
            <span class="material-icons text-primary text-[16px]">edit</span>
          </span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Edit publication</h2>
        </div>
        <button type="button" id="series-edit-close" class="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><span class="material-icons text-lg">close</span></button>
      </div>
      <form id="series-edit-form" class="p-5 space-y-3 overflow-y-auto">
        <input type="hidden" id="series-edit-id" value=""/>
        <div>
          <label for="series-edit-title" class="${LABEL_CLS}">Title</label>
          <input type="text" id="series-edit-title" required autocomplete="off" class="${INPUT_CLS}"/>
        </div>
        ${slugWidget({ idDisplay:'series-edit-slug-display', idInput:'series-edit-slug', idEditBtn:'series-edit-slug-edit-btn', idRegenBtn:'series-edit-slug-gen', idRow:'series-edit-slug-row', prefix:'/' })}
        <div>
          <label for="series-edit-desc" class="${LABEL_CLS}">Description <span class="text-xs text-slate-400 font-normal">(optional)</span></label>
          <textarea id="series-edit-desc" rows="1" class="${TEXTAREA_CLS}"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="series-edit-frequency" class="${LABEL_CLS}">Frequency</label>
            ${customSelectWidget('series-edit-frequency')}
          </div>
        </div>
        <div>
          ${coverWidget('series-edit-cover-preview', 'series-edit-cover-file', 'series-edit-cover-empty', true)}
        </div>
        <p id="series-edit-error" class="text-[13px] text-red-500 dark:text-red-400 hidden bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded"></p>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" id="series-edit-cancel" class="${BTN_CANCEL}">Cancel</button>
          <button type="submit" id="series-edit-save" class="${BTN_PRIMARY}">Save</button>
        </div>
      </form>
    </div>
  </div>`;

let rawContent = readFileSync('lib/client/studio-body.ts', 'utf8');
const htmlVal = eval(rawContent.replace('export const studioBodyHtml = ', 'var x = ') + '; x');
let newHtml = htmlVal;

newHtml = newHtml.replace(/\s*<!-- New publication modal -->[\s\S]*?(?=\s*<!-- Upload modal -->)/, '\n\n' + newPubModal + '\n\n');
newHtml = newHtml.replace(/\s*<!-- Upload modal -->[\s\S]*?(?=\s*<!-- Edit edition modal -->)/, '\n\n' + uploadModal + '\n\n');
newHtml = newHtml.replace(/\s*<!-- Edit edition modal -->[\s\S]*?(?=\s*<!-- Edit series modal -->)/, '\n\n' + editEditionModal + '\n\n');
newHtml = newHtml.replace(/\s*<!-- Edit series modal -->[\s\S]*?(?=\s*<!-- Reader overlay -->)/, '\n\n' + editSeriesModal + '\n\n');

const comment = '/* Studio shell - header aligned with public SiteNav; footer Studio→Home when on studio */\n';
writeFileSync('lib/client/studio-body.ts', `${comment}export const studioBodyHtml = ${JSON.stringify(newHtml)};\n`, 'utf8');
console.log('Compacted modals. New HTML length:', newHtml.length);
