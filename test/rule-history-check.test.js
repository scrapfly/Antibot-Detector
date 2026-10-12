const { test } = require('node:test');
const assert = require('node:assert');

// Rule editor → Check against History: each pattern and combination of the
// rule as edited, counted over the evidence History saved.

global.self = global;
const C = require('../modules/detection/detection-combinations.js');
const R = require('../sections/rules/rule-history-check.js');

const cf = (extra = []) => ({ name: 'Cloudflare', detector: { id: 'detect-cloudflare', name: 'Cloudflare' }, category: 'antibot',
  matches: [{ type: 'cookie', value: 'cf_clearance=SECRET' }, { type: 'header', value: 'server: cloudflare' },
    { type: 'url', fullUrl: 'https://a.com/cdn-cgi/challenge-platform/h/b' }, ...extra] });
const items = [
  { url: 'https://a.com', detections: [cf()] },
  { url: 'https://b.com', detections: [cf([{ type: 'dom', value: 'input[name="cf-turnstile-response"]=x' }])] },
  // Another rule found this one; its evidence still counts as "other pages"
  { url: 'https://c.com', detections: [{ name: 'Other', detector: { id: 'detect-other' }, matches: [{ type: 'cookie', value: 'cf_clearance=1' }] }] },
  { url: 'https://d.com', detections: [] }
];
const rule = {
  id: 'detect-cloudflare', name: 'Cloudflare',
  detection: {
    cookie: [{ id: 'clearance', name: 'cf_clear', description: 'Clearance cookie' }],
    header: [{ id: 'server', name: 'Server', value: 'cloudflare' }],
    url: [{ id: 'cdn', text: '/cdn-cgi/' }, { id: 'nope', text: 'never-here' }],
    dom: [{ id: 'turnstile', selector: 'input[name="cf-turnstile-response"]' }],
    content: [{ id: 'empty', text: '' }]
  },
  combinations: [
    { id: 'c1', name: 'Cookie and turnstile', when: { all: [{ pattern: 'clearance' }, { pattern: 'turnstile' }] } },
    { id: 'c2', when: { all: [{ pattern: 'nope' }, { pattern: 'server' }] } }
  ]
};

test('patterns count the pages where the rule fired, and other pages with the same evidence', () => {
  const r = R.check(rule, items, C);
  assert.strictEqual(r.pages, 4);
  assert.strictEqual(r.rulePages, 2);
  const by = Object.fromEntries(r.patterns.map(p => [p.id, [p.rulePages, p.otherPages]]));
  assert.deepStrictEqual(by, { clearance: [2, 1], server: [2, 0], cdn: [2, 0], nope: [0, 0], turnstile: [1, 0] }, 'empty patterns are skipped');
  assert.strictEqual(r.patterns.find(p => p.id === 'clearance').description, 'Clearance cookie');
  assert.deepStrictEqual(r.combinations.map(c => [c.id, c.pages, c.rulePages]), [['c1', 1, 1], ['c2', 0, 0]]);
  assert.ok(!JSON.stringify(r).includes('SECRET'), 'no matched values are returned');
});

test('matching follows the editor switches: cookie prefix, header name and value, regex, case', () => {
  const m = (method, pattern, match) => R.patternMatches(method, pattern, match);
  assert.ok(m('cookie', { name: 'cf_chl' }, { type: 'cookie', value: 'cf_chl_rc_m=1' }), 'a plain cookie name is a prefix');
  assert.ok(!m('cookie', { name: 'cf_chl', nameCaseSensitive: true }, { type: 'cookie', value: 'CF_CHL=1' }));
  assert.ok(m('cookie', { name: '^__cf_bm$', nameRegex: true }, { type: 'cookie', value: '__cf_bm=x' }));
  assert.ok(!m('header', { name: 'server', value: 'nginx' }, { type: 'header', value: 'Server: cloudflare' }));
  assert.ok(m('url', { text: 'CHALLENGES' }, { type: 'url', fullUrl: 'https://challenges.cloudflare.com/x' }), 'case-insensitive by default');
  assert.ok(!m('url', { text: '[bad', textRegex: true }, { type: 'url', fullUrl: 'x' }), 'a broken regex never matches');
  assert.ok(m('js_hooks', { target: 'HTMLCanvasElement.prototype.toDataURL' }, { type: 'js_hooks', value: 'HTMLCanvasElement.prototype.toDataURL' }));
  assert.ok(m('window', { path: 'turnstile' }, { type: 'window', value: 'turnstile.render' }));
  assert.ok(!m('cookie', { name: 'a' }, { type: 'header', value: 'a: b' }), 'methods never cross');
  assert.strictEqual(R.domSelector('input[name="x=y"]=text=more'), 'input[name="x=y"]');
});

test('stored History in any of its shapes', () => {
  assert.strictEqual(R.parseHistory(JSON.stringify({ items })).length, 4);
  assert.strictEqual(R.parseHistory(items).length, 4);
  assert.deepStrictEqual(R.parseHistory('nope'), []);
});
