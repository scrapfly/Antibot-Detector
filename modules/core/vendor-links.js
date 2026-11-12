/**
 * Links a protection's details dialog offers: the vendor's website and the protection's page in the repository's docs.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   DOCS_LANGUAGES  the languages docs/antibots/ is written in (scripts/lib/antibot-pages.js LANGS, English first)
 *   docsLanguage()  the docs language for the language the interface is shown in ('es', 'pt-BR'), English when there is none
 *   websiteUrl()    the vendor's site, from the detector's own `website` field
 *   docsUrl()       the protection's page on GitHub, in the person's language
 *
 * Only official detectors get links: their `website` comes with the extension, and every official anti-bot detector has a
 * page in every docs language (scripts/generate-antibot-pages.js writes one per detector in detectors/antibot/). A detector
 * someone wrote or imported gets none, since nothing vouches for an address it carries. Only https addresses are linked.
 */
(function(root) {
  'use strict';

  const REPO_URL = 'https://github.com/scrapfly/Antibot-Detector';
  const DOCS_URL = `${REPO_URL}/blob/main/docs/antibots/`;
  const DOCS_LANGUAGES = Object.freeze(['en', 'es', 'ru', 'zh-CN', 'ja', 'pt-BR', 'de', 'fr', 'ko']);
  // The category whose detectors have a docs page
  const DOCS_CATEGORY = 'antibot';

  /**
   * The docs language for an interface language: the same tag ('pt-BR', 'zh-CN'), else the same language when its docs are
   * not regional ('es-419' reads the Spanish pages), else English ('zh-TW' and 'pt-PT' are not the Chinese and Portuguese pages).
   */
  function docsLanguage(locale) {
    const tag = String(locale || '').replace(/_/g, '-').trim().toLowerCase();
    if (!tag) return 'en';
    const exact = DOCS_LANGUAGES.find(code => code.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    return DOCS_LANGUAGES.find(code => !code.includes('-') && code === base) || 'en';
  }

  /** "detect-aws-waf" -> "aws-waf"; nothing for an id that is not a plain file name. */
  function slugOf(id) {
    const slug = typeof id === 'string' ? id.replace(/^detect-/, '') : '';
    return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : '';
  }

  /** An https address as text, or ''. */
  function httpsUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && url.hostname ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  /**
   * @param {object} detector  the detector definition (its `website`)
   * @param {{official?: boolean}} [options]
   * @returns {string} the vendor's site, or '' when there is none to trust
   */
  function websiteUrl(detector, options = {}) {
    if (!options.official || !detector || typeof detector !== 'object') return '';
    return httpsUrl(detector.website);
  }

  /**
   * @param {object} detector  the detector definition (its `id`)
   * @param {{official?: boolean, category?: string, locale?: string}} [options]  category is the key ('antibot')
   * @returns {string} the page on GitHub, or '' when the protection has none
   */
  function docsUrl(detector, options = {}) {
    if (!options.official || options.category !== DOCS_CATEGORY || !detector || typeof detector !== 'object') return '';
    const slug = slugOf(detector.id);
    if (!slug) return '';
    const language = docsLanguage(options.locale);
    return `${DOCS_URL}${language === 'en' ? '' : `${language}/`}${slug}.md`;
  }

  const api = Object.freeze({ REPO_URL, DOCS_URL, DOCS_LANGUAGES, DOCS_CATEGORY, docsLanguage, slugOf, websiteUrl, docsUrl });
  root.VendorLinks = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.VendorLinks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
