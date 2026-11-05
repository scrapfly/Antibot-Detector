const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Fixtures = require('../scripts/e2e-v313-advanced-tools.js');
const Vendors = require('../modules/advanced/captcha-vendors.js');

// The local pages the Advanced browser suite opens (scripts/e2e-v313-advanced-tools.js), one per protection, are only worth
// anything while the extension's own detectors still score them above the Advanced minimum and the vendors' Analyze Scripts
// still lists what the suite expects. This checks both in node, with the real detection engine, so a detector change fails here
// in a second instead of in the middle of a browser run.

const root = path.join(__dirname, '..');
const detectors = {};
for (const dir of ['antibot', 'captcha']) {
  for (const file of fs.readdirSync(path.join(root, 'detectors', dir)).filter(name => name.endsWith('.json'))) {
    const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', dir, file), 'utf8'));
    detectors[detector.id] = detector;
  }
}
const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => (key === 'debugMode' ? false : () => {}) }), setTimeout, clearTimeout
});
context.window = context;
for (const file of ['utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const Engine = vm.runInContext('DetectionEngineManager', context);
const Combinations = context.DetectionCombinations;
const origin = 'http://127.0.0.1:9999';

/** Every detector that scores the page, by id. */
function scores(spec) {
  const found = {};
  for (const detector of Object.values(detectors)) {
    const engine = new Engine();
    engine.setDetectors({ antibot: { [detector.id]: detector } });
    const result = engine.runDetector(detector, JSON.parse(JSON.stringify(Fixtures.pageSignals(spec, origin))));
    Combinations.rescore(detector, result);
    if (result && result.confidence > 0) found[detector.id] = Math.round(result.confidence);
  }
  return found;
}

test('every protection\'s page is detected above the Advanced minimum (50%) by the extension\'s own detector', () => {
  assert.equal(Fixtures.ALL.length, 27, 'the 11 tools with their own module and the 16 CAPTCHA vendors described as data');
  for (const spec of Fixtures.ALL) {
    const found = scores(spec);
    assert.ok(found[spec.detectorId] > 50, `${spec.id}: ${spec.detectorId} scores ${found[spec.detectorId]} (all: ${JSON.stringify(found)})`);
  }
});

test('the variants: Shape v2 and the late pages are detected the same way, a plain page is not, a vendor named only in source scores 10, and a page can carry several', () => {
  const byId = Object.fromEntries(Fixtures.VARIANTS.map(spec => [spec.id, spec]));
  for (const id of ['shapesecurity-v2', 'datadome-late', 'cloudflare-late', 'altcha-late']) {
    const detectorId = Fixtures.byId(id.replace(/-(v2|late)$/, '')).detectorId;
    assert.ok(scores(byId[id])[detectorId] > 50, id);
  }
  assert.deepEqual(scores(byId.plain), {});
  assert.deepEqual(scores(byId.weak), { 'detect-recaptcha': 10 });
  const multi = scores(byId.multi);
  for (const detectorId of ['detect-akamai', 'detect-datadome', 'detect-recaptcha']) assert.ok(multi[detectorId] > 50, detectorId);
});

test('the first load of a late page carries only the cookie that detects it, so Analyze Scripts has to reload it', () => {
  for (const id of ['datadome-late', 'cloudflare-late']) {
    const spec = Fixtures.VARIANTS.find(item => item.id === id);
    assert.equal(spec.late, true);
    assert.ok(spec.cookies.length > 0, `${id} is detected by its cookie`);
    const first = { ...spec, scripts: [], requests: [], inline: [], body: '' };
    const found = scores(first);
    assert.ok(found[Fixtures.byId(id.replace('-late', '')).detectorId] > 50, `${id}: the cookie alone detects it`);
  }
});

test('the first load of the ALTCHA late page carries only its widget markup, which alone detects it above 50%, so Analyze Scripts has to reload it', () => {
  const spec = Fixtures.VARIANTS.find(item => item.id === 'altcha-late');
  assert.equal(spec.late, true);
  assert.equal((spec.cookies || []).length, 0, 'no cookie to detect it by');
  const first = { ...spec, scripts: [], requests: [], inline: [], body: '' };
  assert.ok(first.dom.length > 0, 'the widget is in the markup');
  const found = scores(first);
  assert.ok(found['detect-altcha'] > 50, `ALTCHA from its markup alone: ${JSON.stringify(found)}`);
  assert.deepEqual(Fixtures.stubsOf(spec), {}, 'nothing of its own for the server to answer');
});

test('Analyze Scripts lists, for each page, exactly the addresses the suite expects with the classification it expects', () => {
  const classifiers = { awswaf: 'awsWafClassifyUrl', cloudflare: 'cloudflareClassifyUrl', datadome: 'datadomeClassifyUrl', funcaptcha: 'funcaptchaClassifyUrl',
    hcaptcha: 'hcaptchaClassifyUrl', turnstile: 'turnstileClassifyUrl' };
  const worker = vm.createContext({ console, URL, Logger: new Proxy({}, { get: () => () => {} }) });
  worker.self = worker;
  for (const id of Object.keys(classifiers)) vm.runInContext(fs.readFileSync(path.join(root, `background/advanced/vendors/${id}/interceptor.js`), 'utf8'), worker, { filename: id });
  const absolute = url => (/^https?:/.test(url) ? url : origin + url);
  let checked = 0;
  for (const spec of Fixtures.ALL.filter(item => item.analyze)) {
    const vendor = Vendors.byVendorId[spec.id];
    const classify = vendor ? (url => Vendors.classify(vendor, url)) : (url => worker[classifiers[spec.id]](url));
    const urls = [...(spec.scripts || []), ...(spec.requests || []).map(request => request.url)].map(absolute);
    const got = urls.map(url => [classify(url), url]).filter(([type]) => type);
    const want = spec.analyze.map(([type, url]) => [type, absolute(url)]);
    assert.equal(got.length, want.length, `${spec.id}: ${JSON.stringify(got)} against ${JSON.stringify(want)}`);
    for (const [type, url] of want) assert.ok(got.some(([gotType, gotUrl]) => gotType === type && gotUrl === url), `${spec.id}: ${type} ${url} in ${JSON.stringify(got)}`);
    checked++;
  }
  assert.equal(checked, 22, 'every protection with an Analyze Scripts list that the suite checks');
});

test('every CAPTCHA vendor of captcha-vendors.js has its page, and each key the suite expects is one the vendor\'s own rule accepts', () => {
  assert.deepEqual(Fixtures.GENERIC.map(spec => spec.id).sort(), Vendors.list.map(vendor => vendor.vendorId).sort());
  for (const spec of Fixtures.GENERIC) {
    const vendor = Vendors.byVendorId[spec.id];
    assert.equal(spec.name, vendor.productName, spec.id);
    assert.equal(spec.detectorId, `detect-${vendor.detectorId}`, spec.id);
    assert.equal(Boolean(spec.key), Boolean(vendor.siteKey), `${spec.id}: a key where the vendor has a key rule`);
    if (spec.key) assert.ok(vendor.siteKey.key.test(spec.key), `${spec.id}: ${spec.key}`);
  }
});

test('the pages render: cookies as Set-Cookie, local scripts answered, requests in one inline script, nothing breaks out of its markup', () => {
  const page = Fixtures.renderPage(Fixtures.byId('akamai'), origin);
  assert.ok(page.cookies.some(cookie => cookie.startsWith('_abck=68D1309F026260AE758FB2DD72720FEF~-1~')));
  assert.match(page.html, /<script type="text\/javascript" src="\/Xk3-aB\/9f2e7c1d"><\/script>/);
  assert.match(page.html, /setTimeout\(function \(\) \{ fetch\(r\.url, init\)/);
  assert.ok(Fixtures.stubsOf(Fixtures.byId('akamai'))['/Xk3-aB/9f2e7c1d'], 'the script path of the body is answered');
  assert.match(Fixtures.stubsOf(Fixtures.byId('shapesecurity'))['/ssx/ssx.mod.js'], /__xr_bmobdb/);
  const merged = Fixtures.merge('both', Fixtures.byId('akamai'), Fixtures.byId('datadome'));
  assert.equal(merged.cookies.length, Fixtures.byId('akamai').cookies.length + Fixtures.byId('datadome').cookies.length);
  for (const spec of Fixtures.SPECS) {
    const html = Fixtures.renderPage(spec, origin).html;
    assert.equal((html.match(/<script/g) || []).length, (html.match(/<\/script>/g) || []).length, `${spec.id}: balanced script tags`);
  }
});
