/**
 * The technical literals of an English rule text: names, paths and patterns
 * that must stay exactly as written in every translation (a cookie called
 * `bm_sz` is not translated). Prose, acronyms and slashed word pairs are not
 * literals.
 */
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

function literalsOf(english) {
  const text = clean(english);
  const found = new Set();
  const add = (s) => { const t = s.replace(/[.,;:!?)]+$/, '').replace(/^[(]+/, ''); if (t.length > 2) found.add(t); };
  for (const m of text.matchAll(/`([^`]+)`/g)) add(m[1]);
  for (const m of text.matchAll(/<[A-Za-z][\w.\- ]*>/g)) add(m[0]);
  // Tokens joined by ~ _ = or written as calls, dotted identifiers, paths and domains
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9_.\-]*[~_=][A-Za-z0-9_.~=\-]*/g)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:\(\))?/g)) if (!/^[A-Za-z]+\.[A-Za-z]+\.?$/.test(m[0]) || /[A-Z0-9_]/.test(m[0])) add(m[0]);
  for (const m of text.matchAll(/(?:^|[\s(])(\/[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]*)*)/g)) add(m[1]);
  for (const m of text.matchAll(/\b[A-Za-z0-9\-]+(?:\/[A-Za-z0-9\-]+)+\b/g)) if (/[-_.0-9]/.test(m[0])) add(m[0]);
  for (const m of text.matchAll(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b[\w.\-]+\(\)/g)) add(m[0]);
  return [...found];
}

/** Literals of `english` that `translated` does not contain verbatim. */
function missingLiterals(english, translated) {
  const t = clean(translated);
  return literalsOf(english).filter(l => !t.includes(l));
}

module.exports = { literalsOf, missingLiterals };
