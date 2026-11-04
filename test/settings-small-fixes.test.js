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

test('a webhook preset fills the Content-Type and the template, and the list goes back to its first line', () => {
  const type = new Field('application/json');
  const payload = new Field('{"mine": true}');
  const preset = new Field('slack');
  const nodes = { '#webhookContentType': type, '#webhookPayload': payload, '#webhookPreset': preset };
  const events = [];
  class FakeEvent { constructor(name) { this.name = name; } }
  const context = vm.createContext({
    console, self: {}, FormatUtils: {}, Event: FakeEvent, Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: (selector) => nodes[selector] || null, querySelectorAll: () => [] }
  });
  context.self = context;
  for (const field of [type, payload]) field.dispatchEvent = (event) => events.push([field === type ? 'type' : 'payload', event.name]);
  vm.runInContext(read('modules/core/webhook-body.js'), context);
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  const ui = vm.runInContext('SettingsUI', context);

  ui.applyWebhookPreset('plain');
  assert.equal(type.value, 'text/plain');
  assert.equal(payload.value, '<HOSTNAME>: <DETECTION_NAMES> (<SITEURL>)');
  assert.equal(preset.value, '', 'an action, not a state: no stale choice stays shown');
  assert.equal(payload.focused, true);
  assert.deepEqual(events, [['type', 'input'], ['type', 'change'], ['payload', 'input'], ['payload', 'change']], 'the form hears both edits, like a typed one');

  ui.applyWebhookPreset('discord');
  assert.equal(type.value, 'application/json');
  assert.match(payload.value, /^\{"content": "\*\*<HOSTNAME>\*\*: <DETECTION_NAMES>/);

  const before = payload.value;
  ui.applyWebhookPreset('');
  ui.applyWebhookPreset('nonsense');
  assert.equal(payload.value, before, 'the first line, or an unknown id, changes nothing');
});

test('the preset list is built from WebhookBody.PRESETS, with brand names as they are and words translated', () => {
  const options = [{ value: '' }];
  const select = Object.assign(new Field(''), { options, appendChild(option) { options.push(option); } });
  select.options = options;
  const textarea = Object.assign(new Field(''), { dataset: {}, style: {} });
  const nodes = { '#webhookPreset': select, '#webhookPayload': textarea };
  const context = vm.createContext({
    console, self: {}, FormatUtils: {}, I18n: { tr: (key, fallback) => (key === 'webhookPresetPlain' ? 'Línea de texto' : fallback) }, Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: (selector) => nodes[selector] || null, querySelectorAll: () => [], createElement: () => ({}) }
  });
  context.self = context;
  vm.runInContext(read('modules/core/webhook-body.js'), context);
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  const ui = vm.runInContext('SettingsUI', context);
  const view = Object.assign(Object.create(ui), { escapeHtml: (text) => text });
  view.refreshWebhookPayloadValidation = () => {};
  ui.refreshWebhookPayloadValidation = () => {};
  view.setupWebhookPayloadUI();
  assert.deepEqual(options.slice(1).map(o => [o.value, o.textContent]), [['slack', 'Slack, Mattermost, Google Chat'], ['discord', 'Discord'], ['plain', 'Línea de texto']]);
  view.setupWebhookPayloadUI();
  assert.equal(options.length, 4, 'populating the form again does not list them twice');
});

test('the toast limit drops the oldest toast that goes away by itself, not a spinner that stays until it is closed, nor the newest', () => {
  const context = vm.createContext({ console, Date, Promise, Map, Set, setTimeout, clearTimeout, Logger: new Proxy({}, { get: () => () => {} }),
    Utils: { getSettings: async () => ({}) }, chrome: { storage: { onChanged: { addListener() {} } } }, window: {}, document: { querySelector: () => null, addEventListener() {}, body: {} } });
  context.self = context;
  vm.runInContext(read('modules/ui/notification-manager.js') + '\n;globalThis.ToastLimit = NotificationManager;', context);
  const drop = (...kinds) => context.ToastLimit.toastToDrop(kinds.map(kind => ({ timeoutId: kind === 'auto' ? 7 : null })));
  assert.equal(drop('auto', 'auto', 'auto'), 0, 'the oldest');
  assert.equal(drop('spinner', 'auto', 'auto'), 1, 'the spinner stays, the next oldest goes');
  assert.equal(drop('spinner', 'spinner', 'auto'), 0, 'nothing else but the newest: the oldest goes');
  assert.equal(drop('auto', 'spinner', 'auto'), 0);
  assert.equal(drop('spinner', 'auto'), 0);
});
