const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Detection → Share: a custom upload server must be https on a public host. An address saved by an older
// version, when the check was looser, must not block an unrelated Save, an import or a restore: only an address that is
// being written or chosen is checked, as the webhook address is.
const root = path.join(__dirname, '..');
function load() {
  const ctx = { console, URL, SettingsUI: {}, SettingsRuntime: {}, ShareProviders: require('../sections/detection/share-providers.js'), self: undefined };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/settings/settings-runtime.js'), 'utf8').replace(/^const SettingsRuntime = .*$/m, ''), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui-share.js'), 'utf8'), ctx);
  return ctx.SettingsUI;
}
const text = (key, fallback) => fallback;
const custom = (customUrl, extra = {}) => ({ provider: 'custom', customUrl, customBodyFormat: 'text', customJsonTemplate: '{}', ...extra });

test('a saved custom upload address that the current check refuses does not block anything until it is touched', () => {
  const SettingsUI = load();
  const old = 'https://paste.corp.internal/api';
  assert.ok(SettingsUI.validateShareSettings(custom(old), text).length > 0, 'written now: refused');
  assert.ok(SettingsUI.validateShareSettings(custom(old), text, undefined).length > 0, 'no saved settings to compare: refused');
  assert.equal(SettingsUI.validateShareSettings(custom(old), text, custom(old)).length, 0, 'saved that way: an unrelated Save, import or restore goes through');
  assert.ok(SettingsUI.validateShareSettings(custom('https://other.corp.internal/x'), text, custom(old)).length > 0, 'a changed address is checked');
  assert.ok(SettingsUI.validateShareSettings(custom(old), text, { provider: 'pastebin', customUrl: old }).length > 0, 'choosing the custom server checks its saved address');
  assert.equal(SettingsUI.validateShareSettings(custom('https://paste.example.com/api'), text).length, 0, 'a public https address is fine');
});
