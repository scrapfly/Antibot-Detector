/**
 * Detection tab: a scan as one line of text, for a chat message or a ticket. Pure (no browser APIs).
 * Reads the payload the Copy menu already builds (host, detections with name and confidence), so it holds no
 * cookie or header value and no query string.
 *
 *   oneLine(payload)   "shop.example: Cloudflare 95%, reCAPTCHA 70%"; "shop.example: -" when nothing was found
 *   signal(match)      what one match names, without what it holds: a cookie's or a header's name, a URL without its query,
 *                      a script pattern, a selector, a hooked method, a window property ('' when it names nothing safe)
 *   evidenceMarkdown(detection, options)   one detection as Markdown (the details dialog's Copy evidence): its name and
 *                      confidence, the page's host and its category, one line per signal (type, name or pattern, score) and
 *                      its matched combinations. Never a cookie or header value, a query string or a request body
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

  const firstPart = (text, separator) => {
    const value = String(text == null ? '' : text);
    const at = value.indexOf(separator);
    return (at === -1 ? value : value.slice(0, at)).trim();
  };

  /** A URL as host and path (no query, no fragment, no credentials); a pattern that is not a URL as it is. */
  function urlPart(text) {
    const value = clean(text);
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return `${url.hostname}${url.pathname}`;
    } catch (_) { /* a pattern */ }
    return firstPart(firstPart(value, '?'), '#');
  }

  function signal(match) {
    if (!match || typeof match !== 'object') return '';
    const type = String(match.type || '').toLowerCase();
    let text;
    switch (type) {
      case 'cookie': case 'cookies':
        // The value is name=value: only the name
        text = match.name || firstPart(match.value, '=');
        break;
      case 'header': case 'headers':
        // The value is "name: value": only the name
        text = match.name || firstPart(match.value, ':');
        break;
      case 'url': case 'urls':
        text = match.pattern ? urlPart(match.pattern) : urlPart(match.fullUrl || match.value);
        break;
      case 'content': case 'script':
        text = match.pattern;
        break;
      case 'dom':
        text = match.selector || match.pattern || firstPart(match.value, '=');
        break;
      case 'js_hooks':
        text = match.pattern || match.target || match.value;
        break;
      case 'window':
        text = match.pattern || match.value;
        break;
      default:
        // A payload or a response is a body: its rule's pattern only
        text = match.pattern || match.name;
    }
    const value = clean(text);
    return value.length > 200 ? `${value.slice(0, 199)}…` : value;
  }

  // Markdown: text escaped so no name turns into a link, an image or emphasis; a signal in a code span long enough for its backticks
  const mdText = (value) => clean(value).replace(/[\\`*_[\]<>|~#]/g, (c) => `\\${c}`);
  const mdCode = (value) => {
    const text = clean(value);
    const longest = Math.max(0, ...(text.match(/`+/g) || []).map(run => run.length));
    const fence = '`'.repeat(longest + 1);
    const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return `${fence}${pad}${text}${pad}${fence}`;
  };
  const percent = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '');
  const plainFormat = (key, fallback, ...args) => String(fallback).replace(/\{(\d+)\}/g, (p, i) => (Number(i) < args.length ? String(args[Number(i)]) : p));

  /**
   * @param {object} detection - one result (detector, category, confidence, matches, combinations)
   * @param {{host?: string, category?: string, when?: string, format?: Function}} [options] - host: the page's host;
   *   category: its label in the interface language; when: YYYY-MM-DD; format: (key, fallback, ...args) => text
   * @returns {string}
   */
  function evidenceMarkdown(detection, options = {}) {
    const d = detection && typeof detection === 'object' ? detection : {};
    const format = typeof options.format === 'function' ? options.format : plainFormat;
    const name = clean(d.detector && typeof d.detector === 'object' ? d.detector.name : d.detector) || clean(d.name) || '?';
    const lines = [];
    const confidence = percent(d.confidence);
    lines.push(`## ${mdText(name)}${confidence ? ` · ${confidence}` : ''}`);
    lines.push('');
    const about = [clean(options.host), clean(options.category)].filter(Boolean).map(mdText).join(' · ');
    if (about) { lines.push(about); lines.push(''); }

    // One line per signal: the same type and name found twice is one line, with its best score
    const seen = new Map();
    for (const match of Array.isArray(d.matches) ? d.matches : []) {
      const type = clean(match && match.type ? String(match.type).toLowerCase() : '') || 'unknown';
      const text = signal(match);
      const key = `${type}\u0000${text}`;
      const score = Number(match && (match.baseConfidence ?? match.confidence));
      const known = seen.get(key);
      if (!known) seen.set(key, { type, text, score: Number.isFinite(score) ? score : null });
      else if (Number.isFinite(score) && (known.score === null || score > known.score)) known.score = score;
    }
    for (const { type, text, score } of seen.values()) {
      const parts = [mdText(type)];
      if (text) parts.push(mdCode(text));
      lines.push(`- ${parts.join(' ')}${score !== null ? ` · ${percent(score)}` : ''}`);
    }
    for (const combo of Array.isArray(d.combinations) ? d.combinations : []) {
      if (!combo || typeof combo !== 'object') continue;
      const label = clean(combo.name || combo.id);
      const score = percent(Number(combo.confidence));
      lines.push(`- ${mdText('combination')}${label ? ` ${mdText(label)}` : ''}${score ? ` · ${score}` : ''}`);
    }
    if (seen.size || (Array.isArray(d.combinations) && d.combinations.length)) lines.push('');
    lines.push(`_${mdText(format('detectionMdFooterFmt', 'Scanned with Scrapfly Antibot Detector on {0}', clean(options.when)))}_`);
    return `${lines.join('\n')}\n`;
  }

  const api = { oneLine, signal, evidenceMarkdown };
  root.DetectionSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
