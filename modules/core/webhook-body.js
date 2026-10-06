/**
 * WebhookBody — the one definition of the webhook template variables and of
 * how a webhook request body is built for each Content-Type.
 *
 * Shared by the background sender (SettingsRuntime.sendWebhookIfEnabled),
 * the Settings "Test" button and the Settings payload-template UI, so the
 * body a user tests is byte-for-byte the body the extension sends.
 *
 * The payload template is JSON with <TOKEN> placeholders. It defines WHICH
 * fields are sent; the Content-Type decides HOW they are encoded:
 *
 *   application/json                   the template, tokens substituted (strings JSON-escaped)
 *   custom type/subtype                same body as application/json
 *   text/plain                         the template text, tokens substituted verbatim
 *   application/x-www-form-urlencoded  the template object flattened to key=value pairs,
 *                                      nested keys in bracket notation (detections[0][name]=…)
 *   multipart/form-data                the same pairs as FormData; fetch sets the boundary,
 *                                      so no Content-Type header is set by the extension
 *   application/xml                    the template object as <webhook>…</webhook>, arrays as
 *                                      repeated child elements, text escaped
 *   text/csv                           header row + one row per detection (page fields repeated,
 *                                      detection fields as detection.*); one row when none
 *   application/x-ndjson               one JSON object per line, one line per detection
 *                                      (page fields + "detection"); one line when none
 *
 * Structured types (form, multipart, xml, csv, ndjson) parse the substituted
 * template; when it is empty or not valid JSON they use the default payload.
 *
 * No DOM or chrome.* dependency: loads in the service worker, the popup and
 * node tests (module.exports).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- variables
  // `key` is the field of the substitution context. `kind`: 'string' values
  // are escaped for their context, 'number' is inserted as is, 'json' is the
  // detections array serialised as JSON (body only).
  const VARIABLES = Object.freeze([
    { token: '<SITEURL>', key: 'url', kind: 'string', descKey: 'webhookVarSiteUrl', desc: 'Full URL of the page', sample: 'https://example.com/test-page' },
    { token: '<HOSTNAME>', key: 'hostname', kind: 'string', descKey: 'webhookVarHostname', desc: 'Host name of the page', sample: 'example.com' },
    { token: '<TITLE>', key: 'title', kind: 'string', descKey: 'webhookVarTitle', desc: 'Page title', sample: 'Test Page - Webhook Test' },
    { token: '<FAVICON>', key: 'favicon', kind: 'string', descKey: 'webhookVarFavicon', desc: 'Favicon URL of the site', sample: 'https://www.google.com/s2/favicons?domain=example.com&sz=64' },
    { token: '<DETECTIONS>', key: 'detections', kind: 'json', descKey: 'webhookVarDetections', desc: 'Detections as a JSON array', sample: null },
    { token: '<TIMESTAMP>', key: 'timestamp', kind: 'string', descKey: 'webhookVarTimestamp', desc: 'Time of the detection (ISO 8601)', sample: '2026-01-01T12:00:00.000Z' },
    { token: '<DETECTION_COUNT>', key: 'detectionCount', kind: 'number', descKey: 'webhookVarDetectionCount', desc: 'Number of detections', sample: 1 },
    { token: '<CATEGORIES>', key: 'categories', kind: 'string', descKey: 'webhookVarCategories', desc: 'Detected categories, comma-separated', sample: 'antibot' }
  ]);

  // One detection exactly as the engine emits it (runDetector + detectOnPage),
  // so the Settings test payload matches what a naturally triggered event
  // sends: field names, structure and value formatting (GitHub issue #5).
  const SAMPLE_DETECTIONS = Object.freeze([
    Object.freeze({
      detected: true,
      confidence: 85,
      difficulty: 'Medium',
      matches: Object.freeze([
        Object.freeze({
          type: 'url',
          pattern: '/cdn-cgi/challenge-platform/',
          value: '/cdn-cgi/challenge-platform/',
          fullUrl: 'https://example.com/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1/abc123',
          confidence: 85,
          patternId: 'challenge-orchestrator',
          description: 'Challenge page orchestrator under /cdn-cgi/challenge-platform/'
        })
      ]),
      detectionMethods: Object.freeze(['url']),
      category: 'antibot',
      detector: Object.freeze({
        name: 'Cloudflare Bot Management',
        icon: 'cloudflare_official.png',
        id: 'detect-cloudflare',
        description: 'AI-powered bot detection and mitigation with global CDN integration',
        author: 'Scrapfly',
        difficulty: 'Medium'
      })
    })
  ]);

  const DEFAULT_TEMPLATE = '{"url": "<SITEURL>", "hostname": "<HOSTNAME>", "title": "<TITLE>", "favicon": "<FAVICON>", "detections": <DETECTIONS>, "timestamp": "<TIMESTAMP>", "count": <DETECTION_COUNT>, "categories": "<CATEGORIES>"}';

  // ------------------------------------------------------------ content types
  const CUSTOM = 'custom';
  const CONTENT_TYPES = Object.freeze([
    { value: 'application/json', kind: 'json', hintKey: 'webhookCtHintJson', hint: 'The template as JSON, with the variables filled in.' },
    { value: 'application/x-www-form-urlencoded', kind: 'form', hintKey: 'webhookCtHintForm', hint: 'Template fields as key=value pairs; nested fields as detections[0][name].' },
    { value: 'multipart/form-data', kind: 'multipart', hintKey: 'webhookCtHintMultipart', hint: 'Template fields as form-data parts; the browser sets the boundary.' },
    { value: 'text/plain', kind: 'text', hintKey: 'webhookCtHintText', hint: 'The template text as is, with the variables filled in.' },
    { value: 'application/xml', kind: 'xml', hintKey: 'webhookCtHintXml', hint: 'Template fields as a <webhook> XML document; detections as repeated elements.' },
    { value: 'text/csv', kind: 'csv', hintKey: 'webhookCtHintCsv', hint: 'A header row, then one row per detection with the page fields repeated.' },
    { value: 'application/x-ndjson', kind: 'ndjson', hintKey: 'webhookCtHintNdjson', hint: 'One JSON object per line: one line per detection, with the page fields.' },
    { value: CUSTOM, kind: 'custom', hintKey: 'webhookCtHintCustom', hint: 'Your own Content-Type (type/subtype); the body is sent as JSON.' }
  ]);

  // RFC 7231 media type: token "/" token *( OWS ";" OWS parameter )
  const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
  const MEDIA_TYPE_RE = new RegExp(`^${TOKEN}/${TOKEN}(\\s*;\\s*${TOKEN}=(${TOKEN}|"[^"\\\\\\r\\n]*"))*$`);

  function isValidContentType(value) {
    return typeof value === 'string' && MEDIA_TYPE_RE.test(value.trim());
  }

  /**
   * Map a saved webhookContentType to how the body is built. Anything that is
   * not one of the listed types is a custom type (sent with a JSON body);
   * an invalid custom value falls back to application/json.
   * @param {string} saved
   * @returns {{kind: string, header: string|null, value: string, custom: boolean}}
   */
  function resolveContentType(saved) {
    const value = String(saved || '').trim() || 'application/json';
    const known = CONTENT_TYPES.find(t => t.value !== CUSTOM && t.value.toLowerCase() === value.toLowerCase());
    if (known) {
      return { kind: known.kind, header: known.kind === 'multipart' ? null : known.value, value: known.value, custom: false };
    }
    if (isValidContentType(value)) {
      return { kind: 'custom', header: value, value, custom: true };
    }
    return { kind: 'json', header: 'application/json', value: 'application/json', custom: false };
  }

  // ------------------------------------------------------------- substitution
  function sampleContext() {
    const ctx = {};
    for (const v of VARIABLES) ctx[v.key] = v.sample;
    ctx.detections = SAMPLE_DETECTIONS.map(d => ({
      ...d,
      matches: d.matches.map(m => ({ ...m })),
      detectionMethods: [...d.detectionMethods],
      detector: { ...d.detector }
    }));
    ctx.detectionCount = ctx.detections.length;
    return ctx;
  }

  function jsonEscape(value) {
    return JSON.stringify(String(value)).slice(1, -1);
  }

  /**
   * Replace every <TOKEN> of the template.
   * @param {string} template
   * @param {object} ctx - {url, hostname, title, favicon, timestamp, detectionCount, categories, detections}
   * @param {'url'|'header'|'text'|'json'} mode - url: values URL-encoded; header: verbatim;
   *   text: verbatim + <DETECTIONS> as JSON; json: strings JSON-escaped + <DETECTIONS> as JSON
   */
  function substitute(template, ctx, mode = 'text') {
    let out = String(template || '');
    for (const v of VARIABLES) {
      if (!out.includes(v.token)) continue;
      let replacement;
      if (v.kind === 'json') {
        if (mode === 'url' || mode === 'header') continue;
        replacement = JSON.stringify(Array.isArray(ctx.detections) ? ctx.detections : []);
      } else if (v.kind === 'number') {
        replacement = String(Number(ctx[v.key]) || 0);
      } else {
        const raw = ctx[v.key] == null ? '' : String(ctx[v.key]);
        if (mode === 'url') replacement = encodeURIComponent(raw);
        else if (mode === 'json') replacement = jsonEscape(raw);
        else replacement = raw;
      }
      out = out.split(v.token).join(replacement);
    }
    return out;
  }

  function defaultPayload(ctx) {
    return {
      url: ctx.url,
      hostname: ctx.hostname,
      title: ctx.title,
      favicon: ctx.favicon,
      detections: Array.isArray(ctx.detections) ? ctx.detections : [],
      timestamp: ctx.timestamp,
      count: Number(ctx.detectionCount) || 0
    };
  }

  /**
   * Line/column of a JSON.parse error offset, or null.
   */
  function errorPosition(text, error) {
    const msg = String(error && error.message || '');
    let m = msg.match(/line (\d+) column (\d+)/i);
    if (m) return { line: Number(m[1]), column: Number(m[2]) };
    m = msg.match(/position (\d+)/i);
    if (!m) return null;
    const offset = Math.min(Number(m[1]), text.length);
    const before = text.slice(0, offset).split('\n');
    return { line: before.length, column: before[before.length - 1].length + 1 };
  }

  /**
   * Check that the template is valid JSON once its variables are filled in.
   * Empty templates are valid (the default payload is sent).
   * @returns {{ok: boolean, empty?: boolean, line?: number, column?: number, message?: string}}
   */
  function validateTemplate(template, ctx = sampleContext()) {
    const text = String(template || '');
    if (!text.trim()) return { ok: true, empty: true };
    const filled = substitute(text, ctx, 'json');
    try {
      JSON.parse(filled);
      return { ok: true };
    } catch (error) {
      const pos = errorPosition(filled, error) || { line: 1, column: 1 };
      return { ok: false, line: pos.line, column: pos.column, message: error.message };
    }
  }

  /**
   * The payload object a structured body is built from: the parsed template,
   * or the default payload when the template is empty, invalid or not an object.
   */
  function payloadObject(template, ctx) {
    const text = String(template || '').trim();
    if (text) {
      try {
        const parsed = JSON.parse(substitute(text, ctx, 'json'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { /* fall through to the default payload */ }
    }
    return defaultPayload(ctx);
  }

  // -------------------------------------------------------------- serialisers
  function scalarText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Flatten an object to [key, value] string pairs with bracket notation:
   * {a: {b: 1}, list: [{n: 'x'}]} → [['a[b]', '1'], ['list[0][n]', 'x']].
   * Empty arrays/objects keep their key with an empty value.
   */
  function flattenPairs(value, prefix = '', out = []) {
    if (value !== null && typeof value === 'object') {
      const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
      if (!entries.length) {
        if (prefix) out.push([prefix, '']);
        return out;
      }
      for (const [k, v] of entries) flattenPairs(v, prefix ? `${prefix}[${k}]` : k, out);
      return out;
    }
    if (prefix) out.push([prefix, scalarText(value)]);
    return out;
  }

  function toFormUrlEncoded(obj) {
    return flattenPairs(obj)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`.replace(/%20/g, '+'))
      .join('&');
  }

  function toFormData(obj, FormDataImpl = (typeof FormData !== 'undefined' ? FormData : null)) {
    if (!FormDataImpl) throw new Error('FormData is not available');
    const form = new FormDataImpl();
    for (const [k, v] of flattenPairs(obj)) form.append(k, v);
    return form;
  }

  // XML 1.0 Char production: drop control characters it cannot represent
  // eslint-disable-next-line no-control-regex
  const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

  function xmlEscape(text) {
    return String(text)
      .replace(XML_INVALID_CHARS, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function xmlName(key) {
    let name = String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
    if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
    if (/^xml/i.test(name)) name = `_${name}`;
    return name;
  }

  function singular(name) {
    if (/ies$/.test(name) && name.length > 3) return `${name.slice(0, -3)}y`;
    if (/s$/.test(name) && name.length > 1 && !/ss$/.test(name)) return name.slice(0, -1);
    return 'item';
  }

  function xmlNode(name, value, indent) {
    const pad = '  '.repeat(indent);
    if (value === null || value === undefined) return `${pad}<${name}/>`;
    if (Array.isArray(value)) {
      if (!value.length) return `${pad}<${name}/>`;
      const child = singular(name);
      return `${pad}<${name}>\n${value.map(v => xmlNode(child, v, indent + 1)).join('\n')}\n${pad}</${name}>`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) return `${pad}<${name}/>`;
      return `${pad}<${name}>\n${entries.map(([k, v]) => xmlNode(xmlName(k), v, indent + 1)).join('\n')}\n${pad}</${name}>`;
    }
    return `${pad}<${name}>${xmlEscape(value)}</${name}>`;
  }

  function toXML(obj, rootName = 'webhook') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlNode(xmlName(rootName), obj, 0)}\n`;
  }

  /**
   * Split the payload into the page part and one entry per detection. The
   * detections are whatever top-level field holds ctx.detections (usually
   * "detections", from <DETECTIONS>); page fields are everything else.
   */
  function splitRows(obj, ctx) {
    const detections = Array.isArray(ctx.detections) ? ctx.detections : [];
    const marker = JSON.stringify(detections);
    const base = {};
    let rows = null;
    for (const [k, v] of Object.entries(obj)) {
      if (rows === null && Array.isArray(v) && JSON.stringify(v) === marker) rows = v;
      else base[k] = v;
    }
    return { base, rows: rows || [] };
  }

  function flattenColumns(value, prefix, out) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (!entries.length && prefix) out[prefix] = '';
      for (const [k, v] of entries) flattenColumns(v, prefix ? `${prefix}.${k}` : k, out);
      return out;
    }
    if (Array.isArray(value)) {
      out[prefix] = value.every(v => v === null || typeof v !== 'object')
        ? value.map(scalarText).join('; ')
        : JSON.stringify(value);
      return out;
    }
    out[prefix] = scalarText(value);
    return out;
  }

  function csvField(value) {
    const text = String(value);
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCSV(obj, ctx) {
    const { base, rows } = splitRows(obj, ctx);
    const baseCols = flattenColumns(base, '', {});
    const records = (rows.length ? rows : [null]).map(d => ({
      ...baseCols,
      ...(d === null ? {} : flattenColumns(d, 'detection', {}))
    }));
    const header = [];
    for (const r of records) for (const k of Object.keys(r)) if (!header.includes(k)) header.push(k);
    const lines = [header.map(csvField).join(',')];
    for (const r of records) lines.push(header.map(k => csvField(k in r ? r[k] : '')).join(','));
    return `${lines.join('\r\n')}\r\n`;
  }

  function toNDJSON(obj, ctx) {
    const { base, rows } = splitRows(obj, ctx);
    const lines = rows.length ? rows.map(d => JSON.stringify({ ...base, detection: d })) : [JSON.stringify(base)];
    return `${lines.join('\n')}\n`;
  }

  // ------------------------------------------------------------------- build
  /**
   * Build the request body and the Content-Type header for a webhook.
   * @param {string} contentType - saved webhookContentType
   * @param {string} template - saved webhookPayload
   * @param {object} ctx - substitution context
   * @param {object} [deps] - { FormData } for tests
   * @returns {{body: string|FormData, contentType: string|null, kind: string}}
   *   contentType null = let fetch set it (multipart boundary)
   */
  function build(contentType, template, ctx, deps = {}) {
    const type = resolveContentType(contentType);
    const text = String(template || '');
    switch (type.kind) {
      case 'text':
        return { kind: type.kind, contentType: type.header, body: text.trim() ? substitute(text, ctx, 'text') : JSON.stringify(defaultPayload(ctx)) };
      case 'form':
        return { kind: type.kind, contentType: type.header, body: toFormUrlEncoded(payloadObject(text, ctx)) };
      case 'multipart':
        return { kind: type.kind, contentType: null, body: toFormData(payloadObject(text, ctx), deps.FormData) };
      case 'xml':
        return { kind: type.kind, contentType: type.header, body: toXML(payloadObject(text, ctx)) };
      case 'csv':
        return { kind: type.kind, contentType: type.header, body: toCSV(payloadObject(text, ctx), ctx) };
      case 'ndjson':
        return { kind: type.kind, contentType: type.header, body: toNDJSON(payloadObject(text, ctx), ctx) };
      default: // json + custom
        return { kind: type.kind, contentType: type.header, body: text.trim() ? substitute(text, ctx, 'json') : JSON.stringify(defaultPayload(ctx)) };
    }
  }

  /** Does this saved Content-Type send the template as JSON (so it should parse)? */
  function expectsJsonTemplate(contentType) {
    return resolveContentType(contentType).kind !== 'text';
  }

  const api = Object.freeze({
    VARIABLES,
    SAMPLE_DETECTIONS,
    DEFAULT_TEMPLATE,
    CONTENT_TYPES,
    CUSTOM,
    isValidContentType,
    resolveContentType,
    sampleContext,
    substitute,
    defaultPayload,
    validateTemplate,
    payloadObject,
    flattenPairs,
    toFormUrlEncoded,
    toFormData,
    toXML,
    toCSV,
    toNDJSON,
    build,
    expectsJsonTemplate
  });

  root.WebhookBody = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));
