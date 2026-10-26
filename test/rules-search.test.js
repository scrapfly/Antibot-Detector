const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules → search: a rule whose name is the search comes first, then names that start with it, then names that
// contain it, then the rest (a category or description match). "Cap" matches every CAPTCHA by its category; Cap
// itself must not end up on a later page.

const context = vm.createContext({ console, window: {}, document: { querySelector: () => null, addEventListener() {} } });
vm.runInContext('class Rules {} this.Rules = Rules;', context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/rules/rules-handlers.js'), 'utf8'), context);

test('the rule named like the search comes first, then names starting with it, then the other matches in their order', () => {
  const rules = new context.Rules();
  const entry = (name, category = 'captcha', description = '') => ({ category, detectorName: name, detector: { name, description } });
  rules.allDetectors = [entry('reCAPTCHA'), entry('Capy'), entry('hCaptcha'), entry('Cap'), entry('Cloudflare', 'antibot', 'no match'), entry('Turnstile')];
  rules.handleSearch('cap');
  assert.deepEqual(rules.filteredDetectors.map(e => e.detector.name), ['Cap', 'Capy', 'reCAPTCHA', 'hCaptcha', 'Turnstile']);
  rules.handleSearch('');
  assert.equal(rules.filteredDetectors.length, 6, 'an empty search shows everything in the list order');
});
