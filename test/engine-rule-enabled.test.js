const { test } = require('node:test');
const assert = require('node:assert/strict');
const { element, documentOf } = require('./helpers/fake-dom.js');
const { engineContext, plain } = require('./helpers/engine-context.js');

// A rule's own `enabled: false` (an imported rule file can carry it; the schema admits it) is honoured for JS hooks and for
// response capture. Cookie, header, URL, content, DOM and payload matching and the window checks ignored it, so a rule that was
// switched off still matched and still scored. Every method skips it now; the collection leaves it out too.

const { Engine, context, run } = engineContext({
  NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 }
});

const PAGE = {
  url: 'https://site.test/path?x=1',
  cookies: [{ name: 'probe_cookie', value: 'v' }], allCookies: [{ name: 'probe_cookie', value: 'v' }], responseCookies: [],
  headers: { 'x-probe': 'yes' }, requestHeaders: {},
  content: [{ type: 'inline', src: null, content: 'window.probeMarker = 1;' }],
  pageHTML: '<p>probe-page-marker</p>',
  dom: [{ selector: 'div', id: 'probe', class: 'probe-box', attributes: { id: 'probe', class: 'probe-box' } }],
  payloads: [{ url: 'https://site.test/api', method: 'POST', type: 'raw', data: 'payload-probe-marker' }],
  responses: [{ url: 'https://site.test/api/answer', method: 'GET', status: 200, data: '{"response-probe":true}' }]
};

// One rule per method, each matching PAGE on its own
const RULES = {
  cookie: { name: 'probe_cookie' },
  header: { name: 'x-probe' },
  url: { text: 'site.test/path' },
  content: { text: 'probeMarker', scope: 'scripts' },
  'content (page text)': { method: 'content', text: 'probe-page-marker' },
  dom: { selector: 'div.probe-box' },
  payload: { text: 'payload-probe-marker' },
  'payload (response body)': { method: 'payload', text: 'response-probe', body: 'response', urlPattern: '/api/answer' }
};

function detectorWith(method, rules) {
  return { id: 'detect-enabled', name: 'Enabled', enabled: true, category: 'Anti-Bot', detection: { [method]: rules } };
}
function match(method, rules) {
  const detector = detectorWith(method, rules);
  const engine = new Engine();
  engine.setDetectors({ antibot: { [detector.id]: detector } });
  return plain(engine.runDetector(detector, PAGE));
}

for (const [label, { method = label, ...rule }] of Object.entries(RULES)) {
  test(`${label}: the rule matches the page while it is on`, () => {
    for (const on of [{}, { enabled: true }]) {
      const result = match(method, [{ id: 'r1', confidence: 70, ...rule, ...on }]);
      assert.equal(result.detected, true, JSON.stringify(on));
      assert.equal(result.matches.length, 1);
    }
  });

  test(`${label}: a rule switched off with enabled: false matches nothing and scores nothing`, () => {
    const result = match(method, [{ id: 'r1', confidence: 70, ...rule, enabled: false }]);
    assert.equal(result.matches.length, 0);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, 0);
  });

  test(`${label}: of two rules only the one that is on is read`, () => {
    const result = match(method, [{ id: 'off', confidence: 99, ...rule, enabled: false }, { id: 'on', confidence: 55, ...rule }]);
    assert.deepEqual(result.matches.map(found => found.confidence), [55]);
    assert.equal(result.confidence, 55);
  });
}

test('a combination cannot be completed by a rule that is off', () => {
  const detector = {
    ...detectorWith('cookie', [{ id: 'c-off', name: 'probe_cookie', confidence: 40, enabled: false }, { id: 'c-on', name: 'other_cookie', confidence: 40 }]),
    combinations: [{ id: 'needs-off', name: 'Needs the rule that is off', confidence: 95, when: { pattern: 'c-off' } }]
  };
  const engine = new Engine();
  engine.setDetectors({ antibot: { [detector.id]: detector } });
  const result = plain(engine.runDetector(detector, PAGE));
  assert.equal(result.detected, false);
  assert.ok(!result.combinations);
});

// ---- The window checks the install event sends to the page's world

async function installed(detectors, store = {}) {
  const events = [];
  const chrome = { storage: { local: { async get() { return { scrapfly_detectors: { detectors }, ...store }; } } } };
  await Engine.installHooksOrchestrator({ location: { hostname: 'site.test', href: 'https://site.test/' }, dispatchEvent(event) { events.push(event); } }, chrome);
  assert.equal(events.length, 1);
  return plain(events[0].detail);
}

test('window: a check switched off with enabled: false is not sent to the page, one that is on is', async () => {
  const detector = { id: 'detect-window', name: 'Window', enabled: true, detection: { window: [
    { id: 'w-off', path: 'probeOff', confidence: 60, enabled: false },
    { id: 'w-on', path: 'probeOn', confidence: 50 },
    { id: 'w-true', path: 'probeTrue', confidence: 40, enabled: true }
  ] } };
  const detail = await installed({ fingerprint: { 'detect-window': detector } });
  assert.deepEqual(detail.windowProperties.map(property => property.path), ['probeOn', 'probeTrue']);
});

test('js hooks: a hook switched off is still left out (unchanged)', async () => {
  const detector = { id: 'detect-hooks', name: 'Hooks', enabled: true, detection: { js_hooks: [
    { id: 'h-off', target: 'HTMLCanvasElement.prototype.toDataURL', enabled: false }, { id: 'h-on', target: 'HTMLCanvasElement.prototype.toBlob' }
  ] } };
  const detail = await installed({ fingerprint: { 'detect-hooks': detector } });
  assert.deepEqual(detail.hookDefinitions[0].hooks.map(hook => hook.target), ['HTMLCanvasElement.prototype.toBlob']);
});

// ---- What a collection gathers

test('the DOM walk records nothing for a selector whose rule is off', () => {
  const page = documentOf({ body: [element('span', { 'data-probe-off': '1' }), element('i', { 'data-probe-on': '1' })] });
  context.document = page;
  context.configured = { antibot: { d: { id: 'd', enabled: true, detection: { dom: [
    { id: 'off', selector: 'span[data-probe-off]', enabled: false }, { id: 'on', selector: 'i[data-probe-on]' }
  ] } } } };
  const records = plain(run('demExtractDOM.call({ getElementAttributes: demGetElementAttributes, detectors: configured })'));
  assert.deepEqual(records.map(record => record.selector), ['i']);
});

test('what a scan collects follows the rules that are on', () => {
  const methods = (detection) => {
    const engine = new Engine();
    engine.setDetectors({ antibot: { d: { id: 'd', enabled: true, detection } } });
    return plain(engine.analyzeUsedMethods());
  };
  const off = { enabled: false };
  assert.equal(methods({ cookie: [{ name: 'a', ...off }] }).cookie, false, 'its only cookie rule is off');
  assert.equal(methods({ cookie: [{ name: 'a', ...off }, { name: 'b' }] }).cookie, true);
  assert.equal(methods({ dom: [{ selector: 'a', ...off }] }).dom, false);
  assert.equal(methods({ dom: [{ selector: 'a', ...off }, { selector: 'b' }] }).dom, true);
  assert.equal(methods({ content: [{ text: 'a', ...off }] }).content, false);
  assert.equal(methods({ content: [{ text: 'a', ...off }, { text: 'b' }] }).content, true);
});
