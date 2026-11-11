const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const logger = new Proxy({}, { get: () => () => {} });
const ctx = { Rules: function() {}, console, Logger: logger };
vm.createContext(ctx);
// The editor counts a rule's repeats with the module that also finds the other rules that hold a pattern (modules/core/rule-duplicates.js)
vm.runInContext(read('modules/core/rule-duplicates.js'), ctx);
vm.runInContext(read('sections/rules/rules-editor.js'), ctx);
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
  const src = read('sections/rules/rules-editor.js');
  assert.match(src, /rulesUiDuplicatePatterns/);
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', code, 'messages.json'), 'utf8'));
    assert.ok(messages.rulesUiDuplicatePatterns && messages.rulesUiDuplicatePatterns.message, code);
  }
});

// ---- 3.1.7: a pattern another rule already holds ----

test('the editor\'s count is the module\'s: one idea of "the same pattern" for the repeat inside a rule and the pattern in another rule', () => {
  const real = ctx.RuleDuplicates.countWithin;
  const seen = [];
  ctx.RuleDuplicates.countWithin = (detection) => { seen.push(detection); return 42; };
  try {
    const detection = { cookie: [{ name: 'a' }] };
    assert.equal(ctx.Rules.countDuplicatePatterns(detection), 42, 'the answer is the module\'s');
    assert.deepEqual(seen, [detection]);
  } finally {
    ctx.RuleDuplicates.countWithin = real;
  }
  assert.doesNotMatch(read('sections/rules/rules-editor.js'), /JSON\.stringify\(Object\.keys\(rest\)/, 'the key is written once, in the module');
});

const english = JSON.parse(read('_locales/en/messages.json'));
const MESSAGE = 'rulesUiPatternInOtherRules';

/** What the interface says in a language: I18n as the extension's own, over that language's messages */
const wordsOf = (table, locale) => ({
  locale: () => locale,
  get: (key) => (table[key] ? table[key].message : null),
  format(key, ...args) {
    const message = table[key] ? table[key].message : null;
    return message === null ? null : message.replace(/\{(\d+)\}/g, (placeholder, index) => (Number(index) < args.length ? String(args[Number(index)]) : placeholder));
  }
});
function editorIn(locale = 'en') {
  const warnings = [];
  const table = JSON.parse(read(`_locales/${locale}/messages.json`));
  // FormatUtils (loaded here, not in the sandbox) reads I18n from this realm's globals
  globalThis.I18n = wordsOf(table, locale);
  const context = vm.createContext({ Rules: function() {}, console, Logger: logger, FormatUtils: require('../utils/format-utils.js'), I18n: globalThis.I18n,
    NotificationHelper: { warning: (message) => warnings.push(message), error: () => assert.fail('a shared pattern is never an error') } });
  vm.runInContext(read('modules/core/rule-duplicates.js'), context);
  vm.runInContext(read('sections/rules/rules-editor.js'), context);
  return { rules: new context.Rules(), warnings, context };
}
afterEach(() => { delete globalThis.I18n; });
const found = (...names) => names.map((name, i) => ({ category: 'antibot', detectorName: `id-${i}`, name, shared: 1 }));

test('the warning names the other rule, or two of them, in the words of the interface', () => {
  const { rules, warnings } = editorIn('en');
  rules.warnSharedPatterns(found('Alpha'));
  rules.warnSharedPatterns(found('Alpha', 'Beta'));
  assert.deepEqual(warnings, [
    'Saved. A pattern of this rule is also in Alpha. That is fine if it is on purpose.',
    'Saved. A pattern of this rule is also in Alpha and Beta. That is fine if it is on purpose.'
  ]);
});

test('with more than two other rules the first two are named and the rest counted, with the words Restore official already has', () => {
  const { rules, warnings } = editorIn('en');
  rules.warnSharedPatterns(found('Alpha', 'Beta', 'Gamma'));
  rules.warnSharedPatterns(found('Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'));
  assert.deepEqual(warnings, [
    'Saved. A pattern of this rule is also in Alpha, Beta, and 1 more. That is fine if it is on purpose.',
    'Saved. A pattern of this rule is also in Alpha, Beta, and 3 more. That is fine if it is on purpose.'
  ]);
  assert.ok(warnings.every(text => !/Gamma|Delta|Epsilon/.test(text)), 'only two are named');
});

test('another language: its sentence, its way of joining names and its "N more"', () => {
  const { rules, warnings } = editorIn('es');
  rules.warnSharedPatterns(found('Alpha', 'Beta'));
  rules.warnSharedPatterns(found('Alpha', 'Beta', 'Gamma'));
  assert.match(warnings[0], /^Guardada\. /);
  assert.ok(warnings[0].includes('Alpha y Beta'), warnings[0]);
  assert.ok(warnings[1].includes('Alpha, Beta y 1 más'), warnings[1]);
  assert.ok(!warnings.some(text => text.includes('{0}')), 'the placeholder is filled in');
});

test('the warning is a warning and nothing else, and a page that cannot toast still saves', () => {
  const { rules, warnings, context } = editorIn('en');
  rules.warnSharedPatterns(found('Alpha'));
  assert.equal(warnings.length, 1, 'one warning, never an error (the helper above fails the test on error())');
  rules.warnSharedPatterns([]);
  assert.equal(warnings.length, 1, 'nothing shared, nothing said');
  context.NotificationHelper = {};
  assert.doesNotThrow(() => rules.warnSharedPatterns(found('Alpha')));
  context.NotificationHelper = undefined;
  assert.doesNotThrow(() => rules.warnSharedPatterns(found('Alpha')));
});

test('a rule saved with a pattern another rule holds says so, in every interface language, with the names where the placeholder is', () => {
  assert.match(read('sections/rules/rules-editor.js'), new RegExp(MESSAGE));
  assert.equal(english[MESSAGE].message, 'Saved. A pattern of this rule is also in {0}. That is fine if it is on purpose.');
  assert.ok(english[MESSAGE].description, 'English says where it is used');
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    const text = messages[MESSAGE] && messages[MESSAGE].message;
    assert.ok(text && text.trim(), code);
    assert.equal((text.match(/\{\d+\}/g) || []).join(''), '{0}', `${code}: the names, once, and no count`);
    if (code !== 'en') assert.notEqual(text, english[MESSAGE].message, `${code} is translated`);
    // it names rules and counts none: nothing here is a number a noun must agree with
    assert.ok(!/\d/.test(text.replace(/\{0\}/g, '')), `${code}: no number in the sentence`);
    assert.ok(messages.restoreOfficialMoreFmt && messages.restoreOfficialMoreFmt.message.includes('{0}'), `${code}: the "N more" it borrows`);
  }
});
