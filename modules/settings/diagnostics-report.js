/**
 * Settings → Data → Copy diagnostics: the text people paste into a bug report. Pure (no browser APIs): the page gathers
 * the facts and this module writes them down. It leaves out everything private (sites, addresses, History content and
 * every secret: only counts, switches and names of options) and it cleans the log lines it quotes.
 *
 *   build(env, settings)   the report, as plain English text (it is for whoever reads the bug report, so it is not translated)
 *   redact(line)           a log line without addresses, e-mail addresses, sites or anything that looks like a key
 *   browserOf(...)         "Brave 1.84 (Chromium 142) on Windows" from the user agent
 *
 * env: { version, now, userAgent, brands, isBrave, uiLanguage, languageOverride, detectors: {total, official, custom, edited,
 *        byCategory, lastCheckAt}, history: {entries, bytes}, storage: {used, quota, parts}, workerCurrent,
 *        logs: {enabled, errors: [{timestamp, message}]} }
 */
(function(root) {
  'use strict';

  const MAX_ERRORS = 10;
  const MAX_LINE = 220;

  // The last label of a site name: the common generic ones, the reserved test ones and any two-letter country code.
  // A file name (.js, .json, .css, .html) or an API call (chrome.storage.local.get) does not end in one
  const TLDS = 'com|net|org|io|dev|app|co|ai|me|tv|info|biz|xyz|online|site|shop|store|cloud|tech|pro|top|club|link|live|news|page|click|example|test|invalid|localhost'
    + '|(?!(?:js|ts|md|py|sh|go|rs)\\b)[a-z]{2}';
  const PATTERNS = [
    [/\b(?:https?|wss?|ftp|file|data|blob|chrome-extension|moz-extension|chrome):\/\/?[^\s"'<>)\]]*/gi, '<url>'],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>'],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer <token>'],
    [new RegExp(`\\b(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?![\\w/-])`, 'gi'), '<site>'],
    [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>'],
    [/\b[A-Za-z0-9_-]{24,}\b/g, '<token>'],
    // Any other lowercase dotted name is a site too (shop.games, mybank.travel, bank.museum: new endings keep coming),
    // except code and files: an API chain (chrome.storage.local.get) or a file name (history-store.js)
    [/(?<![\w.])(?!(?:chrome|browser|self|window|document|this|globalthis|navigator|location|console|math|json|object|array|promise)\.)(?:[a-z0-9-]+\.)+[a-z]{2,24}\b(?![\w(/-])(?<!\.(?:js|mjs|json|css|html|png|svg|md|txt|ts|map|woff2))/g, '<site>'],
    // The value of any name=value pair (a cookie, a query parameter, a key): short tokens are secrets too
    [/\b([A-Za-z_][\w.-]{0,40})=(?!<)[^\s&;,"'<>)\]]+/g, '$1=<value>']
  ];

  function redact(line) {
    let text = String(line == null ? '' : line).replace(/\s+/g, ' ').trim();
    for (const [pattern, replacement] of PATTERNS) text = text.replace(pattern, replacement);
    return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text;
  }

  const count = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);
  const onOff = (value) => (value ? 'on' : 'off');
  const sizeOf = (bytes) => {
    const n = count(bytes);
    return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  };
  const stamp = (time) => (Number.isFinite(Number(time)) && Number(time) > 0 ? new Date(Number(time)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never');

  /** "Brave 1.84 (Chromium 142) on Windows": the browser from the user agent, the brand list and Brave's own flag. */
  function browserOf(userAgent, brands, isBrave) {
    const ua = String(userAgent || '');
    const chromium = (ua.match(/Chrome\/(\d+)/) || [])[1];
    let name = 'Chromium-based browser';
    let version = chromium;
    const list = Array.isArray(brands) ? brands.map(brand => ({ brand: String(brand && brand.brand || ''), version: String(brand && brand.version || '') })) : [];
    const named = list.find(entry => /^(Microsoft Edge|Opera|Vivaldi|Brave|Google Chrome|Arc|Yandex)/i.test(entry.brand));
    if (isBrave === true) { name = 'Brave'; version = (list.find(entry => /Brave/i.test(entry.brand)) || {}).version || chromium; }
    else if (named) { name = named.brand; version = named.version; }
    else if (/Edg\//.test(ua)) { name = 'Microsoft Edge'; version = (ua.match(/Edg\/(\d+)/) || [])[1]; }
    else if (/OPR\//.test(ua)) { name = 'Opera'; version = (ua.match(/OPR\/(\d+)/) || [])[1]; }
    else if (chromium) { name = 'Chrome'; version = chromium; }
    const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Android/i.test(ua) ? 'Android' : /Linux/i.test(ua) ? 'Linux' : 'an unknown system';
    const engine = chromium && name !== 'Chrome' ? ` (Chromium ${chromium})` : '';
    return `${name}${version ? ` ${version}` : ''}${engine} on ${os}`;
  }

  function build(env = {}, settings = {}) {
    const e = env || {};
    const s = settings && typeof settings === 'object' ? settings : {};
    const detection = s.detection || {};
    const history = s.history || {};
    const lines = [];
    const add = (text = '') => lines.push(text);

    add(`Scrapfly Antibot Detector ${String(e.version || 'unknown')} diagnostics`);
    add(`Generated: ${stamp(e.now || Date.now())}`);
    add();
    add(`Browser: ${browserOf(e.userAgent, e.brands, e.isBrave)}`);
    add(`Language: ${String(e.languageOverride && e.languageOverride !== 'auto' ? `${e.languageOverride} (chosen in Settings)` : `${e.uiLanguage || 'en'} (browser)`)}`);
    add();

    const d = e.detectors || {};
    const parts = Object.entries(d.byCategory || {}).filter(([, n]) => count(n) > 0).map(([key, n]) => `${count(n)} ${key}`);
    add(`Detectors: ${count(d.total)} in total${parts.length ? ` (${parts.join(', ')})` : ''}; ${count(d.custom)} custom, ${count(d.edited)} edited`);
    add(`Rules last checked: ${stamp(d.lastCheckAt)}${s.updates ? `; automatic updates ${onOff(s.updates.autoUpdate)}` : ''}`);
    // The rule set's versions: the bundled index and the official rules, newest first (counts only, never names)
    const versions = Object.entries(d.versions || {}).filter(([, n]) => count(n) > 0)
      // numbered versions newest first, then anything else ("unversioned")
      .sort((a, b) => (/^\d/.test(b[0]) - /^\d/.test(a[0])) || b[0].localeCompare(a[0], undefined, { numeric: true })).map(([version, n]) => `${version} ×${count(n)}`);
    const waiting = [d.incompatible ? `${count(d.incompatible)} waiting for a newer extension` : '', d.pending ? `${count(d.pending)} pending` : '', d.failed ? `${count(d.failed)} failed` : ''].filter(Boolean);
    if (d.indexVersion || versions.length || waiting.length) {
      add(`Rule set: ${d.indexVersion ? `index ${String(d.indexVersion)}` : 'index unknown'}${versions.length ? `; official rules ${versions.join(', ')}` : ''}${waiting.length ? `; updates: ${waiting.join(', ')}` : ''}`);
    }
    add();

    add('Settings');
    add(`- Debug mode ${onOff(s.debugMode)}, verbose ${onOff(s.debugVerbose)}; log collector ${onOff(s.logCollectorEnabled)}`);
    // Whether a signing secret is set (yes or no only: never any part of it)
    const webhookOn = !!(s.webhook && s.webhook.enableWebhook);
    const signed = webhookOn && typeof s.webhook.webhookSecret === 'string' && s.webhook.webhookSecret.trim() !== '';
    add(`- Notifications ${onOff(s.notificationsEnabled)}; JS API ${onOff(s.jsApi && s.jsApi.enableJsApi)}; webhook ${onOff(webhookOn)}${signed ? ', signing secret set' : ''}`);
    add(`- Cache: ${detection.cacheDuration == null ? 'default' : `${count(detection.cacheDuration)} ${String(detection.cacheUnit || 'days')}`}, ${String(detection.cacheScope || 'domain')} scope`);
    const listed = (key) => (Array.isArray(detection[key]) ? detection[key].length : 0);
    add(`- Sites: ${detection.scanMode === 'allowlist' ? `only ${listed('allowedDomains')} chosen` : `${listed('blacklistedDomains')} skipped`}; JS hooks off on ${listed('hooksOffDomains')}`);
    add(`- History: ${onOff(history.historyEnabled !== false)}, limit ${count(history.historyLimit)} entries, up to ${count(history.historyMaxMB) || 6} MB, backup ${String(history.historyBackup || 'off')}, clear on close ${onOff(history.historyClearOnClose)}`);
    add(`- Detection sort: ${String(detection.sortBy || 'category')}; tools need ${count(detection.advancedToolsMinConfidence)}% confidence`);
    add();

    const st = e.storage || {};
    const hs = e.history || {};
    add(`Storage: ${st.unlimited === true ? `${sizeOf(st.used)} used (unlimited storage allowed)` : `${sizeOf(st.used)} of ${sizeOf(st.quota || 10485760)}`}${hs.entries != null ? `; History ${count(hs.entries)} entries, ${sizeOf(hs.bytes)}` : ''}`);
    add(`Background part: ${e.workerCurrent === true ? 'up to date' : e.workerCurrent === false ? 'OUT OF DATE (reload the extension)' : 'unknown'}`);
    add();

    const logs = e.logs || {};
    if (!logs.enabled && !(Array.isArray(logs.errors) && logs.errors.length)) {
      add('Recent errors: log collector is off, so none were collected');
    } else {
      const errors = (Array.isArray(logs.errors) ? logs.errors : []).slice(-MAX_ERRORS);
      add(`Recent errors (${errors.length}, newest last; addresses, sites and keys removed):`);
      if (!errors.length) add('- none');
      for (const entry of errors) add(`- ${stamp(entry && entry.timestamp)}  ${redact(entry && entry.message)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  const api = { MAX_ERRORS, redact, browserOf, build };
  root.DiagnosticsReport = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.DiagnosticsReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
