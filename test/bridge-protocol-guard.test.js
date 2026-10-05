const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Guard: every bridge-protocol value is spelled once, in
// modules/core/bridge-protocol.js. Any other extension script that writes one
// of them as a string literal (or reads a shared global by its literal name)
// has forked the protocol and will drift from the other end.

require('../modules/core/bridge-protocol.js');
const P = globalThis.ScrapflyBridgeProtocol;
const root = path.join(__dirname, '..');

const PROTOCOL_FILE = 'modules/core/bridge-protocol.js';

// Same string, different meaning, or the one unavoidable rendezvous. Keep this
// list short and justified.
const ALLOWED = {
  // History entry source label for a cache-hit save, not a bridge reason
  'modules/detection/engine/detection-engine-manager.js': ['cache_hit'],
  // The MAIN world cannot load bridge-protocol.js (page-shared global object, and
  // Chrome injects a file once per frame across content_scripts entries), so it
  // adopts the protocol from the bootstrap event; that event's name is the one
  // string both worlds must know in advance. Pinned below.
  'content-main-world.js': [P.EVENTS.BRIDGE_INIT]
};

const MAIN_WORLD_FILES = ['modules/detection/hooks/window-condition-language.js',
  'modules/detection/hooks/hook-resilience-manager.js',
  'modules/detection/hooks/window-property-tracker.js', 'content-main-world.js'];

// Protocol values that are ordinary words or punctuation everywhere else
// ('error', '.', 'null'): spelling them in another script is not a fork of the
// bridge. In the MAIN world they are still forbidden as literals, by
// test/main-world-literals.test.js.
const GENERIC_VALUES = ['LOG.LEVELS', 'MAIN_WORLD.PATH_SEPARATOR', 'REPORTED_VALUE.NULL_TYPE', 'BRIDGE_TOKEN'];

function leafStrings(value, out = [], at = '') {
  if (GENERIC_VALUES.includes(at)) return out;
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leafStrings(v, out, at ? `${at}.${k}` : k);
  }
  return out;
}

function extensionScripts() {
  const out = [];
  const skip = new Set(['node_modules', 'test', 'scripts', '.git', 'detectors', '_locales', 'assets', 'icons']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
      if (entry.name.endsWith('.js')) out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.filter(f => f !== PROTOCOL_FILE);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the guard scans the files on both ends of the bridge', () => {
  const files = extensionScripts();
  for (const f of ['content-main-world.js', 'content.js', 'popup.js',
    'modules/detection/hooks/window-property-tracker.js', 'modules/detection/hooks/hook-resilience-manager.js',
    'modules/detection/engine/detection-engine-hooks.js', 'modules/detection/engine/detection-engine-manager.js',
    'sections/settings/settings-runtime.js', 'background/handlers/messages-detection.js',
    'background/handlers/messages-logging.js']) {
    assert.ok(files.includes(f), `${f} not scanned`);
  }
});

test('no protocol literal is spelled outside bridge-protocol.js', () => {
  const values = [...new Set(leafStrings(P))];
  const offenders = [];
  for (const file of extensionScripts()) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const allowed = new Set(ALLOWED[file] || []);
    for (const v of values) {
      if (allowed.has(v)) continue;
      // Quoted literal: 'v', "v" or `v` (a template starting with the prefix counts too)
      const quoted = new RegExp(`(['"\`])${escape(v)}(\\1|\\$\\{)`);
      // Dotted read/write of a shared global by name: window.__x, globalThis.__x
      const dotted = v.startsWith('__') ? new RegExp(`\\.${escape(v)}\\b`) : null;
      if (quoted.test(src) || (dotted && dotted.test(src))) offenders.push(`${file}: ${v}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('the MAIN world bootstraps from EVENTS.BRIDGE_INIT and never loads the protocol file', () => {
  const src = fs.readFileSync(path.join(root, 'content-main-world.js'), 'utf8');
  const m = src.match(/const BOOTSTRAP_EVENT = '([^']+)';/);
  assert.ok(m, 'BOOTSTRAP_EVENT not found in content-main-world.js');
  assert.strictEqual(m[1], P.EVENTS.BRIDGE_INIT);
  assert.strictEqual(src.split(`'${P.EVENTS.BRIDGE_INIT}'`).length - 1, 1, 'the rendezvous name is spelled once');

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const main = manifest.content_scripts.find(cs => cs.world === 'MAIN').js;
  assert.deepStrictEqual(main, MAIN_WORLD_FILES, 'MAIN world script list changed');
  assert.ok(!main.includes(PROTOCOL_FILE), 'the protocol must not become a page-visible global');
  const isolated = manifest.content_scripts.find(cs => cs.world !== 'MAIN').js;
  assert.strictEqual(isolated[0], PROTOCOL_FILE, 'protocol must load first in the ISOLATED world');
  // MAIN scripts run before the ISOLATED ones, so their bootstrap listener exists in time
  assert.strictEqual(manifest.content_scripts.findIndex(cs => cs.world === 'MAIN'), 0);

  for (const f of MAIN_WORLD_FILES) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!code.includes('ScrapflyBridgeProtocol'), `${f} must not read the ISOLATED-world global`);
  }
});

test('content.js hands the engine-built bootstrap detail to the MAIN world', () => {
  const src = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.match(src, /new CustomEvent\(SCRAPFLY_BRIDGE_INIT_EVENT, \{\s*detail: demMainWorldBootstrapDetail\(scrapflyBridgeToken\)/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const isolated = manifest.content_scripts.find(cs => cs.world !== 'MAIN').js;
  assert.ok(isolated.indexOf('modules/detection/engine/detection-engine-hooks.js') < isolated.indexOf('content.js'));
});
