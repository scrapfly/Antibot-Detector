const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../modules/detection/detection-combinations.js');
const source = fs.readFileSync(path.join(__dirname, '../sections/rules/rules-combinations.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function editor(detector, givenOptions) {
  const options = givenOptions || C.listPatterns(detector).map(p => ({ id: p.id, method: p.method,
    label: p.pattern.target || p.pattern.name || p.id, confidence: p.pattern.confidence || 40,
    strict: p.pattern.standalone === false }));
  const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const context = { Rules: function() {}, DetectionCombinations: C,
    FormatUtils: { escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      escapeAttr: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') },
    document: { querySelector: selector => selector === '#combinationsContainer' ? container : null },
    setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(source, context);
  const rules = new context.Rules();
  rules.currentEditDetector = {};
  rules.getComboPatternOptions = () => options;
  rules.getMethodLabel = method => method;
  rules.renderMethodChip = method => `<span class="combo-chip">${method}</span>`;
  rules.setComboPatternStrict = (id, strict) => { const option = options.find(p => p.id === id); if (option) option.strict = strict; };
  rules.initCombinationsEditor(detector);
  function act(action, { path = '', item, value, checked, kind = 'change' } = {}) {
    const card = { dataset: { combo: '0' } };
    const group = { dataset: { path } };
    const itemEl = item === undefined ? null : { dataset: { idx: String(item) } };
    const el = { dataset: { comboAction: action }, value, checked,
      closest: selector => selector === '.combo-card' ? card : selector === '.combo-group' ? group : selector === '.combo-item' ? itemEl : selector === '[data-combo-action]' ? el : null };
    rules.handleCombinationAction({ target: el }, kind);
  }
  return { rules, options, context, container, act };
}
const base = when => ({ detection: { url: [{ id: 'a', name: '/a', confidence: 30, standalone: false },
  { id: 'b', name: '/b', confidence: 40, standalone: false }, { id: 'c', name: '/c', confidence: 50, standalone: false }] },
  combinations: [{ id: 'c1', name: 'Grouped rule', confidence: 65, when }] });
const matches = ids => ids.map(patternId => ({ type: 'url', patternId, confidence: 40 }));

test('opening and saving every shipped rule keeps its combinations and pattern flags', () => {
  let count = 0;
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    const dir = path.join(__dirname, '../detectors', category);
    for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
      const detector = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const { rules, options } = editor(detector);
      const before = options.map(p => p.strict);
      rules.setComboOpen(rules.combinationsModel[0], true);
      rules.renderCombinations();
      assert.deepEqual(plain(rules.buildCombinationsForSave().combinations), detector.combinations || [], file);
      assert.deepEqual(options.map(p => p.strict), before, `${file}: opening never changes "only count together"`);
      assert.deepEqual(rules.currentEditDetector.originalCombinations, rules.buildCombinationsForSave(null, { validate: false }).combinations, `${file}: a no-op save is a no-op`);
      count++;
    }
  }
  assert.equal(count, 62);
});

test('renaming preserves nested alternatives, exclusions and thresholds without mutating the source', () => {
  const detector = base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'b' }, { pattern: 'c' }] },
    { not: { all: [{ pattern: 'b' }, { pattern: 'c' }] } },
    { atLeast: 2, of: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }] });
  const original = plain(detector);
  const { rules } = editor(detector);
  rules.combinationsModel[0].name = 'Renamed';
  const saved = rules.buildCombinationsForSave();
  assert.equal(saved.invalidIndex, -1);
  assert.deepEqual(plain(saved.combinations[0].when), original.combinations[0].when);
  assert.equal(saved.combinations[0].name, 'Renamed');
  assert.deepEqual(detector, original);
  for (const ids of [[], ['a'], ['a', 'b'], ['a', 'c'], ['a', 'b', 'c']]) {
    assert.equal(C.score({ ...detector, combinations: saved.combinations }, matches(ids)).detected,
      C.score(original, matches(ids)).detected, ids.join(','));
  }
});

test('All / Any mode changes the combination while preserving stored alternatives', () => {
  const { rules, act } = editor(base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'b' }, { pattern: 'c' }] }] }));
  act('mode', { value: 'any' });
  const saved = rules.buildCombinationsForSave();
  assert.deepEqual(plain(saved.combinations[0].when), { any: [{ pattern: 'a' }, { any: [{ pattern: 'b' }, { pattern: 'c' }] }] });
  assert.equal(C.score({ ...base(), combinations: saved.combinations }, matches(['a'])).detected, true);
  assert.equal(C.score({ ...base(), combinations: saved.combinations }, matches(['a', 'b', 'c'])).detected, true);
});

test('At least uses the real engine threshold and clamps edited counts to group size', () => {
  const { rules, act } = editor(base({ all: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }));
  act('mode', { value: 'of' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 2);
  let saved = rules.buildCombinationsForSave();
  assert.equal(C.score({ ...base(), combinations: saved.combinations }, matches(['a'])).detected, false);
  assert.equal(C.score({ ...base(), combinations: saved.combinations }, matches(['a', 'b'])).detected, true);
  act('threshold', { value: '99' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 3);
  act('threshold', { value: '0' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 1);
});

test('nested pattern exclusions save as NOT and block matching pages', () => {
  const { rules, act } = editor(base({ all: [{ pattern: 'a' }, { all: [{ pattern: 'b' }] }] }));
  act('presence', { path: '1', item: 0, value: 'absent' });
  const combinations = rules.buildCombinationsForSave().combinations;
  assert.deepEqual(plain(combinations[0].when.all[1]), { all: [{ not: { pattern: 'b' } }] });
  assert.equal(C.score({ ...base(), combinations }, matches(['a'])).detected, true);
  assert.equal(C.score({ ...base(), combinations }, matches(['a', 'b'])).detected, false);
});

test('deleted patterns are pruned without flattening surviving nested groups or lowering thresholds', () => {
  const { rules } = editor(base({ all: [{ pattern: 'a' }, { atLeast: 2, of: [{ pattern: 'b' }, { pattern: 'c' }] }] }));
  const saved = rules.buildCombinationsForSave({ url: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(plain(saved.combinations[0].when), { all: [{ pattern: 'a' }, { atLeast: 2, of: [{ pattern: 'b' }] }] });
  assert.equal(saved.invalidIndex, 0, 'impossible thresholds must be reported instead of weakened');
});

test('minimum-match arrow buttons step the saved count and respect both limits', () => {
  const { rules, act } = editor(base({ atLeast: 2, of: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }));
  act('threshold-increase', { kind: 'click' });
  assert.equal(rules.buildCombinationsForSave().combinations[0].when.atLeast, 3);
  act('threshold-increase', { kind: 'click' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 3);
  act('threshold-decrease', { kind: 'click' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 2);
  act('threshold-decrease', { kind: 'click' });
  act('threshold-decrease', { kind: 'click' });
  assert.equal(rules.buildCombinationsForSave().combinations[0].when.atLeast, 1);
});

test('opening a rule shows every combination collapsed; one card opens when toggled', () => {
  const detector = base({ all: [{ pattern: 'a' }, { pattern: 'b' }] });
  detector.combinations.push({ id: 'c2', name: 'Second', confidence: 70, when: { all: [{ pattern: 'c' }] } });
  const { rules, container, act } = editor(detector);
  assert.ok(rules.combinationsModel.every(combo => !rules.isComboOpen(combo)));
  assert.equal((container.innerHTML.match(/class="combo-card collapsed"/g) || []).length, 2);
  act('toggle-card', { kind: 'click' });
  assert.equal(rules.isComboOpen(rules.combinationsModel[0]), true);
  assert.equal(rules.isComboOpen(rules.combinationsModel[1]), false);
});

// Redesign (2.8.3): descriptions first, editable groups, plain sentences, and
// "only count together" never changes behind the user's back.

test('"only count together" changes only when ticked, for method rows and shared patterns too', () => {
  const detector = base({ all: [{ pattern: 'a' }] });
  detector.detection.url.forEach(p => { p.standalone = true; });
  detector.combinations.push({ id: 'c2', name: 'Shared', when: { all: [{ pattern: 'a' }] } });
  const { rules, options, act } = editor(detector);
  rules.addComboItems(rules.combinationsModel[0], ['pattern:b']);
  assert.equal(options.find(p => p.id === 'b').strict, false, 'adding a pattern leaves its flag alone');
  act('require', { checked: true });
  assert.deepEqual(options.map(p => [p.id, p.strict]), [['a', true], ['b', true], ['c', false]]);
  assert.equal(rules.comboRequiresTogether(rules.combinationsModel[1]), true, 'the flag is shared by the whole rule');
  rules.addComboItems(rules.combinationsModel[0], ['method:url']);
  act('require', { checked: false });
  assert.equal(options.every(p => !p.strict), true);
});

test('new combinations keep full ids and add each pattern once', () => {
  const { rules, options } = editor(base({ all: [] }), [{ id: 'api:with:colons', method: 'url', label: '/a', strict: false }]);
  const combo = rules.combinationsModel[0];
  rules.addComboItems(combo, ['pattern:api:with:colons', 'pattern:api:with:colons']);
  assert.deepEqual(plain(combo.when), { all: [{ pattern: 'api:with:colons' }] });
  assert.equal(options[0].strict, false);
});

test('removing rows or a whole combination never makes a weak pattern detect on its own', () => {
  const { rules, options, act } = editor(base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'a' }, { pattern: 'b' }] }] }));
  act('remove', { path: '1', item: 1, kind: 'click' });
  assert.deepEqual(plain(rules.combinationsModel[0].when), { all: [{ pattern: 'a' }, { any: [{ pattern: 'a' }] }] });
  assert.deepEqual(options.map(p => p.strict), [true, true, true], 'b stays combination-only');
  rules.currentEditDetector = rules._comboModelOwner;
  assert.equal(rules.isComboPatternUnused('b'), true, 'its row says it is in no combination');
  assert.equal(rules.isComboPatternUnused('a'), false);
});

test('an emptied group is dropped on save; empty, NOT-only and impossible trees are refused with a reason', () => {
  const emptied = editor(base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'b' }] }] }));
  emptied.act('remove', { path: '1', item: 0, kind: 'click' });
  const saved = emptied.rules.buildCombinationsForSave();
  assert.equal(saved.invalidIndex, -1);
  assert.deepEqual(plain(saved.combinations[0].when), { all: [{ pattern: 'a' }] });
  const cases = [
    [{ all: [] }, /at least one pattern that must be found/],
    [{ all: [{ not: { pattern: 'a' } }] }, /at least one pattern that must be found/],
    [{ any: [{ pattern: 'a' }, { not: { pattern: 'b' } }] }, /One of these/],
    [{ of: [{ pattern: 'a' }, { not: { pattern: 'b' } }], atLeast: 2 }, /At least 2/],
    [{ of: [{ pattern: 'a' }, { pattern: 'b' }], atLeast: 1.5 }, /At least 1\.5/]
  ];
  for (const [when, reason] of cases) {
    const result = editor(base(when)).rules.buildCombinationsForSave();
    assert.equal(result.invalidIndex, 0, JSON.stringify(when));
    assert.match(result.invalidMessage, reason, JSON.stringify(when));
  }
});

test('groups: add a "one of" group with its picker, change its mode, delete it', () => {
  const { rules, act, container } = editor(base({ all: [{ pattern: 'a' }] }));
  rules.setComboOpen(rules.combinationsModel[0], true);
  act('add-group', { kind: 'click' });
  assert.deepEqual(plain(rules.combinationsModel[0].when), { all: [{ pattern: 'a' }, { any: [] }] });
  assert.equal(rules._comboPickerPath, '1', 'the new group opens its picker');
  assert.match(container.innerHTML, /data-path="1" role="group"/);
  rules.addComboItems(rules.combinationsModel[0], ['pattern:b', 'pattern:c'], '1');
  act('mode', { path: '1', value: 'of' });
  assert.deepEqual(plain(rules.combinationsModel[0].when.all[1]), { of: [{ pattern: 'b' }, { pattern: 'c' }], atLeast: 2 });
  act('threshold-decrease', { path: '1', kind: 'click' });
  assert.equal(rules.combinationsModel[0].when.all[1].atLeast, 1);
  const saved = rules.buildCombinationsForSave().combinations;
  assert.equal(C.score({ ...base(), combinations: saved }, matches(['a', 'c'])).detected, true);
  assert.equal(C.score({ ...base(), combinations: saved }, matches(['b', 'c'])).detected, false);
  act('delete-group', { path: '1', kind: 'click' });
  assert.deepEqual(plain(rules.combinationsModel[0].when), { all: [{ pattern: 'a' }] });
});

test('"at least" counts only rows that must be found, and drops when a row becomes "must not be found"', () => {
  const { rules, act } = editor(base({ atLeast: 3, of: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }));
  act('presence', { item: 2, value: 'absent' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 2);
  act('threshold', { value: '3' });
  assert.equal(rules.combinationsModel[0].when.atLeast, 2, 'the NOT row does not count');
  assert.equal(rules.buildCombinationsForSave().invalidIndex, -1);
});

test('rows show the stored description first, but not after the pattern text was edited', () => {
  const detector = base({ all: [{ pattern: 'a' }, { pattern: 'b' }] });
  detector.detection.url[0].text = '/a'; detector.detection.url[0].description = 'Official SDK <script>';
  detector.detection.url[1].text = '/b'; detector.detection.url[1].description = 'Old description';
  const { rules, container } = editor(detector, [
    { id: 'a', method: 'url', label: '/a', strict: true, confidence: 50 },
    { id: 'b', method: 'url', label: '/b-edited', strict: false, confidence: 40 },
    { id: 'c', method: 'url', label: '/c', strict: false, confidence: 30 }]);
  rules.setComboOpen(rules.combinationsModel[0], true);
  rules.renderCombinations();
  const html = container.innerHTML;
  assert.match(html, /<span class="combo-item-desc" dir="auto">Official SDK &lt;script><\/span><\/p><span class="combo-leaf-text" dir="ltr" title="\/a">\/a<\/span>/);
  assert.ok(!html.includes('Old description'), 'an edited pattern shows its new text, not the old description');
  assert.match(html, /<span class="combo-leaf-text is-main" dir="ltr" title="\/b-edited">\/b-edited<\/span>/);
  assert.match(html, /class="combo-item-tag">Combinations only</);
  assert.ok(!html.includes('<script>'));
});

test('the card says when it fires, in plain sentences', () => {
  const sentences = (when, confidence = 65, opts) => {
    const detector = base(when);
    detector.combinations[0].confidence = confidence;
    const { rules } = editor(detector, opts);
    return rules.describeCombo(rules.combinationsModel[0]);
  };
  assert.equal(sentences({ all: [{ pattern: 'a' }, { pattern: 'b' }] }), 'Fires when all 2 conditions are met. Confidence: 65%.');
  assert.equal(sentences({ atLeast: 2, of: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }), 'Fires when at least 2 of these 3 conditions are met. Confidence: 65%.');
  assert.equal(sentences({ any: [{ pattern: 'a' }, { pattern: 'b' }] }, null), 'Fires when any one of these 2 conditions is met. Confidence: Auto, up to 40%.');
  assert.equal(sentences({ all: [{ pattern: 'a' }, { any: [{ pattern: 'b' }, { pattern: 'c' }] }, { not: { pattern: 'c' } }] }),
    'Fires when all 3 conditions are met. Confidence: 65%. A group counts as one condition. It does not fire if a “Must not be found” pattern is present.');
  const loose = [{ id: 'a', method: 'url', label: '/a', strict: false, confidence: 30 }, { id: 'b', method: 'url', label: '/b', strict: true, confidence: 40 }];
  assert.match(sentences({ all: [{ pattern: 'a' }, { pattern: 'b' }] }, 65, loose), /also detect on their own/);
  assert.equal(sentences({ all: [] }), 'Add patterns to build this combination');
});

test('the builder offers group controls with readable, unique names', () => {
  const { rules, container } = editor(base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'b' }, { pattern: 'c' }] }, { atLeast: 1, of: [{ pattern: 'a' }, { pattern: 'b' }] }] }));
  rules.setComboOpen(rules.combinationsModel[0], true);
  rules.renderCombinations();
  const html = container.innerHTML;
  assert.match(html, /data-combo-action="add-group">\+ Add “one of” group/);
  assert.equal((html.match(/data-combo-action="delete-group"/g) || []).length, 2);
  assert.match(html, /<option value="all" selected>all of these are found<\/option>/);
  assert.match(html, /<option value="any" selected>One of these<\/option>/);
  assert.match(html, /aria-label="Pattern condition"/);
  assert.match(html, /Must not be found/);
  assert.match(html, /These patterns only count together/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, [...new Set(ids)], 'no duplicate ids once groups have their own controls');
  for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(id), id);
});
