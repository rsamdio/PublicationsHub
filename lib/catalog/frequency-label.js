/**
 * Series `frequency` field (Firestore + RTDB mirror) → display label for badges.
 */

export const SERIES_FREQUENCY_VALUES = [
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'half_yearly',
  'biannual',
  'annual',
  'yearly',
  'one_time',
  'special'
];

const LABELS = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  biannual: 'Biannual',
  annual: 'Annual',
  yearly: 'Annual',
  one_time: 'One Time',
  special: 'Special Edition'
};

/** @param {string | null | undefined} code */
export function seriesFrequencyLabel(code) {
  const raw = String(code ?? '').trim();
  if (!raw) return '';
  const k = raw.toLowerCase();
  if (LABELS[k]) return LABELS[k];
  return raw
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Styling for publication cards (studio + shelf): badge below title.
 * @param {string | null | undefined} code
 * @param {{ compact?: boolean }} [options] - `compact` uses a smaller badge (studio cards).
 * @returns {{ text: string, className: string }}
 */
export function seriesFrequencyBadgeAttrs(code, options = {}) {
  const compact = options.compact === true;
  const label = seriesFrequencyLabel(code);
  const size = compact
    ? 'rounded px-1.5 py-0.5 text-[10px] leading-tight mb-3'
    : 'rounded-md px-2.5 py-1 text-xs mb-4';
  const weight = label ? 'font-semibold' : 'font-medium';
  const tone = label
    ? `${weight} bg-primary/15 text-primary ring-1 ring-primary/25 dark:text-rose-100 dark:ring-primary/35`
    : `${weight} bg-slate-200/90 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600`;
  return {
    text: label || 'Not set',
    className: `inline-flex items-center ${size} ${tone} self-start`
  };
}
