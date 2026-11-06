const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The "?" of each detection method (sections/rules/modals/method-help.js):
// every text is a locale key whose English fallback matches the locale, and
// every example points at a pattern that ships in detectors/, so the help
// never shows a rule that no longer exists.

const root = path.join(__dirname, '..');
const context = vm.createContext({});
vm.runInContext('class Rules {}', context);
vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/modals/method-help.js'), 'utf8'), context, { filename: 'method-help.js' });
const METHOD_HELP = vm.runInContext('METHOD_HELP', context);
const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));

const detectors = {};
for (const category of ['antibot', 'captcha', 'fingerprint']) {
  for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, file), 'utf8'));
    detectors[d.id] = { ...d, category };
  }
}

test('every detection method the editor offers has a help sheet', () => {
  assert.deepEqual(Object.keys(METHOD_HELP).sort(), ['content', 'cookie', 'dom', 'header', 'js_hooks', 'payload', 'url', 'window']);
});

test('every help text is a locale key with the same English, code between balanced backticks', () => {
  for (const [method, spec] of Object.entries(METHOD_HELP)) {
    const texts = [spec.intro, ...spec.how, ...spec.limits, spec.warning, spec.howTitle].filter(Boolean);
    assert.ok(spec.how.length >= 2 && spec.limits.length >= 2, method);
    for (const [key, fallback] of texts) {
      assert.ok(en[key], `${method}: ${key} missing from _locales/en`);
      assert.equal(en[key].message, fallback, `${method}: ${key} fallback differs from the locale`);
      assert.equal(fallback.split('`').length % 2, 1, `${method}: ${key} has unbalanced backticks`);
    }
  }
});

test('every example is a pattern that ships, in the right method', () => {
  for (const [method, spec] of Object.entries(METHOD_HELP)) {
    assert.ok(spec.examples.length >= 3, `${method}: at least three examples`);
    for (const [detectorId, patternId] of spec.examples) {
      const detector = detectors[detectorId];
      assert.ok(detector, `${method}: ${detectorId} does not ship`);
      const pattern = (detector.detection[method] || []).find(p => p.id === patternId);
      assert.ok(pattern, `${method}: ${detectorId}/${patternId} is not a ${method} pattern`);
      assert.notEqual(pattern.enabled, false, `${method}: ${detectorId}/${patternId} is disabled`);
    }
  }
  // JS hooks only run in fingerprint rules: the examples must be ones that work
  for (const [detectorId] of METHOD_HELP.js_hooks.examples) assert.equal(detectors[detectorId].category, 'fingerprint', detectorId);
});

test('the facts that were wrong before stay corrected', () => {
  const all = (method) => [METHOD_HELP[method].intro, ...METHOD_HELP[method].how, ...METHOD_HELP[method].limits].map(([, t]) => t).join(' ');
  assert.match(all('cookie'), /HttpOnly and Secure ones included/, 'HttpOnly cookies are read (chrome.cookies)');
  assert.match(all('cookie'), /prefix/, 'a plain cookie name is a prefix match');
  assert.match(all('header'), /Request means headers the browser sent/, 'request headers are captured');
  assert.doesNotMatch(all('url'), /\/\\\/v/, 'no regex written with / delimiters');
  assert.equal(METHOD_HELP.js_hooks.warning, undefined, 'hooks are installed for every category, so no Fingerprint-only warning');
  assert.match(all('js_hooks'), /Navigator\.prototype\.webdriver`, not `navigator\.webdriver/);
});

// The facts that went stale when the engine moved on. Each help sentence is pinned to the code it describes, so the next change
// to the engine fails here and says which sentence to fix (and every locale carries it: npm run check:locale)
const all = (method) => [METHOD_HELP[method].intro, ...METHOD_HELP[method].how, ...METHOD_HELP[method].limits].map(([, t]) => t).join(' ');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the DOM help says the head is searched: the walk starts at the document element, not at the body', () => {
  assert.match(source('modules/detection/engine/detection-engine-extractors.js'), /createTreeWalker\(\s*document\.documentElement/, 'the engine walks from the document element');
  const dom = all('dom');
  assert.match(METHOD_HELP.dom.intro[1], /head and body/);
  assert.doesNotMatch(dom, /page body/i, 'the intro no longer says the page body');
  assert.doesNotMatch(dom, /head[^.]*not searched/i, 'the head is not in the list of what is not searched');
  assert.match(dom, /Frames and shadow roots are not searched/, 'frames and shadow roots still are not (the content scripts run in the top frame only)');
  assert.match(source('manifest.json'), /"all_frames": false/);
});

test('the URL help says requests made after the scan still count, for URL scope All', () => {
  assert.match(source('background/detection-lifecycle.js'), /function applyLateNetworkUrls/, 'the worker checks late requests');
  const url = all('url');
  assert.doesNotMatch(url, /Only requests made before the scan count/);
  assert.match(url, /requests made after it still count when the URL scope is All/);
});

test('the JS hooks help says same-origin frames: the hooks reach the frames the page can read, which are not all of the same site', () => {
  assert.match(source('content-main-world.js'), /Cross-origin windows throw on access and are skipped/);
  assert.match(all('js_hooks'), /built-in targets in same-origin frames/);
  assert.doesNotMatch(all('js_hooks'), /same-site/);
});

test('the sheets of the methods that read pages, scripts and bodies say what a regex reads of a long text, with the real limit', () => {
  globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
  globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };
  const { PatternCache } = require('../utils/pattern-cache.js');
  const shown = PatternCache.REGEX_TEXT_LIMIT.toLocaleString('en-US');
  for (const method of ['content', 'payload']) {
    const limit = METHOD_HELP[method].limits.find(([key]) => key === 'mhRegexTextLimit');
    assert.ok(limit, `${method}: the text limit of a regex is on its sheet`);
    assert.ok(limit[1].includes(`first ${shown} characters`), `${method}: says ${shown}`);
    assert.match(limit[1], /Plain text, Whole word and Scrapfly's own rules read all of it/);
  }
  for (const method of ['url', 'header', 'cookie', 'dom', 'window', 'js_hooks']) {
    assert.ok(!METHOD_HELP[method].limits.some(([key]) => key === 'mhRegexTextLimit'), `${method}: its texts are short`);
  }
});
