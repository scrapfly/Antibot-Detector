'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Rules tab: the order of the list. The tab builds its own order (switched-off rules last, the category order chosen in Settings,
// newest update, name) and calls it Default; the dropdown can also show the rules by name or by the date they were last updated.
// The pure module decides those two, as HistorySort does for History: a new list, the list passed never changed, rules that tie
// keep the order they were given in (so inside a day, or among equal names, the Default order shows through).

// Loaded inside each test, so a missing module is one failure per test and not one failure of the whole file
const S = () => require('../modules/core/rules-sort.js');

/** { category, detectorName, detector }, as the Rules tab lists them */
const rule = (name, lastUpdated, extra = {}) => ({ category: 'antibot', detectorName: `id-${name}`, detector: { id: `id-${name}`, name, displayName: name, lastUpdated, enabled: true, ...extra } });
const zeta = rule('Zeta', '2026-11-05');
const alpha = rule('alpha', '2026-10-01 10:30:00');
const mid = rule('Mid', '2026-11-05 09:00:00');
const beta = rule('Beta');
// The list as the tab builds it: the sorts start from this order
const list = [zeta, alpha, mid, beta];
const local = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();

test('the keys are default, name and updated, and isKey knows exactly those', () => {
  assert.deepEqual([...S().KEYS], ['default', 'name', 'updated']);
  assert.ok(S().KEYS.every(S().isKey));
  for (const key of ['recent', 'host', 'size', 'Name', ' name', 'updated ', '', undefined, null, 7, {}, []]) assert.equal(S().isKey(key), false, String(key));
});

test('Default, an unknown key and no key keep the order given, as a new list', () => {
  for (const key of ['default', undefined, null, '', 'nonsense', 'recent', 'host', 'NAME', 7]) {
    const out = S().sort(list, key);
    assert.deepEqual(out, list, String(key));
    assert.notStrictEqual(out, list, `${key}: a new list, the tab keeps both`);
  }
});

test('name puts the rules A to Z as the card names them, ignoring case', () => {
  assert.deepEqual(S().sort(list, 'name'), [alpha, beta, mid, zeta]);
  assert.deepEqual(S().sort([...list].reverse(), 'name'), [alpha, beta, mid, zeta], 'whatever order it starts from');
});

test('name reads the name the card shows: the display name, then the name, then the id', () => {
  const shown = { category: 'captcha', detectorName: 'zz-id', detector: { displayName: 'Beta', name: 'Zed' } };
  const named = { category: 'captcha', detectorName: 'aa-id', detector: { name: 'Gamma' } };
  const bare = { category: 'captcha', detectorName: 'Delta-id', detector: {} };
  assert.deepEqual(S().sort([named, shown, bare], 'name'), [shown, bare, named], 'Beta (displayed), Delta-id (the id), Gamma (the name)');
});

test('name reads numbers as numbers, so "Rule 2" comes before "Rule 10"', () => {
  const ten = rule('Rule 10');
  const two = rule('Rule 2');
  const one = rule('Rule 1');
  assert.deepEqual(S().sort([ten, two, one], 'name'), [one, two, ten]);
});

test('updated puts the newest update first, a rule with no date last', () => {
  assert.deepEqual(S().sort(list, 'updated'), [mid, zeta, alpha, beta], 'the time of day counts; a rule with no date is last');
});

test('updated reads the dates as the rules write them: a day, a day with a time, an ISO date, milliseconds', () => {
  const day = rule('day', '2026-11-05');
  const timed = rule('timed', '2026-11-05 10:00:00');
  const iso = rule('iso', '2026-11-05T11:00:00');
  const utc = rule('utc', '2026-11-04T00:00:00Z');
  const ms = rule('ms', local(2026, 11, 6, 12));
  const padded = rule('padded', '  2026-11-05 12:30:00  ');
  assert.deepEqual(S().sort([day, utc, timed, iso, ms, padded], 'updated'), [ms, padded, iso, timed, day, utc]);
});

test('a rule with a date that cannot be read is treated as having none', () => {
  const dated = rule('dated', '2026-11-05');
  const odd = [rule('a', 'soon'), rule('b', {}), rule('c', NaN), rule('d', -5), rule('e', Infinity), rule('f', null), rule('g', true)];
  const out = S().sort([...odd, dated], 'updated');
  assert.equal(out[0], dated, 'the only rule with a date is first');
  assert.deepEqual(out.slice(1), odd, 'the rest keep the order they were given in');
});

test('rules that tie keep the order they were given in, for every key', () => {
  const x = rule('same', '2026-11-05');
  const y = rule('SAME', '2026-11-05');
  for (const key of S().KEYS) {
    assert.deepEqual(S().sort([x, y], key), [x, y], `${key}: x then y`);
    assert.deepEqual(S().sort([y, x], key), [y, x], `${key}: y then x`);
  }
  // inside one day the Default order shows through
  const first = rule('Qux', '2026-11-05 08:00:00');
  const second = rule('Bar', '2026-11-05 08:00:00');
  const third = rule('Foo', '2026-11-05 08:00:00');
  assert.deepEqual(S().sort([first, second, third], 'updated'), [first, second, third]);
});

test('the list passed is not changed, even when it cannot be', () => {
  const frozen = Object.freeze(list.map(entry => Object.freeze({ ...entry, detector: Object.freeze({ ...entry.detector }) })));
  const before = JSON.stringify(frozen);
  for (const key of [...S().KEYS, 'nonsense']) {
    assert.doesNotThrow(() => S().sort(frozen, key), key);
    assert.equal(JSON.stringify(frozen), before, key);
  }
  const copy = list.slice();
  S().sort(list, 'name');
  S().sort(list, 'updated');
  assert.deepEqual(list, copy, 'the same rules in the same places');
  for (let i = 0; i < list.length; i++) assert.strictEqual(list[i], copy[i]);
});

test('junk entries are dropped and a list that is not a list gives an empty one', () => {
  for (const key of S().KEYS) {
    assert.deepEqual(S().sort([null, zeta, undefined, {}, { detector: null }, 'x', 5, { detector: 'Plain' }], key), [zeta], key);
    assert.deepEqual(S().sort('x', key), [], key);
    assert.deepEqual(S().sort(undefined, key), [], key);
    assert.deepEqual(S().sort({ length: 2 }, key), [], key);
  }
});

test('rules with odd names and dates do not throw, and none is lost', () => {
  const odd = [
    { category: 'a', detectorName: 'x1', detector: { lastUpdated: {} } },
    { category: 'a', detector: { name: 5, lastUpdated: 'soon' } },
    { category: 'a', detectorName: 'x3', detector: { displayName: null, lastUpdated: NaN } },
    { category: 'a', detectorName: 'x4', detector: { name: ['list'], lastUpdated: -5 } },
    { detector: { displayName: 'Only a name' } },
    { category: 5, detectorName: 7, detector: { lastUpdated: Infinity } }
  ];
  for (const key of [...S().KEYS, 'nonsense']) {
    const out = S().sort(odd, key);
    assert.equal(out.length, odd.length, key);
    assert.deepEqual([...out].sort((a, b) => odd.indexOf(a) - odd.indexOf(b)), odd, `${key}: the same rules`);
  }
});

test('timeOf reads what a rule was last updated as milliseconds, and 0 for no date or one it cannot read', () => {
  const { timeOf } = S();
  assert.equal(timeOf('2026-11-05'), local(2026, 11, 5), 'a day is its midnight, in local time');
  assert.equal(timeOf('2026-11-05 14:30:15'), local(2026, 11, 5, 14, 30, 15), 'the editor writes the local time with a space');
  assert.equal(timeOf('2026-11-05T14:30:15'), local(2026, 11, 5, 14, 30, 15));
  assert.equal(timeOf(' 2026-11-05 '), local(2026, 11, 5));
  assert.equal(timeOf('2026-11-05T00:00:00Z'), Date.UTC(2026, 10, 5));
  assert.equal(timeOf(1762300800000), 1762300800000, 'milliseconds as they are');
  for (const none of [undefined, null, '', '   ', 'soon', '2026-13-45', {}, [], NaN, Infinity, -1, 0, true]) assert.equal(timeOf(none), 0, String(none));
});
