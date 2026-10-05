const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// bridge-protocol.js attaches ScrapflyBridgeProtocol to globalThis on load.
require('../modules/core/bridge-protocol.js');
const P = globalThis.ScrapflyBridgeProtocol;

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const v of values) {
    assert.strictEqual(typeof v, 'string', `${label}: ${v} should be a string`);
    assert.ok(v.length > 0, `${label}: empty value`);
    assert.ok(!seen.has(v), `${label}: duplicate value ${v}`);
    seen.add(v);
  }
}

test('protocol is exposed as a global', () => {
  assert.ok(P, 'ScrapflyBridgeProtocol should be defined');
});

test('protocol survives the structured copy the MAIN world receives', () => {
  // content.js hands it over in a CustomEvent detail; the MAIN world keeps a JSON copy
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P)), P);
});

test('protocol is deeply frozen', () => {
  assert.ok(isDeepFrozen(P));
  assert.throws(() => { 'use strict'; P.EVENTS.INSTALL_HOOKS = 'x'; });
});

test('values are unique within each table', () => {
  assertUnique(Object.values(P.EVENTS), 'EVENTS');
  assertUnique(Object.values(P.FIELDS), 'FIELDS');
  assertUnique(Object.values(P.MESSAGE_TYPES), 'MESSAGE_TYPES');
  assertUnique(Object.values(P.COMPLETION_REASONS.HOOKS), 'COMPLETION_REASONS.HOOKS');
  assertUnique(Object.values(P.COMPLETION_REASONS.WINDOW), 'COMPLETION_REASONS.WINDOW');
  assertUnique(Object.values(P.CONTROL_REASONS), 'CONTROL_REASONS');
  assertUnique(Object.values(P.HOOK_FAILURE_TYPES), 'HOOK_FAILURE_TYPES');
  assertUnique(Object.values(P.HOOK_FAILURE_REASONS), 'HOOK_FAILURE_REASONS');
  assertUnique(Object.values(P.GLOBALS), 'GLOBALS');
});

test('direction allowlists are disjoint subsets of MESSAGE_TYPES', () => {
  const all = new Set(Object.values(P.MESSAGE_TYPES));
  assertUnique(P.TO_MAIN_TYPES, 'TO_MAIN_TYPES');
  assertUnique(P.TO_ISOLATED_TYPES, 'TO_ISOLATED_TYPES');
  for (const t of [...P.TO_MAIN_TYPES, ...P.TO_ISOLATED_TYPES]) assert.ok(all.has(t), `${t} not in MESSAGE_TYPES`);
  for (const t of P.TO_MAIN_TYPES) assert.ok(!P.TO_ISOLATED_TYPES.includes(t), `${t} allowed in both directions`);
});

// The wire values existing pages and stored settings already depend on. The
// protocol table is the only definition; these pins keep a refactor from
// silently renaming something the other end still expects.
test('wire values are unchanged from 2.8', () => {
  assert.deepStrictEqual({ ...P.EVENTS }, {
    BRIDGE_INIT: 'scrapfly-bridge-init',
    ISOLATED_TO_MAIN: 'scrapfly-isolated-bridge-message',
    MAIN_TO_ISOLATED: 'scrapfly-main-bridge-message',
    INSTALL_HOOKS: 'scrapfly-install-hooks',
    JS_API_PREFIX: 'scrapfly:'
  });
  assert.strictEqual(P.FIELDS.TOKEN, '__scrapflyBridgeToken');
  assert.deepStrictEqual([...P.TO_MAIN_TYPES].sort(), [
    'DISABLE_MONITORING', 'SCRAPFLY_CACHE_HIT', 'SCRAPFLY_JS_API_EVENT', 'SCRAPFLY_PAGE_READY', 'STOP_WINDOW_POLLING'
  ]);
  assert.deepStrictEqual([...P.TO_ISOLATED_TYPES].sort(), [
    'HOOK_FAILURE_REPORT', 'JS_HOOKS_COMPLETE', 'JS_HOOK_DETECTION', 'SCRAPFLY_DEBUG_LOG',
    'WINDOW_DETECTIONS', 'WINDOW_PROPS_COMPLETE'
  ]);
  assert.deepStrictEqual({ ...P.COMPLETION_REASONS.HOOKS }, {
    ACTIVITY_TIMEOUT: 'activity_timeout', MAX_TIMEOUT: 'max_timeout', NO_HOOKS: 'no_hooks', CACHE_HIT: 'cache_hit'
  });
  assert.deepStrictEqual({ ...P.GLOBALS }, {
    HOOK_SUPPRESSION_DEPTH: '__scrapflyHookSuppressionDepth',
    CACHE_HIT_EARLY_EXIT: '__scrapflyCacheHitEarlyExit',
    LAST_DETECTION: '__scrapflyLastDetection'
  });
});

test('loading twice keeps the first definition', () => {
  const before = globalThis.ScrapflyBridgeProtocol;
  delete require.cache[require.resolve('../modules/core/bridge-protocol.js')];
  require('../modules/core/bridge-protocol.js');
  assert.strictEqual(globalThis.ScrapflyBridgeProtocol, before);
});

// the values content-main-world.js, window-property-tracker.js and
// hook-resilience-manager.js spelled themselves before they moved here.
test('MAIN-world identity, log labels and report values are unchanged', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.BRIDGE_TOKEN)), { MIN_LENGTH: 16, MAX_LENGTH: 128, PATTERN: '^[A-Za-z0-9_-]+$' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.LOG)), {
    LEVELS: { LOG: 'log', WARN: 'warn', ERROR: 'error' },
    SOURCES: { MAIN_WORLD: 'content-main-world', WINDOW_TRACKER: 'window-property-tracker' },
    PREFIXES: { MAIN_WORLD: '[MAIN_WORLD] [Hooks]', WINDOW_TRACKER: '[WindowPropertyTracker]' }
  });
  assert.deepStrictEqual({ ...P.REPORTED_VALUE }, { NULL_TYPE: 'null', OBJECT: '[object]' });
  assert.deepStrictEqual({ ...P.HOOK_FAILURE_MESSAGES }, {
    VERIFICATION_FAILED: 'Hook installed but verification failed', EXCEPTION_PREFIX: 'ERROR: '
  });
  assert.deepStrictEqual({ ...P.MAIN_WORLD }, {
    HOOKS_SCRIPT: 'content-main-world.js', PATH_SEPARATOR: '.', JS_API_CONSOLE_LABEL: '[Scrapfly JS API] ',
    BIND_SHIM_MARKER: '__scrapflyBindShim', ILLEGAL_INVOCATION_FALLBACK: 'Illegal invocation'
  });
});

test('HOOKS_SCRIPT is the MAIN-world script that installs the hooks', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const main = manifest.content_scripts.find(cs => cs.world === 'MAIN').js;
  assert.strictEqual(main[main.length - 1], P.MAIN_WORLD.HOOKS_SCRIPT);
});

test('tokens minted by content.js satisfy BRIDGE_TOKEN', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  const body = src.match(/function createScrapflyBridgeToken\(\) \{([\s\S]*?)\n\}/);
  assert.ok(body, 'createScrapflyBridgeToken not found');
  const mint = new Function(body[1]);
  const pattern = new RegExp(P.BRIDGE_TOKEN.PATTERN);
  for (let i = 0; i < 50; i++) {
    const token = mint();
    assert.ok(token.length >= P.BRIDGE_TOKEN.MIN_LENGTH && token.length <= P.BRIDGE_TOKEN.MAX_LENGTH, token);
    assert.ok(pattern.test(token), token);
  }
});
