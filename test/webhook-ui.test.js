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
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.disabled = false; this._text = ''; }
  append(...nodes) { this.children.push(...nodes); }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; if (value === '') this.children = []; }
}

function harness({ webhook = {}, stored = {}, translations = {}, fetchImpl } = {}) {
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
    FormatUtils: { t: (key, fallback) => translations[key] || fallback, formatDateTime: (time) => `at ${new Date(time).toISOString()}`, categoryIconSvg: key => `<svg data-icon="${key}"></svg>`,
      copyToClipboard: async (text, options) => { copied.push({ text, options }); return true; } },
    NotificationHelper: { success: text => notifications.push(text), error: text => notifications.push(text), info: text => notifications.push(text) },
    document: {
      querySelector: selector => fields[selector] || null,
      querySelectorAll: selector => (selector === '[data-webhook-category]' ? boxes : []),
      createElement: tag => new Element(tag)
    },
    chrome: {
      runtime: { sendMessage(message, callback) { sent.push(message); if (callback) callback({ status: 'ok' }); }, lastError: undefined },
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
