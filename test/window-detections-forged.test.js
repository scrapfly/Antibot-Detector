const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The window checks reach the worker as a message from the page's own content script, and the page's world can try to
// speak for it. What the worker shows, caches, records and sends must come from the detectors it has loaded: an id it
// does not know makes no card, the name and the category are the detector's own, and a confidence is a number from 0 to 100.
// (The hook batch has always skipped unknown detectors.)

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

const DETECTORS = {
  antibot: { 'detect-cloudflare': { id: 'detect-cloudflare', name: 'Cloudflare', category: 'Anti-Bot', icon: 'cloudflare.png', description: 'CDN', author: 'Scrapfly', difficulty: 'Medium',
    detection: { window: [
      { id: 'w-cf', path: 'window.__cf', condition: 'exists', confidence: 90, description: 'a global' },
      { id: 'w-a', path: 'window.a', confidence: 60, description: 'first' },
      { id: 'w-b', path: 'window.b', confidence: 100, description: 'second' },
      { id: 'w-none', path: 'window.noConfidence', description: 'no confidence of its own' },
      { id: 'w-off', path: 'window.off', confidence: 95, enabled: false }
    ] } } },
  captcha: { 'detect-recaptcha': { id: 'detect-recaptcha', name: 'reCAPTCHA', category: 'CAPTCHA', icon: 'recaptcha.png', difficulty: 'High',
    detection: { window: [{ id: 'w-g', path: 'window.grecaptcha', confidence: 70 }] } } }
};

function harness({ ready = true } = {}) {
  const url = 'https://example.test/';
  const state = { loaded: ready, warnings: [] };
  const manager = {
    getDetector: (category, id) => (state.loaded ? (DETECTORS[category] || {})[id] : undefined),
    findDetectorById: (id) => (state.loaded ? Object.values(DETECTORS).map(group => group[id]).find(Boolean) || null : null)
  };
  const context = {
    MessageSender: require('../modules/core/message-sender.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    URL, Map, Set, Date, Promise, AbortController, console,
    Logger: new Proxy({}, { get: (_, name) => (...args) => { if (name === 'warn') state.warnings.push(args.join(' ')); } }),
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: now => now + 100,
    workerKeepaliveManager: null, Constants: { DEFAULT_MATCH_CONFIDENCE: 80 },
    setTimeout: () => 0, clearTimeout() {},
    chrome: { webNavigation: { getFrame: async () => ({ url, documentId: 'doc' }) } },
    detectorManager: manager,
    ensureDetectorManagerInitialized: async () => { state.initializations = (state.initializations || 0) + 1; state.loaded = true; },
    DetectionEngineManager: { getStoredDetection: async () => null, scansFresh: () => false, handlePageLoadNotification: async () => {} },
    HistoryRecorder: {}, Settings: {}, CategoryManager: {}, categoryManager: {}, Utils: {},
    checkAndFinalizeDetection: () => {}
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'recentDetectionRequests']) context[key] = new Map();
  context.tabsUsingCache = new Set();
  vm.createContext(context);
  for (const file of ['modules/core/bridge-protocol.js', 'modules/core/categories.js', 'background/detection-session-store.js', 'background/handlers/messages-detection.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const registry = {};
  context.registerDetectionHandlers(registry, {});
  const scan = context.DetectionSessionStore.begin(7, url);
  scan.documentId = 'doc';
  const send = async (detections) => {
    registry.WINDOW_DETECTIONS({ request: { detections, executionTime: 1 }, sender: { frameId: 0, url, documentId: 'doc', tab: { id: 7, url } }, sendResponse() {}, context: {} });
    await flush();
    return Array.from(scan.mainData, card => JSON.parse(JSON.stringify(card)));
  };
  return { send, scan, state };
}

const property = (extra = {}) => ({ path: 'window.__cf', confidence: 90, description: 'a global', actualType: 'object', condition: 'exists', ...extra });
const real = (extra = {}) => ({ detectorId: 'detect-cloudflare', detectorName: 'Cloudflare', category: 'antibot', property: property(), ...extra });

test('a detector the worker does not have makes no card, whatever name, category and confidence the message gives it', async () => {
  const h = harness();
  const cards = await h.send([
    { detectorId: 'detect-invented', detectorName: 'Totally Real Antibot', category: 'antibot', property: property({ confidence: 100 }) },
    { detectorId: 'detect-also-invented', detectorName: 'Cloudflare', category: 'captcha', property: property() }
  ]);
  assert.deepEqual(cards, [], 'nothing reaches the scan, so nothing reaches the cache, History or the webhook');
  assert.equal(h.state.warnings.length, 2, 'each one is told, as the hook batch tells it');
});

test('a known detector is shown under its own name, category and confidence rules, not the ones the message says', async () => {
  const h = harness();
  const [card] = await h.send([real({ detectorName: '<img src=x onerror=alert(1)>', category: 'fingerprint' })]);
  assert.equal(card.detector.id, 'detect-cloudflare');
  assert.equal(card.detector.name, 'Cloudflare');
  assert.equal(card.detector.icon, 'cloudflare.png');
  assert.equal(card.category, 'antibot', 'the category is the one the detector lives in');
  assert.equal(card.confidence, 90);
  assert.deepEqual(card.matches.map(m => [m.type, m.pattern, m.confidence]), [['window', 'window.__cf', 90]]);
  assert.deepEqual(card.detectionMethods, ['window']);
});

test('the detector is found under its own category when the message names another, and by its id', async () => {
  const h = harness();
  const cards = await h.send([
    real({ category: 'captcha' }),
    { detectorId: 'detect-recaptcha', detectorName: 'x', category: 'ANTI-BOT', property: property({ path: 'window.grecaptcha' }) }
  ]);
  assert.deepEqual(cards.map(c => [c.detector.id, c.detector.name, c.category]), [['detect-cloudflare', 'Cloudflare', 'antibot'], ['detect-recaptcha', 'reCAPTCHA', 'captcha']]);
});

test('the confidence, description and condition are the rule\'s own, whatever the message says', async () => {
  const sent = [1e9, 101, 100, 55.5, 0, -40, NaN, Infinity, -Infinity, '99', null, undefined, { valueOf: () => 80 }, [70]];
  for (const confidence of sent) {
    const h = harness();
    const [card] = await h.send([real({ property: property({ confidence, description: '<b>made up</b>', condition: 'typeof string' }) })]);
    assert.ok(card, String(confidence));
    assert.equal(card.confidence, 90, `${String(confidence)}: the rule says 90`);
    assert.deepEqual([card.matches[0].confidence, card.matches[0].description, card.matches[0].condition], [90, 'a global', 'exists']);
  }
  // A rule with no confidence of its own counts the default the install gives it, never what the page sends
  const h = harness();
  const [card] = await h.send([real({ property: property({ path: 'window.noConfidence', confidence: 100 }) })]);
  assert.equal(card.confidence, 80);
  assert.equal(card.matches[0].condition, 'truthy', 'no condition of its own: the default one');
});

test('a path the detector has no window rule for makes no card and no match, and neither does a rule switched off', async () => {
  const h = harness();
  const cards = await h.send([
    real({ property: property({ path: 'window.madeUp', confidence: 100 }) }),
    real({ property: property({ path: 'window.off' }) }),
    real({ property: property({ path: 'window.grecaptcha' }) }), // another detector's path
    real({ property: property({ path: 42 }) })
  ]);
  assert.deepEqual(cards, []);
  assert.equal(h.state.warnings.length, 4, 'each one is told');
  const [card] = await h.send([real({ property: property({ path: 'window.madeUp' }) }), real()]);
  assert.deepEqual(card.matches.map(m => m.pattern), ['window.__cf'], 'beside a real one, only the real one is kept');
});

test('what the page says it found is only the name of a type', async () => {
  for (const [sent, kept] of [['object', 'object'], ['null', 'null'], ['function', 'function'], ['<img src=x>', undefined], [{}, undefined], [7, undefined]]) {
    const h = harness();
    const [card] = await h.send([real({ property: property({ actualType: sent }) })]);
    assert.equal(card.matches[0].actualType, kept, String(sent));
  }
});

test('later evidence for a detector joins its card, and the card keeps the highest confidence', async () => {
  const h = harness();
  await h.send([real({ property: property({ path: 'window.a', confidence: 60 }) })]);
  const [card] = await h.send([real({ property: property({ path: 'window.b', confidence: 1e6 }) }), real({ property: property({ path: 'window.a', confidence: 60 }) })]);
  assert.deepEqual(card.matches.map(m => [m.pattern, m.confidence]), [['window.a', 60], ['window.b', 100]]);
  assert.equal(card.confidence, 100);
});

test('a detection with no property, or no id, is skipped without stopping the ones after it', async () => {
  const h = harness();
  const cards = await h.send([null, {}, { detectorId: 'detect-cloudflare' }, { detectorId: 'detect-cloudflare', property: 'x' }, real()]);
  assert.deepEqual(cards.map(c => c.detector.id), ['detect-cloudflare']);
  assert.equal(cards[0].matches.length, 1);
});

test('a worker that has just started has its detectors again before the lookup: a real detection is not lost', async () => {
  const h = harness({ ready: false });
  const cards = await h.send([real(), { detectorId: 'detect-invented', detectorName: 'X', category: 'antibot', property: property() }]);
  assert.equal(h.state.initializations, 1, 'the manager was awaited, as the hook batch awaits it');
  assert.deepEqual(cards.map(c => c.detector.id), ['detect-cloudflare']);
});
