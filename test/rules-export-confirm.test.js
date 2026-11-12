const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules → Export and "Export shown rules" downloaded the file and said nothing, while a card's Export and every other export
// in the extension confirm. They now say how many rules went into the file ("Rules exported: 3"), and say so when the file
// could not be made instead of failing silently.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture({ refuse = false } = {}) {
  const successes = [];
  const errors = [];
  const downloads = [];
  const messages = JSON.parse(read('_locales/en/messages.json'));
  const I18n = {
    get: (key) => (messages[key] ? messages[key].message : ''),
    format: (key, ...args) => (messages[key] ? messages[key].message.replace(/\{(\d)\}/g, (m, i) => String(args[i])) : '')
  };
  const context = vm.createContext({
    console, JSON, Date, I18n,
    Rules: function Rules() {},
    Logger: { error() {}, debug() {}, ui() {} },
    Blob: function Blob(parts, options) { this.text = parts.join(''); this.type = options.type; },
    URL: {
      createObjectURL: (blob) => { if (refuse) throw new Error('refused'); downloads.push({ blob }); return 'blob:x'; },
      revokeObjectURL() {}
    },
    document: { createElement: () => ({ click() { downloads.at(-1).name = this.download; } }), querySelector: () => null },
    NotificationHelper: { success: value => successes.push(value), error: value => errors.push(value), warning() {}, info() {} },
    FormatUtils: require('../utils/format-utils.js'),
    RulesBulk: require('../modules/core/rules-bulk.js'),
    chrome: { runtime: { sendMessage() {}, lastError: null } }
  });
  vm.runInContext(read('sections/rules/rules-handlers.js'), context, { filename: 'rules-handlers.js' });
  const view = Object.create(context.Rules.prototype);
  const rule = (id) => ({ id, name: id, enabled: true, detection: {} });
  const detectors = { antibot: { a: rule('a'), b: rule('b') }, captcha: { c: rule('c') }, fingerprint: {} };
  view.detectorManager = {
    exportDetectors: () => ({ version: '1.0', exportedAt: 'now', detectors: plain(detectors) }),
    getDetector: (category, id) => detectors[category] && detectors[category][id]
  };
  view.filteredDetectors = [{ category: 'antibot', detectorName: 'b', detector: detectors.antibot.b }];
  return { view, successes, errors, downloads };
}

test('Rules → Export says how many rules it wrote, as a label', () => {
  const state = fixture();
  state.view.handleExport();
  assert.equal(state.downloads.length, 1);
  assert.match(state.downloads[0].name, /^scrapfly-detectors-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(state.successes, ['Rules exported: 3']);
  assert.deepEqual(state.errors, []);
});

test('"Export shown rules" says how many of the rules shown it wrote', () => {
  const state = fixture();
  state.view.handleExportShown();
  assert.equal(state.downloads.length, 1);
  assert.match(state.downloads[0].name, /^scrapfly-detectors-shown-/);
  assert.deepEqual(state.successes, ['Rules exported: 1']);
});

test('a file that cannot be made says so, and claims nothing', () => {
  for (const method of ['handleExport', 'handleExportShown']) {
    const state = fixture({ refuse: true });
    state.view[method]();
    assert.deepEqual(state.successes, [], method);
    assert.equal(state.errors.length, 1, method);
    assert.equal(state.errors[0], JSON.parse(read('_locales/en/messages.json')).statsExportFailed.message, method);
  }
});
