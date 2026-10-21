'use strict';
// Rules → editor → Test on this page: which patterns a live page can answer (modules/core/rule-test.js) and the worker that
// runs the rule against the page the content script hands back (background/rule-test.js), with the real matching engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

globalThis.Constants = Object.assign(globalThis.Constants || {}, { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, COOKIE_VALUE_MAX_LENGTH: 100, DEFAULT_MATCH_CONFIDENCE: 50, DEFAULT_DOM_CONFIDENCE: 50 });
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, error() {}, detection() {}, cache() {}, get debugMode() { return false; } };
Object.assign(globalThis, require(path.join(root, 'utils/pattern-cache.js')));
require(path.join(root, 'modules/core/bridge-protocol.js'));
for (const f of ['analysis', 'extractors', 'matching', 'hooks']) Object.assign(globalThis, require(path.join(root, `modules/detection/engine/detection-engine-${f}.js`)));
globalThis.DetectionCombinations = require(path.join(root, 'modules/detection/detection-combinations.js'));
if (typeof globalThis.DetectionEngineManager !== 'function') {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\n;globalThis.DetectionEngineManager = DetectionEngineManager;');
}
const RuleTest = require('../modules/core/rule-test.js');
globalThis.RuleTest = RuleTest;
globalThis.WorkerMessages = require('../modules/core/worker-messages.js');
const RuleTestRuntime = require('../background/rule-test.js');

// ---- the pure part ------------------------------------------------------------------------------------

const RULE = {
  id: 'my-rule', name: 'My rule', category: 'antibot',
  detection: {
    cookie: [{ name: 'sid', confidence: 60, description: 'session' }, { name: 'nothere', confidence: 40 }],
    url: [{ text: 'cdn.vendor.example/bot.js', confidence: 70 }],
    content: [{ text: '__bot', confidence: 50 }],
    dom: [{ selector: 'div#challenge', confidence: 80 }],
    header: [{ name: 'x-vendor', confidence: 90 }],
    window: [{ path: 'vendorKey', condition: 'typeof string', confidence: 60 }],
    js_hooks: [{ target: 'HTMLCanvasElement.prototype.toDataURL', confidence: 20 }],
    payload: [{ text: 'sensor', confidence: 30 }]
  }
};

test('patterns(): every pattern with something to match, in the editor\'s order, saying whether a live page can answer it', () => {
  const rows = RuleTest.patterns({ ...RULE.detection, cookie: [...RULE.detection.cookie, { name: '  ' }, null, 'x'] });
  assert.deepEqual(rows.map(r => `${r.method}:${r.index}:${r.testable}`), [
    'cookie:0:true', 'cookie:1:true', 'header:0:false', 'url:0:true', 'content:0:true', 'payload:0:false', 'dom:0:true', 'js_hooks:0:false', 'window:0:false'
  ]);
  assert.equal(rows[0].label, 'sid');
  assert.equal(rows[0].description, 'session');
  assert.deepEqual(RuleTest.patterns(null), []);
  assert.deepEqual(RuleTest.patterns({ cookie: 'nope' }), []);
});

test('probes(): one single-pattern rule per testable pattern, with that pattern only and no combinations', () => {
  const probes = RuleTest.probes({ ...RULE, combinations: [{ id: 'c', when: { all: [] } }] });
  assert.deepEqual(probes.map(p => `${p.method}:${p.index}`), ['cookie:0', 'cookie:1', 'url:0', 'content:0', 'dom:0']);
  for (const { method, index, probe } of probes) {
    assert.deepEqual(Object.keys(probe.detection), [method]);
    assert.deepEqual(probe.detection[method], [RULE.detection[method][index]]);
    assert.equal(probe.combinations, undefined);
    assert.equal(probe.category, 'antibot');
  }
});

test('answer(): counts per pattern, the verdict, and the kinds of pattern that need a real scan', () => {
  const reply = RuleTest.answer(RULE, [{ method: 'cookie', index: 0, count: 1 }, { method: 'content', index: 0, count: 3 }], { confidence: 61.4, partial: false, combinations: [{ id: 'c1', name: 'both', confidence: 80.2 }, null] });
  assert.deepEqual(reply.untested.sort(), ['header', 'js_hooks', 'payload', 'window']);
  const row = (m, i) => reply.rows.find(r => r.method === m && r.index === i);
  assert.deepEqual([row('cookie', 0).count, row('cookie', 1).count, row('content', 0).count, row('url', 0).count], [1, 0, 3, 0]);
  assert.deepEqual([row('header', 0).tested, row('window', 0).tested, row('cookie', 0).tested], [false, false, true]);
  assert.equal(row('header', 0).count, 0);
  assert.deepEqual(plain(reply.verdict), { confidence: 61, partial: false, combinations: [{ id: 'c1', name: 'both', confidence: 80 }] });
  assert.deepEqual(plain(RuleTest.answer({}, [], null).verdict), { confidence: 0, partial: false, combinations: [] });
});

// ---- the worker ---------------------------------------------------------------------------------------

const PAGE = {
  url: 'https://shop.example/cart',
  content: [{ type: 'external', src: 'https://cdn.vendor.example/bot.js', content: 'https://cdn.vendor.example/bot.js' }, { type: 'inline', src: null, content: 'window.__bot = { key: "abc" };' }],
  dom: [{ selector: 'div', id: 'challenge', class: 'box', attributes: {} }],
  cookies: [{ name: 'sid', value: 'abc', domain: 'shop.example' }],
  pageHTML: '<html><body><div id="challenge" class="box"></div><script>window.__bot = { key: "abc" };</script></body></html>'
};

function world({ data = PAGE, status = 'ok', tab = { id: 7, url: 'https://shop.example/cart' }, requests, hang = false } = {}) {
  const sent = [];
  globalThis.networkUrlsStore = new Map(requests ? [[7, requests]] : []);
  globalThis.Utils = { isValidContentScriptTab: (t) => !!t && /^https?:/.test(String(t.url)) };
  globalThis.PageCookies = { getAll: async () => [{ name: 'sid', value: 'abc', domain: 'shop.example', httpOnly: true }, { name: 'other', value: 'x' }] };
  globalThis.chrome = { tabs: {
    get: async (id) => (tab && tab.id === id ? tab : Promise.reject(new Error('No tab'))),
    query: async () => (tab ? [tab] : []),
    sendMessage: (id, message) => { sent.push({ id, message }); return hang ? new Promise(() => {}) : Promise.resolve(status === 'throw' ? Promise.reject(new Error('Receiving end does not exist')) : { status, data }); }
  } };
  return { sent };
}

test('cleanRule(): only data survives, an oversized or non-rule request is refused', () => {
  assert.equal(RuleTestRuntime.cleanRule(null), null);
  assert.equal(RuleTestRuntime.cleanRule({ detection: [] }), null);
  assert.equal(RuleTestRuntime.cleanRule({ detection: { content: [{ text: 'x'.repeat(RuleTestRuntime.MAX_RULE_BYTES) }] } }), null);
  const rule = RuleTestRuntime.cleanRule({ id: 7, name: 'N', category: 'captcha', detection: { cookie: [{ name: 'a' }] }, evil: () => 1, __proto__: { polluted: true } });
  assert.deepEqual(plain(rule), { id: '7', name: 'N', category: 'captcha', detection: { cookie: [{ name: 'a' }] }, enabled: true });
  assert.equal(RuleTestRuntime.cleanRule({ detection: {} }).id, 'rule-test');
});

test('a rule is run against the collected page: each pattern on its own, then the whole rule, and nothing else is touched', async () => {
  const w = world({ requests: ['https://cdn.vendor.example/bot.js?v=2', 'https://shop.example/api'] });
  const reply = plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 }));
  assert.equal(reply.status, 'ok');
  assert.equal(reply.host, 'shop.example');
  const count = (m, i) => reply.rows.find(r => r.method === m && r.index === i).count;
  assert.equal(count('cookie', 0), 1, 'the cookie Chrome holds (also HttpOnly ones)');
  assert.equal(count('cookie', 1), 0);
  assert.equal(count('url', 0), 1, 'a request the page made');
  assert.equal(count('content', 0), 1, 'the page\'s own source (a script)');
  assert.equal(count('dom', 0), 1);
  assert.deepEqual(reply.untested.sort(), ['header', 'js_hooks', 'payload', 'window']);
  assert.ok(reply.verdict.confidence > 0, 'the rule matches the page');
  assert.deepEqual(reply.page, { scripts: 2, elements: 1, cookies: 2, requests: 2 });
  // The content script was asked for this tab's page, with the rule, nothing else
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].id, 7);
  assert.equal(w.sent[0].message.type, 'RULE_TEST_COLLECT');
  assert.equal(w.sent[0].message.detector.id, 'my-rule');
  assert.ok(!JSON.stringify(reply).includes('abc'), 'a cookie value or script text is never in the reply');
});

test('a rule with combinations says which of them fire', async () => {
  world();
  const rule = { ...RULE, combinations: [
    { id: 'c-both', name: 'cookie and dom', when: { all: [{ pattern: 'cookie-1' }, { pattern: 'dom-1' }] } },
    { id: 'c-miss', name: 'needs the missing cookie', when: { all: [{ pattern: 'cookie-2' }, { pattern: 'dom-1' }] } }
  ] };
  const reply = plain(await RuleTestRuntime.run({ detector: rule, tabId: 7 }));
  assert.equal(reply.status, 'ok');
  const fired = reply.verdict.combinations.map(c => c.id);
  assert.ok(fired.includes('c-both'), JSON.stringify(reply.verdict));
  assert.ok(!fired.includes('c-miss'));
});

test('a page that matches nothing is an answer of zero, never an error', async () => {
  world({ data: { url: 'https://shop.example/cart', content: [], dom: [], cookies: [], pageHTML: '' } });
  const reply = plain(await RuleTestRuntime.run({ detector: { ...RULE, detection: { cookie: [{ name: 'sid', confidence: 60 }], content: [{ text: '__bot', confidence: 50 }] } }, tabId: 7 }));
  assert.equal(reply.status, 'ok');
  assert.deepEqual(reply.rows.map(r => r.count), [1, 0], 'the HttpOnly cookie Chrome holds still counts, the script text is not on this page');
  assert.deepEqual(reply.untested, []);
});

test('a tab that is not a web page, a page that does not answer and a bad request each get their own status', async () => {
  world({ tab: { id: 7, url: 'chrome://extensions' } });
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 })), { status: 'unsupported' });
  world({ tab: { id: 7, url: 'chrome-extension://abc/popup.html' } });
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 })), { status: 'unsupported' });
  world({ tab: null });
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE })), { status: 'unsupported' });
  world({ status: 'throw' });
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 })), { status: 'unreachable' });
  world({ status: 'unavailable' });
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 })), { status: 'unreachable' });
  world();
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: 'nope' })), { status: 'error' });
});

test('a page that never answers gives up after the timeout', async () => {
  world({ hang: true });
  const original = RuleTestRuntime.COLLECT_TIMEOUT_MS;
  RuleTestRuntime.COLLECT_TIMEOUT_MS = 30;
  try {
    assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: 7 })), { status: 'unreachable' });
  } finally { RuleTestRuntime.COLLECT_TIMEOUT_MS = original; }
});

test('the handler answers extension pages only, and the worker and the popup both know the module', () => {
  const handler = fs.readFileSync(path.join(root, 'background/handlers/messages-detection.js'), 'utf8');
  const at = handler.indexOf('registry[WorkerMessages.RULE_TEST]');
  assert.ok(at > 0 && handler.slice(at, at + 400).includes('MessageSender.isExtensionPage(sender)'));
  const worker = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.ok(worker.indexOf('modules/core/rule-test.js') > 0 && worker.indexOf('background/rule-test.js') > 0);
  const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.ok(popup.indexOf('modules/core/rule-test.js') > 0 && popup.indexOf('modules/core/rule-test.js') < popup.indexOf('rules-live-test-ui.js'));
});

test('a tab id Chrome refuses is "not a web page", not a failure', async () => {
  world();
  globalThis.chrome.tabs.get = () => { throw new Error('Invalid value for argument 1'); };
  assert.deepEqual(plain(await RuleTestRuntime.run({ detector: RULE, tabId: -1 })), { status: 'unsupported' });
});
