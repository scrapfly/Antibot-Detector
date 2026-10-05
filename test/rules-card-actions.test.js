const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FormatUtils = require('../utils/format-utils.js');

const source = fs.readFileSync(path.join(__dirname, '../sections/rules/rules-display.js'), 'utf8');

function render({ enabled = true, label = 'Editar', detectorName = 'detect-example' } = {}) {
  const list = { innerHTML: '', querySelectorAll: () => [] };
  function Rules() {}
  vm.runInNewContext(source, {
    Rules,
    FormatUtils,
    document: { querySelector: () => list },
    I18n: { get: key => key === 'ruleModalActionEdit' ? label : '' }
  });
  const instance = new Rules();
  instance.categoryManager = { getCategoryInfo: () => ({ colour: '#3b82f6' }) };
  instance.getDetectorIcon = () => '';
  instance.getDetectionMethods = () => '';
  instance.formatLastUpdated = () => '2026-10-03';
  instance.getCategoryLabel = () => 'Captcha';
  let wired;
  instance.setupDetectorCardListeners = detectors => { wired = detectors; };
  const detectors = [{ category: 'captcha', detectorName, detector: {
    displayName: 'Example', enabled, author: 'Scrapfly', version: '1.1.0'
  } }];
  instance.renderDetectorsPage(detectors);
  return { markup: list.innerHTML, wired, detectors,
    button: list.innerHTML.match(/<button\b[^>]*class="edit-btn"[^>]*>[\s\S]*?<\/button>/)?.[0] };
}

test('rule edit action keeps a translated accessible name and non-submit semantics', () => {
  const { button, wired, detectors } = render();
  assert.ok(button);
  assert.match(button, /type="button"/);
  assert.match(button, /title="Editar"/);
  assert.match(button, /aria-label="Editar"/);
  assert.match(button, /data-detector-id="detect-example"/);
  assert.match(button, /data-category="captcha"/);
  assert.equal(wired, detectors);
});

test('rule edit action uses a decorative outline pencil with rounded strokes', () => {
  const { button } = render();
  assert.match(button, /<svg width="16" height="16"/);
  assert.match(button, /fill="none" stroke="currentColor"/);
  assert.match(button, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(button, /aria-hidden="true" focusable="false"/);
  assert.equal((button.match(/<path /g) || []).length, 2);
});

test('disabled detector cards remain editable and translated labels and ids stay escaped', () => {
  const { markup, button } = render({ enabled: false, label: 'Edit "rule"', detectorName: 'detect-"unsafe"' });
  assert.match(markup, /detector-disabled/);
  assert.doesNotMatch(button, /\sdisabled(?:\s|=|>)/);
  assert.match(button, /aria-label="Edit &quot;rule&quot;"/);
  assert.match(button, /data-detector-id="detect-&quot;unsafe&quot;"/);
});
