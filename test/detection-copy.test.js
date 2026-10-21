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

test('the Detection tab offers the three formats in a menu wired to copyDetectionsAs', () => {
  const html = fs.readFileSync(path.join(root, 'sections/detection/detection.html'), 'utf8');
  assert.ok(/id="copyOverviewBtn"[^>]*aria-haspopup="menu"/.test(html));
  const formats = [...html.matchAll(/data-copy-format="([a-z]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(formats, ['overview', 'markdown', 'json']);
  const js = fs.readFileSync(path.join(root, 'sections/detection/detection.js'), 'utf8');
  assert.ok(js.includes('DetectionActions.copyDetectionsAs.call(this, item.dataset.copyFormat'));
});
