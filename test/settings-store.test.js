const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(settings = {}) {
  const state = { stored: { scrapfly_settings: JSON.stringify({ settings }) }, writes: 0, failRead: false, failWrite: false };
  const storage = {
    async get() {
      await new Promise(resolve => setImmediate(resolve));
      if (state.failRead) throw new Error('Read rejected');
      return clone(state.stored);
    },
    async set(values) {
      await new Promise(resolve => setImmediate(resolve));
      if (state.failWrite) throw new Error('Write rejected');
      state.writes++;
      Object.assign(state.stored, clone(values));
    }
  };
  const registry = {};
  const context = () => {
    const c = vm.createContext({
      chrome: { storage: { local: storage }, runtime: { sendMessage: message => new Promise(resolve => registry[message.type]({ request: clone(message), sendResponse: result => resolve(clone(result)) })) } },
      Logger: { error() {}, debug() {} }, MessageSender: require('../modules/core/message-sender.js'),
      ScrapflyBridgeProtocol: { MESSAGE_TYPES: { SETTINGS_MUTATE: 'SETTINGS_MUTATE' } }
    });
    for (const file of ['modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/core/storage-manager.js']) vm.runInContext(read(file), c);
    return c;
  };
  const worker = context();
  vm.runInContext(read('modules/settings/settings-store.js'), worker);
  worker.SettingsStore.registerHandlers(registry);
  return { state, worker, client: () => context().StorageManager, settings: () => JSON.parse(state.stored.scrapfly_settings).settings };
}

test('independent popup clients and worker updates cannot overwrite one another', async () => {
  const h = harness({ detection: { blacklistedDomains: ['existing.example'] }, updates: { lastCheckTimestamp: 1 } });
  const a = h.client(), b = h.client();
  const base = await a.readSettingsStrict();
  const candidate = clone(base);
  candidate.debugMode = true;
  candidate.detection.blacklistedDomains = ['form.example'];
  const results = await Promise.all([
    a.setDomainExcluded('other.example', true),
    b.patchSettings({ updates: { lastCheckTimestamp: 42 } }),
    h.worker.StorageManager.commitSettings({ baseline: base, candidate })
  ]);
  assert.equal(results[0], true);
  assert.equal(results[1], true);
  assert.deepEqual(h.settings().detection.blacklistedDomains, ['other.example', 'form.example']);
  assert.equal(h.settings().updates.lastCheckTimestamp, 42);
  assert.equal(h.settings().debugMode, true);
});

test('compatibility mutators merge concurrent domain additions rather than dropping either', async () => {
  const h = harness({ detection: { blacklistedDomains: [] } });
  assert.deepEqual(await Promise.all([
    h.client().updateSettings(s => s.detection.blacklistedDomains.push('a.example')),
    h.client().updateSettings(s => s.detection.blacklistedDomains.push('b.example'))
  ]), [true, true]);
  assert.deepEqual(h.settings().detection.blacklistedDomains, ['a.example', 'b.example']);
});

test('failed read or malformed storage never writes an empty replacement', async () => {
  const h = harness({ debugMode: true });
  const client = h.client();
  h.state.failRead = true;
  assert.equal(await client.patchSettings({ debugVerbose: true }), false);
  h.state.failRead = false;
  h.state.stored.scrapfly_settings = '{broken';
  assert.equal(await client.updateSettings(s => { s.debugMode = false; }), false);
  assert.equal(h.state.writes, 0);
});

test('failed writes leave settings and import language intact and the queue recovers', async () => {
  const h = harness({ debugMode: false });
  h.state.stored.scrapfly_language_override = 'en';
  const client = h.client();
  h.state.failWrite = true;
  await assert.rejects(client.commitSettings({ baseline: { debugMode: false }, candidate: { debugMode: true }, languageOverride: 'es' }));
  assert.equal(h.settings().debugMode, false);
  assert.equal(h.state.stored.scrapfly_language_override, 'en');
  h.state.failWrite = false;
  await client.commitSettings({ baseline: { debugMode: false }, candidate: { debugMode: true }, languageOverride: 'es' });
  assert.equal(h.settings().debugMode, true);
  assert.equal(h.state.stored.scrapfly_language_override, 'es');
});

test('queued mutations retain their original payload and reject invalid operations', async () => {
  const h = harness();
  const patch = { debugMode: true };
  const pending = h.worker.StorageManager.patchSettings(patch);
  patch.debugMode = false;
  assert.equal(await pending, true);
  assert.equal(h.settings().debugMode, true);
  await assert.rejects(h.client().mutateSettings({ operation: 'erase' }));
});

test('a reset returns every setting to the defaults it is given, keeps the paths it is asked to keep, and drops the rest', async () => {
  const h = harness({
    debugMode: true, notificationsEnabled: false, someOldSetting: 7,
    detection: { cacheDuration: 3, cacheUnit: 'hours', blacklistedDomains: ['keep.example'], hooksConfig: { MAX_DETECTION_MS: 9 } },
    history: { historyEnabled: false, historyExcludedDomains: ['bank.example'], historyLimit: 40 },
    webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC', webhookHeaders: [{ name: 'X', value: 'SYNTHETIC' }] },
    updates: { autoUpdate: true, lastCheckTimestamp: 123 }
  });
  const defaults = {
    debugMode: false, notificationsEnabled: true,
    detection: { cacheDuration: 7, cacheUnit: 'days', blacklistedDomains: [], hooksConfig: {} },
    history: { historyEnabled: true, historyExcludedDomains: [], historyLimit: 0 },
    webhook: { enableWebhook: false, webhookUrl: '', webhookHeaders: [] },
    updates: { autoUpdate: false, lastCheckTimestamp: 0 }
  };
  const keep = ['detection.blacklistedDomains', 'history.historyExcludedDomains', 'updates.lastCheckTimestamp', 'webhook.webhookUrl', 'webhook.webhookHeaders'];
  const result = await h.client().resetSettings(defaults, keep);
  assert.equal(result.success, true);
  assert.deepEqual(h.settings(), {
    debugMode: false, notificationsEnabled: true,
    detection: { cacheDuration: 7, cacheUnit: 'days', blacklistedDomains: ['keep.example'], hooksConfig: {} },
    history: { historyEnabled: true, historyExcludedDomains: ['bank.example'], historyLimit: 0 },
    webhook: { enableWebhook: false, webhookUrl: 'https://hooks.example/SYNTHETIC', webhookHeaders: [{ name: 'X', value: 'SYNTHETIC' }] },
    updates: { autoUpdate: false, lastCheckTimestamp: 123 }
  });
  assert.equal(result.previous.someOldSetting, 7, 'the caller can still see what was there');
  // Keeping nothing disconnects everything
  await h.client().resetSettings(defaults, []);
  assert.deepEqual(h.settings(), defaults);
});

test('a reset with a malformed request writes nothing', async () => {
  const h = harness({ debugMode: true });
  const client = h.client();
  for (const [defaults, keep] of [[null, []], [{}, 'x'], [{}, [5]], [[], []], [{}, ['']]]) {
    assert.equal(await client.resetSettings(defaults, keep).then(() => true, () => false), false, JSON.stringify([defaults, keep]));
  }
  assert.equal(h.state.writes, 0);
  assert.equal(h.settings().debugMode, true);
  // A path that tries to reach the prototype is ignored
  await client.resetSettings({ a: 1 }, ['__proto__.polluted', 'constructor.prototype.x']);
  assert.equal({}.polluted, undefined);
});

test('sites of the "only scan these sites" list are added and removed in the worker, trimmed and lower-cased, merging with each other', async () => {
  const h = harness({ detection: { scanMode: 'allowlist', allowedDomains: ['a.example'] } });
  const results = await Promise.all([
    h.client().setDomainAllowed(' B.Example ', true),
    h.client().setDomainAllowed('c.example', true),
    h.client().setDomainAllowed('a.example', false),
    h.client().setDomainAllowed('c.example', true)
  ]);
  assert.deepEqual(results, [true, true, true, true]);
  assert.deepEqual(h.settings().detection.allowedDomains, ['b.example', 'c.example']);
  assert.equal(h.settings().detection.scanMode, 'allowlist', 'the mode is not touched');
  const writes = h.state.writes;
  for (const [domain, allowed] of [['', true], ['  ', false], [5, true], ['x.example', 'yes']]) assert.equal(await h.client().setDomainAllowed(domain, allowed), false, JSON.stringify([domain, allowed]));
  assert.equal(h.state.writes, writes, 'an invalid change writes nothing');
});
