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
    WorkerMessages: require('../modules/core/worker-messages.js'),
    SettingsUI: {},
    self: {},
    Logger: { error() {}, debug() {}, warn() {} },
    NotificationHelper: { success: text => notifications.push(['success', text]), error: text => notifications.push(['error', text]) },
    document: { querySelector() { return null; } },
    chrome: { runtime: { sendMessage: async () => ({}) } }
  });
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/settings/settings-transfer.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-data.js', 'sections/settings/settings-ui-updates.js']) vm.runInContext(read(file), context);
  const ui = context.self.SettingsUI;
  // const SettingsUI is lexical, but self exposes the same registry.
  ui.LANGUAGE_OPTIONS = [{ value: 'en' }, { value: 'es' }];
  const form = {
    settings: { debugMode: false, webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookSecret: 'SYNTHETIC_TOKEN' }, share: { githubToken: 'SYNTHETIC_TOKEN', provider: 'github_gist' } },
    // Saved as loaded: the import starts from what is saved, never from a draft
    settingsBaseline: { debugMode: false, webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookSecret: 'SYNTHETIC_TOKEN' }, share: { githubToken: 'SYNTHETIC_TOKEN', provider: 'github_gist' } },
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
    webhook: { webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookHeaders: [{ name: 'Authorization', value: 'SYNTHETIC_TOKEN' }], webhookPayload: 'SYNTHETIC_TOKEN', webhookSecret: 'SYNTHETIC_TOKEN' },
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
    debugMode: true, webhook: { webhookUrl: 'https://untrusted.example/replacement', webhookSecret: 'untrusted' }, share: { githubToken: 'untrusted', provider: 'dpaste_com' }
  }, languageOverride: 'es' }) }] } });
  assert.equal(saved.languageOverride, 'es');
  assert.equal(form.settings.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_TOKEN');
  assert.equal(form.settings.webhook.webhookSecret, 'SYNTHETIC_TOKEN', 'an imported file never replaces the signing secret');
  assert.equal(form.settings.share.githubToken, 'SYNTHETIC_TOKEN');
  assert.equal(form.settings.share.provider, 'dpaste_com');
  assert.equal(form.settings.debugMode, true);
  assert.deepEqual(notifications.map(n => n[0]), ['success']);
});

test('a file that lowers the History size below what History uses asks first; declined, the size that applies stays and the rest still lands', async () => {
  for (const [answer, usedMB, expected, questions] of [[false, 8, 25, 1], [true, 8, 6, 1], [false, 1, 6, 0]]) {
    const { context, ui, form } = uiHarness();
    let saved;
    context.StorageManager = { commitSettings: async mutation => { saved = plain(mutation); return { settings: mutation.candidate, previous: form.settings }; } };
    context.HistoryStore = { SIZES_MB: [6, 12, 25], hasUnlimitedStorage: () => true, budgetFor: (mb) => mb * 1024 * 1024, usage: async () => ({ bytes: usedMB * 1024 * 1024 }) };
    context.FormatUtils = { t: (key, fallback) => fallback };
    context.chrome.storage = { local: {} };
    const asked = [];
    context.NotificationHelper.confirm = async (options) => { asked.push(options.title); return answer; };
    form.settings.history = { historyMaxMB: 25, historyLimit: 0 };
    await ui.importSettingsFile.call(form, { target: { files: [{ text: async () => JSON.stringify({ settings: { debugMode: true, history: { historyMaxMB: 6 } } }) }] } });
    assert.equal(asked.length, questions, `${usedMB} MB used, answer ${answer}`);
    assert.equal(saved.candidate.history.historyMaxMB, expected);
    assert.equal(saved.candidate.debugMode, true, 'the rest of the file lands either way');
  }
});

test('a file that lowers the entry limit below the pages History holds asks too; declined, the limit that applies stays', async () => {
  for (const [answer, fileLimit, unpinned, expected, questions] of [[false, 500, 1100, 0, 1], [true, 500, 1100, 500, 1], [false, 1500, 1100, 1500, 0], [false, 500, 300, 500, 0]]) {
    const { context, ui, form } = uiHarness();
    let saved;
    context.StorageManager = { commitSettings: async mutation => { saved = plain(mutation); return { settings: mutation.candidate, previous: form.settings }; } };
    context.HistoryStore = { SIZES_MB: [6, 12, 25], hasUnlimitedStorage: () => true, budgetFor: (mb) => mb * 1024 * 1024, usage: async () => ({ bytes: 1024, entries: unpinned + 100, pinned: 100 }) };
    context.FormatUtils = { t: (key, fallback) => fallback };
    context.chrome.storage = { local: {} };
    const asked = [];
    context.NotificationHelper.confirm = async (options) => { asked.push(options.title); return answer; };
    form.settings.history = { historyMaxMB: 6, historyLimit: 0 };
    await ui.importSettingsFile.call(form, { target: { files: [{ text: async () => JSON.stringify({ settings: { history: { historyLimit: fileLimit } } }) }] } });
    assert.equal(asked.length, questions, `limit ${fileLimit}, ${unpinned} unpinned, answer ${answer}`);
    if (questions) assert.equal(asked[0], 'Lower the History limit');
    assert.equal(saved.candidate.history.historyLimit, expected);
  }
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

test('an import starts from the saved settings: a change staged in the form but never saved is not written with it', async () => {
  const { context, ui, form } = uiHarness();
  let saved;
  context.StorageManager = { commitSettings: async mutation => { saved = plain(mutation); return { settings: mutation.candidate, previous: form.settings }; } };
  form.settings = { ...plain(form.settings), detection: { scanMode: 'allowlist', allowedDomains: [] } }; // staged, not saved
  await ui.importSettingsFile.call(form, { target: { files: [{ text: async () => JSON.stringify({ settings: { debugMode: true } }) }] } });
  assert.equal(saved.candidate.debugMode, true);
  assert.equal(saved.candidate.detection, undefined, 'the staged "only these sites" with an empty list is not saved');
});
