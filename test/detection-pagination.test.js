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
  for (const file of ['utils/detection-utils.js', 'modules/ui/pagination-manager.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js']) {
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
