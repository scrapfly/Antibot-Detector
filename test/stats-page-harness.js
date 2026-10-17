'use strict';
/**
 * Shared harness of the Statistics page tests: a small fake DOM built from stats.html, the real page scripts run in a
 * vm context, stubbed chart renderers that record their calls, and a manual clock for timers.
 * Not a test file (no .test.js suffix), so `node --test test/*.test.js` does not run it.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sections/stats/stats.html');
const messages = JSON.parse(read('_locales/en/messages.json'));
const NOW = new Date(2026, 9, 17, 15).getTime();
const DAY = 86400000;
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const flatten = node => [node, ...node.children.flatMap(flatten)];
const textOf = node => [node.textContent || '', ...node.children.map(textOf)].join(' ').replace(/\s+/g, ' ').trim();

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {}; this.handlers = {};
    this.hidden = false; this.value = ''; this.disabled = false; this.tabIndex = 0; this.classes = new Set(); this._text = '';
    this.classList = {
      toggle: (key, on) => { const want = on === undefined ? !this.classes.has(key) : !!on; if (want) this.classes.add(key); else this.classes.delete(key); return want; },
      add: key => this.classes.add(key), remove: key => this.classes.delete(key), contains: key => this.classes.has(key)
    };
  }
  /** Like the DOM: setting the text replaces the children. */
  get textContent() { return this._text; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[camel(key.slice(5))] = String(value);
    if (key === 'class') this.className = value;
  }
  getAttribute(key) { return key in this.attributes ? this.attributes[key] : null; }
  removeAttribute(key) { delete this.attributes[key]; if (key.startsWith('data-')) delete this.dataset[camel(key.slice(5))]; }
  addEventListener(name, handler) {
    (this.handlers[name] = this.handlers[name] || []).push(handler);
    this.events[name] = (...args) => this.handlers[name].map(h => h(...args))[0];
  }
  querySelector(selector) {
    const attr = selector.match(/^(\w+)\[([\w-]+)="([^"]*)"\]$/); // tag[attribute="value"]
    const match = selector.startsWith('.') ? node => node.classes.has(selector.slice(1))
      : attr ? node => node.tagName === attr[1] && node.attributes[attr[2]] === attr[3] : () => false;
    return flatten(this).slice(1).find(match) || null;
  }
  querySelectorAll(selector) {
    const match = selector.startsWith('.') ? selector.split(',').map(s => s.trim().slice(1)) : [];
    return flatten(this).slice(1).filter(node => match.some(name => node.classes.has(name)));
  }
  contains(node) { return flatten(this).includes(node); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { width: 600, height: 40, left: 0, bottom: 40 }; }
}

/** Timers that only move when a test says so. */
function clock() {
  let time = 0, next = 1;
  const timers = new Map();
  const api = {
    setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, due: time + ms, every: 0 }); return id; },
    setInterval: (fn, ms) => { const id = next++; timers.set(id, { fn, due: time + ms, every: ms }); return id; },
    clearTimeout: id => { timers.delete(id); },
    clearInterval: id => { timers.delete(id); },
    get pending() { return timers.size; },
    tick(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) break;
        const [id, timer] = due;
        time = timer.due;
        if (timer.every) timer.due += timer.every; else timers.delete(id);
        timer.fn();
      }
      time = end;
    }
  };
  return api;
}

/** Scripts of the page that this harness runs for real, in the order stats.html lists them. */
function pageScripts() {
  const stubbed = ['stats-charts.js', 'stats-export.js'];
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1])
    .filter(src => (!src.startsWith('../') || src === '../../modules/core/storage-manager.js' || src === '../../utils/format-utils.js') && !stubbed.includes(src))
    .map(src => path.posix.normalize('sections/stats/' + src));
}
const RENDERERS = ['bars', 'line', 'stacked', 'donut', 'heatmap', 'calendar', 'matrix', 'scatter', 'rank', 'segments', 'sparkline'];

/**
 * options: { preferences (extra storage), download (fn), now, language }
 * Returns the DOM, the vm context and helpers. `await init()` has already run when it resolves.
 */
async function createPage(items, options = {}) {
  const { preferences = {}, download = async () => ({ filename: 'test.json' }) } = options;
  let now = options.now === undefined ? NOW : options.now, contentWidth = 600;
  const ids = new Map(), all = [];
  // A small HTML parser: the page code relies on the tree (parents, chip counts inside buttons)
  const VOID = new Set(['meta', 'link', 'img', 'input', 'br', 'hr']);
  const stack = [new Node('#root')];
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (match[5] !== undefined) {
      if (match[5].trim() && stack.length > 1) stack.at(-1).appendChild(Object.assign(new Node('#text'), { textContent: match[5].replace(/\s+/g, ' ') }));
      continue;
    }
    if (match[2] === undefined) continue;
    const tag = match[2].toLowerCase();
    if (match[1]) { if (stack.length > 1 && stack.at(-1).tagName === tag) stack.pop(); continue; }
    const raw = match[3], bare = raw.replace(/"[^"]*"/g, '');
    const node = new Node(tag);
    for (const attr of raw.matchAll(/([\w-]+)="([^"]*)"/g)) {
      node.setAttribute(attr[1], attr[2]);
      if (attr[1] === 'id') { node.id = attr[2]; ids.set(node.id, node); }
      if (attr[1] === 'tabindex') node.tabIndex = Number(attr[2]);
    }
    node.hidden = /(?:^|\s)hidden(?=\s|$|\/)/.test(bare);
    node.disabled = /(?:^|\s)disabled(?=\s|$|\/)/.test(bare);
    all.push(node);
    stack.at(-1).appendChild(node);
    if (!match[4] && !VOID.has(tag)) stack.push(node);
  }
  ids.get('statsDomainSort').value = 'hardest';
  ids.get('statsProtectionSort').value = 'pages';
  ids.get('statsDomainSearch').value = '';
  const listeners = {};
  let init;
  const changes = [], writes = [], chartCalls = [], downloads = [], timers = clock();
  const stored = { scrapfly_history: JSON.stringify({ items }), ...preferences };
  const body = { style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } } };
  const document = {
    documentElement: { dir: 'ltr' }, body, hidden: false,
    getElementById: id => { assert.ok(ids.has(id), 'Missing ID: ' + id); return ids.get(id); },
    querySelectorAll: selector => {
      const match = selector.match(/^\[data-([\w-]+)\]$/);
      assert.ok(match, 'unsupported selector ' + selector);
      return all.filter(node => Object.hasOwn(node.dataset, camel(match[1])));
    },
    // Focus is on the page body until a test moves it; the page asks for one chip by its data-category
    activeElement: body,
    querySelector: selector => {
      const match = selector.match(/^\[data-([\w-]+)="([^"]*)"\]$/);
      return match ? all.find(node => node.dataset[camel(match[1])] === match[2]) || null : null;
    },
    createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
    addEventListener: (name, handler) => { if (name === 'DOMContentLoaded') init = handler; (listeners[name] = listeners[name] || []).push(handler); }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  // The content width the page observes, and the observers it registered
  const observers = [];
  ids.get('statsContent').getBoundingClientRect = () => ({ width: contentWidth, height: 400, left: 0, bottom: 400 });
  const stubs = {};
  for (const key of RENDERERS) stubs[key] = (...args) => { args[0].replaceChildren(); chartCalls.push({ key, args }); };
  stubs.niceScale = max => ({ max: Math.max(4, Math.ceil(max)), step: 1 });
  const context = vm.createContext({ document, Node, Intl, URL, Date: Clock, console, JSON, Math, Number, String, Array, Object, Set, Map, RegExp, Promise, Error,
    window: { innerWidth: 1000, innerHeight: 800, addEventListener() {}, Intl }, location: { reload() { context.reloaded = true; } },
    requestAnimationFrame: fn => fn(), cancelAnimationFrame() {}, Logger: { storage() {}, error() {}, warn() {} },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    ResizeObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
    chrome: { storage: { local: { get: async () => ({ ...stored }), set: async data => { Object.assign(stored, data); writes.push(data); } }, onChanged: { addListener: callback => changes.push(callback) } },
      i18n: { getUILanguage: () => options.language || 'en', getMessage: key => messages[key] && messages[key].message } },
    I18n: { _overrideLocale: null, loadOverride: async () => {}, apply() {},
      tr: (key, fallback) => messages[key] ? messages[key].message : fallback,
      format: (key, ...args) => messages[key] ? args.reduce((s, arg, i) => s.split('{' + i + '}').join(String(arg)), messages[key].message) : null },
    StatsCharts: stubs,
    StatsExport: { download: async (...args) => { downloads.push(args); return download(...args); } } });
  const local = pageScripts().filter(f => f.startsWith('sections/stats/') && !/history-stats|rule-stats|tools-stats/.test(f));
  for (const file of ['modules/core/storage-manager.js', 'utils/format-utils.js', 'sections/stats/history-stats.js', 'sections/stats/rule-stats.js', 'sections/stats/tools-stats.js', ...local]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  await init();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const byData = (key, value) => all.find(node => node.dataset[camel(key)] === String(value));
  const page = {
    ids, context, stored, writes, chartCalls, downloads, changes, timers, listeners, settle, flatten, textOf, all, body,
    button: byData,
    id: id => ids.get(id),
    text: id => textOf(ids.get(id)),
    /** The last call of a chart renderer on a host id. */
    chart: id => chartCalls.findLast(call => call.args[0].id === id),
    charts: id => chartCalls.filter(call => call.args[0].id === id),
    click: (key, value) => { const node = byData(key, value); assert.ok(node, `no [data-${key}="${value}"]`); return node.events.click(); },
    section: name => page.click('section', name),
    days: n => page.click('days', n),
    chip: key => page.click('category', key),
    key: (node, key, extra = {}) => node.events.keydown({ key, preventDefault() {}, ...extra }),
    rows: id => flatten(ids.get(id)).filter(node => node.scope === 'row'),
    visiblePanel: () => ['overview', 'protections', 'domains', 'evidence', 'activity', 'rules', 'tools'].filter(key => !ids.get('stats-panel-' + key).hidden),
    /** Fires a storage change and lets the (fake) debounce and the load finish. */
    async storage(change, patch) {
      Object.assign(stored, patch);
      changes[0](change, 'local');
      timers.tick(500);
      await settle();
    },
    setNow(value) { now = value; },
    resize(width) { contentWidth = width; observers.forEach(callback => callback()); },
    dispatch: (name, event = {}) => (listeners[name] || []).forEach(handler => handler({ preventDefault() {}, ...event })),
    spy(name) {
      const hs = vm.runInContext('HistoryStats', context), original = hs[name];
      const spy = { calls: 0 };
      hs[name] = function(...args) { spy.calls++; return original.apply(this, args); };
      return spy;
    }
  };
  return page;
}

/** A page of the history: `days` ago at noon, with protections as [name, category, confidence?]. */
function entry(host, daysAgo, detections = [], extra = {}) {
  const ts = new Date(NOW);
  ts.setDate(ts.getDate() - daysAgo);
  ts.setHours(11, 30, 0, 0);
  return { timestamp: ts.getTime(), hostname: host, url: `https://${host}/`, ...extra,
    detections: detections.map(([name, category, confidence = 90]) => ({ name, category, confidence, matches: [], combinations: [] })) };
}

module.exports = { createPage, entry, flatten, textOf, messages, NOW, DAY, read, html, camel, pageScripts };
