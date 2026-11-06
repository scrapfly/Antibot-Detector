const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { engineContext, plain, root } = require('./helpers/engine-context.js');

// A DOM rule matched every element it named with a match of its own: `a[href]` on a page of 5,000 links was 5,000 identical
// matches, about 355 KB of JSON for one result, kept by the cache, History and the webhook. A scan now keeps one match per
// rule, with the number of elements after its text ("a[href]= ×5000"). Rules → Test counts elements through the list that
// runDetector returns, so that stays one match per element unless the caller asks for the groups (detectOnPage, the only path
// that saves a result, does).

const { Engine } = engineContext();
const TIMES = '×';

const links = (count, text = '') => Array.from({ length: count }, (_, index) => ({ selector: 'a', ...(text ? { text } : {}), attributes: { href: `/page-${index}` } }));
const detector = (rules) => ({ id: 'detect-links', name: 'Links', enabled: true, category: 'Anti-Bot', detection: { dom: rules } });

async function scan(dom, rules, d = detector(rules)) {
  const engine = new Engine();
  engine.setDetectors({ antibot: { [d.id]: d } });
  return plain(await engine.detectOnPage({ url: 'https://site.test/', dom }));
}
const domMatches = (results) => results.flatMap(result => result.matches).filter(match => match.type === 'dom');

test('a rule that names thousands of elements is one match with their number in its value', async () => {
  const results = await scan(links(5000), [{ id: 'links', selector: 'a[href]', confidence: 60, description: 'Every link' }]);
  assert.equal(results.length, 1);
  const found = domMatches(results);
  assert.equal(found.length, 1, 'one match for the rule, not one per element');
  assert.equal(found[0].selector, 'a[href]');
  assert.equal(found[0].value, `a[href]= ${TIMES}5000`);
  assert.equal(found[0].confidence, 60);
  assert.equal(found[0].description, 'Every link');
  assert.ok(JSON.stringify(results).length < 2000, `a result of ${JSON.stringify(results).length} bytes`);
  assert.equal(results[0].confidence, 60, 'the score is the rule\'s');
});

test('the value shows the first element\'s text before the number', async () => {
  const found = domMatches(await scan(links(3, 'Home'), [{ id: 'links', selector: 'a[href]' }]));
  assert.equal(found.length, 1);
  assert.equal(found[0].value, `a[href]=Home ${TIMES}3`);
  assert.equal(found[0].confidence, 85, 'the default DOM confidence');
});

test('one element is listed as it always was, with no number', async () => {
  const found = domMatches(await scan(links(1, 'Home'), [{ id: 'links', selector: 'a[href]', confidence: 60 }]));
  assert.deepEqual(found.map(match => match.value), ['a[href]=Home']);
  const long = domMatches(await scan(links(1, 'x'.repeat(80)), [{ id: 'links', selector: 'a[href]' }]));
  assert.equal(long[0].value, `a[href]=${'x'.repeat(50)}...`, 'the text is still cut at 50 characters');
  assert.equal(domMatches(await scan(links(0), [{ id: 'links', selector: 'a[href]' }])).length, 0);
});

test('two rules on the same selector keep a match each, with their own confidence and count', async () => {
  const dom = [...links(12), { selector: 'a', attributes: { href: '/x', class: 'cta' } }];
  const found = domMatches(await scan(dom, [
    { id: 'weak', selector: 'a[href]', confidence: 40 },
    { id: 'strong', selector: 'a.cta', confidence: 90 },
    { id: 'copy', selector: 'a[href]', confidence: 70 }
  ]));
  assert.deepEqual(found.map(match => [match.selector, match.confidence, match.value]), [
    ['a[href]', 40, `a[href]= ${TIMES}13`],
    ['a.cta', 90, 'a.cta='],
    ['a[href]', 70, `a[href]= ${TIMES}13`]
  ]);
});

test('combination rules still see each rule once, by its id', async () => {
  const combo = detector([{ id: 'many', selector: 'a[href]', confidence: 30, standalone: false }, { id: 'cta', selector: 'a.cta', confidence: 50 }]);
  combo.combinations = [{ id: 'both', name: 'Both', confidence: 88, when: { all: [{ pattern: 'many' }, { pattern: 'cta' }] } }];
  const [result] = await scan([...links(40), { selector: 'a', attributes: { href: '/y', class: 'cta' } }], null, combo);
  assert.deepEqual(result.matches.map(match => match.patternId), ['many', 'cta']);
  assert.deepEqual(result.combinations.map(entry => entry.id), ['both']);
  assert.equal(result.confidence, 88);
});

test('runDetector keeps one match per element unless it is asked for the groups: Rules → Test counts elements', () => {
  const d = detector([{ id: 'links', selector: 'a[href]', confidence: 60 }]);
  const engine = new Engine();
  engine.setDetectors({ antibot: { [d.id]: d } });
  const page = { url: 'https://site.test/', dom: links(7) };
  assert.equal(engine.runDetector(d, page).matches.length, 7, 'the count the live test shows is the number of elements');
  const grouped = engine.runDetector(d, page, { groupElements: true }).matches;
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].value, `a[href]= ${TIMES}7`);
});

// ---- What reads a saved match: History, the worker's late-evidence merge, Rules → Check against History

const runtimeState = fs.readFileSync(path.join(root, 'background/runtime-state.js'), 'utf8');
const worker = vm.createContext({});
vm.runInContext(runtimeState.slice(runtimeState.indexOf('function generateMatchKey('), runtimeState.indexOf('function sendProgressUpdate(')), worker);

test('the worker keys a DOM match by its selector, so the number in the value changes nothing', () => {
  const key = (match) => vm.runInContext('generateMatchKey', worker)(match);
  assert.equal(key({ type: 'dom', selector: 'a[href]', value: 'a[href]=' }), 'dom:a[href]');
  assert.equal(key({ type: 'dom', selector: 'a[href]', value: `a[href]= ${TIMES}5000` }), 'dom:a[href]');
  assert.equal(key({ type: 'dom', selector: 'a[href]', value: `a[href]= ${TIMES}5000`, patternId: 'many' }), 'many|dom:a[href]');
});

test('History keeps the compact match whole and every reader of its value still finds the selector', () => {
  const HistoryStore = require('../modules/core/history-store.js');
  const RuleHistoryCheck = require('../sections/rules/rule-history-check.js');
  const match = { type: 'dom', selector: 'a[href]', value: `a[href]= ${TIMES}5000`, confidence: 60, description: 'Every link' };
  const entry = { id: 'e1', url: 'https://site.test/', detections: [{ detector: { id: 'detect-links', name: 'Links' }, confidence: 60, matches: [match] }] };
  const saved = HistoryStore.slimEntry(entry).detections[0].matches[0];
  assert.deepEqual(saved, { type: 'dom', value: `a[href]= ${TIMES}5000`, confidence: 60 }, 'History keeps the value, so the number survives');
  assert.equal(RuleHistoryCheck.domSelector(saved.value), 'a[href]');
  assert.equal(RuleHistoryCheck.patternMatches('dom', { selector: 'a[href]' }, saved), true, 'Check against History still counts the rule');
  assert.equal(RuleHistoryCheck.patternMatches('dom', { selector: 'a[href]' }, match), true);

  // The History tab: "Copy entry" names the selector, whatever follows the "="
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: require('../utils/format-utils.js'),
    chrome: { runtime: { getURL: p => p } }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8') + '\n;globalThis.History = History;', context);
  assert.equal(context.History.copyLabel(saved), 'a[href]');
  assert.equal(context.History.copyLabel({ type: 'dom', value: `.cf-turnstile[data-sitekey]= ${TIMES}2` }), '.cf-turnstile[data-sitekey]');
  const view = Object.create(context.History.prototype);
  view.detectorManager = null;
  const text = view.formatHistoryItemText({ ...entry, hostname: 'site.test', title: 'Site', timestamp: 1, detections: HistoryStore.slimEntry(entry).detections });
  assert.ok(text.includes('DOM: a[href]'), text);
  assert.ok(!text.includes(TIMES), 'the copy names what matched, not how many');
});
