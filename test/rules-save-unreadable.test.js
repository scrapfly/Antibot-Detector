const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Stored rules that cannot be read (the storage did not answer, or the stored value is damaged) leave the rules in memory as the
// shipped ones, or as the ones read before. A save from there is a save of those over the person's custom rules, edits to official
// rules, switched-off rules and translations, so no save goes ahead while that lasts: not a switch in the Rules tab, a reset to
// official, an editor save, an add, a delete, a restore, a clear or an import that merges. Only an import with Replace all, which
// is the person choosing to replace the rules, writes them, and that repairs them. The same holds for the categories (their
// colours). The popup says so once. And while the rules stay unreadable, the worker does not read them again on every message:
// it waits a little, and reads at once when the key is written.

const { storageWorld, read, plain } = require('./helpers/unreadable-storage');

const realIndex = JSON.parse(read('detectors/index.json'));
const SHIPPED = { antibot: ['detect-akamai'], captcha: ['detect-hcaptcha'], fingerprint: ['detect-canvas-fingerprint'] };
const INDEX = { ...realIndex };
for (const [category, ids] of Object.entries(SHIPPED)) INDEX[category] = { ...realIndex[category], detectors: ids };

const FILES = ['modules/core/constants.js', 'modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/storage-manager.js',
  'utils/utils.js', 'modules/detection/managers/category-manager.js', 'modules/detection/rules/detector-schema.js',
  'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js'];

const DAMAGED = { timestamp: 'x', detectors: 'text' };
const MINE = { id: 'detect-mine', name: 'Mine', author: 'Me', version: '1.0.1', category: 'antibot', enabled: true, difficulty: 'Medium',
  detection: { cookie: [{ id: 'mine-cookie', name: 'mine_cookie', confidence: 80 }] } };

function world(store = {}) {
  const listeners = [];
  const w = storageWorld({ store, files: [], index: INDEX });
  w.ctx.chrome.storage.onChanged = { addListener: (fn) => listeners.push(fn) };
  w.ctx.chrome.runtime.getManifest = () => ({ version: '3.1.4' });
  for (const file of FILES) w.run(file);
  const categoryManager = new w.ctx.CategoryManager();
  const detectorManager = new w.ctx.DetectorManager(categoryManager);
  return {
    ...w, categoryManager, detectorManager,
    ruleWrites: () => w.writes.filter(key => key === 'scrapfly_detectors').length,
    categoryWrites: () => w.writes.filter(key => key === 'scrapfly_categories').length,
    // What chrome.storage.onChanged tells every context after a write elsewhere
    changed: (key, newValue) => { for (const fn of listeners) fn({ [key]: { newValue } }, 'local'); }
  };
}

/** A popup (or worker) whose stored rules are damaged: it comes up on the shipped rules. */
async function damaged() {
  const w = world({ scrapfly_detectors: plain(DAMAGED) });
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.storageState, 'unreadable');
  assert.equal(w.detectorManager.getDetectorCount(), 3, 'the shipped rules are in memory');
  w.writes.length = 0;
  return w;
}

const unchanged = (w) => {
  assert.equal(w.ruleWrites(), 0, 'nothing is written over the stored rules');
  assert.deepEqual(plain(w.store.scrapfly_detectors), DAMAGED, 'they are what they were');
};

// ---- Saves wait for rules that can be read

test('the reviewer\'s case: switching a rule off while the stored rules cannot be read writes nothing over them', async () => {
  const w = await damaged();
  w.detectorManager.getDetector('antibot', 'detect-akamai').enabled = false; // rules.js updateDetectorEnabledState
  await assert.rejects(w.detectorManager.saveDetectorsToStorage(), (error) => error.code === 'rules_unreadable');
  unchanged(w);
});

test('every way a rule change reaches the storage is refused while the rules cannot be read, and changes nothing in memory first', async () => {
  const w = await damaged();
  const dm = w.detectorManager;
  // The rule editor's save and Reset to official hand over a whole candidate
  const candidate = plain(dm.detectors);
  candidate.antibot['detect-mine'] = plain(MINE);
  await assert.rejects(dm.saveDetectorsToStorage(candidate), /cannot be read/);
  assert.equal(await dm.addDetector('antibot', 'detect-mine', plain(MINE)), false, 'add answers that it failed');
  await assert.rejects(dm.deleteDetector('antibot', 'detect-akamai'), /cannot be read/);
  assert.ok(dm.getDetector('antibot', 'detect-akamai'), 'the delete did not take the rule out of memory either');
  await assert.rejects(dm.clearCustomDetectors(), /cannot be read/);
  await assert.rejects(dm.restoreOfficialDetectors({ missing: [], updateOnly: [] }), /cannot be read/);
  await assert.rejects(dm.importDetectors({ detectors: { antibot: { 'detect-mine': plain(MINE) } } }, true), /cannot be read/);
  assert.equal(dm.findDetectorById('detect-mine'), null, 'nothing the refused saves held is in memory');
  unchanged(w);
  assert.deepEqual(w.writes, [], 'and no other key was written (the deleted-official list, the categories)');
});

test('an import with Replace all is the person replacing the rules: it writes them, and saves work again after it', async () => {
  const w = await damaged();
  const dm = w.detectorManager;
  assert.equal(await dm.importDetectors({ detectors: { antibot: { 'detect-mine': plain(MINE) } } }, false), true);
  assert.equal(w.ruleWrites(), 1);
  const stored = w.store.scrapfly_detectors.detectors;
  assert.ok(stored.antibot['detect-mine'] && stored.antibot['detect-akamai'], 'the imported rule beside the built-in ones');
  assert.notEqual(dm.storageState, 'unreadable');
  dm.getDetector('antibot', 'detect-akamai').enabled = false;
  await dm.saveDetectorsToStorage();
  assert.equal(w.store.scrapfly_detectors.detectors.antibot['detect-akamai'].enabled, false, 'the next change is saved');
});

test('a worker whose reload cannot read the rules keeps the ones it read, and does not save them over the stored ones', async () => {
  const w = world();
  await w.detectorManager.initialize(); // a first install: the shipped rules are saved
  const saved = plain(w.store.scrapfly_detectors);
  saved.detectors.antibot['detect-mine'] = plain(MINE);
  w.store.scrapfly_detectors = saved;
  w.detectorManager.initialized = false;
  await w.detectorManager.initialize();
  assert.ok(w.detectorManager.findDetectorById('detect-mine'));
  w.state.failGet = (key) => key === 'scrapfly_detectors';
  w.detectorManager.initialized = false; // RELOAD_DETECTORS
  await w.detectorManager.initialize();
  w.writes.length = 0;
  w.detectorManager.getDetector('antibot', 'detect-akamai').enabled = false;
  await assert.rejects(w.detectorManager.saveDetectorsToStorage(), /cannot be read/);
  assert.equal(w.ruleWrites(), 0);
  assert.equal(w.store.scrapfly_detectors.detectors.antibot['detect-akamai'].enabled, true);

  // Once a read works again, a save goes ahead
  w.state.failGet = null;
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.storageState, 'loaded');
  w.detectorManager.getDetector('antibot', 'detect-akamai').enabled = false;
  await w.detectorManager.saveDetectorsToStorage();
  assert.equal(w.store.scrapfly_detectors.detectors.antibot['detect-akamai'].enabled, false);
});

test('categories that could not be read are not saved over either: a colour sync writes nothing until they read', async () => {
  const categories = { categories: { ...plain(INDEX), antibot: { ...plain(INDEX.antibot), colour: '#123456' } }, totalCategories: 6 };
  const w = world({ scrapfly_categories: plain(categories), scrapfly_settings: { settings: { categoryColors: { antibot: '#abcdef' } } } });
  w.state.failGet = (key) => key === 'scrapfly_categories';
  await w.categoryManager.initialize();
  assert.equal(w.categoryManager.storageState, 'unreadable');
  w.state.failGet = null;
  await assert.rejects(w.categoryManager.saveToStorage(), /cannot be read/);
  assert.equal(await w.categoryManager.syncColorsFromSettings(), false, 'Settings → Save asks the worker to sync the colours');
  assert.equal(w.categoryWrites(), 0);
  assert.deepEqual(plain(w.store.scrapfly_categories), categories, 'the saved colour is still there');
  await w.categoryManager.initialize();
  assert.equal(w.categoryManager.getCategoryInfo('antibot').colour, '#abcdef', 'read again, then synced');
  assert.ok(w.categoryWrites() >= 1);
});

test('rules that read are saved as before, and a first install still saves the shipped ones', async () => {
  const w = world();
  await w.detectorManager.initialize();
  assert.ok(w.ruleWrites() >= 1);
  w.detectorManager.getDetector('antibot', 'detect-akamai').enabled = false;
  await w.detectorManager.saveDetectorsToStorage();
  assert.equal(w.store.scrapfly_detectors.detectors.antibot['detect-akamai'].enabled, false);
});

// ---- The worker does not read damaged rules again on every message

function workerWith(w) {
  // background/utilities.js's ensureDetectorManagerInitialized over the real DetectorManager of the world
  w.ctx.detectorManager = w.detectorManager;
  w.ctx.categoryManager = w.categoryManager;
  w.ctx.detectorInitializationPromise = null;
  w.run('background/utilities.js');
  return () => w.ctx.ensureDetectorManagerInitialized();
}

const ruleReads = (w) => w.reads.filter(keys => keys.includes('scrapfly_detectors')).length;

function counted(store) {
  const w = world(store);
  w.reads = [];
  const get = w.ctx.chrome.storage.local.get;
  w.ctx.chrome.storage.local.get = async (keys) => { w.reads.push([].concat(keys)); return get(keys); };
  return w;
}

test('while the stored rules stay damaged, messages do not each read them again; the shipped rules serve meanwhile', async () => {
  const w = counted({ scrapfly_detectors: plain(DAMAGED) });
  const ensure = workerWith(w);
  const first = await ensure();
  assert.equal(first.getDetectorCount(), 3);
  const afterFirst = ruleReads(w);
  assert.ok(afterFirst >= 1);
  for (let i = 0; i < 50; i++) assert.equal((await ensure()).getDetectorCount(), 3);
  assert.equal(ruleReads(w), afterFirst, 'fifty messages, no new read of the rules');
  assert.equal(w.ruleWrites(), 0);
});

test('a repair is picked up at once: the write of the key ends the wait, and the next message reads it', async () => {
  const w = counted({ scrapfly_detectors: plain(DAMAGED) });
  const ensure = workerWith(w);
  await ensure();
  const repaired = { detectors: { antibot: { 'detect-mine': plain(MINE) } }, totalCount: 1, writer: 'popup' };
  w.store.scrapfly_detectors = plain(repaired);
  w.changed('scrapfly_detectors', plain(repaired));
  const manager = await ensure();
  assert.equal(manager.initialized, true);
  assert.ok(manager.findDetectorById('detect-mine'), 'the repaired rules are in use');
});

test('the wait ends by itself, so rules that become readable without a write (the storage answers again) are read', async () => {
  const w = counted({ scrapfly_detectors: { detectors: { antibot: { 'detect-mine': plain(MINE) } } } });
  w.state.failGet = (key) => key === 'scrapfly_detectors';
  const ensure = workerWith(w);
  await ensure();
  w.state.failGet = null;
  assert.equal((await ensure()).initialized, false, 'still waiting');
  w.detectorManager.readRetryAt = Date.now() - 1; // the wait is over
  const manager = await ensure();
  assert.equal(manager.initialized, true);
  assert.ok(manager.findDetectorById('detect-mine'));
  assert.ok(w.ctx.DetectorManager.UNREADABLE_RETRY_MS >= 1000 && w.ctx.DetectorManager.UNREADABLE_RETRY_MS <= 60000, 'a short wait');
});

test('an explicit reload (RELOAD_DETECTORS, the popup opening) still reads at once', async () => {
  const w = counted({ scrapfly_detectors: plain(DAMAGED) });
  const ensure = workerWith(w);
  await ensure();
  const before = ruleReads(w);
  w.detectorManager.initialized = false;
  await w.detectorManager.initialize();
  assert.equal(ruleReads(w), before + 1);
});

// ---- The popup says so, once

function popupWith(storageState) {
  const toasts = [];
  const asked = [];
  const context = vm.createContext({
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { debug() {}, error() {}, popup() {}, warn() {} },
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    WorkerMessages: require('../modules/core/worker-messages.js'),
    FormatUtils: { t: (key, fallback) => { asked.push(key); return fallback; } },
    NotificationHelper: { error: (text) => toasts.push(text) },
    chrome: { runtime: { sendMessage: async () => undefined } }
  });
  vm.runInContext(`${read('popup.js')}\nthis.ScrapflyPopup = ScrapflyPopup;`, context, { filename: 'popup.js' });
  const popup = Object.create(context.ScrapflyPopup.prototype);
  popup.detectorManager = { storageState };
  return { popup, toasts, asked };
}

test('the popup says once that the stored rules cannot be read and that changes are not saved; nothing when they read', () => {
  const h = popupWith('unreadable');
  assert.equal(typeof h.popup.warnIfRulesUnreadable, 'function');
  h.popup.warnIfRulesUnreadable();
  h.popup.warnIfRulesUnreadable();
  assert.equal(h.toasts.length, 1, 'once');
  assert.deepEqual(h.asked, ['rulesUnreadableHint']);
  assert.match(h.toasts[0], /not saved/);
  assert.match(h.toasts[0], /Replace all/, 'it names what replaces them');
  for (const state of ['loaded', 'absent', 'empty', undefined]) {
    const ok = popupWith(state);
    ok.popup.warnIfRulesUnreadable();
    assert.deepEqual(ok.toasts, [], String(state));
  }
  const popup = read('popup.js');
  assert.ok(/await this\.detectorManager\.initialize\(\);\s*\}\s*this\.warnIfRulesUnreadable\(\);/.test(popup), 'asked right after the popup loads the rules');
});

test('the text is in every language, translated, and the popup falls back to the English one', () => {
  const english = JSON.parse(read('_locales/en/messages.json')).rulesUnreadableHint;
  assert.ok(english && english.description && english.description.length > 20);
  const fallback = /FormatUtils\.t\('rulesUnreadableHint', '([^']+)'\)/.exec(read('popup.js'));
  assert.equal(fallback && fallback[1], english.message);
  for (const locale of fs.readdirSync(path.join(__dirname, '..', '_locales'))) {
    const entry = JSON.parse(read(`_locales/${locale}/messages.json`)).rulesUnreadableHint;
    assert.ok(entry && entry.message.trim().length > 40, locale);
    if (locale !== 'en') assert.notEqual(entry.message, english.message, `${locale} is translated`);
  }
});
