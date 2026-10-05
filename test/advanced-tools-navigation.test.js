const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  const attributes = new Map();
  const classes = new Set();
  return { style: {}, innerHTML: '', textContent: '', disabled: false,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    getAttribute: name => attributes.get(name),
    focus() { this.focused = true; } };
}

function fixture() {
  const panel = element(), section = element(), change = element();
  const buttons = ['detect-akamai', 'detect-recaptcha'].map(id => {
    const button = element(); button.dataset = { detectorId: id }; return button;
  });
  const nodes = { '#detectionToolsPanel': panel, '.captcha-tools-section': section,
    '#compactDetectionIcon': element(), '#compactDetectionName': element(), '#changeDetectionBtn': change };
  const errors = [];
  const context = { window: {}, Logger: { ui() {}, debug() {}, error() {} },
    chrome: { runtime: { getURL: value => value } },
    NotificationHelper: { success() {}, error: message => errors.push(message) },
    AdvancedUtils: { notifications: { moduleLoaded: name => name } },
    FormatUtils: require('../utils/format-utils'),
    document: { querySelector: selector => nodes[selector] || null,
      querySelectorAll: selector => selector === '.advanced-launch-card' ? buttons : [],
      getElementById: id => nodes['#' + id] || null } };
  vm.createContext(context);
  for (const file of ['advanced.js', 'advanced-tools.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced', file), 'utf8'), context);
  }
  const advanced = new context.window.Advanced({}, {});
  advanced.cleanExpiredCaptureData = async () => {};
  advanced.availableDetectionTools = buttons.map(button => ({ detection: { detector: { id: button.dataset.detectorId } } }));
  return { advanced, panel, section, change, buttons, errors };
}

test('a protection card opens its tools directly and returns focus when changing protection', async () => {
  const { advanced, panel, section, change, buttons } = fixture();
  let loaded, bound = 0;
  const module = { renderTools: () => '<button>Capture</button>', setupEventListeners: () => bound++ };
  advanced.loadDetectionModule = async id => { loaded = id; return module; };
  await advanced.loadSelectedDetectionTools('detect-akamai');
  assert.equal(loaded, 'detect-akamai');
  assert.equal(panel.innerHTML, '<button>Capture</button>');
  assert.equal(panel.style.display, 'block');
  assert.ok(section.classList.contains('compact-mode'));
  assert.equal(advanced.activeModule, module);
  assert.equal(bound, 1);
  assert.equal(change.focused, true);
  advanced.clearDetectionToolsPanel();
  assert.equal(panel.innerHTML, '');
  assert.equal(panel.style.display, 'none');
  assert.equal(section.classList.contains('compact-mode'), false);
  assert.equal(advanced.activeModule, null);
  assert.equal(advanced.currentModuleInstance, null);
  assert.equal(buttons[0].focused, true);
});

test('repeated card activation cannot initialize two tools while a module is loading', async () => {
  const { advanced, buttons } = fixture();
  let finish, calls = 0;
  advanced.loadDetectionModule = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const opening = advanced.loadSelectedDetectionTools('detect-akamai');
  await Promise.resolve();
  assert.ok(buttons.every(button => button.disabled));
  await advanced.loadSelectedDetectionTools('detect-recaptcha');
  assert.equal(calls, 1);
  finish({ renderTools: () => 'Akamai tools' });
  await opening;
  assert.ok(buttons.every(button => !button.disabled));
  assert.equal(advanced.selectedDetection, 'detect-akamai');
});

test('failed module loading leaves protection cards usable for another attempt', async () => {
  const { advanced, buttons, errors, section } = fixture();
  advanced.loadDetectionModule = async () => null;
  assert.equal(await advanced.loadSelectedDetectionTools('detect-akamai'), false);
  assert.equal(errors.length, 1);
  assert.ok(buttons.every(button => !button.disabled));
  assert.equal(buttons[0].focused, true);
  assert.equal(section.classList.contains('compact-mode'), false);
  advanced.loadDetectionModule = async () => ({ renderTools: () => 'Tools ready' });
  assert.equal(await advanced.loadSelectedDetectionTools('detect-recaptcha'), true);
});
