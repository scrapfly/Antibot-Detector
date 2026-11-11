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
    chrome: { runtime: {}, storage: { local: {
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
function logButtons(answer) {
  const nodes = {}, toasts = [], sent = [];
  const node = (selector) => (nodes[selector] = nodes[selector] || { textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const known = ['#exportLogsJsonBtn', '#exportLogsTextBtn', '#clearLogsBtn', '#logCountValue'];
  const ctx = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    chrome: { runtime: { sendMessage: async (message) => { sent.push(message.type); return answer(message); } } },
    NotificationHelper: { confirm: async () => true, success: message => toasts.push(['success', message]), error: message => toasts.push(['error', message]) },
    I18n: { get: key => en[key] && en[key].message },
    document: { querySelector: selector => (known.includes(selector) ? node(selector) : null) }
  });
  vm.runInContext('const SettingsUI = {};', ctx); // settings-ui.js defines it; the log methods only add to it
  vm.runInContext(read('sections/settings/settings-ui-logs.js'), ctx);
  vm.runInContext('SettingsUI._setupLogListeners()', ctx);
  node('#logCountValue').textContent = '42';
  return {
    sent, toasts, count: () => node('#logCountValue').textContent,
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
