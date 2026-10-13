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