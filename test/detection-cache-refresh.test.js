const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → cache scope (and Settings → Data → Clear the cache) ask the Detection tab to show what the cache has for the page
// now. It used to empty #detectionResults first, which holds the summary card, the search, the chips, the list and the
// pagination: the results that came back had nowhere to be drawn, and the tab stayed blank (while it still believed it was
// showing results) until the popup was opened again. The tab's markup is what everything is drawn into, so it stays as it is.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const WorkerMessages = require('../modules/core/worker-messages.js');

const MARKUP = '<div id="detectionOverview"><input id="detectionSearch"><div id="detectionFilters"><button data-filter="antibot"></button></div></div>'
  + '<div id="resultsList"></div><div id="detectionPagination"></div>';
const stored = [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90 }, { detector: { name: 'reCAPTCHA' }, category: 'CAPTCHA', confidence: 80 }];

/** The real Detection class and processDetectionData, with a fake browser: the page's active tab and what the worker answers. */
function tab({ active = [{ id: 12, url: 'https://shop.example/cart' }], answer = { data: { detectionResults: stored, expiry: Date.now() + 60000, url: 'https://shop.example/cart', cacheScope: 'domain', timestamp: 1, fromStorage: true }, status: 'ok' } } = {}) {
  const log = { messages: [], badges: [], shown: [], empty: [], logs: [] };
  const results = { _html: MARKUP, get innerHTML() { return this._html; }, set innerHTML(value) { this._html = String(value); } };
  const context = vm.createContext({
    console, self: {}, window: {}, WorkerMessages, setTimeout, clearTimeout,
    Logger: { debug: (...a) => log.logs.push(a), warn() {}, error() {}, ui() {} },
    BADGE: { COLORS: { CLEARED: '#6B7280' }, TEXT: { CLEARED: 'CLR' } },
    setBadgeTextColor: async (id, flag, color) => { log.badges.push(['color', id, color]); },
    chrome: {
      tabs: { query: async () => active },
      runtime: {
        // both forms, as Chrome has them: a callback, or a promise when none is given
        sendMessage: (message, callback) => {
          log.messages.push(message);
          const outcome = typeof answer === 'function' ? answer(message) : answer;
          const settle = () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome));
          if (typeof callback === 'function') { settle().then(callback, () => callback(undefined)); return undefined; }
          return settle();
        }
      },
      action: {
        setBadgeText: async (o) => { log.badges.push(['text', o.tabId, o.text]); },
        setBadgeBackgroundColor: async (o) => { log.badges.push(['background', o.tabId, o.color]); }
      }
    },
    document: { querySelector: (selector) => (selector === '#detectionResults' ? results : null) }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-requests.js'), context, { filename: 'detection-requests.js' });
  vm.runInContext(read('sections/detection/detection.js'), context, { filename: 'detection.js' });
  const Detection = context.window.Detection;
  const detection = Object.create(Detection.prototype);
  Object.assign(detection, {
    isExtensionEnabled: true, debugMode: false, currentResults: stored.slice(), isShowingResults: true, justClearedCache: false,
    searchQuery: 'cloud', activeChips: { categories: ['antibot'] },
    detectionEngine: { setDetectors() {} }, detectorManager: { getAllDetectors: () => ({}) },
    updateCacheInfo() { log.updated = (log.updated || 0) + 1; },
    tellAdvancedResultsGone() { log.advancedTold = (log.advancedTold || 0) + 1; },
    paginationManager: { setItems(items) { log.pagination = items; } },
    // what draws the results is the Detection tab's own displayResults/showEmptyState (their own tests); here is who calls them, and with what
    async displayResults(detections, options) { log.shown.push({ detections: Array.from(detections, d => d.detector.name), options }); },
    showEmptyState(options) { log.empty.push(options); }
  });
  return { detection, log, results };
}

test('the tab\'s markup is left as it is: the summary card, the search, the chips, the list and the pagination are what the results are drawn into', async () => {
  const { detection, results } = tab();
  await detection.refreshAfterCacheChange();
  assert.equal(results.innerHTML, MARKUP, '#detectionResults was not emptied');
});

test('the page\'s cached results are drawn again, the way any other view of them is, and the call ends once they are', async () => {
  const { detection, log } = tab();
  await detection.refreshAfterCacheChange();
  assert.deepEqual(log.messages.map(m => [m.type, m.tabId]), [[WorkerMessages.GET_DETECTION_DATA, 12]], 'asked for the active tab');
  assert.equal(log.shown.length, 1, 'drawn once, by the tab\'s own displayResults');
  assert.deepEqual(log.shown[0].detections, ['Cloudflare', 'reCAPTCHA']);
  assert.equal(log.shown[0].options.fromStorage, true, 'a stored result, as a cache lookup answers');
  assert.equal(log.shown[0].options.cacheMetadata.url, 'https://shop.example/cart');
  assert.deepEqual(log.empty, [], 'no empty card over results');
  assert.equal(log.updated, 1, 'the Cache tile follows the scope');
});

test('what the person set up stays: the search and the chips', async () => {
  const { detection } = tab();
  await detection.refreshAfterCacheChange();
  assert.equal(detection.searchQuery, 'cloud');
  assert.deepEqual(JSON.parse(JSON.stringify(detection.activeChips)), { categories: ['antibot'] });
});

test('a page the cache has nothing for under the new scope shows the no-completed-scan card and the cleared mark, not a blank tab', async () => {
  const { detection, log, results } = tab({ answer: { data: null, status: 'ok' } });
  await detection.refreshAfterCacheChange();
  assert.deepEqual(JSON.parse(JSON.stringify(log.empty)), [{ outcome: 'unscanned' }]);
  assert.deepEqual(log.shown, []);
  assert.deepEqual(log.badges.map(b => b[0]), ['color', 'text', 'background']);
  assert.deepEqual(log.badges.find(b => b[0] === 'text'), ['text', 12, 'CLR']);
  assert.equal(results.innerHTML, MARKUP, 'the markup is there for the next scan to draw into');
});

test('a worker that does not answer is the same card, and a tab that cannot be read changes nothing', async () => {
  let h = tab({ answer: new Error('Could not establish connection. Receiving end does not exist.') });
  await h.detection.refreshAfterCacheChange();
  assert.deepEqual(JSON.parse(JSON.stringify(h.log.empty)), [{ outcome: 'unscanned' }]);
  assert.equal(h.results.innerHTML, MARKUP);

  h = tab({ active: [] });
  await h.detection.refreshAfterCacheChange();
  assert.deepEqual(h.log.messages, [], 'no tab: nobody to ask about');
  assert.deepEqual(h.log.empty, []);
  assert.deepEqual(h.log.shown, []);
  assert.equal(h.results.innerHTML, MARKUP);
});

test('the message from another extension page and the Settings call both go through it', () => {
  const source = read('sections/detection/detection.js');
  assert.match(source, /message\.type === WorkerMessages\.DETECTION_CLEAR_CACHE[\s\S]{0,120}this\.refreshAfterCacheChange\(\)/);
  assert.ok(!/detectionResults\.innerHTML\s*=/.test(source) && !/#detectionResults'\)[\s\S]{0,80}innerHTML = ''/.test(source), 'nothing in the tab empties #detectionResults');
  assert.match(read('sections/settings/settings-ui.js'), /detection\?\.refreshAfterCacheChange\?\.\(\)/);
  assert.match(read('sections/settings/settings-ui-storage.js'), /detection\?\.refreshAfterCacheChange\?\.\(\)/);
});
