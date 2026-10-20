const { test } = require('node:test');
const assert = require('node:assert');

global.self = global;
const F = require('../modules/core/webhook-filter.js');
const L = require('../modules/core/webhook-log.js');

const det = (name, category, confidence) => ({ detector: { name }, category, confidence });
const page = [det('Cloudflare', 'Anti-Bot', 95), det('hCaptcha', 'CAPTCHA', 60), det('Canvas', 'Fingerprint', 30)];

test('the default filter sends every page that has a detection', () => {
  assert.deepStrictEqual(F.evaluate(page, 'shop.example', F.DEFAULTS), { send: true });
  assert.deepStrictEqual(F.evaluate(page, 'shop.example'), { send: true });
  assert.deepStrictEqual(F.evaluate([det('Canvas', 'Fingerprint', 5)], 'a.example', {}), { send: true });
});

test('minimum confidence looks at the strongest detection', () => {
  assert.deepStrictEqual(F.evaluate(page, 'a.example', { minConfidence: 95 }), { send: true });
  assert.deepStrictEqual(F.evaluate(page, 'a.example', { minConfidence: 96 }), { send: false, reason: 'confidence' });
  assert.deepStrictEqual(F.evaluate([det('x', 'CAPTCHA', 40), det('y', 'CAPTCHA', 55)], 'a.example', { minConfidence: 50 }), { send: true });
  assert.deepStrictEqual(F.evaluate([{ detector: { name: 'x' }, category: 'CAPTCHA' }], 'a.example', { minConfidence: 1 }), { send: false, reason: 'confidence' }, 'a detection with no score counts as 0');
});

test('categories mean "any of these", and an empty list means any', () => {
  assert.deepStrictEqual(F.evaluate(page, 'a.example', { categories: ['captcha'] }), { send: true });
  assert.deepStrictEqual(F.evaluate([det('Canvas', 'Fingerprint', 30)], 'a.example', { categories: ['antibot', 'captcha'] }), { send: false, reason: 'category' });
  assert.deepStrictEqual(F.evaluate([det('Canvas', 'Fingerprint', 30)], 'a.example', { categories: ['fingerprint'] }), { send: true });
  assert.deepStrictEqual(F.evaluate([det('x', 'WAF', 90)], 'a.example', { categories: ['antibot'] }), { send: true }, 'a WAF counts as anti-bot, like everywhere');
  assert.deepStrictEqual(F.evaluate([], 'a.example', { categories: ['antibot'] }), { send: false, reason: 'category' });
});

test('the confidence is the strongest one of the categories that were asked for', () => {
  // Anti-bot 95 would pass 90, but only CAPTCHA (60) was asked for
  assert.deepStrictEqual(F.evaluate(page, 'a.example', { categories: ['captcha'], minConfidence: 90 }), { send: false, reason: 'confidence' });
  assert.deepStrictEqual(F.evaluate(page, 'a.example', { categories: ['captcha', 'antibot'], minConfidence: 90 }), { send: true });
});

test('sites mean the site and its subdomains, and an empty list means every site', () => {
  const filter = { domains: ['shop.example', 'https://www.bank.example/x'] };
  assert.deepStrictEqual(F.evaluate(page, 'shop.example', filter), { send: true });
  assert.deepStrictEqual(F.evaluate(page, 'a.b.shop.example', filter), { send: true });
  assert.deepStrictEqual(F.evaluate(page, 'bank.example', filter), { send: false, reason: 'site' });
  assert.deepStrictEqual(F.evaluate(page, 'notshop.example', filter), { send: false, reason: 'site' });
  assert.deepStrictEqual(F.evaluate(page, '', filter), { send: false, reason: 'site' });
  assert.deepStrictEqual(F.evaluate(page, 'anything.example', { domains: [] }), { send: true });
});

test('the site is checked first, then the category, then the confidence', () => {
  const filter = { domains: ['a.example'], categories: ['antibot'], minConfidence: 99 };
  assert.strictEqual(F.evaluate(page, 'b.example', filter).reason, 'site');
  assert.strictEqual(F.evaluate([det('c', 'Fingerprint', 99)], 'a.example', filter).reason, 'category');
  assert.strictEqual(F.evaluate(page, 'a.example', filter).reason, 'confidence');
  assert.strictEqual(F.evaluate([det('x', 'Anti-Bot', 99)], 'a.example', filter).send, true);
});

test('settingsOf() reads the saved webhook settings and makes each field safe', () => {
  assert.deepStrictEqual(F.settingsOf({}), { minConfidence: 0, categories: [], domains: [] });
  assert.deepStrictEqual(F.settingsOf(undefined), { minConfidence: 0, categories: [], domains: [] });
  assert.deepStrictEqual(F.settingsOf({ webhookMinConfidence: 70, webhookCategories: ['captcha', 'captcha', 'bogus', 'antibot'], webhookDomains: ['Shop.Example', 'https://a.example/x', '<script>'] }),
    { minConfidence: 70, categories: ['captcha', 'antibot'], domains: ['shop.example', 'a.example'] });
  for (const [bad, expected] of [[-5, 0], [250, 100], ['x', 0], [null, 0], [42.6, 43], ['60', 60]]) assert.strictEqual(F.settingsOf({ webhookMinConfidence: bad }).minConfidence, expected, String(bad));
  assert.deepStrictEqual(F.settingsOf({ webhookCategories: 'antibot', webhookDomains: 'a.example' }), { minConfidence: 0, categories: [], domains: [] }, 'a list that is not a list is empty');
});

test('the webhook log keeps known fields only, never an address, and the last twenty entries, newest last', () => {
  const entry = L.clean({ t: 5, page: 'shop.example', outcome: 'sent', trigger: 'cache', status: 200, ms: 120, url: 'https://hooks.example/SYNTHETIC', headers: { a: 1 }, body: 'x', error: 'bogus', reason: 'site' });
  assert.deepStrictEqual(entry, { t: 5, page: 'shop.example', outcome: 'sent', trigger: 'cache', status: 200, reason: 'site', ms: 120 });
  assert.ok(!JSON.stringify(entry).includes('SYNTHETIC'));
  assert.strictEqual(L.clean({ outcome: 'nonsense' }), null);
  assert.strictEqual(L.clean(null), null);
  assert.strictEqual(L.clean({ outcome: 'failed', error: 'network' }).trigger, 'scan', 'an unknown trigger is a scan');
  let log = [];
  for (let i = 0; i < 25; i++) log = L.append(log, { t: i + 1, page: `p${i}.example`, outcome: 'sent', status: 200 });
  assert.strictEqual(log.length, 20);
  assert.deepStrictEqual([log[0].page, log[19].page], ['p5.example', 'p24.example']);
  assert.deepStrictEqual(L.append([{ outcome: 'junk' }, null, 5], { outcome: 'skipped', reason: 'site', page: 'a.example', t: 9 }).map(e => e.outcome), ['skipped']);
  assert.strictEqual(L.append(undefined, { outcome: 'junk' }).length, 0);
  assert.strictEqual(L.clean({ outcome: 'sent', page: 'x'.repeat(400) }).page.length, 253);
});
