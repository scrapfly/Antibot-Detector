const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// detection-ui.js is a browser file that attaches to `self`. Provide minimal
// global + DOM stubs so it loads in Node, then exercise the state-visibility
// logic that the popup's "Analyzing… appears instantly" fix relies on:
// each show* state must be mutually exclusive (exactly one container visible).

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, detection() {}, warn() {} };
global.chrome = { runtime: { getURL: (p) => p },
  tabs: { query: async () => [] } };

const STATE_IDS = [
  'loadingState', 'emptyState', 'detectionResults',
  'disabledState', 'blacklistWarning', 'interruptedState', 'detectionPagination'
];

function makeEl() {
  return {
    style: { display: '' },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {}, removeAttribute() {},
    textContent: ''
  };
}

let els;
global.document = { querySelector: (sel) => (els ? els[sel] || null : null) };

require('../sections/detection/detection-ui.js');
require('../sections/detection/detection-actions.js');
const DetectionUI = global.self.DetectionUI;

function freshContext() {
  els = {};
  for (const id of STATE_IDS) els['#' + id] = makeEl();
  // Inherit the real DetectionUI methods, then stub the timer/badge/i18n helpers
  // that need richer DOM so we can isolate the visibility logic.
  const ctx = Object.create(DetectionUI);
  ctx.isExtensionEnabled = true;
  ctx.uiStateMachine = null;
  ctx.currentResults = [];
  ctx.isShowingAnalyzing = false;
  ctx.isShowingResults = false;
  Object.assign(ctx, {
    ...global.self.DetectionActions,
    initialized: true,
    setExtensionEnabled(enabled) { this.isExtensionEnabled = enabled; },
    clearLoadingTimeout() {},
    startAnalysisProgress() {},
    resetClearCacheButton() {},
    clearBadgeForEmptyState() {},
    applyEmptyStateCopy() {},
    closeDetectionModal() {},
    updateUrlDisplay() {}, updateStats() {}, updateCacheInfo() {},
    sortDetectionsByCategory: items => items,
  });
  return ctx;
}

const visible = (id) => els['#' + id].style.display;

test('exposes the DetectionUI state methods', () => {
  for (const m of ['showLoadingState', 'showAnalyzingState', 'showEmptyState', 'hideLoadingState']) {
    assert.strictEqual(typeof DetectionUI[m], 'function', `${m} should be a function`);
  }
});

test('showLoadingState shows loading and hides every other state', () => {
  const ctx = freshContext();
  DetectionUI.showLoadingState.call(ctx, 'Analyzing…');
  assert.strictEqual(visible('loadingState'), 'flex');
  for (const id of STATE_IDS.filter((i) => i !== 'loadingState')) {
    assert.strictEqual(visible(id), 'none', `${id} should be hidden`);
  }
});

test('showAnalyzingState renders the loading state (the instant-feedback path)', () => {
  const ctx = freshContext();
  DetectionUI.showAnalyzingState.call(ctx, 'Analyzing…');
  assert.strictEqual(visible('loadingState'), 'flex');
  assert.strictEqual(ctx.isShowingAnalyzing, true);
});

test('a stale analyzing flag cannot leave the detection tab blank', () => {
  const ctx = freshContext();
  // Freshly injected template: flag left over, but the scan card is hidden.
  ctx.isShowingAnalyzing = true;
  els['#loadingState'].style.display = 'none';
  DetectionUI.showAnalyzingState.call(ctx, 'Analyzing…');
  assert.strictEqual(visible('loadingState'), 'flex');
});

test('analyzing before the template exists does not latch the analyzing flag', () => {
  const ctx = freshContext();
  delete els['#loadingState'];
  DetectionUI.showAnalyzingState.call(ctx, 'Analyzing…');
  assert.strictEqual(ctx.isShowingAnalyzing, false);
});

test('analyzing -> empty hides the loading state (no overlap)', () => {
  const ctx = freshContext();
  DetectionUI.showAnalyzingState.call(ctx, 'Analyzing…');
  assert.strictEqual(visible('loadingState'), 'flex');
  DetectionUI.showEmptyState.call(ctx, {});
  assert.strictEqual(visible('loadingState'), 'none', 'loading must be hidden once empty shows');
  assert.strictEqual(visible('emptyState'), 'flex');
  assert.strictEqual(ctx.isShowingAnalyzing, false);
});

test('hideLoadingState clears the loading state and the analyzing flag', () => {
  const ctx = freshContext();
  DetectionUI.showLoadingState.call(ctx);
  ctx.isShowingAnalyzing = true;
  DetectionUI.hideLoadingState.call(ctx);
  assert.strictEqual(visible('loadingState'), 'none');
  assert.strictEqual(ctx.isShowingAnalyzing, false);
});

test('showAnalyzingState is a no-op when the extension is disabled', () => {
  const ctx = freshContext();
  ctx.isExtensionEnabled = false;
  DetectionUI.showAnalyzingState.call(ctx, 'Analyzing…');
  assert.strictEqual(visible('loadingState'), '', 'should not render analyzing while disabled');
  assert.strictEqual(ctx.isShowingAnalyzing, false);
});

test('blocking a domain clears retained results and ignores late results and progress', async () => {
  const ctx = freshContext();
  const detections = [{ name: 'Synthetic detector', confidence: 80 }];
  await ctx.displayResults(detections);
  ctx.cacheMetadata = { expiry: Date.now() + 60000 };
  ctx.showBlacklistState('example.test');
  assert.equal(ctx.isShowingResults, false);
  assert.deepEqual(ctx.currentResults, []);
  assert.equal(ctx.cacheMetadata, null);
  await ctx.displayResults(detections);
  ctx.showAnalyzingState();
  ctx.showEmptyState();
  assert.equal(visible('blacklistWarning'), 'flex');
  for (const id of STATE_IDS.filter(id => id !== 'blacklistWarning')) {
    assert.equal(visible(id), 'none', `${id} must not overlap the blocked state`);
  }
});

test('disabling detection hides the blocked panel and clears stale results', () => {
  const ctx = freshContext();
  ctx.showBlacklistState('example.test');
  ctx.currentResults = [{ name: 'Synthetic detector' }];
  ctx.showDisabledState();
  assert.equal(visible('disabledState'), 'flex');
  assert.deepEqual(ctx.currentResults, []);
  for (const id of STATE_IDS.filter(id => id !== 'disabledState')) {
    assert.equal(visible(id), 'none', `${id} must not overlap the disabled state`);
  }
  ctx.setExtensionEnabled(true);
  ctx.showEmptyState();
  assert.equal(visible('blacklistWarning'), 'flex', 'enabling globally preserves the domain exclusion');
});

test('results awaiting initialization cannot replace a newly blocked or disabled state', async () => {
  for (const state of ['blacklistWarning', 'disabledState']) {
    const ctx = freshContext();
    ctx.initialized = false;
    let finish;
    ctx.initialize = () => new Promise(resolve => { finish = resolve; });
    const rendering = ctx.displayResults([{ name: 'Synthetic detector' }]);
    if (state === 'blacklistWarning') ctx.showBlacklistState('example.test');
    else ctx.showDisabledState();
    finish();
    await rendering;
    assert.equal(visible(state), 'flex');
    assert.equal(visible('detectionResults'), 'none');
    assert.deepEqual(ctx.currentResults, []);
  }
});

test('results, empty and loading states recover after a domain is unblocked', async () => {
  const ctx = freshContext();
  for (const next of ['results', 'empty', 'loading']) {
    ctx.showBlacklistState('example.test');
    ctx.blacklistedDomain = null;
    if (next === 'results') await ctx.displayResults([{ name: 'Synthetic detector' }]);
    if (next === 'empty') ctx.showEmptyState();
    if (next === 'loading') ctx.showAnalyzingState();
    assert.equal(visible('blacklistWarning'), 'none', `${next} hides the obsolete domain warning`);
    assert.equal(visible(next === 'results' ? 'detectionResults' : `${next}State`), 'flex');
  }
});
