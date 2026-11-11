const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Arabic is the only right-to-left language the extension ships. Three spots had their room, their indent or their turn on a
// physical side, so in Arabic they sat on the wrong one: the search box of the rule icon picker (the icon is at the start of the
// line, the room for it was on the left, so the icon covered what you typed), the description under History statistics in
// Settings → Data (indented from the left, where an Arabic line does not start), and the arrow of the Pattern tester's cheat sheet
// (it pointed right, away from its text). Each follows the reading direction now: logical properties, and an Arabic turn for the arrow.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** The declarations of the first rule whose selector line is exactly `selector` */
function ruleOf(css, selector) {
  const start = css.split('\n').findIndex(line => line.trim() === `${selector} {`);
  assert.notEqual(start, -1, `rule ${selector}`);
  const lines = css.split('\n').slice(start + 1);
  return lines.slice(0, lines.findIndex(line => line.trim() === '}')).join('\n');
}
const physical = /(^|\s)(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right):/m;

test('the icon picker search box keeps the room for its icon at the start of the line, where the icon is: in Arabic the icon covered the text', () => {
  const css = read('sections/rules/styles/editor.css');
  const icon = ruleOf(css, '.icon-picker-search-icon');
  assert.match(icon, /inset-inline-start:\s*10px;/, 'the icon sits at the start of the line: the right in Arabic');
  assert.doesNotMatch(icon, physical);
  const input = ruleOf(css, '.icon-picker-search-input');
  assert.match(input, /padding-inline:\s*32px 10px;/, 'the 32px for the icon come first: on the start side, like the icon');
  assert.match(input, /padding-block:\s*0;/, 'no room above or below: the box is 32px high');
  assert.doesNotMatch(input, /(^|\s)padding:/m, 'the shorthand "padding: 0 10px 0 32px" puts the 32px on the left in both directions');
  assert.doesNotMatch(input, physical);
});

test('the description under History statistics is indented from the start of the line (the right in Arabic), not from the left', () => {
  const css = read('sections/settings/settings.css');
  const desc = ruleOf(css, '#settingsModal .settings-stats-desc');
  assert.match(desc, /margin-block:\s*1px 0;/);
  assert.match(desc, /margin-inline:\s*38px 0;/, 'the 38px of the icon column are on the start side');
  assert.doesNotMatch(desc, /(^|\s)margin:/m, 'the shorthand "margin: 1px 0 0 38px" puts the 38px on the left in both directions');
  assert.doesNotMatch(desc, physical);
});

/**
 * Where a chevron points when it is the end-side and bottom borders of a box turned by `deg`: the corner is at the bottom right
 * (45 degrees clockwise from "right") in a line that reads left to right and at the bottom left (135) in one that reads right to left.
 */
function chevronPoints(deg, direction) {
  const angle = (((direction === 'rtl' ? 135 : 45) + deg) % 360 + 360) % 360;
  return { 0: 'right', 90: 'down', 180: 'left', 270: 'up' }[angle] || `${angle} degrees`;
}
const turnOf = (css, selector) => Number(/transform:\s*rotate\((-?\d+)deg\);/.exec(ruleOf(css, selector))[1]);

test('the Pattern tester cheat sheet arrow points along the reading direction while folded and down when open, in both directions', () => {
  const css = read('sections/rules/rule-helpers.css');
  const arrow = ruleOf(css, '.pt-cheat summary::before');
  assert.match(arrow, /border-inline-end:\s*1\.5px solid currentColor;/, 'the corner is on the end side of the line');
  assert.match(arrow, /border-block-end:\s*1\.5px solid currentColor;/);
  assert.doesNotMatch(arrow, physical);

  assert.equal(chevronPoints(turnOf(css, '.pt-cheat summary::before'), 'ltr'), 'right', 'folded, left to right');
  assert.equal(chevronPoints(turnOf(css, '[dir="rtl"] .pt-cheat summary::before'), 'rtl'), 'left', 'folded, in Arabic: toward its text, not away from it');
  assert.equal(chevronPoints(turnOf(css, '.pt-cheat[open] summary::before'), 'ltr'), 'down', 'open, left to right');
  // The corner is on the left in Arabic, so down needs the other turn than the open rule above gives: this one outranks it (one more selector)
  assert.equal(chevronPoints(turnOf(css, '[dir="rtl"] .pt-cheat[open] summary::before'), 'rtl'), 'down', 'open, in Arabic');
});
