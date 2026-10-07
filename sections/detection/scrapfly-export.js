// "Scrape with Scrapfly": the current page as ready-to-run code for Scrapfly's
// Web Scraping API with the Unblocker on (its anti-bot bypass), in every
// language Scrapfly ships an SDK for. Nothing leaves the extension: the user
// copies the code and runs it with their own key in SCRAPFLY_API_KEY.
// Opened from Detection (header button) and from every protection's
// Advanced tools (BaseAdvancedModule adds the card).
//
// The snippets follow the published SDKs (checked 2026-10-07): PyPI and npm
// scrapfly-sdk 0.12.0, go-scrapfly v1.6.0, the scrapfly-sdk crate 0.5.1 and
// scrapfly-cli v0.4.0. "unblocker" is the current name of the option; "asp"
// is its old alias and must not be sent as well.

const ScrapflyExport = {};

ScrapflyExport.API_URL = 'https://api.scrapfly.io/scrape';
ScrapflyExport.PLAYGROUND_URL = 'https://scrapfly.io/dashboard/playground/web-scraper';
ScrapflyExport.REGISTER_URL = 'https://scrapfly.io/register';
ScrapflyExport.LANGUAGE_STORAGE_KEY = 'scrapflyExportLanguage';
ScrapflyExport.MAX_NAMES = 4;

// Tab order. Labels are language and tool names, not translated
ScrapflyExport.LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node.js' },
  { id: 'curl', label: 'cURL' },
  { id: 'cli', label: 'CLI' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' }
];

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
 * @returns {Array<{name: string, iconUrl: string}>}
 */
ScrapflyExport.protections = function(detections) {
  const list = (Array.isArray(detections) ? detections : []).filter(d => d && !/fingerprint/i.test(scrapflyCategoryOf(d)));
  const sorted = list.slice().sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  const found = [];
  for (const detection of sorted) {
    const name = String(detection.detector?.name || detection.name || '').trim();
    if (name && !found.some(p => p.name === name)) found.push({ name, iconUrl: ScrapflyExport.iconUrl(detection) });
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
 * @returns {string}
 */
ScrapflyExport.snippet = function(language, url, names = []) {
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
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
        `    url=${scrapflyQuote.json(url)},`,
        '    unblocker=True,  # anti-bot bypass',
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
        `  url: ${scrapflyQuote.json(url)},`,
        '  unblocker: true, // anti-bot bypass',
        '}));',
        'console.log(result.result.content);'
      );
    case 'curl':
      return scrapflyLines(
        detected('#'),
        `curl -G ${ScrapflyExport.API_URL} \\`,
        '  --data-urlencode "key=$SCRAPFLY_API_KEY" \\',
        `  --data-urlencode ${scrapflyQuote.shell(`url=${url}`)} \\`,
        '  -d unblocker=true'
      );
    case 'cli':
      return scrapflyLines(
        '# https://github.com/scrapfly/scrapfly-cli/releases (reads SCRAPFLY_API_KEY)',
        detected('#'),
        `scrapfly scrape ${scrapflyQuote.shell(url)} --unblocker`
      );
    case 'go':
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
        `\t\tURL:       ${scrapflyQuote.json(url)},`,
        '\t\tUnblocker: scrapfly.BoolPtr(true), // anti-bot bypass',
        '\t})',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tfmt.Println(result.Result.Content)',
        '}'
      );
    case 'rust':
      return scrapflyLines(
        '// cargo add scrapfly-sdk && cargo add tokio --features full',
        detected('//'),
        'use scrapfly_sdk::{Client, ScrapeConfig};',
        '',
        '#[tokio::main]',
        'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
        '    let client = Client::builder()',
        '        .api_key(std::env::var("SCRAPFLY_API_KEY")?)',
        '        .build()?;',
        `    let config = ScrapeConfig::builder(${scrapflyQuote.rust(url)})`,
        '        .unblocker(true) // anti-bot bypass',
        '        .build()?;',
        '    let result = client.scrape(&config).await?;',
        '    println!("{}", result.result.content);',
        '    Ok(())',
        '}'
      );
    default:
      return '';
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
 * Open the dialog: one tab per language, each with its own Copy button, the
 * API key note, a CAPTCHA note when the page has one, and links to get a key
 * and to the playground.
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
  const names = protections.map(p => p.name);
  const selected = ScrapflyExport.preferredLanguage();
  const tabs = ScrapflyExport.LANGUAGES.map(({ id, label }) => {
    const on = id === selected;
    return `<button type="button" class="scrapfly-export-tab" role="tab" id="scrapflyExportTab-${id}" data-language="${id}"`
      + ` aria-controls="scrapflyExportPanel-${id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${esc(label)}</button>`;
  }).join('');
  const panels = ScrapflyExport.LANGUAGES.map(({ id, label }) => (
    `<div class="scrapfly-export-panel" role="tabpanel" id="scrapflyExportPanel-${id}" aria-labelledby="scrapflyExportTab-${id}"${id === selected ? '' : ' hidden'}>`
    + BaseAdvancedModule.kitCode(label, ScrapflyExport.snippet(id, target, names))
    + '</div>'
  )).join('');
  const captchaNote = ScrapflyExport.hasCaptcha(detections)
    ? BaseAdvancedModule.kitNote(tr('scrapflyExportCaptchaNote',
      "This page has a CAPTCHA: the Unblocker avoids or solves it to return the page, but it doesn't fill in CAPTCHAs on forms."), 'warning')
    : '';
  const body = `
    <p class="scrapfly-export-intro">${esc(tr('scrapflyExportIntro',
      "Fetch this page through Scrapfly's API with the Unblocker on. It picks the browser, proxies and headers by itself, and costs nothing extra when the site doesn't block."))}</p>
    ${ScrapflyExport.detectedRow(protections, tr('scrapflyExportDetected', 'Detected on this page'))}
    <div class="scrapfly-export-code">
      <div class="scrapfly-export-tabs" role="tablist" aria-label="${attr(tr('scrapflyExportLanguages', 'Code language'))}">${tabs}</div>
      ${panels}
    </div>
    ${captchaNote}
    ${BaseAdvancedModule.kitNote(tr('scrapflyExportKeyNote', 'The code reads your API key from SCRAPFLY_API_KEY.'))}
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
  ScrapflyExport.bindTabs(overlay);
  return overlay;
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

/** Tabs: click or arrow keys switch the visible snippet; the choice is remembered */
ScrapflyExport.bindTabs = function(root) {
  const tabs = Array.from(root.querySelectorAll('.scrapfly-export-tab'));
  const select = (tab, focus) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      const panel = root.querySelector(`#${other.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    ScrapflyExport.rememberLanguage(tab.dataset.language);
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
