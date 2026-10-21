'use strict';
// Rules → a card's … → Duplicate: the editor opens on a copy that is a new
// custom rule; the original is untouched and nothing is saved before Save.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function load() {
  const context = vm.createContext({ console, JSON, Date, Object, String, Array, Logger: new Proxy({}, { get: () => () => {} }) });
  context.self = context; context.globalThis = context;
  context.DetectionUtils = require('../utils/detection-utils.js');
  context.DetectorSchema = require('../modules/detection/rules/detector-schema.js');
  context.DetectorMigrations = require('../modules/detection/rules/historical-migrations.js');
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/rules/detector-manager.js'), 'utf8') + '\n;globalThis.DetectorManager = DetectorManager;', context);
  vm.runInContext('class Rules {}; globalThis.Rules = Rules;', context);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-handlers.js'), 'utf8'), context);
  return context;
}

const official = {
  id: 'detect-akamai', name: 'Akamai', displayName: 'Akamai Bot Manager', author: 'Scrapfly', version: '2.4', enabled: false,
  category: 'antibot', icon: 'akamai_official.png', difficulty: 'High', description: 'Akamai', descriptionI18n: { es: 'Akamai' },
  minExtensionVersion: '2.8', userModified: true, officialSnapshot: { id: 'detect-akamai' }, dismissedVersion: '2.5',
  detection: { cookies: [{ name: '_abck', confidence: 90 }] }, combinations: [{ id: 'c', name: 'c', when: { all: [] } }]
};

test('the copy keeps the patterns, combinations, icon and texts, as a new custom rule', () => {
  const { Rules } = load();
  const copy = JSON.parse(JSON.stringify(Rules.duplicateOf(official, { now: new Date(2026, 9, 21, 9, 5, 7) })));
  assert.deepStrictEqual(copy.detection, official.detection);
  assert.deepStrictEqual(copy.combinations, official.combinations);
  assert.strictEqual(copy.icon, 'akamai_official.png');
  assert.deepStrictEqual(copy.descriptionI18n, { es: 'Akamai' });
  assert.strictEqual(copy.name, 'Akamai (copy)');
  assert.strictEqual(copy.displayName, 'Akamai (copy)');
  assert.ok(/^custom-\d+$/.test(copy.id));
  assert.strictEqual(copy.version, '1.0');
  assert.strictEqual(copy.enabled, true);
  assert.strictEqual(copy.author, '', 'the Scrapfly author stays with the official rule');
  assert.strictEqual(copy.lastUpdated, '2026-10-21 09:05:07');
  for (const field of ['userModified', 'officialSnapshot', 'dismissedVersion', 'minExtensionVersion']) assert.ok(!(field in copy), field);
  assert.strictEqual(official.userModified, true, 'the original object is not changed');
});

test('a custom rule keeps its author; the name format comes from the caller', () => {
  const { Rules } = load();
  const copy = Rules.duplicateOf({ id: 'mine', name: 'Mine', author: 'Ana', detection: {} }, { name: (b) => `${b} (copia)` });
  assert.strictEqual(copy.author, 'Ana');
  assert.strictEqual(copy.name, 'Mine (copia)');
});

test('Duplicate opens the editor as a new rule and saves nothing', () => {
  const context = load();
  const stored = { antibot: { 'detect-akamai': JSON.parse(JSON.stringify(official)) } };
  const opened = [];
  const view = Object.create(context.Rules.prototype);
  view.detectorManager = { getDetector: (c, id) => stored[c] && stored[c][id], saveDetectors() { throw new Error('saved'); } };
  view.openEditModal = (detector, category, id, isNew) => opened.push({ detector, category, id, isNew });
  const copy = view.handleDuplicateDetector('antibot', 'detect-akamai');
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(opened[0].isNew, true);
  assert.strictEqual(opened[0].category, 'antibot');
  assert.strictEqual(opened[0].id, copy.id);
  assert.deepStrictEqual(Object.keys(stored.antibot), ['detect-akamai']);
  assert.strictEqual(view.handleDuplicateDetector('antibot', 'missing'), null);
});

test('every rule card offers Duplicate in its menu', () => {
  const js = fs.readFileSync(path.join(root, 'sections/rules/rules-display.js'), 'utf8');
  assert.ok(js.includes('duplicate-detector-btn') && js.includes('this.handleDuplicateDetector(btn.dataset.category, btn.dataset.detectorId)'));
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  assert.strictEqual(en.rulesDuplicateNameFmt.message, '{0} (copy)');
});
