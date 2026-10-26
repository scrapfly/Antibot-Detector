const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Cloudflare sets cf_clearance with the Partitioned attribute (seen on
// discord.com): chrome.cookies.getAll({ url }) alone never returns it.
const own = { topLevelSite: 'https://discord.com', hasCrossSiteAncestor: false };
const jar = [
  { name: '_cfuvid', value: 'a' },
  { name: 'cf_clearance', value: 'b', partitionKey: own },
  { name: 'embed_only', value: 'c', partitionKey: { topLevelSite: 'https://other.example', hasCrossSiteAncestor: false } }
];

function load(cookies) {
  const calls = [];
  const context = { chrome: { cookies: {
    async getAll(details) {
      calls.push(['getAll', details]);
      const matches = cookie => !details.name || cookie.name === details.name;
      if (!details.partitionKey) return jar.filter(cookie => !cookie.partitionKey && matches(cookie));
      return jar.filter(cookie => cookie.partitionKey && cookie.partitionKey.topLevelSite === details.partitionKey.topLevelSite && matches(cookie));
    },
    async remove(details) { calls.push(['remove', details]); return details; },
    ...cookies
  } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'utils/page-cookies.js'), 'utf8'), context);
  return { PageCookies: context.PageCookies, calls };
}

const names = list => Array.from(list, cookie => cookie.name);

test('a tab\'s cookies include those partitioned under the page, not under other sites', async () => {
  const { PageCookies } = load({ async getPartitionKey({ tabId, frameId }) { assert.deepEqual([tabId, frameId], [7, 0]); return { partitionKey: own }; } });
  assert.deepEqual(names(await PageCookies.getAll({ url: 'https://discord.com/' }, 7)), ['_cfuvid', 'cf_clearance']);
  assert.deepEqual(names(await PageCookies.getAll({ url: 'https://discord.com/', name: 'cf_clearance' }, 7)), ['cf_clearance']);
});

test('without a tab or before Chrome 132 it reads unpartitioned cookies only, as before', async () => {
  const withApi = load({ async getPartitionKey() { return { partitionKey: own }; } });
  assert.deepEqual(names(await withApi.PageCookies.getAll({ url: 'https://discord.com/' })), ['_cfuvid']);
  const older = load({});
  assert.deepEqual(names(await older.PageCookies.getAll({ url: 'https://discord.com/' }, 7)), ['_cfuvid']);
  const failing = load({ async getPartitionKey() { throw new Error('No tab with id: 7'); } });
  assert.deepEqual(names(await failing.PageCookies.getAll({ url: 'https://discord.com/' }, 7)), ['_cfuvid']);
});

test('a private-window tab\'s cookies come from its own cookie store', async () => {
  // Without storeId chrome.cookies reads the worker's regular store: the page was scanned with the wrong cookies
  const stores = [{ id: '0', tabIds: [3] }, { id: '1', tabIds: [7, 8] }];
  const { PageCookies, calls } = load({ async getAllCookieStores() { return stores; }, async getPartitionKey() { return { partitionKey: own }; } });
  assert.equal(await PageCookies.storeIdOf(7), '1');
  assert.equal(await PageCookies.storeIdOf(3), '0');
  assert.equal(await PageCookies.storeIdOf(99), null);
  await PageCookies.getAll({ url: 'https://discord.com/' }, 7);
  const queries = calls.filter(([kind]) => kind === 'getAll').map(([, details]) => details.storeId);
  assert.deepEqual(queries, ['1', '1'], 'both the plain and the partitioned read');
  // No tab, or a tab no store lists: the query is unchanged
  calls.length = 0;
  await PageCookies.getAll({ url: 'https://discord.com/' });
  assert.equal(calls[0][1].storeId, undefined);
  const failing = load({ async getAllCookieStores() { throw new Error('boom'); } });
  assert.deepEqual(names(await failing.PageCookies.getAll({ url: 'https://discord.com/' }, 7)), ['_cfuvid']);
  // A cookie is deleted from the store it came from
  await PageCookies.remove('https://discord.com/', { name: 'x', storeId: '1' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1)[1])), { url: 'https://discord.com/', name: 'x', storeId: '1' });
});

test('a partitioned cookie is deleted from its own partition', async () => {
  const { PageCookies, calls } = load({});
  await PageCookies.remove('https://discord.com/', jar[1]);
  await PageCookies.remove('https://discord.com/', jar[0]);
  const removed = calls.filter(([kind]) => kind === 'remove').map(([, details]) => JSON.parse(JSON.stringify(details)));
  assert.deepEqual(removed, [
    { url: 'https://discord.com/', name: 'cf_clearance', partitionKey: own },
    { url: 'https://discord.com/', name: '_cfuvid' }
  ]);
});
