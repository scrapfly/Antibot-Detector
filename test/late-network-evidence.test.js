const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// URL rules (scope "all") also match requests a page makes after its scan
// finished: CHEQ's beacons and validation calls come seconds after load, when
// the scan is over. The tab's requests are checked in batches (one a second),
// the evidence is merged into the page's cached result (combinations scored
// again), and the badge and popup follow, as late responses do. A request of
// another page never reaches the old page's result.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readDetector = (category, id) => JSON.parse(read(`detectors/${category}/${id}.json`));
const cheq = readDetector('antibot', 'detect-cheq');
const cloudflare = readDetector('antibot', 'detect-cloudflare');
const PAGE = 'https://shop.test/';
const PROOF = 'https://obs.cheqzone.com/c/beacon?id=1';

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
const worker = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), Logger, URL,
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
const definitions = { [cheq.id]: cheq, [cloudflare.id]: cloudflare };
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
Engine.storeDetection = async (url, pageData, results) => { out.stores++; out.cache = JSON.parse(JSON.stringify(results)); return { url, timestamp: 1, expiry: 2, cacheScope: 'url' }; };
worker.setBadgeForDetections = async (tabId, url, results) => { out.badge = results.map(d => `${d.detector.id}:${d.confidence}`); };
const detectOnPage = worker.detectionEngine.detectOnPage;
worker.detectionEngine.detectOnPage = function (...args) { out.matched++; return detectOnPage.apply(this, args); };

/** A finished scan of PAGE in tab 1 that saw CHEQ's visitor cookie only */
async function scanned() {
  held.clear();
  for (const store of ['detectionStates', 'networkUrlsStore', 'payloadStore', 'responseStore']) worker[store].clear();
  navigate(PAGE);
  Object.assign(out, { cache: null, stores: 0, badge: null, messages: [], matched: 0, tabUrl: PAGE, documentId: 'doc-1' });
  const fromCookie = worker.detectionEngine.runDetector(cheq, { url: PAGE, dom: [], allCookies: [{ name: '_cq_duid', value: 'abc' }] });
  assert.ok(fromCookie.detected && fromCookie.confidence < 100, `the cookie alone is below proof (${fromCookie.confidence})`);
  const state = { url: PAGE, documentId: 'doc-1', hooksData: new Map(), completedMethods: new Set(['cookies', 'headers', 'url', 'dom', 'payload']),
    mainData: [{ ...fromCookie, category: 'antibot', detector: { id: cheq.id, name: cheq.name } }] };
  worker.detectionStates.set(1, state);
  await worker.finalizeDetection(1, state);
  assert.equal(worker.detectionStates.has(1), false, 'the scan finished');
  const before = out.cache.find(d => d.detector.id === cheq.id);
  assert.ok(before && before.confidence < 100);
  Object.assign(out, { stores: 0, badge: null, messages: [], matched: 0 });
  return before.confidence;
}

test('a CHEQ proof request after the scan raises CHEQ to its proof confidence in the cache, the badge and the popup', async () => {
  await scanned();
  await request(PROOF);
  assert.equal(out.matched, 0, 'checked in a batch, not on every request');
  await runTimers();
  assert.equal(out.matched, 1);
  assert.equal(out.stores, 1, 'the cached result is rewritten once');
  const found = out.cache.find(d => d.detector.id === cheq.id);
  assert.equal(found.confidence, 100);
  assert.ok(found.matches.some(m => m.type === 'url' && m.fullUrl === PROOF), 'the request is the evidence');
  assert.ok(found.matches.some(m => m.type === 'cookie'), 'the scan\'s own evidence stays');
  assert.deepEqual([...out.badge], [`${cheq.id}:100`]);
  const [notice] = out.messages.filter(m => m.type === 'NEW_DETECTION_DATA');
  assert.equal(notice.url, PAGE);
  assert.equal(notice.detectionResults.find(d => d.detector.id === cheq.id).confidence, 100);

  // The same request again, and a repeat of the evidence, change nothing
  await request(PROOF);
  await runTimers();
  assert.equal(out.stores, 1);
});

test('a detector the scan did not find is added from a late request', async () => {
  await scanned();
  await request('https://shop.test/cdn-cgi/challenge-platform/scripts/jsd/main.js', 'script');
  await runTimers();
  assert.equal(out.stores, 1);
  const ids = out.cache.map(d => d.detector.id).sort();
  assert.deepEqual(ids, [cheq.id, cloudflare.id].sort(), 'Cloudflare added, CHEQ kept as the scan found it');
  assert.ok(out.cache.find(d => d.detector.id === cheq.id).confidence < 100);
});

test('a request after a navigation never touches the old page', async () => {
  await scanned();
  navigate('https://other.test/');
  out.tabUrl = 'https://other.test/';
  await request(PROOF);
  await runTimers();
  assert.equal(out.matched, 0, 'nothing matched for the old page');
  assert.equal(out.stores, 0);
  assert.equal(out.badge, null);

  // A new document at the same address (no main_frame request seen), or an address change in the page, ends it too
  await scanned();
  out.documentId = 'doc-2';
  await request(PROOF);
  await runTimers();
  assert.equal(out.stores, 0, 'another document');
  await scanned();
  out.tabUrl = 'https://shop.test/checkout';
  await request(PROOF);
  await runTimers();
  assert.equal(out.stores, 0, 'another address');
  // ... and the page stays forgotten
  out.tabUrl = PAGE;
  await request(PROOF + '&again');
  await runTimers();
  assert.equal(out.matched, 0);
});

test('a new scan, a cache hit or a closed tab takes no late evidence', async () => {
  await scanned();
  worker.detectionStates.set(1, { url: PAGE });
  await request(PROOF);
  await runTimers();
  assert.equal(out.stores, 0, 'the running scan reads the request itself');
  worker.detectionStates.delete(1);

  await scanned();
  worker.tabsUsingCache.add(1);
  try {
    worker.noteLateNetworkUrl(1, { url: PROOF, type: 'xmlhttprequest', method: 'GET' });
    await runTimers();
    assert.equal(out.stores, 0, 'served from cache');
  } finally {
    worker.tabsUsingCache.delete(1);
  }

  await scanned();
  worker.forgetFinishedPage(1);
  await request(PROOF);
  await runTimers();
  assert.equal(out.matched, 0);
});

test('a request no URL rule matches changes nothing and rescores nothing', async () => {
  await scanned();
  await request('https://shop.test/api/cart');
  await request('https://cdn.shop.test/pixel.gif', 'image');
  await runTimers();
  assert.equal(out.matched, 1, 'one check of the batch');
  assert.equal(out.stores, 0, 'no cache write');
  assert.equal(out.badge, null, 'no badge update');
  assert.deepEqual(out.messages, [], 'no popup update');
});

test('many requests in one second are one check and one rescore; the work is bounded', async () => {
  await scanned();
  for (let i = 0; i < 500; i++) await request(`https://shop.test/track?i=${i}`, 'ping');
  await request(PROOF);
  for (let i = 0; i < 50; i++) await request(PROOF); // repeats are one URL
  await runTimers();
  assert.equal(out.matched, 1, 'one engine run for the first 300 requests');
  assert.equal(out.stores, 0, 'the proof request waits for the next second');
  await runTimers();
  assert.equal(out.matched, 2, 'the rest in one more run');
  assert.equal(out.stores, 1);
  assert.equal(out.cache.find(d => d.detector.id === cheq.id).confidence, 100);
  await runTimers();
  assert.equal(out.matched, 2, 'then nothing is left to check');

  await scanned();
  for (let i = 0; i < 100; i++) await request(`https://shop.test/track?i=${i}`, 'ping');
  await request(PROOF);
  await request('https://obs.cheqzone.com/c/beacon?id=2');
  await runTimers();
  assert.equal(out.matched, 1);
  assert.equal(out.stores, 1, 'one rewrite for two proof requests');
  assert.equal(out.cache.find(d => d.detector.id === cheq.id).confidence, 100);
});

test('the listener hands every recorded request to the late check, and a new page forgets the finished one', () => {
  const capture = read('background/header-capture.js');
  assert.match(capture, /recordNetworkUrl\(networkUrls, entry, [^)]+\);\s*networkUrlsStore\.set\(tabId, networkUrls\);[\s\S]{0,200}noteLateNetworkUrl\(tabId, entry\)/);
  assert.match(capture, /function forgetTabRequests[\s\S]*?forgetFinishedPage\(tabId\)[\s\S]*?\n}/);
  assert.match(read('background/tab-events.js'), /onRemoved[\s\S]{0,200}forgetFinishedPage\(tabId\)/);
});

test('a hooks or window completion that arrives after the scan finished starts no new scan', async () => {
  await scanned();
  vm.runInContext(read('background/handlers/messages-detection.js'), worker, { filename: 'messages-detection.js' });
  const late = { tabId: 1, url: PAGE, documentId: 'doc-1', verified: true };
  assert.equal(worker.skippedForCachedPage(late, 'idle'), true, 'the same document: nothing left to complete');
  assert.equal(worker.skippedForCachedPage({ ...late, documentId: 'doc-2' }, 'idle'), false, 'another document is a page of its own');
  worker.detectionStates.set(1, { url: PAGE });
  assert.equal(worker.skippedForCachedPage(late, 'idle'), false, 'a scan running for the tab takes it');
  worker.detectionStates.delete(1);
});
