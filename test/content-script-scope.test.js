const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function contextWith(overrides = {}) {
  const context = vm.createContext({
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000,
      PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, FETCH_TIMEOUT: 1000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, debugMode: false,
      error(...args) { throw new Error(args.join(' ')); } },
    ...overrides
  });
  for (const file of [
    'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/window-condition-grammar.js',
    'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
      .map(name => `modules/detection/engine/detection-engine-${name}.js`)
  ]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context;
}

const context = contextWith();
const Engine = vm.runInContext('DetectionEngineManager', context);
function engine(pattern = { scope: 'scripts' }) {
  const instance = new Engine();
  instance.setDetectors({ fingerprint: { probe: {
    id: 'probe', name: 'Probe', enabled: true, category: 'Fingerprint',
    detection: { content: [{ text: 'maxTouchPoints', confidence: 10,
      textWholeWord: true, ...pattern }] }
  } } });
  return instance;
}

for (const pattern of [{ scope: 'scripts' }, { checkScripts: true }]) {
  const label = JSON.stringify(pattern);
  test(`${label}: source references match without page HTML`, async () => {
    const results = await engine(pattern).detectOnPage({ content: [{ content: 'navigator.maxTouchPoints' }] });
    assert.equal(results.length, 1);
    assert.equal(results[0].confidence, 10);
  });

  test(`${label}: fetched JavaScript matches but CSS and page prose do not`, async () => {
    const instance = engine(pattern);
    const html = '<p>maxTouchPoints</p><div data-api="maxTouchPoints"></div>';
    assert.equal((await instance.detectOnPage({ pageHTML: html })).length, 0);
    assert.equal((await instance.detectOnPage({ pageHTML: html, externalContent: [
      { url: 'https://example.test/styles.css?version=1', type: 'css', content: '/* maxTouchPoints */' }
    ] })).length, 0);
    const results = await instance.detectOnPage({ externalContent: [
      { url: 'https://example.test/script', type: 'javascript', content: 'navigator.maxTouchPoints' }
    ] });
    assert.equal(results.length, 1);
    assert.equal(results[0].confidence, 10);
  });

  test(`${label}: a script URL is not script source evidence`, async () => {
    const src = 'https://example.test/maxTouchPoints.js';
    const results = await engine(pattern).detectOnPage({ pageHTML: `<script src="${src}"></script>`,
      content: [{ type: 'external', src, content: src }] });
    assert.equal(results.length, 0);
  });
}

test('content rules without script scope retain full-page matching', async () => {
  const results = await engine({}).detectOnPage({ pageHTML: '<p>maxTouchPoints</p>' });
  assert.equal(results.length, 1);
  assert.equal(results[0].confidence, 10);
});

test('fetched resources retain their DOM resource type regardless of URL suffix', async () => {
  const local = contextWith({
    document: { querySelectorAll(selector) {
      return selector === 'script[src]'
        ? [{ src: 'https://example.test/scripts.css' }, { src: 'https://example.test/script' }]
        : [{ href: 'https://example.test/style.css?version=1' }, { href: 'https://example.test/style' }];
    } },
    AbortSignal: { timeout() { return undefined; } },
    async fetch(url) { return { ok: true, headers: { get(name) {
      return name === 'content-type' ? (url.includes('/style') ? 'text/css' : 'text/javascript') : null;
    } },
      async text() { return 'maxTouchPoints'; } }; }
  });
  const Constructor = vm.runInContext('DetectionEngineManager', local);
  const resources = await new Constructor().extractExternalContent();
  assert.deepEqual(Array.from(resources, resource => resource.type),
    ['javascript', 'javascript', 'css', 'css']);
});

function resourceEngine(scripts, contentType, fetched = []) {
  const local = contextWith({
    document: { querySelectorAll(selector) {
      return selector === 'script' || selector === 'script[src]' ? scripts : [];
    } },
    AbortSignal: { timeout() { return undefined; } },
    async fetch(url) {
      fetched.push(url);
      return { ok: true, headers: { get(name) { return name === 'content-type' ? contentType : null; } },
        async text() { return '<p>maxTouchPoints</p>'; } };
    }
  });
  const Constructor = vm.runInContext('DetectionEngineManager', local);
  const instance = new Constructor();
  instance.setDetectors(engine().detectors);
  return instance;
}

for (const type of ['application/json', 'application/ld+json', 'text/plain', 'importmap', 'speculationrules']) {
  test(`${type} data blocks are neither inline script evidence nor fetched JavaScript`, async () => {
    const fetched = [];
    const instance = resourceEngine([
      { type, src: '', textContent: '{"description":"maxTouchPoints"}' },
      { type, src: 'https://example.test/data', textContent: '' }
    ], 'text/javascript', fetched);
    const content = instance.extractScriptElements();
    assert.equal(content.length, 0);
    const externalContent = await instance.extractExternalContent();
    assert.equal(externalContent.length, 0);
    assert.deepEqual(fetched, []);
    assert.equal((await instance.detectOnPage({ content, externalContent })).length, 0);
  });
}

for (const type of ['', 'module', 'text/javascript', 'APPLICATION/JAVASCRIPT', 'text/x-javascript', 'text/javascript1.5']) {
  test(`${type || 'default'} JavaScript elements remain eligible`, async () => {
    const instance = resourceEngine([{ type, src: '', textContent: 'navigator.maxTouchPoints' }], null);
    const content = instance.extractScriptElements();
    assert.equal(content.length, 1);
    assert.equal((await instance.detectOnPage({ content }))[0].confidence, 10);
  });
}

for (const type of ['', 'module']) {
  for (const contentType of ['text/html', 'text/css', 'application/json', 'application/ld+json', 'text/plain']) {
    test(`${type || 'classic'} script responses with ${contentType} are not source evidence`, async () => {
      const instance = resourceEngine([{ type, src: 'https://example.test/missing.js' }], contentType);
      const externalContent = await instance.extractExternalContent();
      assert.equal(externalContent[0].type, 'other');
      assert.equal((await instance.detectOnPage({ externalContent })).length, 0);
    });
  }
}

for (const type of ['', 'module']) {
  for (const contentType of ['text/javascript; charset=utf-8', 'application/ecmascript', 'text/x-javascript']) {
    test(`${type || 'classic'} responses accept JavaScript MIME alias ${contentType}`, async () => {
      const instance = resourceEngine([{ type, src: 'https://example.test/code.css' }], contentType);
      const externalContent = await instance.extractExternalContent();
      assert.equal(externalContent[0].type, 'javascript');
      assert.equal((await instance.detectOnPage({ externalContent }))[0].confidence, 10);
    });
  }
}

test('absent response MIME remains compatible only for classic scripts', async () => {
  for (const type of ['', 'module']) {
    const instance = resourceEngine([{ type, src: 'https://example.test/code.js' }], null);
    const externalContent = await instance.extractExternalContent();
    assert.equal(externalContent[0].type, type ? 'other' : 'javascript');
    assert.equal((await instance.detectOnPage({ externalContent })).length, type ? 0 : 1);
  }
});
