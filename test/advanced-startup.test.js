const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function load(response) {
  const reveals = [];
  const classes = new Set();
  const panel = { innerHTML: '' };
  let display = 'none';
  const content = { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
    style: { get display() { return display; }, set display(value) {
      display = value;
      if (value !== 'none') reveals.push({ html: panel.innerHTML, noTools: classes.has('is-no-tools') });
    } } };
  const elements = { '#advancedContent': content, '#toolsPanel': panel,
    '#noAdvancedState': { style: { display: 'none' } }, '#advancedLoadingState': { style: { display: 'flex' } } };
  const requests = [];
  const retries = [];
  const context = { window: {}, Logger: { ui() {}, debug() {}, error() {} },
    FormatUtils: require('../utils/format-utils'),
    document: { querySelector: selector => elements[selector] || null },
    chrome: { runtime: { getURL: p => p, sendMessage: (message, callback) => {
      requests.push(message); callback(typeof response === 'function' ? response(requests.length) : response);
    } } },
    setTimeout: (callback, delay) => { if (delay === 500) { retries.push(delay); queueMicrotask(callback); } return 1; }, clearTimeout() {} };
  vm.createContext(context);
  for (const file of ['advanced.js', 'advanced-runtime.js', 'advanced-tools.js']) vm.runInContext(read(`sections/advanced/${file}`), context);
  const advanced = new context.window.Advanced({ initialized: true }, { currentResults: [] });
  advanced.currentTab = { id: 12, url: 'https://example.test' };
  advanced.setupSubTabListeners = () => {};
  advanced.updateCaptureCountBadge = async () => {};
  advanced.setupNoToolsHistoryLink = async () => {};
  advanced.setupDetectionToolsListeners = () => {};
  return { advanced, elements, reveals, requests, retries, classes };
}

test('Advanced never reveals its toolbar over an empty panel while detections are pending', async () => {
  const { advanced, elements, reveals } = load();
  let resolve;
  advanced.getDetectionModules = () => new Promise(done => { resolve = done; });
  const rendering = advanced.showToolsInterface();
  assert.equal(elements['#advancedContent'].style.display, 'none', 'toolbar must stay hidden during the lookup');
  resolve([]);
  await rendering;
  assert.ok(reveals.length > 0);
  assert.ok(reveals.every(state => state.html.includes('advancedNoTools') && state.noTools), 'first visible frame must contain the completed empty state');
  assert.equal(elements['#advancedLoadingState'].style.display, 'none');
});

test('Advanced reads completed detections from the background response envelope', async () => {
  const detection = { detector: { id: 'detect-akamai', name: 'Akamai' } };
  const { advanced, requests, retries } = load({ status: 'ok', data: { detectionResults: [detection] } });
  const modules = await advanced.getDetectionModules();
  assert.equal(modules.length, 1);
  assert.equal(modules[0].detection, detection);
  assert.equal(requests.length, 1, 'a completed response needs no retry');
  assert.equal(retries.length, 0);
});

test('Advanced accepts a completed empty result without delaying it with retries', async () => {
  for (const data of [null, [], { detectionResults: [] }]) {
    const { advanced, requests, retries } = load({ status: 'ok', data });
    const results = await advanced.getCurrentDetections();
    assert.equal(results.length, 0);
    assert.equal(requests.length, 1, JSON.stringify(data));
    assert.equal(retries.length, 0);
  }
});

test('pending detection still retries and displays a subsequent supported result', async () => {
  const detection = { detector: { id: 'detect-recaptcha', name: 'reCAPTCHA' } };
  const { advanced, requests, retries } = load(attempt => attempt === 1
    ? { status: 'pending', data: null }
    : { status: 'ok', data: { detectionResults: [detection] } });
  const modules = await advanced.getDetectionModules();
  assert.equal(modules.length, 1);
  assert.equal(requests.length, 2);
  assert.equal(retries.length, 1);
});

test('legacy array responses remain supported', async () => {
  const detection = { detector: { id: 'detect-akamai', name: 'Akamai' } };
  const { advanced, requests } = load({ data: [detection] });
  assert.equal((await advanced.getDetectionModules()).length, 1);
  assert.equal(requests.length, 1);
});

test('supported tools become visible only after their protection cards are ready', async () => {
  const { advanced, reveals, classes } = load();
  advanced.getDetectionModules = async () => [{ detection: { detector: { id: 'detect-akamai', name: 'Akamai' } }, module: { productName: 'Akamai' } }];
  await advanced.showToolsInterface();
  assert.ok(reveals.length > 0);
  assert.ok(reveals.every(state => state.html.includes('advanced-launch-card') && state.html.includes('detect-akamai')));
  assert.equal(classes.has('is-no-tools'), false);
});

test('render errors leave a visible error state and stop the loader', async () => {
  const { advanced, elements } = load();
  advanced.getDetectionModules = async () => { throw new Error('lookup failed'); };
  await advanced.showToolsInterface();
  assert.equal(elements['#advancedContent'].style.display, 'none');
  assert.equal(elements['#advancedLoadingState'].style.display, 'none');
  assert.equal(elements['#noAdvancedState'].style.display, 'flex');
  assert.match(elements['#noAdvancedState'].innerHTML, /Error loading Advanced tools/);
});
