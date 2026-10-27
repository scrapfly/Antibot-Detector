const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Rules → "New rule from this page": the page's cookies, third-party scripts and response headers become candidates,
// the real engine marks the ones an installed rule already detects, and the ticked ones become a rule the engine
// then finds on the same page.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const RuleSuggest = require('../modules/core/rule-suggest.js');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, DEFAULT_MATCH_CONFIDENCE: 80 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, error() {}, detection() {}, cache() {}, get debugMode() { return false; } };
Object.assign(globalThis, require(path.join(root, 'utils/pattern-cache.js')));
require(path.join(root, 'modules/core/bridge-protocol.js'));
for (const f of ['analysis', 'extractors', 'matching', 'hooks']) {
  Object.assign(globalThis, require(path.join(root, `modules/detection/engine/detection-engine-${f}.js`)));
}
globalThis.DetectionCombinations = globalThis.DetectionCombinations || require(path.join(root, 'modules/detection/detection-combinations.js'));
if (typeof globalThis.DetectionEngineManager !== 'function') {
  vm.runInThisContext(read('modules/detection/engine/detection-engine-manager.js') + '\n;globalThis.DetectionEngineManager = DetectionEngineManager;');
}
const engine = Object.create(globalThis.DetectionEngineManager.prototype);
const runDetector = (detector, pageData) => engine.runDetector(detector, pageData);
const plain = (value) => JSON.parse(JSON.stringify(value));

const datadome = JSON.parse(read('detectors/antibot/detect-datadome.json'));
const detectors = [{ id: 'detect-datadome', detector: datadome }];

const page = () => ({
  url: 'https://shop.example.co.uk/cart',
  cookies: [
    { name: 'datadome', value: 'abc' },
    { name: 'acme_sid', value: '1' },
    { name: 'acme_tok_8f3a9c21d4', value: '2' },
    { name: 'acme_tok_77aa00bb11', value: '3' },
    { name: 'incap_ses_1234_567890', value: '4' }
  ],
  scripts: [
    'https://js.datadome.co/tags.js',
    'https://cdn.acmeshield.io/v3/shield.js?k=1',
    'https://cdn.acmeshield.io/v3/shield.js?k=2',
    'https://static.example.co.uk/app.js',
    'https://www.example.co.uk/main.js',
    'https://assets.vendor.net/build/4f3a9c21e0/loader.js'
  ],
  headers: { 'Content-Type': 'text/html', 'x-datadome-cid': 'AHrlqAAA', 'X-Acme-Shield': 'on', 'set-cookie': 'a=b' }
});

test('a cookie name keeps its exact name, or the part before a random-looking end as a prefix', () => {
  assert.deepEqual(RuleSuggest.cookieMatch('cf_clearance'), { prefix: false, text: 'cf_clearance' });
  assert.deepEqual(RuleSuggest.cookieMatch('__cf_bm'), { prefix: false, text: '__cf_bm' });
  assert.deepEqual(RuleSuggest.cookieMatch('incap_ses_1234_567890'), { prefix: true, text: 'incap_ses_' });
  assert.deepEqual(RuleSuggest.cookieMatch('_ga_X1Y2Z3W4Q'), { prefix: true, text: '_ga_' });
  assert.deepEqual(RuleSuggest.cookieMatch('visid_incap_2287392'), { prefix: true, text: 'visid_incap_' });
  // Too little left to be a name of its own: kept exact
  assert.deepEqual(RuleSuggest.cookieMatch('a_12345678'), { prefix: false, text: 'a_12345678' });
  assert.deepEqual(RuleSuggest.cookieMatch('session-2024'), { prefix: true, text: 'session-' });
});

test('a script is matched by its host and path, without the query, cut before a random-looking segment', () => {
  assert.equal(RuleSuggest.scriptText('https://cdn.acmeshield.io/v3/shield.js?k=1#x'), 'cdn.acmeshield.io/v3/shield.js');
  assert.equal(RuleSuggest.scriptText('https://assets.vendor.net/build/4f3a9c21e0/loader.js'), 'assets.vendor.net/build/');
  assert.equal(RuleSuggest.scriptText('https://cdn.vendor.net/main.4f3a9c21.js'), 'cdn.vendor.net/');
  assert.equal(RuleSuggest.scriptText('https://CDN.Vendor.net/'), 'cdn.vendor.net/');
  assert.equal(RuleSuggest.scriptText('not a url'), '');
});

test('the candidates: every cookie once, third-party scripts only, headers other than the ones every site sends', () => {
  const list = RuleSuggest.candidates(page());
  assert.deepEqual(list.map(c => c.id), [
    'cookie:datadome', 'cookie:acme_sid', 'cookie:acme_tok_', 'cookie:incap_ses_',
    'url:js.datadome.co/tags.js', 'url:cdn.acmeshield.io/v3/shield.js', 'url:assets.vendor.net/build/',
    'header:x-datadome-cid', 'header:x-acme-shield'
  ]);
  const tok = list.find(c => c.id === 'cookie:acme_tok_');
  assert.equal(tok.prefix, true);
  assert.equal(tok.value, 'acme_tok_…');
  assert.deepEqual(tok.sources, ['acme_tok_8f3a9c21d4', 'acme_tok_77aa00bb11']);
  assert.equal(list.find(c => c.id === 'url:cdn.acmeshield.io/v3/shield.js').sources.length, 2);
  assert.equal(RuleSuggest.siteOf('static.example.co.uk'), 'example.co.uk');
  assert.equal(RuleSuggest.siteOf('a.b.example.com'), 'example.com');
  assert.deepEqual(RuleSuggest.candidates(null), []);
});

test('the engine marks what an installed rule detects, and those come after what nothing detects', () => {
  const list = RuleSuggest.suggest(page(), detectors, runDetector);
  const known = list.filter(c => c.matchedBy.length).map(c => c.id);
  assert.deepEqual(known, ['cookie:datadome', 'url:js.datadome.co/tags.js', 'header:x-datadome-cid']);
  assert.deepEqual(plain(list.find(c => c.id === 'cookie:datadome').matchedBy), ['DataDome']);
  // Unmatched first, each group in page order
  assert.deepEqual(list.map(c => c.id), [
    'cookie:acme_sid', 'cookie:acme_tok_', 'cookie:incap_ses_', 'url:cdn.acmeshield.io/v3/shield.js',
    'url:assets.vendor.net/build/', 'header:x-acme-shield',
    'cookie:datadome', 'url:js.datadome.co/tags.js', 'header:x-datadome-cid'
  ]);
  // The grouped form of the installed rules works too, and a detector that throws is skipped
  const grouped = RuleSuggest.suggest(page(), { antibot: { 'detect-datadome': datadome, broken: { detection: { cookie: [] } } } },
    (detector, data) => { if (!detector.name) throw new Error('bad'); return runDetector(detector, data); });
  assert.equal(grouped.filter(c => c.matchedBy.length).length, 3);
  // Without the engine nothing is marked
  assert.equal(RuleSuggest.suggest(page(), detectors, null).filter(c => c.matchedBy.length).length, 0);
});

test('the engine never matches the page address itself, only what the page loaded', () => {
  const input = RuleSuggest.engineInput({ url: 'https://js.datadome.co/tags.js', scripts: [] });
  assert.equal(input.url, '');
  assert.equal(runDetector(datadome, input).matches.length, 0);
});

test('the ticked candidates become a rule in the detector file shape, and the engine finds it on the same page', () => {
  const list = RuleSuggest.suggest(page(), detectors, runDetector);
  const picked = list.filter(c => ['cookie:acme_sid', 'cookie:acme_tok_', 'url:cdn.acmeshield.io/v3/shield.js', 'header:x-acme-shield'].includes(c.id));
  const rule = RuleSuggest.buildRule({ id: 'custom-1', name: '  Acme Shield ', category: 'antibot', candidates: picked, lastUpdated: '2026-10-26 10:00:00' });
  assert.deepEqual(plain(rule), {
    id: 'custom-1', name: 'Acme Shield', displayName: 'Acme Shield', category: 'antibot', difficulty: 'Medium',
    icon: 'default', color: '#3b82f6', description: 'Custom detector', lastUpdated: '2026-10-26 10:00:00',
    detection: {
      cookie: [
        { name: '^acme_sid$', nameRegex: true, confidence: 100, nameScope: 'all', valueScope: 'all' },
        { name: '^acme_tok_', nameRegex: true, confidence: 100, nameScope: 'all', valueScope: 'all' }
      ],
      url: [{ text: 'cdn.acmeshield.io/v3/shield.js', confidence: 100, textScope: 'all' }],
      header: [{ name: '^x-acme-shield$', nameRegex: true, confidence: 100, nameScope: 'response', valueScope: 'response' }]
    }
  });
  const result = runDetector(rule, RuleSuggest.engineInput(page()));
  assert.equal(result.detected, true);
  const found = new Set(result.matches.map(m => m.type === 'cookie' ? `cookie:${m.name}` : m.type === 'url' ? `url:${m.fullUrl}` : `header:${m.value.split(':')[0]}`));
  for (const expected of ['cookie:acme_sid', 'cookie:acme_tok_8f3a9c21d4', 'cookie:acme_tok_77aa00bb11',
    'url:https://cdn.acmeshield.io/v3/shield.js?k=1', 'header:x-acme-shield']) {
    assert.ok(found.has(expected), expected);
  }
});

test('names with regex characters are escaped in the rule', () => {
  const [cookie] = RuleSuggest.candidates({ cookies: [{ name: 'a.b+c(1)' }] });
  assert.equal(RuleSuggest.patternOf(cookie).name, '^a\\.b\\+c\\(1\\)$');
  const rule = RuleSuggest.buildRule({ candidates: [cookie, { kind: 'dom', text: 'x' }, null] });
  assert.deepEqual(Object.keys(rule.detection), ['cookie']);
  assert.match(rule.id, /^custom-\d+$/);
  assert.equal(rule.category, 'antibot');
});

// ---- The dialog renders page data escaped ----------------------------------------------------------------------------

function loadDialog({ sendMessage = async () => undefined } = {}) {
  const elements = {};
  const element = (id) => (elements[id] = elements[id] || { id, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {},
    setAttribute() {}, removeAttribute() {}, addEventListener() {} });
  const context = vm.createContext({
    console, FormatUtils: require('../utils/format-utils.js'),
    document: { querySelector: (selector) => element(selector), querySelectorAll: () => [] },
    chrome: { runtime: { sendMessage } },
    WorkerMessages: { RULE_SUGGEST_PAGE: 'RULE_SUGGEST_PAGE' },
    Logger: { warn() {} }
  });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-suggest-ui.js'), context);
  return { Rules: vm.runInContext('Rules', context), elements };
}

test('the dialog escapes cookie names, script addresses and rule names in text and in attributes', () => {
  const { Rules, elements } = loadDialog();
  const rules = new Rules();
  const evil = '"><img src=x onerror=alert(1)>';
  rules.suggestCandidates = [
    { id: 'cookie:x', kind: 'cookie', value: evil, text: evil, prefix: false, sources: [evil], matchedBy: [] },
    { id: 'url:y', kind: 'url', value: `cdn.example.com/${evil}`, text: 'y', prefix: false, sources: [`https://cdn.example.com/${evil}`], matchedBy: [`Rule ${evil}`] }
  ];
  rules.renderSuggestions();
  const html = elements['#suggestRuleList'].innerHTML;
  assert.ok(!html.includes('<img'), 'no element from page data');
  assert.ok(!/title="[^"]*"><img/.test(html), 'no attribute cut short');
  assert.match(html, /title="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(html, /Already detected by Rule "&gt;&lt;img src=x/);
  assert.match(html, /No response headers: reload the page to capture them\./);
  assert.equal(elements['#createSuggestRule'].disabled, true, 'nothing ticked: Create rule waits');
});

test('a worker from before an update says to reload the extension; a first message it drops is sent again', async () => {
  for (const [replies, expected, tries] of [
    [[{ status: 'unknown' }], /Reload the extension/, 1],
    [[{ status: 'unsupported' }], /Open the popup on a website/, 1],
    [[{ status: 'error' }], /could not be read/, 1],
    [['throw', 'throw'], /could not be read/, 2]
  ]) {
    let sent = 0;
    const queue = replies.slice();
    const { Rules, elements } = loadDialog({ sendMessage: async () => { sent++; const reply = queue.shift(); if (reply === 'throw') throw new Error('port closed'); return reply; } });
    const rules = new Rules();
    await rules.loadSuggestions({ id: 7, url: 'https://a.example/' });
    assert.match(elements['#suggestRuleList'].innerHTML, expected, JSON.stringify(replies));
    assert.equal(sent, tries, JSON.stringify(replies));
  }
});

test('the button is offered on web pages only', () => {
  const { Rules } = loadDialog();
  assert.equal(Rules.isSuggestableTab({ url: 'https://example.com/' }), true);
  assert.equal(Rules.isSuggestableTab({ url: 'http://localhost:8080/' }), true);
  for (const url of ['chrome://extensions/', 'chrome-extension://abc/popup.html', 'file:///tmp/a.html', 'about:blank', '']) {
    assert.equal(Rules.isSuggestableTab({ url }), false, url);
  }
  assert.equal(Rules.isSuggestableTab(null), false);
});

// ---- The worker reads what it already holds -------------------------------------------------------------------------

function loadRuntime({ tab, cookies = [], loaded = new Map(), headers = null, setCookies = null }) {
  const context = vm.createContext({
    console, URL,
    Constants: { COOKIE_VALUE_MAX_LENGTH: 100 },
    Utils: { isValidContentScriptTab: (t) => !!t && !!t.url && !/^(chrome|chrome-extension|about|file):/.test(t.url) },
    RuleTestRuntime: { resolveTab: async () => tab },
    PageCookies: { getAll: async () => cookies },
    AdvancedScriptAnalysis: { loadedUrls: async () => loaded },
    headersStore: new Map(headers ? [[tab && tab.id, headers]] : []),
    responseCookiesStore: new Map(setCookies ? [[tab && tab.id, setCookies]] : []),
    capturedForHost: (captured, host) => new URL(captured.url).hostname === host
  });
  vm.runInContext(read('background/rule-suggest.js'), context);
  return vm.runInContext('RuleSuggestRuntime', context);
}

test('the worker answers with the cookies, loaded scripts and the document headers captured for this host', async () => {
  const tab = { id: 3, url: 'https://shop.example.com/' };
  const runtime = loadRuntime({
    tab,
    cookies: [{ name: 'a', value: 'x'.repeat(300) }, { name: 'a', value: 'dup' }],
    loaded: new Map([['https://cdn.v.io/s.js', 'script'], ['https://api.v.io/x', 'fetch']]),
    headers: { url: 'https://shop.example.com/', headers: { 'x-v': '1' } },
    setCookies: { url: 'https://shop.example.com/', cookies: [{ name: 'b', value: '2' }] }
  });
  const reply = plain(await runtime.collect({ tabId: 3 }));
  assert.equal(reply.status, 'ok');
  assert.equal(reply.host, 'shop.example.com');
  assert.deepEqual(reply.cookies.map(c => c.name), ['a', 'b']);
  assert.equal(reply.cookies[0].value.length, 100);
  assert.deepEqual(reply.scripts, ['https://cdn.v.io/s.js']);
  assert.deepEqual(reply.headers, { 'x-v': '1' });

  const elsewhere = loadRuntime({ tab, headers: { url: 'https://other.example.com/', headers: { 'x-v': '1' } } });
  assert.deepEqual(plain((await elsewhere.collect({})).headers), {}, 'headers of another page are not this page\'s');
});

test('the worker refuses pages it cannot read', async () => {
  for (const tab of [null, { id: 1, url: 'chrome://settings/' }, { id: 1, url: 'chrome-extension://x/popup.html' }, { id: 1, url: 'ftp://x/' }]) {
    assert.equal((await loadRuntime({ tab }).collect({})).status, 'unsupported');
  }
});
