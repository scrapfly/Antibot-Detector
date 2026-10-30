const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings opens with every titled card folded, except the ones the page marks to open by default (History
// statistics on the Data tab, whose only content is the button that opens the page).

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ self: {}, console });
vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui.js'), 'utf8'), ctx, { filename: 'settings-ui.js' });
const SettingsUI = vm.runInContext('SettingsUI', ctx);

function fakeCard({ openByDefault = false } = {}) {
  const classes = new Set(['settings-card']);
  const head = {
    attributes: {}, listeners: {},
    querySelector: () => null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
  const card = {
    head,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      contains: n => classes.has(n),
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      }
    },
    hasAttribute: name => openByDefault && name === 'data-open-by-default',
    querySelector: () => head
  };
  return card;
}
const rootOf = (...cards) => ({ querySelectorAll: selector => cards.filter(card => selector === '.settings-card' || card.classList.contains('is-collapsible')) });
const folded = card => card.classList.contains('is-collapsed');

test('a titled card starts folded and a card marked open by default starts open', () => {
  const plain = fakeCard();
  const stats = fakeCard({ openByDefault: true });
  SettingsUI.setupCollapsibleCards(rootOf(plain, stats));
  assert.equal(folded(plain), true);
  assert.equal(plain.head.attributes['aria-expanded'], 'false');
  assert.equal(folded(stats), false);
  assert.equal(stats.head.attributes['aria-expanded'], 'true');
});

test('every time Settings opens the cards go back to where they start, and a click still folds the open one', () => {
  const plain = fakeCard();
  const stats = fakeCard({ openByDefault: true });
  const cards = rootOf(plain, stats);
  SettingsUI.setupCollapsibleCards(cards);
  plain.head.listeners.click();
  stats.head.listeners.click();
  assert.equal(folded(plain), false, 'a click opens a folded card');
  assert.equal(folded(stats), true, 'and folds an open one');
  assert.equal(stats.head.attributes['aria-expanded'], 'false');
  SettingsUI.collapseCards(cards);
  assert.equal(folded(plain), true);
  assert.equal(folded(stats), false, 'History statistics is open again');
  assert.equal(stats.head.attributes['aria-expanded'], 'true');
});

test('the Data tab marks History statistics, and only it, to open by default', () => {
  const html = fs.readFileSync(path.join(root, 'sections/settings/settings.html'), 'utf8');
  const marked = html.match(/<div class="[^"]*settings-card[^"]*"[^>]*data-open-by-default[^>]*>/g) || [];
  assert.equal(marked.length, 1);
  assert.match(marked[0], /settings-card--stats/);
});
