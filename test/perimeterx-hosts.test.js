const { test } = require('node:test');
const assert = require('node:assert');
const detector = require('../detectors/antibot/detect-perimeterx.json');

// HUMAN serves PerimeterX from px-cloud.net / perimeterx.net and, for some
// customers, from hsprotect.net (seen live on signup.live.com, 2026-10-07)
const rule = (id) => new RegExp(detector.detection.url.find(r => r.id === id).text, 'i');

test('PerimeterX client and collector rules cover every HUMAN host', () => {
  for (const host of ['px-cloud.net', 'perimeterx.net', 'hsprotect.net']) {
    assert.ok(rule('px-client-script').test(`https://client.${host}/PXzC5j78di/main.min.js`), `client on ${host}`);
    assert.ok(rule('px-collector').test(`https://collector-pxzc5j78di.${host}/api/v2/msft`), `collector on ${host}`);
  }
  assert.ok(!rule('px-client-script').test('https://client.hsprotect.net.evil.test/PXzC5j78di/main.min.js'));
  assert.ok(!rule('px-collector').test('https://collector-pxzc5j78di.nothsprotect.net/'));
});
