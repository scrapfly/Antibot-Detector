const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection details → "Matched combinations": the real modal code renders the
// combinations as checklists and copies one card as text.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = vm.createContext({ console, self: {}, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['utils/format-utils.js', 'modules/detection/detection-combinations.js', 'modules/ui/combination-checklist.js', 'sections/detection/detection-modals.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const copied = [];
  context.FormatUtils.copyToClipboard = (text, opts) => { copied.push({ text, element: opts && opts.element }); return Promise.resolve(true); };
  return { context, copied };
}

function fakeList() {
  const handlers = {};
  return {
    innerHTML: '', textContent: '', dataset: {},
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    handlerCount: () => (handlers.click || []).length
  };
}

const definition = {
  id: 'detect-storage',
  detection: {
    content: [{ id: 'set', text: 'localStorage.setItem', confidence: 5, standalone: false, description: 'Writes to local storage' },
      { id: 'get', text: 'localStorage.getItem', confidence: 5, standalone: false, description: 'Reads local storage' }],
    js_hooks: [{ id: 'hook-set', target: 'Storage.prototype.setItem', confidence: 10, standalone: false, description: 'Calls Storage.setItem' },
      { id: 'hook-get', target: 'Storage.prototype.getItem', confidence: 10, standalone: false, description: 'Calls Storage.getItem' }]
  },
  combinations: [
    { id: 'refs', name: 'Storage read and write references', confidence: 10, when: { all: [{ pattern: 'set' }, { pattern: 'get' }] } },
    { id: 'calls', name: 'Storage read and write calls', confidence: 15, when: { all: [{ pattern: 'hook-set' }, { pattern: 'hook-get' }] } }
  ]
};

function modalThis(list) {
  return {
    modalElements: { combinations: list },
    detectorManager: {
      getAllDetectors: () => ({ fingerprint: { 'detect-storage': definition } }),
    }
  };
}

test('the two storage combinations are told apart: full names, highest first, the 15% one sets the score', () => {
  const { context } = load();
  const matches = [
    { type: 'content', patternId: 'set', pattern: 'localStorage.setItem', confidence: 5 },
    { type: 'content', patternId: 'get', pattern: 'localStorage.getItem', confidence: 5 },
    { type: 'js_hooks', pattern: 'Storage.prototype.setItem', confidence: 10 },
    { type: 'js_hooks', pattern: 'Storage.prototype.getItem', confidence: 10 }
  ];
  const detection = { detector: { id: 'detect-storage' }, matches, confidence: 0 };
  context.DetectionCombinations.rescore(definition, detection);
  assert.strictEqual(detection.confidence, 15);

  const list = fakeList();
  const self = modalThis(list);
  context.DetectionModals.renderCombinations.call(self, detection, detection.combinations);
  const html = list.innerHTML;
  const first = html.indexOf('Storage read and write calls');
  const second = html.indexOf('Storage read and write references');
  assert.ok(first > 0 && second > first, 'highest confidence first, names never cut');
  assert.match(html, /class="match-combo sets-score" data-combo-id="calls"/);
  assert.match(html, /Calls Storage\.setItem/);
  assert.ok(!/describe|AND|method-type-badge/.test(html), 'no one-line rule text any more');
});

test('the cards have no Copy button, and a new detection replaces the list', () => {
  const { context, copied } = load();
  const detection = { detector: { id: 'detect-storage' }, confidence: 15, combinations: [
    { id: 'calls', name: 'Storage read and write calls', confidence: 15, when: definition.combinations[1].when, found: ['hook-set', 'hook-get'] }
  ] };
  const list = fakeList();
  const self = modalThis(list);
  context.DetectionModals.renderCombinations.call(self, detection, detection.combinations);
  assert.ok(!/match-combo-copy|>Copy</.test(list.innerHTML));
  assert.strictEqual(list.handlerCount(), 0, 'no click handling on the list');
  context.DetectionModals.renderCombinations.call(self, { detector: { id: 'detect-storage' }, confidence: 0 }, []);
  assert.strictEqual(list.innerHTML, '');
  assert.deepStrictEqual(copied, []);
});

test('older cached detections without found still get their checklist from the matches', () => {
  const { context } = load();
  const detection = { detector: { id: 'detect-storage' }, confidence: 10,
    matches: [{ type: 'content', patternId: 'set', confidence: 10 }, { type: 'content', patternId: 'get', confidence: 10 }],
    combinations: [{ id: 'refs', name: 'Storage read and write references', confidence: 10, when: definition.combinations[0].when }] };
  const list = fakeList();
  context.DetectionModals.renderCombinations.call(modalThis(list), detection, detection.combinations);
  assert.strictEqual((list.innerHTML.match(/aria-label="Found"><svg/g) || []).length, 2);
});

test('the confidence tooltip lists combinations by confidence and numbers unnamed ones in rule order', () => {
  const { context } = load();
  const rows = context.DetectionModals.combinationTipRows([
    { name: '', confidence: 20 }, { name: 'Strong', confidence: 90 }, { confidence: 50 }
  ], 4);
  assert.deepStrictEqual(rows.map(r => [r.label, r.value]), [['Strong', '90%'], ['Combination 3', '50%'], ['Combination 1', '20%']]);
});
