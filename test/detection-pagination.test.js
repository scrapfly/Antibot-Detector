const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  let text = '';
  const children = [];
  const attributes = new Map();
  return {
    style: {}, value: '', disabled: false,
    get textContent() { return text + children.map(child => child.textContent).join(''); },
    set textContent(value) { text = String(value); children.length = 0; },
    appendChild(child) { children.push(child); },
    setAttribute(key, value) { attributes.set(key, value); },
    hasAttribute(key) { return attributes.has(key); },
    addEventListener() {}
  };
}

function fixture() {
  const input = element(), total = element(), info = element(), prev = element(), next = element();
  const container = element();
  const nodes = { '.page-input': input, '.total-pages': total, '.pagination-info': info,
    '.pagination-btn-prev, .pagination-prev': prev, '.pagination-btn-next, .pagination-next': next };
  container.querySelector = selector => nodes[selector] || null;
  const context = { window: {}, self: {}, Logger: { error() {} },
    document: { querySelector: selector => selector === '#detectionPagination' ? container : null,
      createElement: element, createTextNode: text => ({ textContent: text }) } };
  vm.createContext(context);
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/ui/pagination-manager.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const detection = Object.create(context.window.Detection.prototype);
  detection.renderDetectionsPage = items => { detection.rendered = [...items]; };
  detection.currentResults = [{ detector: { name: 'Canvas' }, category: 'Fingerprint' },
    { detector: { name: 'Audio' }, category: 'Fingerprint' },
    { detector: { name: 'Fonts' }, category: 'Fingerprint' }];
  detection.setupPagination();
  return { context, detection, container, input, total, info, prev, next };
}

test('an empty Detection search keeps a zero-count footer and recovers when cleared', () => {
  const { detection, container, input, total, info, prev, next } = fixture();
  detection.handleSearch('');
  detection.paginationManager.goToPage(2);
  assert.equal(detection.rendered.length, 1);
  detection.handleSearch('no matching protection');
  assert.equal(container.style.display, 'flex', 'footer stays visible for zero search matches');
  assert.equal(info.textContent, 'Showing 0-0 of 0');
  assert.equal(Number(input.value), 0);
  assert.equal(input.disabled, true);
  assert.equal(total.textContent, '0');
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, true);
  assert.equal(detection.rendered.length, 0, 'old results are removed');
  detection.handleSearch('');
  assert.equal(container.style.display, 'flex');
  assert.equal(info.textContent, 'Showing 1-2 of 3');
  assert.equal(Number(input.value), 1);
  assert.equal(input.disabled, false);
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, false);
  assert.equal(detection.rendered.length, 2);
});

test('pagination without the Detection option still hides empty lists', () => {
  const { context, container } = fixture();
  const pager = new context.window.PaginationManager('detectionPagination');
  pager.setItems([]);
  assert.equal(container.style.display, 'none');
});

test('the same list again stays on its page (the last one when it shrank); a new list starts on page 1', () => {
  const { context } = fixture();
  const pager = new context.window.PaginationManager('detectionPagination', { itemsPerPage: 10 });
  const items = Array.from({ length: 25 }, (_, i) => ({ detector: { name: `P${i}` }, category: 'Antibot' }));
  pager.setItems(items);
  pager.goToPage(3);
  pager.setItems(items.slice(), { keepPage: true });
  assert.equal(pager.currentPage, 3, 'an entry pinned or evidence added: same page');
  pager.setItems(items.slice(0, 15), { keepPage: true });
  assert.equal(pager.currentPage, 2, 'clamped to the last page there is');
  pager.setItems([], { keepPage: true });
  assert.equal(pager.currentPage, 1);
  pager.setItems(items);
  pager.goToPage(2);
  pager.setItems(items);
  assert.equal(pager.currentPage, 1, 'a new list or search starts at the top');
});

test('changing page draws the page once', () => {
  const { context } = fixture();
  let draws = 0;
  const pager = new context.window.PaginationManager('detectionPagination', { itemsPerPage: 1, onPageChange: () => { draws++; } });
  pager.setItems([1, 2, 3]);
  draws = 0;
  pager.goToPage(2);
  assert.equal(draws, 1);
  pager.nextPage();
  assert.equal(draws, 2);
});

test('an open details dialog follows its protection into the new results, or closes when it is gone', () => {
  const { context, detection } = fixture();
  const DetectionUI = vm.runInContext('DetectionUI', context);
  const shown = [];
  let closed = 0;
  detection.renderDetectionModalContent = item => shown.push(item);
  detection.closeDetectionModal = () => { closed++; };
  const canvas = { detector: { id: 'canvas', name: 'Canvas' }, category: 'Fingerprint', matches: [1] };
  const key = DetectionUI.detectionKey(canvas);
  const richer = { ...canvas, matches: [1, 2] };
  detection.paginationManager.setItems([{ detector: { id: 'audio' }, category: 'Fingerprint' }, richer]);
  assert.equal(DetectionUI.refreshOpenDetectionModal.call(detection, key), true);
  assert.equal(detection.activeModalIndex, 1);
  assert.equal(shown[0], richer, 'redrawn with the new evidence');
  assert.equal(closed, 0);
  detection.paginationManager.setItems([{ detector: { id: 'audio' }, category: 'Fingerprint' }]);
  assert.equal(DetectionUI.refreshOpenDetectionModal.call(detection, key), false);
  assert.equal(closed, 1);
});
