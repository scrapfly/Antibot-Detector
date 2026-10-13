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
      Logger: { error() {}, debug() {} },
      ScrapflyBridgeProtocol: { MESSAGE_TYPES: { SETTINGS_MUTATE: 'SETTINGS_MUTATE' } }
    });
    vm.runInContext(read('modules/core/storage-manager.js'), c);
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
