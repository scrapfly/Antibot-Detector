const { test } = require('node:test');
const assert = require('node:assert');

const P = require('../modules/core/history-policy.js');

const det = (name, category, confidence) => ({ detector: { name }, category, confidence });
const antibot = (name, confidence = 90) => det(name, 'Anti-Bot', confidence);
const captcha = (name, confidence = 90) => det(name, 'CAPTCHA', confidence);
const fingerprint = (name, confidence = 40) => det(name, 'Fingerprint', confidence);

test('normalizeDomains accepts text or arrays and reduces entries to bare hosts', () => {
  assert.deepStrictEqual(
    P.normalizeDomains('Example.com\nhttps://user@Shop.Example.org:8443/path?q=1, *.cdn.net;  .dotted.io. example.com'),
    ['example.com', 'shop.example.org', 'cdn.net', 'dotted.io']
  );
  assert.deepStrictEqual(P.normalizeDomains(['A.com', ' b.com ', '', 'a.com']), ['a.com', 'b.com']);
  assert.deepStrictEqual(P.normalizeDomains('<script>, a$b, ok.dev'), ['ok.dev']);
  assert.deepStrictEqual(P.normalizeDomains(null), []);
  assert.deepStrictEqual(P.normalizeDomains(42), ['42']);
});

test('matchesDomain: the site itself and any subdomain, never a lookalike', () => {
  const list = ['example.com', 'intranet.local'];
  assert.strictEqual(P.matchesDomain('example.com', list), true);
  assert.strictEqual(P.matchesDomain('WWW.Example.com', list), true);
  assert.strictEqual(P.matchesDomain('a.b.example.com.', list), true);
  assert.strictEqual(P.matchesDomain('notexample.com', list), false);
  assert.strictEqual(P.matchesDomain('example.com.evil.io', list), false);
  assert.strictEqual(P.matchesDomain('', list), false);
  assert.strictEqual(P.matchesDomain('example.com', []), false);
  // A raw text list works too
  assert.strictEqual(P.matchesDomain('x.intranet.local', 'intranet.local'), true);
});

test('evaluate: default settings record everything', () => {
  assert.deepStrictEqual(P.evaluate({ detections: [antibot('A')], hostname: 'a.com' }, {}), { save: true });
  assert.deepStrictEqual(P.evaluate({ detections: [] }, undefined), { save: true });
});

test('evaluate: the master switch pauses everything', () => {
  const r = P.evaluate({ detections: [antibot('A')], hostname: 'a.com' }, { historyEnabled: false });
  assert.deepStrictEqual(r, { save: false, reason: 'paused' });
});

test('evaluate: private windows are skipped unless Settings allows them', () => {
  const page = { detections: [antibot('A')], hostname: 'a.com', incognito: true };
  assert.deepStrictEqual(P.evaluate(page, { historySkipIncognito: true }), { save: false, reason: 'incognito' });
  assert.deepStrictEqual(P.evaluate(page, {}), { save: false, reason: 'incognito' }, 'on unless switched off');
  assert.deepStrictEqual(P.evaluate(page, { historySkipIncognito: false }), { save: true });
  assert.deepStrictEqual(P.evaluate({ ...page, incognito: false }, { historySkipIncognito: true }), { save: true });
});

test('evaluate: excluded sites cover subdomains', () => {
  const s = { historyExcludedDomains: ['bank.com'] };
  assert.strictEqual(P.evaluate({ detections: [antibot('A')], hostname: 'login.bank.com' }, s).reason, 'excluded');
  assert.strictEqual(P.evaluate({ detections: [antibot('A')], hostname: 'bank.com.evil.io' }, s).save, true);
});

test('evaluate: fingerprint-only pages can be skipped, mixed pages cannot', () => {
  const s = { historySkipFingerprintOnly: true };
  assert.strictEqual(P.evaluate({ detections: [fingerprint('F1'), fingerprint('F2')] }, s).reason, 'fingerprint-only');
  assert.strictEqual(P.evaluate({ detections: [fingerprint('F1'), antibot('A', 20)] }, s).save, true);
  assert.strictEqual(P.evaluate({ detections: [fingerprint('F1')] }, {}).save, true);
  assert.strictEqual(P.isFingerprintOnly([]), false);
});

test('evaluate: minimum confidence looks at the strongest detection', () => {
  const s = { historyMinConfidence: 70 };
  assert.strictEqual(P.evaluate({ detections: [antibot('A', 50), captcha('C', 60)] }, s).reason, 'low-confidence');
  assert.strictEqual(P.evaluate({ detections: [antibot('A', 50), captcha('C', 70)] }, s).save, true, 'the minimum itself passes');
  assert.strictEqual(P.evaluate({ detections: [antibot('A', 10)] }, { historyMinConfidence: 0 }).save, true);
  assert.strictEqual(P.evaluate({ detections: [antibot('A', 10)] }, { historyMinConfidence: '101' }).reason, 'low-confidence', 'clamped to 100');
  assert.strictEqual(P.evaluate({ detections: [antibot('A', 10)] }, { historyMinConfidence: 'junk' }).save, true);
});

test('evaluate: the reasons are checked in a fixed order', () => {
  const page = { detections: [fingerprint('F', 5)], hostname: 'x.com', incognito: true };
  const all = { historyEnabled: false, historySkipIncognito: true, historyExcludedDomains: ['x.com'], historySkipFingerprintOnly: true, historyMinConfidence: 90 };
  assert.strictEqual(P.evaluate(page, all).reason, 'paused');
  assert.strictEqual(P.evaluate(page, { ...all, historyEnabled: true }).reason, 'incognito');
  assert.strictEqual(P.evaluate(page, { ...all, historyEnabled: true, historySkipIncognito: false }).reason, 'excluded');
  assert.strictEqual(P.evaluate(page, { ...all, historyEnabled: true, historySkipIncognito: false, historyExcludedDomains: [] }).reason, 'fingerprint-only');
});

test('strongest ignores unscored detections', () => {
  assert.strictEqual(P.strongest([{ confidence: 'x' }, { confidence: 55 }, null, {}]), 55);
  assert.strictEqual(P.strongest(undefined), 0);
});

test('diffProtections reports gained and lost anti-bot and CAPTCHA protections, never fingerprinting', () => {
  const before = [antibot('Cloudflare'), captcha('reCAPTCHA'), fingerprint('Canvas')];
  const after = [antibot('cloudflare'), antibot('DataDome'), fingerprint('WebGL')];
  assert.deepStrictEqual(P.diffProtections(before, after), { added: ['DataDome'], removed: ['reCAPTCHA'], changed: true });
});

test('diffProtections: the same protections, in any order or case, are not a change', () => {
  const a = [antibot('Akamai'), captcha('hCaptcha')];
  const b = [captcha('HCAPTCHA'), antibot('akamai')];
  assert.deepStrictEqual(P.diffProtections(a, b), { added: [], removed: [], changed: false });
  assert.deepStrictEqual(P.diffProtections(undefined, undefined), { added: [], removed: [], changed: false });
});

test('diffProtections reads names from either detection shape', () => {
  const r = P.diffProtections([{ name: 'Imperva', category: 'antibot' }], [{ detector: { name: 'Kasada', category: 'antibot' } }]);
  assert.deepStrictEqual(r, { added: ['Kasada'], removed: ['Imperva'], changed: true });
});
