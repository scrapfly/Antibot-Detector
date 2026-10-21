const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The small icons the interface shares: the three categories' (checkboxes, chips, cards), a pinned page and a page whose
// protections changed. Each is written once, in FormatUtils, and the markup only names which one it wants.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const Categories = require('../modules/core/categories.js');

const sandbox = () => {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js') + '\nthis.FormatUtils = FormatUtils;', context);
  return context.FormatUtils;
};

test('Pinned and Changed have an icon, an unknown name has none, and the set cannot be changed', () => {
  const FormatUtils = sandbox();
  for (const name of ['pin', 'changed']) {
    const svg = FormatUtils.uiIconSvg(name);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/, name);
    assert.match(svg, /aria-hidden="true"/, `${name} is decoration: its chip names it`);
    assert.match(svg, /currentColor/, `${name} takes the colour of its chip`);
  }
  assert.notEqual(FormatUtils.uiIconSvg('pin'), FormatUtils.uiIconSvg('changed'));
  assert.equal(FormatUtils.uiIconSvg('nope'), '');
  assert.equal(FormatUtils.uiIconSvg(undefined), '');
  assert.ok(Object.isFrozen(FormatUtils.UI_ICONS));
});

test('every chip of the History row has an icon: Pinned and Changed name theirs, a category carries its own', () => {
  const FormatUtils = sandbox();
  const html = read('sections/history/history.html');
  const row = html.slice(html.indexOf('id="historyFilters"'), html.indexOf('<!-- Toolbar'));
  const chips = [...row.matchAll(/<button[^>]*data-filter="([a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(match => ({ filter: match[1], inner: match[2] }));
  assert.deepEqual(chips.map(chip => chip.filter), ['pinned', 'changed', ...Categories.KEYS]);
  for (const chip of chips) {
    const named = (chip.inner.match(/data-ui-icon="([a-z]+)"/) || [])[1];
    if (Categories.KEYS.includes(chip.filter)) assert.match(chip.inner, /class="history-filter-icon category-icon"/, `${chip.filter} has the category icon holder`);
    else assert.ok(FormatUtils.uiIconSvg(named), `${chip.filter} names an icon that exists`);
  }
  assert.deepEqual(chips.filter(chip => /data-ui-icon/.test(chip.inner)).map(chip => chip.filter), ['pinned', 'changed']);
});

test('the checkboxes of the webhook categories have an icon each, in the app\'s category order', () => {
  const html = read('sections/settings/settings.html');
  const boxes = [...html.matchAll(/<label class="webhook-category"><input type="checkbox" data-webhook-category="([a-z]+)">(.*?)<\/label>/g)];
  assert.deepEqual(boxes.map(box => box[1]), Categories.KEYS);
  for (const box of boxes) assert.match(box[2], /^<span class="category-icon" aria-hidden="true"><\/span><span data-i18n="/, `${box[1]}: the icon, then its name`);
});

test('the icons are written once: no other script or page spells the pin or the category icons', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'test', 'scripts', 'store', 'assets', '.claude', '_locales'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  const spelled = (needle) => files.filter(file => fs.readFileSync(file, 'utf8').includes(needle)).map(file => path.relative(root, file).split(path.sep).join('/'));
  // The filled pin of the chip and the cards (the item menu draws its own outline one, like every icon of that menu)
  assert.deepEqual(spelled('<path d="M12 17v5" fill="none"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>'), ['utils/format-utils.js'], 'the pin');
  assert.deepEqual(spelled('M8 3 4 7l4 4'), ['utils/format-utils.js'], 'the changed icon');
  assert.deepEqual(spelled('M6.5 6.5a8 8 0 0 1 11 0'), ['utils/format-utils.js'], 'the fingerprint icon');
});

test('a watched page has its own icon, in the card and in the entry menu', () => {
  const FormatUtils = sandbox();
  const svg = FormatUtils.uiIconSvg('watch');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.notEqual(svg, FormatUtils.uiIconSvg('pin'));
  const history = read('sections/history/history.js');
  assert.ok(history.includes("FormatUtils.uiIconSvg('watch')"), 'the card draws it from the shared icons');
  assert.match(read('sections/history/history.html'), /data-action="watch"[\s\S]*?data-menu-label="watch" data-i18n="historyWatch"/);
});
