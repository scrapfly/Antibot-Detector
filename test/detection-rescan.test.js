const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab → Scan again: a button next to Clear cache and one on the states that say the page has no completed scan.
// It asks the worker (WorkerMessages.RESCAN_TAB) to clear the page's saved result and reload the tab, as the Alt+Shift+S
// shortcut does; the popup shows the scanning screen until the new result arrives, or a toast saying why nothing happened.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const WorkerMessages = require('../modules/core/worker-messages.js');
const html = read('sections/detection/detection.html');

/** What code in the sandbox built, as plain data: arrays and objects made inside a vm are never reference-equal to the test's own. */
const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));

/** A button the tests can click and inspect. */
function fakeButton() {
  const handlers = {};
  return { hidden: true, disabled: false, attributes: {}, handlers,
    addEventListener(type, fn) { handlers[type] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    click() { return handlers.click && handlers.click({ stopPropagation() {} }); } };
}

/** DetectionActions with a fake browser: the popup's active tab, the worker's answer, the toasts it shows. */
function actions({ tab = { id: 12, url: 'https://shop.example/cart' }, answer = { status: 'ok', outcome: 'reloaded' } } = {}) {
  const log = { queries: [], messages: [], toasts: [], busy: [] };
  const buttons = { '#rescanBtn': fakeButton(), '#emptyRescanBtn': fakeButton() };
  const context = vm.createContext({
    console, self: {}, WorkerMessages,
    Logger: { debug() {}, warn() {}, error() {} },
    I18n: { tr: (key, fallback) => fallback, format: () => null },
    NotificationHelper: { error: (text) => log.toasts.push(text), warning: (text) => log.toasts.push(text), success() {}, info() {} },
    chrome: {
      tabs: { query: async (info) => { log.queries.push(info); return tab ? [tab] : []; } },
      runtime: { sendMessage: async (message) => { log.messages.push(message); if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(message) : answer; } }
    },
    document: {
      querySelector: (selector) => buttons[selector] || null,
      querySelectorAll: (selector) => selector.split(',').map(part => buttons[part.trim()]).filter(Boolean)
    }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-actions.js'), context, { filename: 'detection-actions.js' });
  const detection = {
    currentResults: [{ detector: { name: 'Cloudflare' } }], cacheMetadata: { url: 'https://shop.example/cart' }, isShowingResults: true,
    events: [],
    tellAdvancedResultsGone() { this.events.push('advanced-told'); },
    showAnalyzingState() { this.events.push('scanning'); },
    closeDetectionModal() { this.events.push('modal-closed'); }
  };
  return { A: context.DetectionActions, detection, log, buttons };
}

test('Scan again sits next to Clear cache, with the text and icon History already uses, and on the dead-end card', () => {
  const group = html.slice(html.indexOf('class="url-action-buttons"'), html.indexOf('id="copyOverviewMenu"'));
  assert.deepEqual([...group.matchAll(/<button id="([A-Za-z]+)"/g)].map(m => m[1]),
    ['scrapflyExportBtn', 'uploadPasteBtn', 'rescanBtn', 'clearCacheBtn', 'copyOverviewBtn', 'addToBlacklistBtn'], 'right before Clear cache');
  const rescan = group.match(/<button id="rescanBtn"[^>]*>/)[0];
  assert.match(rescan, /class="url-action-btn[^"]*"/);
  assert.match(rescan, /type="button"/);
  assert.match(rescan, /title="Scan again now"/);
  assert.match(rescan, /aria-label="Scan again now"/);
  assert.match(rescan, /data-i18n-title="historyScanAgain"/);
  assert.match(rescan, /data-i18n-aria-label="historyScanAgain"/);
  const history = read('sections/history/history.html');
  const icon = (text) => text.match(/<path d="M21 12a9 9 0 1 1-9-9c2\.5 0 4\.7 1 6\.4 2\.6L21 8"\/><path d="M21 3v5h-5"\/><circle cx="12" cy="12" r="2\.5"\/>/);
  assert.ok(icon(group) && icon(history), 'the same reload icon as History\'s Scan again now');

  const card = html.slice(html.indexOf('id="emptyState"'), html.indexOf('id="detectionResults"'));
  const button = card.match(/<button id="emptyRescanBtn"[^>]*>[^<]*<\/button>/)[0];
  assert.match(button, /class="state-card-enable-btn[^"]*"/, 'the card\'s existing action button');
  assert.match(button, /data-i18n="historyScanAgain"/);
  assert.match(button, /type="button"/);
  assert.match(button, /\bhidden\b/, 'shown only on the states that have no completed scan');
  assert.ok(card.indexOf('state-card-description') < card.indexOf('id="emptyRescanBtn"') && card.indexOf('id="emptyRescanBtn"') < card.indexOf('state-card-badges'), 'between the text and the badges');
});

test('both buttons are wired: a click rescans', () => {
  const buttons = { '#rescanBtn': fakeButton(), '#emptyRescanBtn': fakeButton() };
  const context = vm.createContext({
    console, window: {}, Logger: { debug() {}, warn() {}, error() {} },
    chrome: { storage: { local: { get: async () => ({}) } }, runtime: { onMessage: { addListener() {} } }, tabs: { onUpdated: { addListener() {} } }, action: {} },
    DetectionUI: { observeResultsListSize() {} }, DetectionModals: { initializeModalElements() {} },
    document: { querySelector: (selector) => buttons[selector] || null }
  });
  vm.runInContext(read('sections/detection/detection.js'), context, { filename: 'detection.js' });
  const detection = Object.create(context.window.Detection.prototype);
  let asked = 0;
  detection.rescan = () => { asked++; };
  detection.setupEventListeners();
  assert.equal(typeof buttons['#rescanBtn'].handlers.click, 'function', 'the toolbar button listens');
  assert.equal(typeof buttons['#emptyRescanBtn'].handlers.click, 'function', 'the card button listens');
  buttons['#rescanBtn'].click();
  buttons['#emptyRescanBtn'].click();
  assert.equal(asked, 2);
  assert.equal(typeof context.window.Detection.prototype.rescan, 'function', 'the class offers rescan');
});

test('Scan again asks the worker to rescan the active tab of the popup\'s own window, by name', async () => {
  const { A, detection, log } = actions();
  await A.rescan.call(detection);
  assert.deepEqual(plain(log.queries), [{ active: true, currentWindow: true }]);
  assert.deepEqual(plain(log.messages), [{ type: WorkerMessages.RESCAN_TAB, tabId: 12 }]);
  assert.equal(log.messages[0].type, 'RESCAN_TAB');
});

test('when the page reloads the results go and the scanning screen shows until the new result arrives; no toast', async () => {
  const { A, detection, log } = actions();
  await A.rescan.call(detection);
  assert.deepEqual(plain(detection.currentResults), [], 'the old results are gone');
  assert.equal(detection.cacheMetadata, null);
  assert.equal(detection.isShowingResults, false);
  assert.deepEqual(plain(detection.events.filter(e => e !== 'modal-closed')), ['advanced-told', 'scanning'], 'Advanced is told, then the scan card shows');
  assert.deepEqual(plain(log.toasts), []);
  assert.equal(detection.viewedTabId, 12, 'the tab the scan is for');
});

test('any other outcome is a plain toast that says why, in existing wording, and leaves the results where they are', async () => {
  const wording = {
    unsupported: 'This page cannot be scanned',
    skipped: 'This site is not scanned',
    off: 'Detection is switched off',
    no_tab: 'Unable to get current page',
    failed: 'Scan failed'
  };
  for (const [outcome, text] of Object.entries(wording)) {
    const { A, detection, log } = actions({ answer: { status: 'ok', outcome } });
    await A.rescan.call(detection);
    assert.deepEqual(plain(log.toasts), [text], outcome);
    assert.equal(detection.currentResults.length, 1, `${outcome}: the results stay`);
    assert.deepEqual(plain(detection.events), [], `${outcome}: no scanning screen`);
  }
  // The existing messages, not new ones
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const [key, text] of [['detectionUnsupportedTitle', wording.unsupported], ['toolbarTitleSkipped', wording.skipped], ['toolbarTitleOff', wording.off],
    ['unableGetCurrentPage', wording.no_tab], ['detectionFailedTitle', wording.failed]]) {
    assert.equal(en[key].message, text, key);
  }
});

test('no active tab, a worker that fails and an answer nobody understands are all "no tab" or "Scan failed", never a reload', async () => {
  let h = actions({ tab: null });
  await h.A.rescan.call(h.detection);
  assert.deepEqual(plain(h.log.messages), [], 'no tab: the worker is not asked');
  assert.deepEqual(plain(h.log.toasts), ['Unable to get current page']);

  h = actions({ answer: new Error('Could not establish connection') });
  await h.A.rescan.call(h.detection);
  assert.deepEqual(plain(h.log.toasts), ['Scan failed']);
  assert.equal(h.detection.isRescanning, false, 'free to try again');

  // no answer at all (a function that returns nothing: an undefined answer would only be the default), an error, junk
  for (const answer of [() => undefined, null, { status: 'error', error: 'Available to extension pages only' }, { status: 'ok' }, { status: 'ok', outcome: 42 }]) {
    h = actions({ answer });
    await h.A.rescan.call(h.detection);
    assert.deepEqual(plain(h.log.toasts), ['Scan failed'], JSON.stringify(typeof answer === 'function' ? 'no answer' : answer));
    assert.deepEqual(plain(h.detection.events), []);
  }
});

test('a worker that does not know the message (it is older than the popup) says so, in the existing wording, and nothing reloads', async () => {
  // The popup's files are read fresh on every open; the worker only when the extension is reloaded. A worker from before this
  // button answers { status: 'unknown' } to RESCAN_TAB: "Scan failed" would not tell the person what to do.
  const hint = "The extension's background part is out of date. Reload the extension on the extensions page and try again.";
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(en.workerOutdatedHint.message, hint, 'the wording History and Settings already use');

  const h = actions({ answer: { status: 'unknown' } });
  await h.A.rescan.call(h.detection);
  assert.deepEqual(plain(h.log.toasts), [hint]);
  assert.deepEqual(plain(h.detection.events), [], 'no scanning screen: nothing was reloaded');
  assert.equal(h.detection.currentResults.length, 1, 'the results stay');
  assert.equal(h.detection.isRescanning, false, 'free to try again once the extension is reloaded');
  assert.deepEqual(plain([h.buttons['#rescanBtn'].disabled, h.buttons['#emptyRescanBtn'].disabled]), [false, false]);

  // every other kind of failure keeps its own, plainer words
  for (const answer of [{ status: 'error', error: 'Available to extension pages only' }, { status: 'ok' }, { status: 'ok', outcome: 'failed' }]) {
    const other = actions({ answer });
    await other.A.rescan.call(other.detection);
    assert.deepEqual(plain(other.log.toasts), ['Scan failed'], JSON.stringify(answer));
  }
});

test('a second click while the first is on its way does nothing; both buttons are off meanwhile and back on after', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { A, detection, log, buttons } = actions({ answer: () => gate });
  const first = A.rescan.call(detection);
  await new Promise(resolve => setImmediate(resolve)); // the first click has reached the worker
  assert.equal(buttons['#rescanBtn'].disabled, true, 'the toolbar button is off while the worker answers');
  assert.equal(buttons['#emptyRescanBtn'].disabled, true, 'so is the card button');
  await A.rescan.call(detection); // the second click is ignored at once
  assert.equal(log.messages.length, 1, 'one request, not two reloads');
  release({ status: 'ok', outcome: 'reloaded' });
  await first;
  assert.equal(log.messages.length, 1);
  assert.equal(buttons['#rescanBtn'].disabled, false, 'back on');
  assert.equal(buttons['#emptyRescanBtn'].disabled, false);
  assert.equal(detection.isRescanning, false);
});

test('the dead-end card offers Scan again for a page with no completed scan, a failed or an interrupted scan; not for a page that cannot be scanned or a clean result', () => {
  const els = {};
  const element = () => ({ style: { display: '' }, hidden: true, classList: { add() {}, remove() {}, toggle() {} }, querySelector() { return null; }, textContent: '', setAttribute() {}, removeAttribute() {} });
  for (const id of ['#loadingState', '#emptyState', '#detectionResults', '#disabledState', '#blacklistWarning', '#interruptedState', '#detectionPagination', '#emptyRescanBtn']) els[id] = element();
  const context = vm.createContext({
    console, self: {}, document: { querySelector: (selector) => els[selector] || null },
    Logger: { debug() {}, warn() {}, error() {} },
    chrome: { runtime: { getURL: (p) => p }, tabs: { query: async () => [] } }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-ui.js'), context, { filename: 'detection-ui.js' });
  const ui = context.DetectionUI;
  const view = () => Object.assign(Object.create(ui), {
    isExtensionEnabled: true, uiStateMachine: null, currentResults: [], isShowingResults: false, viewedTabUrl: null,
    clearLoadingTimeout() {}, resetClearCacheButton() {}, clearBadgeForEmptyState() {}, applyEmptyStateCopy() {}, closeDetectionModal() {}, tellAdvancedResultsGone() {}
  });
  const offers = (options) => { els['#emptyRescanBtn'].hidden = true; ui.showEmptyState.call(view(), options); return els['#emptyRescanBtn'].hidden === false; };
  assert.equal(offers({ outcome: 'unscanned' }), true, 'no completed scan');
  assert.equal(offers({ outcome: 'failed' }), true, 'the scan failed');
  assert.equal(offers({ outcome: 'interrupted' }), true, 'the scan was interrupted');
  assert.equal(offers({ noCache: true, showBadges: false }), true, 'detection was just switched on: nothing scanned yet');
  assert.equal(offers({ outcome: 'unsupported' }), false, 'a page that cannot be scanned');
  assert.equal(offers({}), false, 'a scan that found nothing: the all-clear card stays as it is');
  assert.equal(offers(undefined), false);
});

test('the popup sends the message by name and the registry has it; no script spells it as a string', () => {
  assert.equal(WorkerMessages.RESCAN_TAB, 'RESCAN_TAB');
  const source = read('sections/detection/detection-actions.js');
  assert.match(source, /type: WorkerMessages\.RESCAN_TAB/);
  assert.ok(!/['"]RESCAN_TAB['"]/.test(source));
});
