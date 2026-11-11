'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Rules editor: a pattern that more than one rule holds. Saving a rule that repeats a pattern of its own was reported in 3.1.6;
// this module also finds the OTHER rules that hold one of the saved rule's patterns, with the same idea of "the same pattern":
// everything but the id, the confidence and the standalone flag. It only finds; the editor warns and never blocks (a host that
// two rules share on purpose is not a mistake).

// Loaded inside each test, so a missing module is one failure per test and not one failure of the whole file
const D = () => require('../modules/core/rule-duplicates.js');

/** { category, detectorName, detector }, as the Rules tab lists them */
const entry = (id, detection, extra = {}) => ({ category: 'antibot', detectorName: id, detector: { id, name: id, displayName: `Rule ${id}`, detection, ...extra } });
const cookie = (name, extra = {}) => ({ name, ...extra });

test('the same pattern in two rules is found, with the rule that holds it', () => {
  const saved = { cookie: [{ id: 'a1', name: '_abc', confidence: 90 }] };
  const list = [entry('other', { cookie: [{ id: 'z9', name: '_abc', confidence: 90 }] }), entry('unrelated', { cookie: [cookie('_xyz')] })];
  assert.deepEqual(D().findInOthers(saved, list), [{ category: 'antibot', detectorName: 'other', name: 'Rule other', shared: 1 }]);
});

test('a different id, confidence or standalone flag is still the same pattern', () => {
  const saved = { cookie: [{ id: 'a', name: '_abc', confidence: 90, standalone: true }] };
  for (const other of [cookie('_abc'), cookie('_abc', { confidence: 10 }), cookie('_abc', { id: 'x', standalone: false }), cookie('_abc', { confidence: 99, id: 'y', standalone: true })]) {
    assert.equal(D().findInOthers(saved, [entry('o', { cookie: [other] })]).length, 1, JSON.stringify(other));
  }
});

test('a pattern that differs in its text, an option or its kind is not the same', () => {
  const saved = { url: [{ text: 'cdn.example.com/x.js' }], cookie: [cookie('_abc')] };
  const differs = [
    entry('text', { url: [{ text: 'cdn.example.com/y.js' }] }),
    entry('option', { url: [{ text: 'cdn.example.com/x.js', textRegex: true }] }),
    entry('extra', { url: [{ text: 'cdn.example.com/x.js', description: 'Loads the script' }] }),
    entry('kind', { content: [{ text: 'cdn.example.com/x.js' }], header: [cookie('_abc')] }),
    entry('empty', {}), entry('none', undefined)
  ];
  assert.deepEqual(D().findInOthers(saved, differs), []);
});

test('the order the options are written in does not make a pattern different', () => {
  const saved = { url: [{ text: 'a', textRegex: true, textCaseSensitive: false }] };
  assert.equal(D().findInOthers(saved, [entry('o', { url: [{ textCaseSensitive: false, text: 'a', textRegex: true }] })]).length, 1);
});

test('the rule being saved is left out of the others, and only that one', () => {
  const detection = { cookie: [cookie('_abc')] };
  const me = entry('me', detection);
  const twin = { ...entry('me', detection), category: 'captcha' }; // the same id in another category is another rule
  const other = entry('other', detection);
  assert.deepEqual(D().findInOthers(detection, [me, other], { category: 'antibot', detectorName: 'me' }).map(f => f.detectorName), ['other']);
  assert.deepEqual(D().findInOthers(detection, [me, twin, other], { category: 'antibot', detectorName: 'me' }).map(f => `${f.category}/${f.detectorName}`), ['captcha/me', 'antibot/other']);
  assert.deepEqual(D().findInOthers(detection, [me, twin, other], { detectorName: 'me' }).map(f => f.detectorName), ['other'], 'with no category the id alone says which rule it is');
  assert.deepEqual(D().findInOthers(detection, [me, other]).map(f => f.detectorName), ['me', 'other'], 'a rule that is not listed yet (a new one) leaves nothing out');
  assert.deepEqual(D().findInOthers(detection, [me], { category: 'antibot', detectorName: 'me' }), [], 'alone in the list: nobody else');
});

test('nothing is found when nothing is shared, or when there is nothing to compare', () => {
  const saved = { cookie: [cookie('_abc')] };
  assert.deepEqual(D().findInOthers(saved, [entry('a', { cookie: [cookie('_other')] })]), []);
  assert.deepEqual(D().findInOthers(saved, []), []);
  assert.deepEqual(D().findInOthers({}, [entry('a', { cookie: [cookie('_abc')] })]), []);
  assert.deepEqual(D().findInOthers(undefined, undefined), []);
  assert.deepEqual(D().findInOthers(null, [entry('a', {})], null), []);
});

test('the rules come most-shared first, then in the order of the list', () => {
  const saved = { cookie: [cookie('a'), cookie('b'), cookie('c')] };
  const one = entry('one', { cookie: [cookie('a')] });
  const three = entry('three', { cookie: [cookie('c'), cookie('b'), cookie('a'), cookie('zzz')] });
  const alsoOne = entry('alsoOne', { cookie: [cookie('b')] });
  const found = D().findInOthers(saved, [one, three, alsoOne]);
  assert.deepEqual(found.map(f => [f.detectorName, f.shared]), [['three', 3], ['one', 1], ['alsoOne', 1]]);
});

test('a pattern is counted once for each other rule, however many times either rule holds it', () => {
  const saved = { cookie: [cookie('a'), cookie('a', { confidence: 5 })], url: [{ text: 'a' }] };
  const other = entry('o', { cookie: [cookie('a'), cookie('a', { id: 'x' })], url: [{ text: 'a' }] });
  assert.deepEqual(D().findInOthers(saved, [other]).map(f => f.shared), [2], 'the cookie once and the URL once');
});

test('a rule is named as its card names it: the display name, then the name, then the id', () => {
  const detection = { cookie: [cookie('a')] };
  const a = { category: 'antibot', detectorName: 'id-a', detector: { displayName: 'Shown', name: 'Stored', detection } };
  const b = { category: 'antibot', detectorName: 'id-b', detector: { name: 'Stored only', detection } };
  const c = { category: 'antibot', detectorName: 'id-c', detector: { detection } };
  const d = { category: 'antibot', detectorName: 'id-d', detector: { displayName: '   ', name: '', detection } };
  assert.deepEqual(D().findInOthers(detection, [a, b, c, d]).map(f => f.name), ['Shown', 'Stored only', 'id-c', 'id-d']);
});

test('summarize names up to two rules and counts the rest', () => {
  const found = (n) => Array.from({ length: n }, (_, i) => ({ category: 'antibot', detectorName: `r${i}`, name: `Name ${i}`, shared: 1 }));
  assert.equal(D().MAX_NAMED, 2);
  assert.deepEqual(D().summarize(found(0)), { names: [], more: 0 });
  assert.deepEqual(D().summarize(found(1)), { names: ['Name 0'], more: 0 });
  assert.deepEqual(D().summarize(found(2)), { names: ['Name 0', 'Name 1'], more: 0 });
  assert.deepEqual(D().summarize(found(3)), { names: ['Name 0', 'Name 1'], more: 1 });
  assert.deepEqual(D().summarize(found(7)), { names: ['Name 0', 'Name 1'], more: 5 });
  assert.deepEqual(D().summarize(found(7), 3), { names: ['Name 0', 'Name 1', 'Name 2'], more: 4 }, 'a limit of its own');
  assert.deepEqual(D().summarize(undefined), { names: [], more: 0 });
  assert.deepEqual(D().summarize('rules'), { names: [], more: 0 });
});

test('junk in the lists never throws, and the lists passed are not changed', () => {
  const saved = { cookie: [cookie('a'), null, 7, 'a', [], { name: 'a' }], url: 'not a list', content: null, js_hooks: [{ target: 'x' }] };
  const list = [null, undefined, 'x', 5, {}, { detector: null }, { detector: 'Plain' }, { category: 'c', detectorName: 'n', detector: { detection: 'oops' } },
    { category: 'c', detectorName: 'm', detector: { detection: { cookie: [null, 3, { name: 'a' }] } } }, entry('real', { cookie: [cookie('a')] })];
  const before = JSON.stringify([saved, list]);
  let found;
  assert.doesNotThrow(() => { found = D().findInOthers(saved, list, { category: 5, detectorName: {} }); });
  assert.deepEqual(found.map(f => f.detectorName).sort(), ['m', 'real']);
  assert.equal(JSON.stringify([saved, list]), before, 'nothing was changed');
  const frozen = Object.freeze({ cookie: Object.freeze([Object.freeze(cookie('a'))]) });
  assert.doesNotThrow(() => D().findInOthers(frozen, Object.freeze([Object.freeze(entry('x', frozen))])));
});

test('keyOf is what makes two patterns the same: everything but the id, the confidence and the standalone flag', () => {
  const { keyOf } = D();
  assert.equal(keyOf({ name: 'a', id: 'x', confidence: 1, standalone: true }), keyOf({ name: 'a', id: 'y', confidence: 99 }));
  assert.equal(keyOf({ a: 1, b: 2 }), keyOf({ b: 2, a: 1 }), 'whatever order the fields come in');
  assert.notEqual(keyOf({ name: 'a' }), keyOf({ name: 'b' }));
  assert.notEqual(keyOf({ name: 'a' }), keyOf({ name: 'a', textRegex: false }), 'an option that is written is part of the pattern');
  assert.notEqual(keyOf({ text: 'a', description: 'one' }), keyOf({ text: 'a', description: 'two' }));
  for (const junk of [null, undefined, 'text', 7, true]) assert.equal(keyOf(junk), null, String(junk));
});

test('countWithin counts the patterns of one rule that repeat another of the same kind: the editor\'s "same pattern more than once"', () => {
  const { countWithin } = D();
  assert.equal(countWithin({ cookie: [{ name: 'a', id: 'x', confidence: 90 }, { name: 'a', id: 'y', confidence: 50 }] }), 1);
  assert.equal(countWithin({ url: [{ text: 'a' }, { text: 'a' }, { text: 'a' }] }), 2);
  assert.equal(countWithin({ cookie: [{ name: 'a' }, { name: 'b' }] }), 0);
  assert.equal(countWithin({ url: [{ text: 'a' }, { text: 'a', textRegex: true }] }), 0);
  assert.equal(countWithin({ url: [{ text: 'a' }], content: [{ text: 'a' }] }), 0, 'two kinds do not repeat each other');
  assert.equal(countWithin({ cookie: [{ name: 'a' }, null, 7, { name: 'a' }], header: 'nope' }), 1);
  for (const none of [undefined, null, {}, [], 'x']) assert.equal(countWithin(none), 0, String(none));
});

test('the pattern another rule holds is found by the same key the repeat inside one rule is counted by', () => {
  // the two warnings must agree on what "the same" means: a pattern repeated inside one rule is found in another rule
  const pattern = (extra) => ({ name: '_abc', ...extra });
  const variants = [pattern({ id: 'a', confidence: 10 }), pattern({ id: 'b', confidence: 90, standalone: true }), pattern({})];
  for (const first of variants) {
    for (const second of variants) {
      const repeated = D().countWithin({ cookie: [first, second] }) === 1;
      const shared = D().findInOthers({ cookie: [first] }, [entry('o', { cookie: [second] })]).length === 1;
      assert.equal(shared, repeated, `${JSON.stringify(first)} / ${JSON.stringify(second)}`);
    }
  }
  const different = [pattern({ name: '_other' }), pattern({ textRegex: true }), pattern({ description: 'x' })];
  for (const second of different) {
    assert.equal(D().countWithin({ cookie: [pattern({}), second] }), 0);
    assert.equal(D().findInOthers({ cookie: [pattern({})] }, [entry('o', { cookie: [second] })]).length, 0);
  }
});
