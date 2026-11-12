'use strict';
// Detection tab: the page's HTTP status, a small tile beside Cache (3.1.8). Graphite for 2xx/3xx, amber for 4xx, red for 5xx,
// hidden when the result has none (saved by an older version, a page its service worker answered). The copies of the result
// carry it in their summary.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function element() {
  const classes = new Set();
  return {
    hidden: true, textContent: '-', tip: null,
    classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), contains: (c) => classes.has(c) },
    classes
  };
}

function loadTile() {
  const tile = element();
  const value = element();
  const icon = element();
  tile.querySelector = (selector) => (selector === '.stat-icon-inline' ? icon : null);
  const context = vm.createContext({
    console, URL,
    Logger: { ui() {}, debug() {}, error() {}, detection() {}, warn() {} },
    chrome: { runtime: { getURL: (p) => p } },
    document: { querySelector: (selector) => ({ '#httpStatusTile': tile, '#httpStatusValue': value })[selector] || null },
    HttpStatus: require('../modules/core/http-status.js'),
    FormatUtils: {
      t: (key, fallback, ...args) => args.reduce((text, arg, i) => text.split(`{${i}}`).join(String(arg)), fallback),
      setTip: (el, title, body) => { el.tip = { title, body }; }
    }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-ui.js'), context);
  const show = (cacheMetadata) => context.DetectionUI.updateHttpStatus.call({ cacheMetadata });
  return { tile, value, icon, show };
}

test('the tile shows the status saved with the result, in the tone of its class', () => {
  const { tile, value, icon, show } = loadTile();
  show({ httpStatus: 200 });
  assert.strictEqual(tile.hidden, false);
  assert.strictEqual(value.textContent, '200');
  assert.deepStrictEqual([...value.classes, ...icon.classes], [], 'graphite: a success says nothing');
  assert.strictEqual(tile.tip.title, 'HTTP status: 200');
  assert.match(tile.tip.body, /blocked or challenged/);

  show({ httpStatus: 403 });
  assert.strictEqual(value.textContent, '403');
  assert.ok(value.classList.contains('tone-amber') && icon.classList.contains('tone-amber'), '4xx: amber');

  show({ httpStatus: 503 });
  assert.ok(value.classList.contains('tone-red') && !value.classList.contains('tone-amber'), '5xx: red, the amber gone');
  assert.ok(icon.classList.contains('tone-red'));
});

test('the tile hides when the status is not known: an older result, no result, a 304', () => {
  const { tile, value, show } = loadTile();
  for (const meta of [{}, null, { httpStatus: 304 }, { httpStatus: '403' }]) {
    show({ httpStatus: 503 });
    show(meta);
    assert.strictEqual(tile.hidden, true, JSON.stringify(meta));
    assert.strictEqual(value.textContent, '-');
    assert.ok(!value.classList.contains('tone-red'), 'no tone left from the page before');
  }
});

test('the tile sits in the Cache row with its label, hover text and tone colours; Cache refreshes it', () => {
  const html = read('sections/detection/detection.html');
  const row = html.slice(html.indexOf('class="cache-expiry-line"'), html.indexOf('<!-- Search sits in the summary card'));
  assert.match(row, /id="httpStatusTile"[^>]*hidden[^>]*data-i18n-title="detectionTipHttpStatus"/);
  assert.match(row, /data-i18n="detectionStatHttpStatus">HTTP status</);
  const css = read('sections/detection/detection.css');
  assert.match(css, /#httpStatusTile \.tone-amber \{ --tone: var\(--warning\); \}/);
  assert.match(css, /#httpStatusTile \.tone-red \{ --tone: var\(--danger\); \}/);
  assert.match(read('sections/detection/detection-ui.js'), /DetectionUI\.updateCacheInfo = function\(\) \{[\s\S]*?DetectionUI\.updateHttpStatus\.call\(this\);/);
  assert.match(read('sections/detection/detection-requests.js'), /httpStatus: detectionData\.httpStatus \?\? nestedMeta\.httpStatus/, 'the popup keeps it with the cache info');
});

function loadActions() {
  const copied = [];
  const context = vm.createContext({
    console, URL, JSON, Math, Date, Object, Array, String, Number,
    document: { querySelector: () => null },
    HttpStatus: require('../modules/core/http-status.js'),
    FormatUtils: { copyToClipboard: async (text) => { copied.push(text); } },
    DetectionUtils: { computeAverageConfidence: (list) => list.reduce((a, d) => a + d.confidence, 0) / (list.length || 1) }
  });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-actions.js'), context);
  return { DetectionActions: context.DetectionActions, copied };
}

const view = (httpStatus) => ({
  currentResults: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95, matches: [{ type: 'cookie', value: '__cf_bm=x' }] }],
  getDifficultyInfo: () => ({ difficulty: 'High' }),
  sortDetectionsByCategory: (list) => list.slice(),
  cacheMetadata: httpStatus === undefined ? null : { httpStatus }
});

test('the JSON and Markdown copies give the status in their summary when it is known, and nothing new when not', async () => {
  const { DetectionActions, copied } = loadActions();
  const { payload } = DetectionActions.buildDetectionsPasteContent.call(view(403), 'https://shop.example/');
  assert.strictEqual(payload.summary.httpStatus, 403);
  assert.ok(DetectionActions.buildDetectionsMarkdown(payload).includes('Detections: 1 · Confidence: 95% · Difficulty: High · HTTP status: 403'));

  const older = DetectionActions.buildDetectionsPasteContent.call(view(undefined), 'https://shop.example/').payload;
  assert.strictEqual('httpStatus' in older.summary, false, 'the fields there were keep their meaning; none is added');
  assert.ok(DetectionActions.buildDetectionsMarkdown(older).includes('Difficulty: High\n'));

  await DetectionActions.copyDetectionsAs.call(view(503), 'json', 'https://shop.example/');
  assert.strictEqual(JSON.parse(copied[0]).summary.httpStatus, 503);
});
