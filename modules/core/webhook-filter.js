/**
 * Which pages a webhook is sent for (Settings → Detection → Webhooks → Send only when). Pure (no browser APIs), so the
 * service worker, the Settings page and the tests share it.
 *
 *   DEFAULTS      { minConfidence: 0, categories: [], domains: [] }: every page that has a detection
 *   settingsOf()  the filter a webhook's saved settings describe, each field made safe
 *   evaluate()    { send: true }, or { send: false, reason: 'site' | 'category' | 'confidence' }
 *
 * The three conditions must all hold. An empty list of categories or sites means "any". The filter decides whether a
 * page is sent: the payload still lists everything found on it.
 */
(function(root) {
  'use strict';

  const DomainList = root.DomainList || (typeof require === 'function' ? require('./domain-list.js') : undefined);
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const DEFAULTS = Object.freeze({ minConfidence: 0, categories: Object.freeze([]), domains: Object.freeze([]) });

  /** The filter in a webhook's settings (webhookMinConfidence, webhookCategories, webhookDomains), each field made safe. */
  function settingsOf(webhook) {
    const w = webhook && typeof webhook === 'object' ? webhook : {};
    const confidence = Math.round(Number(w.webhookMinConfidence));
    return {
      minConfidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 100) : DEFAULTS.minConfidence,
      categories: [...new Set((Array.isArray(w.webhookCategories) ? w.webhookCategories : []).filter(key => Categories.KEYS.includes(key)))],
      domains: DomainList.normalize(Array.isArray(w.webhookDomains) ? w.webhookDomains : [])
    };
  }

  const confidenceOf = (detection) => {
    const value = Number(detection && detection.confidence);
    return Number.isFinite(value) ? value : 0;
  };

  /**
   * @param {Array<object>} detections  what was found on the page
   * @param {string} hostname           the page's host
   * @param {{minConfidence?: number, categories?: string[], domains?: string[]}} [filter]
   */
  function evaluate(detections, hostname, filter) {
    const f = { ...DEFAULTS, ...(filter || {}) };
    const list = Array.isArray(detections) ? detections : [];
    if (f.domains.length && !DomainList.matches(hostname, f.domains)) return { send: false, reason: 'site' };
    const counted = f.categories.length ? list.filter(detection => f.categories.includes(Categories.keyOf(detection))) : list;
    if (f.categories.length && counted.length === 0) return { send: false, reason: 'category' };
    const strongest = counted.reduce((max, detection) => Math.max(max, confidenceOf(detection)), 0);
    if (f.minConfidence > 0 && strongest < f.minConfidence) return { send: false, reason: 'confidence' };
    return { send: true };
  }

  const api = { DEFAULTS, settingsOf, evaluate };
  root.WebhookFilter = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.WebhookFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
