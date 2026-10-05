'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const HistoryStats = require('../sections/stats/history-stats.js');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sections/stats/stats.html');
const messages = JSON.parse(read('_locales/en/messages.json'));

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {};
    this.hidden = false; this.value = ''; this.disabled = false; this.tabIndex = 0; this.classes = new Set();
    this.classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) };
  }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() { this.focused = true; }
  scrollIntoView() {}
  getBoundingClientRect() { return { width: 600, height: 40, left: 0, bottom: 40 }; }
}
async function app(items, preferences = {}, download = async () => ({ filename: 'test.json' })) {
  const ids = new Map();
  const buttons = [];
  for (const match of html.matchAll(/<(\w+)\b([^>]+)>/g)) {
    const attrs = match[2], node = new Node(match[1]);
    for (const attr of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      node.attributes[attr[1]] = attr[2];
      if (attr[1] === 'id') { node.id = attr[2]; ids.set(node.id, node); }
      if (attr[1].startsWith('data-')) node.dataset[attr[1].slice(5)] = attr[2];
    }
    node.hidden = /\bhidden\b/.test(attrs);
    node.disabled = /\bdisabled\b/.test(attrs);
    if (['days', 'section', 'export'].some(key => key in node.dataset)) buttons.push(node);
  }
  ids.get('statsDomainSort').value = 'visits';
  let init;
  const changes = [];
  const stored = { scrapfly_history: JSON.stringify({ items }), ...preferences }, writes = [], chartCalls = [], downloads = [];
  const doc = {
    documentElement: {}, getElementById: id => { assert.ok(ids.has(id), 'Missing ID: ' + id); return ids.get(id); },
    querySelectorAll: selector => buttons.filter(button => Object.hasOwn(button.dataset, selector.slice(6, -1))),
    createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
    addEventListener: (name, handler) => { if (name === 'DOMContentLoaded') init = handler; }
  };
  const context = vm.createContext({ document: doc, Node, HistoryStats, Intl, Date, console,
    window: { innerWidth: 1000, innerHeight: 800, addEventListener() {} }, location: { reload() {} },
    requestAnimationFrame: fn => fn(), cancelAnimationFrame() {}, Logger: { storage() {}, error() {} },
    chrome: { storage: { local: { get: async () => ({ ...stored }), set: async data => { Object.assign(stored, data); writes.push(data); } }, onChanged: { addListener: handler => changes.push(handler) } },
      i18n: { getUILanguage: () => 'en', getMessage: key => messages[key] && messages[key].message } },
    I18n: { _overrideLocale: null, loadOverride: async () => {}, apply() {},
      tr: (key, fallback) => messages[key] ? messages[key].message : fallback,
      format: (key, ...args) => messages[key] ? args.reduce((s, arg, i) => s.split('{' + i + '}').join(String(arg)), messages[key].message) : null },
    StatsCharts: Object.fromEntries(['line', 'bars', 'donut', 'heatmap', 'matrix', 'scatter', 'stacked'].map(key => [key, (...args) => chartCalls.push({ key, args })])),
    StatsExport: { download: async (...args) => { downloads.push(args); return download(...args); } }
  });
  vm.runInContext(read('modules/core/storage-manager.js'), context);
  vm.runInContext(read('sections/stats/stats.js'), context);
  await init();
  const button = (key, value) => buttons.find(b => b.dataset[key] === String(value));
  return { ids, context, stored, writes, chartCalls, downloads, changes, button };
}
const entries = () => [
  { timestamp: Date.now() - 1000, hostname: 'alpha.example', detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 50 }] },
  { timestamp: Date.now() - 1000, hostname: 'beta.example', detections: [{ name: 'Canvas', category: 'fingerprint', confidence: null }] },
  { timestamp: Date.now() - 40 * 86400000, hostname: 'old.example', detections: [] }
];
const flatten = node => [node, ...node.children.flatMap(flatten)];

test('statistics standalone load graph has existing unique scripts in dependency order', () => {
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(scripts).size, scripts.length);
  scripts.forEach(src => assert.ok(fs.existsSync(path.resolve(root, 'sections/stats', src)), src));
  for (const dependency of ['history-stats.js', 'stats-charts.js', 'stats-export.js', '../../modules/core/storage-manager.js', '../../modules/core/i18n.js']) {
    assert.ok(scripts.indexOf(dependency) < scripts.indexOf('stats.js'), dependency);
  }
  assert.ok(scripts.indexOf('../../modules/core/logger.js') < scripts.indexOf('../../modules/core/storage-manager.js'));
  assert.ok(scripts.indexOf('history-stats.js') < scripts.indexOf('stats-export.js'));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});
test('dashboard uses readonly shared history access and preserves legacy stored strings', async () => {
  const ui = await app(entries());
  assert.equal(ui.ids.get('kpiEntries').textContent, '2');
  assert.equal(ui.ids.get('kpiDomains').textContent, '2');
  assert.equal(ui.ids.get('statsContent').hidden, false);
  assert.equal(ui.writes.length, 0);
  assert.equal(typeof ui.stored.scrapfly_history, 'string');
  assert.equal(ui.chartCalls.length, 3);
});
test('all five sections select one panel with accessible tabs and shared range data', async () => {
  const ui = await app(entries());
  for (const section of ['overview', 'activity', 'protections', 'domains', 'confidence']) {
    ui.button('section', section).events.click();
    for (const other of ['overview', 'activity', 'protections', 'domains', 'confidence']) {
      assert.equal(ui.ids.get('stats-panel-' + other).hidden, other !== section);
      assert.equal(ui.button('section', other).attributes['aria-selected'], String(other === section));
      assert.equal(ui.button('section', other).tabIndex, other === section ? 0 : -1);
    }
  }
  assert.ok(ui.chartCalls.some(call => call.key === 'heatmap'));
  assert.ok(ui.chartCalls.some(call => call.key === 'stacked'));
  assert.ok(ui.chartCalls.some(call => call.key === 'scatter'));
  assert.ok(ui.chartCalls.some(call => call.key === 'matrix'));
  const confidenceBars = ui.chartCalls.find(call => call.args[0].id === 'statsCategoryConfidence');
  assert.equal(confidenceBars.args[1].length, 1);
  assert.equal(confidenceBars.args[1][0].value, 50);
  assert.equal(confidenceBars.args[2].fixedMax, 100);
  await Promise.resolve();
  assert.ok(ui.writes.every(write => !Object.hasOwn(write, 'scrapfly_history')));
});
test('range, section and live history updates keep selected context and recompute totals', async () => {
  const ui = await app(entries(), { scrapfly_stats_range: 0, scrapfly_stats_section: 'domains' });
  assert.equal(ui.ids.get('kpiEntries').textContent, '3');
  assert.equal(ui.ids.get('stats-panel-domains').hidden, false);
  ui.button('days', 7).events.click();
  assert.equal(ui.ids.get('kpiEntries').textContent, '2');
  ui.stored.scrapfly_history = { items: entries().slice(0, 1) };
  ui.changes[0]({ scrapfly_history: {} }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.ids.get('kpiEntries').textContent, '1');
  assert.equal(ui.ids.get('stats-panel-domains').hidden, false);
  assert.equal(ui.button('days', 7).attributes['aria-pressed'], 'true');
});
test('empty history and empty selected range are distinct and exports disabled', async () => {
  const empty = await app([]);
  assert.equal(empty.ids.get('statsEmptyTitle').textContent, messages.statsEmptyTitle.message);
  assert.equal(empty.button('export', 'csv').disabled, true);
  const old = await app(entries().slice(2));
  assert.equal(old.ids.get('statsEmptyTitle').textContent, messages.statsRangeEmptyTitle.message);
  assert.equal(old.ids.get('statsContent').hidden, true);
  old.button('days', 0).events.click();
  assert.equal(old.ids.get('statsContent').hidden, false);
  assert.equal(old.button('export', 'json').disabled, false);
});
test('domain search, sorting and pagination operate without truncating export source', async () => {
  const list = Array.from({ length: 70 }, (_, i) => ({ timestamp: Date.now() - 1000, hostname: `domain${String(i).padStart(2, '0')}.example`, detections: [] }));
  const ui = await app(list, { scrapfly_stats_section: 'domains' });
  const table = () => flatten(ui.ids.get('statsDomainTable')).filter(node => node.scope === 'row');
  assert.equal(table().length, 50);
  ui.ids.get('statsDomainMore').events.click();
  assert.equal(table().length, 70);
  ui.ids.get('statsDomainSearch').value = 'DOMAIN69';
  ui.ids.get('statsDomainSearch').events.input();
  assert.deepEqual(table().map(n => n.textContent), ['domain69.example']);
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads[0][1].length, 70);
  assert.equal(ui.downloads[0][2].days, 30);
});
test('export failures are visible, concurrent clicks ignored and buttons recover', async () => {
  let reject;
  const ui = await app(entries(), {}, () => new Promise((_, fail) => { reject = fail; }));
  const pending = ui.button('export', 'csv').events.click();
  assert.equal(ui.button('export', 'json').disabled, true);
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads.length, 1);
  reject(new Error('blocked'));
  await pending;
  assert.equal(ui.ids.get('statsStatus').textContent, messages.statsExportFailed.message);
  assert.equal(ui.ids.get('statsStatus').hidden, false);
  assert.equal(ui.button('export', 'csv').disabled, false);
});
test('keyboard tab navigation selects panels and reverses direction for RTL', async () => {
  const ui = await app(entries());
  const event = key => ({ key, preventDefault() {} });
  ui.button('section', 'overview').events.keydown(event('ArrowRight'));
  assert.equal(ui.ids.get('stats-panel-activity').hidden, false);
  assert.equal(ui.button('section', 'activity').focused, true);
  ui.context.document.documentElement.dir = 'rtl';
  ui.button('section', 'activity').events.keydown(event('ArrowRight'));
  assert.equal(ui.ids.get('stats-panel-overview').hidden, false);
});
