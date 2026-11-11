'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab: copies, uploads and the replay kit hold what the list shows (the search and the chips applied), a summary copied
// while the list is empty copies nothing and says so, a click on Clear filters does not strand the keyboard on a button that has
// just been hidden, and a held Enter opens a card once.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function element(extra = {}) {
  let text = '';
  return Object.assign({
    style: {}, value: '', disabled: false, hidden: false, innerHTML: '', dataset: {}, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    get textContent() { return text; }, set textContent(v) { text = String(v); },
    appendChild() {}, setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    focus() { this.ownerDocument.activeElement = this; }
  }, extra);
}

function fixture() {
  const els = {};
  const doc = { activeElement: null, readyState: 'complete', addEventListener() {}, createElement: () => element({ ownerDocument: doc }), createTextNode: t => ({ textContent: t }),
    querySelector: selector => els[selector] || null, querySelectorAll: () => doc.cards || [] };
  for (const id of ['#detectionSearch', '#detectionClearFilters', '#detectionNoResults', '#resultsList', '#detectionStatus']) els[id] = element({ ownerDocument: doc });
  const copied = [], warnings = [];
  const context = { window: {}, console, URL, Logger: { error() {}, debug() {}, warn() {} },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    NotificationHelper: { warning: (text) => { warnings.push(text); } },
    ReplayKit: { pageUrl: () => '', browserHeaders: () => [], curl: () => 'curl-code', python: () => 'python-code', node: () => 'node-code' },
    chrome: { tabs: { query: async () => [] }, runtime: { getURL: p => p } }, document: doc };
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/categories.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js',
    'modules/ui/pagination-manager.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js', 'sections/detection/detection-actions.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  (context.window.FormatUtils || context.FormatUtils).copyToClipboard = async (text) => { copied.push(text); };
  const detection = Object.create(context.window.Detection.prototype);
  Object.assign(detection, {
    renderDetectionsPage() {}, closeDetectionModal() {}, isExtensionEnabled: true,
    currentResults: [
      { detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90, matches: [] },
      { detector: { name: 'reCAPTCHA' }, category: 'CAPTCHA', confidence: 80, matches: [] },
      { detector: { name: 'Canvas' }, category: 'Fingerprint', confidence: 60, matches: [] }
    ]
  });
  detection.setupPagination();
  return { detection, els, doc, copied, warnings, context, DA: context.DetectionActions, UI: context.DetectionUI };
}

const names = (payload) => payload.detections.map(d => d.name);

test('with a chip on, the copy, the upload body and the replay input hold only the shown detections', async () => {
  const { detection, DA, copied } = fixture();
  assert.deepEqual(names(DA.buildDetectionsPasteContent.call(detection, '').payload).sort(), ['Canvas', 'Cloudflare', 'reCAPTCHA'], 'nothing filtered: all of them');
  detection.toggleFilterChip('captcha');
  const { payload, count } = DA.buildDetectionsPasteContent.call(detection, '');
  assert.deepEqual(names(payload), ['reCAPTCHA']);
  assert.equal(count, 1);
  assert.equal(payload.summary.detections, 1);
  await DA.copyDetectionsAs.call(detection, 'markdown', '');
  assert.ok(copied[0].includes('reCAPTCHA') && !copied[0].includes('Cloudflare'));
  const input = await DA.replayInput.call(detection, '');
  assert.deepEqual(input.detections.map(d => d.detector.name), ['reCAPTCHA']);
  detection.handleSearch('canv');
  detection.clearFilters();
  assert.equal(DA.buildDetectionsPasteContent.call(detection, '').count, 3, 'filters cleared: all again');
});

test('the search box narrows the copy too', () => {
  const { detection, DA } = fixture();
  detection.handleSearch('cloud');
  assert.deepEqual(names(DA.buildDetectionsPasteContent.call(detection, '').payload), ['Cloudflare']);
});

test('a summary copied while the search and the chips match nothing copies nothing and warns, as Upload does; the code kinds still copy', async () => {
  const { detection, DA, copied, warnings } = fixture();
  const summaries = ['overview', 'markdown', 'oneline', 'json'];
  // The line the empty list itself shows (#detectionNoResults), not a "Copied" for an empty summary
  const noResults = JSON.parse(read('_locales/en/messages.json')).historyNoResults.message;

  detection.handleSearch('nothing matches this');
  assert.equal(DA.shownResults.call(detection).length, 0, 'the search leaves nothing');
  for (const kind of summaries) assert.equal(await DA.copyDetectionsAs.call(detection, kind, ''), '', `${kind}: no text comes back`);
  assert.deepEqual(copied, [], 'no empty summary reaches the clipboard');
  assert.deepEqual(warnings, summaries.map(() => noResults), 'one warning per attempt');

  // A chip and a search that each match something, but not together, leave nothing too
  detection.clearFilters();
  detection.toggleFilterChip('captcha');
  detection.handleSearch('cloud');
  assert.equal(DA.shownResults.call(detection).length, 0);
  assert.equal(await DA.copyDetectionsAs.call(detection, 'markdown', ''), '');
  assert.deepEqual(copied, []);
  assert.equal(warnings.length, summaries.length + 1);

  // curl, Python and Node.js replay this browser's headers and the page's cookies, not the list: they stay allowed and say nothing
  for (const kind of ['curl', 'python', 'node']) assert.equal(await DA.copyDetectionsAs.call(detection, kind, ''), `${kind}-code`);
  assert.deepEqual(copied, ['curl-code', 'python-code', 'node-code']);
  assert.equal(warnings.length, summaries.length + 1, 'no warning for the code kinds');

  // The list back: the summary copies as before, with no new warning
  detection.clearFilters();
  await DA.copyDetectionsAs.call(detection, 'markdown', '');
  assert.equal(copied.length, 4);
  assert.ok(copied[3].includes('Cloudflare') && copied[3].includes('reCAPTCHA') && copied[3].includes('Canvas'));
  assert.equal(warnings.length, summaries.length + 1);
});

test('Clear filters hides its own button: the keyboard goes to the search box, not to the page', () => {
  const { detection, els, doc } = fixture();
  detection.handleSearch('nothing matches this');
  els['#detectionClearFilters'].focus();
  assert.equal(doc.activeElement, els['#detectionClearFilters']);
  detection.clearFilters();
  assert.equal(doc.activeElement, els['#detectionSearch']);
  // Focus that was elsewhere (a chip) is left where it is
  const other = element({ ownerDocument: doc });
  other.focus();
  detection.clearFilters();
  assert.equal(doc.activeElement, other);
});

test('a held Enter or Space opens a card once: the repeats would land on the dialog\'s close button', () => {
  const { detection, doc, UI } = fixture();
  const listeners = {};
  let opened = 0;
  const card = element({ ownerDocument: doc, getAttribute: () => '0', click() { listeners.click({}); }, addEventListener(type, fn) { listeners[type] = fn; } });
  doc.cards = [card];
  detection.openDetectionModal = () => { opened++; };
  UI.renderDetectionsPage.call(detection, []);
  const key = (extra) => listeners.keydown(Object.assign({ target: card, key: 'Enter', preventDefault() {} }, extra));
  key({});
  key({ repeat: true });
  key({ repeat: true, key: ' ' });
  assert.equal(opened, 1);
  key({ key: ' ' });
  assert.equal(opened, 2);
});

test('the Detection stylesheet mirrors for Arabic: no physical margin or offset on the pager and the scan icons', () => {
  const css = read('sections/detection/detection.css');
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf('}', start));
  };
  for (const selector of ['#detectionTab .pagination-btn-prev', '.detection-scan-check .category-icon']) {
    assert.doesNotMatch(block(selector), /margin-(left|right)/, selector);
    assert.match(block(selector), /margin-inline-end/, selector);
  }
  assert.doesNotMatch(block('#detectionTab .page-info .total-pages'), /\bleft:/);
});
