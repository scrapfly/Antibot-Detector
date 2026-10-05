'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const HistoryStats = require('../sections/stats/history-stats.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const messages = JSON.parse(read('_locales/en/messages.json'));
const NOW = new Date(2026, 9, 3, 15).getTime();
const flatten = node => [node, ...node.children.flatMap(flatten)];
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {};
    this.hidden = false; this.disabled = false; this.value = ''; this.tabIndex = 0; this.classes = new Set();
    this.classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) };
  }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key.startsWith('data-')) this.dataset[dataKey(key.slice(5))] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(key, handler) { this.events[key] = handler; }
  querySelector(selector) {
    if (selector.startsWith('.')) return flatten(this).slice(1).find(node => String(node.className || '').split(' ').includes(selector.slice(1))) || null;
    const match = selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
    return match ? flatten(this).slice(1).find(node => node.dataset[dataKey(match[1])] === match[2]) || null : null;
  }
  get previousElementSibling() {
    const siblings = this.parentNode ? this.parentNode.children : [];
    return siblings[siblings.indexOf(this) - 1] || null;
  }
  get nextElementSibling() {
    const siblings = this.parentNode ? this.parentNode.children : [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  focus() { this.focused = true; }
  scrollIntoView() {}
  getBoundingClientRect() { return { width: 600, height: 40, left: 0, bottom: 40 }; }
}

async function app(items, preferences = {}) {
  const ids = new Map(), buttons = [];
  for (const match of read('sections/stats/stats.html').matchAll(/<(\w+)\b([^>]+)>/g)) {
    const node = new Node(match[1]), attrs = match[2];
    for (const attr of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      node.setAttribute(attr[1], attr[2]);
      if (attr[1] === 'id') { node.id = attr[2]; ids.set(node.id, node); }
    }
    node.hidden = /\bhidden\b/.test(attrs);
    node.disabled = /\bdisabled\b/.test(attrs);
    if (['days', 'section', 'export'].some(key => key in node.dataset)) buttons.push(node);
  }
  ids.get('statsDomainSort').value = 'visits';
  let init;
  const changes = [], chartCalls = [], writes = [], downloads = [];
  const stored = { scrapfly_history: JSON.stringify({ items }), ...preferences };
  const allNodes = () => [...ids.values(), ...buttons].flatMap(flatten);
  const document = {
    documentElement: {}, getElementById: id => { assert.ok(ids.has(id), 'Missing ID: ' + id); return ids.get(id); },
    querySelectorAll: selector => allNodes().filter((node, index, all) => all.indexOf(node) === index && Object.hasOwn(node.dataset, dataKey(selector.slice(6, -1)))),
    createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
    addEventListener: (name, handler) => { if (name === 'DOMContentLoaded') init = handler; }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const context = vm.createContext({ document, Node, HistoryStats, Intl, Date: Clock, console,
    window: { innerWidth: 1000, innerHeight: 800, addEventListener() {} }, location: { reload() {} },
    requestAnimationFrame: callback => callback(), cancelAnimationFrame() {}, Logger: { storage() {}, error() {} },
    chrome: { storage: { local: { get: async () => ({ ...stored }), set: async data => { Object.assign(stored, data); writes.push(data); } }, onChanged: { addListener: callback => changes.push(callback) } },
      i18n: { getUILanguage: () => 'en', getMessage: key => messages[key] && messages[key].message } },
    I18n: { _overrideLocale: null, loadOverride: async () => {}, apply() {},
      tr: (key, fallback) => messages[key] ? messages[key].message : fallback,
      format: (key, ...args) => messages[key] ? args.reduce((s, arg, i) => s.split('{' + i + '}').join(String(arg)), messages[key].message) : null },
    StatsCharts: Object.fromEntries(['line', 'bars', 'donut', 'heatmap', 'matrix', 'scatter', 'stacked'].map(key => [key, (...args) => { args[0].replaceChildren(); chartCalls.push({ key, args }); }])),
    StatsExport: { download: async (...args) => { downloads.push(args); return { filename: 'test.json' }; } }
  });
  vm.runInContext(read('modules/core/storage-manager.js'), context);
  vm.runInContext(read('sections/stats/stats.js'), context);
  await init();
  const button = (key, value) => buttons.find(node => node.dataset[key] === String(value));
  const chart = id => chartCalls.findLast(call => call.args[0].id === id);
  const controls = id => flatten(ids.get(id)).filter(node => node.dataset.chartPageDirection);
  const pageButton = (id, direction) => { const node = controls(id).find(node => node.dataset.chartPageDirection === String(direction)); assert.ok(node, id + ' pagination direction ' + direction); return node; };
  const page = (id, direction) => { const node = pageButton(id, direction); assert.equal(node.disabled, false, id + ' enabled navigation'); node.events.click(); };
  const section = value => button('section', value).events.click();
  const update = async rows => { stored.scrapfly_history = { items: rows }; changes[0]({ scrapfly_history: {} }, 'local'); await new Promise(resolve => setImmediate(resolve)); };
  return { ids, button, chart, controls, pageButton, page, section, update, writes, downloads };
}

function history(days = 90, count = 70) {
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(NOW);
    timestamp.setDate(timestamp.getDate() - (i === count - 1 ? days - 1 : i % days));
    return { timestamp: timestamp.getTime() - 1000, hostname: `domain${String(i).padStart(3, '0')}.example`,
      detections: [{ name: `Protection${String(i).padStart(3, '0')}`, category: 'antibot', confidence: i % 101 }] };
  });
}

const labels = call => Array.from(call.args[1], row => row.label);

test('time charts default to latest shared 30-day page and navigate all 90 days', async () => {
  const ui = await app(history(), { scrapfly_stats_range: 90 });
  const last = labels(ui.chart('statsTimeline'));
  assert.equal(last.length, 30);
  assert.equal(ui.pageButton('statsTimeline', 1).disabled, true);
  assert.equal(ui.pageButton('statsTimeline', -1).disabled, false);
  ui.page('statsTimeline', -1);
  const middle = labels(ui.chart('statsTimeline'));
  assert.equal(middle.length, 30);
  assert.notDeepEqual(middle, last);
  for (const [section, id] of [['activity', 'statsActivityTrend'], ['activity', 'statsHeatmap'], ['protections', 'statsCategoryTrend'], ['confidence', 'statsConfidenceTrend']]) {
    ui.section(section);
    assert.equal(ui.chart(id).args[1].length, 30);
    assert.equal(ui.pageButton(id, -1).dataset.chartPageGroup, ui.pageButton('statsTimeline', -1).dataset.chartPageGroup);
    if (id !== 'statsHeatmap') assert.deepEqual(labels(ui.chart(id)), middle);
  }
  ui.page('statsConfidenceTrend', -1);
  const first = labels(ui.chart('statsConfidenceTrend'));
  assert.equal(first.length, 30);
  assert.equal(ui.pageButton('statsConfidenceTrend', -1).disabled, true);
  assert.equal(new Set([...first, ...middle, ...last]).size, 90);
  ui.page('statsConfidenceTrend', 1);
  assert.deepEqual(labels(ui.chart('statsConfidenceTrend')), middle);
});

test('ranking charts paginate full metrics in 12-row chunks without missing or repeating rows', async () => {
  const ui = await app(history(), { scrapfly_stats_range: 90 });
  for (const [section, id, prefix] of [['protections', 'statsProtectionRanking', 'Protection'], ['domains', 'statsDomainRanking', 'domain']]) {
    ui.section(section);
    const seen = [];
    for (let index = 0; index < 6; index++) {
      const call = ui.chart(id);
      assert.equal(call.args[1].length, index === 5 ? 10 : 12);
      assert.equal(ui.pageButton(id, -1).disabled, index === 0);
      assert.equal(ui.pageButton(id, 1).disabled, index === 5);
      seen.push(...labels(call));
      if (index < 5) ui.page(id, 1);
    }
    assert.equal(seen.length, 70);
    assert.equal(new Set(seen).size, 70);
    assert.ok(seen.every(label => label.startsWith(prefix)));
    ui.page(id, -1);
    assert.deepEqual(labels(ui.chart(id)), seen.slice(48, 60));
  }
});

test('scatter pages every domain in 25-row chunks independently of domain ranking', async () => {
  const ui = await app(history(), { scrapfly_stats_section: 'domains', scrapfly_stats_range: 90 });
  const seen = [];
  for (let index = 0; index < 3; index++) {
    assert.equal(ui.chart('statsDomainScatter').args[1].length, index === 2 ? 20 : 25);
    seen.push(...labels(ui.chart('statsDomainScatter')));
    assert.equal(ui.pageButton('statsDomainScatter', -1).disabled, index === 0);
    assert.equal(ui.pageButton('statsDomainScatter', 1).disabled, index === 2);
    assert.equal(ui.chart('statsDomainRanking').args[1].length, 12);
    if (index < 2) ui.page('statsDomainScatter', 1);
  }
  assert.equal(new Set(seen).size, 70);
  ui.page('statsDomainScatter', -1);
  assert.deepEqual(labels(ui.chart('statsDomainScatter')), seen.slice(25, 50));
});

test('range changes reset time to latest and ranking/scatter to first pages', async () => {
  const ui = await app(history(), { scrapfly_stats_range: 90 });
  ui.page('statsTimeline', -1);
  ui.section('protections');
  ui.page('statsProtectionRanking', 1);
  ui.section('domains');
  ui.page('statsDomainRanking', 1);
  ui.page('statsDomainScatter', 1);
  ui.button('days', 7).events.click();
  for (const [section, id] of [['overview', 'statsTimeline'], ['activity', 'statsActivityTrend'], ['activity', 'statsHeatmap'], ['protections', 'statsCategoryTrend'], ['confidence', 'statsConfidenceTrend']]) {
    ui.section(section);
    assert.equal(ui.chart(id).args[1].length, 7);
    assert.equal(ui.controls(id).length, 0, id + ' hides unnecessary pagination');
  }
  ui.button('days', 90).events.click();
  for (const [section, id] of [['protections', 'statsProtectionRanking'], ['domains', 'statsDomainRanking'], ['domains', 'statsDomainScatter']]) {
    ui.section(section);
    assert.equal(ui.pageButton(id, -1).disabled, true);
  }
  ui.section('overview');
  assert.equal(ui.pageButton('statsTimeline', 1).disabled, true);
});

test('live history shrink clamps each chart to a valid nonempty page', async () => {
  const ui = await app(history(150), { scrapfly_stats_range: 0 });
  ui.page('statsTimeline', -1);
  ui.section('protections');
  for (let i = 0; i < 5; i++) ui.page('statsProtectionRanking', 1);
  ui.section('domains');
  for (let i = 0; i < 5; i++) ui.page('statsDomainRanking', 1);
  ui.page('statsDomainScatter', 1);
  ui.page('statsDomainScatter', 1);
  await ui.update(history(2, 2));
  for (const [section, id] of [['overview', 'statsTimeline'], ['protections', 'statsProtectionRanking'], ['domains', 'statsDomainRanking'], ['domains', 'statsDomainScatter']]) {
    ui.section(section);
    assert.equal(ui.chart(id).args[1].length, 2);
    assert.equal(ui.controls(id).length, 0, id + ' hides unnecessary pagination');
  }
  assert.ok(ui.writes.every(write => !Object.hasOwn(write, 'scrapfly_history')));
});

const localized = (key, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), messages[key].message);

test('365-day history is covered exactly once with a partial oldest page and localized labels', async () => {
  const ui = await app(history(400), { scrapfly_stats_range: 0 });
  const dates = [];
  const label = () => ui.ids.get('statsTimeline').querySelector('.stats-chart-page-label');
  for (let index = 12; index >= 0; index--) {
    const rows = ui.chart('statsTimeline').args[1];
    assert.equal(rows.length, index ? 30 : 5);
    dates.push(...Array.from(rows, row => row.tip[0]));
    const end = 365 - (12 - index) * 30;
    const start = Math.max(0, end - 30);
    assert.equal(label().textContent, localized('statsChartPage', index + 1, 13) + ' · ' + localized('statsChartShowing', start + 1, end, 365));
    assert.equal(label().attributes['aria-live'], 'polite');
    assert.equal(ui.pageButton('statsTimeline', -1).attributes['aria-label'], messages.statsChartPrevious.message);
    assert.equal(ui.pageButton('statsTimeline', 1).attributes['aria-label'], messages.statsChartNext.message);
    if (index) ui.page('statsTimeline', -1);
  }
  assert.equal(new Set(dates).size, 365);
  assert.equal(ui.ids.get('kpiEntries').textContent, '70');
  assert.equal(ui.ids.get('statsTimelineLimit').hidden, false);
});

test('disabled boundary handlers do nothing and keyboard focus remains on the refreshed chart', async () => {
  const ui = await app(history(), { scrapfly_stats_range: 90 });
  const original = labels(ui.chart('statsTimeline'));
  ui.pageButton('statsTimeline', 1).events.click();
  assert.deepEqual(labels(ui.chart('statsTimeline')), original);
  ui.page('statsTimeline', -1);
  assert.equal(ui.pageButton('statsTimeline', -1).focused, true);
  ui.page('statsTimeline', -1);
  assert.equal(ui.ids.get('statsTimeline').querySelector('.stats-chart-page-label').focused, true);
  const oldest = labels(ui.chart('statsTimeline'));
  ui.pageButton('statsTimeline', -1).events.click();
  assert.deepEqual(labels(ui.chart('statsTimeline')), oldest);
  ui.page('statsTimeline', 1);
  ui.page('statsTimeline', 1);
  assert.equal(ui.ids.get('statsTimeline').querySelector('.stats-chart-page-label').focused, true);
});

test('paging retains global rank scales and never narrows KPI or export source', async () => {
  const rows = history();
  for (let i = 0; i < 5; i++) rows.push({ ...rows[0] });
  const ui = await app(rows, { scrapfly_stats_range: 90, scrapfly_stats_section: 'domains' });
  assert.equal(ui.ids.get('kpiEntries').textContent, '75');
  const scale = ui.chart('statsDomainRanking').args[2].fixedMax;
  assert.equal(scale, 6);
  ui.page('statsDomainRanking', 1);
  assert.equal(ui.chart('statsDomainRanking').args[2].fixedMax, scale);
  ui.page('statsDomainScatter', 1);
  ui.section('protections');
  assert.equal(ui.chart('statsProtectionRanking').args[2].fixedMax, 6);
  ui.page('statsProtectionRanking', 1);
  assert.equal(ui.chart('statsProtectionRanking').args[2].fixedMax, 6);
  ui.section('overview');
  ui.page('statsTimeline', -1);
  assert.equal(ui.ids.get('kpiEntries').textContent, '75');
  assert.equal(ui.ids.get('kpiDomains').textContent, '70');
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads.length, 1);
  assert.equal(ui.downloads[0][1].length, 75);
  assert.equal(ui.downloads[0][2].days, 90);
});
