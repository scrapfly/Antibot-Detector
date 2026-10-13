const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  const messages = [];
  const effects = [];
  const timers = [];
  const current = { url: 'https://example.test/', documentId: 'doc-first' };
  const context = {
    URL, Promise, Map, Set, Date, AbortController, PatternCache: class {},
    Constants: { REQUEST_DETECTION_PENDING_TIMEOUT: 10000, DETECTION_SKIP_THRESHOLD: 1500 },
    Logger: new Proxy({}, { get: () => () => {} }),
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: value => value + 100,
    workerKeepaliveManager: null,
    setTimeout: callback => timers.push(callback), clearTimeout: () => {},
    startBadgeSpinner: tabId => effects.push({ type: 'spinner', tabId }),
    Utils: { isValidContentScriptTab: () => true, shouldSkipDetection: () => false },
    chrome: {
      storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
      runtime: {}, webNavigation: { getFrame: async () => ({ ...current }) },
      action: { setBadgeText: async value => effects.push({ type: 'badge', ...value }) },
      tabs: {
        get: async () => ({ id: 7, url: current.url }),
        sendMessage: (tabId, message, options, callback) => messages.push({ tabId, message, options, callback })
      }
    }
  };
  for (const key of ['activeDetections', 'detectionStates', 'recentDetectionRequests', 'interruptedDetections',
    'batchProcessingFlags', 'finalizationDebounce']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'background/detection-session-store.js', 'modules/detection/engine/detection-engine-manager.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  vm.runInContext('globalThis.Engine = DetectionEngineManager', context);
  const request = () => {
    const responses = [];
    const done = context.Engine.handleRequestDetection({ tabId: 7 }, value => responses.push(value), context);
    return { done, responses };
  };
  const reply = (entry, value = { status: 'active' }, error) => {
    if (error) context.chrome.runtime.lastError = { message: error };
    entry.callback(value);
    delete context.chrome.runtime.lastError;
  };
  const begin = () => {
    const state = context.DetectionSessionStore.begin(7, current.url);
    state.documentId = current.documentId;
    return state;
  };
  return { ctx: context, current, messages, effects, timers, request, reply, begin };
}

test('manual requests preserve an already-running page scan', async () => {
  const h = harness();
  const state = h.begin();
  const request = h.request();
  await request.done;
  assert.equal(request.responses[0].status, 'skipped');
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, state), true);
  assert.equal(h.messages.length, 0);
  assert.equal(h.effects.length, 0);
});

test('a scan appearing during the enabled read is never replaced with a pending request', async () => {
  const h = harness();
  const gate = deferred();
  h.ctx.chrome.storage.local.get = () => gate.promise;
  const request = h.request();
  const state = h.begin();
  gate.resolve({ scrapfly_enabled: true });
  await request.done;
  assert.equal(request.responses[0].status, 'skipped');
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, state), true);
  assert.equal(h.messages.length, 0);
});

test('a page scan starting while the content-script ping awaits remains current', async () => {
  const h = harness();
  const request = h.request();
  await flush();
  assert.equal(h.messages[0].message.type, 'GET_DETECTION_STATUS');
  assert.deepEqual({ ...h.messages[0].options }, { documentId: 'doc-first' });
  const state = h.begin();
  h.reply(h.messages[0]);
  await request.done;
  assert.equal(request.responses[0].status, 'skipped');
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, state), true);
  assert.equal(h.ctx.activeDetections.get(7), state.activeDetection);
  assert.equal(h.messages.length, 1);
  assert.equal(h.effects.length, 0);
});

test('same-URL reload during the ping cannot receive RUN_DETECTION or a badge reset', async () => {
  const h = harness();
  const request = h.request();
  await flush();
  h.current.documentId = 'doc-reloaded';
  h.reply(h.messages[0], null, 'No receiving end');
  await request.done;
  assert.equal(request.responses[0].status, 'skipped');
  assert.equal(h.messages.length, 1);
  assert.equal(h.effects.length, 0);
  assert.equal(h.ctx.activeDetections.size, 0);
});

test('concurrent requests reserve a single pending scan after their pings finish', async () => {
  const h = harness();
  const first = h.request();
  const second = h.request();
  await flush();
  assert.equal(h.messages.length, 2);
  h.reply(h.messages[0]);
  await flush();
  const marker = h.ctx.activeDetections.get(7);
  assert.equal(marker.pendingRequest, true);
  h.reply(h.messages[1]);
  await second.done;
  assert.equal(second.responses[0].status, 'skipped');
  assert.equal(h.ctx.activeDetections.get(7), marker);
  assert.equal(h.messages.filter(entry => entry.message.type === 'RUN_DETECTION').length, 1);
  h.reply(h.messages[2], { status: 'detection_started' });
  await first.done;
  assert.equal(first.responses[0].status, 'requested');
});

for (const reload of [false, true]) {
  test(`delayed RUN_DETECTION error and cleanup cannot alter a newer scan (reload=${reload})`, async () => {
    const h = harness();
    const request = h.request();
    await flush();
    h.reply(h.messages[0]);
    await flush();
    const run = h.messages.find(entry => entry.message.type === 'RUN_DETECTION');
    assert.deepEqual({ ...run.options }, { documentId: 'doc-first' });
    const pending = h.ctx.activeDetections.get(7);
    if (reload) h.current.documentId = 'doc-reloaded';
    const state = h.begin();
    const effectCount = h.effects.length;
    h.reply(run, null, 'No receiving end');
    await request.done;
    h.timers[0]();
    assert.equal(h.ctx.activeDetections.get(7), state.activeDetection);
    assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, state), true);
    assert.notEqual(state.activeDetection, pending);
    assert.equal(h.effects.length, effectCount);
    assert.equal(request.responses.length, 1);
    assert.equal(request.responses[0].status, 'skipped');
  });
}

test('pending cleanup compares object identity even when request timestamps collide', async () => {
  const h = harness();
  const request = h.request();
  await flush();
  h.reply(h.messages[0]);
  await flush();
  const marker = h.ctx.activeDetections.get(7);
  const newer = { ...marker };
  h.ctx.activeDetections.set(7, newer);
  h.reply(h.messages[1], { status: 'detection_started' });
  await request.done;
  h.timers[0]();
  assert.equal(h.ctx.activeDetections.get(7), newer);
});

test('a missing content script in the current document still returns needs_reload', async () => {
  const h = harness();
  const request = h.request();
  await flush();
  h.reply(h.messages[0], null, 'No receiving end');
  await request.done;
  assert.equal(request.responses[0].status, 'needs_reload');
  assert.equal(h.effects.at(-1).type, 'badge');
  assert.equal(h.ctx.activeDetections.size, 0);
});
