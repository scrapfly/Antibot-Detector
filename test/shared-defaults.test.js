const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A default that several scripts write down drifts: the cache duration was 12 hours in Settings' own fallbacks and
// 7 days everywhere else, a rule without a confidence was 80 for detection and 100 in the rule editor, and a duplicate
// scan request was ignored for 1.5 s on one path and 2 s on the other. Each default is written once and read from there.

global.self = global;
const FormatUtils = require('../utils/format-utils.js');
require('../modules/core/constants.js');
const Constants = globalThis.Constants;
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;

test('the cache duration starts from 7 days in the default settings, the Settings page, the engine and the normalizer', () => {
  assert.deepStrictEqual({ ...FormatUtils.DEFAULT_CACHE }, { duration: 7, unit: 'days' });
  assert.strictEqual(defaults.detection.cacheDuration, FormatUtils.DEFAULT_CACHE.duration);
  assert.strictEqual(defaults.detection.cacheUnit, FormatUtils.DEFAULT_CACHE.unit);
  const html = read('sections/settings/settings.html');
  assert.strictEqual(Number(html.match(/<input[^>]*id="cacheDuration"[^>]*\bvalue="(\d+)"/)[1]), FormatUtils.DEFAULT_CACHE.duration);
  // The engine's own fallback, in hours
  const [, perUnit, hours] = read('modules/detection/engine/detection-engine-manager.js').match(/DEFAULT_EXPIRY_HOURS = (\d+) \* (\d+)/);
  assert.strictEqual(Number(perUnit) * Number(hours), FormatUtils.convertToMilliseconds(FormatUtils.DEFAULT_CACHE.duration, FormatUtils.DEFAULT_CACHE.unit) / 3600000);
  // A missing or unusable duration is the default everywhere
  for (const bad of [undefined, null, 0, -3, 'x']) assert.deepStrictEqual({ ...FormatUtils.normalizeCacheDuration(bad, 'hours') }, { ...FormatUtils.DEFAULT_CACHE, exact: false }, String(bad));
  assert.ok(!/\?\? 12\b|\|\| 12\b/.test(read('sections/settings/settings-ui.js')), 'Settings has no 12 hour fallback of its own');
});

test('a rule that declares no confidence is 80 (85 for a DOM pattern) for detection and for the rule editor', () => {
  assert.strictEqual(Constants.DEFAULT_MATCH_CONFIDENCE, 80);
  assert.strictEqual(Constants.DEFAULT_DOM_CONFIDENCE, 85);
  assert.ok(!/confidence \|\| (?!0\b)\d+/.test(read('modules/detection/engine/detection-engine-manager.js')), 'the engine reads the constants');
  assert.ok(!/confidence \|\| (?!0\b)\d+/.test(read('sections/rules/rules-editor.js')), 'the rule editor reads the constants');
  // 0 is kept as 0: only a missing confidence takes the default
  assert.ok(/Number\.isFinite\(method\.confidence\) \? method\.confidence : \(methodType === 'dom' \? Constants\.DEFAULT_DOM_CONFIDENCE : Constants\.DEFAULT_MATCH_CONFIDENCE\)/.test(read('sections/rules/rules-editor.js')));
});

test('the two windows in which a repeated scan is skipped are named constants, and the request one stays shorter', () => {
  // A second navigation in the same tab 1.5 s after the first must still be scanned (the methods e2e does exactly that)
  assert.strictEqual(Constants.REQUEST_SKIP_THRESHOLD, 1500);
  assert.strictEqual(Constants.DETECTION_SKIP_THRESHOLD, 2000);
  assert.ok(Constants.REQUEST_SKIP_THRESHOLD < Constants.DETECTION_SKIP_THRESHOLD);
  const calls = read('modules/detection/engine/detection-engine-manager.js').match(/shouldSkipDetection\([^)]*\)/g);
  assert.ok(calls.length >= 2, 'the engine skips repeated scans on its paths');
  for (const call of calls) assert.ok(/Constants\.(?:REQUEST|DETECTION)_SKIP_THRESHOLD/.test(call), `${call} has no literal window`);
});

test('a detector without rules has an empty detection object: the Rules tab carries no template with the old plural method names', () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  for (const file of walk('sections/rules').filter(name => name.endsWith('.js'))) {
    assert.ok(!/\b(?:urls|headers|cookies):\s*\[\]/.test(read(file)), `${file} writes an empty list under a method name no detector uses`);
  }
  // The names real detectors use are the schema's
  const schema = require('../modules/detection/rules/detector-schema.js');
  const used = new Set();
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(name => name.endsWith('.json'))) {
      for (const method of Object.keys(JSON.parse(read(`detectors/${category}/${file}`)).detection || {})) used.add(method);
    }
  }
  for (const method of used) assert.ok(schema.METHODS.includes(method), method);
});
