const { test } = require('node:test');
const assert = require('node:assert/strict');
const { engineContext, plain, ENGINE_FILES } = require('./helpers/engine-context.js');
const { createPage, bootstrapDetail, P } = require('./helpers/main-world-page.js');

// The install event the content script sends the page's world (DetectionEngineManager.installHooksOrchestrator).
//
// A switched-off extension used to send an empty install without the hooksOff mark: the page's world takes the early recorders
// off the top window on any install, but retires the frame instrumentation (the frame accessors, the recorders put into frames
// and the document-wide MutationObserver) only for hooksOff. So a page loaded while the extension was off kept the observer
// and the wrapped accessors for as long as it lived.
//
// Settings that cannot be read (the storage read fails, or the stored value is not JSON or not an object) are not "no skipped
// sites, no hooks-off sites": the install carries no hooks at all, and says so once, naming the error and never the stored text.

const TOKEN = 'engine-install-token';
const DETECTORS = {
  fingerprint: { 'detect-fp': { id: 'detect-fp', name: 'FP', enabled: true, detection: {
    js_hooks: [{ target: 'HTMLCanvasElement.prototype.toDataURL', confidence: 80 }], window: [{ path: 'fpGlobal', confidence: 90 }] } } },
  antibot: { 'detect-resp': { id: 'detect-resp', name: 'Resp', enabled: true, detection: {
    payload: [{ id: 'challenge', urlPattern: 'https://api.example.test/challenge', body: 'response', text: 'x', confidence: 80 }] } } }
};

const pick = (store, keys) => Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, store[key]]));

/** The content script's install, with the real StorageManager reading a fake storage. */
async function install({ store = {}, get, hostname = 'site.test', options } = {}) {
  const chrome = { storage: { local: { get: get || (async (keys) => pick({ scrapfly_detectors: { detectors: DETECTORS }, ...store }, keys)) } } };
  const { Engine, logs } = engineContext({ chrome }, { files: [...ENGINE_FILES, 'modules/core/storage-manager.js'] });
  const events = [];
  const window = { location: { hostname, href: `https://${hostname}/` }, ScrapflyBridge: { getToken: () => TOKEN }, dispatchEvent(event) { events.push(event); } };
  await Engine.installHooksOrchestrator(window, chrome, options);
  assert.equal(events.length, 1, 'exactly one install event, so the page\'s world never waits for one');
  return { detail: plain(events[0].detail), logs, Engine, window, chrome };
}

const nothingInstalled = (detail, label) => {
  assert.deepEqual(detail.hookDefinitions, [], `${label}: no hooks`);
  assert.deepEqual(detail.windowProperties, [], `${label}: no window checks`);
  assert.ok(!('responseCapture' in detail), `${label}: no response capture`);
  assert.equal(detail.hooksOff, true, `${label}: the page's world takes everything off its frames`);
};

// ---- A switched-off extension

test('a switched-off extension sends an install with no hooks, no window checks and the hooksOff mark', async () => {
  const { detail, logs } = await install({ store: { scrapfly_enabled: false } });
  nothingInstalled(detail, 'extension off');
  assert.equal(detail.fingerprintEnabled, false);
  assert.equal(detail[P.FIELDS.TOKEN], TOKEN);
  assert.deepEqual(logs.warn, [], 'a switched-off extension is not a fault');
  assert.deepEqual(logs.error, []);
});

test('the same install takes the frame instrumentation off a page that was bootstrapped before the extension was read as off', async () => {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.connected = true; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.connected = false; }
  }
  const page = createPage({ globals: { MutationObserver: FakeMutationObserver } });
  page.run(`
    function HTMLIFrameElement() {}
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { return null; }, configurable: true });
  `);
  const getter = 'Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow").get';
  const original = page.run(getter);

  // content.js fires the bootstrap first and reads whether the extension is on afterwards
  page.bootstrap(bootstrapDetail(TOKEN));
  assert.notStrictEqual(page.run(getter), original, 'the bootstrap wrapped the frame accessor');
  assert.equal(observers.length, 1, 'and put an observer on the document');

  const { detail } = await install({ store: { scrapfly_enabled: false } });
  page.install(detail);
  assert.strictEqual(page.run(getter), original, 'the accessor is the page\'s own again');
  assert.ok(observers.every(observer => !observer.connected), 'no observer is left on the document');
});

test('an extension that is on still installs its hooks and its response capture, and leaves the page\'s frames to them', async () => {
  const { detail } = await install({ store: { scrapfly_enabled: true } });
  assert.deepEqual(detail.hookDefinitions.map(entry => entry.id), ['detect-fp']);
  assert.deepEqual(detail.windowProperties.map(property => property.path), ['fpGlobal']);
  assert.equal(detail.responseCapture.patterns.length, 1);
  assert.ok(!('hooksOff' in detail));
  assert.equal(detail.fingerprintEnabled, true);
});

test('with no detectors stored the install is still sent, with nothing to hook', async () => {
  for (const scrapfly_detectors of [{}, { detectors: null }]) {
    const { detail } = await install({ store: { scrapfly_detectors } });
    assert.deepEqual(detail.hookDefinitions, [], JSON.stringify(scrapfly_detectors));
    assert.deepEqual(detail.windowProperties, []);
    assert.equal(detail.fingerprintEnabled, true);
  }
});

// ---- Settings that cannot be read

const UNREADABLE = {
  'a string that is not JSON': '{"detection": {"hooksOffDomains": ["site.test"',
  'the JSON text null': 'null',
  'a JSON text that is a string': '"settings"',
  'a number': 5,
  'a list': [],
  'a wrapper that holds a text': { settings: 'text' }
};

for (const [label, scrapfly_settings] of Object.entries(UNREADABLE)) {
  test(`settings stored as ${label}: no hooks are installed, and it is said once without the stored text`, async () => {
    const { detail, logs } = await install({ store: { scrapfly_settings } });
    nothingInstalled(detail, label);
    assert.equal(logs.warn.length, 1, JSON.stringify(logs.warn));
    // A category and one line naming the kind of error: no error object, whose message can quote what was stored
    assert.equal(logs.warn[0].length, 2, 'no error object is handed to the log');
    assert.match(logs.warn[0][1], /^The extension settings cannot be read \(\w+\)/);
    assert.deepEqual(logs.error, [], 'and nothing else is logged about it');
  });
}

test('a storage read that fails installs nothing and names the error, not its message', async () => {
  const failure = Object.assign(new Error('stored text: {"secret":"value"}'), { name: 'StorageReadError' });
  const { detail, logs } = await install({ get: async () => { throw failure; } });
  nothingInstalled(detail, 'read failed');
  assert.equal(logs.warn.length, 1);
  assert.match(String(logs.warn[0][1]), /StorageReadError/);
  assert.ok(!JSON.stringify([logs.warn, logs.error]).includes('secret'));
});

test('unreadable settings are said once, not on every page, and again only after a read that worked', async () => {
  const state = { store: { scrapfly_settings: '{broken' } };
  const chrome = { storage: { local: { get: async (keys) => pick({ scrapfly_detectors: { detectors: DETECTORS }, ...state.store }, keys) } } };
  const { Engine, logs } = engineContext({ chrome }, { files: [...ENGINE_FILES, 'modules/core/storage-manager.js'] });
  const send = async () => {
    const events = [];
    await Engine.installHooksOrchestrator({ location: { hostname: 'site.test', href: 'https://site.test/' }, dispatchEvent(event) { events.push(event); } }, chrome);
    return plain(events[0].detail);
  };
  await send(); await send(); await send();
  assert.equal(logs.warn.length, 1, 'three pages, one line');
  state.store = { scrapfly_settings: { detection: {} } };
  assert.equal((await send()).hooksOff, undefined, 'readable again: installed as usual');
  state.store = { scrapfly_settings: 5 };
  assert.equal((await send()).hooksOff, true);
  assert.equal(logs.warn.length, 2, 'a new failure after a good read is said again');
});

test('a switched-off extension is switched off whatever its settings hold', async () => {
  const { detail, logs } = await install({ store: { scrapfly_enabled: false, scrapfly_settings: '{broken' } });
  nothingInstalled(detail, 'off and unreadable');
  assert.deepEqual(logs.warn, []);
});

test('readable settings change nothing: skipped and hooks-off sites, and absent settings, install as before', async () => {
  const skipped = (await install({ store: { scrapfly_settings: { detection: { scanMode: 'blocklist', blacklistedDomains: ['site.test'] } } } })).detail;
  nothingInstalled(skipped, 'skipped site');
  const off = (await install({ store: { scrapfly_settings: JSON.stringify({ settings: { detection: { hooksOffDomains: ['site.test'] } } }) } })).detail;
  assert.deepEqual(off.hookDefinitions, []);
  assert.equal(off.hooksOff, true);
  assert.equal(off.windowProperties.length, 1, 'the window checks only read the page\'s globals');
  for (const store of [{}, { scrapfly_settings: {} }, { scrapfly_settings: '{}' }, { scrapfly_settings: { detection: { hooksOffDomains: ['other.test'] } } }]) {
    const { detail, logs } = await install({ store });
    assert.equal(detail.hookDefinitions.length, 1, JSON.stringify(store));
    assert.ok(!('hooksOff' in detail));
    assert.deepEqual(logs.warn, []);
  }
});

test('a re-arm install carries the mark too when nothing can be installed', async () => {
  const { detail } = await install({ store: { scrapfly_settings: '{broken' }, options: { rearm: true } });
  assert.equal(detail.rearm, true);
  assert.equal(detail.hooksOff, true);
});
