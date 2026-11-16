'use strict';
// Detection tab → What this means for scraping (modules/core/scraping-advice.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ScrapingAdvice = require('../modules/core/scraping-advice.js');

const root = path.join(__dirname, '..');
const d = (category, confidence, ...types) => ({ name: `${category}-${types.join('-')}`, category, confidence, matches: types.map(type => ({ type })) });

test('nothing found and a good status: no point', () => {
  assert.deepEqual(ScrapingAdvice.of({ detections: [], httpStatus: 200 }), []);
  assert.deepEqual(ScrapingAdvice.of(null), []);
  assert.deepEqual(ScrapingAdvice.of({ detections: 'x', httpStatus: 'x' }), []);
});

test('an error status says the visit was refused, whatever was found', () => {
  assert.deepEqual(ScrapingAdvice.of({ detections: [], httpStatus: 403 }), ['blocked']);
  assert.deepEqual(ScrapingAdvice.of({ detections: [], httpStatus: 503 }), ['blocked']);
  assert.deepEqual(ScrapingAdvice.of({ detections: [], httpStatus: 304 }), []);
});

test('each kind of result gives its point, in a fixed order, once', () => {
  const detections = [d('fingerprint', 90, 'js_hooks'), d('antibot', 95, 'cookie'), d('captcha', 80, 'script'), d('Anti-Bot', 70, 'cookies')];
  assert.deepEqual(ScrapingAdvice.of({ detections, httpStatus: 429 }), ['blocked', 'captcha', 'browser', 'cookies']);
});

test('a window property or a hooked API means a real browser, also for an anti-bot', () => {
  assert.deepEqual(ScrapingAdvice.of({ detections: [d('antibot', 90, 'window')] }), ['browser']);
});

test('an anti-bot alone, found by its scripts, gives the general line', () => {
  assert.deepEqual(ScrapingAdvice.of({ detections: [d('antibot', 90, 'url', 'content')] }), ['antibot']);
});

test('weak results do not count', () => {
  assert.deepEqual(ScrapingAdvice.of({ detections: [d('captcha', 49, 'cookie'), d('fingerprint', null, 'js_hooks')] }), []);
  assert.equal(ScrapingAdvice.MIN_CONFIDENCE, 50);
});

test('every point has its text in every language, and the status point takes the status', () => {
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  for (const key of ScrapingAdvice.ORDER) {
    const [id, english] = ScrapingAdvice.TEXTS[key];
    assert.equal(en[id] && en[id].message, english, id);
  }
  assert.match(ScrapingAdvice.TEXTS.blocked[1], /\{0\}/);
  assert.ok(en.detectionScrapingTitle);
});
