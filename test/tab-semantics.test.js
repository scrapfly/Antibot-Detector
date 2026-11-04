const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A strip of tabs says what it is to a screen reader: a tab list, tabs (one selected, the one Tab reaches), and panels each named by
// its tab. The popup's own tabs did; Settings and the Advanced tab's two sub-tabs now do as well.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const attr = (tag, name) => (new RegExp(`\\s${name}="([^"]*)"`).exec(tag) || [])[1];

function strips(html) {
  const tabs = [...html.matchAll(/<button\b[^>]*\brole="tab"[^>]*>/g)].map(match => match[0]);
  const panels = [...html.matchAll(/<div\b[^>]*\brole="tabpanel"[^>]*>/g)].map(match => match[0]);
  return { tabs, panels, list: /\brole="tablist"/.test(html) };
}

for (const [file, count] of [['sections/settings/settings.html', 4], ['sections/advanced/advanced.html', 2]]) {
  test(`${file}: a tab list of ${count} tabs, one selected and reachable by Tab, each tab and panel naming the other`, () => {
    const { tabs, panels, list } = strips(read(file));
    assert.ok(list, 'role="tablist"');
    assert.equal(tabs.length, count);
    assert.equal(panels.length, count);
    assert.equal(tabs.filter(tab => attr(tab, 'aria-selected') === 'true').length, 1);
    for (const tab of tabs) {
      const selected = attr(tab, 'aria-selected') === 'true';
      assert.ok(['true', 'false'].includes(attr(tab, 'aria-selected')), tab);
      assert.equal(attr(tab, 'tabindex'), selected ? '0' : '-1', 'only the open tab is in the Tab order');
      assert.equal(/\bactive\b/.test(attr(tab, 'class')), selected, 'the class and aria-selected agree');
      const panel = panels.find(candidate => attr(candidate, 'id') === attr(tab, 'aria-controls'));
      assert.ok(panel, `the panel ${attr(tab, 'aria-controls')} exists`);
      assert.equal(attr(panel, 'aria-labelledby'), attr(tab, 'id'), 'the panel is named by its tab');
    }
  });
}

test('the Settings and Advanced scripts keep aria-selected and the Tab order with the open tab, and move with the arrow keys', () => {
  const settings = read('sections/settings/settings-ui.js');
  assert.match(settings, /btn\.setAttribute\('aria-selected', String\(selected\)\)/);
  assert.match(settings, /btn\.tabIndex = selected \? 0 : -1/);
  assert.match(settings, /\['ArrowLeft', 'ArrowRight'\]\.includes\(event\.key\)[\s\S]{0,400}this\.switchTab\(target\.getAttribute/);
  const advanced = read('sections/advanced/advanced-tools.js').replace(/\r\n/g, '\n');
  assert.match(advanced, /tab\.setAttribute\('aria-selected', String\(selected\)\)/);
  assert.match(advanced, /tab\.tabIndex = selected \? 0 : -1/);
  assert.match(advanced, /\['ArrowLeft', 'ArrowRight'\]\.includes\(event\.key\)[\s\S]{0,400}this\.switchAdvancedTab\(target\.dataset\.tab\)/);
});
