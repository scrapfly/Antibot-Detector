const { test } = require('node:test');
const assert = require('node:assert/strict');
const { engineContext, plain } = require('./helpers/engine-context.js');

// What a scan ships of the page. Every scan fetched the body of each stylesheet and serialised document.body.innerHTML, and
// sent both to the worker, although all 144 bundled content rules are limited to scripts and read neither. They are gathered
// now only when a content rule that is on is not limited to scripts (a "Page content" rule, the editor's default). The
// stylesheet addresses stay in the list either way: URL rules read them. Disabled detectors no longer count as users of a
// kind of data.

const MB = 1024 * 1024;
const detectorsWith = (detection, extra = {}) => ({ antibot: { 'detect-x': { id: 'detect-x', name: 'X', enabled: true, detection, ...extra } } });
const SCRIPTS_ONLY = [{ text: 'maxTouchPoints', scope: 'scripts' }, { text: 'webdriver', checkScripts: true }];
const PAGE_TEXT = [{ text: 'cf-turnstile' }];

const SCRIPT = 'https://cdn.test/app.js';
const STYLE = 'https://cdn.test/wp-content/plugins/wordfence/css/wf.css';

function setup(detectors, { styles = [STYLE], scripts = [SCRIPT], html = '<p>page text</p>', noBody = false } = {}) {
  const fetched = [];
  const reads = { html: 0 };
  const doc = {
    title: 'Title',
    get cookie() { return ''; },
    body: noBody ? null : { get innerHTML() { reads.html++; return html; } },
    querySelectorAll: (selector) => {
      if (selector === 'script[src]' || selector === 'script') return scripts.map(src => ({ src, type: '' }));
      if (selector === 'link[rel="stylesheet"]') return styles.map(href => ({ href }));
      return [];
    }
  };
  const { Engine, logs } = engineContext({
    document: doc, window: { location: { href: 'https://site.test/', hostname: 'site.test' } },
    chrome: { storage: { local: { get: (keys, callback) => callback({}) } } },
    NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    AbortSignal: { timeout: () => undefined },
    async fetch(address) {
      fetched.push(address);
      return { ok: true, headers: { get: (name) => (name === 'content-type' ? (address.endsWith('.css') ? 'text/css' : 'text/javascript') : null) },
        async text() { return `/* body of ${address} */`; } };
    }
  });
  const engine = new Engine();
  if (detectors) engine.setDetectors(detectors);
  return { engine, fetched, reads, logs };
}

// ---- Who reads the page's text

test('needsPageBodies: only a content rule that is on and not limited to scripts reads the page text and the stylesheets', () => {
  const needs = (detection, extra) => setup(detectorsWith(detection, extra)).engine.needsPageBodies();
  assert.equal(needs({ content: SCRIPTS_ONLY }), false, 'the bundled rules: all limited to scripts');
  assert.equal(needs({ url: [{ text: 'a' }], cookie: [{ name: 'b' }], dom: [{ selector: 'c' }] }), false, 'rules of other methods');
  assert.equal(needs({ content: PAGE_TEXT }), true, 'no scope: the whole page');
  assert.equal(needs({ content: [{ text: 'a', checkScripts: false }] }), true);
  assert.equal(needs({ content: [{ text: 'a', scope: 'whatever' }] }), true, 'an unknown scope reads the whole page');
  // 3.1.9: "page" reads a small page's own HTML (test/engine-page-source.test.js), never the body text or the stylesheets
  assert.equal(needs({ content: [{ text: 'a', scope: 'page' }] }), false, 'a small page\'s HTML only');
  assert.equal(needs({ content: [{ text: 'a', scope: 'page' }, ...PAGE_TEXT] }), true);
  assert.equal(needs({ content: [...SCRIPTS_ONLY, ...PAGE_TEXT] }), true, 'one such rule among script ones is enough');
  assert.equal(needs({ content: PAGE_TEXT }, { enabled: false }), false, 'a detector that is off');
  assert.equal(needs({ content: [{ ...PAGE_TEXT[0], enabled: false }, ...SCRIPTS_ONLY] }), false, 'a rule that is off');
  assert.equal(needs({ content: [{ ...PAGE_TEXT[0], enabled: false }, { text: 'b' }] }), true);
});

test('needsPageBodies: with no detectors loaded the page is collected whole', () => {
  assert.equal(setup(null).engine.needsPageBodies(), true);
});

test('needsPageBodies: the rule under test in Rules → Test counts as soon as it is added to the loaded ones', () => {
  const { engine } = setup(detectorsWith({ content: SCRIPTS_ONLY }));
  assert.equal(engine.needsPageBodies(), false);
  engine.setDetectors({ ...engine.detectors, 'rule-test': { 'rule-test': { id: 'rule-test', name: 'T', enabled: true, detection: { content: PAGE_TEXT } } } });
  assert.equal(engine.needsPageBodies(), true);
});

// ---- The stylesheets

test('stylesheets are not fetched when no rule reads their text; their addresses stay in the list', async () => {
  const { engine, fetched, logs } = setup(detectorsWith({ content: SCRIPTS_ONLY }));
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(fetched, [SCRIPT], 'only the script is downloaded');
  assert.deepEqual(found.map(resource => [resource.url, resource.type]), [[SCRIPT, 'javascript'], [STYLE, 'css']]);
  assert.equal(found[0].content, '/* body of https://cdn.test/app.js */');
  assert.equal(found[1].content, '', 'the stylesheet is listed without its text');
  assert.ok(logs.debug.some(entry => /^Fetched 1\/1 scripts and styles/.test(entry[1])), 'the summary counts what was fetched');
});

test('stylesheets are fetched, with their text, when a content rule reads the page', async () => {
  const { engine, fetched } = setup(detectorsWith({ content: [...SCRIPTS_ONLY, ...PAGE_TEXT] }));
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(fetched, [SCRIPT, STYLE]);
  assert.equal(found.find(resource => resource.type === 'css').content, '/* body of https://cdn.test/wp-content/plugins/wordfence/css/wf.css */');
});

test('a URL rule on a stylesheet address still matches without the stylesheet being downloaded', async () => {
  const detectors = detectorsWith({
    content: SCRIPTS_ONLY,
    url: [{ id: 'wf-asset', text: '/plugins/wordfence/css/', textScope: 'all', confidence: 80 }]
  });
  const { engine, fetched } = setup(detectors);
  const externalContent = plain(await engine.extractExternalContent());
  assert.deepEqual(fetched, [SCRIPT]);
  const [result] = await engine.detectOnPage({ url: 'https://site.test/', externalContent });
  assert.ok(result, 'the stylesheet\'s address was read');
  assert.equal(result.matches[0].fullUrl, STYLE);
  assert.equal(result.confidence, 80);
});

test('an address both a script and a stylesheet is typed as the script, and a stylesheet listed twice once', async () => {
  const { engine, fetched } = setup(detectorsWith({ content: SCRIPTS_ONLY }), { scripts: [SCRIPT], styles: [SCRIPT, STYLE, STYLE] });
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(fetched, [SCRIPT]);
  assert.deepEqual(found.map(resource => [resource.url, resource.type]), [[SCRIPT, 'javascript'], [STYLE, 'css']]);
});

test('the page text still reaches a "Page content" rule, from the page and from a stylesheet', async () => {
  const { engine } = setup(detectorsWith({ content: [{ id: 'c', text: 'page text' }, { id: 's', text: 'wf.css' }] }));
  const data = await engine.collectPageData();
  assert.equal(data.pageHTML, '<p>page text</p>');
  const [result] = await engine.detectOnPage({ url: data.url, pageHTML: data.pageHTML, externalContent: plain(data.externalContent) });
  assert.deepEqual(plain(result.matches).map(match => match.foundIn).sort(), [STYLE, 'page content']);
});

// ---- The page text

test('collectPageData: document.body.innerHTML is neither read nor sent when no content rule reads the page', async () => {
  const { engine, reads } = setup(detectorsWith({ content: SCRIPTS_ONLY }));
  const data = await engine.collectPageData();
  assert.equal(reads.html, 0, 'the body was never serialised');
  assert.ok(!('pageHTML' in data), 'no pageHTML property');
  assert.equal(plain(data).pageHTML, undefined, 'and none in the message');
  assert.equal(reads.html, 0);
  assert.equal(plain(data.externalContent).length, 2, 'the script and the stylesheet\'s address');
});

test('collectPageData: the page text is collected, lazily, for a content rule that reads the page', async () => {
  const { engine, reads } = setup(detectorsWith({ content: [...SCRIPTS_ONLY, ...PAGE_TEXT] }));
  const data = await engine.collectPageData();
  assert.ok('pageHTML' in data);
  assert.equal(reads.html, 0, 'not until it is read');
  assert.equal(data.pageHTML, '<p>page text</p>');
  assert.equal(data.pageHTML, '<p>page text</p>');
  assert.equal(reads.html, 1);
});

test('collectPageData: a page without a body gives an empty text', async () => {
  const { engine } = setup(detectorsWith({ content: PAGE_TEXT }), { noBody: true });
  const data = await engine.collectPageData();
  assert.equal(data.pageHTML, '');
});

test('the scripts of a page are still collected and fetched whichever way its content rules are scoped', async () => {
  for (const content of [SCRIPTS_ONLY, PAGE_TEXT]) {
    const { engine, fetched } = setup(detectorsWith({ content }));
    const data = await engine.collectPageData();
    assert.ok(fetched.includes(SCRIPT), JSON.stringify(content));
    assert.ok(plain(data.externalContent).some(resource => resource.url === SCRIPT && resource.type === 'javascript'));
    assert.ok('content' in data);
  }
});

// ---- Which kinds of data are collected

test('analyzeUsedMethods: a detector that is off uses nothing', () => {
  const methods = (detectors) => { const { engine } = setup(detectors); return plain(engine.analyzeUsedMethods()); };
  const rules = { cookie: [{ name: 'a' }], header: [{ name: 'h' }], content: [{ text: 'c' }], dom: [{ selector: 'd' }], window: [{ path: 'w' }], js_hooks: [{ target: 't' }], payload: [{ text: 'p' }] };
  const off = methods(detectorsWith(rules, { enabled: false }));
  assert.deepEqual(off, { cookie: false, header: false, content: false, dom: false, url: true, window: false, js_hooks: false, payload: false });
  const mixed = methods({ ...detectorsWith({ cookie: [{ name: 'a' }] }, { enabled: false }), captcha: { 'detect-y': { id: 'detect-y', name: 'Y', enabled: true, detection: { dom: [{ selector: 'd' }] } } } });
  assert.equal(mixed.cookie, false, 'the cookie rule belongs to a detector that is off');
  assert.equal(mixed.dom, true);
  assert.equal(methods(detectorsWith(rules, { enabled: undefined })).cookie, true, 'a detector with no flag is on');
});

test('analyzeUsedMethods: URL rules that read script addresses keep the script list collected', () => {
  const methods = (detectors) => { const { engine } = setup(detectors); return plain(engine.analyzeUsedMethods()); };
  assert.equal(methods(detectorsWith({ url: [{ text: 'a', textScope: 'page_and_scripts' }] })).content, true);
  assert.equal(methods(detectorsWith({ url: [{ text: 'a' }] })).content, true, 'the default scope reads them too');
  assert.equal(methods(detectorsWith({ url: [{ text: 'a', textScope: 'page_only' }] })).content, false);
  assert.equal(methods(detectorsWith({ url: [{ text: 'a', textScope: 'all', enabled: false }] })).content, false);
  assert.equal(methods(detectorsWith({ url: [{ text: 'a' }] }, { enabled: false })).content, false);
});
