'use strict';
// The rule editor's "pick from the page" list scrolls: its groups keep their height. A group shrunk to fit the
// list clips its own rows (it has overflow: hidden), so the list had nothing to scroll and the rows past the
// first few could not be reached.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'sections', 'rules', 'styles', 'suggest.css'), 'utf8');

function block(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} is styled`);
  return css.slice(at, css.indexOf('}', at));
}

test('the pick list scrolls, and its groups never shrink inside it', () => {
  assert.match(block('.page-pick-list'), /max-height:\s*\d+px/);
  assert.match(block('.page-pick-list'), /overflow-y:\s*auto/);
  assert.match(block('.page-pick-list > *'), /flex-shrink:\s*0/);
  assert.match(block('.sr-group'), /overflow:\s*hidden/, 'the reason the groups must not shrink');
});
