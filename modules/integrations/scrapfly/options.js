// "Scrape with Scrapfly": the current page as ready-to-run code for Scrapfly's
// Web Scraping API with the Unblocker on (its anti-bot bypass), in every
// language Scrapfly ships an SDK for. Nothing leaves the extension: the user
// copies the code and runs it with their own key in SCRAPFLY_API_KEY.
// Opened from Detection (header button) and from every protection's
// Advanced tools (BaseAdvancedModule adds the card).
//
// Every Scrape API and Cloud Browser parameter is offered (see FIELDS), each
// spelled as the SDK in that language spells it. Read from the SDK sources
// and the docs on 2026-10-12, and checked by running the code: the published
// Python and Node SDKs (0.12.0), go-scrapfly v1.6.0 (compiled, gofmt-clean),
// scrapfly-cli v0.4.0 flags; the Rust code follows the crate 0.5.2 builder.
// "unblocker" is the current name of the option; "asp" is its old alias and
// must not be sent as well.

const ScrapflyExport = {};

ScrapflyExport.API_URL = 'https://api.scrapfly.io/scrape';
ScrapflyExport.PLAYGROUND_URL = 'https://scrapfly.io/dashboard/playground/web-scraper';
ScrapflyExport.REGISTER_URL = 'https://scrapfly.io/register';
// Docs index written for AI tools, and the Unblocker page (checked 2026-10-08)
ScrapflyExport.AI_DOCS_URL = 'https://scrapfly.io/llms.txt';
ScrapflyExport.UNBLOCKER_DOCS_URL = 'https://scrapfly.io/docs/scrape-api/unblocker';
ScrapflyExport.CAPTCHA_DOCS_URL = 'https://scrapfly.io/docs/cloud-browser-api/captcha-solver';
ScrapflyExport.BROWSER_HOST = 'wss://browser.scrapfly.io';
ScrapflyExport.LANGUAGE_STORAGE_KEY = 'scrapflyExportLanguage';
ScrapflyExport.OPTIONS_STORAGE_KEY = 'scrapflyExportOptions';
ScrapflyExport.MAX_NAMES = 4;

// Tab order. Labels are language and tool names, not translated. `file` is
// where the code goes and `run` the command that runs it ('' = paste it in a
// terminal as it is); `browser` holds the same for Cloud Browser code. A
// language without code for a product has no tab in that mode.
ScrapflyExport.LANGUAGES = [
  { id: 'python', label: 'Python', file: 'scrape.py', run: 'python scrape.py', browser: { file: 'browser.py', run: 'python browser.py' } },
  { id: 'node', label: 'Node.js', file: 'scrape.mjs', run: 'node scrape.mjs', browser: { file: 'browser.mjs', run: 'node browser.mjs' } },
  { id: 'curl', label: 'cURL', file: 'Bash / WSL', run: '' },
  { id: 'cli', label: 'CLI', file: 'Bash / WSL', run: '' },
  { id: 'go', label: 'Go', file: 'main.go', run: 'go mod init scrape && go mod tidy && go run .' },
  { id: 'rust', label: 'Rust', file: 'src/main.rs', run: 'cargo run' },
  { id: 'wss', label: 'URL', scrape: false, browser: { file: 'Bash / WSL', run: '' } }
];

// Scrape API: one request returns the page, the Unblocker gets past walls
// before it renders. Cloud Browser: a real remote browser for clicking and
// filling forms, with the Captcha Solver for CAPTCHAs that appear on the way.

/** Languages with code for a product, in tab order */
ScrapflyExport.languagesFor = function(product) {
  return ScrapflyExport.LANGUAGES.filter(l => (product === 'browser' ? Boolean(l.browser) : l.scrape !== false));
};

/** Where a language's code goes and how it runs, for a product */
ScrapflyExport.fileAndRun = function(language, product) {
  const lang = ScrapflyExport.LANGUAGES.find(l => l.id === language);
  if (!lang) return { file: '', run: '' };
  return product === 'browser' && lang.browser ? lang.browser : { file: lang.file, run: lang.run };
};

// Options that rewrite the code. Each field's `def` is the value that adds
// nothing to the code (the API default, or the default we pick: the
// Unblocker, JavaScript rendering, the Captcha Solver and residential proxies
// start on). Every parameter and its spelling in each SDK was read from the
// SDK sources on 2026-10-12: PyPI/npm scrapfly-sdk 0.12.1, go-scrapfly main
// (v1.6.0+), crate scrapfly-sdk 0.5.2 and scrapfly-cli v0.4.0.
ScrapflyExport.FORMATS = ['raw', 'clean_html', 'json', 'markdown', 'text'];
ScrapflyExport.FORMAT_OPTIONS = ['no_links', 'no_images', 'only_content'];
ScrapflyExport.SCREENSHOT_FLAGS = ['load_images', 'dark_mode', 'block_banners', 'high_quality', 'print_media_format'];
// Residential first: anti-bot protections pass far more often on it. The
// API's own default is datacenter, so residential is always written out.
ScrapflyExport.PROXY_POOLS = ['public_residential_pool', 'public_datacenter_pool'];
ScrapflyExport.API_DEFAULT_PROXY_POOL = 'public_datacenter_pool';
// Cloud Browser names its pools differently; residential first here too
ScrapflyExport.BROWSER_PROXY_POOLS = ['residential', 'datacenter'];
// ISO 3166-1 alpha-2, lower case as the API takes them; '' = any country
ScrapflyExport.COUNTRIES = ['', 'us', 'gb', 'ca', 'de', 'fr', 'es', 'it', 'nl', 'br', 'mx', 'jp', 'kr', 'in', 'au'];
ScrapflyExport.SCRAPE_OS = ['', 'win11', 'mac', 'linux', 'chromeos', 'android', 'iphone', 'ipad'];
ScrapflyExport.BROWSER_OS = ['', 'windows', 'macos', 'linux', 'android', 'iphone', 'ipad'];
ScrapflyExport.BRANDS = ['', 'chrome', 'edge', 'brave', 'opera'];
// The AI extraction models every SDK knows (Go and Rust have one constant each)
ScrapflyExport.EXTRACTION_MODELS = ['product', 'product_listing', 'article', 'review_list', 'search_engine_results',
  'job_posting', 'job_listing', 'real_estate_property', 'real_estate_property_listing', 'hotel', 'hotel_listing',
  'event', 'food_recipe', 'organization', 'social_media_post', 'software', 'stock', 'vehicle_ad', 'vehicle_ad_listing'];

const sfxRender = (o) => o.renderJs;
const sfxConnect = (o) => o.cbMode === 'connect';
const sfxValidGeo = (text) => {
  const m = String(text || '').replace(/\s+/g, '').match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  return Boolean(m) && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180;
};
// Edge runs on Windows 11 and Android only; Brave and Opera not on iPhone or iPad
const sfxBrandFits = (brand, os) => !brand || !os
  || (brand === 'edge' ? ['win11', 'android', 'windows'].includes(os) : !(['brave', 'opera'].includes(brand) && ['iphone', 'ipad'].includes(os)));

/**
 * Every option. kind: bool | choice | int | text | area | multi. `group`
 * puts it under a "More options" section ('' = always shown); `show(o)`
 * hides it, `active(o)` greys it out with the `why` note when the API would
 * ignore or refuse it (and the code leaves it out).
 */
ScrapflyExport.FIELDS = [
  { key: 'product', product: 'both', kind: 'choice', def: 'scrape', values: ['scrape', 'browser'] },
  // Scrape API
  { key: 'unblocker', product: 'scrape', kind: 'bool', def: true, api: 'unblocker' },
  { key: 'format', product: 'scrape', kind: 'choice', def: 'raw', values: ScrapflyExport.FORMATS, api: 'format' },
  { key: 'proxyPool', product: 'scrape', kind: 'choice', def: 'public_residential_pool', values: ScrapflyExport.PROXY_POOLS, api: 'proxy_pool' },
  { key: 'renderJs', product: 'scrape', kind: 'bool', def: true, api: 'render_js' },
  { key: 'renderingWait', product: 'scrape', group: 'render', kind: 'int', min: 0, max: 60000, unit: 'ms', api: 'rendering_wait', active: sfxRender, why: 'needsRender' },
  { key: 'waitForSelector', product: 'scrape', group: 'render', kind: 'text', api: 'wait_for_selector', placeholder: '#content, //h1, xhr:/api/*', active: sfxRender, why: 'needsRender' },
  { key: 'renderingStage', product: 'scrape', group: 'render', kind: 'choice', def: 'complete', values: ['complete', 'domcontentloaded'], api: 'rendering_stage', active: sfxRender, why: 'needsRender' },
  { key: 'autoScroll', product: 'scrape', group: 'render', kind: 'bool', def: false, api: 'auto_scroll', active: sfxRender, why: 'needsRender' },
  { key: 'js', product: 'scrape', group: 'render', kind: 'area', api: 'js', placeholder: 'return document.title', max: 16000, active: sfxRender, why: 'needsRender' },
  { key: 'jsScenario', product: 'scrape', group: 'render', kind: 'area', api: 'js_scenario', placeholder: '[{"click": {"selector": "#accept"}}, {"wait": 1000}]', max: 16000,
    active: (o) => o.renderJs && ScrapflyExport.parseScenario(o.jsScenario) !== null, why: (o) => (o.renderJs ? 'badJson' : 'needsRender') },
  { key: 'screenshot', product: 'scrape', group: 'render', kind: 'choice', def: '', values: ['', 'fullpage', 'selector'], api: 'screenshots', active: sfxRender, why: 'needsRender' },
  { key: 'screenshotSelector', product: 'scrape', group: 'render', kind: 'text', api: 'screenshots[main]', placeholder: '#product', show: (o) => o.screenshot === 'selector', active: sfxRender, why: 'needsRender' },
  { key: 'screenshotFlags', product: 'scrape', group: 'render', kind: 'multi', values: ScrapflyExport.SCREENSHOT_FLAGS, api: 'screenshot_flags', show: (o) => Boolean(o.screenshot), active: sfxRender, why: 'needsRender' },
  { key: 'lang', product: 'scrape', group: 'location', kind: 'text', api: 'lang', placeholder: 'en-US, fr-FR' },
  { key: 'os', product: 'scrape', group: 'location', kind: 'choice', def: '', values: ScrapflyExport.SCRAPE_OS, api: 'os' },
  { key: 'browserBrand', product: 'scrape', group: 'location', kind: 'choice', def: '', values: ScrapflyExport.BRANDS, api: 'browser_brand',
    active: (o) => o.renderJs && sfxBrandFits(o.browserBrand, o.os), why: (o) => (o.renderJs ? 'brandOs' : 'needsRender') },
  { key: 'geolocation', product: 'scrape', group: 'location', kind: 'text', api: 'geolocation', placeholder: '48.8566,2.3522',
    active: (o) => o.renderJs && (!o.geolocation || sfxValidGeo(o.geolocation)), why: (o) => (o.renderJs ? 'badGeo' : 'needsRender') },
  { key: 'headers', product: 'scrape', group: 'request', kind: 'area', api: 'headers', placeholder: 'Referer: https://www.google.com/', max: 8000, keep: false },
  { key: 'timeout', product: 'scrape', group: 'request', kind: 'int', min: 1000, max: 600000, unit: 'ms', api: 'timeout', placeholder: '150000' },
  { key: 'retry', product: 'scrape', group: 'request', kind: 'bool', def: true, api: 'retry' },
  { key: 'costBudget', product: 'scrape', group: 'request', kind: 'int', min: 1, max: 100000, api: 'cost_budget', active: (o) => o.unblocker, why: 'needsUnblocker' },
  { key: 'formatOptions', product: 'scrape', group: 'output', kind: 'multi', values: ScrapflyExport.FORMAT_OPTIONS, api: 'format_options',
    active: (o) => o.format === 'markdown' || o.format === 'text', why: 'needsMarkdown' },
  { key: 'proxifiedResponse', product: 'scrape', group: 'output', kind: 'bool', def: false, api: 'proxified_response' },
  { key: 'extraction', product: 'scrape', group: 'extraction', kind: 'choice', def: '', values: ['', 'model', 'prompt', 'template'] },
  { key: 'extractionModel', product: 'scrape', group: 'extraction', kind: 'choice', def: 'product', values: ScrapflyExport.EXTRACTION_MODELS, api: 'extraction_model', show: (o) => o.extraction === 'model' },
  { key: 'extractionPrompt', product: 'scrape', group: 'extraction', kind: 'area', api: 'extraction_prompt', max: 2000, show: (o) => o.extraction === 'prompt' },
  { key: 'extractionTemplate', product: 'scrape', group: 'extraction', kind: 'text', api: 'extraction_template', show: (o) => o.extraction === 'template' },
  { key: 'cache', product: 'scrape', group: 'cache', kind: 'bool', def: false, api: 'cache' },
  { key: 'cacheTtl', product: 'scrape', group: 'cache', kind: 'int', min: 1, max: 31536000, unit: 's', api: 'cache_ttl', placeholder: '86400', active: (o) => o.cache, why: 'needsCache' },
  { key: 'cacheClear', product: 'scrape', group: 'cache', kind: 'bool', def: false, api: 'cache_clear', active: (o) => o.cache, why: 'needsCache' },
  { key: 'session', product: 'scrape', group: 'cache', kind: 'text', api: 'session', placeholder: 'my-session', max: 255 },
  { key: 'sessionStickyProxy', product: 'scrape', group: 'cache', kind: 'bool', def: true, api: 'session_sticky_proxy',
    active: (o) => Boolean(o.session) && (o.sessionStickyProxy || !o.unblocker), why: (o) => (o.session ? 'stickyUnblocker' : 'needsSession') },
  { key: 'debug', product: 'scrape', group: 'tracking', kind: 'bool', def: false, api: 'debug' },
  { key: 'correlationId', product: 'scrape', group: 'tracking', kind: 'text', api: 'correlation_id' },
  { key: 'tags', product: 'scrape', group: 'tracking', kind: 'text', api: 'tags', placeholder: 'shop, prices' },
  { key: 'dns', product: 'scrape', group: 'tracking', kind: 'bool', def: false, api: 'dns' },
  { key: 'ssl', product: 'scrape', group: 'tracking', kind: 'bool', def: false, api: 'ssl' },
  { key: 'webhook', product: 'scrape', group: 'tracking', kind: 'text', api: 'webhook_name' },
  // Cloud Browser
  { key: 'cbMode', product: 'browser', kind: 'choice', def: 'connect', values: ['connect', 'unblock'] },
  { key: 'solveCaptcha', product: 'browser', kind: 'bool', def: true, api: 'solve_captcha', show: sfxConnect },
  { key: 'browserProxyPool', product: 'browser', kind: 'choice', def: 'residential', values: ScrapflyExport.BROWSER_PROXY_POOLS, api: 'proxy_pool', show: sfxConnect },
  { key: 'country', product: 'both', kind: 'choice', def: '', values: ScrapflyExport.COUNTRIES, api: 'country' },
  { key: 'cbTargetUrl', product: 'browser', group: 'bfingerprint', kind: 'bool', def: true, api: 'target_url', show: sfxConnect },
  { key: 'cbOs', product: 'browser', group: 'bfingerprint', kind: 'choice', def: '', values: ScrapflyExport.BROWSER_OS, api: 'os' },
  { key: 'cbBrand', product: 'browser', group: 'bfingerprint', kind: 'choice', def: '', values: ScrapflyExport.BRANDS, api: 'browser_brand',
    active: (o) => o.cbBrand !== 'edge' || o.cbOs === 'windows', why: 'edgeWindows' },
  { key: 'cbLang', product: 'browser', group: 'bfingerprint', kind: 'text', api: 'lang', placeholder: 'en', max: 20, show: sfxConnect },
  { key: 'cbLanguages', product: 'browser', group: 'bfingerprint', kind: 'text', api: 'languages', placeholder: 'fr-FR, fr, en-US', show: sfxConnect },
  { key: 'cbSession', product: 'browser', group: 'bsession', kind: 'text', api: 'session', placeholder: 'my-session', max: 255 },
  { key: 'cbAutoClose', product: 'browser', group: 'bsession', kind: 'bool', def: true, api: 'auto_close', show: sfxConnect },
  { key: 'cbTimeout', product: 'browser', group: 'bsession', kind: 'int', min: 1, max: 1800, unit: 's', api: 'timeout', placeholder: '900',
    apiFor: (o) => (o.cbMode === 'unblock' ? 'browser_timeout' : 'timeout') },
  { key: 'cbUnblockTimeout', product: 'browser', group: 'bsession', kind: 'int', min: 1, max: 300, unit: 's', api: 'timeout', placeholder: '60', show: (o) => o.cbMode === 'unblock' },
  { key: 'cbBlockImages', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'block_images', show: sfxConnect },
  { key: 'cbBlockStyles', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'block_styles', show: sfxConnect },
  { key: 'cbBlockFonts', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'block_fonts', show: sfxConnect },
  { key: 'cbBlockMedia', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'block_media', show: sfxConnect },
  { key: 'cbBlacklist', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'blacklist', show: sfxConnect },
  { key: 'cbCache', product: 'browser', group: 'bblock', kind: 'bool', def: false, api: 'cache', show: sfxConnect },
  { key: 'cbDebug', product: 'browser', group: 'btools', kind: 'bool', def: false, api: 'debug' },
  { key: 'cbEnableMcp', product: 'browser', group: 'btools', kind: 'bool', def: false, api: 'enable_mcp' }
];
ScrapflyExport.PRODUCTS = ['scrape', 'browser'];
ScrapflyExport.GROUPS = { scrape: ['render', 'location', 'request', 'output', 'extraction', 'cache', 'tracking'], browser: ['bfingerprint', 'bsession', 'bblock', 'btools'] };
ScrapflyExport.field = (key) => ScrapflyExport.FIELDS.find(f => f.key === key);
ScrapflyExport.DEFAULT_OPTIONS = Object.freeze(Object.fromEntries(ScrapflyExport.FIELDS.map(f => [f.key,
  f.kind === 'multi' ? [] : (f.kind === 'text' || f.kind === 'area' || f.kind === 'int') ? '' : f.def])));

/** Options with every unknown or invalid value replaced by its default */
ScrapflyExport.normalizeOptions = function(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const f of ScrapflyExport.FIELDS) {
    const v = value[f.key];
    if (f.kind === 'bool') out[f.key] = f.def ? v !== false : v === true;
    else if (f.kind === 'choice') out[f.key] = f.values.includes(v) ? v : f.def;
    else if (f.kind === 'int') {
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
      out[f.key] = Number.isInteger(n) && n >= f.min && n <= f.max ? n : '';
    } else if (f.kind === 'text') out[f.key] = typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, f.max || 500) : '';
    else if (f.kind === 'area') out[f.key] = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, f.max).replace(/^\s+$/, '') : '';
    else if (f.kind === 'multi') out[f.key] = f.values.filter(x => Array.isArray(v) && v.includes(x));
  }
  return out;
};

/** Is the field shown, and does the code use it? */
ScrapflyExport.fieldState = function(field, o) {
  const shown = (field.product === 'both' || field.product === o.product) && (!field.show || field.show(o));
  const active = shown && (!field.active || field.active(o));
  const why = !active && field.why ? (typeof field.why === 'function' ? field.why(o) : field.why) : '';
  return { shown, active, why };
};
const sfxOn = (key, o) => ScrapflyExport.fieldState(ScrapflyExport.field(key), o).active;

/** "a, b ,c" → ['a', 'b', 'c'] */
ScrapflyExport.parseList = (text) => String(text || '').split(',').map(s => s.trim()).filter(Boolean);
/** "Name: value" lines → [[name, value]]; lines without a name are skipped */
ScrapflyExport.parseHeaders = (text) => String(text || '').split('\n').map((line) => {
  const at = line.indexOf(':');
  return at > 0 ? [line.slice(0, at).trim(), line.slice(at + 1).trim()] : null;
}).filter(pair => pair && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(pair[0]) && pair[1]);
/** A JS scenario: a JSON list of steps, or null */
ScrapflyExport.parseScenario = (text) => {
  if (!String(text || '').trim()) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) && value.every(step => step && typeof step === 'object' && !Array.isArray(step)) ? value : null;
  } catch (e) {
    return null;
  }
};
