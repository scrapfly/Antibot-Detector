/**
 * Rule editor → "Test on this page": the rule as it is in the form (unsaved edits included) is run against the page
 * of the active tab, as it is right now. Pure (no browser APIs), shared by the worker (which runs it), the popup (which
 * lists and shows the answer) and the tests.
 *
 * A page can be read again at any time for four kinds of pattern: cookies, URLs (the page's and the requests it made),
 * script/page content and DOM selectors. The other four are not testable here: the response headers are gone once a scan
 * has read them, JS hooks and window properties need the page's own scripts running under the extension's watch from the
 * start, and request payloads are only seen while the page makes them. Those patterns are listed as "needs a real scan",
 * never as "no match".
 *
 *   TESTABLE        the methods a live page can answer
 *   PATTERN_TEXT    the field that names a pattern of each method (the text a row shows)
 *   patterns()      every pattern of a rule, in the editor's order: { method, index, label, description, testable }
 *   probes()        one single-pattern rule per testable pattern, so the engine says for each whether it matches on its own
 *   answer()        the worker's reply: per pattern how many matches, the rule's own verdict, what was not tested
 */
(function(root) {
  'use strict';

  const PATTERN_TEXT = Object.freeze({ cookie: 'name', header: 'name', url: 'text', content: 'text', payload: 'text', dom: 'selector', js_hooks: 'target', window: 'path' });
  const TESTABLE = Object.freeze(['cookie', 'url', 'content', 'dom']);
  const MAX_PATTERNS = 200;

  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : '';

  /** @returns {Array<{method: string, index: number, label: string, description: string, testable: boolean}>} */
  function patterns(detection) {
    const rows = [];
    const source = isRecord(detection) ? detection : {};
    for (const method of Object.keys(PATTERN_TEXT)) {
      (Array.isArray(source[method]) ? source[method] : []).forEach((pattern, index) => {
        if (!isRecord(pattern) || !str(pattern[PATTERN_TEXT[method]]).trim()) return;
        rows.push({ method, index, label: str(pattern[PATTERN_TEXT[method]]), description: str(pattern.description), testable: TESTABLE.includes(method) });
      });
    }
    return rows.slice(0, MAX_PATTERNS);
  }

  /**
   * One rule per testable pattern, with that pattern only (no combinations), for the engine's runDetector().
   * @param {object} detector - the rule as the form has it: { category, detection }
   * @returns {Array<{method: string, index: number, probe: object}>}
   */
  function probes(detector) {
    const detection = isRecord(detector && detector.detection) ? detector.detection : {};
    return patterns(detection).filter((row) => row.testable).map((row) => ({
      method: row.method,
      index: row.index,
      probe: { id: 'rule-test-probe', name: 'Rule test', category: str(detector && detector.category) || 'antibot', enabled: true, detection: { [row.method]: [detection[row.method][row.index]] } }
    }));
  }

  /**
   * The reply the popup shows.
   * @param {object} detector - the rule as the form has it
   * @param {Array<{method: string, index: number, count: number}>} counts - what each single pattern matched
   * @param {object|null} verdict - the engine's answer for the whole rule (confidence, partial, combinations), or null
   */
  function answer(detector, counts, verdict) {
    const detection = isRecord(detector && detector.detection) ? detector.detection : {};
    const byKey = new Map((counts || []).map((c) => [`${c.method}:${c.index}`, c.count]));
    const rows = patterns(detection).map((row) => {
      const count = byKey.get(`${row.method}:${row.index}`);
      return { method: row.method, index: row.index, tested: row.testable, count: row.testable ? Math.max(0, Number(count) || 0) : 0 };
    });
    const untested = [...new Set(rows.filter((row) => !row.tested).map((row) => row.method))];
    const v = isRecord(verdict) ? verdict : {};
    return {
      rows,
      untested,
      verdict: {
        confidence: Math.max(0, Math.round(Number(v.confidence) || 0)),
        partial: v.partial === true,
        combinations: (Array.isArray(v.combinations) ? v.combinations : []).filter(isRecord)
          .map((c) => ({ id: str(c.id), name: str(c.name), confidence: Math.max(0, Math.round(Number(c.confidence) || 0)) }))
      }
    };
  }

  const api = { PATTERN_TEXT, TESTABLE, MAX_PATTERNS, patterns, probes, answer };
  root.RuleTest = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RuleTest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
