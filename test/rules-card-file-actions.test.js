const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A Rules card's "⋯" menu: Export downloads just that detector in the same
// file format as Rules → Export, and Import merges the detectors in a file
// without the Merge / Replace All question.

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, warn() {}, storage() {} };
global.DetectionUtils = require('../utils/detection-utils.js');
global.StorageManager = { saveToStorage: async () => true };
global.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: { getURL: p => p } };
const DetectorManager = require('../modules/detection/managers/detector-manager.js');

function makeManager() {
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = {
    antibot: {
      'detect-my-rule': { id: 'detect-my-rule', name: 'My rule', author: 'Jane Doe', enabled: true, detection: {}, _searchStrings: ['x'] },
      'detect-other': { id: 'detect-other', name: 'Other', author: 'Jane Doe', enabled: true, detection: {} }
    }
  };
  return dm;
}

test('Export on a card holds only that detector, in the full-export format', () => {
  const dm = makeManager();
  const data = dm.exportDetector('antibot', 'detect-my-rule');
  assert.strictEqual(data.version, '1.0');
  assert.ok(!Number.isNaN(Date.parse(data.exportedAt)));
  assert.deepStrictEqual(Object.keys(data.detectors), ['antibot']);
  assert.deepStrictEqual(Object.keys(data.detectors.antibot), ['detect-my-rule']);
  assert.strictEqual(data.detectors.antibot['detect-my-rule']._searchStrings, undefined);
  assert.deepStrictEqual(dm.detectors.antibot['detect-my-rule']._searchStrings, ['x'], 'the stored detector is untouched');
  assert.strictEqual(dm.exportDetector('antibot', 'detect-missing'), null);
  assert.strictEqual(dm.exportDetector('captcha', 'detect-my-rule'), null);
});

test('the exported file imports back into another install', async () => {
  const data = JSON.parse(JSON.stringify(makeManager().exportDetector('antibot', 'detect-my-rule')));
  const target = new DetectorManager({ initialized: true });
  target.detectors = { antibot: { 'detect-kept': { id: 'detect-kept', name: 'Kept', author: 'Jane Doe', enabled: true, detection: {} } } };
  assert.strictEqual(await target.importDetectors(data, true), true);
  assert.deepStrictEqual(Object.keys(target.detectors.antibot).sort(), ['detect-kept', 'detect-my-rule']);
  assert.strictEqual(target.detectors.antibot['detect-my-rule'].name, 'My rule');
});

function loadRules({ importResult = true } = {}) {
  const inputs = [];
  const toasts = [];
  const context = vm.createContext({
    document: {
      createElement(tag) {
        const handlers = {};
        const el = { tag, files: null, addEventListener: (type, fn) => { handlers[type] = fn; }, click() { el.clicked = true; }, fire: () => handlers.change() };
        inputs.push(el);
        return el;
      }
    },
    NotificationHelper: {
      success: (m) => toasts.push(['success', m]),
      error: (m) => toasts.push(['error', m]),
      chooseImportMode: () => { throw new Error('a card import must not ask Merge / Replace All'); }
    },
    FormatUtils: { t: (key, fallback, ...args) => args.reduce((s, a, i) => s.split('{' + i + '}').join(String(a)), fallback) },
    chrome: { runtime: { sendMessage(msg, cb) { context.sent.push(msg.type); if (cb) cb(); }, lastError: undefined } },
    sent: [],
    console
  });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sections/rules/rules-handlers.js'), 'utf8'), context);
  const calls = [];
  const rules = Object.create(context.Rules.prototype);
  let shown = 0;
  Object.assign(rules, {
    detectorManager: { importDetectors: async (data, merge) => { calls.push({ data, merge }); return importResult; } },
    displayRules() { shown++; }
  });
  return { rules, inputs, toasts, calls, context, shown: () => shown };
}
const fileOf = (obj) => ({ text: async () => JSON.stringify(obj) });
const tick = () => new Promise(r => setTimeout(r, 0));

test('Import on a card merges the file without asking, then reloads', async () => {
  const { rules, inputs, toasts, calls, context, shown } = loadRules();
  rules.handleImportDetectorsFile();
  assert.strictEqual(inputs.length, 1);
  assert.strictEqual(inputs[0].type, 'file');
  assert.ok(inputs[0].clicked, 'the file picker opens');
  inputs[0].files = [fileOf({ detectors: { antibot: { 'detect-x': { id: 'detect-x' } } } })];
  inputs[0].fire();
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].merge, true);
  assert.deepStrictEqual(context.sent, ['RELOAD_DETECTORS']);
  assert.deepStrictEqual(toasts.map(t => t[0]), ['success']);
  assert.strictEqual(shown(), 1);
});

test('Import on a card: a cancelled picker, a bad file or a rejected format change nothing', async () => {
  const cancelled = loadRules();
  cancelled.rules.handleImportDetectorsFile();
  cancelled.inputs[0].files = [];
  cancelled.inputs[0].fire();
  await tick();
  assert.deepStrictEqual(cancelled.calls, []);
  assert.deepStrictEqual(cancelled.toasts, []);

  const broken = loadRules();
  broken.rules.handleImportDetectorsFile();
  broken.inputs[0].files = [{ text: async () => '{not json' }];
  broken.inputs[0].fire();
  await tick();
  assert.deepStrictEqual(broken.calls, []);
  assert.deepStrictEqual(broken.toasts.map(t => t[0]), ['error']);

  const rejected = loadRules({ importResult: false });
  rejected.rules.handleImportDetectorsFile();
  rejected.inputs[0].files = [fileOf({ nothing: 1 })];
  rejected.inputs[0].fire();
  await tick();
  assert.deepStrictEqual(rejected.context.sent, []);
  assert.deepStrictEqual(rejected.toasts.map(t => t[0]), ['error']);
  assert.strictEqual(rejected.shown(), 0);
});

test('every card menu offers Export and Import', () => {
  const display = fs.readFileSync(path.join(__dirname, '..', 'sections/rules/rules-display.js'), 'utf8');
  assert.match(display, /class="rules-menu-item export-detector-btn"[^>]*data-detector-id=/);
  assert.match(display, /class="rules-menu-item import-detector-btn"/);
  assert.match(display, /\$\{fileItems\}\s*\$\{resetItem\}\s*\$\{deleteItem\}/);
});
