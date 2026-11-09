/**
 * Detection tab: a scan as one line of text, for a chat message or a ticket. Pure (no browser APIs).
 * Reads the payload the Copy menu already builds (host, detections with name and confidence), so it holds no
 * cookie or header value and no query string.
 *
 *   oneLine(payload)   "shop.example: Cloudflare 95%, reCAPTCHA 70%"; "shop.example: -" when nothing was found
 */
(function(root) {
  'use strict';

  const clean = (value) => String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();

  function oneLine(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const names = (Array.isArray(p.detections) ? p.detections : []).filter(d => d && typeof d === 'object').map((d) => {
      const name = clean(d.name) || '?';
      return typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? `${name} ${Math.round(d.confidence)}%` : name;
    });
    return `${clean(p.host || p.url) || '?'}: ${names.length ? names.join(', ') : '-'}`;
  }

  const api = { oneLine };
  root.DetectionSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
