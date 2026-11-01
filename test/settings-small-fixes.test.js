const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Small Settings behaviours: the webhook's custom method, the "notifications on" answer that follows a save, and the log
// counter that only runs while Settings is open.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

class Field {
  constructor(value = '') { this.value = value; this.handlers = {}; this.style = {}; this.focused = false; this.checked = false; }
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  focus() { this.focused = true; }
  closest() { return null; }
  fire(type, target = this) { for (const handler of this.handlers[type] || []) handler({ target }); }
}

test('a custom webhook method typed earlier is what Save stores when Custom is chosen again', () => {
  const radios = ['POST', 'PUT', 'CUSTOM'].map(value => Object.assign(new Field(), { value }));
  const method = new Field('POST');
  const container = new Field();
  const custom = new Field();
  const nodes = { '#webhookMethod': method, '#webhookCustomMethodContainer': container, '#webhookCustomMethod': custom };
  const context = vm.createContext({
    console, self: {}, FormatUtils: {}, Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: (selector) => nodes[selector] || null, querySelectorAll: () => radios }
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  const ui = vm.runInContext('SettingsUI', context);
  ui.setupWebhookMethodRadios();
  const [post, , customRadio] = radios;

  customRadio.fire('change');
  custom.value = ' report ';
  custom.fire('input');
  assert.equal(method.value, 'REPORT', 'typing sets the method');
  post.fire('change');
  assert.equal(method.value, 'POST');
  assert.equal(container.style.display, 'none');
  customRadio.fire('change');
  assert.equal(method.value, 'REPORT', 'the box shows REPORT again: so does what Save stores');
  assert.equal(container.style.display, 'block');
  assert.equal(custom.focused, true);

  custom.value = '';
  post.fire('change');
  customRadio.fire('change');
  assert.equal(method.value, 'POST', 'an empty box changes nothing');
});

test('"notifications enabled" is read again after the setting changes, not up to 30 seconds later', async () => {
  let enabled = false;
  let reads = 0;
  const storageListeners = [];
  const context = vm.createContext({
    console, Date, Promise, Map, Set, setTimeout, clearTimeout,
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: { getSettings: async () => { reads++; return { notificationsEnabled: enabled }; } },
    chrome: { storage: { onChanged: { addListener: (fn) => storageListeners.push(fn) } } },
    window: {}, document: { querySelector: () => null, addEventListener() {}, body: {} }
  });
  context.self = context;
  vm.runInContext(read('modules/ui/notification-manager.js') + '\n;globalThis.NotificationHelper = NotificationHelper;', context);
  const helper = context.NotificationHelper;
  assert.equal(await helper.areNotificationsEnabled(), false);
  enabled = true;
  assert.equal(await helper.areNotificationsEnabled(), false, 'cached within its 30 seconds');
  assert.equal(storageListeners.length, 1);
  storageListeners[0]({ scrapfly_language_override: {} }, 'local');
  assert.equal(await helper.areNotificationsEnabled(), false, 'other keys do not clear it');
  storageListeners[0]({ scrapfly_settings: {} }, 'sync');
  assert.equal(await helper.areNotificationsEnabled(), false, 'nor other areas');
  storageListeners[0]({ scrapfly_settings: {} }, 'local');
  assert.equal(await helper.areNotificationsEnabled(), true, 'a saved, imported or reset setting counts at once');
  assert.equal(reads, 2);
});

test('the log counter starts only while Settings is open (pinned in the source: populating the form needs the whole page)', () => {
  assert.match(read('sections/settings/settings-ui.js'), /\(this\.settings\.logCollectorEnabled \?\? false\) && this\.isModalVisible/);
});
