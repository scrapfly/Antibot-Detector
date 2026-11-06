const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// When the stored settings cannot be read (the storage did not answer, or the text stored is not JSON), History, Bulk scan and
// the schedules stay off, and the person has to be told why and how it is repaired: Settings → Data → Reset. The popup says so once
// when it opens, in the way it says the worker is out of date, as a toast, and never with the text that could not be read.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'settingsUnreadableHint';

/** ScrapflyPopup's warnIfSettingsUnreadable with a storage that reads settings the way the test says. */
function popupWith(readSettings) {
  const toasts = [];
  const logs = [];
  const asked = [];
  const context = vm.createContext({
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { debug() {}, error() {}, popup() {}, warn: (...args) => logs.push(args.map(arg => (arg && typeof arg === 'object' && 'message' in arg ? `${arg.name}: ${arg.message}` : arg))) },
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    WorkerMessages: require('../modules/core/worker-messages.js'),
    WorkerVersion: require('../modules/core/worker-version.js'),
    FormatUtils: { t: (key, fallback) => { asked.push(key); return fallback; } },
    NotificationHelper: { error: (text) => toasts.push(text) },
    StorageManager: { readSettingsStrict: readSettings },
    chrome: { runtime: { sendMessage: async () => undefined } }
  });
  vm.runInContext(`${read('popup.js')}\nthis.ScrapflyPopup = ScrapflyPopup;`, context, { filename: 'popup.js' });
  return { popup: Object.create(context.ScrapflyPopup.prototype), toasts, logs, asked };
}

test('the popup says the settings cannot be read, once, as a toast that names the repair; nothing when they read', async () => {
  const failures = [
    ['a read that fails', async () => { throw new Error('storage is unavailable'); }],
    ['text that is not JSON', async () => JSON.parse('S3CR3T-WEBHOOK-VALUE is not json')],
    ['settings that are not an object', async () => { throw new Error('Stored settings are invalid'); }]
  ];
  for (const [what, readSettings] of failures) {
    const h = popupWith(readSettings);
    await h.popup.warnIfSettingsUnreadable();
    await h.popup.warnIfSettingsUnreadable();
    assert.equal(h.toasts.length, 1, `${what}: once, however often it is asked`);
    assert.ok(h.toasts[0].includes('Settings → Data → Reset'), `${what}: it names where the repair is`);
    assert.deepEqual(h.asked, [KEY], 'in the language of the interface');
    assert.equal(h.logs.length, 1);
    assert.ok(!JSON.stringify([h.toasts, h.logs]).includes('S3CR3T'), 'a JSON error quotes the stored text, and a webhook secret may be in it: neither the toast nor the log holds it');
  }
  for (const [what, settings] of [['settings that read', { history: { historyEnabled: false } }], ['settings never saved', {}]]) {
    const h = popupWith(async () => settings);
    await h.popup.warnIfSettingsUnreadable();
    assert.deepEqual(h.toasts, [], what);
    assert.deepEqual(h.logs, [], what);
  }
});

test('the popup asks when it opens, without waiting for the answer', () => {
  const popup = read('popup.js');
  assert.ok(/NotificationHelper\.initialize\(\);[\s\S]{0,400}this\.warnIfSettingsUnreadable\(\);/.test(popup), 'asked when the popup initializes');
  assert.ok(!/await this\.warnIfSettingsUnreadable/.test(popup), 'the answer only matters when it says so');
});

test('the text exists in every language, names the same repair as the English one, and keeps its arrows', () => {
  const english = JSON.parse(read('_locales/en/messages.json'))[KEY];
  assert.ok(english && english.message.includes('Settings → Data → Reset'));
  assert.ok(english.description && english.description.length > 20, 'the English entry says where it is shown');
  const popupFallback = /FormatUtils\.t\('settingsUnreadableHint', '([^']+)'\)/.exec(read('popup.js'));
  assert.equal(popupFallback && popupFallback[1], english.message, 'the fallback in the popup is the English text');
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const entry = JSON.parse(read(`_locales/${locale}/messages.json`))[KEY];
    assert.ok(entry && typeof entry.message === 'string' && entry.message.trim().length > 20, `${locale} has it`);
    assert.ok(/[→←]/.test(entry.message), `${locale} writes the path with arrows`);
    if (locale !== 'en') assert.notEqual(entry.message, english.message, `${locale} is translated`);
  }
});
