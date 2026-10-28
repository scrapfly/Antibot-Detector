const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.Logger = new Proxy({}, { get: () => () => {} });
global.DetectionUtils = require('../utils/detection-utils.js');
const DetectorManager = require('../modules/detection/rules/detector-manager.js');
const plain = value => JSON.parse(JSON.stringify(value));
const root = path.join(__dirname, '..');
const fixture = () => ({ id: 'detect-custom', name: 'Custom', category: 'antibot', version: '1.0', author: 'Tester', enabled: false,
  difficulty: 'Low', difficultyChosen: true, futureMetadata: { untouched: true }, nameI18n: { es: 'Personalizada' },
  detection: { cookie: [{ id: 'session', name: 'original', confidence: 50, descriptionI18n: { es: 'Sesión' } }] } });

function editor({ isNew = false } = {}) {
  const errors = [];
  const messages = [];
  const saveButton = { disabled: false };
  const modal = { style: { display: 'flex' } };
  const fields = {
    '#detectorNameInput': { value: 'Edited custom' }, '#detectorCategorySelect': { value: 'antibot' },
    '#detectorDifficultySelect': { value: 'Low' }, '#detectorAuthorInput': { value: 'Tester' },
    '#saveRuleEdit': saveButton, '#editRuleModal': modal
  };
  const ctx = { WorkerMessages: require('../modules/core/worker-messages.js'), Rules: function() {}, DetectorManager, DetectionUtils, Logger, JSON, Date, console,
    document: { querySelector: key => fields[key] || null, body: { style: { overflow: 'hidden' } } },
    chrome: { runtime: { sendMessage: (message, cb) => { messages.push(message); cb?.(); }, getURL: value => value } },
    NotificationHelper: { error: value => errors.push(value) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor-modal.js'), 'utf8'), ctx);
  const rules = new ctx.Rules();
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = { antibot: { 'detect-custom': fixture() } };
  rules.detectorManager = dm;
  const original = fixture();
  rules.currentEditDetector = { detector: plain(original), original: plain(original), originalCategory: 'antibot', category: 'antibot',
    detectorName: 'detect-custom', originalDetection: plain(original.detection), originalCombinations: [], isNew, isOfficial: false };
  rules.clearPatternValidationState = () => {};
  rules.validatePatternRows = () => ({ isValid: true });
  rules.clearAuthorError = () => {};
  rules.buildCombinationsForSave = () => ({ invalidIndex: -1, combinations: [] });
  rules._collectDetectionFromForm = () => ({ cookie: [{ ...original.detection.cookie[0], name: 'edited' }] });
  rules.resolveDetectorNameForSave = value => value;
  let renders = 0;
  rules.displayRules = () => { renders++; };
  return { rules, dm, errors, messages, saveButton, fields, modal, get renders() { return renders; } };
}

test('rule edits remain staged until persistence succeeds; duplicate clicks and closing cannot interrupt saving', async () => {
  let finish;
  let writes = 0;
  global.StorageManager = { saveToStorage: async () => { writes++; return new Promise(resolve => { finish = resolve; }); } };
  const state = editor();
  const before = plain(state.dm.detectors);
  const save = state.rules.saveRule();
  assert.equal(state.saveButton.disabled, true);
  assert.deepEqual(state.dm.detectors, before);
  assert.equal(state.renders, 0);
  assert.equal(state.messages.length, 0);
  state.rules.closeEditModal();
  assert.equal(state.modal.style.display, 'flex');
  assert.equal(await state.rules.saveRule(), false);
  assert.equal(writes, 1);
  finish(true);
  assert.equal(await save, true);
  assert.equal(state.dm.detectors.antibot['detect-custom'].detection.cookie[0].name, 'edited');
  assert.equal(state.dm.detectors.antibot['detect-custom'].version, '1.0.1');
  assert.equal(state.modal.style.display, 'none');
  assert.equal(state.renders, 1);
  assert.equal(state.messages.length, 1);
  assert.equal(state.saveButton.disabled, false);
});

test('a failed edit keeps the modal and form for retry without mutating rules or incrementing the version twice', async () => {
  const state = editor();
  const before = plain(state.dm.detectors);
  const draft = state.rules.currentEditDetector;
  global.StorageManager = { saveToStorage: async () => false };
  assert.equal(await state.rules.saveRule(), false);
  assert.deepEqual(state.dm.detectors, before);
  assert.equal(state.rules.currentEditDetector, draft);
  assert.equal(draft.detector.version, '1.0');
  assert.equal(state.fields['#detectorNameInput'].value, 'Edited custom');
  assert.equal(state.modal.style.display, 'flex');
  assert.equal(state.saveButton.disabled, false);
  assert.equal(state.errors.length, 1);
  assert.equal(state.messages.length, 0);
  global.StorageManager = { saveToStorage: async () => true };
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.version, '1.0.1');
  assert.equal(saved.enabled, false);
  assert.equal(saved.difficultyChosen, true);
  assert.deepEqual(plain(saved.futureMetadata), { untouched: true });
  assert.deepEqual(plain(saved.nameI18n), { es: 'Personalizada' });
  assert.deepEqual(plain(saved.detection.cookie[0].descriptionI18n), { es: 'Sesión' });
});

test('failed creation retains its draft; retry creates a distinct canonical ID without replacing a namesake', async () => {
  const state = editor({ isNew: true });
  state.fields['#detectorNameInput'].value = 'Custom';
  const before = plain(state.dm.detectors);
  global.StorageManager = { saveToStorage: async () => false };
  assert.equal(await state.rules.saveRule(), false);
  assert.deepEqual(state.dm.detectors, before);
  assert.ok(state.rules.currentEditDetector?.isNew);
  global.StorageManager = { saveToStorage: async () => true };
  assert.equal(await state.rules.saveRule(), true);
  assert.deepEqual(plain(state.dm.detectors.antibot['detect-custom']), before.antibot['detect-custom']);
  assert.equal(state.dm.detectors.antibot['detect-custom-2'].id, 'detect-custom-2');
});

test('category changes move the saved rule only after success', async () => {
  const state = editor();
  state.fields['#detectorCategorySelect'].value = 'captcha';
  global.StorageManager = { saveToStorage: async () => true };
  assert.equal(await state.rules.saveRule(), true);
  assert.equal(state.dm.detectors.antibot['detect-custom'], undefined);
  assert.equal(state.dm.detectors.captcha['detect-custom'].category, 'captcha');
});

test('opening the editor never shares mutable pattern objects with the visible detector', () => {
  const state = editor();
  state.rules.getEditorDetectorName = detector => detector.name;
  state.rules.populateModalData = () => {};
  state.modal.querySelector = () => null;
  const original = state.dm.detectors.antibot['detect-custom'];
  state.rules.openEditModal(original, 'antibot', original.id);
  state.rules.currentEditDetector.detector.detection.cookie[0].name = 'draft-only';
  assert.equal(original.detection.cookie[0].name, 'original');
});


test('metadata-only edits to an official rule are protected from automatic replacement', async () => {
  const state = editor();
  DetectionUtils.setOfficialDetectorIds(['detect-custom']);
  const original = { ...fixture(), author: 'Scrapfly' };
  state.dm.detectors.antibot['detect-custom'] = original;
  state.rules.currentEditDetector.detector = plain(original);
  state.rules.currentEditDetector.original = plain(original);
  state.rules.currentEditDetector.isOfficial = true;
  state.fields['#detectorAuthorInput'].value = 'Scrapfly';
  state.rules._collectDetectionFromForm = () => plain(original.detection);
  global.StorageManager = { saveToStorage: async () => true };
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.userModified, true);
  assert.equal(saved.version, '1.0');
  assert.equal(saved.officialSnapshot.name, 'Custom');
});

test('the detector description and its translations are saved with the rule, and removed with the text', async () => {
  global.StorageManager = { saveToStorage: async () => true };
  const state = editor();
  state.fields['#detectorDescriptionInput'] = { value: 'Bot detection on login pages' };
  state.rules.collectDetectorDescription = () => ({ description: 'Bot detection on login pages', descriptionI18n: { es: 'Detección de bots en el login' } });
  assert.equal(await state.rules.saveRule(), true);
  let saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.description, 'Bot detection on login pages');
  assert.deepEqual(plain(saved.descriptionI18n), { es: 'Detección de bots en el login' });

  // Emptied: both go
  const next = editor();
  next.dm.detectors = { antibot: { 'detect-custom': { ...fixture(), description: 'Old', descriptionI18n: { es: 'Viejo' } } } };
  next.rules.currentEditDetector.detector = plain(next.dm.detectors.antibot['detect-custom']);
  next.fields['#detectorDescriptionInput'] = { value: '' };
  next.rules.collectDetectorDescription = () => ({ description: '', descriptionI18n: {} });
  assert.equal(await next.rules.saveRule(), true);
  saved = next.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.description, undefined);
  assert.equal(saved.descriptionI18n, undefined);
});

test('saving an official rule with its description left as it was keeps its translations and does not mark it as edited', async () => {
  global.StorageManager = { saveToStorage: async () => true };
  const state = editor();
  DetectionUtils.setOfficialDetectorIds(['detect-custom']);
  const original = { ...fixture(), author: 'Scrapfly', name: 'Edited custom', description: 'Official text', descriptionI18n: { de: 'Offizieller Text' } };
  state.dm.detectors.antibot['detect-custom'] = original;
  state.rules.currentEditDetector.detector = plain(original);
  state.rules.currentEditDetector.original = plain(original);
  state.rules.currentEditDetector.isOfficial = true;
  state.fields['#detectorAuthorInput'].value = 'Scrapfly';
  state.rules._collectDetectionFromForm = () => plain(original.detection);
  state.fields['#detectorDescriptionInput'] = { value: 'Offizieller Text' };
  // The box showed the German text and was left alone: the rule's own text and translations come back as they were
  state.rules.collectDetectorDescription = () => ({ description: 'Official text', descriptionI18n: { de: 'Offizieller Text' } });
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.userModified, undefined);
  assert.equal(saved.officialSnapshot, undefined);
  assert.equal(saved.description, 'Official text');
  assert.deepEqual(plain(saved.descriptionI18n), { de: 'Offizieller Text' });
});

test('replacing the description of an official rule is an edit, and the translations of the old text go', async () => {
  global.StorageManager = { saveToStorage: async () => true };
  const state = editor();
  DetectionUtils.setOfficialDetectorIds(['detect-custom']);
  const original = { ...fixture(), author: 'Scrapfly', name: 'Edited custom', description: 'Official text', descriptionI18n: { de: 'Offizieller Text' } };
  state.dm.detectors.antibot['detect-custom'] = original;
  state.rules.currentEditDetector.detector = plain(original);
  state.rules.currentEditDetector.original = plain(original);
  state.rules.currentEditDetector.isOfficial = true;
  state.fields['#detectorAuthorInput'].value = 'Scrapfly';
  state.rules._collectDetectionFromForm = () => plain(original.detection);
  state.fields['#detectorDescriptionInput'] = { value: 'My own words' };
  state.rules.collectDetectorDescription = () => ({ description: 'My own words', descriptionI18n: {} });
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.userModified, true);
  assert.equal(saved.description, 'My own words');
  assert.equal(saved.descriptionI18n, undefined);
  assert.equal(saved.officialSnapshot.description, 'Official text');
});

test('a description-only edit to an official rule counts as an edit', async () => {
  global.StorageManager = { saveToStorage: async () => true };
  const state = editor();
  DetectionUtils.setOfficialDetectorIds(['detect-custom']);
  const original = { ...fixture(), author: 'Scrapfly', name: 'Edited custom', description: 'Official text' };
  state.dm.detectors.antibot['detect-custom'] = original;
  state.rules.currentEditDetector.detector = plain(original);
  state.rules.currentEditDetector.original = plain(original);
  state.rules.currentEditDetector.isOfficial = true;
  state.fields['#detectorAuthorInput'].value = 'Scrapfly';
  state.rules._collectDetectionFromForm = () => plain(original.detection);
  state.fields['#detectorDescriptionInput'] = { value: 'My own text' };
  state.rules.collectDetectorDescription = () => ({ description: 'My own text', descriptionI18n: {} });
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.userModified, true, 'a reworded English description is an edit');
  assert.equal(saved.officialSnapshot.description, 'Official text');
});

test('an icon-only edit to an official rule counts as an edit, though the picker wrote it into both copies', async () => {
  global.StorageManager = { saveToStorage: async () => true };
  const state = editor();
  DetectionUtils.setOfficialDetectorIds(['detect-custom']);
  const original = { ...fixture(), author: 'Scrapfly', name: 'Edited custom', icon: 'old.png' };
  state.dm.detectors.antibot['detect-custom'] = original;
  state.rules.currentEditDetector.detector = { ...plain(original), icon: 'new.png' };
  state.rules.currentEditDetector.original = plain(original);
  state.rules.currentEditDetector.isOfficial = true;
  state.fields['#detectorAuthorInput'].value = 'Scrapfly';
  state.rules._collectDetectionFromForm = () => plain(original.detection);
  state.rules.currentEditDetector.originalDetection = plain(original.detection);
  assert.equal(await state.rules.saveRule(), true);
  const saved = state.dm.detectors.antibot['detect-custom'];
  assert.equal(saved.icon, 'new.png');
  assert.equal(saved.userModified, true, 'the icon alone is a change');
  assert.equal(saved.officialSnapshot.icon, 'old.png');
});
