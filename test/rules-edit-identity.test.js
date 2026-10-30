const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// "Check against History" and "Test on this page" run the rule as the form has it. The rule's id must be the stored
// rule's own: History saved its detections under it, so renaming the rule in the form must not make it another rule.
const root = path.join(__dirname, '..');

test('the form\'s rule keeps its stored id when its name is changed', () => {
  const nameInput = { value: 'Shop guard renamed' };
  const ctx = { Rules: function() {}, document: { querySelector: (sel) => (sel === '#detectorNameInput' ? nameInput : null) }, Logger: { debug() {}, error() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-live-test-ui.js'), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  rules._collectDetectionFromForm = () => ({ cookie: [{ name: 'x' }] });
  rules.buildCombinationsForSave = () => ({ combinations: [] });
  rules.currentEditDetector = { detector: { id: 'detect-shop-guard', name: 'Shop guard' }, detectorName: 'detect-shop-guard', category: 'antibot', isNew: false };
  const rule = rules.liveTestRule();
  assert.equal(rule.id, 'detect-shop-guard');
  assert.equal(rule.name, 'Shop guard renamed', 'the name is what the form says');
  nameInput.value = '';
  assert.equal(rules.liveTestRule().name, 'Shop guard', 'an empty name box falls back to the stored name');
  rules.currentEditDetector = null;
  assert.equal(rules.liveTestRule().id, 'rule-test', 'no rule open: the placeholder id');
});

test('Check against History reads the same identity', () => {
  const source = fs.readFileSync(path.join(root, 'sections/rules/rules-history-check-ui.js'), 'utf8');
  assert.match(source, /id: this\.currentEditDetector\.detector\?\.id \|\| this\.currentEditDetector\.detectorName/);
  assert.ok(!/currentEditDetector\.detectorId/.test(source), 'no field the editor never sets');
});

// A browser <select> reports '' when its value is set to something it has no option for
function fakeSelect(values) {
  const options = values.map(value => ({ value, remove() { options.splice(options.indexOf(this), 1); }, setAttribute(name) { this[name] = true; }, 'data-custom-category': false }));
  const select = { options, _value: values[0],
    get value() { return this._value; }, set value(next) { this._value = options.some(o => o.value === next) ? next : ''; },
    querySelectorAll: (sel) => (sel === 'option[data-custom-category]' ? options.filter(o => o['data-custom-category']) : []),
    appendChild(option) { option.remove = () => options.splice(options.indexOf(option), 1); options.push(option); } }; // as a DOM node leaves its parent
  return select;
}

test('a rule filed under a custom category keeps it in the editor\'s select, and a built-in one is unchanged', () => {
  const ctx = { Rules: function() {}, document: { createElement: () => ({ value: '', textContent: '', remove() {}, setAttribute(name) { this[name] = true; } }) }, Logger: { debug() {}, error() {}, warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor-modal.js'), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  rules.getCategoryLabel = (category) => category.toUpperCase();
  const select = fakeSelect(['antibot', 'captcha', 'fingerprint']);
  rules.showCategoryInSelect(select, 'captcha');
  assert.equal(select.value, 'captcha');
  assert.equal(select.options.length, 3, 'a built-in category adds nothing');
  rules.showCategoryInSelect(select, 'waf');
  assert.equal(select.value, 'waf', 'not "" (a select without that option)');
  assert.equal(select.options.length, 4);
  rules.showCategoryInSelect(select, 'fingerprint');
  assert.equal(select.value, 'fingerprint');
  assert.equal(select.options.length, 3, 'the extra option of the previous rule is gone');
});

// A name pasted from DevTools often carries a trailing space or a line break; the engine matches it literally, so the rule
// saved with it never fires. Save stores the text as the validation reads it: trimmed.
test('a pattern collected from the form is trimmed: name, value and description', () => {
  const row = (type, name, value, dataset = {}) => ({ type, dataset: { confidence: '80', ...dataset },
    querySelector: (sel) => (sel === '.method-name' ? { value: name } : sel === '.method-value' ? { value } : null) });
  const sections = [
    { type: 'cookie', items: [row('cookie', 'session_id \n', '  abc ')] },
    { type: 'url', items: [row('url', ' https://x.example/api ', ' the API ')] },
    { type: 'dom', items: [row('dom', '\t#captcha ', '')] },
    { type: 'window', items: [row('window', ' grecaptcha ', ' exists ')] }
  ].map(section => ({ type: section.type, querySelectorAll: (sel) => (sel === '.method-item' ? section.items : []) }));
  const ctx = { Rules: function() {}, console, Logger: { debug() {}, error() {}, warn() {} }, DetectionCombinations: undefined, normalizeCookieHeaderScope: (scope, fallback) => scope || fallback,
    document: { querySelector: (sel) => (sel === '#detectionMethodsContainer' ? { querySelectorAll: (s) => (s === '.method-section' ? sections : []) } : null) } };
  vm.createContext(ctx);
  for (const file of ['sections/rules/rules-editor.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  rules.getMethodSectionType = (section) => section.type;
  rules.currentEditDetector = { isNew: true };
  const detection = JSON.parse(JSON.stringify(rules._collectDetectionFromForm()));
  assert.equal(detection.cookie[0].name, 'session_id');
  assert.equal(detection.cookie[0].value, 'abc');
  assert.equal(detection.url[0].text, 'https://x.example/api');
  assert.equal(detection.url[0].description, 'the API');
  assert.equal(detection.dom[0].selector, '#captcha');
  assert.equal(detection.window[0].path, 'grecaptcha');
  assert.equal(detection.window[0].condition, 'exists');
});

test('a new pattern never takes the id of one deleted in this editor, or one already issued', () => {
  let rows = [{ dataset: { patternId: 'payload-2' } }]; // payload-1 was deleted from the form
  const ctx = { Rules: function() {}, console, Logger: { debug() {}, error() {}, warn() {} }, DetectionCombinations: undefined,
    document: { querySelectorAll: () => rows } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  rules.currentEditDetector = { isNew: false, original: { id: 'detect-x', detection: { payload: [{ id: 'payload-1', text: 'sensor', body: 'response' }, { id: 'payload-2', text: 'b' }] } } };
  assert.equal(rules.nextPatternId('payload'), 'payload-3', 'not payload-1: the stored rule still has it, with its "response body" flag');
  assert.equal(rules.nextPatternId('payload'), 'payload-4', 'and not one it already handed out, though that row is not in the form yet');
  assert.equal(rules.nextPatternId('cookie'), 'cookie-1', 'another type starts over');
  rules.currentEditDetector = { isNew: true };
  rules._issuedPatternIds = new Set();
  rows = [];
  assert.equal(rules.nextPatternId('url'), 'url-1', 'a new rule');
});

// The editor writes a rule's on/off options into the markup of its rows. A file can carry any text there: it must not
// become markup (a remote image load, a restyled page), so a rule whose options are not true or false is not admitted.
test('an imported rule whose options are not booleans is refused, and the editor draws only true or false', () => {
  const DetectorSchema = require('../modules/detection/rules/detector-schema.js');
  const rule = (extra) => ({ id: 'detect-x', name: 'X', category: 'antibot', version: '1.0', detection: { cookie: [{ name: 'a', ...extra }] } });
  const admit = (detector) => DetectorSchema.admit(detector, { categoryName: 'antibot', detectorName: 'detect-x', extensionVersion: '3.0.9' });
  assert.ok(admit(rule({ nameRegex: true, valueCaseSensitive: false })), 'booleans are fine');
  assert.ok(admit(rule({})), 'and so is leaving them out');
  for (const bad of ['x" ><img src=https://evil.example/t.png> y="', 'true', 1, null, {}]) {
    assert.equal(admit(rule({ nameRegex: bad })), null, `nameRegex: ${JSON.stringify(bad)}`);
  }
  assert.equal(admit(rule({ standalone: 'false' })), null);
  const source = fs.readFileSync(path.join(root, 'sections/rules/rules-editor.js'), 'utf8');
  assert.ok(!/= method\.\w*(Regex|WholeWord|CaseSensitive) \|\| false;/.test(source), 'no option is drawn as whatever the file holds');
});

test('the Rules search finds a rule by the category the card shows, translated or not', () => {
  const ctx = { Rules: function() {}, console, Logger: { debug() {}, error() {} }, FormatUtils: { escapeHtml: (t) => t } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-handlers.js'), 'utf8'), ctx);
  const rules = Object.create(ctx.Rules.prototype);
  rules.getCategoryLabel = (category) => ({ antibot: 'Anti-Bot', captcha: 'CAPTCHA' }[category] || category);
  rules.allDetectors = [
    { category: 'antibot', detector: { name: 'Akamai', displayName: 'Akamai', description: 'A bot manager' } },
    { category: 'antibot', detector: { name: 'Kasada', displayName: 'Kasada', description: 'Another one' } },
    { category: 'captcha', detector: { name: 'hCaptcha', displayName: 'hCaptcha', description: 'A challenge' } }
  ];
  rules.displayRules = () => {};
  const names = (query) => { rules.handleSearch(query); return Array.from(rules.filteredDetectors, item => item.detector.name); };
  assert.deepEqual(names('anti-bot'), ['Akamai', 'Kasada'], 'the label on the badge');
  assert.deepEqual(names('antibot'), ['Akamai', 'Kasada'], 'the key still works');
  assert.deepEqual(names('captcha').sort(), ['hCaptcha'], 'another category');
  rules.getCategoryLabel = (category) => ({ antibot: 'Anti-bots', captcha: 'Captchas' }[category] || category);
  assert.deepEqual(names('anti-bots'), ['Akamai', 'Kasada'], 'the label in another language');
});

test('an uploaded icon must be an image, and an imported rule\'s icon a data address of the size the picker allows', () => {
  const DetectorSchema = require('../modules/detection/rules/detector-schema.js');
  const admit = (customIcon) => DetectorSchema.admit({ id: 'detect-x', name: 'X', category: 'antibot', version: '1.0', customIcon, detection: { cookie: [{ name: 'a' }] } },
    { categoryName: 'antibot', detectorName: 'detect-x', extensionVersion: '3.0.9' });
  assert.ok(admit('data:image/png;base64,' + 'A'.repeat(1000)));
  assert.ok(admit(undefined));
  assert.equal(admit('data:image/png;base64,' + 'A'.repeat(150000)), null, 'multi-megabyte icons are refused');
  const source = fs.readFileSync(path.join(root, 'sections/rules/modals/icon-picker-modal.js'), 'utf8');
  assert.match(source, /\['image\/png', 'image\/jpeg', 'image\/gif', 'image\/webp', 'image\/svg\+xml'\]\.includes\(file\.type\)/);
});

