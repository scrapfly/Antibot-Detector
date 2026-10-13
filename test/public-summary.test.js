const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../modules/core/bridge-protocol.js');
require('../modules/detection/public-summary.js');

for (const fromCache of [false, true]) {
  test(`page API strips extension-only evidence (${fromCache ? 'cached' : 'fresh'})`, () => {
    const privateValue = 'synthetic-private-evidence';
    const input = {
      url: 'https://example.test/', fromCache, detectionCount: 99,
      detections: [{ detected: true, category: 'antibot', confidence: 95,
        detector: { id: 'probe', name: 'Probe', privateValue },
        detectionMethods: ['cookie'], privateValue,
        matches: [{ type: 'cookie', confidence: 95, patternId: 'cookie-1',
          value: privateValue, cookieValue: privateValue, httpOnly: true, source: privateValue }],
        combinations: [{ id: 'c1', confidence: 95, found: ['cookie-1'], when: { pattern: privateValue } }] }]
    };
    const projected = PublicDetectionSummary.project('onDetection', input);
    assert.ok(!JSON.stringify(projected).includes(privateValue));
    assert.equal(projected.detectionCount, 1);
    assert.equal(projected.fromCache, fromCache);
    assert.equal(projected.detections[0].detector.id, 'probe');
    assert.equal(projected.detections[0].matches[0].patternId, 'cookie-1');
    assert.deepEqual(projected.detections[0].combinations[0].found, ['cookie-1']);
    assert.equal(input.detections[0].matches[0].value, privateValue, 'popup evidence remains intact');
  });
}

test('error and completion events cannot smuggle nested evidence into the page', () => {
  for (const event of ['onError', 'onProgress', 'onHooksComplete', 'onWindowPropsComplete', 'unknown']) {
    const out = PublicDetectionSummary.project(event, { error: 'private', message: 'private',
      uninstallStats: { value: 'private' }, detections: [{ value: 'private' }] });
    assert.ok(!JSON.stringify(out).includes('private'));
  }
});


test('page completion events preserve protocol reasons and reject arbitrary text', () => {
  for (const completionReason of Object.values(ScrapflyBridgeProtocol.COMPLETION_REASONS.HOOKS)) {
    assert.equal(PublicDetectionSummary.project('onHooksComplete', { completionReason }).completionReason, completionReason);
  }
  for (const reason of Object.values(ScrapflyBridgeProtocol.COMPLETION_REASONS.WINDOW)) {
    assert.equal(PublicDetectionSummary.project('onWindowPropsComplete', { reason }).reason, reason);
  }
  assert.equal(PublicDetectionSummary.project('onHooksComplete', { completionReason: 'private-value' }).completionReason, undefined);
  assert.equal(PublicDetectionSummary.project('onWindowPropsComplete', { reason: 'private-value' }).reason, undefined);
});
