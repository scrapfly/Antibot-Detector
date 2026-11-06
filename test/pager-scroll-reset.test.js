'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Turning a page of Detection, History or Rules starts the new page at its top. Their footers are stuck to the bottom of the
// popup's one scrollport (popup-scroll.css), so they stay where they are while the list above them is replaced: the new page was
// drawn at the old offset, its first entries above the viewport. The page box shows the page that is on screen: a number that is
// not a page, or text left in it when the person tabs away, goes back to it instead of staying there as if it had been accepted.

const root = path.join(__dirname, '..');

function element() {
  let text = '';
  const children = [];
  const attributes = new Map();
  const handlers = {};
  return {
    style: {}, value: '', disabled: false, handlers,
    get textContent() { return text + children.map(child => child.textContent).join(''); },
    set textContent(value) { text = String(value); children.length = 0; },
    appendChild(child) { children.push(child); },
    setAttribute(key, value) { attributes.set(key, value); },
    hasAttribute(key) { return attributes.has(key); },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }
  };
}

/**
 * A pager (#pager) in a popup whose one scrollport is `main`. `position` is what the stylesheet gives the pager's bar:
 * 'sticky' for the footers of Detection, History and Rules, anything else for a pager inside a dialog. `inMain: false` is
 * a pager outside the popup's main; `closest: false` a container that cannot say where it sits.
 */
function fixture({ position = 'sticky', inMain = true, closest = true } = {}) {
  const main = { scrollTop: 0 };
  const input = element(), total = element(), info = element(), prev = element(), next = element();
  const container = element();
  container.position = position;
  const nodes = { '.page-input': input, '.total-pages': total, '.pagination-info': info,
    '.pagination-btn-prev, .pagination-prev': prev, '.pagination-btn-next, .pagination-next': next };
  container.querySelector = selector => nodes[selector] || null;
  if (closest) container.closest = selector => (inMain && selector === '#app > .main' ? main : null);
  const context = { window: {}, Logger: { error() {} },
    getComputedStyle: el => ({ position: el.position }),
    document: { querySelector: selector => selector === '#pager' ? container : null, createElement: element, createTextNode: text => ({ textContent: text }) } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/ui/pagination-manager.js'), 'utf8'), context);
  const pager = new context.window.PaginationManager('pager', { itemsPerPage: 10 });
  return { pager, main, input, container, prev, next };
}

const items = (count) => Array.from({ length: count }, (_, i) => ({ id: i }));
/** Type into the page box and press a key in it (the pager listens for keypress, as the browser sends it). */
const press = (input, text, key = 'Enter') => { input.value = text; for (const fn of input.handlers.keypress || []) fn({ key, target: input }); };
const leave = (input) => { for (const fn of input.handlers.blur || []) fn({ target: input }); };

test('turning a page starts the new page at the top of the shared scrollport, whichever way it is turned', () => {
  const { pager, main, input } = fixture();
  pager.setItems(items(45));
  main.scrollTop = 310; // card 14 of 20: the person pressed the sticky Next
  pager.nextPage();
  assert.equal(pager.currentPage, 2);
  assert.equal(main.scrollTop, 0, 'Next');
  main.scrollTop = 310;
  pager.prevPage();
  assert.equal(pager.currentPage, 1);
  assert.equal(main.scrollTop, 0, 'Previous');
  main.scrollTop = 310;
  pager.goToPage(3);
  assert.equal(main.scrollTop, 0, 'a page asked for by number');
  main.scrollTop = 310;
  press(input, '2');
  assert.equal(pager.currentPage, 2);
  assert.equal(main.scrollTop, 0, 'the page box, on Enter');
});

test('what is not a page turn does not move the scroll: the same list drawn again (a pin, late evidence), a new list, a page that does not exist', () => {
  const { pager, main } = fixture();
  pager.setItems(items(45));
  pager.goToPage(2);
  main.scrollTop = 310;
  pager.setItems(items(45), { keepPage: true });
  assert.equal(main.scrollTop, 310, 'the same list again stays where the person is');
  pager.setItems(items(45));
  assert.equal(main.scrollTop, 310, 'a new list is drawn by its own caller, which knows whether to scroll');
  pager.goToPage(99);
  pager.goToPage(0);
  assert.equal(main.scrollTop, 310, 'a page that does not exist is not a page turn');
});

test('a pager that is not the footer of the scrollport (inside a dialog, or outside the popup\'s main) leaves the page\'s scroll alone', () => {
  for (const options of [{ position: 'static' }, { inMain: false }, { closest: false }]) {
    const { pager, main } = fixture(options);
    pager.setItems(items(45));
    main.scrollTop = 310;
    pager.nextPage();
    assert.equal(pager.currentPage, 2, JSON.stringify(options));
    assert.equal(main.scrollTop, 310, `the list behind a dialog keeps its place: ${JSON.stringify(options)}`);
  }
});

test('the page box goes back to the current page when Enter names a page there is not', () => {
  const { pager, input } = fixture();
  pager.setItems(items(25)); // three pages
  assert.equal(String(input.value), '1');
  for (const typed of ['99', '0', '-4', 'abc', '']) {
    press(input, typed);
    assert.equal(pager.currentPage, 1, `"${typed}" is no page`);
    assert.equal(String(input.value), '1', `"${typed}": the box shows the page on screen again`);
  }
  press(input, '3');
  assert.equal(pager.currentPage, 3);
  assert.equal(String(input.value), '3');
  press(input, '7', 'a');
  assert.equal(String(input.value), '7', 'a key that is not Enter does not interfere with typing');
});

test('text left in the page box when the person tabs away goes back to the current page; nothing is taken as typed until Enter', () => {
  const { pager, input } = fixture();
  pager.setItems(items(25));
  pager.goToPage(2);
  assert.ok(input.handlers.blur && input.handlers.blur.length === 1, 'the box listens for the person leaving it');
  for (const typed of ['3', '99', 'x', '']) {
    input.value = typed;
    leave(input);
    assert.equal(pager.currentPage, 2, `"${typed}" typed and left: the page did not change`);
    assert.equal(String(input.value), '2', `"${typed}": back to the page on screen`);
  }
  // An empty list has no page to show
  pager.setItems([]);
  input.value = '5';
  leave(input);
  assert.equal(String(input.value), '0');
});

test('the box is wired once however often the pager draws', () => {
  const { pager, input } = fixture();
  pager.setItems(items(25));
  pager.nextPage();
  pager.prevPage();
  pager.setItems(items(25));
  assert.equal(input.handlers.keypress.length, 1);
  assert.equal(input.handlers.blur.length, 1);
});
