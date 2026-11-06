const { test } = require('node:test');
const assert = require('node:assert/strict');
const { element, documentOf } = require('./helpers/fake-dom.js');
const { engineContext, plain } = require('./helpers/engine-context.js');

// How a page is collected for a scan (DetectionEngineManager.collectPageData and what it calls): which kinds of data are
// gathered for the rules that are loaded, the lazy getters that read them on first use, the cookies, and the fetch of external
// scripts with its limits (6 at a time, 5 s each, 5 MB each, a list of what failed).

const MB = 1024 * 1024;

const detectorsWith = (detection, extra = {}) => ({ antibot: { 'detect-x': { id: 'detect-x', name: 'X', enabled: true, detection, ...extra } } });

/** A page: its document (with counters on what is read), its window and the storage of hook hits. */
function pageWith({ href = 'https://site.test/path', scripts = [], styles = [], cookie = '', html = '<p>body</p>', title = 'A title', hookHits, body = [] } = {}) {
  const reads = { cookie: 0, html: 0, scripts: 0 };
  const doc = documentOf({ body });
  Object.defineProperty(doc, 'cookie', { get() { reads.cookie++; return cookie; } });
  doc.title = title;
  doc.body = { get innerHTML() { reads.html++; return html; }, children: doc.body.children };
  doc.querySelectorAll = (selector) => {
    if (selector === 'script[src]') return scripts.filter(script => script.src);
    if (selector === 'script') { reads.scripts++; return scripts; }
    if (selector === 'link[rel="stylesheet"]') return styles;
    return [];
  };
  const url = new URL(href);
  const chrome = { storage: { local: { get(keys, callback) {
    callback({ scrapfly_js_hook_detections: hookHits === undefined ? undefined : { [href]: hookHits } });
  } } } };
  const fetched = [];
  const timeouts = [];
  return {
    reads, fetched, timeouts, doc,
    globals: {
      document: doc, window: { location: { href, hostname: url.hostname } }, chrome,
      NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
      AbortSignal: { timeout(ms) { timeouts.push(ms); return { timeout: ms }; } },
      async fetch(address, options) {
        fetched.push({ url: address, options });
        return { ok: true, headers: { get: (name) => (name === 'content-type' ? (/\.css/.test(address) ? 'text/css' : 'text/javascript') : null) }, async text() { return `body of ${address}`; } };
      }
    }
  };
}

function engineFor(page, detectors) {
  const { Engine, logs, context } = engineContext(page.globals);
  const engine = new Engine();
  if (detectors) engine.setDetectors(detectors);
  return { engine, logs, context, Engine };
}

// ---- collectPageData: what is gathered, and when

test('the page data names the page, and reads cookies, scripts, DOM and HTML only when something asks', async () => {
  const page = pageWith({ cookie: 'a=1; b=2', body: [element('div', { id: 'x' })], scripts: [{ src: '', textContent: 'inline()' }],
    hookHits: { hooks: [{ detectorId: 'detect-x', target: 'navigator.userAgent' }] } });
  const { engine } = engineFor(page, detectorsWith({ cookie: [{ name: 'a' }], content: [{ text: 'x', checkScripts: false }], dom: [{ selector: 'div#x' }] }));
  const data = await engine.collectPageData();
  assert.equal(data.url, 'https://site.test/path');
  assert.equal(data.hostname, 'site.test');
  assert.equal(data.title, 'A title');
  assert.equal(data.favicon, '');
  assert.match(data.timestamp, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(plain(data.headers), []);
  assert.deepEqual(plain(data.jsHooks), [{ detectorId: 'detect-x', target: 'navigator.userAgent' }], 'the hook hits already recorded for this address');
  assert.equal(typeof data.collectMs, 'number');
  assert.deepEqual({ ...page.reads }, { cookie: 0, html: 0, scripts: 0 }, 'nothing read yet');

  assert.deepEqual(plain(data.cookies).map(cookie => cookie.name), ['a', 'b']);
  const cookieReads = page.reads.cookie;
  assert.ok(cookieReads > 0, 'the cookie string was read when the cookies were asked for');
  data.cookies; data.cookies;
  assert.equal(page.reads.cookie, cookieReads, 'read once, then kept');
  assert.equal(plain(data.content).length, 1);
  data.content;
  assert.equal(page.reads.scripts, 1);
  assert.equal(data.pageHTML, '<p>body</p>');
  data.pageHTML;
  assert.equal(page.reads.html, 1);
  assert.deepEqual(plain(data.dom).map(record => record.id), ['x']);
  assert.ok(Object.keys(data).includes('cookies') && Object.keys(data).includes('dom'), 'the lazy getters are enumerable: a message carries them');
});

test('a value set on the page data replaces what the getter would read', async () => {
  const page = pageWith({ cookie: 'a=1' });
  const { engine } = engineFor(page, detectorsWith({ cookie: [{ name: 'a' }], content: [{ text: 'x' }], dom: [{ selector: 'div' }] }));
  const data = await engine.collectPageData();
  data.cookies = [{ name: 'set', value: '1' }];
  data.content = [];
  data.pageHTML = 'set';
  data.dom = [];
  assert.deepEqual(plain(data.cookies), [{ name: 'set', value: '1' }]);
  assert.deepEqual(plain(data.content), []);
  assert.equal(data.pageHTML, 'set');
  assert.deepEqual(plain(data.dom), []);
  assert.deepEqual({ ...page.reads }, { cookie: 0, html: 0, scripts: 0 }, 'the page was never read');
});

test('kinds of data no loaded rule uses are not collected: the property is absent', async () => {
  const page = pageWith();
  const { engine, logs } = engineFor(page, detectorsWith({ url: [{ text: 'site.test', textScope: 'page_only' }] }));
  const data = await engine.collectPageData();
  for (const key of ['cookies', 'content', 'dom', 'pageHTML']) assert.ok(!(key in data), `${key} is absent`);
  const said = logs.debug.map(entry => entry[1]).join('\n');
  for (const line of ['Skipped cookies', 'Skipped content', 'Skipped DOM']) assert.ok(said.includes(line), line);
});

test('each kind is collected as soon as a rule uses it', async () => {
  const cases = { cookie: [{ name: 'a' }], dom: [{ selector: 'div' }], content: [{ text: 'x' }] };
  const keys = { cookie: ['cookies'], dom: ['dom'], content: ['content'] };
  for (const [method, rules] of Object.entries(cases)) {
    const { engine } = engineFor(pageWith(), detectorsWith({ [method]: rules }));
    const data = await engine.collectPageData();
    for (const key of ['cookies', 'content', 'dom']) assert.equal(key in data, keys[method].includes(key), `${method} rule, ${key}`);
  }
});

test('with no detectors loaded everything is collected, but no external script is fetched', async () => {
  const page = pageWith({ scripts: [{ src: 'https://cdn.test/a.js' }], styles: [{ href: 'https://cdn.test/a.css' }] });
  const { engine, logs } = engineFor(page);
  const data = await engine.collectPageData();
  for (const key of ['cookies', 'content', 'dom', 'pageHTML']) assert.ok(key in data, key);
  assert.deepEqual(plain(data.externalContent), []);
  assert.deepEqual(page.fetched, []);
  assert.ok(logs.warn.some(entry => String(entry[1]).includes('No detectors loaded')));
});

test('a page with no title is "Untitled", and hook hits of another address are not this page\'s', async () => {
  const page = pageWith({ title: '', hookHits: undefined });
  const { engine } = engineFor(page, detectorsWith({ url: [{ text: 'x' }] }));
  const data = await engine.collectPageData();
  assert.equal(data.title, 'Untitled');
  assert.deepEqual(plain(data.jsHooks), []);
});

test('a failing external fetch never stops the collection', async () => {
  const page = pageWith({ scripts: [{ src: 'https://cdn.test/a.js' }] });
  page.globals.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const { engine } = engineFor(page, detectorsWith({ content: [{ text: 'x' }] }));
  const data = await engine.collectPageData();
  assert.deepEqual(plain(data.externalContent), []);
});

// ---- Which kinds of data the loaded rules use

test('analyzeUsedMethods: the methods of the loaded rules, with the address always on', () => {
  const { Engine } = engineContext();
  const methods = (detection) => {
    const engine = new Engine();
    engine.setDetectors(detectorsWith(detection));
    return plain(engine.analyzeUsedMethods());
  };
  assert.deepEqual(methods({}), { cookie: false, header: false, content: false, dom: false, url: true, window: false, js_hooks: false, payload: false });
  const all = methods({ cookie: [{ name: 'a' }], header: [{ name: 'h' }], content: [{ text: 'c' }], dom: [{ selector: 'd' }], url: [{ text: 'u' }],
    window: [{ path: 'w' }], js_hooks: [{ target: 't' }], payload: [{ text: 'p' }] });
  assert.ok(Object.values(all).every(Boolean));
  assert.equal(methods({ cookie: [] }).cookie, false, 'an empty list is no use');
});

test('analyzeUsedMethods: with no detectors loaded every kind is collected, and the answer is kept for a while', () => {
  const { Engine, logs } = engineContext();
  const engine = new Engine();
  const first = engine.analyzeUsedMethods();
  assert.ok(Object.values(plain(first)).every(Boolean));
  assert.ok(logs.warn.length >= 1);
  engine.detectors = detectorsWith({ cookie: [{ name: 'a' }] });
  assert.strictEqual(engine.analyzeUsedMethods(), first, 'inside the cache time the loaded answer stands');
  engine.setDetectors(engine.detectors);
  assert.equal(engine.analyzeUsedMethods().cookie, true, 'new rules clear it');
  assert.equal(engine.analyzeUsedMethods().header, false);
});

test('needsExternalContent: only a content rule that is on asks for the page\'s scripts to be fetched', () => {
  const { Engine } = engineContext();
  const needs = (detectors) => { const engine = new Engine(); if (detectors) engine.setDetectors(detectors); return engine.needsExternalContent(); };
  assert.equal(needs(null), false, 'no detectors');
  assert.equal(needs(detectorsWith({ url: [{ text: 'a' }], cookie: [{ name: 'b' }] })), false, 'rules of other methods');
  assert.equal(needs(detectorsWith({ content: [{ text: 'a' }] }, { enabled: false })), false, 'a detector that is off');
  for (const rule of [{ text: 'a' }, { text: 'a', scope: 'scripts' }, { text: 'a', checkScripts: true }, { text: 'a', checkScripts: false }]) {
    assert.equal(needs(detectorsWith({ content: [rule] })), true, JSON.stringify(rule));
  }
});

// ---- The page's cookies

test('page cookies: name, value (cut at 100 characters) and the page\'s host; rows without a name are left out', () => {
  const page = pageWith({ cookie: `a=1; b=two=2;  c ; =x; d=; e=${'v'.repeat(150)}` });
  const { engine } = engineFor(page);
  const cookies = plain(engine.extractCookies());
  assert.deepEqual(cookies.map(cookie => [cookie.name, cookie.value.length]), [['a', 1], ['b', 5], ['d', 0], ['e', 100]]);
  assert.deepEqual(cookies[1], { name: 'b', value: 'two=2', domain: 'site.test' });
});

test('page cookies: none when the page has none', () => {
  const { engine } = engineFor(pageWith({ cookie: '' }));
  assert.deepEqual(plain(engine.extractCookies()), []);
});

// ---- The fetch of external scripts and its limits

function fetchingEngine(urls, respond) {
  const page = pageWith({ scripts: urls.map(src => ({ src, type: '' })) });
  page.globals.fetch = async (address, options) => { page.fetched.push({ url: address, options }); return respond(address); };
  const made = engineFor(page, detectorsWith({ content: [{ text: 'x', scope: 'scripts' }] }));
  return { ...made, page };
}
const reply = (body, headers = {}, { ok = true } = {}) => ({
  ok, headers: { get: (name) => (name === 'content-type' ? 'text/javascript' : (headers[name] ?? null)) }, async text() { return body; }
});
const urlsOf = (count) => Array.from({ length: count }, (_, index) => `https://cdn${index}.test/script-${index}.js`);

test('external scripts: fetched without credentials, each under its own time limit', async () => {
  const { engine, page } = fetchingEngine(urlsOf(2), () => reply('code'));
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(found.map(resource => [resource.url, resource.type, resource.content, resource.size]),
    [[urlsOf(2)[0], 'javascript', 'code', 4], [urlsOf(2)[1], 'javascript', 'code', 4]]);
  assert.ok(page.fetched.every(call => call.options.method === 'GET' && call.options.credentials === 'omit' && call.options.cache === 'default'));
  assert.deepEqual(page.timeouts, [5000, 5000], 'Constants.FETCH_TIMEOUT for every request');
  assert.ok(page.fetched.every(call => call.options.signal && call.options.signal.timeout === 5000));
});

test('external scripts: six at a time, in the order the page lists them', async () => {
  let running = 0;
  let most = 0;
  const batches = [];
  const urls = urlsOf(14);
  const { engine, page } = fetchingEngine(urls, async (address) => {
    running += 1;
    most = Math.max(most, running);
    batches.push(running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running -= 1;
    return reply(`code of ${address}`);
  });
  const found = plain(await engine.extractExternalContent());
  assert.equal(most, 6, 'never more than six requests in flight');
  assert.equal(page.fetched.length, 14);
  assert.deepEqual(found.map(resource => resource.url), urls, 'results keep the page\'s order');
  assert.deepEqual(batches, [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2], 'a batch of six finishes before the next starts');
});

test('external scripts: one that does not answer in time or fails is dropped and named by host, the others stay', async () => {
  const urls = ['https://ok.test/a.js', 'https://slow.test/b.js', 'https://down.test/c.js', 'https://gone.test/d.js'];
  const { engine, logs } = fetchingEngine(urls, (address) => {
    if (address.includes('slow')) return Promise.reject(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }));
    if (address.includes('down')) return Promise.reject(new TypeError('Failed to fetch'));
    if (address.includes('gone')) return reply('', {}, { ok: false });
    return reply('fine');
  });
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(found.map(resource => resource.url), ['https://ok.test/a.js'], 'an answer that is not ok is dropped without being a failure');
  const summary = logs.debug.find(entry => /^Fetched /.test(entry[1]));
  assert.ok(summary, 'one line per page');
  assert.match(summary[1], /^Fetched 1\/4 scripts and styles in \d+ms$/);
  assert.deepEqual(plain(summary[2]), { failed: ['slow.test (timeout)', 'down.test (Failed to fetch)'] });
});

test('external scripts: a file over 5 MB by its Content-Length is skipped without being read', async () => {
  let read = 0;
  const { engine, logs } = fetchingEngine(['https://big.test/big.js', 'https://big.test/edge.js', 'https://big.test/small.js'], (address) => ({
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? 'text/javascript' : name === 'content-length' ? String(address.includes('big.js') ? 5 * MB + 1 : address.includes('edge') ? 5 * MB : 10) : null) },
    async text() { read += 1; return 'x'.repeat(address.includes('edge') ? 5 * MB : 10); }
  }));
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(found.map(resource => resource.url), ['https://big.test/edge.js', 'https://big.test/small.js']);
  assert.equal(read, 2, 'the skipped file\'s body was never downloaded');
  assert.equal(found[0].truncated, undefined, 'exactly 5 MB is kept whole');
  assert.ok(logs.debug.some(entry => /^Skipped large file \(5\.0 MB\): https:\/\/big\.test\/big\.js$/.test(entry[1])));
});

test('external scripts: text that decodes to more than 5 MB is cut at 5 MB and marked, with its full size', async () => {
  const { engine } = fetchingEngine(['https://big.test/wide.js'], () => reply('y'.repeat(5 * MB + 10)));
  const [resource] = plain(await engine.extractExternalContent());
  assert.equal(resource.content.length, 5 * MB);
  assert.equal(resource.size, 5 * MB + 10);
  assert.equal(resource.truncated, true);
});

test('external scripts: stylesheets are fetched and typed css, and a script URL listed twice is fetched once', async () => {
  const page = pageWith({ scripts: [{ src: 'https://cdn.test/a.js' }, { src: 'https://cdn.test/a.js' }], styles: [{ href: 'https://cdn.test/a.css' }] });
  const { engine } = engineFor(page, detectorsWith({ content: [{ text: 'x' }] }));
  const found = plain(await engine.extractExternalContent());
  assert.deepEqual(found.map(resource => [resource.url, resource.type]), [['https://cdn.test/a.js', 'javascript'], ['https://cdn.test/a.css', 'css']]);
  assert.equal(page.fetched.length, 2);
});
