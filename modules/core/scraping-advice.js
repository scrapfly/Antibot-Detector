/**
 * Detection tab → What this means for scraping: what a scan's results ask of a scraper, as short plain lines. Pure (no browser
 * APIs): the popup and the tests share it. Loaded after categories.js and http-status.js.
 *
 *   of({ detections, httpStatus })   the points that apply, in this order, each once:
 *     'blocked'   the page answered with an error status (4xx or 5xx): this visit was refused or challenged
 *     'blockpage' the page is a block or challenge page (a rule scoped to a small page's own text matched), whatever its status
 *                 said; left out when 'blocked' already says it
 *     'captcha'   a CAPTCHA was found
 *     'browser'   the page checks the browser in JavaScript: a fingerprinting script, a hooked browser API or a window property
 *     'cookies'   a protection set cookies a scraper has to keep and send back
 *     'antibot'   an anti-bot service was found and none of the points above says more
 *   Only results at MIN_CONFIDENCE or more count, as the page difficulty counts them; an empty list when nothing applies.
 */
(function(root) {
  'use strict';

  const load = (name, file) => root[name] || (typeof require === 'function' ? require(file) : undefined);
  const Categories = load('Categories', './categories.js');
  const HttpStatus = load('HttpStatus', './http-status.js');

  const MIN_CONFIDENCE = 50;
  const ORDER = Object.freeze(['blocked', 'blockpage', 'captcha', 'browser', 'cookies', 'antibot']);
  const BROWSER_SIGNALS = new Set(['js_hooks', 'window']);
  const COOKIE_SIGNALS = new Set(['cookie', 'cookies']);

  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const categoryOf = (d) => {
    const nested = isRecord(d.detector) ? d.detector : {};
    return Categories.keyOf(d.category || nested.category || d.type || nested.type || d);
  };
  const confident = (d) => {
    const value = Number(d.confidence);
    return Number.isFinite(value) && value >= MIN_CONFIDENCE;
  };
  const blockPage = (d) => (Array.isArray(d.matches) ? d.matches : [])
    .some(match => isRecord(match) && match.scope === 'page');
  const signalTypes = (d) => new Set((Array.isArray(d.matches) ? d.matches : [])
    .filter(isRecord).map(match => String(match.type || '').toLowerCase()).filter(Boolean));

  /**
   * @param {{detections?: object[], httpStatus?: number}} scan
   * @returns {string[]} keys of ORDER
   */
  function of(scan) {
    const s = isRecord(scan) ? scan : {};
    const found = new Set();
    if (HttpStatus.isError(s.httpStatus)) found.add('blocked');
    for (const d of Array.isArray(s.detections) ? s.detections : []) {
      if (!isRecord(d) || !confident(d)) continue;
      const category = categoryOf(d);
      const types = signalTypes(d);
      if (blockPage(d)) found.add('blockpage');
      if (category === 'captcha') found.add('captcha');
      if (category === 'fingerprint' || [...types].some(type => BROWSER_SIGNALS.has(type))) found.add('browser');
      if ([...types].some(type => COOKIE_SIGNALS.has(type))) found.add('cookies');
      if (category === 'antibot') found.add('antibot');
    }
    // An error status already says the visit was refused
    if (found.has('blocked')) found.delete('blockpage');
    // A general anti-bot line only when no other point already tells the scraper something
    if (found.size > 1) found.delete('antibot');
    return ORDER.filter(key => found.has(key));
  }

  /** The interface text of each point: [locale key, English]. 'blocked' takes the status as {0}. */
  const TEXTS = Object.freeze({
    blocked: ['detectionScrapingBlockedFmt', 'The page answered with HTTP {0}: this visit was refused or challenged.'],
    blockpage: ['detectionScrapingBlockPage', 'This is a block or challenge page, not the site itself: this visit was refused or challenged.'],
    captcha: ['detectionScrapingCaptcha', 'A CAPTCHA is on the page: a scraper has to avoid triggering it or solve it.'],
    browser: ['detectionScrapingBrowser', 'The page checks the browser in JavaScript: plain HTTP requests are likely to fail, use a real browser.'],
    cookies: ['detectionScrapingCookies', 'Protection cookies are set: a scraper has to keep them and send them back.'],
    antibot: ['detectionScrapingAntibot', 'An anti-bot service watches this site: many or fast requests from one address may be blocked.']
  });

  const api = Object.freeze({ MIN_CONFIDENCE, ORDER, TEXTS, of });
  root.ScrapingAdvice = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.ScrapingAdvice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
