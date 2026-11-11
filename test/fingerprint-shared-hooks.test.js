const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { engineContext, plain } = require('./helpers/engine-context.js');
const { createPage, installDetail, bootstrapDetail, P } = require('./helpers/main-world-page.js');

// One API read is one card. A detector registers its own hook on a target, the MAIN world sends one report for every
// detector registered on the target the page touched (content-main-world.js, reportHookDetectionsForTarget), and the
// worker keeps one detection per detector id (finalizeDetection merges by id; the engine's detectOnPage does the same).
// So two detectors on the same target show two cards for a single read: Hardware and Navigator both hooked the CPU
// count and the device memory, and a page that read them got a Hardware card and a Navigator card, each at 50%.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const TOKEN = 'a'.repeat(32);
const FAST = { ACTIVITY_TIMEOUT_MS: 250, MAX_DETECTION_MS: 1000, MIN_MONITOR_MS: 0 };

// Targets two enabled hooks may share, by the detectors that share them. Every entry is a read two techniques really
// have in common, or a decision still open. The tests below fail when an entry stops being true (so the fix for it
// removes the entry) and when a new target gets shared (so a new overlap is a choice, not an accident).
const SHARED_ON_PURPOSE = {
  // Canvas text probing and font probing are one primitive: a canvas fingerprint draws text and measures it, a font
  // probe measures the same string in many fonts. Neither owns the read. Canvas builds two tiers on it
  // (canvas-profile, canvas-text-metrics-profile) and Font three (font-availability-metrics, font-profile,
  // font-set-inspection-metrics), so taking it from Font leaves one combination and fails the two-combination rule.
  // A bare call shows both cards at 10%; ordinary text layout makes the same call.
  'CanvasRenderingContext2D.prototype.measureText': ['detect-canvas-fingerprint', 'detect-font-fingerprint'],
  // Open decision, not a defence: Battery API Fingerprint owns this read. Media Fingerprint counts it as one input of its
  // top tier (media-broad-profile, 55) and its description names battery, so dropping the hook removes that tier and
  // makes the description wrong, and the new description needs translating into every language. Remove this entry when
  // that is decided.
  'Navigator.prototype.getBattery': ['detect-battery-fingerprint', 'detect-media-fingerprint']
};

// The detectors the extension ships, as the engine holds them: { category: { id: detector } }
const detectors = {};
for (const [category, entry] of Object.entries(JSON.parse(read('detectors/index.json')))) {
  if (!entry || !Array.isArray(entry.detectors)) continue;
  detectors[category] = Object.fromEntries(entry.detectors.map(id => {
    const detector = JSON.parse(read(`detectors/${category}/${id}.json`));
    return [detector.id, detector];
  }));
}

// What the page gets hooked, as the engine installs it: an enabled detector, an enabled hook, a trimmed target
function enabledHooks() {
  return Object.values(detectors).flatMap(list => Object.values(list))
    .filter(detector => detector.enabled !== false)
    .flatMap(detector => (detector.detection?.js_hooks || [])
      .filter(hook => hook && hook.enabled !== false && typeof hook.target === 'string' && hook.target.trim())
      .map(hook => ({ detector: detector.id, hook: hook.id, target: hook.target.trim() })));
}
function sharedTargets() {
  const byTarget = new Map();
  for (const hook of enabledHooks()) byTarget.set(hook.target, [...(byTarget.get(hook.target) || []), hook]);
  return [...byTarget].filter(([, hooks]) => hooks.length > 1);
}
const listing = ([target, hooks]) => `${target}: ${hooks.map(({ detector, hook }) => `${detector}/${hook}`).join(', ')}`;
const sameDetectors = (hooks, ids) => JSON.stringify(hooks.map(hook => hook.detector).sort()) === JSON.stringify([...ids].sort());

// A floor, not a count: it only has to notice a loader that read nothing, which would make every test below pass for free
test('the hooks are read from the shipped detectors, all of them', () => {
  const hooks = enabledHooks();
  assert.ok(hooks.length > 100, `only ${hooks.length} enabled hooks read`);
  for (const category of ['antibot', 'captcha', 'fingerprint']) assert.ok(detectors[category], `no ${category} detectors read`);
  assert.ok(hooks.some(hook => hook.detector === 'detect-hardware-fingerprint'));
});

test('no two enabled js_hooks share a target, outside the few that are shared on purpose', () => {
  const unexpected = sharedTargets()
    .filter(([target, hooks]) => !SHARED_ON_PURPOSE[target] || !sameDetectors(hooks, SHARED_ON_PURPOSE[target]));
  assert.deepEqual(unexpected.map(listing), [],
    'one read of a shared target makes one report per detector, so one card each: give the read to one detector');
});

test('every target shared on purpose is still shared by exactly the detectors named for it', () => {
  const shared = new Map(sharedTargets());
  for (const [target, ids] of Object.entries(SHARED_ON_PURPOSE)) {
    assert.ok(shared.has(target) && sameDetectors(shared.get(target), ids), `${target} is no longer shared by ${ids.join(' and ')}: remove its entry`);
  }
});

test('Hardware is the only detector that hooks the CPU count and the device memory', () => {
  for (const target of ['Navigator.prototype.hardwareConcurrency', 'Navigator.prototype.deviceMemory']) {
    const owners = enabledHooks().filter(hook => hook.target === target).map(hook => hook.detector);
    assert.deepEqual(owners, ['detect-hardware-fingerprint'], target);
  }
});

// A page in the fake browser of the MAIN-world tests, with the hooks of every shipped detector installed the way the
// engine sends them. It reads what the test says, and what the MAIN world reports is scanned by the real engine.
const { Engine, logs } = engineContext();
const T = P.MESSAGE_TYPES;
// Members a real Navigator has and the fake one lacks, as plain getters on its prototype like the browser's own
const NAVIGATOR_MEMBERS = { deviceMemory: 8, languages: ['en-US', 'en'], platform: 'Linux x86_64', webdriver: false };

async function installedDefinitions() {
  const events = [];
  await Engine.installHooksOrchestrator({ dispatchEvent(event) { events.push(event); } },
    { storage: { local: { async get() { return { scrapfly_detectors: { detectors } }; } } } });
  assert.deepEqual(logs.error, []);
  assert.equal(events.length, 1);
  return plain(events[0].detail.hookDefinitions);
}

async function scan(reads) {
  const page = createPage();
  const bootstrap = bootstrapDetail(TOKEN);
  delete bootstrap.earlyHooks; // the install path itself, as test/main-world-hooks.test.js pins it
  page.bootstrap(bootstrap);
  for (const [name, value] of Object.entries(NAVIGATOR_MEMBERS)) {
    Object.defineProperty(page.context.Navigator.prototype, name, { get() { return value; }, configurable: true });
  }
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: await installedDefinitions() }));
  for (const code of reads) page.run(code);

  const reports = page.ofType(T.JS_HOOK_DETECTION).map(message => message.detection);
  const engine = new Engine();
  engine.setDetectors(detectors);
  const found = plain(await engine.detectOnPage({ jsHooks: reports.map(report => ({ detectorId: report.detectorId, detectorName: report.detectorName, ...report.hook })) }));
  return {
    reportedBy: [...new Set(reports.map(report => report.detectorId))].sort(),
    cards: found.filter(detection => detection.category === 'fingerprint')
  };
}
const targetsOf = (card) => card.matches.map(match => match.target).sort();

test('a page that reads the CPU count and the device memory gets one Fingerprint detection, Hardware at 50%', async () => {
  const { reportedBy, cards } = await scan(['navigator.hardwareConcurrency', 'navigator.deviceMemory']);
  assert.deepEqual(reportedBy, ['detect-hardware-fingerprint']);
  assert.deepEqual(cards.map(card => card.detector.id), ['detect-hardware-fingerprint']);
  assert.equal(cards[0].confidence, 50);
  assert.ok(cards[0].combinations.some(combination => combination.id === 'hardware-profile'));
  assert.deepEqual(targetsOf(cards[0]), ['Navigator.prototype.deviceMemory', 'Navigator.prototype.hardwareConcurrency']);
});

test('the CPU count alone, and the device memory alone, each get one Fingerprint detection', async () => {
  for (const [read, target, confidence] of [['navigator.hardwareConcurrency', 'Navigator.prototype.hardwareConcurrency', 10],
    ['navigator.deviceMemory', 'Navigator.prototype.deviceMemory', 25]]) {
    const { reportedBy, cards } = await scan([read]);
    assert.deepEqual(reportedBy, ['detect-hardware-fingerprint'], read);
    assert.deepEqual(cards.map(card => [card.detector.id, card.confidence, targetsOf(card)]),
      [['detect-hardware-fingerprint', confidence, [target]]], read);
  }
});

test('Navigator keeps the reads that are its own: identity and language go to its card, CPU and memory to Hardware only', async () => {
  const { cards } = await scan(['navigator.userAgent', 'navigator.platform', 'navigator.languages',
    'navigator.hardwareConcurrency', 'navigator.deviceMemory']);
  const byDetector = Object.fromEntries(cards.map(card => [card.detector.id, card]));
  assert.deepEqual(Object.keys(byDetector).sort(), ['detect-hardware-fingerprint', 'detect-navigator-fingerprint']);
  assert.deepEqual(targetsOf(byDetector['detect-navigator-fingerprint']),
    ['Navigator.prototype.languages', 'Navigator.prototype.platform', 'Navigator.prototype.userAgent']);
  assert.ok(byDetector['detect-navigator-fingerprint'].combinations.some(combination => combination.id === 'navigator-browser-profile'));
  assert.equal(byDetector['detect-hardware-fingerprint'].confidence, 50);
  // Each read is on exactly one card
  const all = cards.flatMap(targetsOf);
  assert.equal(new Set(all).size, all.length, `a target on two cards: ${all.join(', ')}`);
});
