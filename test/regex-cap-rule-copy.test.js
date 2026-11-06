'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A regex reads all of a text longer than PatternCache.REGEX_TEXT_LIMIT only when Scrapfly ships it, and which regexes those are is
// read from the rule being run: its own copy when it is an official rule nobody edited, the shipped copy it keeps when the person
// edited it, nothing for any other rule. Rules → Test runs the editor's unsaved copy, so there it is the saved rule of the same id
// that says so. Before, the engine of Rules → Test had no rules at all, so it cut every regex, official ones included, and missed
// what a scan finds; and an official rule edited by an older build, which kept no shipped copy, counted the person's regexes as
// shipped ones (and the next edit made the person's copy its "official" one).

const root = path.join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

globalThis.Constants = Object.assign(globalThis.Constants || {}, { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, COOKIE_VALUE_MAX_LENGTH: 100, DEFAULT_MATCH_CONFIDENCE: 50, DEFAULT_DOM_CONFIDENCE: 50 });
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, error() {}, detection() {}, cache() {}, get debugMode() { return false; } };
Object.assign(globalThis, require(path.join(root, 'utils/pattern-cache.js')));
const DetectionUtils = globalThis.DetectionUtils = require(path.join(root, 'utils/detection-utils.js'));
require(path.join(root, 'modules/core/bridge-protocol.js'));
for (const f of ['analysis', 'extractors', 'matching', 'hooks']) Object.assign(globalThis, require(path.join(root, `modules/detection/engine/detection-engine-${f}.js`)));
globalThis.DetectionCombinations = require(path.join(root, 'modules/detection/detection-combinations.js'));
if (typeof globalThis.DetectionEngineManager !== 'function') {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\n;globalThis.DetectionEngineManager = DetectionEngineManager;');
}
globalThis.RuleTest = require('../modules/core/rule-test.js');
globalThis.WorkerMessages = require('../modules/core/worker-messages.js');
const RuleTestRuntime = require('../background/rule-test.js');
const DetectorManager = require('../modules/detection/rules/detector-manager.js');

const LIMIT = globalThis.PatternCache.REGEX_TEXT_LIMIT;
// A page whose source has the word well past the first LIMIT characters (a long minified bundle)
const pageHTML = `<html><script>${'x'.repeat(LIMIT + 50)} needle</script></html>`;
const regexRule = (text) => ({ id: 'c1', text, textRegex: true, confidence: 70 });
const official = (extra = {}) => ({ id: 'detect-shipped', name: 'Shipped', author: 'Scrapfly', category: 'antibot', version: '1.0.0',
  detection: { content: [regexRule('need.e')] }, ...extra });

beforeEach(() => DetectionUtils.setOfficialDetectorIds(['detect-shipped']));

// ---- Rules → Test

function world(stored) {
  globalThis.networkUrlsStore = new Map();
  globalThis.Utils = { isValidContentScriptTab: (t) => !!t && /^https?:/.test(String(t.url)) };
  globalThis.PageCookies = { getAll: async () => [] };
  const tab = { id: 7, url: 'https://shop.example/' };
  globalThis.chrome = { tabs: {
    get: async () => tab, query: async () => [tab],
    sendMessage: async () => ({ status: 'ok', data: { url: tab.url, content: [], dom: [], cookies: [], pageHTML } })
  } };
  // The worker's saved rules, as ensureDetectorManagerInitialized hands them over
  globalThis.ensureDetectorManagerInitialized = async () => ({ findDetectorById: (id) => (stored && stored.id === id ? plain(stored) : null) });
}
const contentCount = async (draft) => {
  const reply = plain(await RuleTestRuntime.run({ detector: draft, tabId: 7 }));
  assert.equal(reply.status, 'ok');
  return reply.rows.find(row => row.method === 'content' && row.index === 0).count;
};

test('Rules → Test of an official rule finds what a scan finds: its shipped regex reads all of a long page', async () => {
  world(official());
  assert.equal(await contentCount(official()), 1, 'the reviewer\'s case: a match past 100,000 characters');
});

test('Rules → Test cuts a regex the person changed in the editor, and every regex of a rule of their own', async () => {
  world(official());
  assert.equal(await contentCount(official({ detection: { content: [regexRule('needl.')] } })), 0, 'an unsaved change to the official regex');
  world(null);
  assert.equal(await contentCount({ id: 'detect-mine', name: 'Mine', detection: { content: [regexRule('need.e')] } }), 0, 'a new rule, even with the same regex');
  world({ ...official(), id: 'detect-mine', author: 'Me' });
  assert.equal(await contentCount({ ...official(), id: 'detect-mine' }), 0, 'a saved rule of the person\'s, whatever its author says now');
});

test('Rules → Test still runs when the worker\'s rules cannot be had: every regex reads the first characters', async () => {
  world(official());
  globalThis.ensureDetectorManagerInitialized = async () => { throw new Error('no rules'); };
  assert.equal(await contentCount(official()), 0);
  delete globalThis.ensureDetectorManagerInitialized;
  assert.equal(await contentCount(official()), 0);
});

// ---- A scan: the rule being run decides

const scan = (detector, detectors = {}) => {
  const engine = new globalThis.DetectionEngineManager();
  engine.detectors = detectors; // what the worker's engine holds: every rule
  return engine.runDetector(detector, { url: 'https://shop.example/', content: [], dom: [], cookies: [], pageHTML }).matches.length;
};

test('a scan reads all of the page for an official rule\'s regex, and for the shipped regexes of an edited one only', () => {
  assert.equal(scan(official()), 1);
  const edited = official({ userModified: true, officialSnapshot: official(), detection: { content: [regexRule('need.e'), { ...regexRule('needl.'), id: 'c2' }] } });
  const engine = new globalThis.DetectionEngineManager();
  const matches = engine.runDetector(edited, { url: 'https://shop.example/', content: [], dom: [], cookies: [], pageHTML }).matches;
  assert.equal(matches.length, 1, 'the shipped regex matched, the person\'s edit did not (both would be 2, none 0)');
});

test('the person\'s own rule cuts its regex even when an official rule ships the same text', () => {
  const mine = { id: 'detect-mine', name: 'Mine', author: 'Me', detection: { content: [regexRule('need.e')] } };
  assert.equal(scan(mine, { antibot: { 'detect-shipped': official(), 'detect-mine': mine } }), 0);
});

test('an official rule an older build marked as edited without a shipped copy ships nothing: its regexes are cut', () => {
  const oldEdit = official({ userModified: true, detection: { content: [regexRule('need.e')] } });
  assert.equal(scan(oldEdit, { antibot: { 'detect-shipped': oldEdit } }), 0);
  assert.deepEqual([...globalThis.demShippedRegexes(oldEdit)], []);
  assert.deepEqual([...globalThis.demShippedRegexes(official())], ['need.e']);
});

test('the next edit of such a rule does not make the person\'s copy its official one', () => {
  const oldEdit = official({ userModified: true, detection: { content: [regexRule('mine.')] } });
  const edited = DetectorManager.markUserEdited(plain({ ...oldEdit, detection: { content: [regexRule('mine2.')] } }), oldEdit);
  assert.equal(edited.userModified, true);
  assert.equal(edited.officialSnapshot, undefined, 'no "official" copy made from an edit');
  assert.equal(DetectorManager.officialVersionOf(edited), null, 'so Reset to official offers nothing it does not have');
  assert.equal(edited.version, '1.0.0');
  // An edit of an official rule that kept its shipped copy still keeps it
  const first = DetectorManager.markUserEdited(plain(official({ detection: { content: [regexRule('a.')] } })), official());
  const again = DetectorManager.markUserEdited(plain({ ...first, detection: { content: [regexRule('b.')] } }), first);
  assert.deepEqual(plain(again.officialSnapshot.detection), plain(official().detection));
});
