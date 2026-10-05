const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourcePath = path.join(__dirname, '../sections/advanced/code-generator-dialog.js');

class Node {
  constructor(tag, document) {
    this.tagName = tag; this.document = document; this.children = []; this.attributes = {}; this.listeners = {};
    this.style = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.disabled = false;
    this.classList = { add: (...names) => { this.className = [this.className || '', ...names].join(' '); },
      toggle: (name, active) => { this.className = (this.className || '').split(' ').filter(n => n !== name).concat(active ? [name] : []).join(' '); } };
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(key, fn) { (this.listeners[key] ||= []).push(fn); }
  removeEventListener(key, fn) { this.listeners[key] = (this.listeners[key] || []).filter(f => f !== fn); }
  dispatch(key, event = {}) { for (const fn of this.listeners[key] || []) fn({ target: this, preventDefault() {}, ...event }); }
  focus() { this.document.activeElement = this; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  remove() { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
  get isConnected() { return !!this.parentNode || this === this.document.body; }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return nodes;
    if (selector.includes('button')) return nodes.filter(n => n.tagName === 'button' || n.tagName === 'textarea');
    return nodes.filter(n => selector.split(',').some(part => (n.className || '').split(' ').includes(part.trim().slice(1))));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function fixture(copy = async () => true) {
  const document = { listeners: {}, createElement(tag) { return new Node(tag, this); },
    addEventListener: Node.prototype.addEventListener, removeEventListener: Node.prototype.removeEventListener, dispatch: Node.prototype.dispatch };
  document.body = document.createElement('body');
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  const opener = document.body.appendChild(document.createElement('button')); opener.focus();
  const context = { window: {}, document, AdvancedUtils: { copyToClipboard: copy },
    I18n: { tr: (_, fallback) => fallback }, CloseButton: { create: () => document.createElement('button') } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
  const owner = { createToolModal: () => { const modal = document.createElement('div'); modal.className = 'tool-modal'; return modal; }, showToolModal: modal => document.body.appendChild(modal) };
  return { context, document, opener, owner, api: context.window.AdvancedCodeDialog };
}
const languages = ['javascript', 'python', 'nodejs', 'php', 'csharp', 'go'];
const malicious = '</textarea><script>injected()</script>\r\n& literal';
test('literal code is safe, all six languages and export types retain exact strings', () => {
  const { api, owner } = fixture();
  const dialog = api.open(owner, { title: 'Code', types: [{ id: 'all', label: 'All' }, { id: 'sensor', label: 'Sensor' }],
    getCodes: type => Object.fromEntries(languages.map(lang => [lang, `${type}:${lang}:${malicious}`])) });
  for (const type of ['all', 'sensor']) for (const language of languages) {
    dialog.selectType(type); dialog.selectLanguage(language);
    assert.equal(dialog.modal.querySelector('.advanced-code-dialog__code').value, `${type}:${language}:${malicious}`);
  }
  assert.equal(dialog.modal.querySelectorAll('*').filter(n => n.tagName === 'script').length, 0);
});
test('copy uses the selected literal output, reports failure and only runs on user activation', async () => {
  const calls = []; const { api, owner } = fixture(async code => { calls.push(code); return calls.length === 1; });
  const dialog = api.open(owner, { title: 'Code', getCodes: type => ({ javascript: type, python: malicious }) });
  const copy = dialog.modal.querySelector('.advanced-code-dialog__copy');
  assert.equal(calls.length, 0); dialog.selectLanguage('python');
  await copy.listeners.click[0](); assert.deepEqual(calls, [malicious]);
  await copy.listeners.click[0](); assert.match(dialog.modal.querySelector('.advanced-code-dialog__status').textContent, /Failed/);
});
test('keyboard tabs, focus trap, Escape, outside close and focus restoration have no motion dependency', () => {
  const { api, owner, document, opener } = fixture();
  let dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js', python: 'py' }) });
  const tabs = dialog.modal.querySelectorAll('.advanced-code-dialog__language');
  tabs[0].dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(document.activeElement, tabs[1]);
  document.dispatch('keydown', { key: 'Escape' }); assert.equal(document.activeElement, opener); assert.equal(dialog.modal.parentNode, null);
  dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js' }) });
  dialog.modal.dispatch('click'); assert.equal(dialog.modal.parentNode, null); assert.equal(document.activeElement, opener);
  assert.doesNotMatch(fs.readFileSync(sourcePath, 'utf8'), /setTimeout|requestAnimationFrame|innerHTML\s*=/);
});
test('generator failure is visible and cannot copy stale code', () => {
  const { api, owner } = fixture();
  const dialog = api.open(owner, { title: 'Code', types: [{ id: 'all', label: 'All' }, { id: 'bad', label: 'Bad' }],
    getCodes: type => { if (type === 'bad') throw Error('bad'); return { javascript: 'valid' }; } });
  dialog.selectType('bad');
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__code').value, '');
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__copy').disabled, true);
});

test('Tab and Shift+Tab wrap focus inside the dialog and remove keyboard handlers on close', () => {
  const { api, owner, document, opener } = fixture();
  const dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js', python: 'py' }) });
  const first = document.activeElement;
  const textarea = dialog.modal.querySelector('.advanced-code-dialog__code');
  textarea.focus(); document.dispatch('keydown', { key: 'Tab' }); assert.equal(document.activeElement, first);
  document.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(document.activeElement, textarea);
  opener.focus(); document.dispatch('keydown', { key: 'Tab' }); assert.equal(document.activeElement, first);
  dialog.close(); assert.equal(document.listeners.keydown.length, 0);
});
test('a pending copy cannot publish stale status after switching or closing', async () => {
  let finish;
  const { api, owner } = fixture(() => new Promise(resolve => { finish = resolve; }));
  const dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js', python: 'py' }) });
  const copy = dialog.modal.querySelector('.advanced-code-dialog__copy');
  const pending = copy.listeners.click[0]();
  dialog.selectLanguage('python'); finish(true); await pending;
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__status').textContent, '');
  assert.equal(copy.disabled, false);
  const closingCopy = copy.listeners.click[0](); dialog.close(); finish(true); await closingCopy;
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__status').textContent, '');
});
test('failed clipboard promises are contained and announced accessibly', async () => {
  const { api, owner } = fixture(async () => { throw Error('denied'); });
  const dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js' }) });
  await dialog.modal.querySelector('.advanced-code-dialog__copy').listeners.click[0]();
  const status = dialog.modal.querySelector('.advanced-code-dialog__status');
  assert.equal(status.getAttribute('role'), 'status'); assert.match(status.textContent, /Failed/);
});

test('Escape closes only the top dialog and restores focus to the parent dialog', () => {
  const { api, owner, document, opener } = fixture();
  const parent = api.open(owner, { title: 'Parent', getCodes: () => ({ javascript: 'parent' }) });
  const parentFocus = document.activeElement;
  const child = api.open(owner, { title: 'Child', getCodes: () => ({ javascript: 'child' }) });
  document.dispatch('keydown', { key: 'Escape' });
  assert.equal(child.modal.parentNode, null); assert.ok(parent.modal.parentNode); assert.equal(document.activeElement, parentFocus);
  document.dispatch('keydown', { key: 'Escape' }); assert.equal(document.activeElement, opener);
});

test('other modal kits above a code dialog retain exclusive Escape and Tab ownership', () => {
  for (const className of ['adv-kit-overlay', 'advanced-modal-overlay']) {
    const { api, owner, document } = fixture();
    const dialog = api.open(owner, { title: 'Code', getCodes: () => ({ javascript: 'js' }) });
    const overlay = document.createElement('div'); overlay.className = className;
    document.body.appendChild(overlay); overlay.focus();
    document.dispatch('keydown', { key: 'Escape' });
    document.dispatch('keydown', { key: 'Tab' });
    assert.ok(dialog.modal.parentNode); assert.equal(document.activeElement, overlay);
    overlay.remove(); dialog.close();
  }
});

test('an initial generation error keeps language tabs and can recover on a type switch', () => {
  const { api, owner } = fixture();
  const dialog = api.open(owner, { title: 'Code', types: [{ id: 'bad', label: 'Bad' }, { id: 'all', label: 'All' }],
    getCodes: type => { if (type === 'bad') throw Error('bad'); return { javascript: malicious }; } });
  assert.equal(dialog.modal.querySelectorAll('.advanced-code-dialog__language').length, 6);
  dialog.selectType('all');
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__code').value, malicious);
  assert.equal(dialog.modal.querySelector('.advanced-code-dialog__copy').disabled, false);
});

test('Geetest opens a JS-only dialog with exact v3/v4 outputs instead of copying on open', () => {
  const { context, owner } = fixture(() => { throw Error('must not copy on open'); });
  context.GeetestAdvanced = function() {};
  context.AdvancedCodeDialog = context.window.AdvancedCodeDialog;
  Object.assign(context.GeetestAdvanced.prototype, owner, { _txt: (_, fallback) => fallback });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/modules/geetest/geetest-advanced-actions.js'), 'utf8'), context);
  const module = new context.GeetestAdvanced();
  const hashes = { v3: '8ccdf22248c9069d75dd99643a241470f8b3402a5bf3eb0ec1fac8a60c384088',
    v4: 'b8303ab690d3f3a586cca235ce7f48f4c89b089d009eb0c8e8aaf775cffeab26' };
  for (const type of ['v3', 'v4']) {
    const dialog = module.exportParsingCode([{ type }]);
    assert.equal(dialog.modal.querySelectorAll('.advanced-code-dialog__language').length, 1);
    assert.equal(dialog.modal.querySelector('.advanced-code-dialog__language').textContent, 'JavaScript');
    const code = dialog.modal.querySelector('.advanced-code-dialog__code').value;
    assert.equal(require('node:crypto').createHash('sha256').update(code).digest('hex'), hashes[type]);
    dialog.close();
  }
});

const vendors = { akamai: 'AkamaiAdvanced', awswaf: 'AwsWafAdvanced', cloudflare: 'CloudflareAdvanced',
  datadome: 'DataDomeAdvanced', imperva: 'ImpervaAdvanced', shapesecurity: 'ShapeSecurityAdvanced', turnstile: 'TurnstileAdvanced' };
function vendorFixture(vendor) {
  const fixtureData = fixture();
  const { context, owner } = fixtureData;
  const Class = function() {};
  Class.tr = (_, fallback) => fallback;
  Class.fmt = (_, fallback, ...args) => fallback.replace(/\{(\d+)\}/g, (match, index) => args[index]);
  context[vendors[vendor]] = Class;
  Class.codeTemplateCache = new Map();
  context.Logger = { network() {}, error() {} };
  context.shapeSecurityText = Class.fmt;
  Object.assign(Class.prototype, owner, { _txt: Class.fmt, tabInfo: { url: 'https://example.com/', id: 1 } });
  context.AdvancedCodeDialog = context.window.AdvancedCodeDialog;
  for (const suffix of ['actions', 'ui']) {
    const file = path.join(__dirname, `../sections/advanced/modules/${vendor}/${vendor}-advanced-${suffix}.js`);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  }
  return { ...fixtureData, module: new Class() };
}
const scripts = [
  { url: 'https://example.com/pixel', src: 'https://example.com/pixel', type: 'pixel', categories: ['pixel'] },
  { url: 'https://example.com/sensor', src: 'https://example.com/sensor', type: 'sensor', categories: ['sensor'] },
  { url: 'https://example.com/sbsd', src: 'https://example.com/sbsd', type: 'sbsd', categories: ['sbsd'] },
  { url: 'https://example.com/init', categories: [] },
  { url: 'https://example.com/init?seed=1', hasSeed: true, categories: [] },
  { url: 'https://example.com/async?async', categories: [] }
];
for (const vendor of Object.keys(vendors)) test(`${vendor} shared dialog retains real generator output and other UI methods`, (t) => {
  const { module, context } = vendorFixture(vendor);
  assert.ok(['displayScriptsModal', 'displayAnalysisModal', 'displayExtractionResults', 'displayScriptDataModal'].some(name => typeof module[name] === 'function'));
  let dialog, expected;
  const data = { hostname: 'example.com', timestamp: 1700000000000 };
  const paths = { reeseScriptPath: '/reese.js', utmvcScriptPath: '/utmvc.js' };
  if (vendor === 'akamai') {
    dialog = module.showScriptParsingModal(scripts, ['https://example.com/post']);
    const categories = { pixel: scripts.filter(s => s.categories.includes('pixel')), sensor: scripts.filter(s => s.categories.includes('sensor')),
      sbsd: scripts.filter(s => s.categories.includes('sbsd')), sensorUrl: [{ type: 'sensor-url', src: 'https://example.com/post', url: 'https://example.com/post', categories: ['sensor-url'] }] };
    expected = type => module.generateScriptParsingCode(type === 'all' ? categories : { pixel: type === 'pixel' ? categories.pixel : [],
      sensor: type === 'sensor' ? categories.sensor : [], sensorUrl: type === 'sensor' ? categories.sensorUrl : [], sbsd: type === 'sbsd' ? categories.sbsd : [] });
  } else if (vendor === 'imperva') {
    // The generated UTMVC path embeds Date.now(), and the dialog regenerates
    // code on every type/language switch: a millisecond tick between the
    // dialog and the expected output made this test flaky. Pin the clock of
    // the vm context the generator runs in; it has its own Date.
    const ContextDate = vm.runInContext('Date', context);
    ContextDate.now = () => 1700000000000;
    dialog = module.displayExportCodeModal(module.generateParsingCode(data, paths), paths, data);
    expected = type => { const codes = module.generateParsingCode(data, paths, type); return { ...codes, nodejs: codes.javascript }; };
    assert.match(module.generateParsingCode(data, paths).javascript, /e=1700000000000/);
  } else {
    dialog = module.displayExportCodeModal(scripts);
    if (vendor === 'awswaf') expected = () => module.generateAwsWafParsingCode(scripts);
    if (vendor === 'shapesecurity') expected = type => module.generateParsingCode(scripts, { hasInitJs: true, hasSeeds: true, scriptType: type });
    if (vendor === 'cloudflare' || vendor === 'datadome') expected = () => Object.fromEntries(['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'].map(language =>
      [language, vendor === 'cloudflare' ? module.generateCloudflareParsingCode(scripts.map(s => s.url), language) : module.generateDataDomeParsingCode(scripts, language)]));
  }
  const tabs = dialog.modal.querySelectorAll('.advanced-code-dialog__language');
  assert.equal(tabs.length, vendor === 'shapesecurity' ? 5 : 6);
  const typeButtons = dialog.modal.querySelectorAll('.advanced-code-dialog__type');
  const types = typeButtons.length ? typeButtons.map(button => button.dataset.type) : ['all'];
  for (const type of types) {
    if (typeButtons.length) dialog.selectType(type);
    const codes = expected && expected(type);
    for (const tab of tabs) {
      dialog.selectLanguage(tab.dataset.lang);
      const value = dialog.modal.querySelector('.advanced-code-dialog__code').value;
      if (codes) assert.equal(value, codes[tab.dataset.lang]);
      else assert.ok(value.includes('example.com'), 'Turnstile output is literal script text');
    }
  }
  const source = fs.readFileSync(path.join(__dirname, `../sections/advanced/modules/${vendor}/${vendor}-advanced-ui.js`), 'utf8');
  assert.doesNotMatch(source, /(?<!\r)\n/, 'vendor CRLF is preserved');
  if (vendor === 'turnstile') {
    const block = source.match(/        const generateCode = \(language\) => \{[\s\S]*?        \};/)[0];
    assert.equal(require('node:crypto').createHash('sha256').update(block).digest('hex'),
      'ec9f62d81d5a02ac0e3ce364bdb60453cf3df4a66b47c36aad4f564356811a80', 'all six original templates remain byte-identical');
  }
});
