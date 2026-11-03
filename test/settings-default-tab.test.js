const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The tab the popup opens on. A settings file or a backup can carry any "defaultTab": a name that is not a tab used to hide every
// tab and show an empty popup until one was clicked (the setting has no control of its own: only Reset removed it).

const source = fs.readFileSync(path.join(__dirname, '..', 'modules/settings/settings-runtime.js'), 'utf8');

async function opensOn(settings) {
  const context = vm.createContext({
    console, self: {}, Promise,
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: { getSettings: async () => { if (settings instanceof Error) throw settings; return settings; } }
  });
  vm.runInContext(source, context, { filename: 'settings-runtime.js' });
  const opened = [];
  await vm.runInContext('SettingsRuntime', context).loadAndApplyDefaultTab((tab) => opened.push(tab));
  return opened;
}

test('each real tab is a valid default', async () => {
  for (const tab of ['detection', 'history', 'rules', 'advanced']) assert.deepEqual(await opensOn({ defaultTab: tab }), [tab]);
});

test('a name that is not a tab, a missing one and unreadable settings all open the Detection tab', async () => {
  for (const settings of [{ defaultTab: 'stats' }, { defaultTab: 'settings' }, { defaultTab: '' }, { defaultTab: 7 }, { defaultTab: null }, {}, new Error('unreadable')]) {
    assert.deepEqual(await opensOn(settings), ['detection'], JSON.stringify(settings instanceof Error ? 'error' : settings));
  }
});
