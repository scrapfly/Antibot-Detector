// "Scrape with Scrapfly": the current page as ready-to-run code for Scrapfly's
// Web Scraping API with the Unblocker on (its anti-bot bypass), in every
// language Scrapfly ships an SDK for. Nothing leaves the extension: the user
// copies the code and runs it with their own key in SCRAPFLY_API_KEY.
// Opened from Detection (header button) and from every protection's
// Advanced tools (BaseAdvancedModule adds the card).
//
// The snippets follow the published SDKs (checked 2026-10-07): PyPI and npm
// scrapfly-sdk 0.12.0, go-scrapfly v1.6.0, the scrapfly-sdk crate 0.5.1 and
// scrapfly-cli v0.4.0; the options were checked again on 2026-10-08.
// "unblocker" is the current name of the option; "asp" is its old alias and
// must not be sent as well.

const ScrapflyExport = {};

ScrapflyExport.API_URL = 'https://api.scrapfly.io/scrape';
ScrapflyExport.PLAYGROUND_URL = 'https://scrapfly.io/dashboard/playground/web-scraper';
ScrapflyExport.REGISTER_URL = 'https://scrapfly.io/register';
// Docs index written for AI tools, and the Unblocker page (checked 2026-10-08)
ScrapflyExport.AI_DOCS_URL = 'https://scrapfly.io/llms.txt';
ScrapflyExport.UNBLOCKER_DOCS_URL = 'https://scrapfly.io/docs/scrape-api/unblocker';
ScrapflyExport.LANGUAGE_STORAGE_KEY = 'scrapflyExportLanguage';
ScrapflyExport.OPTIONS_STORAGE_KEY = 'scrapflyExportOptions';
ScrapflyExport.MAX_NAMES = 4;

// Tab order. Labels are language and tool names, not translated. `file` is
// where the code goes and `run` the command that runs it ('' = paste it in a
// terminal as it is).
ScrapflyExport.LANGUAGES = [
  { id: 'python', label: 'Python', file: 'scrape.py', run: 'python scrape.py' },
  { id: 'node', label: 'Node.js', file: 'scrape.mjs', run: 'node scrape.mjs' },
  { id: 'curl', label: 'cURL', file: 'Terminal', run: '' },
  { id: 'cli', label: 'CLI', file: 'Terminal', run: '' },
  { id: 'go', label: 'Go', file: 'main.go', run: 'go mod init scrape && go mod tidy && go run .' },
  { id: 'rust', label: 'Rust', file: 'src/main.rs', run: 'cargo run' }
];

// Options that rewrite the code. The first value of each is the API default
// and adds nothing to the code; the Unblocker and JavaScript rendering are on
// unless the user turns them off.
ScrapflyExport.FORMATS = ['raw', 'markdown', 'text'];
ScrapflyExport.PROXY_POOLS = ['public_datacenter_pool', 'public_residential_pool'];
// ISO 3166-1 alpha-2, lower case as the API takes them; '' = any country
ScrapflyExport.COUNTRIES = ['', 'us', 'gb', 'ca', 'de', 'fr', 'es', 'it', 'nl', 'br', 'mx', 'jp', 'kr', 'in', 'au'];
ScrapflyExport.DEFAULT_OPTIONS = Object.freeze({ unblocker: true, format: 'raw', renderJs: true, proxyPool: 'public_datacenter_pool', country: '' });

/** Options with every unknown or missing value replaced by its default */
ScrapflyExport.normalizeOptions = function(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const pick = (list, v, fallback) => (list.includes(v) ? v : fallback);
  const d = ScrapflyExport.DEFAULT_OPTIONS;
  return {
    unblocker: value.unblocker !== false,
    format: pick(ScrapflyExport.FORMATS, value.format, d.format),
    renderJs: value.renderJs !== false,
    proxyPool: pick(ScrapflyExport.PROXY_POOLS, value.proxyPool, d.proxyPool),
    country: pick(ScrapflyExport.COUNTRIES, value.country, d.country)
  };
};

/** The page address to scrape, or '' when the tab is not a web page */
ScrapflyExport.targetUrl = function(raw) {
  try {
    const url = new URL(String(raw || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch (e) {
    return '';
  }
};

const scrapflyCategoryOf = (detection) => String(detection?.category || detection?.detector?.category || '');

/**
 * Logo of a detection, as the Detection and History cards show it: the
 * uploaded icon, the bundled one, or the Scrapfly logo.
 * @param {object} detection
 * @returns {string} URL, or '' outside the extension
 */
ScrapflyExport.iconUrl = function(detection) {
  const detector = detection?.detector || {};
  const custom = typeof detector.customIcon === 'string' ? detector.customIcon : '';
  if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i.test(custom)) return custom;
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return '';
  const icon = String(detector.icon || '');
  if (!icon || /^(?:default|custom(?:\.png)?)$/i.test(icon)) return chrome.runtime.getURL('icons/icon48.png');
  return chrome.runtime.getURL(`detectors/icons/${icon}`);
};

/**
 * Anti-bot and CAPTCHA protections, strongest first, one per name.
 * Fingerprinting techniques are left out: they are signals, not products
 * the Unblocker gets past.
 * @returns {Array<{name: string, iconUrl: string, kind: string}>}
 */
ScrapflyExport.protections = function(detections) {
  const list = (Array.isArray(detections) ? detections : []).filter(d => d && !/fingerprint/i.test(scrapflyCategoryOf(d)));
  const sorted = list.slice().sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  const found = [];
  for (const detection of sorted) {
    const name = String(detection.detector?.name || detection.name || '').trim();
    if (name && !found.some(p => p.name === name)) {
      found.push({ name, iconUrl: ScrapflyExport.iconUrl(detection), kind: /captcha/i.test(scrapflyCategoryOf(detection)) ? 'CAPTCHA' : 'anti-bot' });
    }
  }
  return found;
};

/** Protection names for the code comment */
ScrapflyExport.protectionNames = function(detections) {
  return ScrapflyExport.protections(detections).map(p => p.name);
};

ScrapflyExport.hasCaptcha = function(detections) {
  return (Array.isArray(detections) ? detections : []).some(d => /captcha/i.test(scrapflyCategoryOf(d)));
};

// String literals. JSON's escapes are valid in Python, JavaScript and Go
// strings; Rust needs \u{..}; the shell gets single quotes.
const scrapflyQuote = {
  json: (value) => JSON.stringify(String(value)),
  rust: (value) => `"${String(value)
    .replace(/[\\"]/g, c => `\\${c}`)
    .replace(/[\u0000-\u001f\u007f]/g, c => `\\u{${c.charCodeAt(0).toString(16)}}`)}"`,
  shell: (value) => `'${String(value).replace(/'/g, `'\\''`)}'`
};

/** "Detected: A, B, C, D and 2 more" as a comment line, or '' */
ScrapflyExport.detectedComment = function(names, prefix) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return '';
  const shown = list.slice(0, ScrapflyExport.MAX_NAMES).join(', ');
  const more = list.length > ScrapflyExport.MAX_NAMES ? ` and ${list.length - ScrapflyExport.MAX_NAMES} more` : '';
  // A name never ends the comment early: no line breaks inside it
  return `${prefix} Detected: ${shown}${more}`.replace(/[\r\n]+/g, ' ');
};

const scrapflyLines = (...lines) => lines.filter(line => line !== null).join('\n');

/**
 * Ready-to-run code for one language.
 * @param {string} language - id from ScrapflyExport.LANGUAGES
 * @param {string} url - http(s) page address (ScrapflyExport.targetUrl)
 * @param {string[]} [names] - detected protections, for a comment
 * @param {object} [options] - format, renderJs, proxyPool, country (defaults add nothing)
 * @returns {string}
 */
ScrapflyExport.snippet = function(language, url, names = [], options = {}) {
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
  const o = ScrapflyExport.normalizeOptions(options);
  const d = ScrapflyExport.DEFAULT_OPTIONS;
  const set = {
    unblocker: o.unblocker,
    renderJs: o.renderJs,
    proxyPool: o.proxyPool !== d.proxyPool ? o.proxyPool : '',
    country: o.country,
    format: o.format !== d.format ? o.format : ''
  };
  const residential = set.proxyPool === 'public_residential_pool';
  const goFormat = { markdown: 'FormatMarkdown', text: 'FormatText' };
  const rustFormat = { markdown: 'Markdown', text: 'Text' };
  const q = scrapflyQuote;
  switch (language) {
    case 'python':
      return scrapflyLines(
        '# pip install scrapfly-sdk',
        detected('#'),
        'import os',
        'from scrapfly import ScrapflyClient, ScrapeConfig',
        '',
        'client = ScrapflyClient(key=os.environ["SCRAPFLY_API_KEY"])',
        'result = client.scrape(ScrapeConfig(',
        `    url=${q.json(url)},`,
        set.unblocker ? '    unblocker=True,  # anti-bot bypass' : null,
        set.renderJs ? '    render_js=True,' : null,
        set.proxyPool ? `    proxy_pool=${q.json(set.proxyPool)},` : null,
        set.country ? `    country=${q.json(set.country)},` : null,
        set.format ? `    format=${q.json(set.format)},` : null,
        '))',
        'print(result.content)'
      );
    case 'node':
      return scrapflyLines(
        '// npm install scrapfly-sdk  (run as an ES module, e.g. scrape.mjs)',
        detected('//'),
        "import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';",
        '',
        'const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });',
        'const result = await client.scrape(new ScrapeConfig({',
        `  url: ${q.json(url)},`,
        set.unblocker ? '  unblocker: true, // anti-bot bypass' : null,
        set.renderJs ? '  render_js: true,' : null,
        set.proxyPool ? `  proxy_pool: ${q.json(set.proxyPool)},` : null,
        set.country ? `  country: ${q.json(set.country)},` : null,
        set.format ? `  format: ${q.json(set.format)},` : null,
        '}));',
        'console.log(result.result.content);'
      );
    case 'curl': {
      const args = [
        `curl -G ${ScrapflyExport.API_URL}`,
        '  --data-urlencode "key=$SCRAPFLY_API_KEY"',
        `  --data-urlencode ${q.shell(`url=${url}`)}`,
        set.unblocker ? '  -d unblocker=true' : null,
        set.renderJs ? '  -d render_js=true' : null,
        set.proxyPool ? `  -d proxy_pool=${set.proxyPool}` : null,
        set.country ? `  -d country=${set.country}` : null,
        set.format ? `  -d format=${set.format}` : null
      ].filter(Boolean);
      return scrapflyLines(detected('#'), args.join(' \\\n'));
    }
    case 'cli': {
      const flags = [
        set.unblocker ? '--unblocker' : null,
        set.renderJs ? '--render-js' : null,
        set.proxyPool ? `--proxy-pool ${set.proxyPool}` : null,
        set.country ? `--country ${set.country}` : null,
        set.format ? `--format ${set.format}` : null
      ].filter(Boolean);
      const command = flags.length <= 1
        ? [`scrapfly scrape ${q.shell(url)}`, ...flags].join(' ')
        : [`scrapfly scrape ${q.shell(url)}`, ...flags.map(f => `  ${f}`)].join(' \\\n');
      return scrapflyLines(
        '# https://github.com/scrapfly/scrapfly-cli/releases (reads SCRAPFLY_API_KEY)',
        detected('#'),
        command
      );
    }
    case 'go': {
      // gofmt lines the values up one space after the longest key
      const fields = [
        ['URL', q.json(url)],
        set.unblocker ? ['Unblocker', 'scrapfly.BoolPtr(true)', ' // anti-bot bypass'] : null,
        set.renderJs ? ['RenderJS', 'true'] : null,
        set.proxyPool ? ['ProxyPool', residential ? 'scrapfly.PublicResidentialPool' : 'scrapfly.PublicDataCenterPool'] : null,
        set.country ? ['Country', q.json(set.country)] : null,
        set.format ? ['Format', `scrapfly.${goFormat[set.format]}`] : null
      ].filter(Boolean);
      const width = Math.max(...fields.map(([key]) => key.length)) + 2;
      return scrapflyLines(
        '// go get github.com/scrapfly/go-scrapfly',
        detected('//'),
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"log"',
        '\t"os"',
        '',
        '\t"github.com/scrapfly/go-scrapfly"',
        ')',
        '',
        'func main() {',
        '\tclient, err := scrapfly.New(os.Getenv("SCRAPFLY_API_KEY"))',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tresult, err := client.Scrape(&scrapfly.ScrapeConfig{',
        ...fields.map(([key, value, comment = '']) => `\t\t${`${key}:`.padEnd(width)}${value},${comment}`),
        '\t})',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tfmt.Println(result.Result.Content)',
        '}'
      );
    }
    case 'rust': {
      const imports = ['Client', set.format ? 'Format' : null, set.proxyPool ? 'ProxyPool' : null, 'ScrapeConfig'].filter(Boolean);
      return scrapflyLines(
        '// cargo add scrapfly-sdk && cargo add tokio --features full',
        detected('//'),
        `use scrapfly_sdk::{${imports.join(', ')}};`,
        '',
        '#[tokio::main]',
        'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
        '    let client = Client::builder()',
        '        .api_key(std::env::var("SCRAPFLY_API_KEY")?)',
        '        .build()?;',
        `    let config = ScrapeConfig::builder(${q.rust(url)})`,
        set.unblocker ? '        .unblocker(true) // anti-bot bypass' : null,
        set.renderJs ? '        .render_js(true)' : null,
        set.proxyPool ? `        .proxy_pool(ProxyPool::${residential ? 'PublicResidentialPool' : 'PublicDatacenterPool'})` : null,
        set.country ? `        .country(${q.rust(set.country)})` : null,
        set.format ? `        .format(Format::${rustFormat[set.format]})` : null,
        '        .build()?;',
        '    let result = client.scrape(&config).await?;',
        '    println!("{}", result.result.content);',
        '    Ok(())',
        '}'
      );
    }
    default:
      return '';
  }
};

/**
 * Everything an AI assistant needs to help with this scrape, ready to paste:
 * the page, what protects it, the chosen settings, the code and the docs.
 * Written in English on purpose: it is read by a model, not shown in the UI.
 * @param {object} args
 * @param {string} args.language - id from ScrapflyExport.LANGUAGES
 * @param {string} args.url
 * @param {Array<{name: string, kind: string}>} [args.protections]
 * @param {object} [args.options]
 * @returns {string}
 */
ScrapflyExport.aiPrompt = function({ language, url, protections = [], options = {} }) {
  const lang = ScrapflyExport.LANGUAGES.find(l => l.id === language) || ScrapflyExport.LANGUAGES[0];
  const o = ScrapflyExport.normalizeOptions(options);
  const code = ScrapflyExport.snippet(lang.id, url, (protections || []).map(p => p.name), o);
  const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ');
  const found = (protections || []).map(p => `- ${oneLine(p.name)} (${p.kind || 'anti-bot'})`);
  const formats = { raw: 'raw HTML', markdown: 'Markdown', text: 'plain text' };
  const settings = [
    o.unblocker ? 'Unblocker on (Scrapfly\'s anti-bot bypass)' : 'Unblocker off',
    `output: ${formats[o.format]}`,
    o.proxyPool === 'public_residential_pool' ? 'residential proxies' : 'datacenter proxies',
    o.country ? `proxy country: ${o.country.toUpperCase()}` : 'any proxy country',
    o.renderJs ? 'JavaScript rendering on' : 'JavaScript rendering off'
  ];
  const fence = lang.id === 'curl' || lang.id === 'cli' ? 'bash' : (lang.id === 'node' ? 'javascript' : lang.id);
  const steps = [`1. Set the API key: ${ScrapflyExport.keyCommand('')}`];
  steps.push(lang.run ? `2. Save the code as ${lang.file} and run: ${lang.run}` : '2. Paste the code in a terminal.');
  return [
    'I want to scrape a web page with the Scrapfly Web Scraping API. Help me get this working and extend it.',
    '',
    `Page: ${oneLine(url)}`,
    found.length ? 'Protections detected on the page (by the Scrapfly Detector browser extension):' : 'No anti-bot or CAPTCHA protection was detected on the page.',
    ...found,
    `Settings: ${settings.join(', ')}.`,
    '',
    `Starter code (${lang.label}):`,
    '```' + fence,
    code,
    '```',
    '',
    'To run it:',
    ...steps,
    '',
    'Scrapfly docs for AI assistants: ' + ScrapflyExport.AI_DOCS_URL,
    'Unblocker docs: ' + ScrapflyExport.UNBLOCKER_DOCS_URL,
    'Never put the API key in the code: keep reading it from SCRAPFLY_API_KEY.'
  ].join('\n');
};

// Syntax colours: comments, strings, keywords and literals. The output is the
// code escaped, plus <span> wrappers only.
const SCRAPFLY_KEYWORDS = {
  python: ['import', 'from', 'as', 'def', 'return', 'print'],
  node: ['import', 'from', 'const', 'await', 'new', 'async', 'return'],
  go: ['package', 'import', 'func', 'if', 'return', 'var'],
  rust: ['use', 'async', 'fn', 'let', 'await', 'mut', 'pub'],
  curl: ['curl'],
  cli: ['scrapfly']
};
const SCRAPFLY_LITERALS = ['True', 'False', 'None', 'true', 'false', 'nil', 'Ok'];

/**
 * @param {string} code
 * @param {string} language - id from ScrapflyExport.LANGUAGES
 * @returns {string} HTML
 */
ScrapflyExport.highlight = function(code, language) {
  const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const comment = ['python', 'curl', 'cli'].includes(language) ? '#[^\n]*' : '//[^\n]*';
  const token = new RegExp(`(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')|(--?[a-z][a-z-]*)|([A-Za-z_][A-Za-z0-9_]*)|(\\d+)`, 'g');
  const keywords = SCRAPFLY_KEYWORDS[language] || [];
  const shell = language === 'curl' || language === 'cli';
  let html = '';
  let last = 0;
  const wrap = (cls, text) => `<span class="sfx-${cls}">${esc(text)}</span>`;
  for (const match of String(code).matchAll(token)) {
    const [text, isComment, isString, isFlag, word, number] = match;
    html += esc(code.slice(last, match.index));
    last = match.index + text.length;
    if (isComment) html += wrap('comment', text);
    else if (isString) html += wrap('string', text);
    else if (isFlag) html += shell ? wrap('flag', text) : esc(text);
    else if (word && keywords.includes(word)) html += wrap('keyword', text);
    else if (word && SCRAPFLY_LITERALS.includes(word)) html += wrap('literal', text);
    else if (number) html += wrap('literal', text);
    else html += esc(text);
  }
  return html + esc(String(code).slice(last));
};

/** Command that puts the key in SCRAPFLY_API_KEY for this session */
ScrapflyExport.keyCommand = function(platform) {
  return /win/i.test(String(platform || ''))
    ? '$env:SCRAPFLY_API_KEY="YOUR_API_KEY"'
    : 'export SCRAPFLY_API_KEY="YOUR_API_KEY"';
};

/** Options the user picked last time (kept in this browser only) */
ScrapflyExport.savedOptions = function() {
  try {
    return ScrapflyExport.normalizeOptions(JSON.parse(localStorage.getItem(ScrapflyExport.OPTIONS_STORAGE_KEY) || 'null'));
  } catch (e) {
    return ScrapflyExport.normalizeOptions(null);
  }
};

ScrapflyExport.saveOptions = function(options) {
  try {
    localStorage.setItem(ScrapflyExport.OPTIONS_STORAGE_KEY, JSON.stringify(ScrapflyExport.normalizeOptions(options)));
  } catch (e) {
    // storage unavailable
  }
};

/** Last language tab the user picked (kept in this browser only) */
ScrapflyExport.preferredLanguage = function() {
  try {
    const stored = localStorage.getItem(ScrapflyExport.LANGUAGE_STORAGE_KEY);
    if (ScrapflyExport.LANGUAGES.some(l => l.id === stored)) return stored;
  } catch (e) {
    // storage unavailable
  }
  return ScrapflyExport.LANGUAGES[0].id;
};

ScrapflyExport.rememberLanguage = function(id) {
  try {
    localStorage.setItem(ScrapflyExport.LANGUAGE_STORAGE_KEY, id);
  } catch (e) {
    // storage unavailable
  }
};

/** Scrapfly logo for the dialog header and the buttons that open it */
ScrapflyExport.logoHtml = function(className = 'scrapfly-export-logo') {
  const src = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('icons/icon48.png') : 'icons/icon48.png';
  return `<img class="${className}" src="${src}" alt="">`;
};

/**
 * Open the dialog: what was detected, the options, one tab per language over
 * a single code block that follows the options, the two commands to run it,
 * a CAPTCHA note when the page has one, and links to get a key and to the
 * playground.
 * @param {object} options
 * @param {string} options.url - the page address
 * @param {Array<object>} [options.detections] - what was detected on it
 * @returns {HTMLElement|null} the dialog overlay
 */
ScrapflyExport.open = function({ url, detections = [] } = {}) {
  const tr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
  const target = ScrapflyExport.targetUrl(url);
  if (!target) {
    NotificationHelper.warning(tr('scrapflyExportNoPage', 'Open a web page to scrape it with Scrapfly'));
    return null;
  }

  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const protections = ScrapflyExport.protections(detections);
  const selected = ScrapflyExport.preferredLanguage();
  const options = ScrapflyExport.savedOptions();
  const tabs = ScrapflyExport.LANGUAGES.map(({ id, label }) => {
    const on = id === selected;
    return `<button type="button" class="scrapfly-export-tab" role="tab" id="scrapflyExportTab-${id}" data-language="${id}"`
      + ` aria-controls="scrapflyExportPanel" aria-selected="${on}" tabindex="${on ? 0 : -1}">${esc(label)}</button>`;
  }).join('');
  const copyLabel = tr('advCommonCopy', 'Copy');
  const copyIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
  const aiIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
  const step = (n, label, cls) => `
      <div class="scrapfly-export-step ${cls}">
        <span class="scrapfly-export-step-n">${n}</span>
        <span class="scrapfly-export-step-label">${esc(label)}</span>
        <button type="button" class="scrapfly-export-step-cmd" data-copy="" data-copy-message="${attr(tr('advPanelCopiedToClipboard', 'Copied to clipboard'))}" title="${attr(tr('advCommonClickToCopy', 'Click to copy'))}">
          <code></code>${copyIcon}
        </button>
      </div>`;
  const captchaNote = ScrapflyExport.hasCaptcha(detections)
    ? BaseAdvancedModule.kitNote(tr('scrapflyExportCaptchaNote',
      "This page has a CAPTCHA: the Unblocker avoids or solves it to return the page, but it doesn't fill in CAPTCHAs on forms."), 'warning')
    : '';
  const body = `
    <p class="scrapfly-export-intro">${esc(tr('scrapflyExportIntro',
      "Fetch this page through Scrapfly's API with the Unblocker on. It picks the browser, proxies and headers by itself, and costs nothing extra when the site doesn't block."))}</p>
    ${ScrapflyExport.detectedRow(protections, tr('scrapflyExportDetected', 'Detected on this page'))}
    ${ScrapflyExport.optionsHtml(options, tr)}
    <div class="scrapfly-export-code">
      <div class="scrapfly-export-tabs" role="tablist" aria-label="${attr(tr('scrapflyExportLanguages', 'Code language'))}">${tabs}</div>
      <div class="scrapfly-export-panel" role="tabpanel" id="scrapflyExportPanel" aria-labelledby="scrapflyExportTab-${selected}">
        <div class="scrapfly-export-code-head">
          <span class="scrapfly-export-file"></span>
          <span class="scrapfly-export-copy-group">
            <button type="button" class="scrapfly-export-copy-ai" data-copy="" data-copy-message="${attr(tr('scrapflyExportAiCopied', 'Copied: paste it into your AI assistant'))}" title="${attr(tr('scrapflyExportCopyAiTitle', 'Copies the page, what protects it, your settings and the code as one message for ChatGPT, Claude or any AI assistant'))}">${aiIcon}<span>${esc(tr('scrapflyExportCopyAi', 'Copy for AI'))}</span></button>
            <button type="button" class="scrapfly-export-copy" data-copy="">${copyIcon}<span>${esc(copyLabel)}</span></button>
          </span>
        </div>
        <pre class="scrapfly-export-pre" tabindex="0"><code></code></pre>
      </div>
    </div>
    <div class="scrapfly-export-steps">
      ${step(1, tr('scrapflyExportStepKey', 'Set your API key'), 'is-key')}
      ${step(2, tr('scrapflyExportStepRun', 'Run it'), 'is-run')}
    </div>
    ${captchaNote}
    <div class="scrapfly-export-actions">
      <a class="rule-btn rule-btn-cancel" href="${attr(ScrapflyExport.REGISTER_URL)}" target="_blank" rel="noopener noreferrer">${esc(tr('scrapflyExportGetKey', 'Get an API key'))}</a>
      <a class="rule-btn rule-btn-save" href="${attr(ScrapflyExport.PLAYGROUND_URL)}" target="_blank" rel="noopener noreferrer">${esc(tr('scrapflyExportPlayground', 'Open playground'))}</a>
    </div>`;

  let host = target;
  try {
    host = new URL(target).hostname;
  } catch (e) {
    // keep the address
  }
  const overlay = BaseAdvancedModule.prototype.openKitModal.call(BaseAdvancedModule.prototype, {
    title: tr('scrapflyExportTitle', 'Scrape with Scrapfly'),
    subtitle: host,
    iconSvg: ScrapflyExport.logoHtml(),
    body,
    copiedMessage: tr('scrapflyExportCopied', 'Code copied'),
    record: false
  });
  overlay.querySelector('.adv-kit-modal').classList.add('scrapfly-export-modal');

  const state = { language: selected, options };
  const platform = (typeof navigator !== 'undefined') ? (navigator.userAgentData?.platform || navigator.platform || '') : '';
  const render = () => {
    const language = ScrapflyExport.LANGUAGES.find(l => l.id === state.language) || ScrapflyExport.LANGUAGES[0];
    const code = ScrapflyExport.snippet(language.id, target, protections.map(p => p.name), state.options);
    overlay.querySelector('.scrapfly-export-pre code').innerHTML = ScrapflyExport.highlight(code, language.id);
    overlay.querySelector('.scrapfly-export-copy').setAttribute('data-copy', code);
    overlay.querySelector('.scrapfly-export-copy-ai').setAttribute('data-copy',
      ScrapflyExport.aiPrompt({ language: language.id, url: target, protections, options: state.options }));
    overlay.querySelector('.scrapfly-export-file').textContent = language.file;
    overlay.querySelector('.scrapfly-export-panel').setAttribute('aria-labelledby', `scrapflyExportTab-${language.id}`);
    const setCmd = (selector, command) => {
      const row = overlay.querySelector(selector);
      row.hidden = !command;
      row.querySelector('.scrapfly-export-step-cmd').setAttribute('data-copy', command);
      row.querySelector('code').textContent = command;
    };
    setCmd('.scrapfly-export-step.is-key', ScrapflyExport.keyCommand(platform));
    setCmd('.scrapfly-export-step.is-run', language.run);
    // Without a run command the code is the command: number only the key step
    overlay.querySelector('.scrapfly-export-steps').classList.toggle('is-single', !language.run);
  };
  ScrapflyExport.bindTabs(overlay, (id) => {
    state.language = id;
    render();
  });
  ScrapflyExport.bindOptions(overlay, (next) => {
    state.options = next;
    ScrapflyExport.saveOptions(next);
    render();
  });
  render();
  return overlay;
};

/** Localized country name, or the code when the browser has no names */
const scrapflyCountryName = (code) => {
  try {
    const locale = (typeof FormatUtils !== 'undefined' && FormatUtils.uiLocale && FormatUtils.uiLocale()) || undefined;
    return new Intl.DisplayNames(locale ? [locale] : [], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase();
  } catch (e) {
    return code.toUpperCase();
  }
};

/** The options card: output format, proxies, country and JavaScript rendering */
ScrapflyExport.optionsHtml = function(options, tr) {
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const o = ScrapflyExport.normalizeOptions(options);
  const segmented = (name, label, choices) => `
      <div class="scrapfly-export-option">
        <span class="scrapfly-export-option-label" id="scrapflyExportOpt-${name}">${esc(label)}</span>
        <div class="scrapfly-export-seg" role="radiogroup" aria-labelledby="scrapflyExportOpt-${name}" data-option="${name}">
          ${choices.map(([value, text]) => `<button type="button" role="radio" class="scrapfly-export-seg-btn" data-value="${attr(value)}" aria-checked="${o[name] === value}" tabindex="${o[name] === value ? 0 : -1}">${esc(text)}</button>`).join('')}
        </div>
      </div>`;
  const toggle = (name, label, hint) => `
      <div class="scrapfly-export-option">
        <label class="scrapfly-export-option-label" for="scrapflyExportOpt-${name}">${esc(label)}</label>
        <span class="scrapfly-export-toggle-wrap">
          ${hint ? `<span class="scrapfly-export-cost">${esc(hint)}</span>` : ''}
          <input type="checkbox" role="switch" class="scrapfly-export-switch" id="scrapflyExportOpt-${name}" data-option="${name}"${o[name] ? ' checked' : ''}>
        </span>
      </div>`;
  const countryLabel = (code) => (code ? scrapflyCountryName(code) : tr('scrapflyExportCountryAny', 'Any'));
  const countries = ScrapflyExport.COUNTRIES.map(code => (
    `<li role="option" class="scrapfly-export-dd-item" id="scrapflyExportCountry-${code || 'any'}" data-value="${attr(code)}" aria-selected="${o.country === code}">${esc(countryLabel(code))}</li>`
  )).join('');
  return `
    <section class="scrapfly-export-options" aria-label="${attr(tr('scrapflyExportOptions', 'Options'))}">
      <span class="scrapfly-export-detected-label">${esc(tr('scrapflyExportOptions', 'Options'))}</span>
      ${toggle('unblocker', tr('scrapflyExportUnblocker', 'Unblocker'), tr('scrapflyExportUnblockerHint', 'Anti-bot bypass'))}
      ${segmented('format', tr('scrapflyExportFormat', 'Output'), [['raw', 'HTML'], ['markdown', 'Markdown'], ['text', tr('scrapflyExportFormatText', 'Text')]])}
      ${segmented('proxyPool', tr('scrapflyExportProxy', 'Proxies'), [['public_datacenter_pool', tr('scrapflyExportProxyDatacenter', 'Datacenter')], ['public_residential_pool', tr('scrapflyExportProxyResidential', 'Residential')]])}
      <div class="scrapfly-export-option">
        <span class="scrapfly-export-option-label" id="scrapflyExportCountryLabel">${esc(tr('scrapflyExportCountry', 'Country'))}</span>
        <div class="scrapfly-export-dd" data-option="country" data-value="${attr(o.country)}">
          <button type="button" class="scrapfly-export-dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="scrapflyExportCountryLabel scrapflyExportCountryValue">
            <span id="scrapflyExportCountryValue">${esc(countryLabel(o.country))}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <ul class="scrapfly-export-dd-list" role="listbox" tabindex="-1" aria-labelledby="scrapflyExportCountryLabel" hidden>${countries}</ul>
        </div>
      </div>
      ${toggle('renderJs', tr('scrapflyExportRenderJs', 'Render JavaScript'), tr('scrapflyExportRenderJsCost', '+5 credits'))}
    </section>`;
};

/** Options change the code at once; `onChange` gets the full option set */
ScrapflyExport.bindOptions = function(root, onChange) {
  const read = () => {
    const value = {};
    root.querySelectorAll('.scrapfly-export-seg').forEach(group => {
      const on = group.querySelector('[aria-checked="true"]');
      value[group.dataset.option] = on ? on.dataset.value : '';
    });
    value.country = root.querySelector('[data-option="country"]').dataset.value;
    value.unblocker = root.querySelector('[data-option="unblocker"]').checked;
    value.renderJs = root.querySelector('[data-option="renderJs"]').checked;
    return ScrapflyExport.normalizeOptions(value);
  };
  root.querySelectorAll('.scrapfly-export-seg').forEach(group => {
    const buttons = Array.from(group.querySelectorAll('.scrapfly-export-seg-btn'));
    const choose = (button, focus) => {
      for (const b of buttons) {
        b.setAttribute('aria-checked', String(b === button));
        b.tabIndex = b === button ? 0 : -1;
      }
      if (focus) button.focus();
      onChange(read());
    };
    const forward = getComputedStyle(root).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => choose(button, false));
      button.addEventListener('keydown', (event) => {
        const stepKey = event.key === forward || event.key === 'ArrowDown' ? 1
          : (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp') ? -1 : 0;
        if (!stepKey) return;
        event.preventDefault();
        choose(buttons[(index + stepKey + buttons.length) % buttons.length], true);
      });
    });
  });
  ScrapflyExport.bindDropdown(root.querySelector('.scrapfly-export-dd'), () => onChange(read()));
  for (const name of ['unblocker', 'renderJs']) {
    root.querySelector(`[data-option="${name}"]`).addEventListener('change', () => onChange(read()));
  }
};

/**
 * The country list: a button that opens a styled listbox (a native <select>
 * opens the system list, white and with a wide scrollbar). Arrow keys, Home,
 * End, Enter and Escape work as in a select; Escape closes only the list.
 */
ScrapflyExport.bindDropdown = function(dd, onChange) {
  const button = dd.querySelector('.scrapfly-export-dd-btn');
  const list = dd.querySelector('.scrapfly-export-dd-list');
  const items = Array.from(list.querySelectorAll('[role="option"]'));
  let active = -1;
  const setActive = (index) => {
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    list.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  };
  const onOutside = (event) => { if (!dd.contains(event.target)) close(false); };
  const onKey = (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      close(event.key === 'Escape');
    }
  };
  const open = () => {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    // Fixed position so the dialog's scroll area never cuts the list off
    const rect = button.getBoundingClientRect();
    const height = list.offsetHeight;
    const below = window.innerHeight - rect.bottom - 8;
    list.style.minWidth = `${rect.width}px`;
    list.style.top = `${below >= height || below >= rect.top ? rect.bottom + 4 : rect.top - 4 - height}px`;
    list.style.left = `${Math.max(8, Math.min(rect.right - list.offsetWidth, window.innerWidth - list.offsetWidth - 8))}px`;
    setActive(Math.max(0, items.findIndex(i => i.getAttribute('aria-selected') === 'true')));
    list.focus();
    // Window capture runs before the dialog's own Escape handler on document
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    dd.closest('.adv-kit-body')?.addEventListener('scroll', closeOnScroll, { once: true });
  };
  const closeOnScroll = () => close(false);
  const close = (focusButton) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    dd.closest('.adv-kit-body')?.removeEventListener('scroll', closeOnScroll);
    if (focusButton) button.focus();
  };
  const choose = (item) => {
    for (const other of items) other.setAttribute('aria-selected', String(other === item));
    dd.dataset.value = item.dataset.value;
    button.querySelector('span').textContent = item.textContent;
    close(true);
    onChange();
  };
  button.addEventListener('click', () => (list.hidden ? open() : close(true)));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  items.forEach((item, index) => {
    item.addEventListener('click', () => choose(item));
    item.addEventListener('mousemove', () => { if (active !== index) setActive(index); });
  });
  list.addEventListener('keydown', (event) => {
    const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: items.length - 1, PageDown: active + 6, PageUp: active - 6 };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(items[active]);
    }
  });
};

/** Each detected protection with its logo, like the History cards (max 6 + "+N") */
ScrapflyExport.detectedRow = function(protections, label) {
  if (!Array.isArray(protections) || protections.length === 0) return '';
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const shown = protections.slice(0, 6).map(({ name, iconUrl }) => (
    `<span class="scrapfly-export-chip">${iconUrl ? `<img src="${attr(iconUrl)}" alt="">` : ''}<span>${esc(name)}</span></span>`
  )).join('');
  const more = protections.length > 6 ? `<span class="scrapfly-export-chip scrapfly-export-chip--more">+${protections.length - 6}</span>` : '';
  return `<div class="scrapfly-export-detected"><span class="scrapfly-export-detected-label">${esc(label)}</span>`
    + `<div class="scrapfly-export-chips">${shown}${more}</div></div>`;
};

/** Tabs: click or arrow keys switch the language; the choice is remembered */
ScrapflyExport.bindTabs = function(root, onSelect) {
  const tabs = Array.from(root.querySelectorAll('.scrapfly-export-tab'));
  const select = (tab, focus) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
    }
    if (focus) tab.focus();
    ScrapflyExport.rememberLanguage(tab.dataset.language);
    if (onSelect) onSelect(tab.dataset.language);
  };
  // In a right-to-left language the next tab is on the left
  const forward = getComputedStyle(root).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (event) => {
      const step = event.key === forward ? 1 : (event.key === 'ArrowLeft' || event.key === 'ArrowRight') ? -1 : 0;
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        select(tabs[event.key === 'Home' ? 0 : tabs.length - 1], true);
      } else if (step) {
        event.preventDefault();
        select(tabs[(index + step + tabs.length) % tabs.length], true);
      }
    });
  });
};

if (typeof window !== 'undefined') {
  window.ScrapflyExport = ScrapflyExport;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScrapflyExport;
}
