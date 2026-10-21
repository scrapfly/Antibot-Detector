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
  const ctx = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), 
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
