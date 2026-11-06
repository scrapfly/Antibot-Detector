'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab actions that wait for an answer.
//  - Clear cache says what the worker said. It answers { status: 'cleared' | 'not_found' | 'error' } (an older worker, 'unknown'):
//    only the first two leave the page without a saved result. The button is off while the worker works and is on again however it
//    ends: the code that put its text back guarded itself with a label the icon-only button never had, so a failure, or no active
//    tab (which said nothing at all), left it disabled until the next draw.
//  - Upload detections tells the person the link is copied only when it is.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const WorkerMessages = require('../modules/core/worker-messages.js');
const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
const en = JSON.parse(read('_locales/en/messages.json'));
const say = (key) => en[key].message;

function fixture({ tab = { id: 12, url: 'https://shop.example/cart' }, answer = { status: 'cleared' }, confirmed = true, copied = true, uploaded = 'https://paste.example/abc' } = {}) {
  const log = { toasts: [], messages: [], created: [], copies: [], badges: [], events: [] };
  const clearButton = { disabled: false, querySelector: () => null };
  const uploadButton = { disabled: false };
  const context = vm.createContext({
    console, URL, JSON, Math, Date, Object, Array, String, Number, Promise, self: {}, WorkerMessages,
    Logger: { debug() {}, warn() {}, error() {} },
    I18n: { tr: (key, fallback) => (en[key] ? en[key].message : fallback), format: () => null },
    BADGE: { COLORS: { CLEARED: '#6B7280' }, TEXT: { CLEARED: 'CLR' } },
    setBadgeTextColor: async () => { log.badges.push('color'); },
    NotificationHelper: {
      confirm: async () => confirmed,
      success: (text) => log.toasts.push(['success', text]), error: (text) => log.toasts.push(['error', text]),
      info: (text) => log.toasts.push(['info', text]), warning: (text) => log.toasts.push(['warning', text])
    },
    chrome: {
      tabs: { query: async () => (tab ? [tab] : []), create: async (options) => { log.created.push(options.url); } },
      runtime: { sendMessage: async (message) => { log.messages.push(message); if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(message) : answer; } },
      action: { setBadgeText: async () => { log.badges.push('text'); }, setBadgeBackgroundColor: async () => { log.badges.push('background'); } }
    },
    FormatUtils: {
      t: (key, fallback, ...args) => String(fallback).replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]),
      copyToClipboard: async (text, options) => { log.copies.push([text, options]); return copied; }
    },
    Utils: { getSettings: async () => ({ share: { provider: 'test' } }) },
    ShareProviders: {
      describe: () => ({ name: 'Paste Test', expiry: { kind: 'never' } }),
      upload: async () => uploaded
    },
    DetectionUtils: { computeAverageConfidence: (list) => list.reduce((sum, d) => sum + d.confidence, 0) / (list.length || 1) },
    document: { querySelector: (selector) => ({ '#clearCacheBtn': clearButton, '#uploadPasteBtn': uploadButton })[selector] || null }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-actions.js'), context, { filename: 'detection-actions.js' });
  const detection = {
    currentResults: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90, matches: [] }],
    getDifficultyInfo: () => ({ difficulty: 'Low' }), sortDetectionsByCategory: (list) => list.slice(),
    showEmptyState(options) { log.events.push(['empty', plain(options)]); }
  };
  return { A: context.DetectionActions, detection, log, clearButton, uploadButton };
}

// ---- Clear cache -----------------------------------------------------------------------------------

test('"cleared": the toast says so, the page shows the no-completed-scan card, and the button is on again', async () => {
  const { A, detection, log, clearButton } = fixture();
  await A.clearCache.call(detection);
  assert.deepEqual(plain(log.messages), [{ type: WorkerMessages.DETECTION_CLEAR_CACHE, url: 'https://shop.example/cart', tabId: 12 }]);
  assert.deepEqual(plain(log.toasts), [['success', say('cacheClearedToast')]]);
  assert.deepEqual(log.events, [['empty', { outcome: 'unscanned' }]]);
  assert.deepEqual(plain(detection.currentResults), []);
  assert.equal(clearButton.disabled, false);
  assert.deepEqual(log.badges.sort(), ['background', 'color', 'text'], 'the toolbar shows the cleared mark');
});

test('"not_found": nothing was saved to clear, which is not a success: the page still ends without a saved result, and the toast says so', async () => {
  const { A, detection, log, clearButton } = fixture({ answer: { status: 'not_found' } });
  await A.clearCache.call(detection);
  assert.deepEqual(plain(log.toasts), [['info', say('notificationCacheAlreadyCleared')]], 'the wording History uses for the same answer');
  assert.deepEqual(log.events, [['empty', { outcome: 'unscanned' }]], 'the worker has dropped the tab\'s scan and marked it cleared as well');
  assert.equal(clearButton.disabled, false);
});

test('any other answer is "Failed to clear cache": no success toast, no card, the results stay, the button is on again', async () => {
  // (a function that returns nothing is "no answer": an undefined option would only be the default)
  const answers = [{ status: 'error', error: 'Storage is full' }, { status: 'ok' }, () => undefined, null, 'cleared', {}];
  for (const answer of answers) {
    const label = typeof answer === 'function' ? 'no answer' : JSON.stringify(answer);
    const { A, detection, log, clearButton } = fixture({ answer });
    await A.clearCache.call(detection);
    assert.deepEqual(plain(log.toasts), [['error', say('failedToClearCacheToast')]], label);
    assert.deepEqual(log.events, [], `${label}: no card over results that are still saved`);
    assert.equal(detection.currentResults.length, 1, `${label}: the results stay`);
    assert.equal(clearButton.disabled, false, `${label}: free to try again`);
  }
});

test('a worker that does not know the message (older than the popup) says to reload the extension', async () => {
  const hint = "The extension's background part is out of date. Reload the extension on the extensions page and try again.";
  assert.equal(say('workerOutdatedHint'), hint, 'the wording History and Settings already use');
  const { A, detection, log, clearButton } = fixture({ answer: { status: 'unknown' } });
  await A.clearCache.call(detection);
  assert.deepEqual(plain(log.toasts), [['error', hint]]);
  assert.deepEqual(log.events, []);
  assert.equal(clearButton.disabled, false);
});

test('a worker that cannot be reached is the same failure, and the button is on again', async () => {
  const { A, detection, log, clearButton } = fixture({ answer: new Error('Could not establish connection. Receiving end does not exist.') });
  await A.clearCache.call(detection);
  assert.deepEqual(plain(log.toasts), [['error', say('failedToClearCacheToast')]]);
  assert.deepEqual(log.events, []);
  assert.equal(detection.currentResults.length, 1);
  assert.equal(clearButton.disabled, false);
});

test('no active tab says so (it said nothing) and does not ask the worker; the button is on again', async () => {
  const { A, detection, log, clearButton } = fixture({ tab: null });
  await A.clearCache.call(detection);
  assert.deepEqual(plain(log.toasts), [['error', say('unableGetCurrentPage')]]);
  assert.deepEqual(log.messages, []);
  assert.deepEqual(log.events, []);
  assert.equal(clearButton.disabled, false);
});

test('a cancelled confirmation changes nothing: the worker is not asked and the button was never turned off', async () => {
  const { A, detection, log, clearButton } = fixture({ confirmed: false });
  await A.clearCache.call(detection);
  assert.deepEqual(log.messages, []);
  assert.deepEqual(log.toasts, []);
  assert.deepEqual(log.events, []);
  assert.equal(clearButton.disabled, false);
});

test('the button is off while the worker works, and on again when it answers', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { A, detection, clearButton, log } = fixture({ answer: () => gate });
  const done = A.clearCache.call(detection);
  await new Promise((resolve) => setImmediate(resolve)); // the worker has been asked
  assert.equal(log.messages.length, 1);
  assert.equal(clearButton.disabled, true, 'off while the worker answers');
  release({ status: 'cleared' });
  await done;
  assert.equal(clearButton.disabled, false);
});

// ---- Upload detections ------------------------------------------------------------------------------

test('the upload says "Link copied to clipboard" only when the copy worked', async () => {
  const ok = fixture({ copied: true });
  await ok.A.uploadDetectionsToPaste.call(ok.detection);
  assert.deepEqual(plain(ok.log.toasts), [['success', say('pasteUploadSuccessToast')]]);
  assert.equal(say('pasteUploadSuccessToast'), 'Link copied to clipboard');
  assert.deepEqual(ok.log.created, ['https://paste.example/abc'], 'the link opens in a tab');
  assert.equal(ok.uploadButton.disabled, false);

  const failed = fixture({ copied: false });
  await failed.A.uploadDetectionsToPaste.call(failed.detection);
  assert.deepEqual(plain(failed.log.toasts), [['error', say('clipboardCopyFailed')]], 'the clipboard refused: say so, in the existing words');
  assert.equal(say('clipboardCopyFailed'), 'Failed to copy to clipboard');
  assert.deepEqual(failed.log.created, ['https://paste.example/abc'], 'the upload worked: its link still opens, to be copied from there');
  assert.equal(failed.uploadButton.disabled, false);
  assert.equal(failed.log.copies[0][0], 'https://paste.example/abc');
});
