const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const ctx = { Rules: function() {}, console, Logger: new Proxy({}, { get: () => () => {} }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8'), ctx);
const count = (detection) => ctx.Rules.countDuplicatePatterns(detection);

test('the same pattern twice in one kind is counted, whatever its id and confidence', () => {
  assert.equal(count({ cookie: [{ name: 'a', id: 'x', confidence: 90 }, { name: 'a', id: 'y', confidence: 50 }] }), 1);
  assert.equal(count({ url: [{ text: 'a' }, { text: 'a' }, { text: 'a' }] }), 2);
});

test('different text, options or kinds are not duplicates', () => {
  assert.equal(count({ cookie: [{ name: 'a' }, { name: 'b' }] }), 0);
  assert.equal(count({ url: [{ text: 'a' }, { text: 'a', textRegex: true }] }), 0);
  assert.equal(count({ url: [{ text: 'a' }], content: [{ text: 'a' }] }), 0);
  assert.equal(count(undefined), 0);
});

test('a rule saved with a repeated pattern says so, in every interface language', () => {
  const src = fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8');
  assert.match(src, /rulesUiDuplicatePatterns/);
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', code, 'messages.json'), 'utf8'));
    assert.ok(messages.rulesUiDuplicatePatterns && messages.rulesUiDuplicatePatterns.message, code);
  }
});
