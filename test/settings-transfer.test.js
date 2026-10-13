const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function uiHarness() {
  const notifications = [];
  const context = vm.createContext({
    SettingsUI: {},
    self: {},
    Logger: { error() {}, debug() {}, warn() {} },
    NotificationHelper: { success: text => notifications.push(['success', text]), error: text => notifications.push(['error', text]) },
    document: { querySelector() { return null; } },
    chrome: { runtime: { sendMessage: async () => ({}) } }
  });
  for (const file of ['modules/settings/settings-transfer.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-data.js', 'sections/settings/settings-ui-updates.js']) vm.runInContext(read(file), context);
  const ui = context.self.SettingsUI;
  // const SettingsUI is lexical, but self exposes the same registry.
  ui.LANGUAGE_OPTIONS = [{ value: 'en' }, { value: 'es' }];
  const form = {
    settings: { debugMode: false, webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN' }, share: { githubToken: 'SYNTHETIC_TOKEN', provider: 'github_gist' } },
    settingsBaseline: { debugMode: false },
    deepMerge: (...args) => ui.deepMerge(...args),
    validateSettings: () => ({ isValid: true, errors: [] }),
    updateSettingsUI() { this.renders = (this.renders || 0) + 1; },
    hideSettings() { this.hidden = true; },
    saveSettings(...args) { return ui.saveSettings.apply(this, args); }
  };
  return { context, ui, form, notifications };
}

test('portable settings exclude all connection data, while diagnostics exclude user domains and arbitrary settings', () => {
  const { context } = uiHarness();
  const source = {
    debugMode: true,
    unknownCredential: 'SYNTHETIC_TOKEN',
    webhook: { webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookHeaders: [{ name: 'Authorization', value: 'SYNTHETIC_TOKEN' }], webhookPayload: 'SYNTHETIC_TOKEN' },
    share: { provider: 'custom', customUrl: 'https://upload.example/SYNTHETIC_TOKEN', customJsonTemplate: 'SYNTHETIC_TOKEN', customHeaders: 'SYNTHETIC_TOKEN', githubToken: 'SYNTHETIC_TOKEN', pastebinKey: 'SYNTHETIC_TOKEN', customExpiryDays: 7 },
    detection: { blacklistedDomains: ['private.example'], cacheDuration: 3 }
  };
  const portable = plain(context.SettingsTransfer.portable(source));
  assert.ok(!JSON.stringify(portable).includes('SYNTHETIC_TOKEN'));
  assert.equal(portable.webhook, undefined);
  assert.deepEqual(portable.share, { provider: 'custom', customExpiryDays: 7 });
  assert.equal(portable.detection.cacheDuration, 3);
  const diagnostic = JSON.stringify(context.SettingsTransfer.diagnostics(source));
  assert.ok(!diagnostic.includes('SYNTHETIC_TOKEN'));
  assert.ok(!diagnostic.includes('private.example'));
  assert.equal(source.share.githubToken, 'SYNTHETIC_TOKEN');
});

test('a failed Save keeps the modal, draft and baseline and shows one error', async () => {
  const { context, ui, form, notifications } = uiHarness();
  context.StorageManager = { commitSettings: async () => { throw new Error('Write rejected'); } };
  form.getSettingsFromUI = () => ({ debugMode: true });
  await ui.handleSaveSettings.call(form);
  assert.equal(form.hidden, undefined);
  assert.equal(form.settings.debugMode, true);
  assert.equal(form.settingsBaseline.debugMode, false);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'error');
});

test('failed import save leaves model and language untouched with a single error', async () => {
  const { context, ui, form, notifications } = uiHarness();
  context.StorageManager = { commitSettings: async () => { throw new Error('Write rejected'); } };
  let languages = 0;
  ui._applyLanguageChoice = async () => { languages++; };
  const before = plain(form.settings);
  const input = { value: 'file', files: [{ text: async () => JSON.stringify({ settings: { debugMode: true }, languageOverride: 'es' }) }] };
  await ui.importSettingsFile.call(form, { target: input });
  assert.deepEqual(plain(form.settings), before);
  assert.equal(form.renders, undefined);
  assert.equal(languages, 0);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'error');
  assert.equal(input.value, '');
});

test('successful import preserves local connections and only applies language after commit', async () => {
  const { context, ui, form, notifications } = uiHarness();
  let saved;
  context.StorageManager = { commitSettings: async mutation => { saved = plain(mutation); return { settings: mutation.candidate, previous: form.settings }; } };
  ui._applyLanguageChoice = async (language, options) => { assert.ok(saved); assert.equal(language, 'es'); assert.equal(options.persist, false); };
  await ui.importSettingsFile.call(form, { target: { files: [{ text: async () => JSON.stringify({ settings: {
    debugMode: true, webhook: { webhookUrl: 'https://untrusted.example/replacement' }, share: { githubToken: 'untrusted', provider: 'dpaste_com' }
  }, languageOverride: 'es' }) }] } });
  assert.equal(saved.languageOverride, 'es');
  assert.equal(form.settings.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_TOKEN');
  assert.equal(form.settings.share.githubToken, 'SYNTHETIC_TOKEN');
  assert.equal(form.settings.share.provider, 'dpaste_com');
  assert.equal(form.settings.debugMode, true);
  assert.deepEqual(notifications.map(n => n[0]), ['success']);
});

test('Cancel discards staged exclusions, update preferences and header changes', () => {
  const { ui, form } = uiHarness();
  form.settingsBaseline = { updates: { autoUpdate: false }, detection: { blacklistedDomains: [] }, webhook: { webhookHeaders: [] } };
  form.settings = { updates: { autoUpdate: true }, detection: { blacklistedDomains: ['staged.example'] }, webhook: { webhookHeaders: [{ name: 'X-Test', value: 'draft' }] } };
  ui.hideSettings.call(form);
  assert.deepEqual(plain(form.settings), plain(form.settingsBaseline));
  form.settings.detection.blacklistedDomains.push('another.example');
  assert.deepEqual(form.settingsBaseline.detection.blacklistedDomains, []);
});

test('failed settings read keeps the model, baseline and language picker unchanged', async () => {
  const { context, ui, form, notifications } = uiHarness();
  const before = plain(form.settings);
  context.StorageManager = { readSettingsStrict: async () => { throw new Error('Read rejected'); } };
  ui.setLanguagePickerValue = () => assert.fail('language must be unchanged');
  assert.equal(await ui.loadSettings.call(form), false);
  assert.deepEqual(plain(form.settings), before);
  assert.equal(form.renders, undefined);
  assert.equal(notifications.length, 1);
});


test('draft edits do not mutate defaults reused after Cancel or reopening settings', () => {
  const { ui } = uiHarness();
  const defaults = { detection: { blacklistedDomains: [] }, webhook: { webhookHeaders: [] } };
  const draft = ui.deepMerge(defaults, {});
  draft.detection.blacklistedDomains.push('draft.example');
  draft.webhook.webhookHeaders.push({ name: 'X-Test', value: 'draft' });
  assert.deepEqual(defaults.detection.blacklistedDomains, []);
  assert.deepEqual(defaults.webhook.webhookHeaders, []);
});
