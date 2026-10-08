const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const directory = path.join(root, 'detectors/fingerprint');
const fingerprint = Object.fromEntries(fs.readdirSync(directory)
  .filter(file => file.endsWith('.json'))
  .map(file => {
    const detector = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    return [detector.id, detector];
  }));

// Exercise the production installation, matching, and background scoring pipeline.
const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000,
    PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: { warn() {}, debug() {}, detection() {}, cache() {}, debugMode: false,
    error(...args) { throw new Error(args.join(' ')); } },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
});
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/window-condition-grammar.js',
  'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
    .map(name => `modules/detection/engine/detection-engine-${name}.js`)
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const Engine = vm.runInContext('DetectionEngineManager', context);
const Combinations = context.DetectionCombinations;
context.detectorManager = { findDetectorById: id => fingerprint[id] };
vm.runInContext(fs.readFileSync(path.join(root, 'background/detection-lifecycle.js'), 'utf8'), context);

function engine() {
  const instance = new Engine();
  instance.setDetectors({ fingerprint });
  return instance;
}
async function installation() {
  const events = [];
  await Engine.installHooksOrchestrator({ dispatchEvent(event) { events.push(event); } }, {
    storage: { local: { async get() { return { scrapfly_detectors: { detectors: { fingerprint } } }; } } }
  });
  assert.equal(events.length, 1);
  assert.ok(events[0].detail.hookDefinitions.length > 0);
  return events[0].detail;
}
function patterns(detector) {
  return Object.entries(detector.detection).flatMap(([method, rules]) =>
    rules.map(rule => ({ method, ...rule })));
}
function pageFor(detector, ids) {
  const selected = patterns(detector).filter(rule => ids.includes(rule.id));
  assert.equal(selected.length, new Set(ids).size, `${detector.id}: every requested pattern must exist`);
  const scripts = selected.filter(rule => rule.method === 'content').map(rule => {
    assert.equal(rule.textRegex, false, `${detector.id}/${rule.id}: add an explicit regex fixture when needed`);
    return rule.text;
  });
  return {
    content: scripts.map(content => ({ type: 'inline', content })),
    jsHooks: selected.filter(rule => rule.method === 'js_hooks').map(({ method, ...hook }) => {
      assert.notEqual(hook.enabled, false, `${detector.id}/${hook.id}: disabled hook in profile`);
      return { detectorId: detector.id, ...hook };
    })
  };
}
async function detectFor(detector, pageData) {
  return (await engine().detectOnPage(pageData)).find(result => result.detector.id === detector.id);
}

// Enumerate minimal witnesses for ALL, every OR alternative and every threshold
// choice, so a working first branch cannot conceal a broken alternate path.
function product(groups) {
  return groups.reduce((out, group) => out.flatMap(left => group.map(right => [...left, ...right])), [[]]);
}
function choices(list, count) {
  if (count === 0) return [[]];
  return list.flatMap((item, index) => choices(list.slice(index + 1), count - 1)
    .map(rest => [item, ...rest]));
}
function witnesses(node) {
  if (node.pattern) return [[node.pattern]];
  if (node.all) return product(node.all.map(witnesses));
  if (node.any) return node.any.flatMap(witnesses);
  if (node.of) return choices(node.of, node.atLeast).flatMap(nodes => product(nodes.map(witnesses)));
  throw new Error(`Unsupported fingerprint combination node: ${JSON.stringify(node)}`);
}
function validateCondition(node, knownIds, label = 'combination') {
  assert.ok(node && typeof node === 'object' && !Array.isArray(node), `${label}: condition must be an object`);
  const keys = Object.keys(node).sort();
  if (Object.hasOwn(node, 'pattern')) {
    assert.deepEqual(keys, ['pattern'], `${label}: pattern leaf must be explicit`);
    assert.ok(typeof node.pattern === 'string' && node.pattern.length > 0, `${label}: empty pattern`);
    assert.ok(knownIds.has(node.pattern), `${label}: unknown pattern ${node.pattern}`);
    return;
  }
  const operator = Object.hasOwn(node, 'all') ? 'all' : Object.hasOwn(node, 'any') ? 'any' : 'of';
  assert.deepEqual(keys, operator === 'of' ? ['atLeast', 'of'] : [operator], `${label}: unsupported condition shape`);
  assert.ok(Array.isArray(node[operator]) && node[operator].length > 0, `${label}: empty ${operator}`);
  if (operator === 'of') {
    assert.ok(Number.isInteger(node.atLeast) && node.atLeast >= 1 && node.atLeast <= node.of.length,
      `${label}: impossible threshold`);
  }
  node[operator].forEach((child, index) => validateCondition(child, knownIds, `${label}/${operator}[${index}]`));
}
function combinationWitnesses(detector, combination) {
  const label = `${detector.id}/${combination.id}`;
  validateCondition(combination.when, new Set(patterns(detector).map(rule => rule.id)), label);
  const result = witnesses(combination.when);
  assert.ok(result.length > 0, `${label}: combination must have at least one reachable witness`);
  return result;
}

test('combination validation rejects impossible or malformed nested branches instead of silently skipping them', () => {
  const a = { pattern: 'a' };
  const b = { pattern: 'b' };
  const known = new Set(['a', 'b']);
  const invalid = [null, [], {}, { all: [] }, { any: [] }, { atLeast: 1, of: [] },
    { atLeast: 3, of: [a, b] }, { atLeast: 0, of: [a] }, { atLeast: 1.5, of: [a, b] },
    { atLeast: '1', of: [a] }, { pattern: '' }, { pattern: 'unknown' },
    { pattern: 'a', all: [b] }, { all: [a], any: [b] },
    { any: [a, { atLeast: 3, of: [a, b] }] }, { all: [a, { any: [] }] }];
  for (const node of invalid) assert.throws(() => validateCondition(node, known));
  validateCondition({ any: [{ all: [a, b] }, { atLeast: 1, of: [a, b] }] }, known);
});
function satisfied(node, ids) {
  if (node.pattern) return ids.has(node.pattern);
  if (node.all) return node.all.every(child => satisfied(child, ids));
  if (node.any) return node.any.some(child => satisfied(child, ids));
  if (node.of) return node.of.filter(child => satisfied(child, ids)).length >= node.atLeast;
  return false;
}
function expectedConfidence(detector, matches) {
  const ids = new Set(matches.flatMap(match => Array.from(Combinations.matchPatternIds(detector, match))));
  return Math.max(0,
    ...matches.map(match => match.baseConfidence ?? match.confidence),
    ...detector.combinations.filter(combo => satisfied(combo.when, ids)).map(combo => combo.confidence));
}

// The current MAIN-world telemetry observes API use, not arguments, return values,
// callers or data flow. Generic co-occurrence must never be labeled certainty.
test('all 21 fingerprint definitions have multiple graded, reachable combinations and low single signals', () => {
  assert.equal(Object.keys(fingerprint).length, 21);
  for (const detector of Object.values(fingerprint)) {
    // 1.2.0 of 2026-10-03; Canvas got 1.2.1 on 2026-10-07 (difficulty Low → High),
    // Screen and IndexedDB on 2026-10-08 (one combination re-rated)
    assert.match(detector.version, /^1\.2\.[01]$/, detector.id);
    assert.match(detector.lastUpdated, /^2026-10-0[378]$/, detector.id);
    const rules = patterns(detector);
    const ids = new Set(rules.map(rule => rule.id));
    assert.equal(ids.size, rules.length, `${detector.id}: duplicate pattern ids`);
    for (const rule of rules) {
      assert.ok(typeof rule.id === 'string' && rule.id, `${detector.id}: explicit pattern id required`);
      assert.ok(Number.isInteger(rule.confidence) && rule.confidence >= 1 && rule.confidence <= 45,
        `${detector.id}/${rule.id}: unqualified API usage must remain low confidence`);
      if (rule.enabled !== false) assert.equal(rule.standalone, true, `${detector.id}/${rule.id}: weak evidence must remain visible`);
      if (rule.method === 'content') {
        assert.equal(rule.scope, 'scripts');
        assert.equal(rule.checkScripts, true);
        assert.ok(rule.confidence <= 15, `${detector.id}/${rule.id}: a reference is not execution`);
      }
    }
    assert.ok(detector.combinations.length >= 2, `${detector.id}: multiple combinations required`);
    assert.ok(new Set(detector.combinations.map(combo => combo.confidence)).size >= 2, `${detector.id}: graded confidence required`);
    assert.equal(new Set(detector.combinations.map(combo => combo.id)).size, detector.combinations.length);
    assert.equal(new Set(detector.combinations.map(combo => JSON.stringify(combo.when))).size, detector.combinations.length);
    for (const combination of detector.combinations) {
      assert.ok(Number.isInteger(combination.confidence) && combination.confidence > 0 && combination.confidence < 100,
        `${detector.id}/${combination.id}: generic telemetry cannot prove intent`);
      const refs = Combinations.references(combination.when);
      assert.ok(refs.patterns.size >= 2);
      assert.equal(refs.methods.size, 0, `${detector.id}: do not combine arbitrary methods`);
      for (const id of refs.patterns) {
        const rule = rules.find(rule => rule.id === id);
        assert.ok(rule, `${detector.id}/${combination.id}: unknown ${id}`);
        assert.notEqual(rule.enabled, false, `${detector.id}/${combination.id}: disabled ${id}`);
      }
      for (const witness of combinationWitnesses(detector, combination)) {
        assert.ok(new Set(witness).size >= 2, `${detector.id}/${combination.id}: independent signals required`);
      }
    }
  }
});

test('browser API availability alone and ordinary event listeners produce no fingerprint evidence', async () => {
  const installed = await installation();
  assert.equal(installed.windowProperties.length, 0);
  assert.equal((await engine().detectOnPage({ url: 'https://example.test/', pageHTML: '<p>Hello</p>' })).length, 0);
  const reports = installed.hookDefinitions.flatMap(detector => detector.hooks
    .filter(hook => hook.target === 'EventTarget.prototype.addEventListener')
    .map(hook => ({ detectorId: detector.id, ...hook })));
  assert.equal(reports.length, 0);
});

test('every single installed hook is visible at its own low score, including repeated calls', async () => {
  for (const detector of (await installation()).hookDefinitions) {
    for (const hook of detector.hooks) {
      const definition = fingerprint[detector.id];
      for (const count of [1, 10]) {
        const result = await detectFor(definition, { jsHooks: Array(count).fill({ detectorId: detector.id, ...hook }) });
        assert.ok(result, `${detector.id}/${hook.target}: weak usage should not disappear`);
        assert.equal(result.confidence, hook.confidence);
        assert.equal(result.partial, undefined);
        assert.equal(result.combinations, undefined);
      }
    }
  }
});

test('maxTouchPoints alone scores exactly 10%, while CPU and memory accesses score 50%', async () => {
  const detector = fingerprint['detect-hardware-fingerprint'];
  const reference = await detectFor(detector, { content: [{ content: 'navigator.maxTouchPoints' }] });
  assert.equal(reference.confidence, 10);
  assert.equal(reference.matches.length, 1);
  assert.equal(reference.combinations, undefined);
  const profile = await detectFor(detector, pageFor(detector, ['hardware-cpu', 'hardware-memory']));
  assert.equal(profile.confidence, 50);
  assert.ok(profile.combinations.some(combo => combo.id === 'hardware-profile'));
});

test('all static references together stay weak, and prose or generic fingerprint names cannot escalate them', async () => {
  for (const detector of Object.values(fingerprint)) {
    const ids = patterns(detector).filter(rule => rule.method === 'content').map(rule => rule.id);
    if (!ids.length) continue;
    const page = pageFor(detector, ids);
    page.content.push({ content: 'FingerprintJS Fingerprint2 getFingerprint browserFingerprint deviceFingerprint visitorId' });
    const result = await detectFor(detector, page);
    assert.ok(result, detector.id);
    assert.ok(result.confidence <= 20, `${detector.id}: scripts alone scored ${result.confidence}`);
    const prose = await detectFor(detector, { pageHTML: `<p>${page.content.map(script => script.content).join(' ')}</p>` });
    assert.equal(prose, undefined, `${detector.id}: prose must not match script references`);
  }
});

test('unrelated identifier substrings cannot manufacture a fingerprint profile', async () => {
  const source = 'customHardwareConcurrencyLabel customDeviceMemoryLabel customMaxTouchPointsLabel '
    + 'customGamepadLabel customDeviceOrientationEventLabel';
  for (const detector of Object.values(fingerprint)) {
    const result = await detectFor(detector, { content: [{ content: source }] });
    assert.equal(result, undefined, detector.id);
  }
});

test('WebUSB hooks use real instance methods and preserve the navigator.usb receiver', async () => {
  const usb = (await installation()).hookDefinitions.find(detector => detector.id === 'detect-usb-fingerprint');
  for (const target of ['USB.prototype.getDevices', 'USB.prototype.requestDevice']) {
    const hook = usb.hooks.find(hook => hook.target === target);
    assert.ok(hook);
    assert.equal(hook.windowPath, 'navigator.usb');
  }
});

for (const detector of Object.values(fingerprint)) {
  for (const combination of detector.combinations || []) {
    test(`${detector.name}/${combination.id}: every branch reaches its tier without missing-signal or duplicate promotion`, async () => {
      const unique = new Map(combinationWitnesses(detector, combination).map(ids => [Array.from(new Set(ids)).sort().join(','), Array.from(new Set(ids))]));
      for (const ids of unique.values()) {
        const page = pageFor(detector, ids);
        const complete = await detectFor(detector, page);
        assert.ok(complete, `${combination.id}: missing detection`);
        assert.ok(complete.combinations?.some(combo => combo.id === combination.id));
        assert.equal(complete.confidence, expectedConfidence(detector, complete.matches));
        assert.ok(complete.confidence >= combination.confidence);
        for (const match of complete.matches) {
          if (match.baseConfidence !== undefined) assert.ok(match.baseConfidence < match.confidence);
        }
        for (const missing of ids) {
          const remaining = await detectFor(detector, pageFor(detector, ids.filter(id => id !== missing)));
          assert.ok(!remaining?.combinations?.some(combo => combo.id === combination.id), `${combination.id}: missing ${missing} still promoted`);
          if (remaining) assert.ok(remaining.confidence <= complete.confidence);
        }
        const reversed = await detectFor(detector, { content: [...page.content].reverse(), jsHooks: [...page.jsHooks].reverse() });
        assert.equal(reversed.confidence, complete.confidence);
      }
    });
  }

  test(`${detector.name}: incremental background scoring reaches the highest profile without compounding confidence`, async () => {
    const active = patterns(detector).filter(rule => rule.enabled !== false);
    const parts = [];
    for (const rule of active) {
      const result = await detectFor(detector, pageFor(detector, [rule.id]));
      assert.ok(result, `${detector.id}/${rule.id}: evidence lost`);
      parts.push(result);
    }
    const merged = parts[0];
    for (const part of parts.slice(1)) {
      merged.matches.push(...part.matches);
      assert.equal(context.rescoreCombinations(merged), true);
      assert.equal(merged.confidence, expectedConfidence(detector, merged.matches));
    }
    const highest = Math.max(...detector.combinations.map(combo => combo.confidence));
    assert.equal(merged.confidence, highest);
    for (let repeat = 0; repeat < 3; repeat++) {
      assert.equal(context.rescoreCombinations(merged), true);
      assert.equal(merged.confidence, highest);
    }
    assert.equal(merged.partial, undefined);
  });
}
