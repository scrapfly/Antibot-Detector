const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// hooks-config.js attaches to globalThis on load.
require('../modules/core/hooks-config.js');
const HooksConfig = globalThis.HooksConfig;

// The values and bounds 2.7 hardcoded in content-main-world.js. Moving them
// into the schema must not change behaviour, so they are pinned here.
const V27 = {
  ACTIVITY_TIMEOUT_MS:   { default: 2000,  min: 250,  max: 20000 },
  MAX_DETECTION_MS:      { default: 8000,  min: 1000, max: 60000 },
  INSTALL_DEBOUNCE_MS:   { default: 250,   min: 0,    max: 2000 }
};

test('defaults and bounds are identical to the 2.7 hardcoded values', () => {
  for (const [key, spec] of Object.entries(V27)) {
    assert.deepStrictEqual({ ...HooksConfig.SCHEMA[key] }, spec, key);
    assert.strictEqual(HooksConfig.defaults[key], spec.default, key);
  }
});

test('the 2.7 min-monitor formula is unchanged: min(max, max(4000, 2 x activity))', () => {
  // Computed once here and sent as installDetail.minMonitorMs; the MAIN world has no copy
  const cmw = fs.readFileSync(path.join(__dirname, '..', 'content-main-world.js'), 'utf8');
  assert.ok(!/MIN_MONITOR_MS|ACTIVITY_TIMEOUT_MS \* 2/.test(cmw), 'min-monitor formula duplicated in the MAIN world');
  const dem = fs.readFileSync(path.join(__dirname, '..', 'modules/detection/engine/detection-engine-manager.js'), 'utf8');
  assert.match(dem, /minMonitorMs = HooksConfig\.minMonitorMs\(withConfig\.hooksConfig\)/);
  const d = HooksConfig.defaults;
  assert.strictEqual(HooksConfig.SCHEMA.MIN_MONITOR_MS.default, 4000);
  assert.strictEqual(HooksConfig.minMonitorMs(d), 4000);
  assert.strictEqual(HooksConfig.minMonitorMs(HooksConfig.resolve({ ACTIVITY_TIMEOUT_MS: 3000 })), 6000);
  assert.strictEqual(HooksConfig.minMonitorMs(HooksConfig.resolve({ ACTIVITY_TIMEOUT_MS: 20000, MAX_DETECTION_MS: 9000 })), 9000);
});

// POLL_INTERVAL_MS, DEFAULT_MAX_WINDOW_MS and SETTLED_CHECKS only drove the MAIN
// world legacy window polling, which never ran (the tracker always loads first).
const DEAD_KEYS = ['EMERGENCY_TIMEOUT_MS', 'HEARTBEAT_TIMEOUT_MS', 'MAX_DETECTIONS_PER_TAB',
  'POLL_INTERVAL_MS', 'DEFAULT_MAX_WINDOW_MS', 'SETTLED_CHECKS'];

test('dead keys are gone and ignored when still stored', () => {
  const resolved = HooksConfig.resolve(Object.fromEntries(DEAD_KEYS.map(k => [k, 1])));
  for (const key of DEAD_KEYS) {
    assert.strictEqual(key in HooksConfig.SCHEMA, false, key);
    assert.strictEqual(key in resolved, false, key);
  }
});

test('overrides are clamped to bounds and garbage falls back to the default', () => {
  const r = HooksConfig.resolve({
    ACTIVITY_TIMEOUT_MS: 5,          // below min
    MAX_DETECTION_MS: '15000',       // numeric string
    WINDOW_PHASE_EARLY_INTERVAL_MS: 1e9, // above max
    LOG_MAX_PER_WINDOW: 'lots',      // not a number
    INSTALL_DEBOUNCE_MS: NaN,
    WINDOW_PHASE_FINAL_MS: true      // booleans are not numbers
  });
  assert.strictEqual(r.ACTIVITY_TIMEOUT_MS, 250);
  assert.strictEqual(r.MAX_DETECTION_MS, 15000);
  assert.strictEqual(r.WINDOW_PHASE_EARLY_INTERVAL_MS, 5000);
  assert.strictEqual(r.LOG_MAX_PER_WINDOW, 20);
  assert.strictEqual(r.INSTALL_DEBOUNCE_MS, 250);
  assert.strictEqual(r.WINDOW_PHASE_FINAL_MS, 30000);
  for (const bad of [undefined, null, 42, 'x', []]) {
    assert.deepStrictEqual(HooksConfig.resolve(bad), HooksConfig.defaults);
  }
});

test('resolved config is complete and frozen', () => {
  const r = HooksConfig.resolve({ MAX_DETECTION_MS: 9000 });
  assert.deepStrictEqual(Object.keys(r).sort(), [...HooksConfig.KEYS].sort());
  assert.strictEqual(Object.isFrozen(r), true);
});

test('fromSettings keeps the 2.7 precedence: legacy top-level hooksConfig wins', () => {
  assert.strictEqual(HooksConfig.fromSettings({ detection: { hooksConfig: { MAX_DETECTION_MS: 9000 } } }).MAX_DETECTION_MS, 9000);
  assert.strictEqual(HooksConfig.fromSettings({
    hooksConfig: { MAX_DETECTION_MS: 7000 },
    detection: { hooksConfig: { MAX_DETECTION_MS: 9000 } }
  }).MAX_DETECTION_MS, 7000);
  assert.deepStrictEqual(HooksConfig.fromSettings(undefined), HooksConfig.defaults);
});

// Every config key the consumers read must exist in the schema, and every
// schema key must have a reader (a typo would read undefined and silently
// become 0 ms / NaN in the MAIN world, which only shape-checks the config).
const CONFIG_READERS = ['modules/core/hooks-config.js', 'content-main-world.js', 'modules/detection/hooks/window-property-tracker.js',
  'content.js', 'background.js', 'modules/detection/engine/detection-engine-manager.js'];

test('config keys read by the consumers are exactly the schema keys', () => {
  const read = new Set();
  for (const file of CONFIG_READERS) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const m of src.matchAll(/\b(?:activeHooksConfig|cachedHooksConfig|config|hooksConfig)\.([A-Z][A-Z0-9_]+)\b/g)) read.add(m[1]);
  }
  const unknown = [...read].filter(k => !HooksConfig.KEYS.includes(k));
  assert.deepStrictEqual(unknown, [], 'keys read but not in the schema');
  const unread = HooksConfig.KEYS.filter(k => !read.has(k));
  assert.deepStrictEqual(unread, [], 'schema keys nobody reads');
});

// The values 2.8 hardcoded in window-property-tracker.js and content-main-world.js
// before they moved into the schema. Behaviour must not change.
const V28 = {
  LOG_RATE_WINDOW_MS: 1000, LOG_MAX_PER_WINDOW: 20, LOG_MAX_PER_WINDOW_WITH_COLLECTOR: 5, LOG_MAX_MESSAGE_LENGTH: 1000,
  // were named constants in content-main-world.js / window-property-tracker.js
  LOG_OBJECT_PREVIEW_KEYS: 6, REPORTED_VALUE_MAX_CHARS: 100,
  WINDOW_PHASE_EARLY_MS: 2000, WINDOW_PHASE_EARLY_INTERVAL_MS: 100,
  WINDOW_PHASE_NORMAL_MS: 8000, WINDOW_PHASE_NORMAL_INTERVAL_MS: 200,
  WINDOW_PHASE_LATE_MS: 20000, WINDOW_PHASE_LATE_INTERVAL_MS: 500,
  WINDOW_PHASE_FINAL_MS: 30000, WINDOW_PHASE_FINAL_INTERVAL_MS: 1000,
  WINDOW_RETRY_PATH_MAX: 100, WINDOW_RETRY_PATH_BASE_MS: 100, WINDOW_RETRY_PATH_MAX_DELAY_MS: 1000,
  WINDOW_RETRY_GETTER_MAX: 10, WINDOW_RETRY_GETTER_BASE_MS: 50, WINDOW_RETRY_GETTER_MULTIPLIER: 1.5,
  WINDOW_RETRY_GETTER_MAX_DELAY_MS: 2000,
  // propertyAbsent had no explicit cap; the tracker fell back to base x 10
  WINDOW_RETRY_ABSENT_MAX: 50, WINDOW_RETRY_ABSENT_BASE_MS: 200, WINDOW_RETRY_ABSENT_MAX_DELAY_MS: 2000,
  WINDOW_RETRY_STEP_MS: 50
};

test('tracker and log-throttle defaults are identical to the 2.8 hardcoded values', () => {
  for (const [key, value] of Object.entries(V28)) {
    assert.strictEqual(HooksConfig.defaults[key], value, key);
    const { min, max } = HooksConfig.SCHEMA[key];
    assert.ok(min <= value && value <= max, `${key} default outside its bounds`);
  }
  const d = HooksConfig.defaults;
  // The four phases still add up to the 60 s window-polling session
  assert.strictEqual(d.WINDOW_PHASE_EARLY_MS + d.WINDOW_PHASE_NORMAL_MS + d.WINDOW_PHASE_LATE_MS + d.WINDOW_PHASE_FINAL_MS,
    60000);
});

test('the MAIN world accepts the resolved config and rejects garbage', () => {
  // Mirror of isValidHooksConfig in content-main-world.js (shape check only)
  const src = fs.readFileSync(path.join(__dirname, '..', 'content-main-world.js'), 'utf8');
  const body = src.match(/function isValidHooksConfig\(config\) \{([\s\S]*?)\n  \}/);
  assert.ok(body, 'isValidHooksConfig not found');
  const isValid = new Function('config', body[1]);
  assert.strictEqual(isValid(HooksConfig.defaults), true);
  assert.strictEqual(isValid(HooksConfig.resolve({ WINDOW_RETRY_GETTER_MULTIPLIER: 2.5 })), true);
  for (const bad of [null, undefined, {}, [], 'x', { A: -1 }, { A: NaN }, { A: '1' }, { A: Infinity }]) {
    assert.strictEqual(isValid(bad), false, JSON.stringify(bad));
  }
});

test('window-property-tracker.js holds no timing values of its own', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'detection', 'hooks', 'window-property-tracker.js'), 'utf8');
  for (const gone of ['DEFAULT_POLLING_PHASES', 'DEFAULT_RETRY_CONFIG', 'retryCount * 50', 'baseDelay * 10']) {
    assert.strictEqual(src.includes(gone), false, `${gone} should not be in window-property-tracker.js`);
  }
});

test('content-main-world.js holds no hooks tuning values of its own', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'content-main-world.js'), 'utf8');
  for (const gone of ['DEFAULT_HOOKS_CONFIG', 'buildHooksConfig', 'EXPECTED_UNAVAILABLE_APIS', 'Math.max(4000',
    'HOOKS_CONFIG_KEYS', 'LOG_MAX_PER_WINDOW =', 'LOG_RATE_WINDOW_MS =']) {
    assert.strictEqual(src.includes(gone), false, `${gone} should not be in content-main-world.js`);
  }
});

test('optional hooks are declared by detectors, not by the engine', () => {
  const usb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'detectors', 'fingerprint', 'detect-usb-fingerprint.json'), 'utf8'));
  for (const hook of usb.detection.js_hooks) {
    assert.strictEqual(hook.optional, true, `${hook.target} should be optional`);
  }
});
