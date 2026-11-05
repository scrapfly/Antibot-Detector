const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A response a page makes after its scan (a body: "response" rule: OpenAI's chat-requirements) adds its detectors to the page's saved
// result. After a rules change that result is not served any more (a result of another revision never is), so a late response used
// to be saved ALONE as the page's whole result, stamped with the new revision and served for days with no scan: only its own
// detectors, none of what the page's scan had found. With no saved result and no scan of the page remembered (a page served from the
// cache, a new document, a restarted worker) there is nothing to add the evidence to: nothing is saved and the next visit scans.
// The real engine, lifecycle and handlers run over an async fake chrome.storage.local.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readDetector = (category, id) => JSON.parse(read(`detectors/${category}/${id}.json`));
const sentinel = readDetector('antibot', 'detect-openai-sentinel');
const deepseek = readDetector('antibot', 'detect-deepseek-pow');
const cloudflare = readDetector('antibot', 'detect-cloudflare');
const turnstile = readDetector('captcha', 'detect-turnstile');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PAGE = 'https://chatgpt.com/';
const PREPARE = 'https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare';
// What the page's capture reports of the response: short values only, as the MAIN world shortens long ones
const PREPARE_BODY = JSON.stringify({ turnstile: { required: true }, proofofwork: { required: true, seed: '0.28', difficulty: '06243b' }, so: { required: true } });

function load() {
  const store = {};
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const messages = [];
  const chrome = {
    storage: { local: {
      get: async (keys) => { const out = {}; for (const key of [].concat(keys)) if (key in store) out[key] = clone(store[key]); return out; },
      set: async (values) => { Object.assign(store, clone(values)); },
      remove: async (keys) => { for (const key of [].concat(keys)) delete store[key]; }
    } },
    runtime: { sendMessage: async (message) => { messages.push(message); } },
    tabs: { get: async () => ({ id: 1, url: PAGE }), sendMessage: async () => {} }
  };
  const Logger = new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : key === 'hostOf' ? (url) => new URL(url).hostname : () => {} });
  const worker = vm.createContext({
    chrome, MessageSender: require('../modules/core/message-sender.js'), WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, setTimeout, clearTimeout, URL, console
  });
  worker.window = worker;
  worker.self = worker;
  worker.globalThis = worker;
  for (const file of ['modules/core/constants.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/hooks-config.js',
    'utils/format-utils.js', 'utils/url-utils.js', 'utils/detection-utils.js', 'utils/utils.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`),
    'background/detection-session-store.js', 'background/detection-lifecycle.js', 'background/handlers/messages-detection.js']) {
    vm.runInContext(read(file), worker, { filename: file });
  }
  const runtimeState = read('background/runtime-state.js');
  vm.runInContext(runtimeState.slice(runtimeState.indexOf('function generateMatchKey('), runtimeState.indexOf('function sendProgressUpdate(')), worker);
  const Engine = vm.runInContext('DetectionEngineManager', worker);
  const definitions = { [sentinel.id]: sentinel, [deepseek.id]: deepseek, [cloudflare.id]: cloudflare };
  worker.detectorManager = { findDetectorById: id => definitions[id] || (id === turnstile.id ? turnstile : undefined) };
  worker.detectionEngine = new Engine();
  worker.detectionEngine.setDetectors({ antibot: definitions, captcha: { [turnstile.id]: turnstile } });
  worker.workerKeepaliveManager = null;
  worker.tabsUsingCache = new Set();
  for (const key of ['interruptedDetections', 'activeDetections', 'detectionStates', 'payloadStore', 'finalizationDebounce', 'batchProcessingFlags',
    'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'responseStore']) worker[key] = new Map();
  // The real Utils and UrlUtils; only the settings reads are answered here
  vm.runInContext(`Utils.getCacheScope = async () => 'domain'; Utils.getSettings = async () => ({}); Utils.getHistorySettings = async () => ({}); Utils.isUrlBlacklisted = async () => false;`, worker);
  worker.HistoryRecorder = { shouldSaveToHistory: async () => false };
  worker.isExtensionEnabled = async () => true;
  worker.setBadgeForDetections = async () => {};
  Engine.getExpiryMs = async () => 7 * 24 * 3600 * 1000;
  const registry = {};
  worker.registerDetectionHandlers(registry, {});
  const T = vm.runInContext('ScrapflyBridgeProtocol.MESSAGE_TYPES', worker);
  /** The page's response, as the worker receives it from the MAIN world's capture, then the time the late check takes. */
  const lateResponse = async () => {
    registry[T.RESPONSE_BODY]({ request: { type: T.RESPONSE_BODY, url: PREPARE, method: 'POST', status: 200, body: PREPARE_BODY },
      sender: { tab: { id: 1, url: PAGE }, frameId: 0, url: PAGE }, sendResponse: () => {} });
    await sleep(700); // the late check runs 300 ms after the response, then reads and writes the result
  };
  return { Engine, worker, store, messages, lateResponse };
}

const scanFound = () => [{ detector: { id: cloudflare.id, name: cloudflare.name }, id: cloudflare.id, category: 'antibot', confidence: 100,
  matches: [{ type: 'url', pattern: 'x', value: 'https://chatgpt.com/cdn-cgi/challenge-platform/scripts/jsd/main.js', confidence: 100, patternId: 'bot-management-script' }] }];
const ids = (entry) => (entry ? entry.detectionResults.map(d => d.detector.id || d.id).sort() : null);
const entriesOf = (store) => Object.values(store.scrapfly_detection_storage || {});
const ALL = [cloudflare.id, sentinel.id, turnstile.id].sort();

/** The page was scanned (its result saved) a moment ago. */
async function scanned(Engine, startedAt = Date.now() - 1000) {
  await Engine.storeDetection(PAGE, { url: PAGE, hostname: 'chatgpt.com', scanStartedAt: startedAt }, scanFound());
}

test('control: with the rules unchanged a late response is added to the page\'s saved result', async () => {
  const { Engine, lateResponse } = load();
  await scanned(Engine);
  assert.deepEqual(ids(await Engine.getStoredDetection(PAGE)), [cloudflare.id]);
  await lateResponse();
  assert.deepEqual(ids(await Engine.getStoredDetection(PAGE)), ALL, 'the scan\'s detector stays, the response\'s are added');
});

test('after a rules change, with no scan of the page remembered, a late response is not saved alone as the page\'s whole result', async () => {
  const { Engine, worker, store, messages, lateResponse } = load();
  await scanned(Engine);
  await sleep(5);
  await Engine.bumpRulesRevision(); // the person edits a rule: the saved result is no longer served
  assert.strictEqual(await Engine.getStoredDetection(PAGE), null);
  assert.equal(vm.runInContext('finishedPages.has(1)', worker), false, 'a page served from the cache, or a restarted worker, remembers no scan');
  await lateResponse();
  assert.strictEqual(await Engine.getStoredDetection(PAGE), null, 'nothing is served for the next visit: it scans the page');
  assert.deepEqual(entriesOf(store).filter(entry => entry.hostname === 'chatgpt.com' && entry.rulesRev !== undefined), [], 'and nothing was saved under the new revision');
  assert.deepEqual(messages.filter(m => m.type === 'NEW_DETECTION_DATA'), [], 'the popup is told of no result made of the evidence alone');
});

test('after a rules change, a scan the worker still remembers is the base: the evidence joins what it found, saved as of the old rules', async () => {
  const { Engine, worker, store, lateResponse } = load();
  const startedAt = Date.now() - 1000;
  await scanned(Engine, startedAt);
  worker.rememberFinishedPage(1, { url: PAGE, startTime: startedAt }, scanFound());
  await sleep(5);
  await Engine.bumpRulesRevision();
  await lateResponse();
  assert.strictEqual(await Engine.getStoredDetection(PAGE), null, 'a result found before the change is not served');
  const [saved] = entriesOf(store).filter(entry => entry.hostname === 'chatgpt.com');
  assert.deepEqual(ids(saved), ALL, 'it holds the scan\'s results and the evidence, not the evidence alone');
  assert.equal(saved.rulesRev, undefined, 'dated as the old rules');
});

test('a result another tab saved under the new rules is kept, and the late evidence joins it', async () => {
  const { Engine, worker, lateResponse } = load();
  const startedAt = Date.now() - 2000;
  await scanned(Engine, startedAt);
  worker.rememberFinishedPage(1, { url: PAGE, startTime: startedAt }, scanFound()); // this tab's scan began before the change
  await sleep(5);
  await Engine.bumpRulesRevision();
  await sleep(5);
  // Another tab loads the page after the change: its scan is of the new rules and its result is served
  await Engine.storeDetection(PAGE, { url: PAGE, hostname: 'chatgpt.com', scanStartedAt: Date.now() }, scanFound());
  const served = await Engine.getStoredDetection(PAGE);
  assert.deepEqual(ids(served), [cloudflare.id]);
  assert.ok(served.rulesRev > 0, 'under the new revision');
  await lateResponse();
  const after = await Engine.getStoredDetection(PAGE);
  assert.deepEqual(ids(after), ALL, 'merged into the result that is served, which stays served');
  assert.equal(after.rulesRev, served.rulesRev);
});
