const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.Logger = new Proxy({}, { get: () => () => {} });
global.DetectionUtils = require('../utils/detection-utils.js');
// This build's version: the packaged rules need recent engines (2.8.8 reads response bodies, 3.1.9 small pages' HTML)
const BUILD_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version;
global.chrome = { runtime: { getManifest: () => ({ version: BUILD_VERSION }) } };
const DetectorManager = require('../modules/detection/rules/detector-manager.js');
const DetectorSchema = require('../modules/detection/rules/detector-schema.js');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
let writes;
beforeEach(() => {
  writes = [];
  global.StorageManager = { saveToStorage: async (key, value) => { writes.push(plain(value)); return true; } };
  DetectionUtils.setOfficialDetectorIds(['detect-official']);
});
const definition = (id = 'detect-new', extra = {}) => ({ id, name: id, author: 'Custom author', detection: { cookie: [{ id: 'session', name: 'test-session', confidence: 50 }] }, ...extra });
function manager() {
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = { antibot: { 'detect-kept': definition('detect-kept'), 'detect-official': definition('detect-official', { author: 'Scrapfly' }) } };
  return dm;
}

test('replace all rejects the entire import before deleting custom rules or changing official flags', async () => {
  const invalid = [null, [], 'broken', { detection: null }, definition('detect-bad', { detection: { cookie: 'broken' } }),
    definition('detect-bad', { detection: { cookie: [null] } }), definition('detect-bad', { detection: { cookie: [{ name: '(', nameRegex: true }] } }),
    definition('detect-bad', { minExtensionVersion: '99.0' }), definition('detect-bad', { enabled: 'false' }),
    definition('detect-bad', { combinations: [{ when: { pattern: 'missing' } }] }),
    // Values the engine reads as text (a number stops every scan) and logos that are markup
    definition('detect-bad', { detection: { cookie: [{ name: 'sess', value: 123 }] } }),
    definition('detect-bad', { detection: { payload: [{ text: 'x', urlPattern: 42 }] } }),
    definition('detect-bad', { detection: { payload: [{ text: 'x', methods: ['POST', 7] }] } }),
    definition('detect-bad', { icon: 5 }), definition('detect-bad', { icon: '<a href="https://x.test">Update</a>' }),
    definition('detect-bad', { customIcon: 'x" onerror="y' })];
  for (const bad of invalid) {
    const dm = manager();
    const before = plain(dm.detectors);
    const result = await dm.importDetectors({ detectors: { antibot: { 'detect-new': definition(), 'detect-bad': bad,
      'detect-official': definition('detect-official', { enabled: false }) } } }, false);
    assert.equal(result, false, JSON.stringify(bad));
    assert.deepEqual(dm.detectors, before);
  }
  assert.equal(writes.length, 0);
});

test('malformed category maps, duplicate IDs, and prototype keys cannot trigger replacement', async () => {
  for (const data of [{ detectors: [] }, { detectors: { antibot: [definition()] } },
    { detectors: { antibot: { 'detect-new': definition() }, captcha: { 'detect-new': definition() } } },
    JSON.parse('{"detectors":{"__proto__":{"detect-new":{"detection":{}}}}}')]) {
    const dm = manager();
    const before = plain(dm.detectors);
    assert.equal(await dm.importDetectors(data, false), false);
    assert.deepEqual(dm.detectors, before);
  }
  assert.equal(writes.length, 0);
});

test('valid bare legacy maps canonicalize IDs while preserving custom fields and combinations', async () => {
  const dm = manager();
  const source = { antibot: { legacy: definition('legacy', { enabled: false, difficulty: 'High', difficultyChosen: true,
    futureMetadata: { keep: ['unchanged'] }, nameI18n: { es: 'Mi regla' }, userModified: true,
    officialSnapshot: { version: '1.0', detection: {} }, combinations: [{ id: 'both', when: { all: [{ pattern: 'session' }, { not: { method: 'url' } }] } }] }) } };
  const before = plain(source);
  assert.equal(await dm.importDetectors(source, false), true);
  const imported = dm.detectors.antibot['detect-legacy'];
  assert.equal(imported.id, 'detect-legacy');
  for (const key of ['futureMetadata', 'nameI18n', 'combinations', 'detection', 'enabled', 'difficultyChosen']) {
    assert.deepEqual(imported[key], before.antibot.legacy[key], key);
  }
  // How a rule relates to Scrapfly's is this browser's to know, never a file's
  assert.equal(imported.userModified, undefined);
  assert.equal(imported.officialSnapshot, undefined);
  assert.deepEqual(source, before, 'admission does not mutate caller data');
  assert.equal(dm.detectors.antibot['detect-kept'], undefined);
  assert.ok(dm.detectors.antibot['detect-official']);
});

test('a failed import write keeps every live rule, and a retry can succeed', async () => {
  const dm = manager();
  const before = plain(dm.detectors);
  StorageManager.saveToStorage = async () => false;
  await assert.rejects(dm.importDetectors({ antibot: { 'detect-new': definition() } }, false), /returned false/);
  assert.deepEqual(dm.detectors, before);
  StorageManager.saveToStorage = async () => true;
  assert.equal(await dm.importDetectors({ antibot: { 'detect-new': definition() } }, false), true);
  assert.ok(dm.detectors.antibot['detect-new']);
});

test('every packaged definition passes import admission without losing its pattern and combination data', async () => {
  const dm = manager();
  const detectors = {};
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    detectors[category] = {};
    const dir = path.join(__dirname, '..', 'detectors', category);
    for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
      const record = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      detectors[category][record.id] = record;
    }
  }
  assert.equal(await dm.importDetectors({ detectors }, true), true);
  for (const [category, records] of Object.entries(detectors)) {
    for (const [id, record] of Object.entries(records)) {
      assert.deepEqual(dm.detectors[category][id].detection, record.detection, id);
      assert.deepEqual(dm.detectors[category][id].combinations, record.combinations, id);
    }
  }
});


test('an import without an explicit enabled preference does not enable an official rule', async () => {
  const dm = manager();
  dm.detectors.antibot['detect-official'].enabled = false;
  assert.equal(await dm.importDetectors({ antibot: { 'detect-official': definition('detect-official') } }), true);
  assert.equal(dm.detectors.antibot['detect-official'].enabled, false);
});

test('a file cannot plant a Scrapfly rule under the id of an official rule the person deleted', async () => {
  const dm = manager();
  DetectionUtils.setOfficialDetectorIds(['detect-official', 'detect-cloudflare']);
  const forged = { antibot: { 'detect-cloudflare': definition('cloudflare', { id: 'detect-cloudflare', author: 'Scrapfly', version: '99.0',
    userModified: true, officialSnapshot: { version: '99.0', detection: {} }, dismissedVersion: '99.0' }) } };
  assert.equal(await dm.importDetectors(forged, true), true);
  const imported = dm.detectors.antibot['detect-cloudflare'];
  assert.ok(imported, 'kept as the person\'s own rule');
  assert.notEqual(String(imported.author || '').toLowerCase(), 'scrapfly');
  assert.equal(DetectionUtils.isOfficialDetector(imported), false, 'not shown as Scrapfly\'s');
  for (const field of ['userModified', 'officialSnapshot', 'dismissedVersion']) assert.equal(imported[field], undefined, field);
});

test('merge brings in the valid rules of a file and names the ones it leaves out; replace all still needs every rule valid', async () => {
  const file = { detectors: { antibot: { 'detect-new': definition(), 'detect-bad': definition('detect-bad', { name: 'Broken one', detection: { cookie: [{ name: 'cf_(', nameRegex: true }] } }) } } };
  const merged = manager();
  assert.equal(await merged.importDetectors(file, true), true);
  assert.ok(merged.detectors.antibot['detect-new']);
  assert.equal(merged.detectors.antibot['detect-bad'], undefined);
  assert.deepEqual(merged.lastImportSkipped, ['Broken one']);
  const replaced = manager();
  const before = plain(replaced.detectors);
  assert.equal(await replaced.importDetectors(file, false), false);
  assert.deepEqual(replaced.detectors, before, 'nothing deleted');
});

test('an import names the official rules it left as installed because the file holds other content, and stays silent when it is the same', async () => {
  const edited = manager();
  const changed = definition('detect-official', { author: 'Scrapfly', name: 'Official', detection: { cookie: [{ name: 'edited_cookie' }] } });
  assert.equal(await edited.importDetectors({ antibot: { 'detect-official': changed } }, true), true);
  assert.deepEqual(edited.lastImportKept, ['Official'], 'the edit is not applied, and the person is told');
  assert.notEqual(edited.detectors.antibot['detect-official'].detection.cookie[0].name, 'edited_cookie', 'official rules are still never overwritten');
  const same = manager();
  const installed = plain(same.detectors.antibot['detect-official']);
  assert.equal(await same.importDetectors({ antibot: { 'detect-official': { ...installed, enabled: false } } }, true), true);
  assert.deepEqual(same.lastImportKept, [], 'the same rule (only enabled differs) is not reported');
});


test('a rule file cannot make the popup fetch an address: a web address as its uploaded icon is dropped, a data image stays', async () => {
  const dm = manager();
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const imported = {
    antibot: {
      'detect-remote': definition('detect-remote', { customIcon: 'https://tracker.example/pixel.gif?u=1' }),
      'detect-data': definition('detect-data', { customIcon: png }),
      'detect-other': definition('detect-other', { customIcon: 'javascript:alert(1)' })
    }
  };
  assert.equal(await dm.importDetectors(imported, false), true, 'the rules themselves are imported');
  assert.equal(dm.getDetector('antibot', 'detect-remote').customIcon, undefined);
  assert.equal(dm.getDetector('antibot', 'detect-other').customIcon, undefined);
  assert.equal(dm.getDetector('antibot', 'detect-data').customIcon, png);
});


// ---- A regex the editor would refuse, and rules that are too big, are not imported -----------------------------------
// The editor's Save refuses a regex that does not compile or that the ReDoS guard refuses; an import let both in, and neither
// ever matches at run time (the engine will not compile what the guard refuses), while the ones the guard misses run unbounded

const REFUSED_REGEXES = ['(a+)+$', '(a|a?){30}b', '(\\d{1,3}){1,14}x', `${'a'.repeat(1500)}`];
// One regex in each place a rule holds one: a cookie's name and value, a content text, a DOM selector, a payload's URL pattern
const WHERE = {
  'a cookie name': (p) => ({ cookie: [{ id: 'r', name: p, nameRegex: true }] }),
  'a cookie value': (p) => ({ cookie: [{ id: 'r', name: 'sess', value: p, valueRegex: true }] }),
  'a content text': (p) => ({ content: [{ id: 'r', text: p, textRegex: true }] }),
  'a DOM selector': (p) => ({ dom: [{ id: 'r', selector: p, selectorRegex: true }] }),
  'a payload URL pattern': (p) => ({ payload: [{ id: 'r', text: 'x', urlPattern: p, urlRegex: true }] })
};

test('a rule whose regex the editor would refuse is not imported, wherever it holds it: Merge names it, Replace all refuses the file', async () => {
  for (const [where, build] of Object.entries(WHERE)) {
    for (const pattern of REFUSED_REGEXES) {
      const file = { detectors: { antibot: { 'detect-fine': definition('detect-fine', { name: 'Fine one' }), 'detect-refused': definition('detect-refused', { name: 'Refused one', detection: build(pattern) }) } } };
      const merged = manager();
      assert.equal(await merged.importDetectors(file, true), true, `${where}: ${pattern.slice(0, 12)}`);
      assert.ok(merged.detectors.antibot['detect-fine'], 'the other rule comes in');
      assert.equal(merged.detectors.antibot['detect-refused'], undefined, `${where}: ${pattern.slice(0, 12)}`);
      assert.deepEqual(merged.lastImportSkipped, ['Refused one']);
      const replaced = manager();
      const before = plain(replaced.detectors);
      assert.equal(await replaced.importDetectors(file, false), false, `${where}: ${pattern.slice(0, 12)}`);
      assert.deepEqual(replaced.detectors, before, 'nothing deleted');
    }
  }
});

test('regexes people write stay importable: a wildcard between literals, an address, a skip over parameters, and the same text as plain text', async () => {
  const good = ['foo.*bar', '^(?:\\d{1,3}\\.){3}\\d{1,3}$', '^https://[^/]+/(?:[^#&]{0,200}&){0,10}apiKey=', 'datadome|akamai'];
  const dm = manager();
  const detectors = {};
  good.forEach((pattern, index) => { detectors[`detect-good${index}`] = definition(`detect-good${index}`, { detection: { content: [{ id: 'r', text: pattern, textRegex: true }] } }); });
  detectors['detect-plain'] = definition('detect-plain', { detection: { content: [{ id: 'r', text: '(a+)+$' }] } }); // not marked as a regex: any text is fine
  assert.equal(await dm.importDetectors({ antibot: detectors }, false), true);
  assert.deepEqual(dm.lastImportSkipped, []);
  for (const id of Object.keys(detectors)) assert.ok(dm.detectors.antibot[id], id);
});

const manyPatterns = (count) => ({ cookie: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `cookie${index}` })) });

test('a rule with more patterns than the limit, or a text longer than it, is left out and named; at the limit it is imported', async () => {
  const limits = DetectorSchema.IMPORT_LIMITS;
  const file = { antibot: {
    'detect-at-limit': definition('detect-at-limit', { name: 'Many', detection: manyPatterns(limits.patternsPerDetector) }),
    'detect-too-many': definition('detect-too-many', { name: 'Too many', detection: manyPatterns(limits.patternsPerDetector + 1) }),
    'detect-text-at-limit': definition('detect-text-at-limit', { name: 'Long text', detection: { content: [{ id: 'r', text: 'a'.repeat(limits.textLength) }] } }),
    'detect-text-over': definition('detect-text-over', { name: 'Longer text', detection: { content: [{ id: 'r', text: 'a'.repeat(limits.textLength + 1) }] } }),
    'detect-description-over': definition('detect-description-over', { name: 'Long note', detection: { content: [{ id: 'r', text: 'x', description: 'd'.repeat(limits.textLength + 1) }] } })
  } };
  const dm = manager();
  assert.equal(await dm.importDetectors(file, true), true);
  assert.deepEqual(dm.lastImportSkipped, ['Too many', 'Longer text', 'Long note']);
  assert.ok(dm.detectors.antibot['detect-at-limit'] && dm.detectors.antibot['detect-text-at-limit']);
  const strict = manager();
  assert.equal(await strict.importDetectors(file, false), false, 'Replace all needs every rule valid');
});

test('a file with more rules, or more patterns, than the limits is not a rules file: refused whole, in Merge as well', async () => {
  const limits = DetectorSchema.IMPORT_LIMITS;
  const rules = (count, detection) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`detect-n${index}`, definition(`detect-n${index}`, { detection })]));
  const one = { cookie: [{ id: 'r', name: 'sess' }] };
  const atLimit = manager();
  assert.equal(await atLimit.importDetectors({ antibot: rules(limits.detectors, one) }, true), true, 'exactly the most rules');
  for (const merge of [true, false]) {
    const over = manager();
    const before = plain(over.detectors);
    assert.equal(await over.importDetectors({ antibot: rules(limits.detectors + 1, one) }, merge), false, `${limits.detectors + 1} rules, merge ${merge}`);
    assert.deepEqual(over.detectors, before);
    // Over the patterns of a file with rules that are each within the limits
    const perFile = Math.ceil((limits.patterns + 1) / limits.patternsPerDetector);
    const patterns = manager();
    assert.equal(await patterns.importDetectors({ antibot: rules(perFile, manyPatterns(limits.patternsPerDetector)) }, merge), false, `${perFile * limits.patternsPerDetector} patterns, merge ${merge}`);
    assert.equal(writes.length, 1, 'only the file at the limit was written');
  }
});

test('the limits are far above what ships, so an export of every rule imports back; and the size limit is above any export', () => {
  const limits = DetectorSchema.IMPORT_LIMITS;
  let bytes = 0, detectors = 0, patterns = 0, text = 0, perRule = 0;
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    const dir = path.join(__dirname, '..', 'detectors', category);
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const record = JSON.parse(raw);
      bytes += raw.length; detectors++;
      patterns += DetectorSchema.patternCount(record);
      perRule = Math.max(perRule, DetectorSchema.patternCount(record));
      for (const rules of Object.values(record.detection)) for (const rule of rules) for (const value of Object.values(rule)) if (typeof value === 'string') text = Math.max(text, value.length);
    }
  }
  assert.ok(limits.fileBytes >= 20 * bytes, `${limits.fileBytes} bytes against ${bytes} shipped`);
  assert.ok(limits.detectors >= 10 * detectors && limits.patterns >= 10 * patterns && limits.patternsPerDetector >= 20 * perRule && limits.textLength >= 10 * text, JSON.stringify({ detectors, patterns, perRule, text }));
  assert.ok(limits.fileBytes <= 64 * 1024 * 1024 && Object.isFrozen(limits));
});

// ---- Rules -> Import: the size of the file is checked before it is read, and the skipped rules are named, a few at a time ----
function importHandler({ skipped = [], size } = {}) {
  const calls = { read: 0, mode: 0, errors: [], warnings: [], successes: [], imported: [] };
  const ctx = { console, Logger: new Proxy({}, { get: () => () => {} }), DetectorSchema, WorkerMessages: { RELOAD_DETECTORS: 'reload' },
    chrome: { runtime: { sendMessage() {} } },
    NotificationHelper: { chooseImportMode: async () => { calls.mode++; return 'merge'; }, error: (m) => calls.errors.push(m),
      warning: (m) => calls.warnings.push(m), success: (m) => calls.successes.push(m) } };
  vm.createContext(ctx);
  vm.runInContext('function Rules() {}', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sections/rules/rules-handlers.js'), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  Object.assign(rules, { detectorManager: { importDetectors: async (data) => { calls.imported.push(data); return true; }, lastImportSkipped: skipped, lastImportKept: [] }, displayRules() {} });
  const file = { size, text: async () => { calls.read++; return '{"detectors":{}}'; } };
  const event = { target: { files: [file], value: 'rules.json' } };
  return { run: () => rules.handleImport(event), calls, event };
}

test('Rules -> Import refuses a file over the size limit without reading it, and resets the file input', async () => {
  const big = importHandler({ size: DetectorSchema.IMPORT_LIMITS.fileBytes + 1 });
  await big.run();
  assert.equal(big.calls.read, 0, 'never read');
  assert.equal(big.calls.mode, 0, 'no Merge or Replace all question about it');
  assert.equal(big.calls.errors.length, 1);
  assert.deepEqual(big.calls.imported, []);
  assert.equal(big.event.target.value, '');
  const ok = importHandler({ size: DetectorSchema.IMPORT_LIMITS.fileBytes });
  await ok.run();
  assert.equal(ok.calls.read, 1, 'a file at the limit is read');
  assert.equal(ok.calls.imported.length, 1);
});

test('the skipped rules are named in the message, the first ten of them when there are more, and the reason covers a pattern that could freeze scanning', async () => {
  const some = importHandler({ skipped: ['Refused one', 'Other one'] });
  await some.run();
  assert.equal(some.calls.warnings.length, 1);
  assert.match(some.calls.warnings[0], /except: Refused one, Other one \(/);
  assert.match(some.calls.warnings[0], /freeze scanning/);
  const names = Array.from({ length: 25 }, (_, index) => `Rule ${index + 1}`);
  const many = importHandler({ skipped: names });
  await many.run();
  const message = many.calls.warnings[0];
  assert.match(message, /Rule 1, Rule 2/);
  assert.ok(message.includes(`Rule 10, ${String.fromCharCode(0x2026)} (`), 'ten names, then an ellipsis');
  assert.doesNotMatch(message, /Rule 11\b/);
  const none = importHandler({ skipped: [] });
  await none.run();
  assert.deepEqual(none.calls.warnings, []);
  assert.equal(none.calls.successes.length, 1);
});
