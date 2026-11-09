'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { oneLine } = require('../modules/core/detection-summary.js');

test('host, then each protection with its confidence', () => {
  assert.strictEqual(oneLine({ host: 'shop.example', detections: [{ name: 'Cloudflare', confidence: 94.6 }, { name: 'reCAPTCHA', confidence: 70 }] }),
    'shop.example: Cloudflare 95%, reCAPTCHA 70%');
});

test('the Copy menu\'s one line and History\'s sort are wired in the pages that use them', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('sections/detection/detection-actions.js'), /kind === 'oneline'\s*\? DetectionSummary\.oneLine\(payload\)/);
  assert.match(read('sections/history/history.js'), /HistorySort\.sort\(shown, this\.sortKey\)/);
  const html = read('sections/history/history.html');
  const values = [...html.match(/<select id="historySort"[\s\S]*?<\/select>/)[0].matchAll(/value="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(values, require('../modules/core/history-sort.js').KEYS);
});

test('nothing found, no confidence, a line break in a name and a missing host', () => {
  assert.strictEqual(oneLine({ host: 'a.example', detections: [] }), 'a.example: -');
  assert.strictEqual(oneLine({ host: 'a.example', detections: [{ name: 'Foo\nBar' }] }), 'a.example: Foo Bar');
  assert.strictEqual(oneLine({ url: 'https://b.example/', detections: [null, {}] }), 'https://b.example/: ?');
  assert.strictEqual(oneLine(null), '?: -');
});
