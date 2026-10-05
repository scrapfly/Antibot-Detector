const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The service worker has no page bootstrap: I18n.syncOverrideFromStorage()
// loads the chosen language and follows later changes, and I18n.locale()
// reports it as a BCP 47 tag.

const root = path.join(__dirname, '..');
const locale = (l) => JSON.parse(fs.readFileSync(path.join(root, '_locales', l, 'messages.json'), 'utf8'));

function load(stored) {
  const listeners = [];
  const context = vm.createContext({
    console, Promise, String, Object, Array, JSON,
    fetch: async (url) => {
      const l = /_locales\/([^/]+)\//.exec(url)[1];
      return { ok: true, json: async () => locale(l) };
    },
    chrome: {
      runtime: { getURL: (p) => p },
      i18n: { getMessage: (k) => (locale('en')[k] || {}).message || '', getUILanguage: () => 'en-US' },
      storage: {
        local: { get: async () => ({ scrapfly_language_override: stored }) },
        onChanged: { addListener: (fn) => listeners.push(fn) }
      }
    }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/i18n.js'), 'utf8'), context);
  return { I18n: context.I18n, change: (v) => listeners.forEach(fn => fn({ scrapfly_language_override: { newValue: v } }, 'local')) };
}

test('the worker loads the stored language and follows changes', async () => {
  const { I18n, change } = load('es');
  await I18n.syncOverrideFromStorage();
  assert.strictEqual(I18n.get('btnCancel'), 'Cancelar');
  assert.strictEqual(I18n.locale(), 'es');
  change('zh_CN');
  await I18n.ready();
  assert.strictEqual(I18n.locale(), 'zh-CN');
  assert.strictEqual(I18n.get('btnCancel'), locale('zh_CN').btnCancel.message);
  change('auto');
  await I18n.ready();
  assert.strictEqual(I18n.locale(), 'en-US');
  assert.strictEqual(I18n.get('btnCancel'), 'Cancel');
});

test('no stored choice follows the browser language', async () => {
  const { I18n } = load(undefined);
  await I18n.syncOverrideFromStorage();
  assert.strictEqual(I18n.locale(), 'en-US');
  assert.strictEqual(I18n.get('btnCancel'), 'Cancel');
});
