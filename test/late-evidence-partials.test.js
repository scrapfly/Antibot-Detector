const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A combination rule found half by the scan (Kasada's response header, which proves nothing alone) and half by a request the page
// makes after it (the x-kpsdk-im call): the two halves together are the detection, as they are when both arrive in the scan.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readDetector = (category, id) => JSON.parse(read(`detectors/${category}/${id}.json`));
const kasada = readDetector('antibot', 'detect-kasada');
const PAGE = 'https://shop.test/';
const LATE = 'https://shop.test/?x-kpsdk-im=abc';

// Timers: the engine's own zero-delay yields run, the one-second batch waits for runTimers()
const held = new Map();
let nextTimer = 0;
const fakeSetTimeout = (callback, delay) => {
  if (!delay) return setTimeout(callback, 0);
  const id = `late-${++nextTimer}`;
  held.set(id, callback);
  return id;
};
const fakeClearTimeout = id => { if (!held.delete(id)) clearTimeout(id); };
async function runTimers() {
  const pending = [...held.values()];
  held.clear();
  for (const callback of pending) callback();
  await new Promise(resolve => setTimeout(resolve, 30));
}

const Logger = new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : key === 'hostOf' ? (url) => new URL(url).hostname
  : key === 'error' ? (...args) => { throw new Error(args.join(' ')); } : () => {} });
const worker = vm.createContext({ MessageSender: require('../modules/core/message-sender.js'), WorkerMessages: require('../modules/core/worker-messages.js'), Logger, URL,
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout });
worker.window = worker;
for (const file of ['modules/core/constants.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`),
  'background/detection-session-store.js', 'background/header-capture.js', 'background/detection-lifecycle.js'
]) vm.runInContext(read(file), worker, { filename: file });
const runtimeState = read('background/runtime-state.js');
vm.runInContext(runtimeState.slice(runtimeState.indexOf('function generateMatchKey('), runtimeState.indexOf('function sendProgressUpdate(')), worker);
const Engine = vm.runInContext('DetectionEngineManager', worker);
const definitions = { [kasada.id]: kasada };
worker.detectorManager = { findDetectorById: id => definitions[id] };
worker.detectionEngine = new Engine();
worker.detectionEngine.setDetectors({ antibot: definitions });
worker.workerKeepaliveManager = null;
worker.tabsUsingCache = new Set();
for (const key of ['interruptedDetections', 'activeDetections', 'detectionStates', 'payloadStore', 'finalizationDebounce', 'batchProcessingFlags',
  'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'responseStore']) worker[key] = new Map();
worker.UrlUtils = { normalizeFaviconForStorage: () => null, getHostnameFromUrl: url => new URL(url).hostname };
worker.Utils = { getHistorySettings: async () => ({}), isUrlBlacklisted: async () => false };
worker.HistoryRecorder = { shouldSaveToHistory: async () => false };
worker.isExtensionEnabled = async () => true;

// The real webRequest listeners of header-capture.js
const listeners = { onBeforeRequest: [], onHeadersReceived: [], onBeforeSendHeaders: [] };
const out = { cache: null, stores: 0, badge: null, messages: [], matched: 0, tabUrl: PAGE, documentId: 'doc-1' };
worker.chrome = {
  webRequest: Object.fromEntries(Object.keys(listeners).map(name => [name, { addListener: (fn, filter) => listeners[name].push({ fn, filter }) }])),
  webNavigation: { getFrame: async () => ({ documentId: out.documentId }) },
  runtime: { sendMessage: async (m) => { out.messages.push(m); } },
  tabs: { get: async (id) => ({ id, url: out.tabUrl }), sendMessage: async () => {} }
};
worker.setupHeaderCapture();
const [navigationListener, , requestListener] = listeners.onBeforeRequest;
assert.deepEqual([...navigationListener.filter.types], ['main_frame']);
const request = (url, type = 'xmlhttprequest', tabId = 1) => requestListener.fn({ tabId, url, type, method: 'GET', requestId: `r${++nextTimer}` });
const navigate = (url, tabId = 1) => navigationListener.fn({ tabId, url, type: 'main_frame', requestId: `nav${++nextTimer}` });

Engine.getStoredDetection = async () => out.cache && { detectionResults: JSON.parse(JSON.stringify(out.cache)), favicon: null };
Engine.storeDetection = async (url, pageData, results) => { out.stores++; out.pageData = pageData; out.cache = JSON.parse(JSON.stringify(results)); return { url, timestamp: 1, expiry: 2, cacheScope: 'url' }; };
worker.setBadgeForDetections = async (tabId, url, results) => { out.badge = results.map(d => `${d.detector.id}:${d.confidence}`); };
const detectOnPage = worker.detectionEngine.detectOnPage;
worker.detectionEngine.detectOnPage = function (...args) { out.matched++; return detectOnPage.apply(this, args); };


/** A finished scan of PAGE in tab 1 that saw Kasada's response header only: half of its combination, nothing shown */
async function scanned() {
  held.clear();
  for (const store of ['detectionStates', 'networkUrlsStore', 'payloadStore', 'responseStore']) worker[store].clear();
  navigate(PAGE);
  Object.assign(out, { cache: null, stores: 0, badge: null, messages: [], matched: 0, tabUrl: PAGE, documentId: 'doc-1' });
  const half = await worker.detectionEngine.detectOnPage({ url: PAGE, headers: { 'x-kpsdk-r': '1' } }, { includePartial: true, stats: {} });
  assert.ok(half.length && half.every(d => d.partial), 'the header alone is a partial detection');
  const state = { url: PAGE, documentId: 'doc-1', hooksData: new Map(), completedMethods: new Set(['cookies', 'headers', 'url', 'dom', 'payload']),
    mainData: half.map(d => ({ ...d, category: 'antibot', detector: { id: kasada.id, name: kasada.name } })) };
  worker.detectionStates.set(1, state);
  await worker.finalizeDetection(1, state);
  assert.deepEqual(out.cache, [], 'nothing shown for half a rule');
  Object.assign(out, { stores: 0, badge: null, messages: [], matched: 0 });
}

test('the other half of a combination arriving after the scan completes it: the page shows the protection', async () => {
  await scanned();
  await request(LATE);
  await runTimers();
  const found = (out.cache || []).find(d => d.detector.id === kasada.id);
  assert.ok(found, 'Kasada found from the header and the late request together');
  assert.ok(found.confidence > 0);
  assert.ok(!found.partial);
  assert.ok(found.matches.some(m => m.type === 'url'), 'the request is evidence');
  assert.ok(found.matches.some(m => m.type === 'header' || m.type === 'headers'), 'the scan\'s header is evidence too');
  assert.ok(out.badge && out.badge.some(entry => entry.startsWith(kasada.id)));
});

test('a late request of another page, or none at all, never completes it', async () => {
  await scanned();
  navigate('https://other.test/');
  out.tabUrl = 'https://other.test/';
  await request(LATE);
  await runTimers();
  assert.ok(!(out.cache || []).some(d => d.detector.id === kasada.id));
});
