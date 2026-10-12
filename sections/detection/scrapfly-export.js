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
  { id: 'curl', label: 'cURL', file: 'Terminal', run: '' },
  { id: 'cli', label: 'CLI', file: 'Terminal', run: '' },
  { id: 'go', label: 'Go', file: 'main.go', run: 'go mod init scrape && go mod tidy && go run .' },
  { id: 'rust', label: 'Rust', file: 'src/main.rs', run: 'cargo run' },
  { id: 'wss', label: 'URL', scrape: false, browser: { file: 'Terminal', run: '' } }
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

/**
 * The Scrape API parameters the options set, in the order the code lists
 * them, each with the kind of value it carries. Only what the API uses is
 * here: options it would ignore or refuse (see fieldState) are left out.
 * @returns {Array<{api: string, type: string, value: *}>}
 */
ScrapflyExport.scrapeParams = function(options) {
  const o = ScrapflyExport.normalizeOptions({ ...options, product: 'scrape' });
  const on = (key) => sfxOn(key, o);
  const out = [];
  const add = (api, type, value) => out.push({ api, type, value });
  if (o.unblocker) add('unblocker', 'bool', true);
  if (on('costBudget') && o.costBudget) add('cost_budget', 'int', o.costBudget);
  if (o.renderJs) {
    add('render_js', 'bool', true);
    if (o.renderingWait !== '') add('rendering_wait', 'int', o.renderingWait);
    if (o.waitForSelector) add('wait_for_selector', 'str', o.waitForSelector);
    if (o.renderingStage !== 'complete') add('rendering_stage', 'str', o.renderingStage);
    if (o.autoScroll) add('auto_scroll', 'bool', true);
    if (o.js.trim()) add('js', 'js', o.js);
    const scenario = ScrapflyExport.parseScenario(o.jsScenario);
    if (scenario && scenario.length) add('js_scenario', 'scenario', scenario);
    const shot = o.screenshot === 'fullpage' ? 'fullpage' : (o.screenshot === 'selector' ? o.screenshotSelector : '');
    if (shot) {
      add('screenshots', 'screens', [['main', shot]]);
      if (o.screenshotFlags.length) add('screenshot_flags', 'flags', o.screenshotFlags);
    }
  }
  if (o.proxyPool !== ScrapflyExport.API_DEFAULT_PROXY_POOL) add('proxy_pool', 'pool', o.proxyPool);
  if (o.country) add('country', 'str', o.country);
  const langs = ScrapflyExport.parseList(o.lang);
  if (langs.length) add('lang', 'list', langs);
  if (o.os) add('os', 'str', o.os);
  if (on('browserBrand') && o.browserBrand) add('browser_brand', 'str', o.browserBrand);
  if (on('geolocation') && o.geolocation) add('geolocation', 'str', o.geolocation.replace(/\s+/g, ''));
  const headers = ScrapflyExport.parseHeaders(o.headers);
  if (headers.length) add('headers', 'headers', headers);
  if (o.timeout !== '') add('timeout', 'int', o.timeout);
  if (!o.retry) add('retry', 'bool', false);
  if (o.format !== 'raw') {
    add('format', 'format', o.format);
    if (on('formatOptions') && o.formatOptions.length) add('format_options', 'fmtopts', o.formatOptions);
  }
  if (o.proxifiedResponse) add('proxified_response', 'bool', true);
  // One kind of extraction: Go and Rust refuse two at once
  if (o.extraction === 'model') add('extraction_model', 'model', o.extractionModel);
  if (o.extraction === 'prompt' && o.extractionPrompt.trim()) add('extraction_prompt', 'str', o.extractionPrompt.trim());
  if (o.extraction === 'template' && o.extractionTemplate) add('extraction_template', 'template', o.extractionTemplate);
  if (o.cache) {
    add('cache', 'bool', true);
    if (o.cacheTtl !== '') add('cache_ttl', 'int', o.cacheTtl);
    if (o.cacheClear) add('cache_clear', 'bool', true);
  }
  if (o.session) {
    add('session', 'str', o.session);
    // Off is refused with the Unblocker (HTTP 400): it stays on then
    if (!o.sessionStickyProxy && !o.unblocker) add('session_sticky_proxy', 'bool', false);
  }
  if (o.debug) add('debug', 'bool', true);
  if (o.correlationId) add('correlation_id', 'str', o.correlationId);
  const tags = ScrapflyExport.parseList(o.tags);
  if (tags.length) add('tags', 'list', tags);
  if (o.dns) add('dns', 'bool', true);
  if (o.ssl) add('ssl', 'bool', true);
  if (o.webhook) add('webhook_name', 'str', o.webhook);
  return out;
};

/**
 * The Cloud Browser parameters the options set (connection URL, or the
 * /unblock request body in unblock mode), in the code's order.
 * @returns {Array<{api: string, type: string, value: *}>}
 */
ScrapflyExport.browserParams = function(options, url) {
  const o = ScrapflyExport.normalizeOptions({ ...options, product: 'browser' });
  const out = [];
  const add = (api, type, value) => out.push({ api, type, value });
  if (o.cbMode === 'unblock') {
    // Unblock always uses residential proxies; it takes these fields only
    add('url', 'str', url);
    if (o.country) add('country', 'str', o.country);
    if (o.cbOs) add('os', 'str', o.cbOs);
    if (o.cbBrand && sfxOn('cbBrand', o)) add('browser_brand', 'str', o.cbBrand);
    if (o.cbSession) add('session', 'str', o.cbSession);
    if (o.cbUnblockTimeout !== '') add('timeout', 'int', o.cbUnblockTimeout);
    if (o.cbTimeout !== '') add('browser_timeout', 'int', o.cbTimeout);
    if (o.cbEnableMcp) add('enable_mcp', 'bool', true);
    if (o.cbDebug) add('debug', 'bool', true);
    return out;
  }
  add('proxy_pool', 'str', o.browserProxyPool);
  if (o.country) add('country', 'str', o.country);
  if (o.cbTargetUrl) add('target_url', 'str', url);
  if (o.cbOs) add('os', 'str', o.cbOs);
  if (o.cbBrand && sfxOn('cbBrand', o)) add('browser_brand', 'str', o.cbBrand);
  if (o.cbLang) add('lang', 'str', o.cbLang);
  const languages = ScrapflyExport.parseList(o.cbLanguages).slice(0, 3);
  if (languages.length) add('languages', 'list', languages);
  if (o.cbSession) add('session', 'str', o.cbSession);
  if (!o.cbAutoClose) add('auto_close', 'bool', false);
  if (o.cbTimeout !== '') add('timeout', 'int', o.cbTimeout);
  for (const [key, api] of [['cbBlockImages', 'block_images'], ['cbBlockStyles', 'block_styles'], ['cbBlockFonts', 'block_fonts'],
    ['cbBlockMedia', 'block_media'], ['cbBlacklist', 'blacklist'], ['cbCache', 'cache'], ['cbDebug', 'debug'], ['cbEnableMcp', 'enable_mcp']]) {
    if (o[key]) add(api, 'bool', true);
  }
  if (o.solveCaptcha) add('solve_captcha', 'bool', true);
  return out;
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

/** Base64 (URL-safe, no padding) of UTF-8 text, as the SDKs send js and js_scenario */
ScrapflyExport.base64Url = function(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// A JSON value as a literal: Python (True/None), JavaScript, Go (map[string]any)
const sfxLiteral = (value, lang) => {
  const q = scrapflyQuote.json;
  if (value === null) return lang === 'python' ? 'None' : (lang === 'go' ? 'nil' : 'null');
  if (typeof value === 'boolean') return lang === 'python' ? (value ? 'True' : 'False') : String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return q(value);
  if (Array.isArray(value)) {
    const items = value.map(v => sfxLiteral(v, lang)).join(', ');
    return lang === 'go' ? `[]any{${items}}` : `[${items}]`;
  }
  const pairs = Object.entries(value).map(([k, v]) => `${q(k)}: ${sfxLiteral(v, lang)}`).join(', ');
  return lang === 'go' ? `map[string]any{${pairs}}` : `{${pairs}}`;
};
// Rust's json! takes JSON, except \uXXXX escapes, which Rust writes \u{XXXX}
const sfxRustJson = (value) => JSON.stringify(value).replace(/\\u([0-9a-fA-F]{4})/g, '\\u{$1}');
const sfxPascal = (snake) => String(snake).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
// A shell word that needs no quotes stays bare (us, win11, en-US,fr)
const sfxShellArg = (value) => (/^[A-Za-z0-9_.,:\/+-]+$/.test(String(value)) ? String(value) : scrapflyQuote.shell(value));
const SFX_GO_FORMAT = { clean_html: 'FormatCleanHTML', json: 'FormatJSON', markdown: 'FormatMarkdown', text: 'FormatText' };
const SFX_RUST_FORMAT = { clean_html: 'CleanHtml', json: 'Json', markdown: 'Markdown', text: 'Text' };
const SFX_GO_POOL = { public_residential_pool: 'PublicResidentialPool', public_datacenter_pool: 'PublicDataCenterPool' };
const SFX_RUST_POOL = { public_residential_pool: 'PublicResidentialPool', public_datacenter_pool: 'PublicDatacenterPool' };
// SDK field names that differ from the API's (all others are the same in
// Python and Node; Go and Rust below)
const SFX_SDK_NAME = { webhook_name: 'webhook' };
const SFX_GO_FIELD = {
  unblocker: 'Unblocker', cost_budget: 'CostBudget', render_js: 'RenderJS', rendering_wait: 'RenderingWait', wait_for_selector: 'WaitForSelector',
  rendering_stage: 'RenderingStage', auto_scroll: 'AutoScroll', js: 'JS', js_scenario: 'JSScenario', screenshots: 'Screenshots',
  screenshot_flags: 'ScreenshotFlags', proxy_pool: 'ProxyPool', country: 'Country', lang: 'Lang', os: 'OS', browser_brand: 'BrowserBrand',
  geolocation: 'Geolocation', headers: 'Headers', timeout: 'Timeout', retry: 'Retry', format: 'Format', format_options: 'FormatOptions',
  proxified_response: 'ProxifiedResponse', extraction_model: 'ExtractionModel', extraction_prompt: 'ExtractionPrompt',
  extraction_template: 'ExtractionTemplate', cache: 'Cache', cache_ttl: 'CacheTTL', cache_clear: 'CacheClear', session: 'Session',
  session_sticky_proxy: 'SessionStickyProxy', debug: 'Debug', correlation_id: 'CorrelationID', tags: 'Tags', dns: 'DNS', ssl: 'SSL',
  webhook_name: 'Webhook'
};
const SFX_CLI_FLAG = {
  unblocker: '--unblocker', cost_budget: '--cost-budget', render_js: '--render-js', rendering_wait: '--rendering-wait',
  wait_for_selector: '--wait-for-selector', rendering_stage: '--rendering-stage', auto_scroll: '--auto-scroll', js: '--js-file',
  js_scenario: '--js-scenario-file', screenshot_flags: '--screenshot-flag', proxy_pool: '--proxy-pool', country: '--country', lang: '--lang',
  os: '--os', browser_brand: '--browser-brand', geolocation: '--geolocation', headers: '--header', timeout: '--request-timeout', retry: '--retry',
  format: '--format', format_options: '--format-option', proxified_response: '--proxified', extraction_model: '--extraction-model',
  extraction_prompt: '--extraction-prompt', extraction_template: '--extraction-template', cache: '--cache', cache_ttl: '--cache-ttl',
  cache_clear: '--cache-clear', session: '--session', session_sticky_proxy: '--session-sticky-proxy', debug: '--debug',
  correlation_id: '--correlation-id', tags: '--tag', dns: '--dns', ssl: '--ssl', webhook_name: '--webhook'
};

/** Python or Node keyword/value lines for the parameters (one per line, scenarios one step per line) */
const sfxKeywordLines = (params, lang, indent) => {
  const q = scrapflyQuote.json;
  const sep = lang === 'python' ? '=' : ': ';
  const bool = (v) => (lang === 'python' ? (v ? 'True' : 'False') : String(v));
  const lines = [];
  for (const { api, type, value } of params) {
    const name = SFX_SDK_NAME[api] || api;
    let v;
    if (type === 'bool') v = bool(value);
    else if (type === 'int') v = String(value);
    else if (type === 'list' || type === 'fmtopts' || type === 'flags') v = `[${value.map(q).join(', ')}]`;
    else if (type === 'headers' || type === 'screens') v = `{${value.map(([k, x]) => `${q(k)}: ${q(x)}`).join(', ')}}`;
    else if (type === 'scenario') {
      lines.push(`${indent}${name}${sep}[`, ...value.map(step => `${indent}    ${sfxLiteral(step, lang)},`), `${indent}],`);
      continue;
    } else v = q(value);
    const comment = api === 'unblocker' ? (lang === 'python' ? '  # anti-bot bypass' : ' // anti-bot bypass') : '';
    lines.push(`${indent}${name}${sep}${v},${comment}`);
  }
  return lines;
};

/**
 * Ready-to-run code for one language.
 * @param {string} language - id from ScrapflyExport.LANGUAGES
 * @param {string} url - http(s) page address (ScrapflyExport.targetUrl)
 * @param {string[]} [names] - detected protections, for a comment
 * @param {object} [options] - see ScrapflyExport.FIELDS
 * @returns {string}
 */
ScrapflyExport.snippet = function(language, url, names = [], options = {}) {
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
  const o = ScrapflyExport.normalizeOptions(options);
  if (o.product === 'browser') return ScrapflyExport.browserSnippet(language, url, names, o);
  if (!ScrapflyExport.languagesFor('scrape').some(l => l.id === language)) return '';
  const params = ScrapflyExport.scrapeParams(o);
  const has = (type) => params.some(p => p.type === type);
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
        ...sfxKeywordLines(params, 'python', '    '),
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
        ...sfxKeywordLines(params, 'node', '  '),
        '}));',
        'console.log(result.result.content);'
      );
    case 'curl': {
      // What the SDKs send: format options join the format, js and
      // js_scenario go base64-encoded, a saved template is "persistent:"
      const args = [`curl -G ${ScrapflyExport.API_URL}`, '  --data-urlencode "key=$SCRAPFLY_API_KEY"', `  --data-urlencode ${q.shell(`url=${url}`)}`];
      const formatOptions = params.find(p => p.api === 'format_options');
      for (const { api, type, value } of params) {
        if (type === 'bool' || type === 'int' || type === 'pool' || type === 'model') args.push(`  -d ${api}=${value}`);
        else if (type === 'format') args.push(`  -d format=${value}${formatOptions ? `:${formatOptions.value.join(',')}` : ''}`);
        else if (type === 'fmtopts') continue;
        else if (type === 'flags') args.push(`  -d ${api}=${value.join(',')}`);
        else if (type === 'list') args.push(sfxShellArg(value.join(',')) === value.join(',') ? `  -d ${api}=${value.join(',')}` : `  --data-urlencode ${q.shell(`${api}=${value.join(',')}`)}`);
        else if (type === 'headers' || type === 'screens') value.forEach(([k, x]) => args.push(`  --data-urlencode ${q.shell(`${api}[${type === 'headers' ? k.toLowerCase() : k}]=${x}`)}`));
        else if (type === 'js') args.push(`  -d js=${ScrapflyExport.base64Url(value)}`);
        else if (type === 'scenario') args.push(`  -d js_scenario=${ScrapflyExport.base64Url(JSON.stringify(value))}`);
        else if (type === 'template') args.push(`  --data-urlencode ${q.shell(`${api}=persistent:${value}`)}`);
        else if (sfxShellArg(value) === String(value)) args.push(`  -d ${api}=${value}`);
        else args.push(`  --data-urlencode ${q.shell(`${api}=${value}`)}`);
      }
      return scrapflyLines(detected('#'), args.join(' \\\n'));
    }
    case 'cli': {
      // The CLI reads js and js_scenario from files: written first
      const files = [];
      const flags = [];
      for (const { api, type, value } of params) {
        const flag = SFX_CLI_FLAG[api];
        if (type === 'bool') flags.push(value ? flag : `${flag}=false`);
        else if (type === 'int' || type === 'pool' || type === 'format' || type === 'model') flags.push(`${flag} ${value}`);
        else if (type === 'fmtopts' || type === 'flags') flags.push(`${flag} ${value.join(',')}`);
        else if (type === 'list') flags.push(`${flag} ${sfxShellArg(value.join(','))}`);
        else if (type === 'headers') value.forEach(([k, x]) => flags.push(`${flag} ${q.shell(`${k}=${x}`)}`));
        else if (type === 'screens') flags.push(value[0][1] === 'fullpage' ? '--screenshot' : `--screenshot-named ${q.shell(`main=${value[0][1]}`)}`);
        else if (type === 'js') {
          files.push('cat > script.js <<\'SCRAPFLY_JS\'', value.replace(/\n+$/, ''), 'SCRAPFLY_JS');
          flags.push(`${flag} script.js`);
        } else if (type === 'scenario') {
          files.push('cat > scenario.json <<\'SCRAPFLY_JSON\'', JSON.stringify(value, null, 2), 'SCRAPFLY_JSON');
          flags.push(`${flag} scenario.json`);
        } else flags.push(`${flag} ${sfxShellArg(value)}`);
      }
      const command = flags.length <= 1
        ? [`scrapfly scrape ${q.shell(url)}`, ...flags].join(' ')
        : [`scrapfly scrape ${q.shell(url)}`, ...flags.map(f => `  ${f}`)].join(' \\\n');
      return scrapflyLines(
        '# https://github.com/scrapfly/scrapfly-cli/releases (reads SCRAPFLY_API_KEY)',
        detected('#'),
        ...files,
        command
      );
    }
    case 'go': {
      const fields = [['URL', q.json(url)]];
      for (const { api, type, value } of params) {
        const key = SFX_GO_FIELD[api];
        if (api === 'unblocker') fields.push([key, 'scrapfly.BoolPtr(true)', ' // anti-bot bypass']);
        else if (api === 'session_sticky_proxy') fields.push([key, 'scrapfly.BoolPtr(false)']);
        else if (api === 'retry') continue; // written below
        else if (type === 'bool' || type === 'int') fields.push([key, String(value)]);
        else if (type === 'pool') fields.push([key, `scrapfly.${SFX_GO_POOL[value]}`]);
        else if (type === 'format') fields.push([key, `scrapfly.${SFX_GO_FORMAT[value]}`]);
        else if (type === 'fmtopts') fields.push([key, `[]scrapfly.FormatOption{${value.map(v => `scrapfly.${sfxPascal(v)}`).join(', ')}}`]);
        else if (type === 'flags') fields.push([key, `[]scrapfly.ScreenshotFlag{${value.map(v => `scrapfly.${sfxPascal(v)}`).join(', ')}}`]);
        else if (type === 'model') fields.push([key, `scrapfly.ExtractionModel${sfxPascal(value)}`]);
        else if (type === 'list') fields.push([key, `[]string{${value.map(q.json).join(', ')}}`]);
        else if (type === 'headers' || type === 'screens') fields.push([key, `map[string]string{${value.map(([k, x]) => `${q.json(k)}: ${q.json(x)}`).join(', ')}}`]);
        else if (type === 'scenario') fields.push([key, ['[]js_scenario.JSScenarioStep{', ...value.map(step => `\t\t\t${sfxLiteral(step, 'go')},`), '\t\t}']]);
        else fields.push([key, q.json(value)]);
      }
      // Go's Retry is a plain bool: left out it would send retry=false
      if (o.retry) fields.push(['Retry', 'true', ' // the API default: Go sends false without it']);
      // gofmt lines values up one space after the longest key, per run of
      // one-line fields (a multi-line value ends the run)
      const runs = [];
      let run = [];
      for (const field of fields) {
        if (Array.isArray(field[1])) {
          if (run.length) runs.push(run);
          runs.push([field]);
          run = [];
        } else run.push(field);
      }
      if (run.length) runs.push(run);
      const body = runs.flatMap((group) => {
        if (Array.isArray(group[0][1])) {
          const [key, [first, ...rest]] = group[0];
          return [`\t\t${key}: ${first}`, ...rest.slice(0, -1), `${rest[rest.length - 1]},`];
        }
        const width = Math.max(...group.map(([key]) => key.length)) + 2;
        return group.map(([key, value, comment = '']) => `\t\t${`${key}:`.padEnd(width)}${value},${comment}`);
      });
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
        has('scenario') ? '\tjs_scenario "github.com/scrapfly/go-scrapfly/scenario"' : null,
        ')',
        '',
        'func main() {',
        '\tclient, err := scrapfly.New(os.Getenv("SCRAPFLY_API_KEY"))',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tresult, err := client.Scrape(&scrapfly.ScrapeConfig{',
        ...body,
        '\t})',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tfmt.Println(result.Result.Content)',
        '}'
      );
    }
    case 'rust': {
      const calls = [];
      for (const { api, type, value } of params) {
        if (api === 'proxified_response') calls.push('.proxified_response()');
        else if (api === 'webhook_name') calls.push(`.webhook(${q.rust(value)})`);
        else if (type === 'bool' || type === 'int') calls.push(`.${api}(${value})${api === 'unblocker' ? ' // anti-bot bypass' : ''}`);
        else if (type === 'pool') calls.push(`.proxy_pool(ProxyPool::${SFX_RUST_POOL[value]})`);
        else if (type === 'format') calls.push(`.format(Format::${SFX_RUST_FORMAT[value]})`);
        else if (type === 'fmtopts') value.forEach(v => calls.push(`.format_option(FormatOption::${sfxPascal(v)})`));
        else if (type === 'flags') value.forEach(v => calls.push(`.screenshot_flag(ScreenshotFlag::${sfxPascal(v)})`));
        else if (type === 'model') calls.push(`.extraction_model(ExtractionModel::${sfxPascal(value)})`);
        else if (api === 'lang') value.forEach(v => calls.push(`.lang(${q.rust(v)})`));
        else if (api === 'tags') value.forEach(v => calls.push(`.tag(${q.rust(v)})`));
        else if (type === 'headers') value.forEach(([k, x]) => calls.push(`.header(${q.rust(k)}, ${q.rust(x)})`));
        else if (type === 'screens') value.forEach(([k, x]) => calls.push(`.screenshot(${q.rust(k)}, ${q.rust(x)})`));
        else if (type === 'scenario') calls.push(`.js_scenario(serde_json::json!(${sfxRustJson(value)}))`);
        else calls.push(`.${api}(${q.rust(value)})`);
      }
      const used = (type) => params.some(p => p.type === type);
      const imports = ['Client', used('model') ? 'ExtractionModel' : null, used('format') ? 'Format' : null, used('fmtopts') ? 'FormatOption' : null,
        used('pool') ? 'ProxyPool' : null, 'ScrapeConfig', used('flags') ? 'ScreenshotFlag' : null].filter(Boolean);
      return scrapflyLines(
        `// cargo add scrapfly-sdk && cargo add tokio --features full${has('scenario') ? ' && cargo add serde_json' : ''}`,
        detected('//'),
        `use scrapfly_sdk::{${imports.join(', ')}};`,
        '',
        '#[tokio::main]',
        'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
        '    let client = Client::builder()',
        '        .api_key(std::env::var("SCRAPFLY_API_KEY")?)',
        '        .build()?;',
        `    let config = ScrapeConfig::builder(${q.rust(url)})`,
        ...calls.map(call => `        ${call}`),
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
  const browser = o.product === 'browser';
  const code = ScrapflyExport.snippet(lang.id, url, (protections || []).map(p => p.name), o);
  const { file, run } = ScrapflyExport.fileAndRun(lang.id, o.product);
  const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ');
  const found = (protections || []).map(p => `- ${oneLine(p.name)} (${p.kind || 'anti-bot'})`);
  const formats = { raw: 'raw HTML', clean_html: 'clean HTML', json: 'JSON', markdown: 'Markdown', text: 'plain text' };
  const proxies = [
    (browser ? (o.cbMode === 'unblock' || o.browserProxyPool === 'residential') : o.proxyPool === 'public_residential_pool') ? 'residential proxies' : 'datacenter proxies',
    o.country ? `proxy country: ${o.country.toUpperCase()}` : 'any proxy country'
  ];
  // Every other parameter the code sets, as the API names it
  const shown = new Set(['unblocker', 'render_js', 'proxy_pool', 'country', 'format', 'solve_captcha', 'url', 'target_url']);
  const show = (value) => (Array.isArray(value) ? value.map(v => (Array.isArray(v) ? `${v[0]}: ${v[1]}` : (typeof v === 'object' ? JSON.stringify(v) : v))).join(', ') : String(value));
  const extra = (browser ? ScrapflyExport.browserParams(o, url) : ScrapflyExport.scrapeParams(o))
    .filter(p => !shown.has(p.api))
    .map(p => (p.api === 'headers' ? `headers (${p.value.map(([k]) => k).join(', ')})` : `${p.api}=${oneLine(show(p.value))}`));
  const settings = browser
    ? [o.cbMode === 'unblock' ? 'Scrapfly Cloud Browser opened through /unblock (a browser already past the anti-bot wall), driven with Playwright over CDP'
      : 'Scrapfly Cloud Browser driven with Playwright over CDP',
    o.cbMode === 'unblock' ? null : (o.solveCaptcha ? 'Captcha Solver on (solve_captcha=true: CAPTCHAs are solved by the browser as they appear)' : 'Captcha Solver off'),
    ...proxies].filter(Boolean)
    : [o.unblocker ? 'Scrape API with the Unblocker on (Scrapfly\'s anti-bot bypass)' : 'Scrape API with the Unblocker off',
      `output: ${formats[o.format]}`,
      ...proxies,
      o.renderJs ? 'JavaScript rendering on' : 'JavaScript rendering off'];
  if (extra.length) settings.push(`other parameters: ${extra.join('; ')}`);
  const fence = ['curl', 'cli', 'wss'].includes(lang.id) ? 'bash' : (lang.id === 'node' ? 'javascript' : lang.id);
  const steps = [`1. Set the API key: ${ScrapflyExport.keyCommand('')}`];
  steps.push(run ? `2. Save the code as ${file} and run: ${run}` : '2. Paste the code in a terminal.');
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
    browser ? 'Captcha Solver docs: ' + ScrapflyExport.CAPTCHA_DOCS_URL : 'Unblocker docs: ' + ScrapflyExport.UNBLOCKER_DOCS_URL,
    'Never put the API key in the code: keep reading it from SCRAPFLY_API_KEY.'
  ].join('\n');
};

/**
 * Cloud Browser code: the SDK builds the WebSocket address with the options
 * (or, in unblock mode, asks /unblock for a browser already past the wall),
 * Playwright connects to it and opens the page; with solveCaptcha the browser
 * solves CAPTCHAs by itself as they appear. Follows the Cloud Browser docs
 * and the SDKs' BrowserConfig and cloud_browser_unblock / cloudBrowserUnblock
 * (read 2026-10-12): proxy_pool is "datacenter" or "residential" here, not
 * the Scrape API pool names.
 */
ScrapflyExport.browserSnippet = function(language, url, names, options) {
  const o = ScrapflyExport.normalizeOptions({ ...options, product: 'browser' });
  const q = scrapflyQuote;
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
  const unblock = o.cbMode === 'unblock';
  const params = ScrapflyExport.browserParams(o, url);
  const captcha = !unblock && o.solveCaptcha;
  const pyArgs = sfxKeywordLines(params, 'python', '    ').map(line => (line.startsWith('    solve_captcha=') ? line.replace(/,$/, ',  # solves CAPTCHAs as they appear') : line));
  const nodeArgs = sfxKeywordLines(params, 'node', '  ').map(line => (line.startsWith('  solve_captcha:') ? line.replace(/,$/, ', // solves CAPTCHAs as they appear') : line));
  switch (language) {
    case 'python':
      return scrapflyLines(
        '# pip install scrapfly-sdk playwright',
        detected('#'),
        'import os',
        'from playwright.sync_api import sync_playwright',
        unblock ? 'from scrapfly import ScrapflyClient' : 'from scrapfly import BrowserConfig, ScrapflyClient',
        '',
        'client = ScrapflyClient(key=os.environ["SCRAPFLY_API_KEY"])',
        ...(unblock ? [
          '# A browser already past the anti-bot wall (always on residential proxies)',
          'unblocked = client.cloud_browser_unblock(',
          ...pyArgs,
          ')',
          'ws_url = unblocked["ws_url"]'
        ] : [
          'ws_url = client.cloud_browser(BrowserConfig(',
          ...pyArgs,
          '))'
        ]),
        '',
        'with sync_playwright() as p:',
        '    browser = p.chromium.connect_over_cdp(ws_url)',
        '    context = browser.contexts[0]',
        '    page = context.pages[0] if context.pages else context.new_page()',
        ...(captcha ? [
          '    # The browser solves CAPTCHAs by itself; its events say when it is done',
          '    cdp = context.new_cdp_session(page)',
          '    pending = set()',
          '',
          '    def detected(event):',
          '        pending.add(event["detectionId"])',
          '',
          '    def finished(event):',
          '        pending.discard(event["detectionId"])',
          '        if event.get("errorMessage"):',
          '            print("CAPTCHA not solved:", event["errorMessage"])',
          '',
          '    cdp.on("Antibot.captchaDetected", detected)',
          '    cdp.on("Antibot.captchaSolved", finished)',
          '    cdp.on("Antibot.captchaError", finished)',
          ''
        ] : []),
        `    page.goto(${q.json(url)})`,
        '    page.wait_for_load_state("networkidle")',
        ...(captcha ? [
          '    page.wait_for_timeout(3000)  # a CAPTCHA can appear after the page settles',
          '    for _ in range(240):  # one is being solved: wait up to 2 minutes',
          '        if not pending:',
          '            break',
          '        page.wait_for_timeout(500)'
        ] : []),
        '    print(page.content())',
        '    browser.close()  # ends the session (billed until then)'
      );
    case 'node':
      return scrapflyLines(
        '// npm install scrapfly-sdk playwright  (run as an ES module, e.g. browser.mjs)',
        detected('//'),
        "import { chromium } from 'playwright';",
        unblock ? "import { ScrapflyClient } from 'scrapfly-sdk';" : "import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';",
        '',
        'const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });',
        ...(unblock ? [
          '// A browser already past the anti-bot wall (always on residential proxies)',
          'const { ws_url: wsUrl } = await client.cloudBrowserUnblock({',
          ...nodeArgs,
          '});'
        ] : [
          'const wsUrl = client.cloudBrowser(new BrowserConfig({',
          ...nodeArgs,
          '}));'
        ]),
        '',
        'const browser = await chromium.connectOverCDP(wsUrl);',
        'const context = browser.contexts()[0];',
        'const page = context.pages()[0] ?? await context.newPage();',
        ...(captcha ? [
          '// The browser solves CAPTCHAs by itself; its events say when it is done',
          'const cdp = await context.newCDPSession(page);',
          'const pending = new Set();',
          "cdp.on('Antibot.captchaDetected', (event) => pending.add(event.detectionId));",
          "cdp.on('Antibot.captchaSolved', (event) => pending.delete(event.detectionId));",
          "cdp.on('Antibot.captchaError', (event) => {",
          '  pending.delete(event.detectionId);',
          "  console.error('CAPTCHA not solved:', event.errorMessage);",
          '});',
          ''
        ] : []),
        `await page.goto(${q.json(url)});`,
        "await page.waitForLoadState('networkidle');",
        ...(captcha ? [
          'await page.waitForTimeout(3000); // a CAPTCHA can appear after the page settles',
          'for (let i = 0; i < 240 && pending.size > 0; i++) await page.waitForTimeout(500); // one is being solved: up to 2 minutes'
        ] : []),
        'console.log(await page.content());',
        'await browser.close(); // ends the session (billed until then)'
      );
    case 'wss': {
      if (unblock) {
        const body = Object.fromEntries(params.map(({ api, value }) => [api, value]));
        return scrapflyLines(
          '# Unblocks the page in a fresh browser and returns its CDP address (ws_url)',
          '# for Playwright, Puppeteer or any CDP client; close the browser when done',
          detected('#'),
          `curl -s -X POST "${ScrapflyExport.BROWSER_HOST.replace(/^wss:/, 'https:')}/unblock?key=$SCRAPFLY_API_KEY" \\`,
          "  -H 'Content-Type: application/json' \\",
          `  -d ${q.shell(JSON.stringify(body))}`
        );
      }
      // Inside double quotes: everything but the key is percent-encoded
      // (and "!" too, which an interactive shell would expand)
      const enc = (value) => encodeURIComponent(String(value)).replace(/!/g, '%21');
      const query = ['api_key=$SCRAPFLY_API_KEY', ...params.map(({ api, value }) => `${api}=${enc(Array.isArray(value) ? value.join(',') : value)}`)];
      return scrapflyLines(
        '# Prints the address for Puppeteer, Selenium or any CDP client,',
        `# then open ${url.replace(/[\r\n]+/g, ' ')}`,
        captcha ? '# CAPTCHAs are solved by the browser: wait for its Antibot.captchaSolved event' : null,
        detected('#'),
        `echo "${ScrapflyExport.BROWSER_HOST}?${query.join('&')}"`
      );
    }
    default:
      return '';
  }
};

// Syntax colours: comments, strings, keywords and literals. The output is the
// code escaped, plus <span> wrappers only.
const SCRAPFLY_KEYWORDS = {
  python: ['import', 'from', 'as', 'def', 'return', 'print'],
  node: ['import', 'from', 'const', 'await', 'new', 'async', 'return'],
  go: ['package', 'import', 'func', 'if', 'return', 'var'],
  rust: ['use', 'async', 'fn', 'let', 'await', 'mut', 'pub'],
  curl: ['curl'],
  cli: ['scrapfly'],
  wss: ['echo']
};
const SCRAPFLY_LITERALS = ['True', 'False', 'None', 'true', 'false', 'nil', 'Ok'];

/**
 * @param {string} code
 * @param {string} language - id from ScrapflyExport.LANGUAGES
 * @returns {string} HTML
 */
ScrapflyExport.highlight = function(code, language) {
  const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const comment = ['python', 'curl', 'cli', 'wss'].includes(language) ? '#[^\n]*' : '//[^\n]*';
  const token = new RegExp(`(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')|(--?[a-z][a-z-]*)|([A-Za-z_][A-Za-z0-9_]*)|(\\d+)`, 'g');
  const keywords = SCRAPFLY_KEYWORDS[language] || [];
  const shell = language === 'curl' || language === 'cli' || language === 'wss';
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
  // Headers can carry cookies or tokens: never kept
  const kept = ScrapflyExport.normalizeOptions(options);
  for (const field of ScrapflyExport.FIELDS) if (field.keep === false) delete kept[field.key];
  try {
    localStorage.setItem(ScrapflyExport.OPTIONS_STORAGE_KEY, JSON.stringify(kept));
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
 * Open the dialog: what was detected, then four numbered steps (settings,
 * API key, the code with one tab per language, the run command),
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
  const captcha = ScrapflyExport.hasCaptcha(detections);
  // Pages with a CAPTCHA start on Cloud Browser: only a browser solves them
  const options = { ...ScrapflyExport.savedOptions(), product: captcha ? 'browser' : 'scrape' };
  const tabs = ScrapflyExport.LANGUAGES.map(({ id, label }) => {
    const on = id === selected;
    return `<button type="button" class="scrapfly-export-tab" role="tab" id="scrapflyExportTab-${id}" data-language="${id}"`
      + ` aria-controls="scrapflyExportPanel" aria-selected="${on}" tabindex="${on ? 0 : -1}">${esc(label)}</button>`;
  }).join('');
  const copyLabel = tr('advCommonCopy', 'Copy');
  const copyIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
  const aiIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
  const stepHead = (n, label) => `<div class="scrapfly-export-step-head"><span class="scrapfly-export-step-n">${n}</span><span class="scrapfly-export-step-label">${esc(label)}</span></div>`;
  const step = (n, label, cls) => `
      <div class="scrapfly-export-step ${cls}">
        ${stepHead(n, label)}
        <button type="button" class="scrapfly-export-step-cmd" data-copy="" data-copy-message="${attr(tr('advPanelCopiedToClipboard', 'Copied to clipboard'))}" title="${attr(tr('advCommonClickToCopy', 'Click to copy'))}">
          <code></code>${copyIcon}
        </button>
      </div>`;
  const captchaNote = captcha
    ? `<div data-product="scrape">${BaseAdvancedModule.kitNote(`${tr('scrapflyExportCaptchaNote',
      "This page has a CAPTCHA: the Unblocker avoids or solves it to return the page, but it doesn't fill in CAPTCHAs on forms.")} ${tr('scrapflyExportCaptchaUseBrowser', 'Use Cloud Browser to solve them.')}`, 'warning')}</div>`
    : '';
  const body = `
    <p class="scrapfly-export-intro" data-product="scrape">${esc(tr('scrapflyExportIntro',
      "Fetch this page through Scrapfly's API with the Unblocker on. It picks the browser, proxies and headers by itself, and costs nothing extra when the site doesn't block."))}</p>
    <p class="scrapfly-export-intro" data-product="browser">${esc(tr('scrapflyExportIntroBrowser',
      "Open this page in Scrapfly's Cloud Browser and drive it with Playwright. The Captcha Solver handles Turnstile, reCAPTCHA, GeeTest and more as they appear; failed solves cost nothing."))}</p>
    ${ScrapflyExport.detectedRow(protections, tr('scrapflyExportDetected', 'Detected on this page'))}
    <div class="scrapfly-export-steps">
      ${stepHead(1, tr('scrapflyExportStepSettings', 'Choose your settings'))}
      ${ScrapflyExport.optionsHtml(options, tr)}
    </div>
    <div class="scrapfly-export-steps">
      ${step(2, tr('scrapflyExportStepKey', 'Set your API key'), 'is-key')}
    </div>
    <div class="scrapfly-export-code">
      ${stepHead(3, tr('scrapflyExportStepCode', 'Copy the code'))}
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
    <div class="scrapfly-export-steps is-after">
      ${step(4, tr('scrapflyExportStepRun', 'Run it'), 'is-run')}
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
  // The tab shown: the chosen language, or the first one the product has code for
  const shownLanguage = () => {
    const list = ScrapflyExport.languagesFor(state.options.product);
    return list.find(l => l.id === state.language) || list[0];
  };
  const platform = (typeof navigator !== 'undefined') ? (navigator.userAgentData?.platform || navigator.platform || '') : '';
  const render = () => {
    const product = state.options.product;
    const language = shownLanguage();
    const { file, run } = ScrapflyExport.fileAndRun(language.id, product);
    const available = ScrapflyExport.languagesFor(product).map(l => l.id);
    overlay.querySelectorAll('.scrapfly-export-tab').forEach(tab => {
      const on = tab.dataset.language === language.id;
      tab.hidden = !available.includes(tab.dataset.language);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    overlay.querySelectorAll('[data-product]').forEach(el => { el.hidden = el.dataset.product !== product; });
    ScrapflyExport.syncOptions(overlay, state.options, tr);
    const code = ScrapflyExport.snippet(language.id, target, protections.map(p => p.name), state.options);
    overlay.querySelector('.scrapfly-export-pre code').innerHTML = ScrapflyExport.highlight(code, language.id);
    overlay.querySelector('.scrapfly-export-copy').setAttribute('data-copy', code);
    overlay.querySelector('.scrapfly-export-copy-ai').setAttribute('data-copy',
      ScrapflyExport.aiPrompt({ language: language.id, url: target, protections, options: state.options }));
    overlay.querySelector('.scrapfly-export-file').textContent = file;
    overlay.querySelector('.scrapfly-export-panel').setAttribute('aria-labelledby', `scrapflyExportTab-${language.id}`);
    const setCmd = (selector, command) => {
      const row = overlay.querySelector(selector);
      row.hidden = !command;
      row.querySelector('.scrapfly-export-step-cmd').setAttribute('data-copy', command);
      row.querySelector('code').textContent = command;
    };
    setCmd('.scrapfly-export-step.is-key', ScrapflyExport.keyCommand(platform));
    setCmd('.scrapfly-export-step.is-run', run);
    // Without a run command the code is the command: no step 4
    overlay.querySelector('.scrapfly-export-steps.is-after').hidden = !run;
  };
  ScrapflyExport.bindTabs(overlay, (id) => {
    state.language = id;
    render();
  });
  ScrapflyExport.bindOptions(overlay, (next) => {
    state.options = next;
    // The product follows the page (CAPTCHA or not), so it is not remembered
    ScrapflyExport.saveOptions({ ...next, product: 'scrape' });
    render();
  });
  render();
  return overlay;
};

// Labels of the options and their values: [i18n key, English]. Values that
// are names (Windows, Chrome, Markdown) or API words stay as they are.
const SFX_LABELS = {
  product: ['scrapflyExportProduct', 'Use'],
  unblocker: ['scrapflyExportUnblocker', 'Unblocker'],
  format: ['scrapflyExportFormat', 'Output'],
  proxyPool: ['scrapflyExportProxy', 'Proxies'],
  browserProxyPool: ['scrapflyExportProxy', 'Proxies'],
  country: ['scrapflyExportCountry', 'Country'],
  renderJs: ['scrapflyExportRenderJs', 'Render JavaScript'],
  solveCaptcha: ['scrapflyExportSolveCaptcha', 'Solve CAPTCHAs'],
  renderingWait: ['sfxOptRenderingWait', 'Wait after load'],
  waitForSelector: ['sfxOptWaitForSelector', 'Wait for element'],
  renderingStage: ['sfxOptRenderingStage', 'Page ready at'],
  autoScroll: ['sfxOptAutoScroll', 'Scroll to the bottom'],
  js: ['sfxOptJs', 'Run JavaScript'],
  jsScenario: ['sfxOptJsScenario', 'Browser actions'],
  screenshot: ['sfxOptScreenshot', 'Screenshot'],
  screenshotSelector: ['sfxOptScreenshotSelector', 'Element'],
  screenshotFlags: ['sfxOptScreenshotFlags', 'Screenshot options'],
  lang: ['sfxOptLang', 'Languages'],
  os: ['sfxOptOs', 'Operating system'],
  browserBrand: ['sfxOptBrowserBrand', 'Browser'],
  geolocation: ['sfxOptGeolocation', 'Geolocation'],
  headers: ['sfxOptHeaders', 'Headers'],
  timeout: ['sfxOptTimeout', 'Timeout'],
  retry: ['sfxOptRetry', 'Retry on errors'],
  costBudget: ['sfxOptCostBudget', 'Credit limit'],
  formatOptions: ['sfxOptFormatOptions', 'Leave out'],
  proxifiedResponse: ['sfxOptProxified', "Return the site's response"],
  extraction: ['sfxOptExtraction', 'Extract data'],
  extractionModel: ['sfxOptExtractionModel', 'Model'],
  extractionPrompt: ['sfxOptExtractionPrompt', 'Prompt'],
  extractionTemplate: ['sfxOptExtractionTemplate', 'Saved template'],
  cache: ['sfxOptCache', 'Cache'],
  cacheTtl: ['sfxOptCacheTtl', 'Keep for'],
  cacheClear: ['sfxOptCacheClear', 'Refresh the cache'],
  session: ['sfxOptSession', 'Session'],
  sessionStickyProxy: ['sfxOptSticky', 'Same proxy for the session'],
  debug: ['sfxOptDebug', 'Debug'],
  correlationId: ['sfxOptCorrelationId', 'Correlation ID'],
  tags: ['sfxOptTags', 'Tags'],
  dns: ['sfxOptDns', 'DNS details'],
  ssl: ['sfxOptSsl', 'SSL certificate'],
  webhook: ['sfxOptWebhook', 'Webhook'],
  cbMode: ['sfxOptMode', 'Start'],
  cbTargetUrl: ['sfxOptTargetUrl', 'Declare this page'],
  cbOs: ['sfxOptOs', 'Operating system'],
  cbBrand: ['sfxOptBrowserBrand', 'Browser'],
  cbLang: ['sfxOptBrowserLang', 'Language'],
  cbLanguages: ['sfxOptLang', 'Languages'],
  cbSession: ['sfxOptSession', 'Session'],
  cbAutoClose: ['sfxOptAutoClose', 'Close on disconnect'],
  cbTimeout: ['sfxOptSessionTimeout', 'Session length'],
  cbUnblockTimeout: ['sfxOptUnblockTimeout', 'Unblock time limit'],
  cbBlockImages: ['sfxOptBlockImages', 'Block images'],
  cbBlockStyles: ['sfxOptBlockStyles', 'Block stylesheets'],
  cbBlockFonts: ['sfxOptBlockFonts', 'Block fonts'],
  cbBlockMedia: ['sfxOptBlockMedia', 'Block video and audio'],
  cbBlacklist: ['sfxOptBlacklist', 'Block trackers'],
  cbCache: ['sfxOptBrowserCache', 'Cache static files'],
  cbDebug: ['sfxOptRecord', 'Record the session'],
  cbEnableMcp: ['sfxOptMcp', 'MCP endpoint']
};
const SFX_VALUE_LABELS = {
  '': ['sfxValAuto', 'Automatic'],
  scrape: [null, 'Scrape API'], browser: [null, 'Cloud Browser'],
  raw: [null, 'HTML'], clean_html: ['sfxValCleanHtml', 'Clean HTML'], json: [null, 'JSON'], markdown: [null, 'Markdown'], text: ['scrapflyExportFormatText', 'Text'],
  public_datacenter_pool: ['scrapflyExportProxyDatacenter', 'Datacenter'], public_residential_pool: ['scrapflyExportProxyResidential', 'Residential'],
  datacenter: ['scrapflyExportProxyDatacenter', 'Datacenter'], residential: ['scrapflyExportProxyResidential', 'Residential'],
  complete: ['sfxValComplete', 'Full load'], domcontentloaded: ['sfxValDomReady', 'DOM ready'],
  fullpage: ['sfxValFullPage', 'Full page'], selector: ['sfxValElement', 'Element'],
  load_images: ['sfxValLoadImages', 'Load images'], dark_mode: ['sfxValDarkMode', 'Dark mode'], block_banners: ['sfxValBlockBanners', 'Hide banners'],
  high_quality: ['sfxValHighQuality', 'High quality'], print_media_format: ['sfxValPrint', 'Print style'],
  no_links: ['sfxValNoLinks', 'Links'], no_images: ['sfxValNoImages', 'Images'], only_content: ['sfxValOnlyContent', 'All but main content'],
  model: ['sfxValModel', 'AI model'], prompt: ['sfxOptExtractionPrompt', 'Prompt'], template: ['sfxValTemplate', 'Template'],
  connect: ['sfxValConnect', 'Open a browser'], unblock: ['sfxValUnblock', 'Unblock first'],
  win11: [null, 'Windows 11'], windows: [null, 'Windows'], mac: [null, 'macOS'], macos: [null, 'macOS'], linux: [null, 'Linux'], chromeos: [null, 'ChromeOS'],
  android: [null, 'Android'], iphone: [null, 'iPhone'], ipad: [null, 'iPad'],
  chrome: [null, 'Chrome'], edge: [null, 'Edge'], brave: [null, 'Brave'], opera: [null, 'Opera']
};
const SFX_GROUP_LABELS = {
  render: ['sfxGroupRender', 'Browser rendering'], location: ['sfxGroupLocation', 'Location and fingerprint'],
  request: ['sfxGroupRequest', 'Request'], output: ['sfxGroupOutput', 'Output'], extraction: ['sfxGroupExtraction', 'AI extraction'],
  cache: ['sfxGroupCache', 'Cache and session'], tracking: ['sfxGroupTracking', 'Debug and tracking'],
  bfingerprint: ['sfxGroupFingerprint', 'Fingerprint and language'], bsession: ['sfxGroupSession', 'Session'],
  bblock: ['sfxGroupBlocking', 'Blocking and cache'], btools: ['sfxGroupTools', 'Debug and MCP']
};
const SFX_WHY = {
  needsRender: ['sfxWhyRender', 'Needs Render JavaScript'],
  needsUnblocker: ['sfxWhyUnblocker', 'Needs the Unblocker'],
  needsMarkdown: ['sfxWhyMarkdown', 'Markdown or Text output only'],
  needsCache: ['sfxWhyCache', 'Turn on Cache first'],
  needsSession: ['sfxWhySession', 'Set a session first'],
  stickyUnblocker: ['sfxWhySticky', 'Always on with the Unblocker'],
  badJson: ['sfxWhyJson', 'Not a JSON list of steps: left out'],
  badGeo: ['sfxWhyGeo', 'Use latitude,longitude: left out'],
  brandOs: ['sfxWhyBrandOs', "This browser doesn't run on that system: left out"],
  edgeWindows: ['sfxWhyEdge', 'Edge needs Windows: left out']
};
const SFX_HINTS = {
  unblocker: ['scrapflyExportUnblockerHint', 'Anti-bot bypass'],
  renderJs: ['scrapflyExportRenderJsCost', '+5 credits'],
  solveCaptcha: ['scrapflyExportSolveCaptchaHint', 'Paid per solve'],
  headers: ['sfxHintHeaders', 'One per line: Name: value. Not saved.'],
  jsScenario: ['sfxHintScenario', 'JSON list: click, fill, wait, scroll, execute, wait_for_selector, wait_for_navigation'],
  lang: ['sfxHintList', 'Comma-separated'],
  tags: ['sfxHintList', 'Comma-separated'],
  cbLanguages: ['sfxHintLanguages', 'Comma-separated, up to 3'],
  cbMode: ['sfxHintUnblock', 'Unblock first returns a browser already past the anti-bot wall']
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

/** The options card: the main switches, then folded sections with the rest */
ScrapflyExport.optionsHtml = function(options, tr) {
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const o = ScrapflyExport.normalizeOptions(options);
  const t = ([key, fallback]) => (key ? tr(key, fallback) : fallback);
  const valueLabel = (field, value) => {
    if (field.key === 'country') return value ? scrapflyCountryName(value) : tr('scrapflyExportCountryAny', 'Any');
    if (field.key === 'extraction' && !value) return tr('sfxValOff', 'Off');
    if (field.key === 'screenshot' && !value) return tr('sfxValOff', 'Off');
    if (field.key === 'extractionModel') return value;
    const label = SFX_VALUE_LABELS[value];
    return label ? t(label) : value;
  };
  const api = (field) => (field.api ? `<code class="scrapfly-export-api">${esc(field.api)}</code>` : '');
  const head = (field, forId) => {
    const text = esc(t(SFX_LABELS[field.key]));
    const label = forId ? `<label class="scrapfly-export-option-label" for="${forId}">${text}</label>` : `<span class="scrapfly-export-option-label" id="scrapflyExportOpt-${field.key}">${text}</span>`;
    return `<span class="scrapfly-export-option-head">${label}${api(field)}</span>`;
  };
  const hint = (field) => (SFX_HINTS[field.key] ? `<span class="scrapfly-export-cost">${esc(t(SFX_HINTS[field.key]))}</span>` : '');
  const row = (field, control, wide = false) => `
      <div class="scrapfly-export-option${wide ? ' is-wide' : ''}" data-field="${field.key}">
        ${control}
        <span class="scrapfly-export-why" hidden></span>
      </div>`;
  const control = (field) => {
    const id = `scrapflyExportOpt-${field.key}`;
    const v = o[field.key];
    switch (field.kind) {
      case 'bool':
        return row(field, `${head(field, id)}
        <span class="scrapfly-export-toggle-wrap">${hint(field)}
          <input type="checkbox" role="switch" class="scrapfly-export-switch" id="${id}" data-option="${field.key}"${v ? ' checked' : ''}>
        </span>`);
      case 'choice': {
        if (field.values.length <= 3 && field.key !== 'country') {
          const note = SFX_HINTS[field.key] ? `<span class="scrapfly-export-note">${esc(t(SFX_HINTS[field.key]))}</span>` : '';
          return row(field, `${head(field)}
        <div class="scrapfly-export-seg" role="radiogroup" aria-labelledby="${id}" data-option="${field.key}">
          ${field.values.map(value => `<button type="button" role="radio" class="scrapfly-export-seg-btn" data-value="${attr(value)}" aria-checked="${v === value}" tabindex="${v === value ? 0 : -1}">${esc(valueLabel(field, value))}</button>`).join('')}
        </div>${note}`, Boolean(note));
        }
        const items = field.values.map(value => (
          `<li role="option" class="scrapfly-export-dd-item" id="${id}-${value || 'any'}" data-value="${attr(value)}" aria-selected="${v === value}">${esc(valueLabel(field, value))}</li>`
        )).join('');
        return row(field, `${head(field)}
        <div class="scrapfly-export-dd" data-option="${field.key}" data-value="${attr(v)}">
          <button type="button" class="scrapfly-export-dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id} ${id}-value">
            <span id="${id}-value">${esc(valueLabel(field, v))}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <ul class="scrapfly-export-dd-list" role="listbox" tabindex="-1" aria-labelledby="${id}" hidden>${items}</ul>
        </div>`);
      }
      case 'int':
        return row(field, `${head(field, id)}
        <span class="scrapfly-export-num">
          <input type="number" class="scrapfly-export-input" id="${id}" data-option="${field.key}" min="${field.min}" max="${field.max}" step="1" inputmode="numeric" value="${attr(v)}" placeholder="${attr(field.placeholder || '')}">
          ${field.unit ? `<span class="scrapfly-export-unit">${esc(field.unit)}</span>` : ''}
        </span>`);
      case 'text':
        return row(field, `${head(field, id)}
        <input type="text" class="scrapfly-export-input" id="${id}" data-option="${field.key}" maxlength="${field.max || 500}" spellcheck="false" autocomplete="off" value="${attr(v)}" placeholder="${attr(field.placeholder || '')}">`);
      case 'area':
        return row(field, `${head(field, id)}${hint(field)}
        <textarea class="scrapfly-export-input scrapfly-export-area" id="${id}" data-option="${field.key}" rows="3" maxlength="${field.max}" spellcheck="false" placeholder="${attr(field.placeholder || '')}">${esc(v)}</textarea>`, true);
      case 'multi':
        return row(field, `${head(field)}
        <div class="scrapfly-export-multi" role="group" aria-labelledby="${id}" data-option="${field.key}">
          ${field.values.map(value => `<label class="scrapfly-export-chk"><input type="checkbox" value="${attr(value)}"${v.includes(value) ? ' checked' : ''}><span>${esc(valueLabel(field, value))}</span></label>`).join('')}
        </div>`, true);
      default:
        return '';
    }
  };
  const main = ScrapflyExport.FIELDS.filter(f => !f.group);
  const groups = [...ScrapflyExport.GROUPS.scrape.map(g => ['scrape', g]), ...ScrapflyExport.GROUPS.browser.map(g => ['browser', g])];
  return `
    <section class="scrapfly-export-options" aria-label="${attr(tr('scrapflyExportOptions', 'Options'))}">
      ${main.map(control).join('')}
    </section>
    <div class="scrapfly-export-more">
      ${groups.map(([product, group]) => `
      <details class="scrapfly-export-group" data-product="${product}" data-group="${group}">
        <summary><span>${esc(t(SFX_GROUP_LABELS[group]))}</span><span class="scrapfly-export-group-count" hidden></span></summary>
        <div class="scrapfly-export-group-body">
          ${ScrapflyExport.FIELDS.filter(f => f.group === group).map(control).join('')}
        </div>
      </details>`).join('')}
    </div>`;
};

/** Rows shown, greyed out with their reason, and set-option counts per section */
ScrapflyExport.syncOptions = function(root, options, tr) {
  const o = ScrapflyExport.normalizeOptions(options);
  root.querySelectorAll('.scrapfly-export-option[data-field]').forEach((el) => {
    const field = ScrapflyExport.field(el.dataset.field);
    const state = ScrapflyExport.fieldState(field, o);
    el.hidden = !state.shown;
    el.classList.toggle('is-inactive', state.shown && !state.active);
    if (field.apiFor) el.querySelector('.scrapfly-export-api').textContent = field.apiFor(o);
    const why = el.querySelector('.scrapfly-export-why');
    const reason = state.why && SFX_WHY[state.why];
    why.hidden = !reason;
    why.textContent = reason ? tr(reason[0], reason[1]) : '';
  });
  // How many options of each section change the code
  const d = ScrapflyExport.DEFAULT_OPTIONS;
  root.querySelectorAll('.scrapfly-export-group').forEach((group) => {
    const changed = ScrapflyExport.FIELDS.filter(f => f.group === group.dataset.group && ScrapflyExport.fieldState(f, o).active
      && JSON.stringify(o[f.key]) !== JSON.stringify(d[f.key])).length;
    // A section of the other product, or with nothing to show in this mode, is hidden
    group.hidden = group.dataset.product !== o.product || !group.querySelector('.scrapfly-export-option[data-field]:not([hidden])');
    const badge = group.querySelector('.scrapfly-export-group-count');
    badge.hidden = changed === 0;
    badge.textContent = String(changed);
  });
};

/** Options change the code at once; `onChange` gets the full option set */
ScrapflyExport.bindOptions = function(root, onChange) {
  const read = () => {
    const value = {};
    root.querySelectorAll('[data-option]').forEach((el) => {
      const key = el.dataset.option;
      if (el.classList.contains('scrapfly-export-seg')) {
        const on = el.querySelector('[aria-checked="true"]');
        value[key] = on ? on.dataset.value : '';
      } else if (el.classList.contains('scrapfly-export-dd')) value[key] = el.dataset.value;
      else if (el.classList.contains('scrapfly-export-multi')) value[key] = Array.from(el.querySelectorAll('input:checked'), i => i.value);
      else if (el.type === 'checkbox') value[key] = el.checked;
      else value[key] = el.value;
    });
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
  root.querySelectorAll('.scrapfly-export-dd').forEach(dd => ScrapflyExport.bindDropdown(dd, () => onChange(read())));
  root.querySelectorAll('input[type="checkbox"][data-option], .scrapfly-export-multi input').forEach(el => el.addEventListener('change', () => onChange(read())));
  root.querySelectorAll('input.scrapfly-export-input, textarea.scrapfly-export-input').forEach(el => el.addEventListener('input', () => onChange(read())));
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
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (event) => {
      // Tabs of languages without code for the product are hidden: skip them
      const shown = tabs.filter(t => !t.hidden);
      const index = shown.indexOf(tab);
      const step = event.key === forward ? 1 : (event.key === 'ArrowLeft' || event.key === 'ArrowRight') ? -1 : 0;
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        select(shown[event.key === 'Home' ? 0 : shown.length - 1], true);
      } else if (step) {
        event.preventDefault();
        select(shown[(index + step + shown.length) % shown.length], true);
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
