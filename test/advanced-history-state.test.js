const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function node() {
  const listeners = new Map(), classes = new Set();
  return { style: {}, dataset: {}, innerHTML: '', value: '',
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    dispatch(name) { return listeners.get(name)?.({ target: this }); },
    focus() { this.focused = true; }, querySelector() { return null; } };
}

function fixture() {
  let history = {}, panelReplaced = false;
  const elements = Object.fromEntries(['.history-v2-shell', '#captureGrid', '#captureEmptyState',
    '#captureOpenToolsBtn', '#captureChips', '#captureCurrentHost', '#captureSearchInput', '#captureMenuBtn', '#captureMenu',
    '#exportCapturesBtn', '#clearAllCapturesBtn', '#toolsPanel', '#advancedContent'].map(selector => [selector, node()]));
  // The Current site / All sites switch
  const scope = ['current', 'all'].map(site => Object.assign(node(), { dataset: { site }, setAttribute(name, value) { this[name] = value; } }));
  elements['#captureChips'].querySelectorAll = () => [];
  const panel = node();
  Object.defineProperty(panel, 'innerHTML', { set() { panelReplaced = true; } });
  panel.querySelector = selector => panelReplaced ? null : elements[selector] || null;
  const context = { window: {}, URL, Logger: { ui() {}, debug() {}, error(error) { throw error; } },
    FormatUtils: require('../utils/format-utils'),
    AdvancedHistoryStore: { load: async () => history },
    document: { querySelector: selector => selector === '#capturesPanel' ? panel : panel.querySelector(selector),
      querySelectorAll: selector => (selector === '.cap-scope-btn' ? scope : []), addEventListener() {} },
    setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/advanced/vendor-registry.js'), 'utf8'), context);
  for (const file of ['advanced.js', 'history/controller.js', 'history/view.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced', file), 'utf8'), context);
  }
  const advanced = new context.window.Advanced({}, {});
  advanced.cleanExpiredCaptureData = async () => {};
  advanced.getCurrentSite = async () => 'example.test';
  // Observe the cards passed to the renderer; the browser fixture checks their DOM.
  advanced.renderCaptureCards = (captures, container) => {
    const grid = container.querySelector('#captureGrid');
    if (grid) grid.innerHTML = captures.map(capture => capture.id).join(',');
  };
  return { advanced, elements, panel, scope, save: value => { history = value; } };
}

test('capture history can show its first capture after rendering empty without losing controls', async () => {
  const { advanced, elements, panel, save } = fixture();
  await advanced.renderUnifiedCaptureHistory();
  save({ akamai: [{ id: 'first-capture', timestamp: Date.now(), url: 'https://example.test' }] });
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(panel.querySelector('#captureChips'), elements['#captureChips']);
  assert.equal(elements['#captureGrid'].innerHTML, 'first-capture');
  assert.equal(elements['#captureEmptyState'].style.display, 'none');
  assert.notEqual(elements['.history-v2-shell'].style.display, 'none');
  save({});
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(elements['#captureGrid'].innerHTML, '', 'old capture data must leave the DOM');
  assert.equal(elements['.history-v2-shell'].style.display, 'none');
});

test('filters work when the first history view has no captures on the current site', async () => {
  const { advanced, elements, scope, save } = fixture();
  save({ akamai: [{ id: 'other-site', timestamp: Date.now(), url: 'https://other.test' }] });
  await advanced.renderUnifiedCaptureHistory();
  assert.match(elements['#captureGrid'].innerHTML, /No captures found/);
  assert.equal(scope[0]['aria-pressed'], 'true', 'Current site is on');
  await scope[1].dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['#captureGrid'].innerHTML, 'other-site');
  assert.equal(advanced.captureFilters.site, 'all');
  assert.equal(scope[1]['aria-pressed'], 'true', 'All sites is on');
  assert.equal(elements['#captureCurrentHost'].textContent, 'example.test', 'the current site is named under its button');
});

test('the empty history action opens Tools and moves focus into the visible panel', async () => {
  const { advanced, elements } = fixture();
  const visits = [];
  advanced.switchAdvancedTab = async tab => visits.push(tab);
  await advanced.renderUnifiedCaptureHistory();
  await advanced.renderUnifiedCaptureHistory();
  await elements['#captureOpenToolsBtn'].dispatch('click');
  assert.deepEqual(visits, ['tools']);
  assert.equal(elements['#toolsPanel'].focused, true);
});

test('only truly empty capture history expands its parent for centered layout', async () => {
  const { advanced, elements, panel, save } = fixture();
  const content = elements['#advancedContent'];
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(content.classList.contains('is-capture-history-empty'), true);
  assert.equal(panel.classList.contains('is-empty'), true);

  save({ recaptcha: [{ id: 'capture', timestamp: Date.now(), url: 'https://example.test' }] });
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(content.classList.contains('is-capture-history-empty'), false);
  assert.equal(panel.classList.contains('is-empty'), false);

  advanced.captureFilters.search = 'no-such-capture';
  await advanced.renderUnifiedCaptureHistory();
  assert.match(elements['#captureGrid'].innerHTML, /No captures found/);
  assert.equal(content.classList.contains('is-capture-history-empty'), false,
    'filtered results must retain the populated controls and natural layout');

  save({});
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(content.classList.contains('is-capture-history-empty'), true);
  assert.equal(elements['#captureEmptyState'].style.display, 'flex');
});

test('returning to empty capture history clears the grid and leaves the filters alone', async () => {
  const { advanced, elements } = fixture();
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(elements['#captureGrid'].innerHTML, '');
  assert.equal(advanced.captureFilters.site, 'current', 'empty styling must not mutate filters');
});

test('the History badge follows saved captures without opening the History tab', async () => {
  const listeners = [];
  const badge = node();
  const context = { window: {}, URL, Logger: { ui() {}, debug() {}, error(error) { throw error; } },
    FormatUtils: require('../utils/format-utils'),
    AdvancedHistoryStore: { STORAGE_KEY: 'scrapfly_advanced_history', load: async () => saved },
    chrome: { storage: { onChanged: { addListener: (fn) => listeners.push(fn) } } },
    document: { querySelector: selector => (selector === '#captureCountBadge' ? badge : null) },
    setTimeout, clearTimeout };
  let saved = { recaptcha: [{ id: 'a', timestamp: Date.now(), url: 'https://example.test/' }] };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/advanced/vendor-registry.js'), 'utf8'), context);
  for (const file of ['advanced.js', 'history/controller.js', 'history/view.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced', file), 'utf8'), context);
  }
  const advanced = new context.window.Advanced({}, {});
  advanced.cleanExpiredCaptureData = async () => {};
  advanced.getCurrentSite = async () => 'example.test';
  advanced.setupCaptureHistoryWatcher();
  advanced.setupCaptureHistoryWatcher();
  assert.equal(listeners.length, 1, 'bound once');
  const wait = () => new Promise(resolve => setTimeout(resolve, 220));

  // A tool result is saved (as saveToolResult does): the badge goes up by itself
  saved = { recaptcha: [...saved.recaptcha, { id: 'b', timestamp: Date.now(), url: 'https://example.test/x' }] };
  listeners[0]({ scrapfly_advanced_history: { newValue: saved } }, 'local');
  await wait();
  assert.equal(badge.textContent, 2);
  assert.equal(badge.style.display, 'inline-block');

  // Unrelated keys, other storage areas and bursts do not cause extra refreshes
  let refreshes = 0;
  const original = advanced.updateCaptureCountBadge.bind(advanced);
  advanced.updateCaptureCountBadge = async () => { refreshes++; return original(); };
  listeners[0]({ scrapfly_settings: {} }, 'local');
  listeners[0]({ scrapfly_advanced_history: {} }, 'sync');
  for (let i = 0; i < 5; i++) listeners[0]({ scrapfly_advanced_history: {} }, 'local');
  await wait();
  assert.equal(refreshes, 1, 'one refresh for a burst of writes');

  saved = {};
  listeners[0]({ scrapfly_advanced_history: {} }, 'local');
  await wait();
  assert.equal(badge.style.display, 'none', 'cleared history hides the badge');
});

test('every history card has a tool tag in the current language, Analyze Scripts included', () => {
  const es = { btnCheckCookies: 'Comprobar cookies', btnAnalyzeScripts: 'Analizar scripts', advHistoryCaptureTag: 'Captura',
    btnExtractSiteKey: 'Extraer clave del sitio' };
  const grid = node();
  grid.querySelectorAll = () => [];
  const context = { window: {}, URL, Logger: { ui() {}, debug() {}, error(error) { throw error; } },
    FormatUtils: require('../utils/format-utils'),
    I18n: { get: key => es[key] || '', format: () => '' },
    AdvancedUtils: { getTimeAgo: () => 'hace 15 s', formatBytes: () => '630 B', escapeHtml: value => require('../utils/format-utils').escapeHtml(value) },
    UrlUtils: { resolveDisplayFavicon: () => '', getHostnameFromUrl: url => new URL(url).hostname, getDefaultFaviconUrl: () => '' },
    document: { querySelectorAll: () => [] } };
  vm.createContext(context);
  vm.runInContext('class BaseAdvancedModule { static SCRAPFLY_TOOL_SUFFIX = "ScrapeWithScrapfly"; } this.BaseAdvancedModule = BaseAdvancedModule;', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/components/tool-grid.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/advanced/vendor-registry.js'), 'utf8'), context);
  for (const file of ['advanced.js', 'history/controller.js', 'history/view.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced', file), 'utf8'), context);
  }
  const Advanced = context.window.Advanced;
  const entry = (id, data) => ({ id, moduleId: 'awswaf', moduleName: 'AWS WAF', url: 'https://coinmarketcap.com/es/', timestamp: Date.now(), data });
  // As saved: the worker's Analyze Scripts result has no label; Check Cookies kept the label of the language it ran in
  const captures = [
    entry('scripts', { schemaVersion: 1, tool: 'analysis', label: '', result: { scripts: [] } }),
    entry('cookies', { schemaVersion: 1, tool: 'awswafCheckCookies', label: 'Check Cookies', result: {} }),
    entry('capture', { sensorData: 'x' }),
    entry('other', { schemaVersion: 1, tool: 'akamaiSomething', label: 'Tool <b>name</b>', result: {} })
  ];
  assert.equal(Advanced.captureKind(captures[0]), 'scripts', 'filed under Analyze Scripts, not Other tools');
  const advanced = new Advanced({}, {});
  advanced.setupCaptureCardListeners = () => {};
  advanced.renderCaptureCards(captures, { querySelector: () => grid });
  const tags = [...grid.innerHTML.matchAll(/<span class="cap-row-tool">([^<]*)<\/span>/g)].map(match => match[1]);
  // Each row names its vendor and shows its logo
  assert.equal([...grid.innerHTML.matchAll(/<span class="cap-row-vendor">AWS WAF<\/span>/g)].length, 4);
  assert.match(grid.innerHTML, /detectors\/icons\/aws_official\.png/);
  assert.deepEqual(tags, ['Analizar scripts', 'Comprobar cookies', 'Captura', 'Tool &lt;b&gt;name&lt;/b&gt;']);
});
