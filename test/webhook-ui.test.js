const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');

// Settings → Detection → Webhooks on the page: the "Send only when" fields, the Recent deliveries list and the line the
// Test button leaves in it. A small stand-in for the DOM: only what these functions touch.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.disabled = false; this._text = ''; this.handlers = []; }
  addEventListener(type, handler) { this.handlers.push({ type, handler }); }
  append(...nodes) { this.children.push(...nodes); }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; if (value === '') this.children = []; }
}

function harness({ webhook = {}, stored = {}, translations = {}, fetchImpl, runtimeReply } = {}) {
  const sent = [], listeners = [], notifications = [];
  const store = { ...stored };
  const fields = {
    '#webhookMinConfidence': { value: '' },
    '#webhookDomains': { value: '' },
    '#webhookLogList': new Element('ul'),
    '#webhookLogClearBtn': new Element('button'),
    '#testWebhookBtn': { disabled: false, innerHTML: 'Test' },
    '#webhookUrl': { value: webhook.webhookUrl || '' },
    '#webhookMethod': { value: 'POST' },
    '#webhookPayload': { value: '' },
    '#webhookSecret': { value: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
    '#webhookSecretError': { hidden: true },
    '#webhookSecretCopyBtn': { disabled: true }
  };
  const copied = [];
  const icons = ['antibot', 'captcha', 'fingerprint'].map(() => ({ innerHTML: '', style: {} }));
  const boxes = ['antibot', 'captcha', 'fingerprint'].map((key, i) => ({ checked: false, dataset: { webhookCategory: key }, parentElement: { querySelector: selector => (selector === '.category-icon' ? icons[i] : null) } }));
  const context = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), 
    WebhookBody, URL, URLSearchParams, FormData,
    Logger: Object.fromEntries(['network', 'warn', 'error', 'debug'].map(k => [k, () => {}])),
    UrlUtils: { getFaviconUrl: () => '' },
    Utils: { getSettings: async () => ({ webhook }) },
    SettingsUI: {},
    FormatUtils: { t: (key, fallback, ...args) => (translations[key] || fallback).replace(/\{(\d)\}/g, (_, i) => args[i]), uiLocale: () => 'en', formatDateTime: (time) => `at ${new Date(time).toISOString()}`, categoryIconSvg: key => `<svg data-icon="${key}"></svg>`,
      copyToClipboard: async (text, options) => { copied.push({ text, options }); return true; } },
    NotificationHelper: { success: text => notifications.push(text), error: text => notifications.push(text), info: text => notifications.push(text) },
    document: {
      querySelector: selector => fields[selector] || null,
      querySelectorAll: selector => (selector === '[data-webhook-category]' ? boxes : []),
      createElement: tag => new Element(tag),
      createTextNode: text => ({ text })
    },
    chrome: {
      runtime: { sendMessage(message, callback) { sent.push(message); const answer = runtimeReply ? runtimeReply(message) : { status: 'ok' }; if (callback) { callback(answer); return undefined; } return Promise.resolve(answer); }, lastError: undefined },
      storage: {
        local: { async get(key) { return key in store ? { [key]: store[key] } : {}; } },
        onChanged: { addListener: listener => listeners.push(listener) }
      }
    },
    fetch: fetchImpl || (async () => ({ ok: true, status: 200 }))
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js',
    'modules/core/scan-scope.js', 'modules/settings/settings-runtime.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-webhook.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  context.FormatUtils.DEFAULT_CATEGORY_COLORS = context.Categories.DEFAULT_COLORS;
  const plain = value => JSON.parse(JSON.stringify(value));
  const ui = (settings = { webhook }) => Object.assign(Object.create(context.SettingsUI), { settings, escapeHtml: text => text, getWebhookContentTypeValue: () => 'application/json' });
  return { context, ui, fields, boxes, icons, sent, listeners, notifications, store, plain, copied, SettingsUI: context.SettingsUI };
}

test('the fields are filled from the saved filter, and a webhook saved before filters existed shows the defaults', () => {
  const h = harness();
  h.SettingsUI.populateWebhookFilter({ webhookMinConfidence: 70, webhookCategories: ['captcha', 'antibot'], webhookDomains: ['shop.example.com'] });
  assert.equal(h.fields['#webhookMinConfidence'].value, '70');
  assert.deepEqual(h.boxes.map(box => box.checked), [true, true, false]);
  assert.equal(h.fields['#webhookDomains'].value, 'shop.example.com');
  h.SettingsUI.populateWebhookFilter({ enableWebhook: true });
  assert.equal(h.fields['#webhookMinConfidence'].value, '0');
  assert.deepEqual(h.boxes.map(box => box.checked), [false, false, false]);
  assert.equal(h.fields['#webhookDomains'].value, '');
});

test('each category checkbox shows its icon in the colour chosen in Settings, or the default colour', () => {
  const h = harness();
  const defaults = h.plain(h.context.Categories.DEFAULT_COLORS);
  h.SettingsUI.populateWebhookFilter.call({ settings: { categoryColors: { captcha: '#112233' } } }, {});
  assert.deepEqual(h.icons.map(icon => icon.innerHTML), ['antibot', 'captcha', 'fingerprint'].map(key => `<svg data-icon="${key}"></svg>`));
  assert.deepEqual(h.icons.map(icon => icon.style.color), [defaults.antibot, '#112233', defaults.fingerprint]);
  h.SettingsUI.populateWebhookFilter({});
  assert.deepEqual(h.icons.map(icon => icon.style.color), [defaults.antibot, defaults.captcha, defaults.fingerprint], 'no settings: the default colours');
});

test('the filter is read as the fields say: confidence clamped, categories in the app\'s order, sites as bare hosts', () => {
  const h = harness();
  const read = () => h.plain(h.SettingsUI.readWebhookFilter.call(h.ui()));
  h.fields['#webhookMinConfidence'].value = '150';
  h.boxes[2].checked = true; h.boxes[0].checked = true;
  h.fields['#webhookDomains'].value = 'HTTPS://Shop.Example.com/cart\n shop.example.com, *.other.example';
  assert.deepEqual(read(), { webhookMinConfidence: 100, webhookCategories: ['antibot', 'fingerprint'], webhookDomains: ['shop.example.com', 'other.example'] });
  for (const [typed, expected] of [['-5', 0], ['abc', 0], ['', 0], ['72.9', 72], ['0', 0]]) {
    h.fields['#webhookMinConfidence'].value = typed;
    assert.equal(read().webhookMinConfidence, expected, `"${typed}"`);
  }
});

test('without the fields on the page the saved filter is kept as it is', () => {
  const h = harness();
  for (const key of ['#webhookMinConfidence', '#webhookDomains']) delete h.fields[key];
  h.context.document.querySelectorAll = () => [];
  const saved = { webhookMinConfidence: 55, webhookCategories: ['captcha'], webhookDomains: ['a.example'] };
  assert.deepEqual(h.plain(h.SettingsUI.readWebhookFilter.call(h.ui({ webhook: saved }))), saved);
});

test('each delivery is one line: what came of it, the status, how long, and why it was not sent', () => {
  const h = harness();
  const line = entry => h.SettingsUI.webhookLogLine(entry);
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'sent', status: 200, ms: 84, trigger: 'scan' }).text, 'Sent 200 · 84 ms');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'failed', status: 503, ms: 12, trigger: 'cache' }).text, 'Failed 503 · 12 ms · cached page');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'failed', error: 'network', trigger: 'test' }).text, 'Failed (no answer) · test');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'failed', error: 'blocked', trigger: 'scan' }).text, 'Failed (address not allowed)');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'skipped', reason: 'confidence', trigger: 'scan' }).text, 'Not sent (below the minimum confidence)');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'skipped', reason: 'site', trigger: 'scan' }).text, 'Not sent (site not on the list)');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'skipped', reason: 'category', trigger: 'scan' }).text, 'Not sent (category not selected)');
  assert.equal(line({ t: 0, page: 'shop.example', outcome: 'sent', trigger: 'scan' }).when, 'at 1970-01-01T00:00:00.000Z');
});

test('the words of a line come from the language files', () => {
  const h = harness({ translations: { webhookLogSent: 'Enviado', webhookLogTriggerCache: 'página en caché' } });
  assert.equal(h.SettingsUI.webhookLogLine({ t: 0, page: 'a.example', outcome: 'sent', status: 200, trigger: 'cache' }).text, 'Enviado 200 · página en caché');
});

test('the list shows the newest first, keeps the page as text, and Clear is off while there is nothing to clear', () => {
  const h = harness();
  const list = h.fields['#webhookLogList'], clear = h.fields['#webhookLogClearBtn'];
  h.SettingsUI.renderWebhookLog([]);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].className, 'webhook-log-empty');
  assert.equal(list.children[0].textContent, 'Nothing sent yet.');
  assert.equal(clear.disabled, true);

  h.SettingsUI.renderWebhookLog([
    { t: 1000, page: 'old.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 2000, page: '<img src=x onerror=alert(1)>', outcome: 'failed', error: 'network', trigger: 'scan' },
    { nonsense: true }
  ]);
  assert.equal(list.children.length, 2, 'an entry a log may not hold is not shown');
  const [first, second] = list.children;
  assert.equal(first.className, 'webhook-log-item webhook-log-item--failed');
  assert.equal(second.className, 'webhook-log-item webhook-log-item--sent');
  const page = first.children.find(node => node.className === 'webhook-log-page');
  assert.equal(page.textContent, '<img src=x onerror=alert(1)>', 'a page name is text, never markup');
  assert.equal(page.dir, 'ltr');
  assert.equal(clear.disabled, false);
  h.SettingsUI.renderWebhookLog(undefined);
  assert.equal(list.children.length, 1);
});

test('the list is read from storage and follows it while Settings is open, with one listener however often it is refreshed', async () => {
  const h = harness({ stored: { scrapfly_webhook_log: [{ t: 5, page: 'one.example', outcome: 'sent', status: 204, trigger: 'scan' }] } });
  await h.SettingsUI.refreshWebhookLog();
  await h.SettingsUI.refreshWebhookLog();
  await h.SettingsUI.refreshWebhookLog();
  const list = h.fields['#webhookLogList'];
  assert.equal(list.children.length, 1);
  assert.equal(h.listeners.length, 1);
  h.listeners[0]({ scrapfly_webhook_log: { newValue: [
    { t: 5, page: 'one.example', outcome: 'sent', status: 204, trigger: 'scan' },
    { t: 6, page: 'two.example', outcome: 'sent', status: 200, trigger: 'scan' }
  ] } }, 'local');
  assert.equal(list.children.length, 2);
  h.listeners[0]({ scrapfly_webhook_log: { newValue: [] } }, 'sync');
  assert.equal(list.children.length, 2, 'only this extension\'s local storage');
  h.listeners[0]({ unrelated: { newValue: 1 } }, 'local');
  assert.equal(list.children.length, 2);
  h.listeners[0]({ scrapfly_webhook_log: {} }, 'local');
  assert.equal(list.children[0].className, 'webhook-log-empty', 'a cleared record empties the list');
});

test('Clear asks the worker, and the button is wired once however often Settings is populated', () => {
  const h = harness();
  const clear = h.fields['#webhookLogClearBtn'];
  clear.addEventListener = (type, handler) => { clear.handlers = [...(clear.handlers || []), { type, handler }]; };
  h.SettingsUI._setupWebhookLogListeners.call(h.ui());
  h.SettingsUI._setupWebhookLogListeners.call(h.ui());
  assert.equal(clear.handlers.length, 1);
  clear.handlers[0].handler();
  assert.deepEqual(h.plain(h.sent), [{ type: 'WEBHOOK_LOG_CLEAR' }]);
});

test('the Test button leaves its line through the worker: sent with the status, or failed with the kind of error and never its text', async () => {
  const sample = WebhookBody.sampleContext().hostname;
  const ok = harness({ webhook: { webhookUrl: 'https://hooks.example/SYNTHETIC_PATH_TOKEN' } });
  await ok.SettingsUI.handleTestWebhook.call(ok.ui());
  assert.equal(ok.sent.length, 1);
  assert.equal(ok.sent[0].type, 'WEBHOOK_LOG_ENTRY');
  assert.deepEqual({ page: ok.sent[0].entry.page, outcome: ok.sent[0].entry.outcome, status: ok.sent[0].entry.status, trigger: ok.sent[0].entry.trigger }, { page: sample, outcome: 'sent', status: 200, trigger: 'test' });
  assert.equal(typeof ok.sent[0].entry.ms, 'number');

  const refused = harness({ webhook: { webhookUrl: 'https://hooks.example/SYNTHETIC_PATH_TOKEN' }, fetchImpl: async () => ({ ok: false, status: 502 }) });
  await refused.SettingsUI.handleTestWebhook.call(refused.ui());
  assert.deepEqual({ outcome: refused.sent[0].entry.outcome, status: refused.sent[0].entry.status }, { outcome: 'failed', status: 502 });

  const down = harness({ webhook: { webhookUrl: 'https://hooks.example/SYNTHETIC_PATH_TOKEN' }, fetchImpl: async () => { throw new TypeError('Failed to fetch https://hooks.example/SYNTHETIC_PATH_TOKEN'); } });
  await down.SettingsUI.handleTestWebhook.call(down.ui());
  assert.deepEqual({ page: down.sent[0].entry.page, outcome: down.sent[0].entry.outcome, error: down.sent[0].entry.error }, { page: sample, outcome: 'failed', error: 'network' });
  assert.ok(!JSON.stringify(down.sent).includes('SYNTHETIC_PATH_TOKEN'));

  const blocked = harness({ webhook: { webhookUrl: 'https://127.0.0.1/hook' } });
  await blocked.SettingsUI.handleTestWebhook.call(blocked.ui());
  assert.equal(blocked.sent[0].entry.error, 'blocked');
  assert.ok(!JSON.stringify(blocked.sent).includes('127.0.0.1'));

  const empty = harness({ webhook: { webhookUrl: '' } });
  await empty.SettingsUI.handleTestWebhook.call(empty.ui());
  assert.deepEqual(empty.sent, [], 'nothing was tried, so nothing is recorded');
});

test('the Settings page declares the filter fields and the list the script fills', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sections/settings/settings.html'), 'utf8');
  for (const id of ['webhookMinConfidence', 'webhookDomains', 'webhookLogList', 'webhookLogClearBtn', 'webhookSecret', 'webhookSecretError', 'webhookSecretGenerateBtn', 'webhookSecretCopyBtn', 'webhookSecretNote']) assert.ok(html.includes(`id="${id}"`), id);
  // The secret field never autocompletes or spell-checks, and names the header through an argument no translation can change
  const secretField = html.match(/<input[^>]*id="webhookSecret"[^>]*>/)[0];
  for (const attr of ['type="password"', 'autocomplete="off"', 'spellcheck="false"']) assert.ok(secretField.includes(attr), attr);
  assert.ok(html.includes(`data-i18n-fmt="webhookSecretDescFmt" data-i18n-args="${WebhookBody.SIGNATURE_HEADER}"`));
  assert.ok(html.includes('id="webhookSecretNote" data-i18n="settingsShareSecretNote"'));
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_locales/en/messages.json'), 'utf8'));
  for (const key of ['webhookSecretLabel', 'webhookSecretDescFmt', 'webhookSecretGenerate', 'webhookSecretInvalid']) assert.ok(en[key] && en[key].message, key);
  assert.ok(en.webhookSecretDescFmt.message.includes('{0}'));
  const settingsUi = fs.readFileSync(path.join(__dirname, '..', 'sections/settings/settings-ui.js'), 'utf8');
  assert.ok(settingsUi.includes('webhookSecret: SettingsUI.readWebhookSecret.call(this)'), 'the form reads the secret');
  assert.ok(settingsUi.includes('SettingsUI.populateWebhookSecret.call(this, webhookSettings)'), 'the form shows the saved secret');
  const boxes = [...html.matchAll(/data-webhook-category="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(boxes, require('../modules/core/categories.js').KEYS, 'one box per category, in the app\'s order');
});

// ---------------------------------------------------------------- signing secret
test('the secret field shows the saved secret, Copy is off while it is empty, and the form reads it trimmed (the saved one without the field)', () => {
  const h = harness();
  h.SettingsUI.populateWebhookSecret.call(h.ui(), { webhookSecret: 'SYNTHETIC_SECRET' });
  assert.equal(h.fields['#webhookSecret'].value, 'SYNTHETIC_SECRET');
  assert.equal(h.fields['#webhookSecretCopyBtn'].disabled, false);
  assert.equal(h.fields['#webhookSecretError'].hidden, true);
  h.SettingsUI.populateWebhookSecret.call(h.ui(), { webhookSecret: 42 });
  assert.equal(h.fields['#webhookSecret'].value, '', 'a value that is not text counts as none');
  assert.equal(h.fields['#webhookSecretCopyBtn'].disabled, true);
  h.fields['#webhookSecret'].value = '  SYNTHETIC_TYPED  ';
  assert.equal(h.SettingsUI.readWebhookSecret.call(h.ui()), 'SYNTHETIC_TYPED');
  const noField = harness();
  delete noField.fields['#webhookSecret'];
  assert.equal(noField.SettingsUI.readWebhookSecret.call(noField.ui({ webhook: { webhookSecret: ' SYNTHETIC_SAVED ' } })), 'SYNTHETIC_SAVED');
});

test('Generate stages 64 random hex characters without saving them, and Copy hands exactly the field to the clipboard', () => {
  const h = harness();
  const settings = { webhook: { webhookSecret: 'SYNTHETIC_OLD' } };
  const ui = h.ui(settings);
  h.SettingsUI.populateWebhookSecret.call(ui, settings.webhook);
  h.SettingsUI.generateWebhookSecret.call(ui);
  const generated = h.fields['#webhookSecret'].value;
  assert.match(generated, /^[0-9a-f]{64}$/);
  assert.equal(settings.webhook.webhookSecret, 'SYNTHETIC_OLD', 'the model changes only with Save');
  assert.equal(h.sent.length, 0, 'nothing is sent to the worker');
  assert.ok(h.notifications.some(text => /Save settings/.test(text)), 'the staged-change toast');
  assert.equal(h.fields['#webhookSecretCopyBtn'].disabled, false);
  return h.SettingsUI.copyWebhookSecret.call(ui).then(() => {
    assert.deepEqual(h.copied, [{ text: generated, options: undefined }], 'copied as is, with no element option (that would swap the field\'s value for "Copied")');
    h.fields['#webhookSecret'].value = '';
    h.SettingsUI.refreshWebhookSecretUI.call(ui);
    assert.equal(h.fields['#webhookSecretCopyBtn'].disabled, true);
    return h.SettingsUI.copyWebhookSecret.call(ui).then(() => assert.equal(h.copied.length, 1, 'an empty field copies nothing'));
  });
});

test('an invalid secret is flagged under the field, blocks Save with its message, and stops Test without a record', async () => {
  const h = harness({ webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/in' } });
  const ui = h.ui();
  h.fields['#webhookSecret'].value = 'clé';
  h.SettingsUI.refreshWebhookSecretUI.call(ui);
  assert.equal(h.fields['#webhookSecretError'].hidden, false);
  assert.equal(h.fields['#webhookSecret'].attributes['aria-invalid'], 'true');
  const checked = h.SettingsUI.validateSettings({ webhook: { webhookSecret: 'clé' } });
  assert.equal(checked.isValid, false);
  assert.ok(checked.errors.some(text => /512 ASCII/.test(text)));
  assert.ok(!checked.errors.join(' ').includes('clé'), 'the message never repeats the value');
  assert.equal(h.SettingsUI.validateSettings({ webhook: { webhookSecret: 'SYNTHETIC_FINE' } }).isValid, true);
  assert.equal(h.SettingsUI.validateSettings({ webhook: {} }).isValid, true, 'no secret field in the form: nothing to check');
  let fetched = 0;
  h.context.fetch = async () => { fetched++; return { ok: true, status: 200 }; };
  await h.SettingsUI.handleTestWebhook.call(ui);
  assert.equal(fetched, 0);
  assert.equal(h.sent.length, 0, 'no record line for a Test that did not run');
  assert.equal(h.fields['#testWebhookBtn'].disabled, false);
});

// ---- Validate JSON under the payload template
function payloadHarness() {
  const h = harness();
  const status = { hidden: true, className: '', textContent: '', offsetWidth: 0, flashed: 0, classList: { remove() {}, add(name) { if (name === 'is-checked') status.flashed++; } } };
  const textarea = Object.assign(h.fields['#webhookPayload'], {
    focused: false, selection: null, scrollTop: 0, clientHeight: 100, attributes: {},
    focus() { this.focused = true; }, setSelectionRange(from, to) { this.selection = [from, to]; },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; }
  });
  const button = { hidden: true };
  h.fields['#webhookPayloadStatus'] = status;
  h.fields['#webhookPayloadValidateBtn'] = button;
  return { ...h, status, textarea, button, view: h.ui() };
}

test('Validate JSON confirms a valid template: a toast, the status flashes, and the field is marked valid', () => {
  const h = payloadHarness();
  h.textarea.value = '{"url": "<SITEURL>", "count": <DETECTION_COUNT>}';
  assert.deepEqual(h.plain(h.SettingsUI.validateWebhookPayloadNow.call(h.view)), { ok: true });
  assert.equal(h.status.textContent, 'Valid JSON');
  assert.match(h.status.className, /is-valid/);
  assert.equal(h.status.flashed, 1);
  assert.equal(h.textarea.attributes['aria-invalid'], 'false');
  assert.deepEqual(h.notifications, ['Valid JSON']);
  assert.equal(h.textarea.selection, null, 'a valid template leaves the caret alone');
  assert.equal(h.button.hidden, false, 'the button is there for a JSON template');
});

test('Validate JSON on an empty template says the default payload is sent, and the status is neutral', () => {
  const h = payloadHarness();
  h.textarea.value = '  ';
  const result = h.plain(h.SettingsUI.validateWebhookPayloadNow.call(h.view));
  assert.equal(result.ok, true);
  assert.equal(result.empty, true);
  assert.equal(h.status.hidden, false);
  assert.match(h.status.className, /is-neutral/);
  assert.equal(h.status.textContent, 'Empty: the default payload is sent');
  assert.deepEqual(h.notifications, ['Empty: the default payload is sent']);
});

test('Validate JSON on an invalid template names the line, selects it and brings it into view', () => {
  const h = payloadHarness();
  h.textarea.value = '{\n  "a": 1,\n  "b": \n}\n';
  const result = h.plain(h.SettingsUI.validateWebhookPayloadNow.call(h.view));
  assert.equal(result.ok, false);
  assert.equal(result.line, 4, 'the closing brace after the empty value is where it breaks');
  const lines = h.textarea.value.split('\n');
  const start = lines.slice(0, result.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
  assert.deepEqual(h.textarea.selection, [start, start + lines[result.line - 1].length], 'the whole failing line is selected');
  assert.equal(h.textarea.focused, true);
  assert.equal(h.status.textContent, `Invalid JSON (line ${result.line})`);
  assert.match(h.status.className, /is-invalid/);
  assert.equal(h.textarea.attributes['aria-invalid'], 'true');
  assert.deepEqual(h.notifications, [`Invalid JSON (line ${result.line})`]);
});

test('the line to select stays inside the template, and the button is off for a body that is not JSON', () => {
  const h = payloadHarness();
  h.textarea.value = 'a\nb';
  h.SettingsUI.selectWebhookPayloadLine(h.textarea, 99);
  assert.deepEqual(h.textarea.selection, [2, 3], 'a line past the end selects the last line');
  h.SettingsUI.selectWebhookPayloadLine(h.textarea, 0);
  assert.deepEqual(h.textarea.selection, [0, 1], 'line 0 counts as the first');

  h.fields['#webhookContentType'] = { value: 'text/plain' };
  h.SettingsUI.refreshWebhookPayloadValidation.call(h.view);
  assert.equal(h.button.hidden, true);
  assert.equal(h.status.hidden, true);
});

test('the Settings page has the Validate JSON button beside Reset template, and the script wires it once', () => {
  const html = fs.readFileSync(path.join(__dirname, '../sections/settings/settings.html'), 'utf8');
  assert.match(html, /id="webhookPayloadValidateBtn"[^>]*data-i18n="webhookValidateJson"/);
  assert.ok(html.indexOf('id="webhookPayloadValidateBtn"') < html.indexOf('id="webhookPayloadResetBtn"'));
  const code = fs.readFileSync(path.join(__dirname, '../sections/settings/settings-ui-webhook.js'), 'utf8');
  assert.equal(code.split('#webhookPayloadValidateBtn').length - 1, 2, 'one lookup to show or hide it and one to wire it');
});

// ---- The variables in colour
function mirrorParts(mirror) {
  return mirror.children.map(node => (node.className ? ['variable', node.textContent] : ['text', node.text]));
}

test('the template is drawn again behind the field with the variables Scrapfly fills in colour, an unknown one left plain', () => {
  const h = payloadHarness();
  const mirror = h.context.document.createElement('pre');
  h.fields['#webhookPayloadMirror'] = mirror;
  h.textarea.value = '{"url": "<SITEURL>", "x": <UNKNOWN>, "n": <DETECTION_COUNT>}\n';
  h.SettingsUI.renderWebhookPayloadMirror();
  assert.deepEqual(mirrorParts(mirror), [
    ['text', '{"url": "'], ['variable', '<SITEURL>'], ['text', '", "x": <UNKNOWN>, "n": '], ['variable', '<DETECTION_COUNT>'],
    ['text', '}\n'], ['text', ' ']
  ], 'a last empty line gets a character, so the two boxes keep the same height');
  assert.ok(mirror.children.filter(node => node.className).every(node => node.className === 'template-var'));
});

test('every variable of the sender gets its colour, and markup in the template stays text', () => {
  const h = payloadHarness();
  const mirror = h.context.document.createElement('pre');
  h.fields['#webhookPayloadMirror'] = mirror;
  h.textarea.value = WebhookBody.VARIABLES.map(v => v.token).join(' ');
  h.SettingsUI.renderWebhookPayloadMirror();
  assert.deepEqual(mirror.children.filter(node => node.className).map(node => node.textContent), WebhookBody.VARIABLES.map(v => v.token));

  h.textarea.value = '<img src=x onerror=alert(1)> <script>x</script>';
  h.SettingsUI.renderWebhookPayloadMirror();
  assert.deepEqual(mirrorParts(mirror), [['text', '<img src=x onerror=alert(1)> <script>x</script>']], 'no element is made from the template');
});

test('the mirror follows the check and the scroll of the field, and an empty field leaves it empty', () => {
  const h = payloadHarness();
  const mirror = Object.assign(h.context.document.createElement('pre'), { scrollTop: 0 });
  h.fields['#webhookPayloadMirror'] = mirror;
  h.textarea.value = '{"t": "<TITLE>"}';
  h.textarea.scrollTop = 40;
  h.SettingsUI.refreshWebhookPayloadValidation.call(h.view);
  assert.deepEqual(mirrorParts(mirror), [['text', '{"t": "'], ['variable', '<TITLE>'], ['text', '"}']], 'typing, a variable chip and Reset all end in the check');
  assert.equal(mirror.scrollTop, 40);
  h.textarea.value = '';
  h.SettingsUI.renderWebhookPayloadMirror();
  assert.deepEqual(mirrorParts(mirror), []);
});

test('the Settings page puts the mirror behind the template field, hidden from screen readers', () => {
  const html = fs.readFileSync(path.join(__dirname, '../sections/settings/settings.html'), 'utf8');
  const editor = /<div class="template-editor">\s*<pre id="webhookPayloadMirror" class="template-editor-mirror" aria-hidden="true"><\/pre>\s*<textarea id="webhookPayload"/.exec(html);
  assert.ok(editor, 'the mirror comes first, so the textarea is drawn over it');
});

// ---- Retry failed deliveries ------------------------------------------------------------------------------------

const failed = (extra = {}) => ({ t: 5, page: 'shop.example', outcome: 'failed', status: 503, trigger: 'scan', ...extra });

test('a retry line says which retry it is, and a planned automatic retry says when', () => {
  const h = harness();
  const line = (entry, options) => h.SettingsUI.webhookLogLine(entry, options);
  assert.equal(line({ t: 0, page: 'a.example', outcome: 'sent', status: 200, trigger: 'retry', attempt: 2 }).text, 'Sent 200 · retry 1');
  assert.equal(line({ t: 0, page: 'a.example', outcome: 'failed', status: 503, trigger: 'retry', attempt: 4 }).text, 'Failed 503 · retry 3');
  const now = Date.UTC(2026, 9, 21, 12);
  assert.match(line(failed({ id: 'abc', retryAt: now + 60000 }), { held: true, now }).text, /^Failed 503 · retrying at /);
  assert.equal(line(failed({ id: 'abc', retryAt: now + 60000 }), { held: false, now }).text, 'Failed 503', 'no longer held: nothing is planned');
  assert.equal(line(failed({ id: 'abc', retryAt: now - 1 }), { held: true, now }).text, 'Failed 503', 'the time has passed');
});

test('Retry is on the newest failed line of each delivery the worker still holds, and nowhere else', () => {
  const h = harness();
  const list = h.fields['#webhookLogList'];
  const entries = [failed({ t: 1, id: 'aaa' }), failed({ t: 2, id: 'bbb' }), { t: 3, page: 'x.example', outcome: 'sent', status: 200, trigger: 'scan' },
    failed({ t: 4, id: 'aaa', trigger: 'retry', attempt: 2 }), failed({ t: 5, id: 'zzz' }), { t: 6, page: 'y.example', outcome: 'skipped', reason: 'site', trigger: 'scan' }];
  h.SettingsUI.renderWebhookLog(entries, { aaa: {}, bbb: {} });
  const rows = list.children.filter(node => node.className.startsWith('webhook-log-item'));
  const withButton = rows.filter(row => row.children.some(c => c.className.includes('webhook-log-retry')));
  // newest first: the retry line of aaa has the button, the older aaa line does not; bbb has one; zzz is not held
  assert.deepEqual(withButton.map(row => row.children.find(c => c.className === 'webhook-log-page').textContent + ':' + row.children.find(c => c.className.includes('webhook-log-retry')).dataset.id), ['shop.example:aaa', 'shop.example:bbb']);
  assert.ok(withButton.every(row => row.className.includes('has-retry')));
  const button = withButton[0].children.find(c => c.className.includes('webhook-log-retry'));
  assert.equal(button.textContent, 'Retry');
  assert.equal(button.tag, 'button');
  assert.equal(button.type, 'button');
});

test('when the worker lets a delivery go, its button goes with it, without the entries being read again', () => {
  const h = harness();
  const list = h.fields['#webhookLogList'];
  h.SettingsUI.renderWebhookLog([failed({ id: 'aaa' })], { aaa: {} });
  const buttons = () => list.children.flatMap(row => row.children || []).filter(c => (c.className || '').includes('webhook-log-retry')).length;
  assert.equal(buttons(), 1);
  h.SettingsUI.renderWebhookHeld({});
  assert.equal(buttons(), 0);
  assert.equal(list.children.length, 1, 'the line stays');
});

test('the held deliveries are read from storage.session when the browser has it, and followed', async () => {
  const h = harness({ stored: { scrapfly_webhook_log: [failed({ id: 'aaa' })] } });
  h.context.chrome.storage.session = { async get(key) { return { [key]: { aaa: { id: 'aaa' } } }; } };
  await h.SettingsUI.refreshWebhookLog();
  const list = h.fields['#webhookLogList'];
  const buttons = () => list.children.flatMap(row => row.children || []).filter(c => (c.className || '').includes('webhook-log-retry')).length;
  assert.equal(buttons(), 1);
  h.listeners[0]({ session_webhook_held: { newValue: {} } }, 'session');
  assert.equal(buttons(), 0);
});

test('the Retry button asks the worker once, and says what came of it', async () => {
  for (const [outcome, text] of [['sent', 'Delivered'], ['failed', 'Failed again. It stays in the list, so you can retry it.'], ['gone', 'This delivery can no longer be retried.'], ['off', 'Turn the webhook on, with an address, to retry.']]) {
    const h = harness({ runtimeReply: () => ({ status: 'ok', outcome }) });
    const button = Object.assign(new Element('button'), { dataset: { id: 'aaa' }, isConnected: true });
    button.textContent = 'Retry';
    await h.SettingsUI.retryWebhookDelivery(button);
    assert.deepEqual(h.plain(h.sent), [{ type: 'WEBHOOK_RETRY', id: 'aaa' }]);
    assert.deepEqual(h.notifications, [text], outcome);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Retry');
  }
  const refused = harness({ runtimeReply: () => ({ status: 'error' }) });
  const b = Object.assign(new Element('button'), { dataset: { id: 'x' }, isConnected: true });
  await refused.SettingsUI.retryWebhookDelivery(b);
  assert.deepEqual(refused.notifications, ['This delivery can no longer be retried.']);
});

test('one click listener on the list, however often Settings is populated', () => {
  const h = harness();
  const list = h.fields['#webhookLogList'];
  h.SettingsUI._setupWebhookLogListeners.call(h.ui());
  h.SettingsUI._setupWebhookLogListeners.call(h.ui());
  assert.equal(list.handlers.filter(x => x.type === 'click').length, 1);
});
