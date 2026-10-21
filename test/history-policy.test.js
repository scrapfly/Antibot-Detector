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

// ---- Pages that pin themselves

const hard = (name, confidence = 90, category = 'Anti-Bot') => ({ ...det(name, category, confidence), difficulty: 'High' });

test('nothing pins itself until a rule is on', () => {
  assert.strictEqual(P.shouldAutoPin([hard('Akamai')], undefined), false);
  assert.strictEqual(P.shouldAutoPin([hard('Akamai')], {}), false);
  assert.strictEqual(P.shouldAutoPin([hard('Akamai')], { historyAutoPinHard: false, historyAutoPinVendors: [] }), false);
  assert.strictEqual(P.shouldAutoPin([], { historyAutoPinHard: true }), false);
  assert.strictEqual(P.shouldAutoPin(null, { historyAutoPinHard: true }), false);
});

test('"hard protection": a High difficulty anti-bot or CAPTCHA pins, anything else does not', () => {
  const on = { historyAutoPinHard: true };
  assert.strictEqual(P.shouldAutoPin([hard('Akamai')], on), true);
  assert.strictEqual(P.shouldAutoPin([hard('reCAPTCHA', 90, 'CAPTCHA')], on), true);
  assert.strictEqual(P.shouldAutoPin([{ ...antibot('Easy'), difficulty: 'Medium' }], on), false);
  assert.strictEqual(P.shouldAutoPin([antibot('No difficulty')], on), false);
  assert.strictEqual(P.shouldAutoPin([{ ...fingerprint('Canvas', 95), difficulty: 'High' }], on), false, 'fingerprinting never pins by difficulty');
  assert.strictEqual(P.shouldAutoPin([fingerprint('Canvas'), hard('Akamai')], on), true, 'one hard protection is enough');
});

test('the difficulty is read from the detection or from its detector, in any case', () => {
  const on = { historyAutoPinHard: true };
  assert.strictEqual(P.shouldAutoPin([{ detector: { name: 'A', difficulty: 'HIGH' }, category: 'Anti-Bot', confidence: 90 }], on), true);
  assert.strictEqual(P.shouldAutoPin([{ detector: { name: 'A' }, category: 'Anti-Bot', difficulty: 'high', confidence: 90 }], on), true);
  assert.strictEqual(P.shouldAutoPin([{ detector: { name: 'A', difficulty: 'Low' }, category: 'Anti-Bot', difficulty: 'High', confidence: 90 }], on), true, 'the detection wins');
});

test('the detection must reach the minimum confidence: 80 unless the person chose another', () => {
  const on = { historyAutoPinHard: true };
  assert.strictEqual(P.shouldAutoPin([hard('A', 79)], on), false);
  assert.strictEqual(P.shouldAutoPin([hard('A', 80)], on), true);
  assert.strictEqual(P.shouldAutoPin([hard('A', 90)], { ...on, historyAutoPinMinConfidence: 95 }), false);
  assert.strictEqual(P.shouldAutoPin([hard('A', 30)], { ...on, historyAutoPinMinConfidence: 0 }), true);
  assert.strictEqual(P.shouldAutoPin([hard('A', 99)], { ...on, historyAutoPinMinConfidence: 500 }), false, 'clamped to 100');
  assert.strictEqual(P.shouldAutoPin([hard('A', 100)], { ...on, historyAutoPinMinConfidence: 500 }), true);
  assert.strictEqual(P.shouldAutoPin([hard('A', 99)], { ...on, historyAutoPinMinConfidence: 'x' }), true, 'junk is the default');
  assert.strictEqual(P.shouldAutoPin([{ ...hard('A'), confidence: undefined }], { ...on, historyAutoPinMinConfidence: 0 }), false, 'a detection with no score never pins');
  assert.strictEqual(P.AUTO_PIN_MIN_CONFIDENCE, 80);
});

test('"these protections": the names the person gave, case and spaces aside, in any category', () => {
  const named = { historyAutoPinVendors: ['  cloudflare ', 'Canvas Fingerprint', '', 42] };
  assert.strictEqual(P.shouldAutoPin([antibot('Cloudflare')], named), true);
  assert.strictEqual(P.shouldAutoPin([antibot('CLOUDFLARE')], named), true);
  assert.strictEqual(P.shouldAutoPin([fingerprint('Canvas Fingerprint', 85)], named), true, 'a fingerprinting detector pins when it is named');
  assert.strictEqual(P.shouldAutoPin([antibot('Cloudflare Bot Management')], named), false, 'whole names only');
  assert.strictEqual(P.shouldAutoPin([antibot('Cloudflare', 50)], named), false, 'and the confidence still counts');
  assert.strictEqual(P.shouldAutoPin([antibot('Akamai')], named), false);
  assert.strictEqual(P.shouldAutoPin([{ name: 'Cloudflare', category: 'Anti-Bot', confidence: 90 }], named), true, 'a name on the detection itself');
  assert.strictEqual(P.shouldAutoPin([antibot('Akamai')], { historyAutoPinVendors: 'Akamai' }), false, 'a list is a list');
});

test('both rules can be on: either one pins', () => {
  const both = { historyAutoPinHard: true, historyAutoPinVendors: ['DataDome'] };
  assert.strictEqual(P.shouldAutoPin([hard('Akamai')], both), true);
  assert.strictEqual(P.shouldAutoPin([antibot('DataDome')], both), true);
  assert.strictEqual(P.shouldAutoPin([antibot('Other')], both), false);
});

test('the pages that pinned themselves are counted apart from the ones the person pinned, and are capped', () => {
  const items = [{ pinned: true, autoPinned: true }, { pinned: true }, { autoPinned: true }, { pinned: false, autoPinned: true }, null, { pinned: true, autoPinned: true }];
  assert.strictEqual(P.countAutoPins(items), 2);
  assert.strictEqual(P.countAutoPins(undefined), 0);
  assert.strictEqual(P.MAX_AUTO_PINS, 50);
});

test('the default settings agree with the policy', () => {
  const fs = require('node:fs');
  const history = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../sections/settings/default-settings.json'), 'utf8')).settings.history;
  assert.strictEqual(history.historyAutoPinHard, false);
  assert.deepStrictEqual(history.historyAutoPinVendors, []);
  assert.strictEqual(history.historyAutoPinMinConfidence, P.AUTO_PIN_MIN_CONFIDENCE);
  assert.strictEqual(history.historyFingerprintDays, 0);
});

// ---- The watchlist

test('the watchlist is daily or weekly; anything else is off', () => {
  assert.deepStrictEqual([...P.WATCH_MODES], ['off', 'daily', 'weekly']);
  for (const mode of ['daily', 'weekly']) assert.strictEqual(P.watchModeOf({ historyWatch: mode }), mode);
  for (const junk of [undefined, null, {}, { historyWatch: 'hourly' }, { historyWatch: 'DAILY' }, { historyWatch: 5 }, { historyWatch: 'off' }]) assert.strictEqual(P.watchModeOf(junk), 'off');
});

test('the pages that are watched: pinned and marked, the one checked longest ago first, at most ten', () => {
  const page = (id, extra = {}) => ({ id, url: `https://${id}.example/`, pinned: true, watch: true, ...extra });
  const items = [
    page('checked-late', { watchedAt: 900 }), page('never-checked'), page('checked-early', { watchedAt: 100 }),
    page('not-pinned', { pinned: false }), page('not-marked', { watch: false }), page('no-address', { url: '' }), null, { id: 'x' }
  ];
  assert.deepStrictEqual(P.watchedOf(items).map(i => i.id), ['never-checked', 'checked-early', 'checked-late']);
  const many = Array.from({ length: 14 }, (_, i) => page(`p${i}`, { watchedAt: 1000 - i }));
  const chosen = P.watchedOf(many);
  assert.strictEqual(chosen.length, P.MAX_WATCHED);
  assert.strictEqual(P.MAX_WATCHED, 10);
  assert.deepStrictEqual(chosen.map(i => i.id), many.slice(4).reverse().map(i => i.id), 'the ten checked longest ago');
  assert.deepStrictEqual(P.watchedOf(undefined), []);
});
