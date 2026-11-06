const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The Rules tab's Update badge (how many updates wait) and its notice (updates that need a newer extension) were read once, when the
// tab was first drawn. Settings → Data → Clear "Pending rule updates" and Settings → Check now write the same storage keys while the
// tab is open behind the dialog, so the badge and the notice stayed until the popup was opened again. The tab now watches the keys.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PENDING = 'scrapfly_pending_updates';
const INCOMPATIBLE = 'scrapfly_incompatible_updates';
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const stored = { [PENDING]: [{ id: 'a' }, { id: 'b' }], [INCOMPATIBLE]: [{ id: 'c', name: 'Rule C', minExtensionVersion: '9.0' }] };
  const listeners = new Set();
  const reads = { count: 0, fail: false };
  const classes = new Set();
  const badge = { style: { display: 'none' }, textContent: '0' };
  const button = { addEventListener() {}, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } };
  const noticeText = { textContent: '' };
  const notice = { hidden: true, querySelector: (selector) => (selector === '.rules-ext-notice-text' ? noticeText : null) };
  const elements = { '#updatesBadge': badge, '#checkUpdatesBtn': button, '#rulesExtensionNotice': notice };
  const context = vm.createContext({
    console, Logger: { debug() {}, error() {}, warn() {} },
    chrome: { storage: { onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } } },
    document: { querySelector: (selector) => elements[selector] || null, querySelectorAll: () => [], addEventListener() {} },
    FormatUtils: { t: (key, fallback) => fallback, formatList: (list) => list.join(', ') },
    RulesFilter: { normalizeChips: () => ({}) },
    UpdateManager: {
      STORAGE_KEYS: { PENDING_UPDATES: PENDING, INCOMPATIBLE_UPDATES: INCOMPATIBLE },
      getPendingUpdatesCount: async () => { reads.count++; if (reads.fail) throw new Error('storage unavailable'); return (stored[PENDING] || []).length; },
      getIncompatibleUpdates: async () => stored[INCOMPATIBLE] || [],
      resultMessages: (result) => [{ type: 'warning', text: `Waiting for a newer extension: ${result.incompatible.map(update => update.name).join(', ')}` }]
    }
  });
  vm.runInContext(read('sections/rules/rules.js'), context, { filename: 'rules.js' });
  vm.runInContext(read('sections/rules/rules-handlers.js'), context, { filename: 'rules-handlers.js' });
  const Rules = vm.runInContext('Rules', context);
  const view = Object.create(Rules.prototype);
  // What setupEventListeners also wires has its own tests; only the update watch is under test here
  view.setupMenuListeners = () => {};
  view.setupModalEventListeners = () => {};
  const fire = (changes, area = 'local') => { for (const listener of [...listeners]) listener(changes, area); };
  return { view, stored, listeners, reads, badge, button, classes, notice, noticeText, fire };
}

test('the badge and the notice are drawn when the tab is set up', async () => {
  const f = fixture();
  f.view.setupEventListeners();
  await settle();
  assert.equal(String(f.badge.textContent), '2');
  assert.equal(f.badge.style.display, 'flex');
  assert.equal(f.classes.has('has-updates'), true);
  assert.equal(f.notice.hidden, false);
  assert.match(f.noticeText.textContent, /Rule C/);
});

test('Settings → Data → Clear pending rule updates empties the badge and hides the notice without reopening the popup', async () => {
  const f = fixture();
  f.view.setupEventListeners();
  await settle();
  assert.equal(f.badge.style.display, 'flex', 'two updates wait');
  // What the Clear button does: remove the three keys
  delete f.stored[PENDING];
  delete f.stored[INCOMPATIBLE];
  f.fire({ [PENDING]: { oldValue: [{ id: 'a' }, { id: 'b' }] }, [INCOMPATIBLE]: { oldValue: [{ id: 'c' }] } });
  await settle();
  assert.equal(f.badge.style.display, 'none', 'no badge');
  assert.equal(f.classes.has('has-updates'), false);
  assert.equal(f.notice.hidden, true, 'no notice');
});

test('Settings → Check now that finds updates raises the badge and shows the notice', async () => {
  const f = fixture();
  f.stored[PENDING] = [];
  f.stored[INCOMPATIBLE] = [];
  f.view.setupEventListeners();
  await settle();
  assert.equal(f.badge.style.display, 'none');
  assert.equal(f.notice.hidden, true);
  f.stored[PENDING] = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  f.fire({ [PENDING]: { newValue: f.stored[PENDING] } });
  await settle();
  assert.equal(String(f.badge.textContent), '3');
  assert.equal(f.badge.style.display, 'flex');
  f.stored[INCOMPATIBLE] = [{ id: 'n', name: 'New rule', minExtensionVersion: '9.1' }];
  f.fire({ [INCOMPATIBLE]: { newValue: f.stored[INCOMPATIBLE] } });
  await settle();
  assert.equal(f.notice.hidden, false);
  assert.match(f.noticeText.textContent, /New rule/);
});

test('other keys, other storage areas and a missing change list read nothing', async () => {
  const f = fixture();
  f.view.setupEventListeners();
  await settle();
  const before = f.reads.count;
  f.fire({ scrapfly_settings: { newValue: {} } });
  f.fire({ [PENDING]: { newValue: [] } }, 'sync');
  f.fire({ [PENDING]: { newValue: [] } }, 'session');
  f.fire(undefined);
  await settle();
  assert.equal(f.reads.count, before);
});

test('setting the tab up again keeps one watcher; leaving the tab removes it; coming back reads what changed meanwhile', async () => {
  const f = fixture();
  f.view.setupEventListeners();
  f.view.setupEventListeners();
  assert.equal(f.listeners.size, 1, 'the popup sets the tab up again on every visit: still one watcher');
  await settle();
  assert.equal(typeof f.view.cleanup, 'function', 'the popup calls cleanup() on the section it leaves');
  f.view.cleanup();
  assert.equal(f.listeners.size, 0, 'nothing watches while another tab is shown');
  f.view.cleanup();
  assert.equal(f.listeners.size, 0, 'cleaning up twice is harmless');
  // Cleared while the tab was away
  delete f.stored[PENDING];
  delete f.stored[INCOMPATIBLE];
  await settle();
  assert.equal(f.badge.style.display, 'flex', 'not read while away');
  f.view.setupEventListeners();
  await settle();
  assert.equal(f.listeners.size, 1);
  assert.equal(f.badge.style.display, 'none', 'coming back shows what is stored now');
  assert.equal(f.notice.hidden, true);
});

test('a store that cannot be read empties the badge and keeps watching', async () => {
  const f = fixture();
  f.view.setupEventListeners();
  await settle();
  assert.equal(f.badge.style.display, 'flex');
  f.reads.fail = true;
  f.fire({ [PENDING]: { newValue: [] } });
  await settle();
  assert.equal(f.badge.style.display, 'none');
  assert.equal(f.listeners.size, 1, 'still watching');
  f.reads.fail = false;
  f.stored[PENDING] = [{ id: 'q' }];
  f.fire({ [PENDING]: { newValue: f.stored[PENDING] } });
  await settle();
  assert.equal(String(f.badge.textContent), '1');
  assert.equal(f.badge.style.display, 'flex');
});
