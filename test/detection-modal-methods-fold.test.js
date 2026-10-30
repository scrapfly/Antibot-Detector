const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection details: the detection methods stay folded under their title until it is clicked, and are folded
// again each time the modal opens.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = vm.createContext({ console, self: {}, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'modules/detection/detection-combinations.js', 'modules/ui/combination-checklist.js', 'sections/detection/detection-modals.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return vm.runInContext('DetectionModals', context);
}

function fakeElement() {
  const handlers = {};
  return {
    hidden: false, attributes: {}, handlers,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, fn) { handlers[type] = fn; }
  };
}

test('the modal markup starts the methods list folded, under a title that is a button', () => {
  const html = read('sections/detection/detection.html');
  assert.match(html, /<div class="detection-modal-section-header" id="detectionModalMethodsHeader" role="button" tabindex="0" aria-expanded="false" aria-controls="detectionModalMethods">/);
  assert.match(html, /<div id="detectionModalMethods" class="detection-modal-methods-list" hidden>/);
});

test('setMethodsFolded folds and unfolds the list and keeps the title\'s state in step', () => {
  const DetectionModals = load();
  const self = { modalElements: { methods: fakeElement(), methodsHeader: fakeElement() } };
  DetectionModals.setMethodsFolded.call(self, true);
  assert.equal(self.modalElements.methods.hidden, true);
  assert.equal(self.modalElements.methodsHeader.attributes['aria-expanded'], 'false');
  DetectionModals.setMethodsFolded.call(self, false);
  assert.equal(self.modalElements.methods.hidden, false);
  assert.equal(self.modalElements.methodsHeader.attributes['aria-expanded'], 'true');
  assert.doesNotThrow(() => DetectionModals.setMethodsFolded.call({ modalElements: null }, true));
});
