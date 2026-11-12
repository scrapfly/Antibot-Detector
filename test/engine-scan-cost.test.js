const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { engineContext } = require('./helpers/engine-context.js');

// What one scan costs on a heavy page. Every case-insensitive script rule lowercased the whole script again: 7.7 MB of
// minified JavaScript became 111 MB of lowercased copies and 0.4 s of matching. Each text is lowercased once per scan now.

const root = path.join(__dirname, '..');
const detectors = {};
for (const category of ['antibot', 'captcha', 'fingerprint']) {
  detectors[category] = {};
  for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(f => /^detect-.*\.json$/.test(f))) {
    const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, file), 'utf8'));
    detectors[category][detector.id] = detector;
  }
}

test('a scan lowercases each script and fetched resource once, whatever the number of rules', async () => {
  const { Engine, context } = engineContext();
  // A distinct text per run, longer than anything the match cache keeps, so no result comes from an earlier scan
  const bundle = `/* ${Date.now()} */ ` + 'function a(b){return b+1}var c=a(2);'.repeat(20000);
  const resource = `/* ${Date.now()} resource */ ` + 'var d=function(){return 3};'.repeat(20000);
  const lowered = new Map();
  const StringOfEngine = vm.runInContext('String', context);
  const original = StringOfEngine.prototype.toLowerCase;
  StringOfEngine.prototype.toLowerCase = function () {
    const text = String(this);
    if (text === bundle || text === resource) lowered.set(text, (lowered.get(text) || 0) + 1);
    return original.call(this);
  };
  try {
    const engine = new Engine();
    engine.setDetectors(detectors);
    const rules = Object.values(detectors).flatMap(category => Object.values(category))
      .flatMap(detector => (detector.detection.content || []).filter(rule => rule.textCaseSensitive !== true));
    assert.ok(rules.length > 10, `${rules.length} case-insensitive content rules`);
    await engine.detectOnPage({ url: 'https://example.test/', content: [{ type: 'inline', src: null, content: bundle }],
      externalContent: [{ type: 'javascript', url: 'https://example.test/app.js', content: resource }], dom: [], networkUrls: [] });
    assert.deepEqual(Object.fromEntries([...lowered].map(([text, count]) => [text === bundle ? 'script' : 'resource', count])), { script: 1, resource: 1 });
  } finally {
    StringOfEngine.prototype.toLowerCase = original;
  }
});

test('a script rule still matches whatever the letter case, and a case-sensitive one still does not', async () => {
  const { Engine } = engineContext();
  const engine = new Engine();
  const detector = { id: 'detect-x', name: 'X', enabled: true, detection: { content: [
    { id: 'loose', text: 'MakeWidget', scope: 'scripts', checkScripts: true, confidence: 10, standalone: true },
    { id: 'strict', text: 'MakeGadget', textCaseSensitive: true, scope: 'scripts', checkScripts: true, confidence: 10, standalone: true }] } };
  engine.setDetectors({ antibot: { 'detect-x': detector } });
  const matched = page => Array.from(engine.runDetector(detector, page).matches, match => match.pattern);
  const page = content => ({ url: 'https://example.test/', content: [{ type: 'inline', content }], dom: [], externalContent: [] });
  assert.deepEqual(matched(page('makewidget(); makegadget();')), ['MakeWidget']);
  assert.deepEqual(matched(page('MAKEWIDGET(); MakeGadget();')), ['MakeWidget', 'MakeGadget']);
});
