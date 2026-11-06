const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings: ✕, Escape and a click outside it are easy to make by accident, so with edits that are not saved they ask first
// (Save, Discard or Cancel), as the rule editor does; Cancel says it already. A Save that finds an invalid value goes to the
// tab that holds the field, opens its card, focuses it and marks it, besides the message.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fakeElement(id, extra = {}) {
  const listeners = {};
  const attributes = {};
  const element = {
    id, dataset: {}, listeners, attributes, focused: 0, scrolled: 0,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(known => known !== fn); },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return name in attributes ? attributes[name] : null; },
    removeAttribute(name) { delete attributes[name]; },
    focus() { element.focused++; },
    scrollIntoView() { element.scrolled++; },
    closest: () => null,
    querySelectorAll: () => [],
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    ...extra
  };
  return element;
}

/** Lets the questions that are still being answered finish (a listener that does not return its promise cannot be awaited). */
const settle = () => new Promise(resolve => setImmediate(resolve));

/** Fires the listeners an element holds for a type, in order. */
async function fire(element, type, event = {}) {
  for (const fn of element.listeners[type] || []) await fn({ target: element, preventDefault() {}, ...event });
}

function harness({ dirty = false, answers = ['cancel'] } = {}) {
  const asked = [];
  const keys = [];
  const errors = [];
  const elements = {};
  const documentListeners = {};
  const state = { dirty, modalFocus: null };
  const context = vm.createContext({
    self: {}, console,
    Logger: new Proxy({}, { get: () => () => {} }),
    SettingsTransfer: { diagnostics: () => ({}) },
    NotificationHelper: {
      choose: async (options) => { asked.push(options); return answers.shift(); },
      error: (message) => errors.push(message), info() {}, success() {}
    },
    // Nothing translated: the English fallbacks are what is asked, and the keys say which messages are looked up
    I18n: { get: (key) => { keys.push(key); return null; }, format: () => null },
    ModalFocus: { activate: (content, options) => { state.modalFocus = options; return () => {}; } },
    requestAnimationFrame: (fn) => fn(),
    document: {
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: (type, fn) => { (documentListeners[type] = documentListeners[type] || []).push(fn); }
    }
  });
  for (const file of ['sections/settings/settings-ui.js', 'sections/settings/settings-ui-updates.js']) vm.runInContext(read(file), context, { filename: file });
  const ui = context.self.SettingsUI;
  // settings-ui-language.js answers this in the real popup
  ui.hasUnsavedChanges = () => state.dirty;
  const owner = {
    isModalVisible: true, settings: {}, settingsBaseline: {}, hidden: 0, saved: 0, tab: null,
    hideSettings() { this.hidden++; this.isModalVisible = false; },
    async handleSaveSettings() { this.saved++; },
    loadSettings() {}, setupColorPagination() {},
    switchTab(name) { this.tab = name; }
  };
  return { ui, owner, context, asked, keys, errors, elements, documentListeners, state };
}

test('with nothing unsaved, ✕, Escape and a click outside close Settings at once', async () => {
  const h = harness({ dirty: false });
  await h.ui.requestHideSettings.call(h.owner);
  assert.equal(h.owner.hidden, 1);
  assert.equal(h.asked.length, 0, 'nothing to ask');
});

test('with unsaved edits they ask first: Cancel keeps Settings open, Discard closes it, Save saves', async () => {
  for (const [answer, hidden, saved] of [['cancel', 0, 0], ['discard', 1, 0], ['save', 0, 1]]) {
    const h = harness({ dirty: true, answers: [answer] });
    await h.ui.requestHideSettings.call(h.owner);
    assert.equal(h.asked.length, 1, `${answer}: one question`);
    assert.deepEqual([h.owner.hidden, h.owner.saved], [hidden, saved], answer);
  }
});

test('the question reuses the words of the language switch and the rule editor, and has one message of its own', async () => {
  const h = harness({ dirty: true, answers: ['cancel'] });
  await h.ui.requestHideSettings.call(h.owner);
  const [question] = h.asked;
  assert.equal(question.title, 'Unsaved settings');
  assert.equal(question.message, 'Your changes to the settings are not saved yet. Save them before closing?');
  assert.equal(question.cancelText, 'Cancel');
  assert.deepEqual(plain(question.actions.map(action => [action.value, action.text, !!action.primary])), [['discard', 'Discard', false], ['save', 'Save', true]]);
  assert.equal(question.defaultValue, 'save', 'Enter saves');
  for (const key of ['settingsLanguageUnsavedTitle', 'settingsUnsavedCloseMessage', 'ruleEditorDiscardConfirm', 'btnSave', 'btnCancel']) assert.ok(h.keys.includes(key), `${key} is looked up`);
});

test('a second ✕ or Escape while the question is open does not open another', async () => {
  let release;
  const open = new Promise(resolve => { release = resolve; });
  const h = harness({ dirty: true, answers: [open] });
  const first = h.ui.requestHideSettings.call(h.owner);
  const second = h.ui.requestHideSettings.call(h.owner);
  release('cancel');
  await Promise.all([first, second]);
  assert.equal(h.asked.length, 1);
});

test('without a way to ask, Settings still closes: nobody is trapped in it', async () => {
  const h = harness({ dirty: true });
  h.context.NotificationHelper.choose = undefined;
  await h.ui.requestHideSettings.call(h.owner);
  assert.equal(h.owner.hidden, 1);
});

test('Escape through the focus trap, ✕ and a click outside ask; Cancel closes without asking', async () => {
  const h = harness({ dirty: true, answers: ['cancel', 'cancel', 'cancel', 'cancel'] });
  Object.assign(h.elements, {
    '#settingsModal': fakeElement('settingsModal', { querySelector: () => fakeElement('content'), classList: { add() {}, remove() {}, contains: () => false } }),
    '#closeSettingsModal': fakeElement('closeSettingsModal'),
    '#cancelSettingsBtn': fakeElement('cancelSettingsBtn'),
    '#saveSettingsBtn': fakeElement('saveSettingsBtn')
  });
  h.ui.showSettings.call(h.owner);
  assert.equal(typeof h.state.modalFocus.onClose, 'function', 'the focus trap closes Settings on Escape');
  h.ui.setupEventListeners.call(h.owner);

  await h.state.modalFocus.onClose();
  assert.equal(h.asked.length, 1, 'Escape (focus trap)');
  await fire(h.elements['#closeSettingsModal'], 'click');
  assert.equal(h.asked.length, 2, '✕');
  await fire(h.elements['#settingsModal'], 'click');
  await settle();
  assert.equal(h.asked.length, 3, 'a click outside');
  for (const fn of h.documentListeners.keydown || []) await fn({ key: 'Escape' });
  await settle();
  assert.equal(h.asked.length, 4, 'Escape on the page (no focus trap)');
  assert.equal(h.owner.hidden, 0, 'nothing closed: every answer was Cancel');

  await fire(h.elements['#cancelSettingsBtn'], 'click');
  assert.equal(h.owner.hidden, 1, 'Cancel says it already');
  assert.equal(h.asked.length, 4, 'and asks nothing');
});

// ---- validation: which field a message is about ---------------------------------------------------------------------

function loadValidation(extra = {}) {
  const context = vm.createContext({
    console, self: {},
    HistoryStore: require('../modules/core/history-store.js'),
    HistoryPolicy: require('../modules/core/history-policy.js'),
    FormatUtils: require('../utils/format-utils.js'),
    ScanScope: require('../modules/core/scan-scope.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: () => null },
    ...extra
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  return vm.runInContext('SettingsUI', context);
}

test('validateSettings names the field each message is about, once, in the order the messages come', () => {
  const ui = loadValidation({ SettingsRuntime: { _isWebhookUrlSafe: (url) => url.startsWith('https://hooks.example') } });
  const fields = (settings, baseline = {}) => plain(ui.validateSettings.call({ settingsBaseline: baseline }, settings).fields);
  assert.deepEqual(fields({ history: { historyLimit: NaN } }), ['#historyLimit']);
  assert.deepEqual(fields({ detection: { cacheDuration: 0, cacheUnit: 'days' } }), ['#cacheDuration']);
  assert.deepEqual(fields({ history: { historyMinConfidence: 101 } }), ['#historyMinConfidence']);
  assert.deepEqual(fields({ history: { historyAutoPinMinConfidence: -1 } }), ['#historyAutoPinMinConfidence']);
  assert.deepEqual(fields({ history: { historyMaxMB: 7 } }), ['#historyMaxMB']);
  assert.deepEqual(fields({ history: { historyWatch: 'hourly' } }), ['#historyWatch']);
  assert.deepEqual(fields({ history: { historyFingerprintDays: -1 } }), ['#historyFingerprintDays']);
  assert.deepEqual(fields({ history: { historyAutoDeleteDays: 0 } }), ['#historyAutoDeleteDays']);
  assert.deepEqual(fields({ detection: { advancedToolsMinConfidence: 100 } }), ['#advancedToolsMinConfidence']);
  assert.deepEqual(fields({ duplicatePrevention: { duplicateDuration: 0 } }), ['#duplicateDuration']);
  assert.deepEqual(fields({ detection: { scanMode: 'everything' } }), ['#scanMode']);
  assert.deepEqual(fields({ webhook: { webhookUrl: 'http://insecure.example/' } }), ['#webhookUrl']);
  // a value a list does not offer: the select of that list
  assert.deepEqual(fields({ updates: { checkIntervalHours: 72 } }), ['#checkIntervalHours']);
  assert.deepEqual(fields({ history: { exportFormat: 'pdf' } }), ['#exportFormat']);
  assert.deepEqual(fields({ history: { historyBackup: 'hourly' } }), ['#historyBackup']);
  assert.deepEqual(fields({ duplicatePrevention: { duplicateScope: 'site' } }), ['#duplicateScope']);
  assert.deepEqual(fields({ detection: { cacheScope: 'host' } }), ['#cacheScope']);
  // two problems: both fields, in the order of the messages; the same field twice is named once
  assert.deepEqual(fields({ history: { historyLimit: -5, historyMinConfidence: 101 } }), ['#historyLimit', '#historyMinConfidence']);
  assert.deepEqual(fields({ history: { historyLimit: 1.5 } }), ['#historyLimit']);
  // nothing wrong: no field
  assert.deepEqual(fields({ history: { historyLimit: 10 } }), []);
});

test('the custom upload server messages point at the address and at the JSON template', () => {
  const ui = loadValidation();
  const urlMessage = 'Custom upload server: use an HTTPS address on a public host';
  const jsonMessage = 'Custom upload server: the JSON template is not valid JSON';
  ui.validateShareSettings = () => [urlMessage, jsonMessage];
  assert.deepEqual(plain(ui.validateSettings.call({}, { share: {} }).fields), ['#shareCustomUrl', '#shareCustomJsonTemplate']);
  ui.validateShareSettings = () => [jsonMessage];
  assert.deepEqual(plain(ui.validateSettings.call({}, { share: {} }).fields), ['#shareCustomJsonTemplate']);
});

// ---- a Save that finds an invalid value -------------------------------------------------------------------------------

function invalidSave({ fieldAttributes = {} } = {}) {
  const h = harness();
  const tabContent = { getAttribute: (name) => (name === 'data-tab-content' ? 'history' : null) };
  const head = fakeElement('head');
  let folded = true;
  const card = {
    classList: { contains: () => folded, toggle(name, force) { folded = force === undefined ? !folded : force; return folded; }, add() {}, remove() {} },
    querySelector: () => head
  };
  const field = fakeElement('historyLimit', {
    closest: (selector) => (selector === '.settings-tab-content' ? tabContent : (selector === '.settings-card.is-collapsed' && folded ? card : null))
  });
  Object.assign(field.attributes, fieldAttributes);
  h.elements['#historyLimit'] = field;
  Object.assign(h.owner, {
    getSettingsFromUI: () => ({}),
    validateSettings: () => ({ isValid: false, errors: ['History limit must be between 0 (unlimited) and 10000'], fields: ['#historyLimit'] }),
    saveSettings: async () => { throw new Error('an invalid form is never saved'); }
  });
  return { ...h, field, head, isFolded: () => folded };
}

test('a Save that finds an invalid value keeps its message, and goes to the field: its tab, its card, focus, aria-invalid', async () => {
  const h = invalidSave();
  await h.ui.handleSaveSettings.call(h.owner);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /^Invalid settings: History limit must be between 0 \(unlimited\) and 10000$/);
  assert.equal(h.owner.tab, 'history', 'the tab that holds the field is shown');
  assert.equal(h.isFolded(), false, 'its card is open');
  assert.equal(h.head.attributes['aria-expanded'], 'true');
  assert.equal(h.field.focused, 1, 'the field has the focus');
  assert.equal(h.field.attributes['aria-invalid'], 'true');
  assert.equal(h.owner.hidden, 0, 'Settings stays open');
  // Editing the field takes the mark off
  await fire(h.field, 'input');
  assert.equal(h.field.getAttribute('aria-invalid'), null);
});

test('only the first invalid field takes the focus; every invalid field is marked', async () => {
  const h = invalidSave();
  const second = fakeElement('historyMinConfidence');
  h.elements['#historyMinConfidence'] = second;
  h.owner.validateSettings = () => ({ isValid: false, errors: ['a', 'b'], fields: ['#historyLimit', '#historyMinConfidence'] });
  await h.ui.handleSaveSettings.call(h.owner);
  assert.deepEqual([h.field.focused, second.focused], [1, 0]);
  assert.deepEqual([h.field.attributes['aria-invalid'], second.attributes['aria-invalid']], ['true', 'true']);
});

test('a field that already marks itself (the signing secret) is focused but left to its own check', async () => {
  const h = invalidSave({ fieldAttributes: { 'aria-invalid': 'true' } });
  await h.ui.handleSaveSettings.call(h.owner);
  assert.equal(h.field.focused, 1);
  await fire(h.field, 'input');
  assert.equal(h.field.getAttribute('aria-invalid'), 'true', 'the field\'s own check decides when it is valid again');
});

test('a validation without fields (an older stub, a list of sites) still shows the message and does not break', async () => {
  const h = invalidSave();
  h.owner.validateSettings = () => ({ isValid: false, errors: ['A list of sites must hold site names only'] });
  await h.ui.handleSaveSettings.call(h.owner);
  assert.equal(h.errors.length, 1);
  assert.equal(h.field.focused, 0);
});

test('the marks of an earlier failed Save are gone on the next one', async () => {
  const h = invalidSave();
  await h.ui.handleSaveSettings.call(h.owner);
  assert.equal(h.field.attributes['aria-invalid'], 'true');
  h.owner.validateSettings = () => ({ isValid: false, errors: ['x'], fields: [] });
  await h.ui.handleSaveSettings.call(h.owner);
  assert.equal(h.field.getAttribute('aria-invalid'), null);
});
