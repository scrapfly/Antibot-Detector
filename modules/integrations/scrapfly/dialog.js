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
    setCmd('.scrapfly-export-step.is-key', ScrapflyExport.keyCommand(platform, language.id));
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
