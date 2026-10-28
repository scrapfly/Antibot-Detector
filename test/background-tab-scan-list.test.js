const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The scan tabs a worker opened are listed in storage.session, so a worker that stopped mid-scan has them closed by the
// next one. A watch check and a Bulk scan open their tabs at the same time: both must stay listed.

function load() {
  const session = {};
  const area = {
    // Each call yields first, as the real storage does: two unqueued writers would read the same old list
    async get(key) { await new Promise(resolve => setTimeout(resolve, 0)); return key in session ? { [key]: [...session[key]] } : {}; },
    async set(values) { await new Promise(resolve => setTimeout(resolve, 0)); Object.assign(session, JSON.parse(JSON.stringify(values))); },
    async remove(key) { delete session[key]; }
  };
  const context = vm.createContext({ console, Promise, Set, Map, Array, JSON, setTimeout, clearTimeout,
    Logger: new Proxy({}, { get: () => () => {} }), chrome: { storage: { session: area } } });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background/background-tab-scan.js'), 'utf8') + '\n;this.T = BackgroundTabScan;', context);
  return { T: context.T, session };
}

test('two scan tabs registered at the same moment are both kept, and both removed when closed', async () => {
  const { T, session } = load();
  await Promise.all([T.rememberTab(11, true), T.rememberTab(22, true)]);
  assert.deepEqual([...session[T.OPEN_TABS_KEY]].sort(), [11, 22]);
  await Promise.all([T.rememberTab(11, false), T.rememberTab(33, true), T.rememberTab(22, false)]);
  assert.deepEqual([...session[T.OPEN_TABS_KEY]], [33]);
});
