const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../modules/detection/detection-combinations.js');

const detector = (extra = {}) => ({
  id: 'detect-x',
  detection: {
    url: [{ text: '/akam/', confidence: 40, standalone: false }, { text: '/sbsd/', confidence: 90 }],
    cookie: [{ name: '_abck', confidence: 30, standalone: false }, { name: 'ak_bmsc', confidence: 20, standalone: false }],
    header: [{ name: 'server', confidence: 10, standalone: false }],
    js_hooks: [{ target: 'navigator.webdriver', confidence: 50, standalone: false }]
  },
  ...extra
});
const m = (type, patternId, confidence) => ({ type, patternId, confidence });

test('patterns get <method>-<n> ids unless they carry their own', () => {
  const d = detector();
  d.detection.url[1].id = 'url-custom';
  const ids = C.listPatterns(d).map(p => p.id);
  assert.deepStrictEqual(ids, ['url-1', 'url-custom', 'header-1', 'cookie-1', 'cookie-2', 'js_hooks-1']);
});

test('a detector without combinations or combination-only patterns is not rescored', () => {
  const legacy = { detection: { url: [{ text: 'a', confidence: 80 }] } };
  assert.strictEqual(C.applies(legacy), false);
  const detection = { detected: true, confidence: 80, matches: [m('url', 'url-1', 80)] };
  assert.strictEqual(C.rescore(legacy, detection), true);
  assert.strictEqual(detection.confidence, 80);
});

test('combination-only patterns do not fire alone; standalone ones still do', () => {
  const d = detector();
  assert.deepStrictEqual(C.score(d, [m('url', 'url-1', 40), m('cookie', 'cookie-1', 30)]).detected, false);
  assert.strictEqual(C.score(d, [m('url', 'url-2', 90)]).confidence, 90);
});

test('AND, OR and NOT across methods', () => {
  const d = detector({
    combinations: [{
      id: 'c1', name: 'challenge',
      when: { all: [{ pattern: 'url-1' }, { any: [{ pattern: 'cookie-1' }, { pattern: 'cookie-2' }] }, { not: { pattern: 'header-1' } }] }
    }]
  });
  assert.strictEqual(C.score(d, [m('url', 'url-1', 40)]).detected, false);
  const hit = C.score(d, [m('url', 'url-1', 40), m('cookie', 'cookie-2', 20)]);
  // url-1 (40) and cookie-2 (20) made it true: the highest of them scores
  assert.strictEqual(hit.confidence, 40);
  assert.deepStrictEqual(hit.combinations.map(({ id, name, confidence }) => ({ id, name, confidence })), [{ id: 'c1', name: 'challenge', confidence: 40 }]);
  // NOT: once the header shows up the combination no longer holds
  assert.strictEqual(C.score(d, [m('url', 'url-1', 40), m('cookie', 'cookie-2', 20), m('header', 'header-1', 10)]).detected, false);
});

test('a method node means any pattern of that method', () => {
  const d = detector({ combinations: [{ id: 'c1', when: { all: [{ method: 'url' }, { method: 'header' }] } }] });
  assert.strictEqual(C.score(d, [m('url', 'url-1', 40), m('header', 'header-1', 10)]).confidence, 40);
  assert.strictEqual(C.score(d, [m('url', 'url-1', 40)]).detected, false);
});

test('at least N of', () => {
  const d = detector({ combinations: [{ id: 'c1', when: { atLeast: 2, of: [{ pattern: 'url-1' }, { pattern: 'cookie-1' }, { pattern: 'header-1' }] } }] });
  assert.strictEqual(C.score(d, [m('cookie', 'cookie-1', 30)]).detected, false);
  assert.strictEqual(C.score(d, [m('cookie', 'cookie-1', 30), m('header', 'header-1', 10)]).confidence, 30);
});

test('a combination that is only NOT, or an empty group, never fires', () => {
  const d = detector({ combinations: [
    { id: 'c1', when: { not: { pattern: 'header-1' } } },
    { id: 'c2', when: { all: [] } },
    { id: 'c3', when: { all: [{ not: { pattern: 'url-1' } }] } }
  ] });
  assert.strictEqual(C.score(d, []).detected, false);
});

test('hook and window matches without a patternId are traced back by their key', () => {
  const d = detector({ combinations: [{ id: 'c1', when: { all: [{ pattern: 'js_hooks-1' }, { pattern: 'url-1' }] } }] });
  const hook = { type: 'js_hooks', pattern: 'navigator.webdriver', confidence: 50 };
  assert.strictEqual(C.score(d, [hook, m('url', 'url-1', 40)]).confidence, 50);
});

test('rescore marks the detection and drops it when it no longer holds', () => {
  const d = detector({ combinations: [{ id: 'c1', name: 'n', when: { all: [{ pattern: 'url-1' }, { pattern: 'cookie-1' }] } }] });
  const detection = { detected: false, partial: true, confidence: 0, matches: [m('url', 'url-1', 40), m('cookie', 'cookie-1', 30)] };
  assert.strictEqual(C.rescore(d, detection), true);
  assert.strictEqual(detection.confidence, 40);
  assert.strictEqual(detection.partial, undefined);
  const lone = { detected: true, confidence: 40, matches: [m('url', 'url-1', 40)] };
  assert.strictEqual(C.rescore(d, lone), false);
});

test('dropPattern removes references to a deleted pattern', () => {
  const node = { all: [{ pattern: 'url-1' }, { not: { pattern: 'header-1' } }, { any: [{ pattern: 'header-1' }, { method: 'cookie' }] }] };
  assert.deepStrictEqual(C.dropPattern(node, 'header-1'), { all: [{ pattern: 'url-1' }, { any: [{ method: 'cookie' }] }] });
  const refs = C.references(node);
  assert.deepStrictEqual([...refs.patterns].sort(), ['header-1', 'url-1']);
  assert.deepStrictEqual([...refs.methods], ['cookie']);
});

test('an OR branch that is only NOT never fires on its own', () => {
  const d = detector({ combinations: [{ id: 'c1', when: { any: [{ pattern: 'url-1' }, { not: { pattern: 'header-1' } }] } }] });
  assert.strictEqual(C.score(d, []).detected, false);
  assert.strictEqual(C.score(d, [m('url', 'url-1', 40)]).confidence, 40);
  assert.strictEqual(C.everyBranchPositive({ any: [{ pattern: 'url-1' }, { not: { pattern: 'header-1' } }] }), false);
  assert.strictEqual(C.everyBranchPositive({ any: [{ pattern: 'url-1' }, { all: [{ method: 'cookie' }, { not: { pattern: 'header-1' } }] }] }), true);
});

test('a combination scores the highest confidence of the patterns that made it true', () => {
  const d = detector({ combinations: [{ id: 'c1', name: 'akamai', when: { any: [
    { all: [{ pattern: 'url-2' }, { pattern: 'cookie-1' }] },
    { pattern: 'cookie-2' }
  ] } }] });
  // Only the cookie-2 branch holds: 20, not url-2's 90 (that branch failed)
  assert.strictEqual(C.score(d, [m('cookie', 'cookie-2', 20), m('url', 'url-2', 90)]).combinations[0].confidence, 20);
  // Both branches hold: the best pattern among them wins
  const both = C.score(d, [m('url', 'url-2', 90), m('cookie', 'cookie-1', 30), m('cookie', 'cookie-2', 20)]);
  assert.strictEqual(both.combinations[0].confidence, 90);
});

test("a pattern's own confidence is used, and NOT rows add nothing", () => {
  const d = detector({ combinations: [{ id: 'c1', when: { all: [{ pattern: 'cookie-1' }, { not: { pattern: 'header-1' } }] } }] });
  // the match reports 99 but the cookie-1 pattern is set to 30 in its settings
  const r = C.score(d, [m('cookie', 'cookie-1', 99)]);
  assert.strictEqual(r.combinations[0].confidence, 30);
});

test("a combination's own confidence overrides the patterns' score", () => {
  const d = detector({ combinations: [{ id: 'c1', confidence: 95, when: { all: [{ pattern: 'cookie-1' }] } }] });
  assert.strictEqual(C.score(d, [m('cookie', 'cookie-1', 30)]).confidence, 95);
  const none = detector({ combinations: [{ id: 'c1', when: { all: [{ pattern: 'cookie-1' }] } }] });
  assert.strictEqual(C.score(none, [m('cookie', 'cookie-1', 30)]).confidence, 30);
});

test('describe() renders the rule as one line of text', () => {
  const d = detector({ combinations: [] });
  const text = C.describe(d, { any: [{ all: [{ pattern: 'url-2' }, { not: { pattern: 'cookie-1' } }] }, { method: 'header' }] });
  assert.match(text, /^\(url .+ AND NOT cookie .+\) OR Any header pattern$/);
});

test("matches that made a combination fire show the combination's confidence", () => {
  const d = detector({ combinations: [{ id: 'c1', confidence: 100, when: { all: [{ pattern: 'cookie-1' }, { not: { pattern: 'header-1' } }] } }] });
  const r = C.score(d, [m('cookie', 'cookie-1', 50), m('url', 'url-2', 40)]);
  assert.strictEqual(r.confidence, 100);
  assert.strictEqual(r.matches[0].confidence, 100);
  assert.strictEqual(r.matches[0].baseConfidence, 50);
  assert.strictEqual(r.matches[1].confidence, 40); // not part of the combination
  // Rescoring again (e.g. after more hooks arrive) starts from the base value
  const again = C.score(d, r.matches);
  assert.strictEqual(again.matches[0].confidence, 100);
  assert.strictEqual(again.matches[0].baseConfidence, 50);
  // Once the combination no longer holds the match drops back to its own value
  const broken = C.score(d, [...r.matches, m('header', 'header-1', 10)]);
  assert.strictEqual(broken.matches[0].confidence, 50);
  assert.strictEqual(broken.matches[0].baseConfidence, undefined);
});
