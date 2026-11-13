const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { engineContext, plain, root } = require('./helpers/engine-context.js');

// 3.1.9: the F5, Sucuri and Radware block-page rules read the block page's own text. They were limited to scripts, and a block
// page is plain HTML (a title, a heading, a table), so the text they look for was never collected and never matched. A content
// rule scoped to "page" reads the HTML of a small document (documentElement.outerHTML, head and title included, cut at
// PAGE_SOURCE_MAX_CHARS) and only when it has fewer than PAGE_SOURCE_MAX_ELEMENTS elements, so an ordinary page collects and
// sends nothing for it. Nothing else changes: no body text, no stylesheet is fetched for such a rule.

const FIXTURES = path.join(__dirname, 'fixtures', 'block-pages');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, `${name}.html`), 'utf8');
const shipped = (id) => JSON.parse(fs.readFileSync(path.join(root, 'detectors', 'antibot', `${id}.json`), 'utf8'));

const detectorsWith = (detection, extra = {}) => ({ antibot: { 'detect-x': { id: 'detect-x', name: 'X', enabled: true, detection, ...extra } } });
const PAGE_RULE = { id: 'page-rule', text: 'Access Denied', scope: 'page', confidence: 50 };
const SCRIPTS_RULE = { id: 'scripts-rule', text: 'maxTouchPoints', scope: 'scripts', confidence: 10 };

/** A document of `elements` elements whose HTML is `html`; counts what the engine reads of it. */
function setup(detectors, { elements = 40, html = '<html><head><title>T</title></head><body><p>x</p></body></html>' } = {}) {
  const reads = { outerHTML: 0, innerHTML: 0, nextNode: 0 };
  const fetched = [];
  const documentElement = { get outerHTML() { reads.outerHTML++; return html; } };
  const doc = {
    title: 'T', documentElement,
    get cookie() { return ''; },
    body: { get innerHTML() { reads.innerHTML++; return html; } },
    querySelectorAll: (selector) => {
      if (selector === 'link[rel="stylesheet"]') return [{ href: 'https://cdn.test/site.css' }];
      return [];
    },
    createTreeWalker(rootNode, show) {
      assert.equal(rootNode, documentElement, 'the walk starts at the root element');
      assert.equal(show, 1, 'elements only');
      let left = elements - 1; // the root is not returned by the walker
      return { nextNode() { reads.nextNode++; if (left <= 0) return null; left--; return {}; } };
    }
  };
  const { Engine, context } = engineContext({
    document: doc, window: { location: { href: 'https://site.test/', hostname: 'site.test' } },
    chrome: { storage: { local: { get: (keys, callback) => callback({}) } } },
    NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    AbortSignal: { timeout: () => undefined },
    async fetch(address) {
      fetched.push(address);
      return { ok: true, headers: { get: () => 'text/css' }, async text() { return ''; } };
    }
  });
  const engine = new Engine();
  if (detectors) engine.setDetectors(detectors);
  return { engine, reads, fetched, Engine, context };
}

// ---- Who asks for a small page's HTML

test('needsPageSource: only a content rule that is on and scoped to "page"; such a rule reads no body text, stylesheet or script', () => {
  const engineOf = (detection, extra) => setup(detectorsWith(detection, extra)).engine;
  assert.equal(engineOf({ content: [PAGE_RULE] }).needsPageSource(), true);
  assert.equal(engineOf({ content: [SCRIPTS_RULE] }).needsPageSource(), false);
  assert.equal(engineOf({ content: [{ text: 'a' }] }).needsPageSource(), false, 'a "Page content" rule reads the body text instead');
  assert.equal(engineOf({ content: [{ ...PAGE_RULE, checkScripts: true }] }).needsPageSource(), false, 'limited to scripts wins');
  assert.equal(engineOf({ content: [{ ...PAGE_RULE, enabled: false }] }).needsPageSource(), false, 'a rule that is off');
  assert.equal(engineOf({ content: [PAGE_RULE] }, { enabled: false }).needsPageSource(), false, 'a detector that is off');
  const onlyPage = engineOf({ content: [PAGE_RULE] });
  assert.equal(onlyPage.needsPageBodies(), false, 'no body text, no stylesheet text');
  assert.equal(onlyPage.needsExternalContent(), false, 'no script is fetched for it');
  assert.equal(engineOf({ content: [PAGE_RULE, SCRIPTS_RULE] }).needsExternalContent(), true, 'a script rule beside it still fetches scripts');
});

test('the shipped rules ask for a small page\'s HTML and still never for the body text or the stylesheets', () => {
  const detectors = { antibot: Object.fromEntries(['detect-f5', 'detect-sucuri', 'detect-radware'].map(id => [id, shipped(id)])) };
  const { engine } = setup(detectors);
  assert.equal(engine.needsPageSource(), true);
  assert.equal(engine.needsPageBodies(), false);
});

// ---- What is collected

test('a small page: its whole HTML, head and title included, read once and only when asked; nothing else is read for it', async () => {
  const html = fixture('sucuri');
  const { engine, reads, fetched } = setup(detectorsWith({ content: [PAGE_RULE] }), { elements: 60, html });
  const data = await engine.collectPageData();
  assert.ok('pageSource' in data);
  assert.equal(reads.outerHTML, 0, 'not until it is read');
  assert.equal(data.pageSource, html);
  assert.equal(data.pageSource, html);
  assert.equal(reads.outerHTML, 1);
  assert.equal(reads.innerHTML, 0, 'the body text is not read');
  assert.ok(!('pageHTML' in data));
  assert.deepEqual(fetched, [], 'no stylesheet or script is fetched');
});

test('a large page: nothing is serialised, the count stops at the limit, and the scan carries an empty text', async () => {
  const { engine, reads, Engine } = setup(detectorsWith({ content: [PAGE_RULE] }), { elements: 30000, html: '<html>Access Denied</html>' });
  assert.equal(Engine.PAGE_SOURCE_MAX_ELEMENTS, 300);
  const data = await engine.collectPageData();
  assert.equal(data.pageSource, '');
  assert.equal(reads.outerHTML, 0, 'never serialised');
  assert.ok(reads.nextNode <= Engine.PAGE_SOURCE_MAX_ELEMENTS, `walked ${reads.nextNode} elements, not the whole page`);
  const results = await engine.detectOnPage({ url: data.url, pageSource: data.pageSource });
  assert.equal(results.length, 0);
});

test('the limit: 299 elements are a small page, 300 are not', async () => {
  for (const [elements, expected] of [[299, '<html>x</html>'], [300, '']]) {
    const { engine } = setup(detectorsWith({ content: [PAGE_RULE] }), { elements, html: '<html>x</html>' });
    assert.equal((await engine.collectPageData()).pageSource, expected, `${elements} elements`);
  }
});

test('a small page with a long inline script is cut at PAGE_SOURCE_MAX_CHARS', async () => {
  const { engine, Engine } = setup(detectorsWith({ content: [PAGE_RULE] }), { html: `<html><head><title>Blocked</title></head><script>${'x'.repeat(200000)}</script></html>` });
  const source = (await engine.collectPageData()).pageSource;
  assert.equal(Engine.PAGE_SOURCE_MAX_CHARS, 50000);
  assert.equal(source.length, 50000);
  assert.ok(source.startsWith('<html><head><title>Blocked</title>'));
});

test('no rule scoped to "page": the page is neither counted nor read, and the message has no such field', async () => {
  const { engine, reads } = setup(detectorsWith({ content: [SCRIPTS_RULE] }));
  const data = await engine.collectPageData();
  assert.ok(!('pageSource' in data));
  assert.equal(plain(data).pageSource, undefined);
  assert.deepEqual({ ...reads }, { outerHTML: 0, innerHTML: 0, nextNode: 0 });
});

test('the page data sent to the worker, and the page a rule test reads, carry the small page\'s HTML', () => {
  const utils = fs.readFileSync(path.join(root, 'utils', 'utils.js'), 'utf8');
  assert.match(utils, /pageSource: pageData\.pageSource,/);
  const ruleTest = fs.readFileSync(path.join(root, 'background', 'rule-test.js'), 'utf8');
  assert.match(ruleTest, /pageSource: typeof data\.pageSource === 'string' \? data\.pageSource : ''/);
});

// ---- Matching

test('a "page" rule matches the small page\'s HTML only: not the body text, not a script, not a stylesheet', () => {
  const { engine } = setup(null);
  const detector = { id: 'detect-x', name: 'X', enabled: true, detection: { content: [PAGE_RULE] } };
  const run = (data) => plain(engine.runDetector(detector, { url: 'https://site.test/', ...data }).matches);
  const [match] = run({ pageSource: '<title>Access Denied</title>' });
  assert.equal(match.pattern, 'Access Denied');
  assert.equal(match.foundIn, 'page content');
  assert.equal(run({ pageHTML: '<p>Access Denied</p>' }).length, 0);
  assert.equal(run({ content: [{ content: 'var s = "Access Denied";' }] }).length, 0);
  assert.equal(run({ externalContent: [{ url: 'https://cdn.test/a.css', type: 'css', content: '/* Access Denied */' }] }).length, 0);
  assert.equal(run({ pageSource: null }).length, 0, 'anything but a text is none');
});

test('a rule limited to scripts never reads the small page\'s HTML, and one that says both is limited to scripts', () => {
  const { engine } = setup(null);
  const run = (rule) => plain(engine.runDetector({ id: 'detect-x', name: 'X', enabled: true, detection: { content: [rule] } },
    { url: 'https://site.test/', pageSource: '<script>navigator.maxTouchPoints</script>' }).matches);
  assert.equal(run(SCRIPTS_RULE).length, 0);
  assert.equal(run({ ...PAGE_RULE, text: 'maxTouchPoints', checkScripts: true }).length, 0);
  assert.equal(run({ ...PAGE_RULE, text: 'maxTouchPoints' }).length, 1);
});

// ---- The shipped block-page rules on realistic block pages

const matchIds = (result) => [...new Set(result.matches.map(m => `${m.type}:${m.patternId}`))].sort();
const comboIds = (result) => (result.combinations || []).map(c => c.id).sort();
async function scan(id, data) {
  const { engine } = setup({ antibot: { [id]: shipped(id) } });
  const results = plain(await engine.detectOnPage({ url: 'https://shop.example/', ...data }, { includePartial: true }));
  return results.find(r => r.detector.id === id) || null;
}
const TS_COOKIE = { name: 'TS01a2b3c4', value: `01${'9f'.repeat(30)}` };

test('F5 BIG-IP ASM: the block page\'s support ID is found, and with the ASM cookie it is the block page at 100%', async () => {
  const result = await scan('detect-f5', { pageSource: fixture('f5'), allCookies: [TS_COOKIE] });
  assert.ok(result, 'detected');
  assert.deepEqual(matchIds(result), ['content:asm-support-id', 'cookie:ts-asm-cookie', 'cookie:ts-legacy-cookie'], 'the legacy rule matches TS01 names too');
  assert.ok(comboIds(result).includes('f5-asm-block'), comboIds(result).join(', '));
  assert.equal(result.confidence, 100);
});

test('Sucuri: the block page\'s title and Block ID are found, and with its headers it is the block page at 100%', async () => {
  const result = await scan('detect-sucuri', { pageSource: fixture('sucuri'), headers: { 'x-sucuri-id': '14013', 'x-sucuri-block': 'BNP005', server: 'Sucuri/Cloudproxy' } });
  assert.ok(result, 'detected');
  assert.ok(matchIds(result).includes('content:sucuri-block-title'));
  assert.ok(matchIds(result).includes('content:sucuri-block-id'));
  assert.ok(comboIds(result).includes('sucuri-block-page'), comboIds(result).join(', '));
  assert.equal(result.confidence, 100);
});

test('Sucuri: the title as older and newer block pages write it, and the heading, all match', async () => {
  const rule = shipped('detect-sucuri').detection.content.find(r => r.id === 'sucuri-block-title');
  const { engine } = setup(null);
  const run = (source) => engine.runDetector({ id: 'detect-sucuri', name: 'S', enabled: true, detection: { content: [rule] } }, { pageSource: source }).matches.length;
  for (const source of ['<title>Sucuri WebSite Firewall - Access Denied</title>', '<title>Sucuri WebSite Firewall - CloudProxy - Access Denied</title>',
    '<title>Sucuri Website Firewall - Access Denied</title>', '<h1>Access Denied - Sucuri Website Firewall</h1>']) {
    assert.equal(run(source), 1, source);
  }
  assert.equal(run('<title>Sucuri Website Firewall review</title>'), 0);
});

test('Radware: the block message and the CloudWebSec contact address are found; with its header it is the complete profile', async () => {
  const pageOnly = await scan('detect-radware', { pageSource: fixture('radware') });
  assert.ok(pageOnly, 'detected from the page alone');
  assert.deepEqual(matchIds(pageOnly), ['content:radware-block-message', 'content:radware-cloudwebsec-reference']);
  assert.deepEqual(comboIds(pageOnly), ['radware-block-page']);
  assert.equal(pageOnly.confidence, 70);
  const withHeader = await scan('detect-radware', { pageSource: fixture('radware'), headers: { 'x-sl-compstate': 'Disabled' } });
  assert.ok(comboIds(withHeader).includes('radware-complete-profile'), comboIds(withHeader).join(', '));
  assert.equal(withHeader.confidence, 90);
});

test('the block-page text on an ordinary large page is not collected, so none of the three is named from it', async () => {
  const detectors = { antibot: Object.fromEntries(['detect-f5', 'detect-sucuri', 'detect-radware'].map(id => [id, shipped(id)])) };
  // An article about firewalls that quotes every block page, in a page of a few thousand elements
  const article = `<html><head><title>How WAF block pages look</title></head><body>${['f5', 'sucuri', 'radware'].map(fixture).join('')}${'<p>more</p>'.repeat(3000)}</body></html>`;
  const { engine, reads } = setup(detectors, { elements: 3200, html: article });
  const data = await engine.collectPageData();
  assert.equal(data.pageSource, '');
  assert.equal(reads.outerHTML, 0);
  assert.equal(reads.innerHTML, 0);
  const results = plain(await engine.detectOnPage({ url: data.url, pageSource: data.pageSource, headers: {} }, { includePartial: true }));
  assert.deepEqual(results.map(r => r.detector.id), []);
});

test('the three detectors need this build: older ones skip them (Rules → Update)', () => {
  for (const id of ['detect-f5', 'detect-sucuri', 'detect-radware']) {
    const detector = shipped(id);
    assert.equal(detector.minExtensionVersion, '3.1.9', id);
    const pageRules = detector.detection.content.filter(rule => rule.scope === 'page');
    assert.ok(pageRules.length >= 1, `${id}: a rule scoped to "page"`);
    for (const rule of pageRules) assert.ok(!rule.checkScripts, `${id}/${rule.id}: not limited to scripts as well`);
  }
});
