'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Code of the Detection tab that nothing can reach, removed. What was left is pinned here so it does not come back by a merge:
//  - Copy detection / Copy overview of the details dialog: they looked up #copyDetectionModal, which no template has (the Copy
//    menu of the summary card, DetectionActions.copyDetectionsAs, is the live path);
//  - the NEW_DETECTION_DATA branch of Detection's own message listener, which returned at once in the popup it only ever runs in
//    (window.popupInstance), with the justClearedCache flag that only it read: popup.js handles the message;
//  - a call to History.loadHistory, which does not exist;
//  - the resize observer of a list that has no page sizer (its pages hold two cards): it re-packed nothing.
// measurePageStarts and observeResultsListSize stay: test/popup-scroll.test.js pins them as the way back to pages fitted to the height.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the details dialog has no copy button to look up, and nothing copies "a detection" any more', () => {
  for (const file of ['sections/detection/detection-modals.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js', 'sections/detection/detection-actions.js']) {
    const source = code(file);
    assert.doesNotMatch(source, /copyDetectionModal/, file);
    assert.doesNotMatch(source, /\bcopyDetection\b/, file);
    assert.doesNotMatch(source, /\bcopyDetectionOverview\b/, file);
    assert.doesNotMatch(source, /\bcopyBtn\b/, file);
  }
  assert.ok(!/copyDetectionModal/.test(read('sections/detection/detection.html')), 'the template never had the button');
  // The live path of the summary card's Copy menu is untouched
  assert.match(read('sections/detection/detection.js'), /DetectionActions\.copyDetectionsAs\.call\(this, item\.dataset\.copyFormat/);
});

test('Detection\'s own message listener keeps the messages the popup leaves to it; the scan-result branch and its flag are gone', () => {
  const source = code('sections/detection/detection.js');
  assert.doesNotMatch(source, /popupInstance/);
  assert.doesNotMatch(source, /justClearedCache|clearCacheResetTimer/);
  assert.doesNotMatch(source, /WorkerMessages\.NEW_DETECTION_DATA/);
  assert.match(source, /WorkerMessages\.EXTENSION_TOGGLE_CHANGED/);
  assert.match(source, /WorkerMessages\.DETECTION_PROGRESS/);
  assert.match(source, /WorkerMessages\.DETECTION_CLEAR_CACHE/);
  assert.doesNotMatch(code('sections/detection/detection-actions.js'), /justClearedCache/);
  // popup.js is where a scan result is handled
  assert.match(read('popup.js'), /case WorkerMessages\.NEW_DETECTION_DATA:/);
});

test('processing a scan result no longer calls a History method that does not exist', () => {
  // Nothing defines loadHistory (History has loadHistoryFromStorage), so the call in processDetectionData never ran
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(rel) : (entry.name.endsWith('.js') ? [rel] : []);
  });
  const files = ['popup.js', ...['sections', 'modules', 'utils', 'background'].flatMap(walk)];
  assert.ok(files.length > 100);
  assert.deepEqual(files.filter(file => /\bloadHistory\b/.test(read(file))), [], 'no definition and no caller');
  assert.doesNotMatch(code('sections/detection/detection-requests.js'), /\bhistory\b/, 'processDetectionData takes no History');
  for (const file of ['popup.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js']) {
    assert.doesNotMatch(code(file), /\bhistory:\s*(this\.history|undefined)\b/, `${file}: nothing passes a History to processDetectionData`);
  }
});

function setup(pager) {
  const started = [];
  const context = vm.createContext({
    console, window: {}, Logger: { debug() {}, warn() {}, error() {} },
    chrome: { storage: { local: { get: async () => ({}) } }, runtime: { onMessage: { addListener() {} } }, tabs: { onUpdated: { addListener() {} } }, action: {} },
    DetectionUI: { observeResultsListSize() { started.push('observer'); } },
    DetectionModals: { initializeModalElements() {} },
    document: { querySelector: () => null }
  });
  vm.runInContext(read('sections/detection/detection.js'), context, { filename: 'detection.js' });
  const detection = Object.create(context.window.Detection.prototype);
  detection.paginationManager = pager;
  detection.setupEventListeners();
  return started;
}

test('the list\'s resize observer runs only for a list that packs its pages to the height (it has a page sizer); two cards a page need none', () => {
  assert.deepEqual(setup({ pageSizer: null, filteredItems: [] }), [], 'fixed pages: nothing to re-pack when the popup resizes');
  assert.deepEqual(setup(null), [], 'no pager yet');
  assert.deepEqual(setup({ pageSizer: () => [0], filteredItems: [] }), ['observer'], 'the option the setup comment offers still works');
  // Detection's own pager is the fixed one
  assert.match(read('sections/detection/detection.js'), /itemsPerPage: 2,/);
  assert.doesNotMatch(code('sections/detection/detection.js'), /pageSizer\s*:/);
});

test('what test/popup-scroll.test.js pins as the way back to height-fitted pages is still there', () => {
  const ui = read('sections/detection/detection-ui.js');
  assert.match(ui, /DetectionUI\.measurePageStarts = function/);
  assert.match(ui, /DetectionUI\.observeResultsListSize = function/);
});
