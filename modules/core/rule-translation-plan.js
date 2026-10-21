/**
 * What a rule still lacks in translations (Rules → editor → "Translate the rule"). Pure (no browser APIs), so the editor
 * and the tests share it.
 *
 * A rule has three kinds of text: the detector's description, the description of each pattern, and the name of each
 * combination. Each is written in English and may carry translations of its own, one per extension language; the
 * extension also ships translations for its official texts. A language is missing for a text when it has neither.
 *
 *   plan(texts, locales, shippedOf)   the texts with a missing language, which languages, and the totals
 *
 * texts:     [{ id, kind, text, own }]  own is { locale: translation } as typed in the rule
 * shippedOf: (text, locale) => the translation the extension ships for that text, or '' when it ships none
 */
(function(root) {
  'use strict';

  const clean = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();

  /**
   * @returns {{jobs: Array<{id: string, kind: string, text: string, missing: string[]}>, texts: number, gaps: number, locales: string[]}}
   *   jobs    the texts with at least one missing language (empty texts have nothing to translate)
   *   texts   how many such texts
   *   gaps    how many (text, language) pairs are missing
   *   locales the languages missing for at least one text, in the order given
   */
  function plan(texts, locales, shippedOf) {
    const languages = Array.isArray(locales) ? locales : [];
    const jobs = [];
    for (const item of Array.isArray(texts) ? texts : []) {
      const source = clean(item && item.text);
      if (!source) continue;
      const own = item.own && typeof item.own === 'object' && !Array.isArray(item.own) ? item.own : {};
      const missing = languages.filter(locale => !clean(own[locale]) && !(typeof shippedOf === 'function' && shippedOf(source, locale)));
      if (missing.length) jobs.push({ id: item.id, kind: item.kind, text: source, missing });
    }
    const gaps = jobs.reduce((sum, job) => sum + job.missing.length, 0);
    const needed = new Set(jobs.flatMap(job => job.missing));
    return { jobs, texts: jobs.length, gaps, locales: languages.filter(locale => needed.has(locale)) };
  }

  const api = { plan };
  root.RuleTranslationPlan = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RuleTranslationPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
