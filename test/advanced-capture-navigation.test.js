const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const errors = [], opened = [], lookups = [], loads = [];
  const capture = { id: 'saved', timestamp: 123, url: 'https://example.com', data: { token: 'saved-token' } };
  const history = {};
  const context = { window: {}, Logger: { ui() {}, debug() {}, error() {} },
    NotificationHelper: { error: message => errors.push(message), info: message => errors.push(message) },
    AdvancedHistoryStore: { load: async () => history }, document: { querySelectorAll: () => [] } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/advanced/vendor-registry.js'), 'utf8'), context);
  for (const file of ['advanced.js', 'advanced-runtime.js', 'history/controller.js', 'history/view.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced', file), 'utf8'), context);
  }
  const Advanced = context.window.Advanced;
  const advanced = new Advanced({ findDetectorById(id) {
    lookups.push(id);
    return id.startsWith('detect-') ? { id, name: id } : null;
  } }, {});
  for (const [id, info] of Object.entries(Advanced.AVAILABLE_MODULES)) {
    context.window[info.name] = class {
      constructor(detection) { loads.push({ id, detection }); }
      renderCaptureDetailsContent(value) { return value; }
      displayCaptureDetailsModal(id, content) { opened.push({ id, content }); }
    };
  }
  context.BaseAdvancedModule = class {
    constructor(detection, tab, name) { this.moduleName = name; }
    renderCaptureDetailsContent(value) { return value; }
    displayCaptureDetailsModal(id, content) { opened.push({ id, content, generic: true }); }
  };
  return { advanced, Advanced, context, errors, opened, lookups, loads, history, capture };
}

test('every registered capture module resolves canonical detector IDs and opens saved data', async () => {
  const f = fixture();
  for (const id of Object.keys(f.Advanced.AVAILABLE_MODULES)) {
    f.history[id] = [f.capture];
    await f.advanced.viewCaptureDetails(id, 'saved');
    assert.equal(f.opened.length, f.loads.length);
    assert.equal(f.opened.at(-1)?.content.captureData.token, 'saved-token', id);
    assert.equal(f.loads.at(-1)?.detection.detector.id, `detect-${id}`, id);
    assert.equal(f.loads.at(-1)?.detection.confidence, 0, id);
    assert.equal(f.loads.at(-1)?.detection.methods.length, 0, id);
  }
  assert.deepEqual(f.errors, []);
});

for (const [stored, registered] of [['imperva', 'incapsula'], ['incapsula', 'incapsula'], ['awswaf', 'aws-waf'], ['aws-waf', 'aws-waf'], ['detect-akamai', 'akamai'], ['detect-imperva', 'incapsula'], ['detect-awswaf', 'aws-waf']]) {
  test(`saved ${stored} uses registered ${registered} module`, async () => {
    const f = fixture();
    f.history[stored] = [f.capture];
    await f.advanced.viewCaptureDetails(stored, 'saved');
    assert.equal(f.loads[0]?.id, registered);
    assert.equal(f.opened.length, 1);
    assert.deepEqual(f.errors, []);
  });
}

test('aliases reuse an already loaded module without detector lookup', async () => {
  const f = fixture();
  f.history.imperva = [f.capture];
  f.advanced.loadedModules.incapsula = new f.context.window.ImpervaAdvanced({});
  await f.advanced.viewCaptureDetails('imperva', 'saved');
  assert.equal(f.opened.length, 1);
  assert.deepEqual(f.lookups, []);
});

test('removed or unavailable detectors still open registered saved captures', async () => {
  const f = fixture();
  f.advanced.detectorManager = null;
  f.history.akamai = [f.capture];
  await f.advanced.viewCaptureDetails('akamai', 'saved');
  assert.equal(f.opened.length, 1);
  assert.deepEqual(f.errors, []);
});

test('missing vendor class uses existing generic native detail path', async () => {
  const f = fixture();
  delete f.context.window.AkamaiAdvanced;
  f.history.akamai = [f.capture];
  await f.advanced.viewCaptureDetails('akamai', 'saved');
  assert.equal(f.opened[0]?.generic, true);
  assert.equal(f.opened[0]?.content.captureData.token, 'saved-token');
});

test('unknown identities and absent or malformed captures fail safely without loading', async () => {
  for (const [moduleId, entries] of [['unknown', [ { id: 'saved' } ]], ['__proto__', []], ['akamai', []], ['akamai', {}], ['akamai', [null]]]) {
    const f = fixture();
    f.history[moduleId] = entries;
    await f.advanced.viewCaptureDetails(moduleId, 'saved');
    assert.equal(f.opened.length, 0);
    assert.equal(f.loads.length, 0);
    assert.equal(f.errors.length, 1);
  }
});

test('alias buckets keep their own saved capture when IDs collide', async () => {
  const f = fixture();
  f.history.imperva = [f.capture];
  f.history.incapsula = [{ ...f.capture, data: { token: 'other-bucket' } }];
  await f.advanced.viewCaptureDetails('imperva', 'saved');
  assert.equal(f.opened[0].content.captureData.token, 'saved-token');
});

test('legacy detector aliases resolve when only their canonical detector is installed', async () => {
  for (const [stored, detectorId] of [['imperva', 'detect-imperva'], ['awswaf', 'detect-awswaf']]) {
    const f = fixture();
    f.history[stored] = [f.capture];
    f.advanced.detectorManager.findDetectorById = id => id === detectorId ? { id } : null;
    await f.advanced.viewCaptureDetails(stored, 'saved');
    assert.equal(f.loads[0].detection.detector.id, detectorId);
    assert.equal(f.opened.length, 1);
  }
});

test('store errors, module errors and unavailable generic class notify without rejecting', async () => {
  for (const failure of ['store', 'render', 'unavailable']) {
    const f = fixture();
    f.history.akamai = [f.capture];
    if (failure === 'store') f.context.AdvancedHistoryStore.load = async () => { throw Error('storage'); };
    if (failure === 'render') f.context.window.AkamaiAdvanced.prototype.renderCaptureDetailsContent = () => { throw Error('render'); };
    if (failure === 'unavailable') {
      delete f.context.window.AkamaiAdvanced;
      delete f.context.BaseAdvancedModule;
    }
    await assert.doesNotReject(f.advanced.viewCaptureDetails('akamai', 'saved'));
    assert.equal(f.errors.length, 1);
    assert.equal(f.opened.length, 0);
  }
});

test('real generic renderer remains viable without a vendor class or current detector', async () => {
  const f = fixture();
  delete f.context.window.AkamaiAdvanced;
  delete f.context.BaseAdvancedModule;
  f.context.AdvancedUtils = { escapeHtml: value => String(value).replaceAll('<', '&lt;') };
  f.context.FormatUtils = require('../utils/format-utils');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/base-advanced-module.js'), 'utf8'), f.context);
  for (const component of ['components/tool-grid', 'components/dialogs', 'components/cookie-results', 'history/module-history']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/' + component + '.js'), 'utf8'), f.context);
  }
  vm.runInContext('BaseAdvancedModule.prototype.displayCaptureDetailsModal = function(id, content) { window.genericDetails = { id, content }; }', f.context);
  f.advanced.detectorManager = null;
  f.history.akamai = [f.capture];
  await f.advanced.viewCaptureDetails('akamai', 'saved');
  assert.equal(f.context.window.genericDetails.id, 'saved');
  assert.match(f.context.window.genericDetails.content, /https:\/\/example.com/);
  assert.deepEqual(f.errors, []);
});

test('card pointer and keyboard navigation isolate copy and delete actions', async () => {
  const f = fixture(), calls = [];
  const node = () => ({ listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const copy = node(), remove = node(), card = node();
  card.getAttribute = key => key === 'data-module-id' ? 'akamai' : 'saved';
  card.querySelector = selector => selector.includes('copy') ? copy : selector.includes('delete') ? remove : null;
  f.context.document.querySelectorAll = () => [card];
  f.advanced.viewCaptureDetails = (...args) => calls.push(['view', ...args]);
  f.advanced.copyCaptureData = (...args) => calls.push(['copy', ...args]);
  f.advanced.deleteSingleCapture = (...args) => calls.push(['delete', ...args]);
  f.advanced.setupCaptureCardListeners();
  card.listeners.click({ target: { closest: () => null } });
  let prevented = 0;
  for (const key of ['Enter', ' ']) card.listeners.keydown({ key, target: card, preventDefault() { prevented++; } });
  card.listeners.keydown({ key: 'Enter', target: copy, preventDefault() { throw Error('nested action intercepted'); } });
  card.listeners.click({ target: { closest: () => copy } });
  await copy.listeners.click({ stopPropagation() {} });
  await remove.listeners.click({ stopPropagation() {} });
  assert.equal(prevented, 2);
  assert.deepEqual(calls.map(call => call[0]), ['view', 'view', 'view', 'copy', 'delete']);
  assert.ok(calls.every(call => call[1] === 'akamai' && call[2] === 'saved'));
});

function loadRealHistoryModule(f) {
  delete f.context.BaseAdvancedModule;
  f.context.AdvancedUtils = { escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;') };
  f.context.FormatUtils = require('../utils/format-utils');
  f.context.setTimeout = () => {};
  f.context.document.querySelector = () => null;
  for (const file of ['modules/advanced/result-model.js', 'sections/advanced/base-advanced-module.js', 'sections/advanced/components/dialogs.js', 'sections/advanced/history/module-history.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), f.context);
  }
  const module = new f.context.window.BaseAdvancedModule({}, { id: 7, url: 'https://example.com' }, 'akamai');
  module.renderCaptureDetailsContent = () => { throw Error('Tool results must not use the vendor capture renderer'); };
  module.displayCaptureDetailsModal = (id, content) => f.opened.push({ id, content });
  f.advanced.loadedModules.akamai = module;
  return module;
}

for (const location of ['unified', 'vendor']) {
  for (const format of ['structured', 'legacy']) {
    test(`${location} history opens ${format} tool results with the actual text renderer`, async () => {
      const f = fixture(), module = loadRealHistoryModule(f);
      const data = format === 'structured'
        ? { schemaVersion: 1, tool: 'analysis', result: { scripts: ['<script>saved output</script>'] } }
        : { tool: 'analysis', lines: ['<script>saved output</script>'] };
      const capture = { ...f.capture, data, captureData: data };
      f.history.akamai = [capture];
      module.loadCaptureHistory = async () => [capture];
      if (location === 'unified') await f.advanced.viewCaptureDetails('akamai', 'saved');
      else await module.toggleCaptureDetails('saved');
      assert.equal(f.opened.length, 1);
      assert.match(f.opened[0].content, /&lt;script&gt;saved output&lt;\/script&gt;/);
      assert.doesNotMatch(f.opened[0].content, /<script>/);
      assert.deepEqual(f.errors, []);
    });
  }
}

for (const confirmation of ['start', 'reopened-state']) {
  test(`${confirmation} confirmation owns the capture button despite late completions`, async () => {
    const f = fixture(), module = loadRealHistoryModule(f);
    module.afterCaptureStart = async () => {};
    module.renderCapturedDataSection = async () => {};
    module.sendMessage = async () => ({ status: 'started', isCapturing: true, requestId: 'current-job' });
    if (confirmation === 'start') await module.startCapturing();
    else await module.checkCaptureState();
    assert.equal(module.captureRequestId, 'current-job');
    f.advanced.currentTab = { id: 7 };
    f.advanced.activeModule = module;
    let onMessage;
    f.context.AdvancedToolClient = { subscribe(listener) { onMessage = listener; } };
    f.advanced.updateCaptureCountBadge = async () => {};
    f.advanced.setupCaptureCompletionListener();
    for (const details of [{ requestId: 'old-job' }, { requestId: undefined }, { requestId: 'current-job', tabId: 8 }, { requestId: 'current-job', vendorId: 'imperva' }]) {
      await onMessage({ type: 'AKAMAI_CAPTURE_COMPLETED', tabId: 7, vendorId: 'akamai', ...details });
      assert.equal(module.isCapturing, true);
      assert.equal(module.captureRequestId, 'current-job');
    }
    await onMessage({ type: 'AKAMAI_CAPTURE_COMPLETED', tabId: 7, vendorId: 'akamai', requestId: 'current-job' });
    assert.equal(module.isCapturing, false);
    assert.equal(module.captureRequestId, null);
  });
}
