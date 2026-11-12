const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function harness() {
  const state = { settings: { logCollectorEnabled: false, logCollectorMaxLogs: 5000 }, fail: false, writes: 0, removed: [], listeners: [] };
  const noop = () => {};
  const ctx = vm.createContext({ MessageSender: require('../modules/core/message-sender.js'), WorkerMessages: require('../modules/core/worker-messages.js'), 
    Constants: { LOG_COLLECTOR_MAX_LOGS: 5000, LOG_COLLECTOR_MAX_PERSISTED: 500, LOG_COLLECTOR_RATE_LIMIT: 100 },
    Logger: { error: noop, debug: noop, warn: noop },
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    navigator: { userAgent: 'test-agent' },
    chrome: { runtime: { getManifest: () => ({ version: '9.9.9' }) }, storage: { local: {
      get(keys, callback) { callback({ scrapfly_settings: { settings: state.settings } }); },
      async remove(keys) { state.removed.push(...keys); }
    }, onChanged: { addListener(fn) { state.listeners.push(fn); } } } },
    StorageManager: {
      async patchSettings(patch) { if (state.fail) return false; state.writes++; Object.assign(state.settings, patch); return true; },
      async readSettingsStrict() { return state.settings; }
    },
    setTimeout, clearTimeout
  });
  ctx.self = ctx;
  ctx.importScripts = noop;
  vm.runInContext(read('modules/core/log-collector.js'), ctx);
  vm.runInContext(read('background/handlers/messages-log-collector.js'), ctx);
  const registry = {};
  ctx.registerLogCollectorHandlers(registry, {});
  return { state, collector: ctx.logCollector, registry };
}

test('saved log preferences apply without another settings write', async () => {
  const h = harness();
  await h.collector.initPromise;
  await h.state.listeners[0]({ scrapfly_settings: { newValue: { settings: { logCollectorEnabled: true, logCollectorMaxLogs: 250 } } } }, 'local');
  assert.equal(h.collector.enabled, true);
  assert.equal(h.collector.maxLogs, 250);
  assert.equal(h.state.writes, 0);
});

test('failed log preference persistence keeps runtime state and legacy keys', async () => {
  const h = harness();
  await h.collector.initPromise;
  h.state.fail = true;
  assert.equal(await h.collector.enable(), false);
  assert.equal(await h.collector.setMaxLogs(250), false);
  assert.equal(h.collector.enabled, false);
  assert.equal(h.collector.maxLogs, 5000);
  assert.deepEqual(h.state.removed, []);
  h.state.fail = false;
  assert.equal(await h.collector.enable(), true);
  assert.equal(h.collector.enabled, true);
  assert.deepEqual(h.state.removed, ['scrapfly_log_collector_enabled']);
});

test('log command acknowledgments reflect completed persistence', async () => {
  const h = harness();
  await h.collector.initPromise;
  h.state.fail = true;
  const request = type => new Promise(resolve => {
    assert.equal(h.registry[type]({ request: { maxLogs: 250 }, sendResponse: resolve }), true);
  });
  for (const type of ['LOG_COLLECTOR_ENABLE', 'LOG_COLLECTOR_DISABLE', 'LOG_COLLECTOR_SET_MAX_LOGS']) {
    assert.equal((await request(type)).status, 'error');
  }
  h.state.fail = false;
  assert.equal((await request('LOG_COLLECTOR_ENABLE')).status, 'success');
  assert.equal(h.collector.enabled, true);
});

test('the log collector answers extension pages only: a content script cannot switch it, clear it or write its export', () => {
  const h = harness();
  const fromPage = { url: 'https://shop.example/', tab: { id: 3, url: 'https://shop.example/' } };
  for (const type of ['LOG_COLLECTOR_ENABLE', 'LOG_COLLECTOR_DISABLE', 'LOG_COLLECTOR_CLEAR', 'LOG_COLLECTOR_EXPORT_JSON', 'LOG_COLLECTOR_EXPORT_TEXT', 'LOG_COLLECTOR_GET_COUNT', 'LOG_COLLECTOR_SET_MAX_LOGS']) {
    let answer;
    h.registry[type]({ request: { maxLogs: 250 }, sender: fromPage, sendResponse: (value) => { answer = value; } });
    assert.equal(answer && answer.status, 'error', type);
    assert.match(answer.error, /extension pages only/, type);
  }
  assert.equal(h.state.writes, 0, 'nothing was saved');
});

// ---- Settings → Log collector: Clear and Export say what the worker answered

const en = JSON.parse(read('_locales/en/messages.json'));
// Not a success: the worker's own error, "unknown" from a worker that predates the message (an unpacked extension edited without a reload), no answer, a closed port
const NOT_DONE = {
  'an error answer': () => ({ status: 'error', message: 'LogCollector not available' }),
  'an unknown answer': () => ({ status: 'unknown' }),
  'no answer': () => undefined,
  'a closed message port': () => { throw new Error('The message port closed before a response was received.'); }
};

/** sections/settings/settings-ui-logs.js wired to fake buttons; the worker answers each message with what `answer` returns. */
function logButtons(answer, { downloads = null } = {}) {
  const nodes = {}, toasts = [], sent = [], blobs = [], revoked = [];
  const runtime = { lastError: undefined, sendMessage: async (message) => { sent.push(message.type); return answer(message); } };
  const node = (selector) => (nodes[selector] = nodes[selector] || { textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const known = ['#exportLogsJsonBtn', '#exportLogsTextBtn', '#clearLogsBtn', '#logCountValue'];
  const ctx = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    chrome: { runtime, ...(downloads ? { downloads } : {}) },
    Blob: class { constructor(parts, options) { this.text = parts.join(''); this.type = options && options.type; } },
    URL: { createObjectURL: (blob) => { blobs.push(blob); return `blob:test/${blobs.length}`; }, revokeObjectURL: (url) => revoked.push(url) },
    setTimeout: (fn) => { fn(); return 0; },
    NotificationHelper: { confirm: async () => true, success: message => toasts.push(['success', message]), error: message => toasts.push(['error', message]) },
    I18n: { get: key => en[key] && en[key].message },
    document: { querySelector: selector => (known.includes(selector) ? node(selector) : null) }
  });
  vm.runInContext('const SettingsUI = {};', ctx); // settings-ui.js defines it; the log methods only add to it
  vm.runInContext(read('sections/settings/settings-ui-logs.js'), ctx);
  vm.runInContext('SettingsUI._setupLogListeners()', ctx);
  node('#logCountValue').textContent = '42';
  return {
    sent, toasts, blobs, revoked, setLastError: (error) => { runtime.lastError = error; }, count: () => node('#logCountValue').textContent,
    async press(selector) { await node(selector).listeners.click(); await new Promise(resolve => setImmediate(resolve)); }
  };
}

test('Clear logs empties the counter and says so only when the worker answered success', async () => {
  const done = logButtons(() => ({ status: 'success' }));
  await done.press('#clearLogsBtn');
  assert.deepEqual(done.sent, [WorkerMessages.LOG_COLLECTOR_CLEAR]);
  assert.equal(done.count(), '0');
  assert.deepEqual(done.toasts, [['success', en.logsCleared.message]]);

  for (const [name, answer] of Object.entries(NOT_DONE)) {
    const notDone = logButtons(answer);
    await notDone.press('#clearLogsBtn');
    assert.equal(notDone.count(), '42', `${name}: the counter stays what it was`);
    assert.deepEqual(notDone.toasts, [['error', en.failedClearLogs.message]], name);
  }
});

test('Export logs says it failed unless the worker answered success, which needs no toast: the download is the answer', async () => {
  for (const [button, type] of [['#exportLogsJsonBtn', WorkerMessages.LOG_COLLECTOR_EXPORT_JSON], ['#exportLogsTextBtn', WorkerMessages.LOG_COLLECTOR_EXPORT_TEXT]]) {
    const done = logButtons(() => ({ status: 'success', filename: 'logs' }));
    await done.press(button);
    assert.deepEqual(done.sent, [type]);
    assert.deepEqual(done.toasts, [], button);

    for (const [name, answer] of Object.entries(NOT_DONE)) {
      const notDone = logButtons(answer);
      await notDone.press(button);
      assert.deepEqual(notDone.toasts, [['error', en.failedExportLogs.message]], `${button}: ${name}`);
    }
  }
});

// A full log (5,000 entries) went out as a data: URL of about 2.15 million characters, over Chrome's limit for one, so the download
// failed with nothing said: the worker answered success before the download had even started. The worker now builds the file and
// hands it over; Settings saves it from a Blob, which has no such limit, and says it failed unless the download started.

test('Export builds the whole log in the worker and hands the file to Settings, never as a data: address', async () => {
  const h = harness();
  await h.collector.initPromise;
  const long = 'x'.repeat(400);
  for (let i = 0; i < 5000; i++) h.collector._writeEntry({ timestamp: 1700000000000 + i, relativeTime: i, level: 'log', message: `line ${i} ${long}` });
  const ask = (type) => new Promise(resolve => h.registry[type]({ request: {}, sendResponse: resolve }));
  const text = await ask(WorkerMessages.LOG_COLLECTOR_EXPORT_TEXT);
  assert.equal(text.status, 'success');
  assert.match(text.filename, /^scrapfly-logs-\d+\.txt$/);
  assert.match(text.type, /^text\/plain/);
  assert.ok(text.text.includes('line 0 ') && text.text.includes('line 4999 '), 'every entry is in the file');
  assert.ok(text.text.length > 2 * 1024 * 1024, 'over the size a data: address can carry');
  const json = await ask(WorkerMessages.LOG_COLLECTOR_EXPORT_JSON);
  assert.equal(json.status, 'success');
  assert.match(json.filename, /^scrapfly-logs-\d+\.json$/);
  assert.match(json.type, /^application\/json/);
  assert.equal(JSON.parse(json.text).logs.length, 5000);
  assert.doesNotMatch(read('modules/core/log-collector.js'), /data:(application|text)\//, 'no data: address is built for a download');
});

test('Export saves the worker\'s file from a Blob and says it failed when the download does not start', async () => {
  const file = { status: 'success', filename: 'scrapfly-logs-1.txt', type: 'text/plain;charset=utf-8', text: 'the log' };
  for (const [button, type] of [['#exportLogsJsonBtn', WorkerMessages.LOG_COLLECTOR_EXPORT_JSON], ['#exportLogsTextBtn', WorkerMessages.LOG_COLLECTOR_EXPORT_TEXT]]) {
    const started = [];
    const done = logButtons(() => file, { downloads: { download: (options, callback) => { started.push(options); callback(12); } } });
    await done.press(button);
    assert.deepEqual(done.sent, [type]);
    assert.equal(started.length, 1, button);
    assert.equal(started[0].filename, 'scrapfly-logs-1.txt');
    assert.equal(started[0].url, 'blob:test/1');
    assert.equal(done.blobs[0].text, 'the log');
    assert.equal(done.blobs[0].type, 'text/plain;charset=utf-8');
    assert.deepEqual(done.toasts, [], `${button}: the download is the answer`);
    assert.deepEqual(done.revoked, ['blob:test/1'], 'the Blob address is let go');
  }
  // A refused download sets chrome.runtime.lastError for the time of its callback
  let failed = null;
  const refusals = {
    'a refused download': { download: (options, callback) => { failed.setLastError({ message: 'Invalid URL' }); callback(undefined); failed.setLastError(undefined); } },
    'no download id': { download: (options, callback) => callback(undefined) },
    'a download call that throws': { download: () => { throw new Error('No downloads here'); } }
  };
  for (const [name, downloads] of Object.entries(refusals)) {
    failed = logButtons(() => file, { downloads });
    await failed.press('#exportLogsTextBtn');
    assert.deepEqual(failed.toasts, [['error', en.failedExportLogs.message]], name);
  }
  const noApi = logButtons(() => file);
  await noApi.press('#exportLogsTextBtn');
  assert.deepEqual(noApi.toasts, [['error', en.failedExportLogs.message]], 'no downloads API');
});
