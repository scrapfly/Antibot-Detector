/**
 * Rules → "From this page": what a new rule could look for on the page in the active tab. Pure (no browser APIs), so
 * the popup and the tests share it.
 *
 *   candidates(page)                    the page's cookies, third-party scripts and response headers as candidates
 *   annotate(candidates, page, detectors, runDetector)
 *                                       marks each candidate with the installed rules that already detect it, by
 *                                       running the detection engine's own runDetector() on the page (no matching
 *                                       of its own), and lists the candidates nothing detects first
 *   suggest(page, detectors, runDetector)   both of the above
 *   buildRule({ id, name, category, candidates })   the new rule the editor opens with (the editor validates on Save)
 *
 * The page, as the worker's RULE_SUGGEST_PAGE answer carries it:
 *   { url, cookies: [{ name, value }], scripts: [url], headers: { name: value } }
 *
 * How a candidate becomes a pattern, kept simple enough to explain in one line each:
 *   cookie   the exact name (^name$), or, when the name ends in a random-looking part (incap_ses_123_456,
 *            _ga_X1Y2Z3W4), the name up to it as a prefix (^incap_ses_)
 *   url      the script's host and path without the query, cut before the first random-looking path segment
 *            (cdn.vendor.com/v2/sdk.js; a hash in a file name leaves the folder), matched as "contains"
 *   header   the exact response header name (^x-vendor-id$)
 */
(function(root) {
  'use strict';

  const KINDS = Object.freeze(['cookie', 'url', 'header']);

  // Response headers any site sends: never the mark of a protection on their own
  const COMMON_HEADERS = new Set([
    'accept-ranges', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods',
    'access-control-allow-origin', 'access-control-expose-headers', 'access-control-max-age', 'age', 'alt-svc',
    'cache-control', 'connection', 'content-disposition', 'content-encoding', 'content-language', 'content-length',
    'content-location', 'content-security-policy', 'content-security-policy-report-only', 'content-type',
    'cross-origin-embedder-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'date', 'etag',
    'expect-ct', 'expires', 'keep-alive', 'last-modified', 'link', 'location', 'nel', 'origin-agent-cluster', 'p3p',
    'permissions-policy', 'pragma', 'referrer-policy', 'report-to', 'reporting-endpoints', 'retry-after', 'server-timing',
    'set-cookie', 'strict-transport-security', 'timing-allow-origin', 'transfer-encoding', 'upgrade', 'vary', 'via',
    'x-content-type-options', 'x-dns-prefetch-control', 'x-frame-options', 'x-powered-by', 'x-ua-compatible',
    'x-xss-protection'
  ]);

  // Second-level labels under a two-letter country code (example.co.uk): the site is the three last labels
  const SECOND_LEVEL = new Set(['ac', 'co', 'com', 'edu', 'gov', 'ne', 'net', 'or', 'org']);

  const str = (value) => (typeof value === 'string' ? value : '');
  const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** The site a host belongs to, near enough to tell a third party: the last two labels (three under co.uk and alike). */
  function siteOf(host) {
    const h = str(host).toLowerCase().replace(/\.$/, '');
    if (!h || /^[\d.]+$/.test(h) || h.includes(':')) return h; // an IP address is its own site
    const labels = h.split('.');
    if (labels.length <= 2) return h;
    const last = labels[labels.length - 1];
    const second = labels[labels.length - 2];
    const keep = last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
    return labels.slice(-keep).join('.');
  }

  /**
   * A part of a name or path that looks generated rather than chosen: 4+ digits, 8+ hex characters, or 8+ letters
   * and digits mixed. "v2", "sdk", "bm_sz" and "challenge-platform" are chosen names.
   */
  function isRandomPart(part) {
    const p = str(part);
    if (/^\d{4,}$/.test(p)) return true;
    if (/^[0-9a-f]{8,}$/i.test(p)) return true;
    return p.length >= 8 && /^[A-Za-z0-9]+$/.test(p) && /\d/.test(p) && /[A-Za-z]/.test(p);
  }

  /** A path segment with a random-looking part ("4f3a9c21", "main.4f3a9c21.js", "a1b2c3d4-e5f6"). */
  const isRandomSegment = (segment) => str(segment).split(/[._-]/).some(isRandomPart);

  /**
   * How a cookie name is matched: { prefix: false, text: name } for the exact name, or { prefix: true, text } with the
   * name up to its random-looking end ("incap_ses_" for incap_ses_1234_567890). The prefix keeps at least 2 letters.
   */
  function cookieMatch(name) {
    const n = str(name);
    let cut = n.length;
    // Peel random-looking parts off the end, one separator-delimited part at a time
    for (;;) {
      const head = n.slice(0, cut);
      const at = Math.max(head.lastIndexOf('_'), head.lastIndexOf('-'), head.lastIndexOf('.'));
      if (at < 0) break;
      const tail = head.slice(at + 1);
      if (!isRandomPart(tail) || !/[A-Za-z]{2}/.test(head.slice(0, at))) break;
      cut = at;
    }
    if (cut === n.length) return { prefix: false, text: n };
    return { prefix: true, text: n.slice(0, cut + 1) }; // keeps the separator: incap_ses_ never matches incap_session
  }

  /** "host/path" a script is matched by: no scheme or query, cut before the first random-looking segment. */
  function scriptText(url) {
    let parsed;
    try { parsed = new URL(url); } catch (_) { return ''; }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const kept = [];
    for (const segment of segments) {
      if (isRandomSegment(segment)) break;
      kept.push(segment);
    }
    const cutShort = kept.length < segments.length;
    const path = kept.length ? `/${kept.join('/')}${cutShort ? '/' : ''}` : '/';
    return `${parsed.host.toLowerCase()}${path}`;
  }

  /**
   * The candidates of a page, cookies first, then scripts, then headers, each in page order and once.
   * @returns {Array<{id, kind, value, text, prefix, sources: string[], matchedBy: string[]}>}
   */
  function candidates(page) {
    const p = page && typeof page === 'object' ? page : {};
    const out = [];
    const byId = new Map();
    const add = (kind, text, value, source, extra = {}) => {
      if (!text) return;
      const id = `${kind}:${text}`;
      const known = byId.get(id);
      if (known) {
        if (!known.sources.includes(source)) known.sources.push(source);
        return;
      }
      const candidate = { id, kind, value, text, prefix: false, sources: [source], matchedBy: [], ...extra };
      byId.set(id, candidate);
      out.push(candidate);
    };

    for (const cookie of Array.isArray(p.cookies) ? p.cookies : []) {
      const name = str(cookie && cookie.name).trim();
      if (!name) continue;
      const match = cookieMatch(name);
      add('cookie', match.text, match.prefix ? `${match.text}…` : name, name, { prefix: match.prefix });
    }

    let pageSite = '';
    try { pageSite = siteOf(new URL(str(p.url)).hostname); } catch (_) { /* no page address: every script counts */ }
    for (const url of Array.isArray(p.scripts) ? p.scripts : []) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
      let host = '';
      try { host = new URL(url).hostname; } catch (_) { continue; }
      if (pageSite && siteOf(host) === pageSite) continue; // the site's own scripts: not a third party
      const text = scriptText(url);
      add('url', text, text, url);
    }

    const headers = p.headers && typeof p.headers === 'object' ? p.headers : {};
    for (const rawName of Object.keys(headers)) {
      const name = rawName.trim().toLowerCase();
      if (!name || COMMON_HEADERS.has(name)) continue;
      add('header', name, name, name);
    }
    return out;
  }

  /** What the engine's runDetector() reads, built from the page: only the scripts count as URLs, never its own address. */
  function engineInput(page) {
    const p = page && typeof page === 'object' ? page : {};
    const cookies = (Array.isArray(p.cookies) ? p.cookies : [])
      .filter(cookie => cookie && typeof cookie.name === 'string')
      .map(cookie => ({ name: cookie.name, value: str(cookie.value) }));
    const scripts = (Array.isArray(p.scripts) ? p.scripts : []).filter(url => typeof url === 'string');
    const headers = {};
    for (const [name, value] of Object.entries(p.headers && typeof p.headers === 'object' ? p.headers : {})) {
      headers[String(name).toLowerCase()] = str(value);
    }
    return {
      url: '', content: scripts.map(src => ({ src })), dom: [], cookies, allCookies: cookies, responseCookies: [],
      headers, requestHeaders: {}, pageHTML: '', externalContent: [],
      networkUrls: scripts.map(url => ({ url, type: 'script' })), payloads: [], responses: []
    };
  }

  const detectorName = (detector, fallback) => str(detector && (detector.displayName || detector.name)) || fallback;

  /**
   * Marks each candidate with the names of the installed rules whose patterns already match it, then puts the
   * candidates no rule detects first (the order is otherwise kept). The engine decides what matches.
   * @param {Array<{id: string, detector: object}>|object} detectors - [{ id, detector }] or { category: { id: detector } }
   * @param {(detector: object, pageData: object) => {matches: Array}} runDetector - the engine's runDetector
   */
  function annotate(list, page, detectors, runDetector) {
    const items = Array.isArray(list) ? list : [];
    if (typeof runDetector !== 'function') return items.slice();
    const bySource = { cookie: new Map(), url: new Map(), header: new Map() };
    for (const candidate of items) {
      for (const source of candidate.sources) {
        const key = candidate.kind === 'header' ? source.toLowerCase() : source;
        if (!bySource[candidate.kind].has(key)) bySource[candidate.kind].set(key, []);
        bySource[candidate.kind].get(key).push(candidate);
      }
    }
    const input = engineInput(page);
    for (const { id, detector } of listDetectors(detectors)) {
      if (!detector || !detector.detection) continue;
      let result;
      try { result = runDetector(detector, input); } catch (_) { continue; }
      const name = detectorName(detector, id);
      for (const match of (result && Array.isArray(result.matches) ? result.matches : [])) {
        let hits = null;
        if (match.type === 'cookie') hits = bySource.cookie.get(str(match.name));
        else if (match.type === 'url') hits = bySource.url.get(str(match.fullUrl));
        else if (match.type === 'header') hits = bySource.header.get(str(match.value).split(':')[0].trim().toLowerCase());
        for (const candidate of hits || []) {
          if (!candidate.matchedBy.includes(name)) candidate.matchedBy.push(name);
        }
      }
    }
    return items.map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => (a.candidate.matchedBy.length > 0) - (b.candidate.matchedBy.length > 0) || a.index - b.index)
      .map(({ candidate }) => candidate);
  }

  function listDetectors(detectors) {
    if (Array.isArray(detectors)) return detectors.filter(Boolean);
    const out = [];
    for (const group of Object.values(detectors && typeof detectors === 'object' ? detectors : {})) {
      for (const [id, detector] of Object.entries(group && typeof group === 'object' ? group : {})) out.push({ id, detector });
    }
    return out;
  }

  const suggest = (page, detectors, runDetector) => annotate(candidates(page), page, detectors, runDetector);

  /** The pattern one candidate becomes, in the shape detector files use. */
  function patternOf(candidate) {
    if (candidate.kind === 'cookie') {
      return { name: candidate.prefix ? `^${escapeRegex(candidate.text)}` : `^${escapeRegex(candidate.text)}$`,
        nameRegex: true, confidence: 100, nameScope: 'all', valueScope: 'all' };
    }
    if (candidate.kind === 'url') return { text: candidate.text, confidence: 100, textScope: 'all' };
    if (candidate.kind === 'header') {
      return { name: `^${escapeRegex(candidate.text)}$`, nameRegex: true, confidence: 100, nameScope: 'response', valueScope: 'response' };
    }
    return null;
  }

  /**
   * The new rule: one pattern per ticked candidate, grouped by method. It has no id-less parts the editor needs
   * filled; the editor validates the patterns when it is saved.
   */
  function buildRule({ id, name, category, candidates: picked, lastUpdated } = {}) {
    const detection = {};
    for (const candidate of Array.isArray(picked) ? picked : []) {
      if (!candidate || !KINDS.includes(candidate.kind)) continue;
      const pattern = patternOf(candidate);
      if (!pattern) continue;
      (detection[candidate.kind] = detection[candidate.kind] || []).push(pattern);
    }
    const ruleName = str(name).trim();
    return {
      id: str(id) || `custom-${Date.now()}`,
      name: ruleName,
      displayName: ruleName,
      category: str(category) || 'antibot',
      difficulty: 'Medium',
      icon: 'default',
      color: '#3b82f6',
      description: 'Custom detector',
      lastUpdated: str(lastUpdated),
      detection
    };
  }

  const api = Object.freeze({ KINDS, siteOf, isRandomPart, cookieMatch, scriptText, candidates, engineInput, annotate, suggest, patternOf, buildRule });
  root.RuleSuggest = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RuleSuggest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
