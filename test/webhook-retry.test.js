'use strict';
// The rules of retrying a failed webhook delivery: which failures retry by themselves, when, and what is kept.
const test = require('node:test');
const assert = require('node:assert/strict');

const R = require('../modules/core/webhook-retry.js');

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 21, 12);
const item = (id, first, extra = {}) => ({ id, ctx: { url: `https://${id}.example/`, hostname: `${id}.example`, detections: [] }, first, attempts: 1, due: null, ...extra });

test('only a failure that may pass by itself is retried automatically', () => {
  for (const failure of [{ error: 'network' }, { status: 408 }, { status: 425 }, { status: 429 }, { status: 500 }, { status: 502 }, { status: 503 }, { status: 599 }]) {
    assert.equal(R.isTransient(failure), true, JSON.stringify(failure));
  }
  for (const failure of [{ error: 'blocked' }, { error: 'config' }, { status: 400 }, { status: 401 }, { status: 403 }, { status: 404 }, { status: 410 }, { status: 301 }, {}, null, undefined]) {
    assert.equal(R.isTransient(failure), false, JSON.stringify(failure));
  }
});

test('the waits grow: 1, 5 and 15 minutes, then no more automatic retries', () => {
  assert.deepEqual([...R.DELAYS_MS], [MIN, 5 * MIN, 15 * MIN]);
  assert.equal(R.schedule(1, T0, true, true), T0 + MIN);
  assert.equal(R.schedule(2, T0, true, true), T0 + 5 * MIN);
  assert.equal(R.schedule(3, T0, true, true), T0 + 15 * MIN);
  assert.equal(R.schedule(4, T0, true, true), null, 'three retries are all there are');
  assert.equal(R.schedule(1, T0, false, true), null, 'switched off in Settings');
  assert.equal(R.schedule(1, T0, true, false), null, 'a failure only the person can fix');
});

test('hold() keeps the newest 20 and nothing older than an hour', () => {
  let held = {};
  for (let i = 0; i < 25; i++) held = R.hold(held, item(`p${i}`, T0 + i * 1000), T0 + i * 1000);
  assert.equal(Object.keys(held).length, R.MAX_HELD);
  assert.ok(!('p0' in held) && !('p4' in held) && 'p5' in held && 'p24' in held, 'the oldest five went');
  const later = R.hold(held, item('fresh', T0 + 61 * MIN), T0 + 61 * MIN);
  assert.deepEqual(Object.keys(later), ['fresh'], 'everything else is over an hour old');
});

test('prune() drops expired, malformed and context-less entries, and never throws on odd input', () => {
  const held = { ok: item('ok', T0 + 10 * MIN), old: item('old', T0 - 61 * MIN), bad: { id: 'bad' }, nope: null, noctx: { id: 'noctx', first: T0 } };
  assert.deepEqual(Object.keys(R.prune(held, T0 + 30 * MIN)), ['ok']);
  for (const odd of [null, undefined, [], 'x', 7]) assert.deepEqual(R.prune(odd, T0), {});
});

test('dueIds() names what is due now, earliest first, and nextDue() the time the alarm needs', () => {
  const held = {
    a: item('a', T0, { due: T0 + 5 * MIN }), b: item('b', T0, { due: T0 + MIN }), c: item('c', T0, { due: null }), d: item('d', T0, { due: T0 + 20 * MIN })
  };
  assert.deepEqual(R.dueIds(held, T0), []);
  assert.deepEqual(R.dueIds(held, T0 + 5 * MIN), ['b', 'a']);
  assert.equal(R.nextDue(held, T0), T0 + MIN);
  assert.equal(R.nextDue({ c: held.c }, T0), null);
  assert.equal(R.nextDue({}, T0), null);
});

test('newId() is short, unique enough, and made of letters and digits', () => {
  const ids = new Set(Array.from({ length: 200 }, () => R.newId(T0)));
  assert.ok(ids.size > 190);
  for (const id of ids) assert.match(id, /^[a-z0-9]{8,24}$/);
  assert.equal(R.newId(T0, () => 0), R.newId(T0, () => 0), 'the random part is injectable');
});
