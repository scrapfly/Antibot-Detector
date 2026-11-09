'use strict';
// isExtensionEnabled caches the extension's switch for a few seconds. A read that was already in flight when the switch
// changed must not overwrite the value the change event cached (the old value would be served for the whole cache time).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'background', 'runtime-state.js'), 'utf8');
const start = source.indexOf('let cachedEnabledState');
const end = source.indexOf('// ─── JS Hooks Config Cache');

test('a storage read that started before the switch changed does not replace the new value', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const context = vm.createContext({
    Constants: { ENABLED_CACHE_TTL: 5000 }, Date,
    chrome: { storage: { local: { get: async () => { await gate; return { scrapfly_enabled: true }; } } } }
  });
  vm.runInContext(source.slice(start, end), context);
  const pending = vm.runInContext('isExtensionEnabled()', context);
  vm.runInContext('cachedEnabledState = { value: false, timestamp: Date.now() }', context); // the change event: the person turns the extension off meanwhile
  release();
  assert.equal(await pending, false);
  assert.equal(await vm.runInContext('isExtensionEnabled()', context), false, 'and the cache says off, not the old on');
});
