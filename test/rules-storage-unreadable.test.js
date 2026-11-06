const { test } = require('node:test');
const assert = require('node:assert/strict');

// The rules (scrapfly_detectors) and the categories (scrapfly_categories) are saved back whole, so a read that went wrong must
// never end in a save of what the worker made up in its place. The storage can fail to answer (a rejected read), and a stored
// value can be damaged (text that is not JSON). Both used to read as "nothing is stored", and the start-up and every reload after a
// rule save then wrote the shipped rules over the stored ones: a cold worker lost the custom rules, the edits to official rules,
// the switched-off detectors and the translations; a running worker kept its custom rules but lost the other three.
// Now only a key that is not there at all (a first install) is filled from the shipped files and saved. A key that cannot be read
// leaves the rules as the worker has them (the shipped ones while it has none), writes nothing, and is tried again at the next
// initialize(). The real StorageManager, CategoryManager and DetectorManager run here in a vm context, with a storage the test controls.

const { storageWorld, read, plain } = require('./helpers/unreadable-storage');

// A shipped index of three rules, so that a start-up reads three files and not eighty-six
const realIndex = JSON.parse(read('detectors/index.json'));
const SHIPPED = { antibot: ['detect-akamai'], captcha: ['detect-hcaptcha'], fingerprint: ['detect-canvas-fingerprint'] };
const INDEX = { ...realIndex };
for (const [category, ids] of Object.entries(SHIPPED)) INDEX[category] = { ...realIndex[category], detectors: ids };
const shipped = (category, id) => JSON.parse(read(`detectors/${category}/${id}.json`));

const FILES = ['modules/core/constants.js', 'modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/storage-manager.js',
  'utils/utils.js', 'modules/detection/managers/category-manager.js', 'modules/detection/rules/detector-schema.js',
  'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js', 'modules/detection/rules/update-manager.js'];

function world({ store = {}, settings } = {}) {
  if (settings !== undefined) store.scrapfly_settings = settings;
  const w = storageWorld({ store, files: FILES, index: INDEX });
  const categoryManager = new w.ctx.CategoryManager();
  const detectorManager = new w.ctx.DetectorManager(categoryManager);
  return {
    ...w, categoryManager, detectorManager,
    StorageManager: w.ctx.StorageManager,
    shippedFiles: () => w.fetched.filter(url => /^detectors\/[a-z]+\/detect-/.test(url)).length,
    detectorWrites: () => w.writes.filter(key => key === 'scrapfly_detectors').length,
    categoryWrites: () => w.writes.filter(key => key === 'scrapfly_categories').length,
    storedRules: () => { const raw = w.store.scrapfly_detectors; return typeof raw === 'string' ? raw : raw && raw.detectors; }
  };
}

/** The rules a person has by now: one of their own, a shipped one they edited and switched off, a shipped one switched off. */
function personalRules() {
  const original = shipped('antibot', 'detect-akamai');
  const edited = JSON.parse(JSON.stringify(original));
  edited.enabled = false;
  edited.detection.cookie = [{ id: 'my-cookie', name: 'my_cookie', confidence: 77 }];
  edited.userModified = true;
  edited.officialSnapshot = original;
  const hcaptcha = shipped('captcha', 'detect-hcaptcha');
  hcaptcha.enabled = false;
  const mine = { id: 'detect-mine', name: 'Mine', author: 'Me', version: '1.0.1', category: 'antibot', enabled: true, difficulty: 'Medium',
    nameI18n: { es: 'Mía' }, detection: { cookie: [{ id: 'mine-cookie', name: 'mine_cookie', confidence: 80 }] } };
  return {
    antibot: { 'detect-akamai': edited, 'detect-mine': mine },
    captcha: { 'detect-hcaptcha': hcaptcha },
    fingerprint: { 'detect-canvas-fingerprint': shipped('fingerprint', 'detect-canvas-fingerprint') }
  };
}

/** A start with nothing stored, whose saved rules a person then changes: the state every later test starts from. */
async function installed() {
  const w = world();
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.initialized, true);
  const rules = personalRules();
  w.store.scrapfly_detectors = { timestamp: '2026-11-06T00:00:00.000Z', detectors: rules, totalCount: 4, writer: 'popup' };
  w.writes.length = 0;
  return { w, rules };
}

const keepsEverything = (dm, rules) => {
  assert.equal(dm.detectors.antibot['detect-mine'].name, 'Mine', 'the custom rule');
  assert.deepEqual(plain(dm.detectors.antibot['detect-mine'].nameI18n), { es: 'Mía' }, 'its translation');
  assert.equal(dm.detectors.antibot['detect-akamai'].enabled, false, 'the shipped rule that was switched off');
  assert.equal(dm.detectors.antibot['detect-akamai'].userModified, true, 'and the edit to it');
  assert.equal(dm.detectors.antibot['detect-akamai'].detection.cookie[0].name, 'my_cookie');
  assert.equal(dm.detectors.captcha['detect-hcaptcha'].enabled, false);
  void rules;
};

// ---- StorageManager.batchReadStrict: a read that says what it found

const CONFIGS = [{ primary: 'scrapfly_categories', legacy: 'scrapfly_categories.json' }, { primary: 'scrapfly_detectors', legacy: 'scrapfly_detectors.json' }];

test('batchReadStrict tells a key that is not there from one that is damaged, and throws when the storage does not answer', async () => {
  const w = world({ store: { scrapfly_detectors: '{ not json', scrapfly_categories: { categories: { antibot: { colour: '#111111' } } } } });
  const { values, states } = await w.StorageManager.batchReadStrict(CONFIGS);
  assert.deepEqual(plain(states), { scrapfly_categories: 'ok', scrapfly_detectors: 'damaged' });
  assert.equal(values.scrapfly_detectors, null);
  assert.equal(values.scrapfly_categories.categories.antibot.colour, '#111111');
  assert.equal(w.store.scrapfly_detectors, '{ not json', 'what is stored is left as it is');
  assert.equal(w.writes.length, 0);

  for (const damaged of [42, '"text"', '[]', '', 'null', true]) {
    const other = world({ store: { scrapfly_detectors: damaged } });
    const read = await other.StorageManager.batchReadStrict([CONFIGS[1]]);
    assert.equal(read.states.scrapfly_detectors, 'damaged', JSON.stringify(damaged));
  }

  const empty = await world().StorageManager.batchReadStrict(CONFIGS);
  assert.deepEqual(plain(empty.states), { scrapfly_categories: 'absent', scrapfly_detectors: 'absent' });
  assert.deepEqual(plain(empty.values), { scrapfly_categories: null, scrapfly_detectors: null });

  const failing = world();
  failing.state.failGet = () => true;
  await assert.rejects(failing.StorageManager.batchReadStrict(CONFIGS), /storage is unavailable/);
});

test('batchReadStrict reads what older builds stored (JSON text, a legacy key) and writes it back as an object, best effort', async () => {
  const text = JSON.stringify({ detectors: { antibot: { a: { id: 'a' } } } });
  const w = world({ store: { scrapfly_detectors: text, 'scrapfly_categories.json': { categories: { antibot: { colour: '#222222' } } } } });
  const { values, states } = await w.StorageManager.batchReadStrict(CONFIGS);
  assert.deepEqual(plain(states), { scrapfly_categories: 'ok', scrapfly_detectors: 'ok' });
  assert.deepEqual(plain(values.scrapfly_detectors), { detectors: { antibot: { a: { id: 'a' } } } });
  assert.deepEqual(plain(w.store.scrapfly_detectors), { detectors: { antibot: { a: { id: 'a' } } } }, 'the text is an object now');
  assert.deepEqual(plain(w.store.scrapfly_categories), { categories: { antibot: { colour: '#222222' } } }, 'the legacy key moved to the primary one');
  assert.equal('scrapfly_categories.json' in w.store, false);

  // A write that fails costs nothing that was read
  const stuck = world({ store: { scrapfly_detectors: text } });
  stuck.ctx.chrome.storage.local.set = async () => { throw new Error('quota'); };
  const again = await stuck.StorageManager.batchReadStrict([CONFIGS[1]]);
  assert.equal(again.states.scrapfly_detectors, 'ok');
  assert.deepEqual(plain(again.values.scrapfly_detectors), { detectors: { antibot: { a: { id: 'a' } } } });
});

test('batchLoadStorage still answers {} when anything goes wrong, for the callers that only read', async () => {
  const w = world();
  w.state.failGet = () => true;
  assert.deepEqual(plain(await w.StorageManager.batchLoadStorage(CONFIGS)), {});
});

// ---- First install: nothing stored, so the shipped rules are loaded and saved

test('a first install loads the shipped rules and categories and saves both', async () => {
  const w = world();
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.initialized, true);
  assert.equal(w.categoryManager.initialized, true);
  assert.equal(w.detectorManager.getDetectorCount(), 3);
  assert.deepEqual(Object.keys(w.storedRules()).sort(), ['antibot', 'captcha', 'fingerprint']);
  assert.ok(w.detectorWrites() >= 1 && w.categoryWrites() >= 1, 'the first start fills both keys');
});

// ---- The rules cannot be read

test('a worker that starts while the storage does not answer uses the shipped rules, writes nothing, and loads the stored ones when it can', async () => {
  const { w, rules } = await installed();
  const before = plain(w.store);
  const cold = world({ store: w.store });
  cold.state.failGet = () => true;
  await cold.detectorManager.initialize();
  assert.equal(cold.writes.length, 0, 'nothing is written: not the rules, not the categories');
  assert.deepEqual(plain(cold.store), before, 'what is stored is exactly what was');
  assert.equal(cold.detectorManager.getDetectorCount(), 3, 'scans go on with the shipped rules meanwhile');
  assert.equal(cold.detectorManager.initialized, false, 'so the next initialize() reads again');

  // Still unreadable: the shipped rules are not fetched again, and nothing is written
  const fetchedBefore = cold.shippedFiles();
  assert.equal(fetchedBefore, 3, 'the shipped files were read once');
  await cold.detectorManager.initialize();
  assert.equal(cold.shippedFiles(), fetchedBefore);
  assert.equal(cold.writes.length, 0);
  assert.equal(cold.detectorManager.initialized, false);

  cold.state.failGet = null;
  await cold.detectorManager.initialize();
  assert.equal(cold.detectorManager.initialized, true);
  keepsEverything(cold.detectorManager, rules);
  assert.equal(cold.detectorWrites(), 0, 'and what it loaded is not saved over itself');
});

test('stored rules that are not JSON are left as they are: the worker neither saves the shipped rules over them nor stops', async () => {
  for (const damaged of ['{ not json', '', 'null', '[]', '42', { timestamp: 'x', totalCount: 4 }, { detectors: 'text' }, { detectors: [] }]) {
    const { w } = await installed();
    w.store.scrapfly_detectors = damaged;
    const cold = world({ store: w.store });
    await cold.detectorManager.initialize();
    assert.equal(cold.detectorWrites(), 0, `${JSON.stringify(damaged)}: no save`);
    assert.deepEqual(plain(cold.store.scrapfly_detectors), damaged, 'the stored value is what it was');
    assert.equal(cold.detectorManager.getDetectorCount(), 3, 'the shipped rules serve meanwhile');
    assert.equal(cold.detectorManager.initialized, false, 'and the next initialize() tries again');
  }
});

test('a reload that cannot read the rules keeps the worker\'s own, the edits and the switched-off flags included, and writes nothing', async () => {
  for (const spoil of [(w) => { w.state.failGet = (key) => key === 'scrapfly_detectors'; }, (w) => { w.store.scrapfly_detectors = '{ not json'; }]) {
    const { w, rules } = await installed();
    // The worker has them in memory, as after a normal start
    w.detectorManager.initialized = false;
    await w.detectorManager.initialize();
    assert.equal(w.detectorManager.initialized, true);
    keepsEverything(w.detectorManager, rules);
    w.writes.length = 0;
    const before = plain(w.store.scrapfly_detectors);

    spoil(w);
    // What RELOAD_DETECTORS does after a rule is saved
    w.detectorManager.initialized = false;
    await w.detectorManager.initialize();
    assert.equal(w.detectorWrites(), 0, 'the stored rules are not overwritten');
    if (typeof w.store.scrapfly_detectors !== 'string') assert.deepEqual(plain(w.store.scrapfly_detectors), before);
    keepsEverything(w.detectorManager, rules);
    assert.equal(w.detectorManager.initialized, false, 'tried again at the next initialize()');
  }
});

test('the next initialize() picks the rules up once they can be read, and keeps what the person saved meanwhile', async () => {
  const { w, rules } = await installed();
  w.state.failGet = (key) => key === 'scrapfly_detectors';
  w.detectorManager.initialized = false;
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.initialized, false);
  w.state.failGet = null;
  const saved = plain(rules);
  saved.antibot['detect-later'] = { ...plain(rules.antibot['detect-mine']), id: 'detect-later', name: 'Later' };
  w.store.scrapfly_detectors = { detectors: saved, totalCount: 5, writer: 'popup' };
  await w.detectorManager.initialize();
  assert.equal(w.detectorManager.initialized, true);
  assert.equal(w.detectorManager.detectors.antibot['detect-later'].name, 'Later');
  keepsEverything(w.detectorManager, rules);
  assert.equal(w.detectorWrites(), 0);
});

test('the failure is told once as the kind of error, never with the text that was stored', async () => {
  const { w } = await installed();
  // (a JSON error quotes the start of a text that does not begin like JSON)
  w.store.scrapfly_detectors = 'S3CR3T-RULE-TEXT is not JSON';
  const cold = world({ store: w.store });
  await cold.detectorManager.initialize();
  await cold.detectorManager.initialize();
  await cold.detectorManager.initialize();
  const told = cold.warnings.filter(([, , message]) => /stored rules/i.test(String(message)));
  assert.equal(told.length, 1, 'one line for three tries');
  assert.ok(!JSON.stringify(cold.warnings).includes('S3CR3T'), 'a JSON error quotes the text: it is not logged');
});

// ---- What is repaired, and what is loaded as before

test('rules saved as text for a known method are still the old damage: repaired from the shipped rules and saved', async () => {
  const { w } = await installed();
  const damaged = plain(personalRules());
  damaged.antibot['detect-mine'].detection = { cookie: '[{"name":"x"}]' };
  w.store.scrapfly_detectors = { detectors: damaged };
  const cold = world({ store: w.store });
  await cold.detectorManager.initialize();
  assert.equal(cold.detectorManager.initialized, true);
  assert.ok(cold.detectorWrites() >= 1, 'the repair is saved');
  assert.deepEqual(Object.keys(cold.storedRules().antibot), ['detect-akamai'], 'the shipped rules are what is stored');
});

test('stored rules are loaded as they are, with nothing written back', async () => {
  const { w, rules } = await installed();
  const cold = world({ store: w.store });
  await cold.detectorManager.initialize();
  assert.equal(cold.detectorManager.initialized, true);
  keepsEverything(cold.detectorManager, rules);
  assert.equal(cold.detectorWrites(), 0);
});

test('stored rules that hold no rule at all are filled from the shipped ones, as before: there is nothing there to lose', async () => {
  const { w } = await installed();
  w.store.scrapfly_detectors = { detectors: { antibot: {}, captcha: {}, fingerprint: {} } };
  const cold = world({ store: w.store });
  await cold.detectorManager.initialize();
  assert.equal(cold.detectorManager.initialized, true);
  assert.equal(cold.detectorManager.getDetectorCount(), 3);
  assert.ok(cold.detectorWrites() >= 1);
});

// ---- The categories cannot be read

test('categories that cannot be read are not saved over: the shipped ones serve, and the saved colours come back with the next read', async () => {
  const stored = { timestamp: 'x', categories: { ...plain(INDEX), antibot: { ...plain(INDEX.antibot), colour: '#123456' } }, totalCategories: 6 };
  const { w } = await installed();
  w.store.scrapfly_categories = stored;
  const cold = world({ store: w.store });
  cold.state.failGet = (key) => key === 'scrapfly_categories';
  await cold.categoryManager.initialize();
  assert.equal(cold.categoryWrites(), 0, 'the saved categories are not overwritten');
  assert.deepEqual(plain(cold.store.scrapfly_categories), stored);
  assert.equal(cold.categoryManager.initialized, false, 'so it tries again');
  assert.ok(Object.keys(cold.categoryManager.getAllCategories()).includes('antibot'), 'the shipped categories serve meanwhile');

  cold.state.failGet = null;
  await cold.categoryManager.initialize();
  assert.equal(cold.categoryManager.initialized, true);
  assert.equal(cold.categoryManager.getCategoryInfo('antibot').colour, '#123456', 'the saved colour is read');
});

test('categories that are damaged are rebuilt from the shipped index and the colours in Settings, which is all they hold', async () => {
  const w = world({ store: { scrapfly_categories: '{ not json' },
    settings: JSON.stringify({ settings: { categoryColors: { antibot: '#abcdef' } } }) });
  await w.categoryManager.initialize();
  assert.equal(w.categoryManager.initialized, true);
  assert.equal(w.categoryManager.getCategoryInfo('antibot').colour, '#abcdef');
  assert.equal(w.store.scrapfly_categories.categories.antibot.colour, '#abcdef', 'saved again');
});

test('a worker whose storage does not answer at all starts with the shipped rules and categories and changes nothing stored', async () => {
  const { w, rules } = await installed();
  w.store.scrapfly_categories = { categories: plain(INDEX), totalCategories: 6 };
  const before = plain(w.store);
  const cold = world({ store: w.store });
  cold.state.failGet = () => true;
  await cold.detectorManager.initialize();
  assert.deepEqual(plain(cold.store), before);
  assert.equal(cold.writes.length, 0);
  cold.state.failGet = null;
  await cold.detectorManager.initialize();
  keepsEverything(cold.detectorManager, rules);
  assert.equal(cold.writes.length, 0);
});

// ---- Rules → Update reads the rules too

const pending = { id: 'detect-new', category: 'antibot', localVersion: '0.0.0', remoteVersion: '2.0.0', source: 'github', tag: 'v9.9.9' };
const incoming = { id: 'detect-new', name: 'New', author: 'Scrapfly', version: '2.0.0', category: 'antibot', enabled: true, difficulty: 'Medium',
  detection: { cookie: [{ id: 'new-cookie', name: 'new_cookie', confidence: 80 }] } };

test('an update never saves over rules it could not read: a damaged value stops it, and is not an empty rule set', async () => {
  for (const damaged of ['{ not json', '', '[]', '42', { timestamp: 'x', totalCount: 3 }, { detectors: 'text' }]) {
    const w = world({ store: { scrapfly_detectors: damaged, scrapfly_pending_updates: [pending] } });
    const UM = w.ctx.UpdateManager;
    await assert.rejects(UM.loadStoredDetectors(), /stored rules/, JSON.stringify(damaged));
    await assert.rejects(UM.commitDetectors(() => true), /stored rules/);
    UM.fetchUpdateSource = async () => plain(incoming);
    const result = await UM.applyUpdates();
    assert.equal(result.success, false, 'the update did not run');
    assert.equal(w.detectorWrites(), 0, 'and wrote nothing');
    assert.deepEqual(plain(w.store.scrapfly_detectors), damaged);
    assert.deepEqual(plain(w.store.scrapfly_pending_updates), [pending], 'the update is still waiting');
  }
});

test('an update still installs into the rules that are stored, and into none stored yet', async () => {
  const { w, rules } = await installed();
  const UM = w.ctx.UpdateManager;
  UM.fetchUpdateSource = async () => plain(incoming);
  w.store.scrapfly_pending_updates = [pending];
  const result = await UM.applyUpdates();
  assert.equal(result.success, true);
  assert.deepEqual(plain(result.installed.map(item => item.id)), ['detect-new']);
  const now = w.storedRules();
  assert.ok(now.antibot['detect-new'] && now.antibot['detect-mine'] && now.antibot['detect-akamai'], 'the new rule joins the others');
  assert.equal(now.antibot['detect-akamai'].userModified, true);
  void rules;

  assert.deepEqual(plain(await world().ctx.UpdateManager.loadStoredDetectors()), {}, 'nothing stored is an empty set');
  assert.deepEqual(plain(await world({ store: { scrapfly_detectors: { detectors: {} } } }).ctx.UpdateManager.loadStoredDetectors()), {}, 'so is a saved empty one');
});
