const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('Settings buttons look inert while disabled: no hover highlight, dimmed', () => {
  const settings = css('sections/settings/settings.css');
  assert.match(settings, /#settingsModal \.action-btn:hover:not\(:disabled\)\s*\{/);
  assert.match(settings, /#settingsModal \.action-btn:disabled\s*\{[^}]*opacity/);
  assert.doesNotMatch(settings, /#settingsModal \.action-btn:hover\s*\{/);
});

test('right-to-left: the capture search icon, its padding and the duplicate-info list use logical sides', () => {
  const panels = css('sections/advanced/styles/panels.css');
  const icon = panels.match(/\.cap-search svg\s*\{[^}]*\}/)[0];
  assert.match(icon, /inset-inline-start/);
  assert.doesNotMatch(icon, /(^|[\s;])left:/);
  assert.match(panels.match(/\.cap-search-input\s*\{[^}]*\}/)[0], /padding-inline:\s*30px 10px/);
  const settings = css('sections/settings/settings.css');
  const list = settings.match(/\.duplicate-info-box ul\s*\{[^}]*\}/)[0];
  assert.match(list, /padding-inline-start/);
  assert.doesNotMatch(list, /padding-left/);
});
