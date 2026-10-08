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
    focus() { this.focused = true; } };
}

function fixture() {
  let history = {}, panelReplaced = false;
  const elements = Object.fromEntries(['.history-v2-shell', '#captureGrid', '#captureEmptyState',
    '#captureOpenToolsBtn', '#captureSiteFilter', '#captureModuleFilter', '#captureSearchInput',
    '#exportCapturesBtn', '#clearAllCapturesBtn', '#toolsPanel', '#advancedContent',
    '#capturePagination'].map(selector => [selector, node()]));
  const panel = node();
  Object.defineProperty(panel, 'innerHTML', { set() { panelReplaced = true; } });
  panel.querySelector = selector => panelReplaced ? null : elements[selector] || null;
  const context = { window: {}, URL, Logger: { ui() {}, debug() {}, error(error) { throw error; } },
    FormatUtils: require('../utils/format-utils'),
    AdvancedHistoryStore: { load: async () => history },
    document: { querySelector: selector => selector === '#capturesPanel' ? panel : panel.querySelector(selector) },
    setTimeout, clearTimeout };
  vm.createContext(context);
  for (const file of ['advanced.js', 'advanced-history.js']) {
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
  return { advanced, elements, panel, save: value => { history = value; } };
}

test('capture history can show its first capture after rendering empty without losing controls', async () => {
  const { advanced, elements, panel, save } = fixture();
  await advanced.renderUnifiedCaptureHistory();
  save({ akamai: [{ id: 'first-capture', timestamp: Date.now(), url: 'https://example.test' }] });
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(panel.querySelector('#captureSiteFilter'), elements['#captureSiteFilter']);
  assert.equal(elements['#captureGrid'].innerHTML, 'first-capture');
  assert.equal(elements['#captureEmptyState'].style.display, 'none');
  assert.notEqual(elements['.history-v2-shell'].style.display, 'none');
  save({});
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(elements['#captureGrid'].innerHTML, '', 'old capture data must leave the DOM');
  assert.equal(elements['.history-v2-shell'].style.display, 'none');
});

test('filters work when the first history view has no captures on the current site', async () => {
  const { advanced, elements, save } = fixture();
  save({ akamai: [{ id: 'other-site', timestamp: Date.now(), url: 'https://other.test' }] });
  await advanced.renderUnifiedCaptureHistory();
  assert.match(elements['#captureGrid'].innerHTML, /No captures found/);
  elements['#captureSiteFilter'].value = 'all';
  await elements['#captureSiteFilter'].dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['#captureGrid'].innerHTML, 'other-site');
  assert.equal(advanced.captureFilters.site, 'all');
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

test('returning to empty capture history hides any stale pagination', async () => {
  const { advanced, elements } = fixture();
  elements['#capturePagination'].style.display = 'flex';
  await advanced.renderUnifiedCaptureHistory();
  assert.equal(elements['#capturePagination'].style.display, 'none');
  assert.equal(elements['#captureGrid'].innerHTML, '');
  assert.equal(elements['#captureSiteFilter'].value, '', 'empty styling must not mutate filters');
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
  for (const file of ['advanced.js', 'advanced-history.js']) {
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
