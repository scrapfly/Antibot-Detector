const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The scan card ("Buscando protecciones") must always settle. Nike made it
// visible: Kasada reloads the page and a heavy page loads for longer than the
// first 10 s check, so the popup showed "Scan interrupted" or "Nothing Detected"
// for a scan that had not finished, or stayed on the scan card for good when
// the background's completion message never reached the popup.

const root = path.join(__dirname, '..');
global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, detection() {}, warn() {} };
let tabStatus = 'loading';
let reply = () => ({ status: 'pending' });
const asked = [];
global.chrome = {
  runtime: { getURL: p => p, lastError: undefined, sendMessage(message, callback) { asked.push(message.type); callback(reply()); } },
  tabs: { query: (_info, callback) => callback([{ id: 5, status: tabStatus }]) }
};
const el = () => ({ style: { display: '' }, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {}, textContent: '' });
const els = { '#loadingState': el() };
global.document = { querySelector: selector => els[selector] || null };
const processed = [];
global.Detection = {
  processDetectionData: async (_context, data) => { processed.push(data); },
  getBadgeStatus: async () => ({ trimmed: '' })
};
require('../sections/detection/detection-ui.js');
const DetectionUI = global.self.DetectionUI;

function scanning() {
  els['#loadingState'].style.display = 'flex';
  asked.length = 0;
  processed.length = 0;
  const calls = { analyzing: 0, empty: [] };
  const ctx = Object.create(DetectionUI);
  Object.assign(ctx, {
    isExtensionEnabled: true, viewedTabId: 5, wasInterrupted: false, isShowingResults: false, currentResults: [],
    loadingTimeout: null, loadingRepolls: 0, loadingIdleAsks: 0,
    showAnalyzingState() { calls.analyzing++; },
    showEmptyState(options) { calls.empty.push(options?.outcome || 'empty'); },
    refreshAnalysis: async () => {}
  });
  return { ctx, calls };
}

/** Run one check and every timer it schedules, returning the delays asked for */
async function check(ctx) {
  const timers = [];
  const { setTimeout: realSet, clearTimeout: realClear } = global;
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  global.clearTimeout = () => {};
  try {
    ctx.handleLoadingTimeout();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    global.setTimeout = realSet;
    global.clearTimeout = realClear;
  }
  return timers;
}

test('a scan still running after the first check is asked about again, not given up on', async () => {
  const { ctx, calls } = scanning();
  reply = () => ({ status: 'pending' });
  const timers = await check(ctx);
  assert.deepEqual(timers.map(t => t.ms), [DetectionUI.LOADING_REPOLL_MS]);
  assert.deepEqual(calls.empty, []);
});

test('a completion message the popup never got is picked up by the next check', async () => {
  const { ctx, calls } = scanning();
  reply = () => ({ status: 'pending' });
  const [again] = await check(ctx);
  const data = { detectionResults: [{ id: 'detect-akamai' }] };
  reply = () => ({ status: 'ok', data });
  again.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(processed, [data]);
  assert.deepEqual(calls.empty, []);
});

test('a page that is still loading keeps the scan card, whatever the background says about its scan', async () => {
  const { ctx, calls } = scanning();
  tabStatus = 'loading';
  reply = () => ({ status: 'ok', data: null });
  const timers = await check(ctx);
  assert.deepEqual(calls.empty, [], 'no "Scan interrupted" while the page loads');
  assert.deepEqual(timers.map(t => t.ms), [DetectionUI.LOADING_REPOLL_MS]);
});

test('a scan that is about to register is not called interrupted on the first check, only on the second', async () => {
  const { ctx, calls } = scanning();
  tabStatus = 'complete';
  reply = () => ({ status: 'ok', data: null });
  const first = await check(ctx);
  assert.deepEqual(calls.empty, [], 'first check: the scan may not have registered yet');
  assert.equal(first.length, 1);
  await check(ctx);
  assert.deepEqual(calls.empty, ['interrupted'], 'second check: really no scan');
});

test('waiting for a scan has an end: after the last ask the usual outcome applies', async () => {
  const { ctx, calls } = scanning();
  tabStatus = 'loading';
  reply = () => ({ status: 'ok', data: null });
  ctx.loadingRepolls = DetectionUI.LOADING_REPOLL_MAX;
  await check(ctx);
  assert.deepEqual(calls.empty, ['interrupted']);
});

// ---- popup.js: the first answer when the popup opens

function popup() {
  const calls = { analyzing: 0, empty: 0, processed: [] };
  const context = {
    WorkerMessages: require('../modules/core/worker-messages.js'),
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { error() {} },
    BADGE: { TEXT: { INTERRUPTED: '!', CLEARED: '-' } },
    isLoadingBadgeText: text => text === '…',
    Detection: { getBadgeText: async () => '' },
    chrome: { tabs: { get: async () => ({ id: 5, status: tabStatus }), query: async () => [{ id: 5 }] }, runtime: { sendMessage() {} } },
    window: { addEventListener() {} },
    document: { addEventListener() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8') + '\nthis.Popup = ScrapflyPopup;', context);
  const instance = Object.create(context.Popup.prototype);
  Object.assign(instance, {
    currentTab: 'detection', detectionViewRequestId: 1,
    detection: {
      viewedTabId: 5, isShowingResults: false, currentResults: [],
      showAnalyzingState() { calls.analyzing++; }, showEmptyState() { calls.empty++; }
    },
    processDetectionData: async data => { calls.processed.push(data); }
  });
  return { instance, calls, context };
}

for (const [name, response] of [['no answer', null], ['an interrupted scan', { status: 'interrupted' }],
  ['no data', { status: 'ok', data: null }], ['an error', { status: 'error', error: 'x' }]]) {
  test(`opening the popup on a page still loading shows the scan card, not "Nothing Detected" (${name})`, async () => {
    const { instance, calls } = popup();
    tabStatus = 'loading';
    await instance.handleDetectionResponseAndUpdateUI(5, response, 1);
    assert.equal(calls.empty, 0);
    assert.equal(calls.analyzing, 1);
  });

  test(`a loaded page with nothing to show still ends on the empty state (${name})`, async () => {
    const { instance, calls } = popup();
    tabStatus = 'complete';
    await instance.handleDetectionResponseAndUpdateUI(5, response, 1);
    assert.equal(calls.empty, 1);
    assert.equal(calls.analyzing, 0);
  });
}

test('a page that is still loading but has a stored result shows the result', async () => {
  const { instance, calls } = popup();
  tabStatus = 'loading';
  const data = { detectionResults: [{ id: 'detect-akamai' }] };
  await instance.handleDetectionResponseAndUpdateUI(5, { status: 'ok', data }, 1);
  assert.deepEqual(calls.processed, [data]);
});

// ---- popup.js: a skipped check must never leave the scan card up

for (const [showingResults, expected] of [[false, 2], [true, 1]]) {
  test(`two checks within a second ${showingResults ? 'are debounced while results show' : 'both run while the scan card is up'}`, async () => {
    const { instance, context } = popup();
    const sent = [];
    context.chrome.runtime.sendMessage = message => sent.push(message.type);
    context.chrome.storage = { local: { get: async () => ({ scrapfly_enabled: true }) } };
    context.Utils = { isUrlBlacklisted: async () => false };
    instance.detection.isShowingResults = showingResults;
    instance.detection.setExtensionEnabled = () => {};
    instance.isDetectionViewRequestCurrent = () => true;
    await instance.checkAndDisplayExistingDetection(1);
    await instance.checkAndDisplayExistingDetection(1);
    assert.equal(sent.filter(type => type === 'GET_DETECTION_DATA').length, expected);
  });
}
