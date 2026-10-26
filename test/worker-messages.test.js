const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The extension's own message types are written once, in modules/core/worker-messages.js, and used by name:
// a handler as registry[WorkerMessages.X], a sender as { type: WorkerMessages.X }. A literal that spells one of them
// is a second copy that drifts (three of the 3.0.2 features started that way), so this test fails on one.

const ROOT = path.join(__dirname, '..');
const WorkerMessages = require('../modules/core/worker-messages.js');

const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'scripts', '_locales', 'detectors', 'assets', 'store', '.claude', 'icons']);
const SKIP_FILES = new Set(['modules/core/worker-messages.js', 'modules/core/bridge-protocol.js', 'modules/core/message-types.js', 'content-main-world.js']);
const MAIN_WORLD = ['modules/detection/hooks/', 'modules/detection/conditions/'];

function* sources(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* sources(full); continue; }
    if (!entry.name.endsWith('.js') || SKIP_FILES.has(rel) || MAIN_WORLD.some(prefix => rel.startsWith(prefix))) continue;
    yield rel;
  }
}

test('every message type is its own name, frozen, and unique across the registries', () => {
  for (const [key, value] of Object.entries(WorkerMessages)) assert.equal(value, key);
  assert.ok(Object.isFrozen(WorkerMessages));
  assert.ok(Object.keys(WorkerMessages).length >= 30);
  // The page bridge and the Advanced tools keep their own registries: no name may live in two
  const bridge = fs.readFileSync(path.join(ROOT, 'modules/core/bridge-protocol.js'), 'utf8');
  const advanced = fs.readFileSync(path.join(ROOT, 'modules/core/message-types.js'), 'utf8');
  for (const name of Object.keys(WorkerMessages)) {
    assert.ok(!new RegExp(`'${name}'`).test(bridge), `${name} is also in bridge-protocol.js`);
    assert.ok(!new RegExp(`'${name}'`).test(advanced), `${name} is also in message-types.js`);
  }
});

test('no extension script spells a worker message type as a string literal, in any quoting or position', () => {
  const names = new Set(Object.keys(WorkerMessages));
  const offenders = [];
  // Any quoted string that is exactly a registry name: a handler key, a sent type, a comparison, a switch case, a
  // template argument; both quote styles. Comments and docs are not scanned (only .js sources are), so a mention in
  // prose is fine, and a name inside a longer string is not one of these messages.
  const literal = /(['"])([A-Z][A-Z_]+)\1/g;
  for (const rel of sources()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const match of text.matchAll(literal)) {
      // a log category or context that happens to share a name (Logger's category 'LOG') is not a message
      if (/(?:category|context): $/.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
      if (names.has(match[2])) offenders.push(`${rel}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'use WorkerMessages.X instead');
});

test('every script that uses WorkerMessages runs in a context that loads it first', () => {
  const registry = 'modules/core/worker-messages.js';
  const users = [...sources()].filter(rel => /\bWorkerMessages\./.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  assert.ok(users.length >= 20, `users found: ${users.length}`);
  const worker = [...fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8').matchAll(/'([^']+\.js)'/g)].map(m => m[1].replace(/^\.\//, ''));
  const popup = [...fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const content = manifest.content_scripts.filter(cs => (cs.world || 'ISOLATED') === 'ISOLATED').flatMap(cs => cs.js);
  for (const [name, list] of [['worker', worker], ['popup', popup], ['content script', content]]) {
    const at = list.indexOf(registry);
    assert.ok(at >= 0, `${name} loads ${registry}`);
    for (const user of users) {
      const index = list.indexOf(user);
      if (index >= 0) assert.ok(index > at, `${name}: ${registry} loads before ${user}`);
    }
  }
  // The stats page loads the logger (a user), so it loads the registry first too
  for (const page of ['sections/stats/stats.html', 'sections/bulk/bulk.html']) {
    const dir = path.posix.dirname(page);
    const scripts = [...fs.readFileSync(path.join(ROOT, page), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => path.posix.join(dir, m[1]));
    const at = scripts.indexOf(registry);
    assert.ok(at >= 0, `${page} loads the registry`);
    for (const user of users) {
      const index = scripts.indexOf(user);
      if (index >= 0) assert.ok(index > at, `${page}: ${registry} loads before ${user}`);
    }
  }
});
