const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Import dialogs must never replace data on a dismissal. Drive the real
// NotificationManager dialog (notification-manager.js) in a small fake DOM,
// then run the real history and detector import handlers against it.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// ---- Minimal DOM -----------------------------------------------------------
function makeDom() {
  const listeners = { window: {}, document: {} };
  const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
  const off = (bag) => (type, fn) => { bag[type] = (bag[type] || []).filter(f => f !== fn); };

  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.attrs = {};
      this.handlers = {};
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.innerHTML = '';
      this.offsetHeight = 0;
      this.disabled = false;
    }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    click() { for (const fn of this.handlers.click || []) fn({ target: this }); }
    focus() { doc.activeElement = this; }
    contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    matches(selector) {
      const classes = this.className.split(/\s+/);
      if (selector === 'button:not([disabled])') return this.tagName === 'BUTTON' && !this.disabled;
      if (selector === '.notification-confirm[data-open="true"]') return classes.includes('notification-confirm') && this.attrs['data-open'] === 'true';
      if (selector.startsWith('.')) return classes.includes(selector.slice(1));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      return false;
    }
    querySelectorAll(selector) { return this.all().filter(e => e.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }

  const html = new El('html');
  const head = html.appendChild(new El('head'));
  const body = html.appendChild(new El('body'));
  const doc = {
    body, head, activeElement: body,
    createElement: (tag) => new El(tag),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    getElementById: (id) => html.querySelector('#' + id),
    contains: (n) => html.contains(n),
    addEventListener: on(listeners.document),
    removeEventListener: off(listeners.document)
  };

  const win = {
    addEventListener: on(listeners.window),
    removeEventListener: off(listeners.window)
  };

  const pressKey = (key) => {
    const event = { key, shiftKey: false, preventDefault() {}, stopImmediatePropagation() {} };
    for (const fn of [...(listeners.window.keydown || [])]) fn(event);
  };

  return { doc, win, El, pressKey };
}

function loadDialogs() {
  const dom = makeDom();
  const context = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), 
    document: dom.doc,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => fn(),
    Constants: { NOTIFICATION_FADE_MS: 0 },
    CloseButton: {
      create: ({ className }) => {
        const b = dom.doc.createElement('button');
        b.className = `btn-close ${className}`;
        return b;
      }
    },
    I18n: { get: () => '', format: () => '' },
    Logger: { ui() {}, error() {}, warn() {}, debug() {} },
    console
  });
  // `window` is both the global object and the event target
  context.window = context;
  context.addEventListener = dom.win.addEventListener;
  context.removeEventListener = dom.win.removeEventListener;
  vm.runInContext(read('modules/ui/notification-manager.js'), context);

  const dialog = () => dom.doc.querySelector('.notification-confirm');
  const button = (text) => dialog().querySelectorAll('.notification-btn').find(b => b.textContent === text);
  const dismiss = {
    escape: () => dom.pressKey('Escape'),
    close: () => dialog().querySelector('.btn-close').click(),
    backdrop: () => dom.doc.querySelector('.notification-backdrop').click(),
    cancel: () => button('Cancel').click()
  };
  return { context, dom, dialog, button, dismiss };
}

const DISMISSALS = ['escape', 'close', 'backdrop', 'cancel'];

// ---- The dialog ------------------------------------------------------------
for (const how of DISMISSALS) {
  test(`chooseImportMode: ${how} resolves to cancel`, async () => {
    const { context, dismiss } = loadDialogs();
    const pending = context.NotificationHelper.chooseImportMode({ title: 'T', message: 'M' });
    dismiss[how]();
    assert.strictEqual(await pending, 'cancel');
  });
}

test('chooseImportMode: Merge and Replace resolve to themselves', async () => {
  for (const [text, value] of [['Merge', 'merge'], ['Replace', 'replace']]) {
    const { context, button } = loadDialogs();
    const pending = context.NotificationHelper.chooseImportMode({ title: 'T', message: 'M' });
    button(text).click();
    assert.strictEqual(await pending, value);
  }
});

test('chooseImportMode: three buttons, Replace outlined danger, focus starts on Merge', async () => {
  const { context, dialog, button, dom } = loadDialogs();
  const pending = context.NotificationHelper.chooseImportMode({ title: 'T', message: 'M', replaceText: 'Replace All' });
  const labels = dialog().querySelectorAll('.notification-btn').map(b => b.textContent);
  assert.deepStrictEqual(labels, ['Cancel', 'Replace All', 'Merge']);
  assert.match(button('Replace All').className, /notification-btn-destructive/);
  assert.match(button('Merge').className, /notification-btn-confirm/);
  assert.strictEqual(dom.doc.activeElement, button('Merge'));
  // Enter on the focused Merge merges; Replace is never an Enter default
  dom.pressKey('Enter');
  assert.strictEqual(await pending, 'merge');
});

test('choose: Enter off the buttons never picks a danger default', async () => {
  const { context, dom } = loadDialogs();
  const pending = context.NotificationManager.choose({
    actions: [{ value: 'wipe', text: 'Wipe', tone: 'danger' }],
    defaultValue: 'wipe'
  });
  dom.doc.activeElement = dom.doc.body;
  dom.pressKey('Enter');
  dom.pressKey('Escape');
  assert.strictEqual(await pending, 'cancel');
});

test('confirm keeps its yes/no contract', async () => {
  for (const [how, expected] of [['escape', false], ['backdrop', false], ['close', false], ['ok', true]]) {
    const { context, dismiss, button } = loadDialogs();
    const pending = context.NotificationHelper.confirm({ confirmText: 'OK', cancelText: 'Cancel' });
    if (how === 'ok') button('OK').click(); else dismiss[how]();
    assert.strictEqual(await pending, expected, how);
  }
});

// ---- The import handlers ---------------------------------------------------
function importEvent(payload) {
  return { target: { files: [{ text: async () => JSON.stringify(payload) }], value: 'x.json' } };
}

function loadHistory(dialogs) {
  vm.runInContext(read('modules/core/history-store.js'), dialogs.context);
  vm.runInContext(read('sections/history/history.js'), dialogs.context);
  const saved = [];
  const store = vm.runInContext('HistoryStore', dialogs.context);
  const history = Object.create(dialogs.context.History.prototype);
  Object.assign(history, {
    historyItems: [{ id: 'old', timestamp: '2026-01-01T00:00:00Z' }],
    historyLimit: 0,
    // The worker applies the import and the popup reads the stored list back; record what it ends up showing
    saveHistoryToStorage: async (items, mode) => {
      if (history.failSave) throw new Error('quota');
      history.historyItems = store.applyImport(history.historyItems, items, mode, 0);
      saved.push([...history.historyItems].map(i => i.id));
    },
    renderHistory() {}
  });
  return { history, saved };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const FILE = { items: [{ id: 'new', timestamp: '2026-02-01T00:00:00Z' }] };

for (const how of DISMISSALS) {
  test(`history import: ${how} writes nothing`, async () => {
    const dialogs = loadDialogs();
    const { history, saved } = loadHistory(dialogs);
    const event = importEvent(FILE);
    const done = history.handleImport(event);
    await tick();
    dialogs.dismiss[how]();
    await done;
    assert.deepStrictEqual(saved, []);
    assert.deepStrictEqual(history.historyItems.map(i => i.id), ['old']);
    assert.strictEqual(event.target.value, '');
  });
}

test('history import: Merge keeps old items, Replace drops them', async () => {
  for (const [text, expected] of [['Merge', ['new', 'old']], ['Replace', ['new']]]) {
    const dialogs = loadDialogs();
    const { history, saved } = loadHistory(dialogs);
    const done = history.handleImport(importEvent(FILE));
    await tick();
    dialogs.button(text).click();
    await done;
    assert.deepStrictEqual(saved, [expected], text);
  }
});

test('history import: a save that fails leaves the list as it was (no preview entries in search or filters)', async () => {
  const dialogs = loadDialogs();
  const { history, saved } = loadHistory(dialogs);
  history.failSave = true;
  const errors = [];
  vm.runInContext('NotificationHelper', dialogs.context).error = (text) => errors.push(text);
  const done = history.handleImport(importEvent(FILE));
  await tick();
  dialogs.button('Merge').click();
  await done;
  assert.deepStrictEqual(saved, []);
  assert.deepStrictEqual(history.historyItems.map(i => i.id), ['old']);
  assert.equal(errors.length, 1, 'the failure is said');
});

function loadRules(dialogs) {
  vm.runInContext('function Rules() {}', dialogs.context);
  vm.runInContext(read('sections/rules/rules-handlers.js'), dialogs.context);
  const calls = [];
  const rules = Object.create(dialogs.context.Rules.prototype);
  Object.assign(rules, {
    detectorManager: { importDetectors: async (data, merge) => { calls.push(merge); return true; } },
    displayRules() {}
  });
  dialogs.context.chrome = { runtime: { sendMessage() {} } };
  return { rules, calls };
}

for (const how of DISMISSALS) {
  test(`detector import: ${how} imports nothing`, async () => {
    const dialogs = loadDialogs();
    const { rules, calls } = loadRules(dialogs);
    const done = rules.handleImport(importEvent({ detectors: {} }));
    await tick();
    dialogs.dismiss[how]();
    await done;
    assert.deepStrictEqual(calls, []);
  });
}

test('detector import: Merge merges, Replace All replaces', async () => {
  for (const [text, expected] of [['Merge', true], ['Replace All', false]]) {
    const dialogs = loadDialogs();
    const { rules, calls } = loadRules(dialogs);
    const done = rules.handleImport(importEvent({ detectors: {} }));
    await tick();
    dialogs.button(text).click();
    await done;
    assert.deepStrictEqual(calls, [expected], text);
  }
});

test('an imported History file is cleaned: entries only, a unique string id each, newest first, never on the watchlist', () => {
  const S = require('../modules/core/history-store.js');
  const imported = [null, 7, [], { id: 5, timestamp: 1000, url: 'https://old.example/', detections: [null, { name: 'A' }] },
    { id: 'dup', timestamp: 3000, url: 'https://new.example/', watch: true, watchedAt: 1, detections: 'x' },
    { id: 'dup', timestamp: 2000, url: 'https://mid.example/', changed: 'yes' }];
  const out = S.applyImport([], imported, 'replace', 0);
  assert.deepStrictEqual(out.map(i => i.url), ['https://new.example/', 'https://mid.example/', 'https://old.example/']);
  assert.strictEqual(new Set(out.map(i => i.id)).size, 3);
  assert.ok(out.every(i => typeof i.id === 'string' && Array.isArray(i.detections)));
  assert.ok(!('watch' in out[0]) && !('watchedAt' in out[0]), 'a file never puts a page on the watchlist');
  assert.ok(!('changed' in out[1]));
  assert.deepStrictEqual(out[2].detections, [{ name: 'A' }]);
  const merged = S.applyImport([null, { id: 'keep', timestamp: 5000, url: 'https://keep.example/', detections: [] }], imported, 'merge', 0);
  assert.strictEqual(merged[0].id, 'keep', 'a damaged stored entry does not stop a merge');
});
