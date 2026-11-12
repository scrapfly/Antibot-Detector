const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { element, documentOf } = require('./helpers/fake-dom.js');

// DOM rules read the page as the DOM walk records it. The walk started at the <body> and recorded a script only when it
// had a src, so a <script> in the <head> (where Queue-it's connector, CHEQ's tags, Anubis's challenge module and Ruishu's
// marker are) and an inline script (script[r="m"]) were never seen: five rules could not match on a real page. The walk
// starts at the document element now, and an inline script is recorded with its attributes, never its text.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const detectors = {};
for (const category of ['antibot', 'captcha', 'fingerprint']) {
  detectors[category] = {};
  for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(f => /^detect-.*\.json$/.test(f))) {
    const detector = JSON.parse(read(`detectors/${category}/${file}`));
    detectors[category][detector.id] = detector;
  }
}
const all = Object.values(detectors).flatMap(category => Object.values(category));
const fixtures = {
  ...JSON.parse(read('test/fixtures/antibot-confidence.json')),
  ...JSON.parse(read('test/fixtures/captcha-confidence.json'))
};

const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : () => {} }),
  NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
  setTimeout, clearTimeout
});
context.window = context;
for (const file of ['utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
  vm.runInContext(read(file), context, { filename: file });
}
const Engine = vm.runInContext('DetectionEngineManager', context);

/** What the content script records of a page: demExtractDOM with every detector's DOM rules configured, as in a scan. */
function extract(doc) {
  context.document = doc;
  context.configured = detectors;
  return JSON.parse(vm.runInContext('JSON.stringify(demExtractDOM.call({ getElementAttributes: demGetElementAttributes, detectors: configured }))', context));
}

/** The DOM rules of every detector that match the records, as "detector/rule". */
function domMatches(records) {
  const engine = new Engine();
  engine.setDetectors(detectors);
  const page = { url: 'https://example.test/', dom: records, content: [], headers: {}, allCookies: [], responseCookies: [], networkUrls: [], payloads: [], responses: [] };
  return all.flatMap(detector => engine.runDetector(detector, page).matches
    .filter(match => match.type === 'dom').map(match => `${detector.id}/${match.patternId.split(':').pop()}`)).sort();
}

const witness = (detectorId, patternId) => {
  const fixture = fixtures[detectorId] && fixtures[detectorId][patternId];
  assert.ok(fixture && fixture.dom, `${detectorId}/${patternId} has a DOM witness`);
  return element(fixture.dom.tagName, fixture.dom.attributes);
};
const FIVE = [['detect-anubis', 'anubis-challenge-script'], ['detect-cheq', 'clicktrue-tag'], ['detect-cheq', 'cheq-jsonp-tag'],
  ['detect-queueit', 'queueit-connector-tag'], ['detect-ruishu', 'challenge-script-marker']];

test('the walk starts at the document element, so the head is part of it', () => {
  const doc = documentOf({ head: [element('meta', { name: 'viewport', content: 'width=device-width' })], body: [element('div', { id: 'app' })] });
  extract(doc);
  assert.equal(doc.walkers.length, 1);
  assert.equal(doc.walkers[0].root, doc.documentElement);
});

test('the five script rules that never matched a real page match their own witnesses in the head', () => {
  for (const [detectorId, patternId] of FIVE) {
    const doc = documentOf({ head: [element('title', {}, [], 'x'), witness(detectorId, patternId)], body: [element('div', { id: 'app' })] });
    const found = domMatches(extract(doc)).filter(id => id.startsWith(`${detectorId}/`));
    assert.ok(found.some(id => id.endsWith(patternId)), `${detectorId}/${patternId} in the head: ${JSON.stringify(found)}`);
  }
});

test('a script in the head is recorded with its src and attributes, as a script in the body always was', () => {
  const src = 'https://static.queue-it.net/script/queueclient.min.js';
  const head = extract(documentOf({ head: [element('script', { src, 'data-queueit-c': 'customer' })] }));
  const body = extract(documentOf({ body: [element('script', { src, 'data-queueit-c': 'customer' })] }));
  const expected = [{ selector: 'script', src, attributes: { src, 'data-queueit-c': 'customer' } }];
  assert.deepEqual(body, expected, 'the body as before');
  assert.deepEqual(head, expected, 'the head the same');
});

test('an inline script keeps its attributes but never its text, and one with no attribute is not recorded', () => {
  const secret = "var session = 'TOKEN-ABC-123';";
  const records = extract(documentOf({
    head: [
      element('script', { r: 'm', type: 'text/javascript' }, [], secret),
      element('script', { type: 'application/ld+json' }, [], '{"@type":"Organization"}'),
      element('script', {}, [], "window.dataLayer = [];")
    ],
    body: [element('script', { id: 'boot', 'data-queueit-c': 'inline' }, [], secret)]
  }));
  assert.deepEqual(records, [
    { selector: 'script', attributes: { type: 'text/javascript', r: 'm' } },
    { selector: 'script', attributes: { type: 'application/ld+json' } },
    { selector: 'script', attributes: { id: 'boot', 'data-queueit-c': 'inline' } }
  ]);
  assert.ok(!JSON.stringify(records).includes('TOKEN-ABC'), 'the script text is not collected');
  assert.ok(domMatches(records).includes('detect-ruishu/challenge-script-marker'), 'script[r="m"] matches an inline script');
  assert.ok(domMatches(records).includes('detect-queueit/queueit-connector-tag'), 'and script[data-queueit-c] one in the body');
});

test('an ordinary head adds no match to any rule of any detector', () => {
  const doc = documentOf({
    head: [
      element('meta', { charset: 'utf-8' }),
      element('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      element('meta', { name: 'description', content: 'A shop that sells things' }),
      element('meta', { property: 'og:title', content: 'Shop' }),
      element('meta', { name: 'csrf-token', content: 'SECRET-CSRF' }),
      element('title', {}, [], 'Shop'),
      element('base', { href: '/' }),
      element('link', { rel: 'stylesheet', href: '/assets/app.css' }),
      element('link', { rel: 'icon', href: '/favicon.ico' }),
      element('link', { rel: 'canonical', href: 'https://shop.example/' }),
      element('style', {}, [], 'body { margin: 0 }'),
      element('noscript', {}, [], '<style>.nojs { display: block }</style>'),
      element('script', { src: 'https://www.googletagmanager.com/gtag/js?id=G-XXXX', async: '' }),
      element('script', { type: 'module', src: '/assets/app.js' }),
      element('script', { type: 'application/ld+json' }, [], '{"@type":"WebSite"}'),
      element('script', { id: '__NEXT_DATA__', type: 'application/json' }, [], '{"props":{}}'),
      element('script', {}, [], 'window.dataLayer = window.dataLayer || [];')
    ],
    body: [element('div', { id: 'app', class: 'container' }, [element('a', { href: '/cart' })])]
  });
  const records = extract(doc);
  assert.equal(records.filter(record => record.selector === 'meta').length, 4, 'the named meta tags of the head are recorded, as those of the body always were');
  assert.ok(records.some(record => record.selector === 'script' && /googletagmanager/.test(record.src)), 'and its scripts');
  assert.deepEqual(domMatches(records), [], 'but no rule takes any of it for its own');
});

test('every DOM witness of the confidence fixtures is still found when the page carries it in the body', () => {
  let checked = 0;
  for (const detector of all) {
    for (const rule of detector.detection.dom || []) {
      const fixture = fixtures[detector.id] && fixtures[detector.id][rule.id];
      if (!fixture || !fixture.dom) continue;
      const found = domMatches(extract(documentOf({ body: [element('p', {}, [], 'text'), witness(detector.id, rule.id)] })));
      assert.ok(found.includes(`${detector.id}/${rule.id}`), `${detector.id}/${rule.id} in the body: ${JSON.stringify(found)}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 45, `${checked} witnesses checked`);
});

// The walk used to record every <div> (30,000 on a long page: a 4.6 MB message and 0.7 s of DOM matching in the worker).
// Divs now go through the same prefilter as other elements, so the walk keeps a div only when a configured rule could match it.

/** A minimal element for each branch of a rule's selector: its tag (a div when the selector names none) and attributes. */
function elementsFor(selector) {
  const groups = vm.runInContext(`demParseDOMSelector(${JSON.stringify(selector)})`, context);
  assert.ok(groups, `${selector}: a selector the engine reads`);
  return Array.from(groups, group => {
    const attributes = {};
    for (const token of group.tokens) {
      const value = { '': '', '=': token.value, '~=': token.value, '|=': token.value, '^=': `${token.value}x`, '$=': `x${token.value}`, '*=': `x${token.value}x` }[token.operator];
      attributes[token.attribute] = token.attribute === 'class' && attributes.class ? `${attributes.class} ${value}` : value;
    }
    return element(group.tag && group.tag !== '*' ? group.tag : 'div', attributes);
  });
}

test('every enabled DOM rule of every shipped detector still finds a minimal element it names, among plain divs', () => {
  let checked = 0;
  for (const detector of all.filter(detector => detector.enabled !== false)) {
    for (const rule of (detector.detection.dom || []).filter(rule => rule.enabled !== false)) {
      for (const target of elementsFor(rule.selector)) {
        const filler = Array.from({ length: 20 }, (_, index) => element('div', { class: `row row-${index}` }, [element('span', {}, [], 'x')]));
        const records = extract(documentOf({ body: [element('div', { id: 'app' }, [...filler, element('div', {}, [target])])] }));
        const found = domMatches(records);
        assert.ok(found.includes(`${detector.id}/${rule.id}`), `${detector.id}/${rule.id} (${target.tagName.toLowerCase()} for ${rule.selector}): ${JSON.stringify(found)}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 70, `${checked} selector branches checked`);
});

test('a page of plain divs records none of them, and a widget among them still is', () => {
  const rows = Array.from({ length: 500 }, (_, index) => element('div', { class: `card card-${index}`, id: `item-${index}` }, [element('div', {}, [], 'text')]));
  const records = extract(documentOf({ body: [element('div', { id: 'app' }, [...rows, element('div', { class: 'h-captcha', 'data-sitekey': 'key' }),
    element('div', { 'data-callback': 'onDone' })])] }));
  assert.deepEqual(records.filter(record => record.selector === 'div'), [
    { selector: 'div', id: '', class: 'h-captcha', attributes: { class: 'h-captcha', 'data-sitekey': 'key' } },
    { selector: 'div', id: '', class: '', attributes: { 'data-callback': 'onDone' } }
  ]);
  assert.deepEqual(domMatches(records), ['detect-hcaptcha/hcaptcha-configured-widget']);
});
