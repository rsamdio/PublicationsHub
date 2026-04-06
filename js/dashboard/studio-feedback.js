/**
 * Toasts and confirm dialog for Publisher Studio (replaces window.alert / confirm).
 */

/** @type {((v: boolean) => void) | null} */
let confirmResolver = null;

function getToastRoot() {
  return document.getElementById('studio-toast-root');
}

function getConfirmEls() {
  return {
    overlay: document.getElementById('studio-confirm-dialog'),
    titleEl: document.getElementById('studio-confirm-title'),
    messageEl: document.getElementById('studio-confirm-message'),
    cancel: document.getElementById('studio-confirm-cancel'),
    confirm: document.getElementById('studio-confirm-confirm')
  };
}

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error' | 'info', duration?: number }} [options]
 */
export function showToast(message, options = {}) {
  const root = getToastRoot();
  if (!root || !message) return;
  const type = options.type || 'info';
  const duration = options.duration ?? (type === 'error' ? 7000 : 4500);

  const el = document.createElement('div');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.className = [
    'pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-opacity duration-200',
    'whitespace-pre-line',
    type === 'success'
      ? 'bg-emerald-950/90 border-emerald-600/40 text-emerald-100'
      : type === 'error'
        ? 'bg-red-950/90 border-red-600/40 text-red-100'
        : 'bg-slate-900/95 border-slate-600/50 text-slate-100 dark:bg-black/90 dark:border-slate-700'
  ].join(' ');
  el.textContent = message;
  root.appendChild(el);

  const remove = () => {
    el.classList.add('opacity-0');
    setTimeout(() => el.remove(), 200);
  };
  const t = window.setTimeout(remove, duration);
  el.addEventListener('click', () => {
    window.clearTimeout(t);
    remove();
  });
  el.title = 'Dismiss';
  el.classList.add('cursor-pointer');
}

function closeConfirm(value) {
  const { overlay, confirm: okBtn, cancel: cancelBtn } = getConfirmEls();
  document.removeEventListener('keydown', onConfirmKeydown);
  overlay?.removeEventListener('click', onConfirmBackdrop);
  cancelBtn?.removeEventListener('click', onConfirmCancel);
  okBtn?.removeEventListener('click', onConfirmOk);
  overlay?.classList.add('hidden');
  overlay?.classList.remove('flex');
  if (confirmResolver) {
    const r = confirmResolver;
    confirmResolver = null;
    r(value);
  }
}

function onConfirmKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeConfirm(false);
  }
}

function onConfirmBackdrop(e) {
  if (e.target === e.currentTarget) closeConfirm(false);
}

function onConfirmCancel() {
  closeConfirm(false);
}

function onConfirmOk() {
  closeConfirm(true);
}

/**
 * @param {{
 *   title: string,
 *   message: string,
 *   confirmText?: string,
 *   cancelText?: string,
 *   danger?: boolean
 * }} opts
 * @returns {Promise<boolean>}
 */
export function studioConfirm(opts) {
  const { overlay, titleEl, messageEl, cancel, confirm: okBtn } = getConfirmEls();
  if (!overlay || !titleEl || !messageEl || !cancel || !okBtn) {
    return Promise.resolve(window.confirm(`${opts.title}\n\n${opts.message}`));
  }
  if (confirmResolver) return Promise.resolve(false);

  titleEl.textContent = opts.title;
  messageEl.textContent = opts.message;
  cancel.textContent = opts.cancelText || 'Cancel';
  okBtn.textContent = opts.confirmText || 'Confirm';

  okBtn.className = [
    'px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-colors',
    opts.danger
      ? 'bg-red-600 hover:bg-red-700 shadow-red-900/20'
      : 'bg-primary hover:bg-primary-dark shadow-primary/20'
  ].join(' ');

  return new Promise((resolve) => {
    confirmResolver = resolve;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.addEventListener('keydown', onConfirmKeydown);
    overlay.addEventListener('click', onConfirmBackdrop);
    cancel.addEventListener('click', onConfirmCancel);
    okBtn.addEventListener('click', onConfirmOk);
    const focusEl = opts.danger ? cancel : okBtn;
    window.requestAnimationFrame(() => focusEl?.focus());
  });
}
