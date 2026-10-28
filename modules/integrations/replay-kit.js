// Replay kit: the current page as a curl command or a Python (requests)
// script that asks for it again the way this browser did, with its own
// User-Agent, Accept-Language and client hints and the page's cookies
// (HttpOnly ones too: the extension can read them). Copied from the Detection
// tab's copy menu; nothing leaves the extension.
//
// Pure functions, so node tests run them as they are. Loads after
// modules/integrations/scrapfly/codegen.js: the quoting (scrapflyQuote) and
// the "Detected:" comment line are the ones the Scrapfly code uses.
(function(root) {
  'use strict';

  const quote = (typeof scrapflyQuote !== 'undefined') ? scrapflyQuote : null;
  const exporter = (typeof ScrapflyExport !== 'undefined') ? ScrapflyExport : null;

  const NOTE = 'Note: protection cookies are tied to this browser session and expire, and a plain HTTP client does not reproduce the browser\'s TLS/HTTP2 fingerprint.';

  // Text for a comment line: a value can never end the comment early
  const oneLine = (value) => String(value == null ? '' : value).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();

  /** Accept-Language as Chrome builds it from navigator.languages: "en-US,en;q=0.9,es;q=0.8" */
  function acceptLanguage(languages) {
    const list = (Array.isArray(languages) ? languages : []).map(l => String(l || '').trim()).filter(Boolean);
    return list.map((lang, i) => {
      if (i === 0) return lang;
      const q = Math.max(0.1, 1 - i / 10);
      return `${lang};q=${q.toFixed(1)}`;
    }).join(',');
  }

  /** The low-entropy client hints a Chromium browser sends, from navigator.userAgentData; {} elsewhere */
  function clientHints(uaData) {
    if (!uaData || !Array.isArray(uaData.brands) || uaData.brands.length === 0) return {};
    const brands = uaData.brands
      .filter(b => b && b.brand)
      .map(b => `"${String(b.brand).replace(/["\\]/g, '')}";v="${String(b.version || '').replace(/["\\]/g, '')}"`)
      .join(', ');
    const hints = { 'sec-ch-ua': brands, 'sec-ch-ua-mobile': uaData.mobile ? '?1' : '?0' };
    if (uaData.platform) hints['sec-ch-ua-platform'] = `"${String(uaData.platform).replace(/["\\]/g, '')}"`;
    return hints;
  }

  /**
   * The browser's own request headers, in the order Chrome sends them.
   * @param {{ userAgent?: string, languages?: string[], userAgentData?: object }} nav - navigator, or its fields
   * @returns {Array<[string, string]>}
   */
  function browserHeaders(nav) {
    const n = nav || {};
    const headers = [];
    const hints = clientHints(n.userAgentData);
    for (const name of ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']) {
      if (hints[name]) headers.push([name, hints[name]]);
    }
    if (n.userAgent) headers.push(['User-Agent', String(n.userAgent)]);
    const lang = acceptLanguage(n.languages);
    if (lang) headers.push(['Accept-Language', lang]);
    return headers;
  }

  /** Cookie name → protection names, from the detections' cookie evidence */
  function protectionCookies(detections) {
    const owners = new Map();
    for (const d of Array.isArray(detections) ? detections : []) {
      const owner = oneLine(d && (d.detector?.name || d.name));
      for (const m of Array.isArray(d && d.matches) ? d.matches : []) {
        if (!m || m.type !== 'cookie') continue;
        const name = m.name || (typeof m.value === 'string' ? m.value.split('=')[0] : '');
        if (!name) continue;
        const list = owners.get(name) || [];
        if (owner && !list.includes(owner)) list.push(owner);
        owners.set(name, list);
      }
    }
    return owners;
  }

  // Valid http(s) address without its fragment (never sent), or ''
  function pageUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      return url.href;
    } catch (e) {
      return '';
    }
  }

  /**
   * What both snippets are made of.
   * @param {{ url: string, cookies?: Array<{name: string, value: string}>, headers?: Array<[string, string]>, detections?: object[] }} input
   */
  function prepare(input) {
    const i = input || {};
    const url = pageUrl(i.url);
    const seen = new Set();
    // A name the browser holds twice (two paths) is sent first as the more specific one: keep that one
    const cookies = (Array.isArray(i.cookies) ? i.cookies : [])
      .filter(c => c && c.name && !seen.has(c.name) && seen.add(c.name))
      .map(c => ({ name: String(c.name), value: String(c.value == null ? '' : c.value) }));
    const owners = protectionCookies(i.detections);
    const names = exporter && exporter.protectionNames ? exporter.protectionNames(i.detections) : [];
    const marked = cookies.filter(c => owners.has(c.name))
      .map(c => (owners.get(c.name).length ? `${oneLine(c.name)} (${owners.get(c.name).join(', ')})` : oneLine(c.name)));
    return { url, cookies, owners, names, marked, headers: Array.isArray(i.headers) ? i.headers : [] };
  }

  function header(p, prefix) {
    const detected = exporter && exporter.detectedComment ? exporter.detectedComment(p.names, prefix) : '';
    return [
      `${prefix} Replays ${oneLine(p.url)} with this browser's headers and cookies`,
      detected || null,
      `${prefix} ${NOTE}`,
      p.marked.length ? `${prefix} Protection cookies: ${p.marked.join(', ')}` : null
    ].filter(line => line !== null);
  }

  /** A curl command for bash/zsh; '' without a web page */
  function curl(input) {
    const p = prepare(input);
    if (!p.url || !quote) return '';
    const q = quote.shell;
    // -g: [ ] and { } in an address (filter[brand]=x) are characters, not curl's URL patterns
    const args = [q(p.url)];
    for (const [name, value] of p.headers) args.push(`-H ${q(`${name}: ${value}`)}`);
    if (p.cookies.length) args.push(`-b ${q(p.cookies.map(c => `${c.name}=${c.value}`).join('; '))}`);
    return [...header(p, '#'), `curl -g ${args.join(' \\\n  ')}`].join('\n') + '\n';
  }

  /** A Python script using requests; '' without a web page */
  function python(input) {
    const p = prepare(input);
    if (!p.url || !quote) return '';
    const q = quote.json;
    const lines = [...header(p, '#'), 'import requests', '', `url = ${q(p.url)}`, 'headers = {'];
    for (const [name, value] of p.headers) lines.push(`    ${q(name)}: ${q(value)},`);
    lines.push('}');
    if (p.cookies.length) {
      lines.push('cookies = {');
      for (const c of p.cookies) {
        const owners = p.owners.get(c.name);
        const note = owners ? `  # ${owners.length ? owners.join(', ') : 'protection'}` : '';
        lines.push(`    ${q(c.name)}: ${q(c.value)},${note}`);
      }
      lines.push('}');
    }
    lines.push('', `response = requests.get(url, headers=headers${p.cookies.length ? ', cookies=cookies' : ''}, timeout=30)`,
      'print(response.status_code)', 'print(response.text[:500])');
    return lines.join('\n') + '\n';
  }

  root.ReplayKit = Object.freeze({ NOTE, acceptLanguage, clientHints, browserHeaders, protectionCookies, pageUrl, curl, python });
})(typeof window !== 'undefined' ? window : globalThis);
