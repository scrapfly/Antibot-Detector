const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Settings → Data → Storage lists where the extension's space goes. Every key the extension writes belongs to
// exactly one part, so a new key cannot make the overview add up to less than the real storage.

const StorageOverview = require('../modules/settings/storage-overview.js');
const root = path.join(__dirname, '..');

function extensionScripts() {
  const out = [];
  const skip = new Set(['node_modules', 'test', 'scripts', '.git', '.claude', 'detectors', '_locales', 'assets', 'icons', 'store']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
      if (entry.name.endsWith('.js')) out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.filter(file => file !== 'modules/settings/storage-overview.js');
}

test('every storage key the extension writes belongs to exactly one part of the overview', () => {
  const listed = StorageOverview.GROUPS.flatMap(group => group.keys);
  assert.strictEqual(new Set(listed).size, listed.length, 'no key is in two parts');
  const used = new Set();
  for (const file of extensionScripts()) {
    for (const [, key] of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/['"](scrapfly_[a-z0-9_]+)['"]/g)) {
      // A file name (scrapfly_categories.json) is the legacy copy of a key, not a key
      used.add(key);
    }
  }
  assert.ok(used.size >= 25, 'the guard finds the keys');
  assert.deepStrictEqual([...used].filter(key => !listed.includes(key)).sort(), [], 'a key is missing from StorageOverview.GROUPS');
  assert.deepStrictEqual(listed.filter(key => !used.has(key)).sort(), [], 'a listed key is no longer used by the extension');
});

test('only the caches and the user data that can be rebuilt or confirmed have a Clear button, never settings or rules', () => {
  const clears = Object.fromEntries(StorageOverview.GROUPS.map(group => [group.id, group.clear]));
  assert.deepStrictEqual(clears, { cache: 'cache', captures: 'captures', history: 'history', rules: null, updates: 'updates', settings: null, logs: 'logs' });
  const english = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  for (const group of StorageOverview.GROUPS) {
    assert.ok(english[group.labelKey], `${group.labelKey} is an English message`);
    assert.strictEqual(english[group.labelKey].message, group.label);
  }
});

test('summarize() keeps the parts in order and puts the rest of the storage under other', () => {
  const sizes = { cache: 1000, captures: 0, history: 5000, rules: 2000, updates: 0, settings: 300, logs: 40 };
  const summary = StorageOverview.summarize(sizes, 9000);
  assert.deepStrictEqual(summary.rows.map(row => [row.id, row.bytes]), [['cache', 1000], ['captures', 0], ['history', 5000], ['rules', 2000], ['updates', 0], ['settings', 300], ['logs', 40]]);
  assert.deepStrictEqual(summary.rows.map(row => row.empty), [false, true, false, false, true, false, true], 'an empty container is empty');
  assert.strictEqual(summary.other, 660);
  assert.strictEqual(summary.total, 9000);
  assert.strictEqual(summary.quota, 10485760);
  assert.ok(Math.abs(summary.ratio - 9000 / 10485760) < 1e-12);
});

test('summarize() is safe with missing, negative and inconsistent numbers', () => {
  const empty = StorageOverview.summarize(undefined, undefined);
  assert.deepStrictEqual([empty.total, empty.other, empty.ratio], [0, 0, 0]);
  assert.ok(empty.rows.every(row => row.bytes === 0));
  const odd = StorageOverview.summarize({ cache: -5, history: 'x', rules: 1500.4 }, 100);
  assert.deepStrictEqual(odd.rows.map(row => row.bytes), [0, 0, 0, 1500, 0, 0, 0]);
  assert.strictEqual(odd.total, 1500, 'the total is never below what the parts add up to');
  assert.strictEqual(odd.other, 0);
  assert.strictEqual(StorageOverview.summarize({}, 20000000).ratio, 1, 'the ratio stops at full');
  assert.strictEqual(StorageOverview.summarize({}, 10, 0).quota, 10485760, 'no quota means the default one');
});

test('with unlimited storage there is no quota to fill: the total is shown alone and the meter stays empty', () => {
  const sizes = { settings: 1000, history: 30 * 1024 * 1024 };
  const limited = StorageOverview.summarize(sizes, 31 * 1024 * 1024);
  assert.strictEqual(limited.unlimited, false);
  assert.strictEqual(limited.ratio, 1, 'over the quota: full');
  const unlimited = StorageOverview.summarize(sizes, 31 * 1024 * 1024, StorageOverview.QUOTA_BYTES, true);
  assert.strictEqual(unlimited.unlimited, true);
  assert.strictEqual(unlimited.ratio, 0);
  assert.strictEqual(unlimited.total, 31 * 1024 * 1024);
  assert.strictEqual(unlimited.rows.find(row => row.id === 'history').bytes, 30 * 1024 * 1024, 'the parts are the same');
});
