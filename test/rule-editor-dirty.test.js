const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The rule editor asks before ✕, Escape or a click outside drop a change, whatever the change was (typed, a pattern
// deleted, Method Settings saved, an icon chosen, Translate); it compares the editor with how it opened.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function editor({ confirmAnswer = true } = {}) {
  const asked = [];
  const shown = (display = 'flex') => ({ style: { display } });
  const elements = {
    '#editRuleModal': shown(), '#methodSettingsModal': shown('none'),
    '#detectorNameInput': { value: 'Shop guard' }, '#detectorCategorySelect': { value: 'antibot' },
    '#detectorDifficultySelect': { value: 'Medium' }, '#detectorAuthorInput': { value: 'Me' }
  };
  const extra = { all: [], confirm: null, picker: null };
  const document = {
    querySelector: (sel) => {
      if (sel === '.notification-confirm[data-open="true"], .icon-picker-modal') return extra.confirm || extra.picker;
      return elements[sel] || null;
    },
    querySelectorAll: (sel) => (sel === '.rh-modal, #advancedColorModal' ? extra.all : []),
    body: { style: { overflow: 'hidden' } }
  };
  const context = vm.createContext({
    console, JSON, document, Logger: { debug() {} },
    NotificationHelper: { confirm: async (options) => { asked.push(options.title); return confirmAnswer; } }
  });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-editor-modal.js'), context);
  vm.runInContext(read('sections/rules/rules-modal-wiring.js'), context);
  const rules = new context.Rules();
  let detection = { cookie: [{ id: 'a', name: 'sid' }, { id: 'b', name: 'token' }] };
  rules._collectDetectionFromForm = () => JSON.parse(JSON.stringify(detection));
  rules.combinationsModel = [];
  rules.buildCombinationsForSave = () => ({ combinations: JSON.parse(JSON.stringify(rules.combinationsModel)) });
  rules.currentEditDetector = { detector: { icon: 'shop.png' } };
  rules.ruleEditorSnapshot = rules.ruleEditorFingerprint();
  let closed = 0;
  const realClose = rules.closeEditModal;
  rules.closeEditModal = function() { closed++; return realClose.call(this); };
  let settingsClosed = 0;
  rules.closeMethodSettingsModal = () => { settingsClosed++; elements['#methodSettingsModal'].style.display = 'none'; };
  return {
    rules, elements, extra, asked,
    setDetection: (next) => { detection = next; },
    get closed() { return closed; }, get settingsClosed() { return settingsClosed; }
  };
}

const escape = () => { const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; return event; };

test('an untouched editor closes without asking', async () => {
  const state = editor();
  assert.equal(state.rules.isRuleEditorDirty(), false);
  assert.equal(await state.rules.requestCloseEditModal(), true);
  assert.deepEqual(state.asked, []);
  assert.equal(state.elements['#editRuleModal'].style.display, 'none');
});

test('a deleted pattern, an icon choice or a combination is a change, and undoing it is not', async () => {
  const deleted = editor();
  deleted.setDetection({ cookie: [{ id: 'a', name: 'sid' }] });
  assert.equal(deleted.rules.isRuleEditorDirty(), true, 'a pattern deleted without typing');
  deleted.setDetection({ cookie: [{ id: 'a', name: 'sid' }, { id: 'b', name: 'token' }] });
  assert.equal(deleted.rules.isRuleEditorDirty(), false, 'put back as it was');

  const icon = editor();
  icon.rules.currentEditDetector.detector.icon = 'other.png';
  assert.equal(icon.rules.isRuleEditorDirty(), true);

  const settings = editor();
  settings.setDetection({ cookie: [{ id: 'a', name: 'sid', nameRegex: true }, { id: 'b', name: 'token' }] });
  assert.equal(settings.rules.isRuleEditorDirty(), true, 'Method Settings saved');

  const combo = editor();
  combo.rules.combinationsModel.push({ id: 'c1', name: 'Both', when: { all: ['a', 'b'] } });
  assert.equal(combo.rules.isRuleEditorDirty(), true);
});

test('with a change, ✕ / the backdrop / Escape ask first, and Cancel in the question keeps the editor', async () => {
  const keep = editor({ confirmAnswer: false });
  keep.elements['#detectorNameInput'].value = 'Renamed';
  assert.equal(await keep.rules.requestCloseEditModal(), false);
  assert.deepEqual(keep.asked, ['Discard your changes?']);
  assert.equal(keep.closed, 0);
  assert.ok(keep.rules.currentEditDetector);

  const discard = editor({ confirmAnswer: true });
  discard.elements['#detectorNameInput'].value = 'Renamed';
  const event = escape();
  assert.equal(discard.rules.onRuleEditorEscape(event), true);
  assert.equal(event.defaultPrevented, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(discard.asked.length, 1);
  assert.equal(discard.closed, 1);
  assert.equal(discard.rules.currentEditDetector, null);
});

test('Escape closes the top-most rule dialog only', () => {
  const state = editor();
  // Method Settings over the editor: Escape closes Method Settings
  state.elements['#methodSettingsModal'].style.display = 'flex';
  assert.equal(state.rules.onRuleEditorEscape(escape()), true);
  assert.equal(state.settingsClosed, 1);
  assert.equal(state.closed, 0);

  // A helper, the icon picker or a confirmation above: theirs
  state.extra.all = [{ style: { display: 'flex' } }];
  assert.equal(state.rules.onRuleEditorEscape(escape()), false);
  state.extra.all = [];
  state.extra.picker = {};
  assert.equal(state.rules.onRuleEditorEscape(escape()), false);
  state.extra.picker = null;

  // Already handled, or another key
  const handled = escape();
  handled.defaultPrevented = true;
  assert.equal(state.rules.onRuleEditorEscape(handled), false);
  assert.equal(state.rules.onRuleEditorEscape({ key: 'Enter' }), false);
  assert.equal(state.closed, 0);
});

test('the rule editor and Method Settings are labelled modal dialogs', () => {
  const html = read('sections/rules/rules.html');
  assert.match(html, /<div class="rule-modal-content" role="dialog" aria-modal="true" aria-labelledby="editRuleModalAction">/);
  assert.match(html, /<div class="rule-modal-content method-settings-modal" role="dialog" aria-modal="true" aria-labelledby="methodSettingsTitle">/);
});
