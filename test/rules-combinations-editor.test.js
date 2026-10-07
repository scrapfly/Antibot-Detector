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

test('opening and saving every shipped fingerprint rule keeps its condition tree', () => {
  const dir = path.join(__dirname, '../detectors/fingerprint');
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
    const detector = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const { rules } = editor(detector);
    assert.deepEqual(plain(rules.buildCombinationsForSave().combinations), detector.combinations || [], file);
  }
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

test('require control applies to method references and shared patterns, including newly selected patterns', () => {
  const detector = base({ all: [{ pattern: 'a' }] });
  detector.detection.url.forEach(p => { p.standalone = true; });
  detector.combinations.push({ id: 'c2', name: 'Shared', when: { all: [{ pattern: 'a' }] } });
  const { rules, options, act } = editor(detector);
  act('require', { checked: true });
  assert.equal(options[0].strict, true);
  assert.equal(rules.comboRequiresTogether(rules.combinationsModel[1]), true);
  rules.addComboItems(rules.combinationsModel[0], ['pattern:b']);
  assert.equal(options[1].strict, true);
  rules.addComboItems(rules.combinationsModel[0], ['method:url']);
  assert.equal(options.every(p => p.strict), true);
  act('require', { checked: false });
  assert.equal(options.every(p => !p.strict), true);
});

test('new empty combinations require picked patterns by default and retain full ids', () => {
  const { rules, options } = editor(base({ all: [] }), [{ id: 'api:with:colons', method: 'url', label: '/a', strict: false }]);
  const combo = rules.combinationsModel[0];
  combo.requireNew = true;
  rules.addComboItems(combo, ['pattern:api:with:colons', 'pattern:api:with:colons']);
  assert.deepEqual(plain(combo.when), { all: [{ pattern: 'api:with:colons' }] });
  assert.equal(options[0].strict, true);
});

test('removing a pattern releases it only when unused elsewhere', () => {
  const { rules, options, act } = editor(base({ all: [{ pattern: 'a' }, { any: [{ pattern: 'a' }, { pattern: 'b' }] }] }));
  act('remove', { path: '1', item: 1, kind: 'click' });
  assert.deepEqual(plain(rules.combinationsModel[0].when), { all: [{ pattern: 'a' }, { any: [{ pattern: 'a' }] }] });
  assert.equal(options.find(p => p.id === 'a').strict, true);
  assert.equal(options.find(p => p.id === 'b').strict, false);
});

test('deleted patterns are pruned without flattening surviving nested groups or lowering thresholds', () => {
  const { rules } = editor(base({ all: [{ pattern: 'a' }, { atLeast: 2, of: [{ pattern: 'b' }, { pattern: 'c' }] }] }));
  const saved = rules.buildCombinationsForSave({ url: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(plain(saved.combinations[0].when), { all: [{ pattern: 'a' }, { atLeast: 2, of: [{ pattern: 'b' }] }] });
  assert.equal(saved.invalidIndex, 0, 'impossible thresholds must be reported instead of weakened');
});

test('empty groups, exclusion-only OR branches and impossible thresholds cannot be saved', () => {
  for (const when of [{ all: [] }, { all: [{ pattern: 'a' }, { any: [] }] },
    { any: [{ pattern: 'a' }, { not: { pattern: 'b' } }] },
    { of: [{ pattern: 'a' }, { not: { pattern: 'b' } }], atLeast: 2 },
    { of: [{ pattern: 'a' }, { pattern: 'b' }], atLeast: 1.5 }]) {
    assert.equal(editor(base(when)).rules.buildCombinationsForSave().invalidIndex, 0, JSON.stringify(when));
  }
});

test('condition rendering escapes pattern labels and gives controls readable accessible names', () => {
  const { rules, container } = editor(base({ all: [{ pattern: 'a' }] }), [{ id: 'a', method: 'url', label: '<script>"long API name"</script>', strict: true }]);
  rules.setComboOpen(rules.combinationsModel[0], true);
  rules.renderCombinations();
  assert.ok(container.innerHTML.includes('&lt;script>'));
  assert.ok(!container.innerHTML.includes('<script>'));
  assert.ok(container.innerHTML.includes('All conditions match'));
  assert.ok(container.innerHTML.includes('Does not match'));
  assert.ok(container.innerHTML.includes('Use patterns only in combinations'));
  assert.ok(container.innerHTML.includes('aria-label="Pattern condition"'));
  assert.ok(!container.innerHTML.includes('combo-strict'));
});


test('builder hides group controls and explains minimum matches in one short sentence', () => {
  const { rules, container } = editor(base({ atLeast: 2, of: [{ pattern: 'a' }, { pattern: 'b' }, { pattern: 'c' }] }));
  assert.equal(rules.describeCombo(rules.combinationsModel[0]), 'Detect when at least 2 of 3 conditions match.');
  assert.ok(!container.innerHTML.includes('Add group'));
  assert.ok(!container.innerHTML.includes('How this combination works'));
  assert.ok(!container.innerHTML.includes('data-combo-action="add-group"'));
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
