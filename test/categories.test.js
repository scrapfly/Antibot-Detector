const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The detection categories (Anti-bot, CAPTCHA, Fingerprint) are described once, in
// modules/core/categories.js: keys, names, default colours, labels, difficulty and the one
// function that groups any spelling of a category. A second copy drifts (it already had: a
// "WAF" category was anti-bot in one view and "other" in the next), so this file pins the
// module and fails when another script writes the knowledge down again.

const Categories = require('../modules/core/categories.js');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the three categories, their names, colours and labels', () => {
  assert.deepStrictEqual([...Categories.KEYS], ['antibot', 'captcha', 'fingerprint']);
  assert.deepStrictEqual([...Categories.KEYS_AND_OTHER], ['antibot', 'captcha', 'fingerprint', 'other']);
  assert.deepStrictEqual({ ...Categories.NAMES }, { antibot: 'Anti-Bot', captcha: 'CAPTCHA', fingerprint: 'Fingerprint' });
  assert.deepStrictEqual(Object.keys(Categories.LABELS), ['antibot', 'captcha', 'fingerprint', 'other']);
  assert.strictEqual(Categories.LABELS.antibot[0], 'categoryAntibot');
  assert.strictEqual(Categories.LABELS.other[0], 'statsCategoryOther');
  for (const frozen of [Categories.KEYS, Categories.KEYS_AND_OTHER, Categories.NAMES, Categories.DEFAULT_COLORS, Categories.LABELS]) {
    assert.ok(Object.isFrozen(frozen));
  }
});

test('the default colours are the ones the packaged detector index starts from', () => {
  const index = JSON.parse(read('detectors/index.json'));
  for (const key of Categories.KEYS) assert.strictEqual(Categories.DEFAULT_COLORS[key].toLowerCase(), String(index[key].colour).toLowerCase(), key);
});

test('every label key exists in the English messages, and the names are the ones the detector files use', () => {
  const messages = JSON.parse(read('_locales/en/messages.json'));
  for (const [key, [messageKey, english]] of Object.entries(Categories.LABELS)) {
    assert.ok(messages[messageKey], `${key}: ${messageKey} is an English message`);
    assert.strictEqual(messages[messageKey].message, english, `${key}: the English fallback matches the message`);
  }
  for (const key of Categories.KEYS) {
    const names = new Set(fs.readdirSync(path.join(root, 'detectors', key)).filter(file => file.endsWith('.json'))
      .map(file => JSON.parse(read(`detectors/${key}/${file}`)).category));
    assert.deepStrictEqual([...names], [Categories.NAMES[key]], `${key}: every detector file writes the category as ${Categories.NAMES[key]}`);
  }
});

test('normalize() keeps the letters of any spelling, and keeps a custom category as its own key', () => {
  assert.strictEqual(Categories.normalize('Anti-Bot'), 'antibot');
  assert.strictEqual(Categories.normalize(' CAPTCHA '), 'captcha');
  assert.strictEqual(Categories.normalize('My Custom_Category 2'), 'mycustomcategory');
  assert.strictEqual(Categories.normalize({ category: 'Anti-Bot' }), 'antibot');
  assert.strictEqual(Categories.normalize({ detector: { category: 'Fingerprint' } }), 'fingerprint');
  assert.strictEqual(Categories.normalize(undefined), '');
  assert.strictEqual(Categories.normalize(null), '');
  assert.strictEqual(Categories.normalize(5), '');
});

test('keyOf() groups every spelling the same way, for a name, a detector or a detection', () => {
  const cases = {
    antibot: ['Anti-Bot', 'antibot', 'ANTI-BOT', 'Bot Management', 'WAF', 'Web Application Firewall (WAF)'],
    captcha: ['CAPTCHA', 'captcha', 'Captcha'],
    fingerprint: ['Fingerprint', 'fingerprinting', 'Browser Fingerprint'],
    other: ['', 'Other', 'Telemetry', undefined, null, 5, {}, []]
  };
  for (const [key, spellings] of Object.entries(cases)) {
    for (const spelling of spellings) assert.strictEqual(Categories.keyOf(spelling), key, JSON.stringify(spelling));
  }
  assert.strictEqual(Categories.keyOf({ category: 'CAPTCHA' }), 'captcha');
  assert.strictEqual(Categories.keyOf({ detector: { category: 'Fingerprint' } }), 'fingerprint');
  assert.strictEqual(Categories.keyOf({ category: 'Anti-Bot', detector: { category: 'CAPTCHA' } }), 'antibot', 'the detection wins over its detector');
  assert.strictEqual(Categories.keyOf({ category: 'Captcha Fingerprint' }), 'captcha', 'CAPTCHA is checked first, as every view always did');
});

test('builtIn() and labelOf() name only the built-in categories: a custom one keeps its own text', () => {
  assert.strictEqual(Categories.builtIn('Anti-Bot'), 'antibot');
  assert.strictEqual(Categories.builtIn('fingerprinting'), 'fingerprint');
  assert.strictEqual(Categories.builtIn('CAPTCHA'), 'captcha');
  for (const custom of ['WAF', 'Botnet', 'Other', '', undefined]) assert.strictEqual(Categories.builtIn(custom), '', String(custom));
  assert.deepStrictEqual([...Categories.labelOf('Anti-Bot')], ['categoryAntibot', 'Anti-bot']);
  assert.deepStrictEqual([...Categories.labelOf({ category: 'fingerprinting' })], ['categoryFingerprint', 'Fingerprint']);
  assert.strictEqual(Categories.labelOf('WAF'), null);
});

test('default difficulty and badge class follow the grouping', () => {
  assert.strictEqual(Categories.defaultDifficulty('CAPTCHA'), 'High');
  assert.strictEqual(Categories.defaultDifficulty('Anti-Bot'), 'Medium');
  assert.strictEqual(Categories.defaultDifficulty('Fingerprint'), 'Low');
  assert.strictEqual(Categories.defaultDifficulty('whatever'), 'Medium');
  assert.strictEqual(Categories.badgeClass('Anti-Bot'), 'antibot');
  assert.strictEqual(Categories.badgeClass('captcha'), 'captcha');
  assert.strictEqual(Categories.badgeClass('Fingerprint'), 'fingerprint');
  assert.strictEqual(Categories.badgeClass('whatever'), 'primary');
});

test('the shared utilities, the pure modules and the views agree with the module', () => {
  global.self = global;
  const FormatUtils = require('../utils/format-utils.js');
  const DetectionUtils = require('../utils/detection-utils.js');
  const HistoryStats = require('../sections/stats/history-stats.js');
  const HistoryFilter = require('../modules/core/history-filter.js');
  const HistoryExport = require('../modules/core/history-export.js');
  const HistoryPolicy = require('../modules/core/history-policy.js');
  assert.strictEqual(FormatUtils.DEFAULT_CATEGORY_COLORS, Categories.DEFAULT_COLORS);
  assert.deepStrictEqual([...DetectionUtils.DEFAULT_CATEGORY_ORDER], [...Categories.KEYS]);
  assert.deepStrictEqual([...HistoryFilter.CATEGORIES], [...Categories.KEYS]);
  assert.deepStrictEqual([...HistoryStats.SCOPE_KEYS], [...Categories.KEYS_AND_OTHER]);
  for (const spelling of ['Anti-Bot', 'WAF', 'CAPTCHA', 'Fingerprint', 'fingerprinting', 'x', '', undefined]) {
    const detection = { category: spelling, confidence: 50, detector: { name: 'X' } };
    const key = Categories.keyOf(spelling);
    assert.strictEqual(FormatUtils.categoryKey(detection), key, `FormatUtils ${spelling}`);
    assert.strictEqual(DetectionUtils.categoryKey(spelling), key, `DetectionUtils ${spelling}`);
    assert.strictEqual(HistoryStats.normalizeCategory(spelling), key, `HistoryStats ${spelling}`);
    assert.strictEqual(HistoryStats.detectionCategory(detection), key, `HistoryStats detection ${spelling}`);
    assert.strictEqual(HistoryPolicy.isFingerprintOnly([detection]), key === 'fingerprint', `HistoryPolicy ${spelling}`);
    const entry = { id: 'a', timestamp: 1, detections: [detection] };
    assert.strictEqual(HistoryExport.filter([entry], { category: key }).length, 1, `HistoryExport keeps it under ${key} (${spelling})`);
    for (const other of Categories.KEYS_AND_OTHER.filter(k => k !== key)) assert.strictEqual(HistoryExport.filter([entry], { category: other }).length, 0, `HistoryExport drops it from ${other} (${spelling})`);
    for (const chip of Categories.KEYS) {
      assert.strictEqual(HistoryFilter.filter([{ id: 'a', detections: [detection] }], { chips: { categories: [chip] } }).length, chip === key ? 1 : 0, `HistoryFilter ${chip} chip (${spelling})`);
    }
  }
});

test('the orders that differ on purpose are still orderings of the same keys', () => {
  global.self = global;
  const HistoryStats = require('../sections/stats/history-stats.js');
  assert.deepStrictEqual([...HistoryStats.CATEGORY_ORDER].sort(), [...Categories.KEYS_AND_OTHER].sort(), 'ranking order');
  for (const key of HistoryStats.DEFAULT_SCOPE) assert.ok(Categories.KEYS_AND_OTHER.includes(key), `default scope ${key}`);
  const drawing = read('sections/stats/stats-ui.js').match(/const activeCategories = [^\n]*?(\[[^\]]*\])/);
  assert.ok(drawing, 'the stats drawing order is found');
  assert.deepStrictEqual(JSON.parse(drawing[1].replace(/'/g, '"')).sort(), [...Categories.KEYS_AND_OTHER].sort(), 'drawing order');
});

// Every script the extension ships, except the module itself
function extensionScripts() {
  const out = [];
  const skip = new Set(['node_modules', 'test', 'scripts', '.git', '.claude', 'detectors', '_locales', 'assets', 'icons', 'store']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
      if (entry.name.endsWith('.js')) out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.filter(file => file !== 'modules/core/categories.js');
}

test('no other script writes the category list or the grouping down again', () => {
  const files = extensionScripts();
  assert.ok(files.length > 150, 'the guard scans the extension');
  const COPIES = [
    [/\[\s*'antibot'\s*,\s*'captcha'\s*,\s*'fingerprint'\s*(?:,\s*'other'\s*)?\]/, 'the list of categories (Categories.KEYS, Categories.KEYS_AND_OTHER)'],
    [/\{\s*antibot:\s*0\s*,\s*captcha:\s*0\s*,\s*fingerprint:\s*0/, 'a counter per category (build it from Categories.KEYS_AND_OTHER)'],
    [/includes\('captcha'\)[^\n]*includes\('fingerprint'\)|includes\('fingerprint'\)[^\n]*includes\('captcha'\)/, 'the grouping chain (Categories.keyOf)'],
    [/includes\('(?:captcha|fingerprint)'\)\s*\)?\s*return\s*'(?:captcha|fingerprint)'/, 'the grouping chain (Categories.keyOf)'],
    [/categoryAntibot['"][^\n]*categoryCaptcha['"]/, 'the label keys (Categories.LABELS)'],
    [/antibot:\s*'#FF5733'|'#FF5733'\s*[,}]/i, 'the default colours (Categories.DEFAULT_COLORS)']
  ];
  const found = [];
  for (const file of files) {
    const text = read(file);
    for (const [pattern, what] of COPIES) if (pattern.test(text)) found.push(`${file}: ${what}`);
  }
  assert.deepStrictEqual(found, []);
});
