const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FormatUtils = require('../utils/format-utils');

const modules = [
  ['akamai', 'AkamaiAdvanced', ['CheckCookies', 'AnalyzeContent', 'StartCapture', 'ExtractSensor']],
  ['awswaf', 'AwsWafAdvanced', ['CheckCookies', 'AnalyzeScripts']],
  ['cloudflare', 'CloudflareAdvanced', ['CheckCookies', 'ExtractSiteKey', 'AnalyzeScripts']],
  ['datadome', 'DataDomeAdvanced', ['CheckCookies', 'AnalyzeScripts']],
  ['funcaptcha', 'FunCaptchaAdvanced', ['AnalyzeScripts', 'StartCapture']],
  ['geetest', 'GeetestAdvanced', ['Version', 'Analyze']],
  ['hcaptcha', 'HCaptchaAdvanced', ['CheckVersion', 'StartCapture', 'AnalyzeScripts']],
  ['imperva', 'ImpervaAdvanced', ['CheckCookies', 'StartCapture', 'AnalyzeScripts']],
  ['recaptcha', 'ReCaptchaAdvanced', ['Click', 'Extract', 'Callback', 'StartCapture']],
  ['shapesecurity', 'ShapeSecurityAdvanced', ['CheckVersion', 'CheckCookies', 'StartCapture', 'AnalyzeScripts']],
  ['turnstile', 'TurnstileAdvanced', ['ExtractSiteKey', 'AnalyzeScripts']]
];

function element() {
  const attrs = new Map(), classes = new Set(), listeners = new Map();
  const parts = Object.fromEntries(['.advanced-tool-label', '.advanced-tool-hint', '.advanced-tool-icon', '.advanced-tool-indicator'].map(key => [key, { textContent: '', innerHTML: '' }]));
  return { disabled: false, style: {}, parts,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, force) { if (force) classes.add(value); else classes.delete(value); } },
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, String(value)),
    removeAttribute: key => attrs.delete(key),
    querySelector: selector => parts[selector] || (selector.includes('.advanced-tool-label') ? parts['.advanced-tool-label'] : null),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    async click() { await Promise.all([...(listeners.get('click') || [])].map(fn => fn({ currentTarget: this }))); },
    listeners
  };
}

function fixture() {
  const nodes = new Map(), errors = [];
  const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales/en/messages.json'), 'utf8'));
  const context = { window: {}, document: { querySelector: selector => nodes.get(selector) || null, getElementById: id => nodes.get('#' + id) || null },
    Logger: { ui() {}, debug() {}, network() {}, error() {} },
    FormatUtils, AdvancedUtils: { escapeHtml: FormatUtils.escapeHtml },
    I18n: { get: key => messages[key]?.message || '', format: (key, ...args) => args.reduce((text, arg, i) => text.replaceAll('{' + i + '}', String(arg)), messages[key]?.message || ''), tr: (key, fallback) => messages[key]?.message || fallback },
    NotificationHelper: { error: value => errors.push(value) }, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/detection/scrapfly-export.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/base-advanced-module.js'), 'utf8'), context);
  for (const [folder] of modules) {
    for (const suffix of ['advanced', 'advanced-ui']) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, `../sections/advanced/modules/${folder}/${folder}-${suffix}.js`), 'utf8'), context);
    }
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/advanced/modules/akamai/akamai-advanced-lifecycle.js'), 'utf8'), context);
  context.window.ImpervaAdvanced.prototype.setupExtractionListener = () => {};
  const instance = new context.window.BaseAdvancedModule({}, { id: 1 }, 'test');
  return { context, nodes, errors, instance };
}

for (const [folder, className, suffixes] of modules) {
  test(`${folder}: every action uses a native semantic row, hint, outline icon, and bound handler`, async () => {
    const { context, nodes } = fixture();
    const module = new context.window[className]({}, { id: 1 });
    const html = module.renderTools();
    // Every protection also gets "Scrape with Scrapfly"
    const rows = suffixes.length + 1;
    assert.equal((html.match(/class="advanced-tool-card/g) || []).length, rows);
    assert.equal((html.match(/class="advanced-tool-hint"/g) || []).length, rows);
    assert.equal((html.match(/class="advanced-tool-indicator"/g) || []).length, rows);
    assert.equal((html.match(/type="button"/g) || []).length, rows);
    assert.equal((html.match(/data-icon-style="outline"/g) || []).length, rows);
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    // Every vendor renders its capture action as the last row, Scrapfly just before it
    const expected = [...suffixes.filter(x => x !== 'StartCapture'), 'ScrapeWithScrapfly', ...suffixes.filter(x => x === 'StartCapture')];
    assert.deepEqual(ids, expected.map(suffix => folder + suffix));
    assert.equal(new Set(ids).size, rows);
    let release, calls = 0;
    const promise = new Promise(resolve => { release = resolve; });
    for (const name of ['checkCookies', 'analyzeContent', 'analyzeScripts', 'extractScripts', 'startCapturing', 'extractSensorInformation', 'checkVersion', 'extractSiteKey', 'clickRecaptcha', 'captureCallback']) module[name] = () => { calls++; return promise; };
    for (const id of ids) nodes.set('#' + id, element());
    module.setupToolListeners();
    module.setupToolListeners();
    for (const id of ids) assert.equal(nodes.get('#' + id).listeners.get('click').size, 1);
    const first = nodes.get('#' + ids[0]);
    const request = first.click();
    assert.equal(first.disabled, true, 'busy lasts until the real handler promise settles');
    await first.click();
    assert.equal(calls, 1, 'no duplicate action while busy');
    release(); await request;
    assert.equal(first.disabled, false);
    assert.equal(first.getAttribute('aria-busy'), null);
    // New nodes must be bound even when the same module instance is rendered again.
    const replacement = element(); nodes.set('#' + ids[0], replacement);
    module.setupToolListeners(); await replacement.click();
    assert.equal(calls, 2);
  });
}

test('capture rows render last and the other rows keep their order', () => {
  const { context } = fixture();
  const instance = new context.window.AkamaiAdvanced({}, { id: 1 });
  const html = instance.renderToolGrid([{ id: 'xStartCapture', label: 'C' }, { id: 'xCheckCookies', label: 'A' }, { id: 'xAnalyzeScripts', label: 'B' }]);
  assert.deepEqual([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]), ['xCheckCookies', 'xAnalyzeScripts', 'akamaiScrapeWithScrapfly', 'xStartCapture']);
});

test('tool labels, identifiers, hints and extra classes cannot introduce HTML', () => {
  const { instance } = fixture();
  const html = instance.renderToolGrid([{ id: 'test" autofocus="yes', label: '<img src=x onerror=alert(1)>', hint: '<b>unsafe</b>' }], { className: 'x" onclick="unsafe' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('id="test" autofocus='));
  assert.ok(!html.includes('onclick="unsafe'));
  assert.ok(html.includes('&lt;img'));
});

test('a rejected action restores the button, reports the error, and can be retried', async () => {
  const { instance, nodes, errors } = fixture();
  const button = element(); nodes.set('#testAnalyze', button);
  let calls = 0;
  instance.bindToolActions([{ id: 'testAnalyze', handler: async () => { calls++; if (calls === 1) throw new Error('offline'); } }]);
  await button.click();
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.classList.contains('is-working'), false);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('offline'));
  await button.click(); assert.equal(calls, 2);
});

test('a synchronous action failure is contained and pre-disabled controls remain disabled', async () => {
  const { instance, nodes, errors } = fixture();
  const button = element(); nodes.set('#testVersion', button);
  instance.bindToolActions([{ id: 'testVersion', handler: () => { throw new Error('unavailable'); } }]);
  await button.click(); assert.equal(errors.length, 1); assert.equal(button.disabled, false);
  button.disabled = true; await button.click();
  assert.equal(errors.length, 1); assert.equal(button.disabled, true);
});

test('Akamai and shared capture updates keep label, icon, hint and pressed state synchronized', () => {
  const { context, nodes } = fixture();
  for (const [folder, className] of modules.filter(([, , actions]) => actions.includes('StartCapture'))) {
    const module = new context.window[className]({}, { id: 1 });
    const button = element(); nodes.set('#' + folder + 'StartCapture', button);
    module.updateCaptureButtonState(true);
    assert.equal(button.classList.contains('capturing'), true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.match(button.parts['.advanced-tool-label'].textContent, /Stop/);
    assert.match(button.parts['.advanced-tool-hint'].textContent, /Stop recording/);
    assert.match(button.parts['.advanced-tool-icon'].innerHTML, /rect/);
    module.updateCaptureButtonState(false);
    assert.equal(button.classList.contains('capturing'), false);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.match(button.parts['.advanced-tool-label'].textContent, /Start/);
    assert.equal(button.style.background || '', '');
  }
});

test('initial and false capture responses cannot leave a stale Stop label', async () => {
  const { instance, nodes } = fixture();
  nodes.set('#testStartCapture', element());
  instance.isCapturing = true;
  instance.sendMessage = async () => ({ isCapturing: false });
  await instance.checkCaptureState();
  assert.equal(instance.isCapturing, false);
  assert.equal(nodes.get('#testStartCapture').getAttribute('aria-pressed'), 'false');
  instance.isCapturing = true;
  instance.sendMessage = async () => ({ status: 'error' });
  await instance.checkCaptureState();
  assert.equal(instance.isCapturing, true, 'unknown state does not claim recording stopped');
});

for (const started of [true, false]) {
  test(`a delayed initial state reply cannot undo a confirmed ${started ? 'start' : 'stop'}`, async () => {
    const { instance, nodes } = fixture();
    const button = element(); nodes.set('#testStartCapture', button);
    let resolveState;
    const pendingState = new Promise(resolve => { resolveState = resolve; });
    instance.sendMessage = async message => message.type.endsWith('GET_CAPTURE_STATE')
      ? pendingState : { status: message.type.endsWith('START_CAPTURE') ? 'started' : 'stopped' };
    instance.afterCaptureStart = async () => {};
    instance.renderCapturedDataSection = async () => {};
    instance.updateCaptureButtonState(!started);
    const query = instance.checkCaptureState();
    if (started) await instance.startCapturing();
    else await instance.stopCapturing();
    assert.equal(instance.isCapturing, started);
    resolveState({ isCapturing: !started });
    await query;
    assert.equal(instance.isCapturing, started);
    assert.equal(button.getAttribute('aria-pressed'), String(started));
  });
}

for (const folder of ['test', 'akamai']) {
  test(`${folder}: a failed action redraw does not invalidate the pending initial capture-state response`, async () => {
    const { context, instance: base, nodes } = fixture();
    const instance = folder === 'akamai' ? new context.window.AkamaiAdvanced({}, { id: 1 }) : base;
    const button = element(); nodes.set('#' + folder + 'StartCapture', button);
    let resolveState;
    instance.sendMessage = () => new Promise(resolve => { resolveState = resolve; });
    const query = instance.checkCaptureState();
    instance.bindToolActions([{ id: folder + 'StartCapture', handler: async () => { throw new Error('temporarily unavailable'); } }]);
    await button.click();
    resolveState({ isCapturing: true });
    await query;
    assert.equal(instance.isCapturing, true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  });
}

test('a failed stop keeps recording state and a confirmed stop clears it', async () => {
  const { instance, nodes, errors } = fixture();
  const button = element(); nodes.set('#testStartCapture', button);
  instance.isCapturing = true; instance.updateCaptureButtonState(true);
  instance.sendMessage = async () => ({ status: 'error', error: 'connection lost' });
  instance.renderCapturedDataSection = async () => {};
  await instance.stopCapturing();
  assert.equal(instance.isCapturing, true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(errors.length, 1);
  instance.sendMessage = async () => ({ status: 'stopped' });
  await instance.stopCapturing(); assert.equal(instance.isCapturing, false);
});

test('Akamai override retains recording after a failed stop and clears it only after confirmation', async () => {
  const { context, nodes, errors } = fixture();
  const module = new context.window.AkamaiAdvanced({}, { id: 1 });
  const button = element(); nodes.set('#akamaiStartCapture', button);
  context.NotificationHelper.info = () => {};
  context.NotificationHelper.success = () => {};
  context.chrome = { runtime: { sendMessage: async () => ({ status: 'error', error: 'offline' }) } };
  module.updateCaptureButtonState(true);
  await module.stopCapturing();
  assert.equal(module.isCapturing, true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(errors.length, 1);
  context.chrome.runtime.sendMessage = async () => ({ status: 'stopped' });
  await module.stopCapturing();
  assert.equal(module.isCapturing, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(errors.length, 1);
});

test('all method semantics disclose reloads, cookie resets and capture state without relying on translated labels', () => {
  const { context } = fixture();
  const resetsScripts = new Set(['awswaf', 'imperva']);
  const reloadVersions = new Set(['hcaptcha', 'geetest']);
  let count = 0;
  for (const [folder, className, suffixes] of modules) {
    const module = new context.window[className]({}, { id: 1 });
    for (const suffix of suffixes) {
      const action = module.resolveToolAction({ id: folder + suffix, label: '任意の翻訳' });
      const hint = module.getToolHint(action);
      assert.ok(hint.length > 0, `${folder}${suffix} has an honest hint`);
      if (suffix.includes('Analyze')) {
        assert.equal(action, 'scripts');
        assert.match(hint, /reload/i);
        assert.equal(/Reset protection/.test(hint), resetsScripts.has(folder));
      } else if (suffix.includes('Version')) {
        assert.equal(action, 'version');
        assert.equal(/reload/i.test(hint), reloadVersions.has(folder));
      } else if (suffix === 'ExtractSensor') {
        assert.equal(action, 'sensor');
        assert.match(hint, /Reset protection cookies and reload/);
      } else if (suffix === 'StartCapture') {
        assert.equal(action, 'capture');
        assert.match(module.getToolHint(action, true), /Stop recording/);
        assert.equal(/Reset the protection cookie/.test(hint), folder === 'akamai');
      } else {
        assert.ok(['cookies', 'selector', 'sitekey', 'callback'].includes(action));
      }
      count++;
    }
  }
  assert.equal(count, 31);
});

test('action and code dialog styles use full rows and a separate non-overlapping code toolbar', () => {
  const css = fs.readFileSync(path.join(__dirname, '../modules/styles/advanced.css'), 'utf8');
  assert.match(css, /\.advanced-tool-grid[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.advanced-tool-hint\s*\{/);
  assert.match(css, /\.advanced-tool-card\.is-working/);
  assert.match(css, /\.advanced-tool-icon\[data-icon-style="outline"\]/);
  assert.match(css, /\.advanced-code-dialog__panel\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.advanced-code-dialog__toolbar\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.advanced-code-dialog__code\s*\{[^}]*overflow:\s*auto/);
});

test('every protection gets one "Scrape with Scrapfly" card with the Scrapfly logo, bound to its dialog', async () => {
  const { context, nodes } = fixture();
  for (const [folder, className] of modules) {
    const module = new context.window[className]({ name: `${folder} name`, category: 'Anti-Bot', detector: { icon: `${folder}.png` } }, { id: 1, url: 'https://shop.example/p' });
    const html = module.renderTools();
    const id = `${folder}ScrapeWithScrapfly`;
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, folder);
    assert.match(html, new RegExp(`id="${id}" data-tool-kind="default" data-tool-action="scrapfly"`), folder);
    assert.match(html, /advanced-tool-icon--blue[^>]*><img class="advanced-tool-logo" src="icons\/icon48\.png" alt="">/, folder);
    assert.match(html, /Scrape with Scrapfly/, folder);
    const opened = [];
    context.window.ScrapflyExport.open = options => opened.push(options);
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    for (const other of ids) nodes.set('#' + other, element());
    module.setupToolListeners();
    await nodes.get('#' + id).click();
    assert.equal(opened.length, 1, folder);
    assert.equal(opened[0].url, 'https://shop.example/p');
    assert.equal(opened[0].detections[0].name, `${folder} name`);
    assert.equal(opened[0].detections[0].detector.icon, `${folder}.png`, 'the dialog shows this protection\'s logo');
  }
});

test('Scrape with Scrapfly from a CAPTCHA module without a category still counts as a CAPTCHA', async () => {
  const { context, nodes } = fixture();
  const module = new context.window.ReCaptchaAdvanced({}, { id: 1, url: 'https://shop.example/' });
  const opened = [];
  context.window.ScrapflyExport.open = options => opened.push(options);
  nodes.set('#recaptchaScrapeWithScrapfly', element());
  module.setupToolListeners();
  await nodes.get('#recaptchaScrapeWithScrapfly').click();
  assert.equal(opened[0].detections[0].name, 'reCAPTCHA');
  assert.equal(opened[0].detections[0].category, 'CAPTCHA');
});
