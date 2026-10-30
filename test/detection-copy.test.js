'use strict';
// Detection tab → Copy: the uploaded summary, a Markdown table or JSON. All
// three come from one payload, which never holds cookie or header values or
// the page's query string.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function load() {
  const copied = [];
  const context = vm.createContext({
    console, URL, JSON, Math, Date, Object, Array, String, Number,
    document: { querySelector: () => null },
    FormatUtils: { copyToClipboard: async (text) => { copied.push(text); } },
    DetectionUtils: { computeAverageConfidence: (list) => list.reduce((a, d) => a + d.confidence, 0) / (list.length || 1) }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/detection/detection-actions.js'), 'utf8'), context);
  return { DetectionActions: context.DetectionActions, copied };
}

const view = {
  currentResults: [
    { detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95,
      matches: [{ type: 'cookie', value: '__cf_bm=SECRETCOOKIE' }, { type: 'cookie', value: 'cf_clearance=SECRET2' }, { type: 'header', value: 'cf-ray: SECRETHEADER' }] },
    { detector: { name: 'Pipe | Vendor' }, category: 'CAPTCHA', confidence: 70, matches: [{ type: 'url', fullUrl: 'https://x.example/a.js?k=SECRETQUERY' }] }
  ],
  getDifficultyInfo: () => ({ difficulty: 'High' }),
  sortDetectionsByCategory: (list) => list.slice()
};

test('Markdown: a heading, the summary line and one escaped row per protection, with method counts', () => {
  const { DetectionActions } = load();
  const { payload } = DetectionActions.buildDetectionsPasteContent.call(view, 'https://shop.example/cart?session=SECRETURL#x');
  const md = DetectionActions.buildDetectionsMarkdown(payload);
  assert.match(md, /^## Protections on shop\.example\n/);
  assert.ok(md.includes('\nhttps://shop.example/cart\n'));
  assert.ok(md.includes('Detections: 2 · Confidence: 83% · Difficulty: High'));
  assert.ok(md.includes('| Cloudflare | Anti-Bot | 95% | cookie ×2, header |'));
  assert.ok(md.includes('| Pipe \\| Vendor | CAPTCHA | 70% | url |'), 'a pipe in a name cannot break the table');
  assert.ok(md.includes('| --- | --- | ---: | --- |'));
});

test('none of the three copies holds a value, a query string or a fragment', async () => {
  const { DetectionActions, copied } = load();
  for (const kind of ['overview', 'markdown', 'json']) {
    await DetectionActions.copyDetectionsAs.call(view, kind, 'https://shop.example/cart?session=SECRETURL#frag');
  }
  assert.strictEqual(copied.length, 3);
  for (const text of copied) {
    for (const secret of ['SECRET', 'session=', '#frag']) assert.ok(!text.includes(secret), `${secret} copied`);
  }
  assert.ok(copied[0].startsWith('====='), 'the summary is what Upload shares, banner first');
  assert.ok(copied[1].startsWith('## '), 'Markdown');
  assert.doesNotThrow(() => JSON.parse(copied[2]), 'JSON parses');
  assert.strictEqual(JSON.parse(copied[2]).detections[0].methods.cookie, 2);
});

test('an empty page copies a heading and the summary, without a table', () => {
  const { DetectionActions } = load();
  const md = DetectionActions.buildDetectionsMarkdown({ host: 'a.example', summary: { detections: 0, confidence: 0, difficulty: 'Low' }, detections: [] });
  assert.ok(!md.includes('|'));
  assert.ok(md.includes('Detections: 0'));
  assert.doesNotThrow(() => DetectionActions.buildDetectionsMarkdown(null));
});

test('the Detection tab offers its six formats in a menu wired to copyDetectionsAs', () => {
  const html = fs.readFileSync(path.join(root, 'sections/detection/detection.html'), 'utf8');
  assert.ok(/id="copyOverviewBtn"[^>]*aria-haspopup="menu"/.test(html));
  const formats = [...html.matchAll(/data-copy-format="([a-z]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(formats, ['overview', 'markdown', 'json', 'curl', 'python', 'node']);
  const js = fs.readFileSync(path.join(root, 'sections/detection/detection.js'), 'utf8');
  assert.ok(js.includes('DetectionActions.copyDetectionsAs.call(this, item.dataset.copyFormat'));
});

test('curl, Python and Node.js copy the replay kit\'s code, with the page\'s cookies read for the active tab', async () => {
  const copied = [];
  const asked = [];
  const context = vm.createContext({
    console, URL, JSON, Math, Date, Object, Array, String, Number,
    document: { querySelector: () => null },
    navigator: { userAgent: 'UA/1', languages: ['en-US', 'en'] },
    chrome: { tabs: { query: async () => [{ id: 7 }] } },
    PageCookies: { getAll: async (details, tabId) => { asked.push([details.url, tabId]); return [{ name: '__cf_bm', value: 'v' }]; } },
    NotificationHelper: { warning: () => {} },
    FormatUtils: { copyToClipboard: async (text) => { copied.push(text); } }
  });
  context.self = context;
  const sources = ['scrapfly/options', 'scrapfly/parameters', 'scrapfly/codegen', 'replay-kit'].map(n => `modules/integrations/${n}.js`).concat('sections/detection/detection-actions.js');
  vm.runInContext(sources.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n') + '\n;globalThis.DetectionActions = DetectionActions;', context);
  const { DetectionActions } = context;
  await DetectionActions.copyDetectionsAs.call(view, 'curl', 'https://shop.example/cart#x');
  await DetectionActions.copyDetectionsAs.call(view, 'python', 'https://shop.example/cart#x');
  await DetectionActions.copyDetectionsAs.call(view, 'node', 'https://shop.example/cart#x');
  assert.deepStrictEqual(asked[0], ['https://shop.example/cart', 7]);
  assert.ok(copied[0].includes("curl -g 'https://shop.example/cart'") && copied[0].includes("-b '__cf_bm=v'") && copied[0].includes("-H 'User-Agent: UA/1'"), copied[0]);
  assert.ok(copied[0].includes('# Protection cookies: __cf_bm (Cloudflare)'));
  assert.ok(copied[1].includes('import requests') && copied[1].includes('"__cf_bm": "v",  # Cloudflare'), copied[1]);
  assert.ok(copied[2].includes('fetch(url') && copied[2].includes('"__cf_bm=v",  // Cloudflare'), copied[2]);
  assert.strictEqual(await DetectionActions.copyDetectionsAs.call(view, 'curl', 'about:blank'), '', 'no web page, nothing copied');
  assert.strictEqual(await DetectionActions.copyDetectionsAs.call(view, 'node', 'about:blank'), '');
  assert.strictEqual(copied.length, 3);
});

test('a share upload leaves out a token in the address path too (reset, invite, magic-link pages); readable segments stay', () => {
  const { DetectionActions } = load();
  const clean = (url) => DetectionActions._sanitizeUrlForPaste(url);
  assert.equal(clean('https://app.example/reset/9f3c2a7b1e4d8c6f0a5b2e9d7c4f1a3b?x=1'), 'https://app.example/reset/:token');
  assert.equal(clean('https://app.example/invite/0b7c3d1e-2f4a-4b5c-9d6e-7f8a9b0c1d2e'), 'https://app.example/invite/:token');
  assert.equal(clean('https://app.example/login/magic/aZ3kP9qL2mX7wR5tY8vB'), 'https://app.example/login/magic/:token');
  assert.equal(clean('https://shop.example/products/running-shoes-for-women/'), 'https://shop.example/products/running-shoes-for-women/', 'words stay');
  assert.equal(clean('https://news.example/2026/10/28/story'), 'https://news.example/2026/10/28/story', 'short numbers stay');
});

test('a share upload and a paste leave out a path parameter (;jsessionid=…) and an email address in the path', () => {
  const { DetectionActions } = load();
  const clean = (url) => DetectionActions._sanitizeUrlForPaste(url);
  assert.equal(clean('https://shop.example/cart;jsessionid=9F8A7B6C5D4E3F2A1B0C9D8E7F6A5B4C?x=1'), 'https://shop.example/cart');
  assert.equal(clean('https://shop.example/a;x=1/b;y=2/c'), 'https://shop.example/a/b/c', 'in every segment');
  assert.equal(clean('https://app.example/u/jane.doe@gmail.com/orders'), 'https://app.example/u/:email/orders');
  assert.equal(clean('https://app.example/u/jane.doe%40gmail.com/orders'), 'https://app.example/u/:email/orders', 'encoded too');
  assert.equal(clean('https://shop.example/products/shoes'), 'https://shop.example/products/shoes', 'ordinary paths stay');
});

