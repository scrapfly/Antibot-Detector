const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPage, installDetail, bootstrapDetail, sleep, P } = require('./helpers/main-world-page.js');

// Payload rules marked body: "response" read the response of the URLs they
// name (ChatGPT Sentinel's chat-requirements, DeepSeek's create_pow_challenge).
// The page wraps fetch and XMLHttpRequest for those URLs only, shortens long
// strings before reporting, and the worker matches the rules and adds what they
// show to the page's result, also when the response comes after the scan.

const root = path.join(__dirname, '..');
const TOKEN = 'c'.repeat(32);
const T = P.MESSAGE_TYPES;
const readDetector = (category, id) => JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
const sentinel = readDetector('antibot', 'detect-openai-sentinel');
const deepseek = readDetector('antibot', 'detect-deepseek-pow');
const cloudflare = readDetector('antibot', 'detect-cloudflare');
const turnstile = readDetector('captcha', 'detect-turnstile');

// The ISOLATED-side module that builds the capture spec, with the real constants
const isolated = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), });
isolated.globalThis = isolated;
for (const file of ['modules/core/bridge-protocol.js', 'modules/core/constants.js', 'utils/pattern-cache.js', 'modules/detection/engine/detection-engine-hooks.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), isolated, { filename: file });
}
const specFor = (hostname, detectors = { antibot: { [sentinel.id]: sentinel, [deepseek.id]: deepseek }, captcha: { [turnstile.id]: turnstile } }) =>
  JSON.parse(JSON.stringify(isolated.demResponseCaptureSpec(detectors, hostname)));

const PREPARE = 'https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare';
const prepareBody = JSON.stringify({
  persona: 'chatgpt-paid', prepare_token: 'gAAAAAB' + 'x'.repeat(3000),
  turnstile: { required: true, dx: 'PBp5' + 'y'.repeat(9000) },
  proofofwork: { required: true, seed: '0.2823693021564392', difficulty: '06243b' },
  so: { required: true, collector_dx: 'PBp5' + 'z'.repeat(4000), snapshot_dx: 'PBp5' + 'w'.repeat(4000) }
});

// A page whose fetch and XMLHttpRequest answer from `responses` (url -> { body, type })
function pageWith(responses, { href = 'https://chatgpt.com/' } = {}) {
  const calls = { clones: 0, fetches: 0 };
  function fetch(input, init) {
    calls.fetches++;
    const url = new URL(typeof input === 'object' ? input.url : String(input), href).href;
    const entry = responses[url] || { body: 'not found', status: 404 };
    const response = new Response(entry.body, { status: entry.status || 200, headers: { 'content-type': entry.type || 'application/json' } });
    const clone = response.clone.bind(response);
    response.clone = () => { calls.clones++; return clone(); };
    void init;
    return Promise.resolve(response);
  }
  class XMLHttpRequest extends EventTarget {
    open(method, url) { this._url = new URL(url, href).href; this.responseType = ''; }
    send() {
      const entry = responses[this._url] || { body: '', status: 404 };
      setTimeout(() => { this.status = entry.status || 200; this.responseText = entry.body; this.dispatchEvent(new Event('loadend')); }, 0);
    }
  }
  const page = createPage({ href, globals: { fetch, XMLHttpRequest, URL, Response, Request, EventTarget, Event } });
  page.bootstrap(bootstrapDetail(TOKEN));
  return { page, calls, originalFetch: fetch };
}

function install(page, responseCapture) {
  const detail = installDetail(TOKEN);
  detail.responseCapture = responseCapture;
  page.install(detail);
}

test('the spec only carries the patterns that can apply to the page\'s site', () => {
  const chat = specFor('chatgpt.com').patterns.map(p => p.source);
  assert.deepEqual(chat, [sentinel.detection.payload.find(r => r.body === 'response').urlPattern]);
  assert.deepEqual(specFor('auth.openai.com').patterns.map(p => p.source), chat, 'sentinel.openai.com shares the site');
  assert.deepEqual(specFor('chat.deepseek.com').patterns.map(p => p.source), [deepseek.detection.payload.find(r => r.body === 'response').urlPattern]);
  assert.deepEqual(specFor('www.example.com').patterns, [], 'other sites wrap nothing');

  // A first-party pattern applies anywhere; a plain one is escaped; disabled detectors and evil regexes are skipped
  const custom = { antibot: { x: { id: 'x', detection: { payload: [
    { id: 'a', body: 'response', text: 'k', urlPattern: '^https?://[^/?#]+/api/challenge', urlRegex: true },
    { id: 'b', body: 'response', text: 'k', urlPattern: '/api/v1.0/check?x', urlCaseSensitive: true },
    { id: 'c', body: 'response', text: 'k', urlPattern: '(a+)+', urlRegex: true },
    { id: 'd', text: 'k', urlPattern: '/request/only' }
  ] } }, y: { id: 'y', enabled: false, detection: { payload: [{ id: 'e', body: 'response', text: 'k', urlPattern: '/off' }] } } } };
  assert.deepEqual(specFor('shop.test', custom).patterns, [
    { source: '^https?://[^/?#]+/api/challenge', flags: 'i' },
    { source: '/api/v1\\.0/check\\?x', flags: '' }
  ]);
});

test('a matching fetch is reported with long strings shortened, and the page still reads its body', async () => {
  const { page } = pageWith({ [PREPARE]: { body: prepareBody } });
  install(page, specFor('chatgpt.com'));
  const text = await page.run(`fetch('/backend-api/sentinel/chat-requirements/prepare', { method: 'post', body: '{"p":"x"}' }).then(r => r.text())`);
  assert.equal(text, prepareBody, 'the page gets the whole body');
  await sleep(10);
  const [report] = page.ofType(T.RESPONSE_BODY);
  assert.ok(report, 'reported');
  assert.equal(report.url, PREPARE);
  assert.equal(report.method, 'POST');
  assert.equal(report.status, 200);
  assert.equal(report[P.FIELDS.TOKEN], TOKEN);
  const body = JSON.parse(report.body);
  assert.deepEqual(body.proofofwork, { required: true, seed: '0.2823693021564392', difficulty: '06243b' });
  assert.equal(body.turnstile.required, true);
  assert.match(body.turnstile.dx, /^PBp5y{28}…9004$/, 'long strings keep 32 characters and their length');
  assert.ok(!report.body.includes('x'.repeat(100)), 'tokens never leave the page');
  assert.ok(report.body.length < 1000);
});

test('other URLs and event streams are never read, and fetch still looks native', async () => {
  const { page, calls, originalFetch } = pageWith({
    'https://chatgpt.com/backend-api/conversation': { body: 'data: hi\n\n', type: 'text/event-stream' },
    [PREPARE]: { body: 'data: x', type: 'text/event-stream; charset=utf-8' }
  });
  install(page, specFor('chatgpt.com'));
  await page.run(`Promise.all([fetch('/backend-api/conversation').then(r => r.text()), fetch('/backend-api/sentinel/chat-requirements/prepare').then(r => r.text()), fetch('/other')])`);
  await sleep(10);
  assert.equal(calls.fetches, 3);
  assert.equal(calls.clones, 0, 'no body was cloned');
  assert.deepEqual(page.ofType(T.RESPONSE_BODY), []);
  assert.notEqual(page.run('fetch'), originalFetch, 'wrapped');
  assert.equal(page.run('fetch.name'), 'fetch');
  // The page's Function.prototype.toString answers for the wrapper (this fake fetch comes from
  // the test's realm, so its inherited fetch.toString() is not the page's and is not checked)
  assert.equal(page.run('Function.prototype.toString.call(fetch)'), Function.prototype.toString.call(originalFetch));
  assert.equal(page.run('Object.prototype.hasOwnProperty.call(fetch, "toString")'), false);
});

test('nothing is wrapped when no pattern applies to the site, or the spec is malformed', () => {
  for (const spec of [specFor('www.example.com'), undefined, { patterns: [{ source: 'x', flags: 'i' }] }]) {
    const { page, originalFetch } = pageWith({});
    install(page, spec);
    assert.equal(page.run('fetch'), originalFetch);
  }
});

test('a later install for a site with the JS hooks off stops reading the responses an earlier one asked for', async () => {
  const { page } = pageWith({ [PREPARE]: { body: prepareBody } });
  install(page, specFor('chatgpt.com'));
  const off = installDetail(TOKEN);
  off.hooksOff = true;
  page.install(off);
  const text = await page.run(`fetch('/backend-api/sentinel/chat-requirements/prepare', { method: 'post', body: '{"p":"x"}' }).then(r => r.text())`);
  assert.equal(text, prepareBody, 'the page still gets the whole body');
  await sleep(10);
  assert.deepEqual(page.ofType(T.RESPONSE_BODY), []);
});

test('XMLHttpRequest responses are read on loadend for matching URLs', async () => {
  const challenge = 'https://chat.deepseek.com/api/v0/chat/create_pow_challenge';
  const body = JSON.stringify({ code: 0, data: { biz_data: { challenge: { algorithm: 'DeepSeekHashV1', difficulty: 144000, target_path: '/api/v0/chat/completion' } } } });
  const { page } = pageWith({ [challenge]: { body } }, { href: 'https://chat.deepseek.com/' });
  install(page, specFor('chat.deepseek.com'));
  page.run(`const a = new XMLHttpRequest(); a.open('POST', '/api/v0/chat/create_pow_challenge'); a.send('{}');
    const b = new XMLHttpRequest(); b.open('GET', '/api/v0/users/current'); b.send();`);
  await sleep(20);
  const reports = page.ofType(T.RESPONSE_BODY);
  assert.equal(reports.length, 1);
  assert.deepEqual([reports[0].url, reports[0].method, reports[0].body], [challenge, 'POST', body]);
});

// ---- worker side -----------------------------------------------------------

const Logger = new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : key === 'hostOf' ? (url) => new URL(url).hostname
  : key === 'error' ? (...args) => { throw new Error(args.join(' ')); } : () => {} });
const worker = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), 
  Logger, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  setTimeout, clearTimeout, URL
});
worker.window = worker;
for (const file of ['modules/core/constants.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`),
  'background/detection-session-store.js', 'background/detection-lifecycle.js', 'background/handlers/messages-detection.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), worker, { filename: file });
// The worker's match keys (runtime-state.js declares the stores too, so only these functions)
const runtimeState = fs.readFileSync(path.join(root, 'background/runtime-state.js'), 'utf8');
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
worker.UrlUtils = { normalizeFaviconForStorage: () => null, getHostnameFromUrl: url => new URL(url).hostname };
worker.Utils = { getHistorySettings: async () => ({}), isUrlBlacklisted: async () => false };
worker.HistoryRecorder = { shouldSaveToHistory: async () => false };
worker.isExtensionEnabled = async () => true;
const registry = {};
worker.registerDetectionHandlers(registry, {});

function fresh({ tabUrl = 'https://chatgpt.com/', cached = null } = {}) {
  for (const key of ['detectionStates', 'networkUrlsStore', 'payloadStore', 'responseStore']) worker[key].clear();
  const out = { stored: null, badge: null, messages: [] };
  worker.chrome = { runtime: { sendMessage: async (m) => { out.messages.push(m); } }, tabs: { get: async () => ({ id: 1, url: tabUrl }), sendMessage: async () => {} } };
  worker.setBadgeForDetections = async (tabId, url, results) => { out.badge = results.map(d => d.detector.id); };
  Engine.getStoredDetection = async () => cached;
  Engine.storeDetection = async (url, pageData, results) => { out.stored = results; return { url, timestamp: 1, expiry: 2, cacheScope: 'domain' }; };
  return out;
}
const send = (request, sender = { tab: { id: 1, url: 'https://chatgpt.com/' }, frameId: 0, url: 'https://chatgpt.com/' }) =>
  registry[T.RESPONSE_BODY]({ request: { type: T.RESPONSE_BODY, ...request }, sender, sendResponse: () => {} });
const compacted = (body) => body.replace(new RegExp(specFor('chatgpt.com').longString.source, 'g'), (all, inner) => JSON.stringify(inner.slice(0, 32) + '…' + inner.length));

test('response rules read only captured responses; request rules never do', () => {
  const engine = worker.detectionEngine;
  const response = { url: PREPARE, method: 'POST', data: compacted(prepareBody), type: 'response' };
  const fromResponse = engine.runDetector(sentinel, { url: 'https://chatgpt.com/', responses: [response] });
  assert.deepEqual([...fromResponse.matches.map(m => m.patternId)].sort(), ['pow-required-response', 'so-required-response']);
  // OpenAI's own Turnstile check from the same response shows on the Cloudflare Turnstile card
  const check = engine.runDetector(turnstile, { url: 'https://chatgpt.com/', dom: [], responses: [response] });
  assert.deepEqual([...check.matches.map(m => m.value)], ['"turnstile":{"required":true']);
  assert.equal(check.confidence, 60);
  const pow = fromResponse.matches.find(m => m.patternId.endsWith('pow-required-response'));
  assert.equal(pow.value, '"proofofwork":{"required":true');
  assert.equal(pow.body, 'response');
  assert.equal(pow.fullUrl, PREPARE);
  // The same text as a request body does not count, and a response does not feed request rules
  const asRequest = engine.runDetector(sentinel, { url: 'https://chatgpt.com/', payloads: [{ ...response, type: 'raw' }] });
  assert.ok(!asRequest.matches.some(m => /required-response$/.test(m.patternId)));
  const answer = { url: 'https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize', method: 'POST', data: '{"proofofwork":"gAAAAABxyz"}' };
  assert.ok(!engine.runDetector(sentinel, { url: 'https://chatgpt.com/', responses: [answer] }).matches.length);
  // Another URL's response does not count either
  assert.ok(!engine.runDetector(sentinel, { url: 'https://chatgpt.com/', responses: [{ ...response, url: 'https://chatgpt.com/backend-api/me' }] }).matches.length);
});

test('after the scan, a response adds its detector to the cached result, the badge and the popup', async () => {
  const cachedCloudflare = { detector: { id: cloudflare.id, name: cloudflare.name }, id: cloudflare.id, category: 'antibot', confidence: 100,
    matches: [{ type: 'url', pattern: 'x', value: 'https://chatgpt.com/cdn-cgi/challenge-platform/scripts/jsd/main.js', confidence: 100, patternId: 'bot-management-script' }] };
  const out = fresh({ cached: { detectionResults: [cachedCloudflare], favicon: null } });
  send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
  assert.equal(worker.responseStore.get(1).length, 1);
  await sleep(450);
  assert.ok(out.stored, 'stored');
  assert.deepEqual([...out.stored.map(d => d.detector.id)].sort(), [cloudflare.id, sentinel.id, turnstile.id].sort(), 'Cloudflare kept, Sentinel and its Turnstile check added');
  const added = out.stored.find(d => d.detector.id === sentinel.id);
  assert.ok(added.confidence >= 85);
  assert.deepEqual([...out.badge].sort(), [cloudflare.id, sentinel.id, turnstile.id].sort());
  const [notice] = out.messages.filter(m => m.type === 'NEW_DETECTION_DATA');
  assert.equal(notice.tabId, 1);
  assert.equal(notice.url, 'https://chatgpt.com/');

  // The same response again changes nothing
  const storedNow = JSON.parse(JSON.stringify(out.stored));
  out.stored = null;
  Engine.getStoredDetection = async () => ({ detectionResults: storedNow });
  send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
  await sleep(450);
  assert.equal(out.stored, null, 'no rewrite when nothing is new');
});

test('a skipped site keeps nothing from its responses: no cache entry, no badge, no popup update', async () => {
  const out = fresh({ cached: null });
  worker.Utils.isUrlBlacklisted = async () => true;
  try {
    send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
    await sleep(450);
    assert.equal(out.stored, null, 'nothing stored for a skipped site');
    assert.equal(out.badge, null, 'the badge is left alone (it says paused)');
    assert.deepEqual(out.messages.filter(m => m.type === 'NEW_DETECTION_DATA'), [], 'no popup update');
  } finally {
    worker.Utils.isUrlBlacklisted = async () => false;
  }
});

test('during a scan the scan reads the response; frames, other sites and bad messages are ignored', async () => {
  let out = fresh();
  worker.detectionStates.set(1, { url: 'https://chatgpt.com/' });
  send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
  await sleep(450);
  assert.equal(out.stored, null, 'the running scan owns it');
  assert.equal(worker.responsesForPage(1, 'https://chatgpt.com/c/123').length, 1, 'the scan finds it by origin');
  assert.equal(worker.responsesForPage(1, 'https://example.test/').length, 0, 'never on another site');

  out = fresh();
  send({ url: PREPARE, body: compacted(prepareBody) }, { tab: { id: 1, url: 'https://chatgpt.com/' }, frameId: 3, url: 'https://chatgpt.com/frame' });
  send({ url: PREPARE, body: '' });
  send({ url: 42, body: 'x' });
  send({ url: PREPARE, body: compacted(prepareBody) }, { url: 'https://chatgpt.com/' });
  assert.equal(worker.responseStore.get(1), undefined);

  // The tab moved to another site before the late check: nothing is added there
  out = fresh({ tabUrl: 'https://example.test/' });
  send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
  await sleep(450);
  assert.equal(out.stored, null);
});

test('a response that arrives during the scan is matched by the late-request check', async () => {
  const out = fresh();
  const state = { url: 'https://chatgpt.com/', mainData: [], hooksData: new Map(), completedMethods: new Set(['url']) };
  worker.detectionStates.set(1, state);
  worker.getOrCreateDetectionState = () => state;
  send({ url: PREPARE, method: 'POST', status: 200, body: compacted(prepareBody) });
  await worker.finalizeDetection(1, state);
  const found = out.stored.find(d => d.detector.id === sentinel.id);
  assert.ok(found, 'Sentinel found from the response');
  assert.ok(found.matches.some(m => m.patternId === 'pow-required-response'));
  assert.ok(out.stored.some(d => d.detector.id === turnstile.id), 'its Turnstile check too');
});
