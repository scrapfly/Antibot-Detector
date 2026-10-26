const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// escapeHtml leaves quotes alone, so a value it escapes must never go inside an attribute ("..."):
// a page title, a header value or an imported id with a quote would cut the attribute short.

const root = path.join(__dirname, '..');
const FormatUtils = require('../utils/format-utils.js');

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('no attribute is filled with escapeHtml', () => {
  const offenders = [];
  for (const file of [...sourceFiles('sections'), ...sourceFiles('modules/ui'), 'popup.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/[\w-]+="\$\{([^"`]*?)\}"/g)) {
      if (/escapeHtml\(/.test(match[1])) offenders.push(`${file}: ${match[0].slice(0, 100)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the History card escapes its title, address and id for attributes', () => {
  const source = fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8');
  assert.match(source, /data-history-id="\$\{FormatUtils\.escapeAttr\(item\.id\)\}"/);
  assert.match(source, /class="history-title" title="\$\{attrTitle\}"/);
  assert.match(source, /class="history-url" dir="ltr" title="\$\{attrUrl\}"/);
});

test('escapeAttr keeps a quoted value inside its attribute', () => {
  const value = 'Say "hi" & it\'s <b>';
  const html = `<div title="${FormatUtils.escapeAttr(value)}"></div>`;
  assert.equal(html, '<div title="Say &quot;hi&quot; &amp; it&#39;s &lt;b&gt;"></div>');
  assert.equal(FormatUtils.escapeAttr(''), '');
  assert.equal(FormatUtils.escapeAttr(null), '');
});
