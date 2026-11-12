const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Coming back to the Detection tab with a search or a category chip on: the cards are drawn again, and they are drawn as the
// search and the chips leave them. The whole list, however briefly (or for good, when the check for a saved result is
// skipped), under chips that show as pressed, is wrong.

const root = path.join(__dirname, '..');
const element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, dataset: {}, scrollTop: 0, tabIndex: 0 });

function harness({ results }) {
  const log = [];
  const context = vm.createContext({
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { debug() {}, ui() {}, error() { assert.fail('unexpected popup error'); } },
    window: { addEventListener() {} },
    document: { addEventListener() {}, querySelector: () => element(), querySelectorAll: () => [] },
    // what draws the list as the search and the chips leave it (its own tests); here is who calls it
    DetectionUI: { applyFilters(options) { log.push(['applyFilters', this, options]); } }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8') + '\nthis.ScrapflyPopup = ScrapflyPopup;', context, { filename: 'popup.js' });
  const popup = Object.create(context.ScrapflyPopup.prototype);
  Object.assign(popup, {
    currentTab: 'history',
    detectionViewRequestId: 0,
    history: { cleanup() {} },
    rules: { initialized: true, setupEventListeners() {}, displayRules(options) { log.push(['displayRules', options]); } },
    advanced: null,
    settings: {},
    // the check for a saved result: it may draw, or (a second check within a second of the last) do nothing
    checkAndDisplayExistingDetection: async () => { log.push(['checked']); },
    detection: {
      initialized: true,
      htmlLoaded: true,
      isShowingResults: true,
      initializingPromise: null,
      currentResults: results,
      showAnalyzingState() { log.push(['analyzing']); },
      paginationManager: { setItems(items) { log.push(['setItems', items.length]); } }
    }
  });
  return { popup, log };
}

const all = [{ detector: 'Cloudflare' }, { detector: 'reCAPTCHA' }, { detector: 'Canvas' }];

test('coming back to Detection with results draws them through the search and the chips, not the whole list', async () => {
  const { popup, log } = harness({ results: all });
  await popup.switchTab('detection');
  assert.deepEqual(log.map(entry => entry[0]), ['checked', 'applyFilters']);
  assert.equal(log.find(entry => entry[0] === 'applyFilters')[1], popup.detection, 'for the Detection tab');
  assert.ok(!log.some(entry => entry[0] === 'setItems'), 'the pagination is never handed the whole list');
});

test('a Detection tab with nothing to show is left as the check left it', async () => {
  const { popup, log } = harness({ results: [] });
  await popup.switchTab('detection');
  assert.deepEqual(log.map(entry => entry[0]), ['checked']);
});

test('coming back to Detection stays on the page of results that was shown', async () => {
  const { popup, log } = harness({ results: all });
  await popup.switchTab('detection');
  const call = log.find(entry => entry[0] === 'applyFilters');
  assert.equal(call[2] && call[2].keepPage, true, 'the list drawn again keeps its page');
});

test('coming back to Rules stays on the page of rules that was shown', async () => {
  const { popup, log } = harness({ results: all });
  await popup.switchTab('rules');
  const call = log.find(entry => entry[0] === 'displayRules');
  assert.ok(call, 'the rules are drawn again');
  assert.equal(call[1] && call[1].keepPage, true, 'the list drawn again keeps its page');
});
