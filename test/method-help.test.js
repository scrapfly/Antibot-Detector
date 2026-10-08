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
  assert.match(METHOD_HELP.js_hooks.warning[1], /Only Fingerprint rules/);
  assert.match(all('js_hooks'), /Navigator\.prototype\.webdriver`, not `navigator\.webdriver/);
});
