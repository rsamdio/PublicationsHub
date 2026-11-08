/**
 * Invoked via scripts/eval-slugs.mjs with node --experimental-strip-types.
 */
import {
  assertPublicSlug,
  buildTakenSlugSet,
  conflictErrorMessage,
  findSlugConflict,
  isReservedSlug,
  isValidSlug,
  looksLikeUrlOrPath,
  normalizeSlugInput,
  publicPathSegment,
  sanitizeSlug,
  suggestUniqueSlug
} from '../lib/urls.ts';
import { lookupSlugRedirect, SLUG_REDIRECTS } from '../lib/seo/slug-redirects.ts';

let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`[OK] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ''}`);
  }
}

check('valid july-2026', isValidSlug('july-2026'));
check('valid the-wings-log', isValidSlug('the-wings-log'));
check('reject uppercase', !isValidSlug('July-2026'));
check('reject empty', !isValidSlug(''));
check('reject trailing hyphen after sanitize edge', (() => {
  const long = 'a'.repeat(58) + '-bcdef';
  const s = sanitizeSlug(long);
  return !s.endsWith('-') && (s === '' || isValidSlug(s));
})());

check('looksLikeUrl https', looksLikeUrlOrPath('https://rotaract3020.org/magazines/JULY2026'));
check('looksLikeUrl path slash', looksLikeUrlOrPath('otaract3191.org/publications/district/july-2026'));
check('looksLikeUrl percent', looksLikeUrlOrPath('otaract3191.org%2Fpublications'));
check('looksLikeUrl dot org', looksLikeUrlOrPath('rotaract3020.org'));
check('plain title not url-like', !looksLikeUrlOrPath('July 2026'));

const badHttps = normalizeSlugInput(
  'https://rotaract3020.org/magazines/JULY2026',
  { kind: 'edition' }
);
check('reject pasted https', !badHttps.ok);

const badPath = normalizeSlugInput(
  'otaract3191.org/publications/district/july-2026',
  { kind: 'series' }
);
check('reject wings broken series slug', !badPath.ok);

const spaceOk = normalizeSlugInput('July 2026', { kind: 'edition' });
check('sanitize spaces on submit', spaceOk.ok && spaceOk.slug === 'july-2026');

const reserved = normalizeSlugInput('about', { kind: 'series' });
check('reserved series about', !reserved.ok);
const reservedEd = normalizeSlugInput('about', { kind: 'edition' });
check('edition may use about', reservedEd.ok && reservedEd.slug === 'about');

check('assertPublicSlug empty fails', !assertPublicSlug('').ok);
check('diacritics cafe', sanitizeSlug('Café') === 'cafe');

const taken = buildTakenSlugSet([
  { id: 'abc123', slug: 'kairav' },
  { id: 'def456', slug: null }
]);
check('taken includes id', taken.has('def456'));
check('taken includes slug', taken.has('kairav'));
const unique = suggestUniqueSlug('kairav', taken);
check('suggestUniqueSlug suffixes', unique === 'kairav-2');

const conflictId = findSlugConflict({
  kind: 'series',
  slug: 'abc123',
  selfId: 'other',
  seriesEntries: [{ id: 'abc123', slug: 'kairav' }]
});
check('conflict with other id', !!conflictId && conflictId.reason === 'id');
check(
  'conflict message',
  conflictErrorMessage('series', 'abc123', 'id').includes('id')
);

check(
  'publicPathSegment drops bad slug',
  publicPathSegment(
    'https://rotaract3020.org/magazines/JULY2026',
    'ZyPHx1lhD3IfN8Duzrl7'
  ) === 'ZyPHx1lhD3IfN8Duzrl7'
);
check(
  'publicPathSegment keeps good slug',
  publicPathSegment('july-2026', 'ZyPHx1lhD3IfN8Duzrl7') === 'july-2026'
);

check('isReservedSlug admin', isReservedSlug('admin'));
check('isReservedSlug llms.txt', isReservedSlug('llms.txt'));

check('redirect map non-empty', Object.keys(SLUG_REDIRECTS).length >= 4);
check(
  'redirect wings encoded',
  lookupSlugRedirect(
    '/otaract3191.org%2Fpublications%2Fdistrict%2Fjuly-2026'
  ) === '/the-wings-log'
);
check(
  'redirect kairav july',
  lookupSlugRedirect(
    '/kairav/https%3A%2F%2Frotaract3020.org%2Fmagazines%2FJULY2026'
  ) === '/kairav/july-2026'
);
check(
  'redirect kairav august decoded',
  lookupSlugRedirect('/kairav/https://rotaract3020.org/magazines/AUGUST2026') ===
    '/kairav/august-2026'
);
check('redirect miss', lookupSlugRedirect('/kairav/july-2026') === null);

if (failed) {
  console.error(`\n${failed} slug eval(s) failed.`);
  process.exit(1);
}
console.log('\nAll slug evals passed.');
