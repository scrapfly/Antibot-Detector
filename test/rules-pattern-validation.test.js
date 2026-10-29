const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Save refuses a pattern marked as a regex that the engine cannot run: the name, the value, and a payload pattern's
// URL pattern (set in its settings dialog, so it lives on the row, not in a box)
const root = path.join(__dirname, '..');

function validate(items, type = 'payload') {
  const rows = items.map(({ data = {}, name = 'x', value = '' }) => ({
    dataset: data,
    querySelector: (selector) => (selector === '.method-name' ? { value: name } : selector === '.method-input.method-value' ? { value } : null)
  }));
  const section = { querySelectorAll: () => rows };
  const container = { querySelectorAll: () => [section] };
  const ctx = { Rules: function() {}, console, Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: (key) => (key === '#detectionMethodsContainer' ? container : null) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8'), ctx);
  const rules = new ctx.Rules();
  rules.getMethodSectionType = () => type;
  return { result: rules.validatePatternRows(), rows };
}

test('an invalid regex in a payload pattern\'s URL pattern is refused on Save', () => {
  const { result, rows } = validate([{ data: { payloadUrlRegex: 'true', payloadUrlPattern: '[abc' } }]);
  assert.equal(result.isValid, false);
  assert.equal(result.invalidRows.length, 1);
  assert.equal(result.invalidRows[0].reason, 'regex');
  assert.equal(result.invalidRows[0].item, rows[0]);
});

test('a runnable URL pattern regex, and a URL pattern that is plain text, are accepted', () => {
  assert.equal(validate([{ data: { payloadUrlRegex: 'true', payloadUrlPattern: 'api\\.example\\.com/v[0-9]+' } }]).result.isValid, true);
  assert.equal(validate([{ data: { payloadUrlRegex: 'false', payloadUrlPattern: '[abc' } }]).result.isValid, true, 'not a regex: any text is fine');
  assert.equal(validate([{ data: { payloadUrlRegex: 'true', payloadUrlPattern: '' } }]).result.isValid, true, 'no URL pattern: nothing to run');
});

test('a row whose name is already refused is listed once, and the URL pattern check applies to payload patterns only', () => {
  const both = validate([{ name: '(', data: { nameRegex: 'true', payloadUrlRegex: 'true', payloadUrlPattern: '[abc' } }]);
  assert.equal(both.result.invalidRows.length, 1);
  const cookie = validate([{ data: { payloadUrlRegex: 'true', payloadUrlPattern: '[abc' } }], 'cookie');
  assert.equal(cookie.result.isValid, true, 'a cookie pattern has no URL pattern');
});
