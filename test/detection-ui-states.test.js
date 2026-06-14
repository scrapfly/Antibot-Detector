const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// detection-ui.js is a browser file that attaches to `self`. Provide minimal
// global + DOM stubs so it loads in Node, then exercise the state-visibility
// logic that the popup's "Analyzing… appears instantly" fix relies on:
// each show* state must be mutually exclusive (exactly one container visible).

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, detection() {}, warn() {} };
global.chrome = { runtime: { getURL: (p) => p } };

const STATE_IDS = [
  'loadingState', 'emptyState', 'detectionResults',
  'disabledState', 'interruptedState', 'detectionPagination'
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
    stopAnalysisProgress() {},
    clearLoadingTimeout() {},
    startAnalysisProgress() {},
    resetClearCacheButton() {},
    clearBadgeForEmptyState() {},
    applyEmptyStateCopy() {},
    refreshEmptyStateI18n() {},
    createAnalysisSteps() { return []; },
    renderAnalysisSteps() {}
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
