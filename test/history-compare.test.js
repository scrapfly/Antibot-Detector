'use strict';
// History → … → Compare with…: the same page's other scans, and what changed between two of them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const C = require('../modules/core/history-compare.js');

const det = (name, category, confidence, types = []) => ({ detector: { name }, category, confidence, matches: types.map(type => ({ type })) });
const entry = (id, url, at, detections) => ({ id, url, hostname: new URL(url).hostname, timestamp: at, detections });
const T0 = Date.UTC(2026, 9, 19, 9);
const HOUR = 3600000;

test('the page of an entry is its address without the query and the fragment, like the recorder\'s change mark', () => {
  const sandbox = vm.createContext({ console, URL, Logger: new Proxy({}, { get: () => () => {} }), UrlUtils: { getHostnameFromUrl: u => { try { return new URL(u).hostname; } catch (_) { return ''; } } } });
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(path.join(root, 'background/history-recorder.js'), 'utf8') + '\n;globalThis.HistoryRecorder = HistoryRecorder;', sandbox);
  for (const [url, hostname] of [
    ['https://Shop.Example/cart?id=3#top', 'shop.example'], ['http://a.example:8080/x/y/', 'a.example'], ['https://a.example', 'a.example'],
    ['not a url', 'fallback.example'], ['', 'only.example'], ['', ''], ['chrome-extension://abc/popup.html', 'abc']
  ]) {
    const expected = sandbox.HistoryRecorder.normalizeDuplicateKey(url, hostname, 'path');
    assert.strictEqual(C.pageKey({ url, hostname }) || null, expected, `${url} | ${hostname}`);
  }
});

test('others(): the same page\'s other entries, newest first; never the entry itself or another page', () => {
  const a = entry('a', 'https://s.example/cart?x=1', T0, []);
  const items = [a, entry('b', 'https://s.example/cart?x=2', T0 + HOUR, []), entry('c', 'https://s.example/cart', T0 - HOUR, []),
    entry('d', 'https://s.example/other', T0 + 2 * HOUR, []), entry('e', 'https://t.example/cart', T0 + 3 * HOUR, []), null];
  assert.deepEqual(C.others(items, a).map(i => i.id), ['b', 'c']);
  assert.deepEqual(C.others(items, { id: 'x', url: '', hostname: '' }), []);
  assert.deepEqual(C.others(null, a), []);
});

test('compare(): added, removed, changed and unchanged, with the earlier scan first whatever the order given', () => {
  const earlier = entry('old', 'https://s.example/', T0, [
    det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  const later = entry('new', 'https://s.example/', T0 + HOUR, [
    det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  for (const [x, y] of [[earlier, later], [later, earlier]]) {
    const r = C.compare(x, y);
    assert.equal(r.earlier.id, 'old'); assert.equal(r.later.id, 'new');
    assert.deepEqual(r.added.map(d => d.name), ['DataDome']);
    assert.deepEqual(r.removed.map(d => d.name), ['Akamai']);
    assert.deepEqual(r.changed, [{ name: 'Cloudflare', category: 'antibot', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: [] }]);
    assert.deepEqual(r.same.map(d => d.name), ['Turnstile', 'Canvas Fingerprint'], 'anti-bot and CAPTCHA before fingerprinting');
    assert.equal(r.identical, false);
  }
});

test('compare(): names match without case, a missing score is not a change, evidence alone is', () => {
  const a = entry('a', 'https://s.example/', T0, [det('DataDome', 'Anti-Bot', null, ['cookie']), det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('DATADOME', 'Anti-Bot', 90, ['cookie']), det('kasada', 'Anti-Bot', 80, ['headers', 'urls'])]);
  const r = C.compare(a, b);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed, []);
  const dd = r.changed.find(row => row.name === 'DATADOME');
  assert.equal(dd, undefined, 'no score on one side and the same evidence: not a change');
  assert.ok(r.same.some(row => row.name === 'DATADOME'));
  const k = r.changed.find(row => row.name === 'kasada');
  assert.deepEqual(k.methodsAdded, ['header'], 'plural legacy type names are read as header and url');
  assert.deepEqual(k.methodsRemoved, []);
  assert.equal(k.delta, 0);
});

test('compare(): two identical scans say so, and odd entries do not throw', () => {
  const a = entry('a', 'https://s.example/', T0, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  assert.equal(C.compare(a, b).identical, true);
  assert.doesNotThrow(() => C.compare({ id: 'x' }, { id: 'y', detections: [null, 'Cloudflare', {}] }));
  assert.equal(C.compare({}, {}).identical, true);
});

test('changeText(): the confidence move and the evidence, translated through the callbacks it is given', () => {
  const row = { name: 'Cloudflare', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: ['dom'] };
  assert.equal(C.changeText(row), '70% → 95% (+25) · New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, from: 90, to: 60, delta: -30, methodsAdded: [], methodsRemoved: [] }), '90% → 60% (−30)');
  const t = (key, fallback, ...args) => `[${key}:${args.join(',')}]`;
  assert.equal(C.changeText(row, { t, methodLabel: m => m.toUpperCase() }), '[historyCompareChangeFmt:70,95,+25] · [historyCompareEvidenceAddedFmt:HEADER] · [historyCompareEvidenceRemovedFmt:DOM]');
});

test('toMarkdown(): a heading, the range and one section per kind of difference, escaped', () => {
  const a = entry('a', 'https://s.example/cart', T0, [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Pipe|Name', 'CAPTCHA', 90)]);
  const b = entry('b', 'https://s.example/cart', T0 + HOUR, [det('![x](https://t.example/p.gif)', 'Anti-Bot', 80, ['cookie']), det('Pipe|Name', 'CAPTCHA', 70)]);
  const md = C.toMarkdown(C.compare(a, b), { host: 's.example', address: 'https://s.example/cart' });
  assert.ok(md.startsWith('## Compare scans: s.example\n\nhttps://s.example/cart\n\nFrom 2026-10-19 09:00 to 2026-10-19 10:00\n'), md.slice(0, 120));
  assert.ok(md.includes('### Added\n- !\\[x\\](https://t.example/p.gif) (antibot, 80%)'), md);
  assert.ok(md.includes('### Removed\n- Akamai (antibot, 85%)'));
  assert.ok(md.includes('### Changed\n- Pipe\\|Name (captcha): 90% → 70% (−20)'));
  assert.ok(!md.includes('### Unchanged'));
  const same = C.toMarkdown(C.compare(a, a), { host: 's.example' });
  assert.ok(same.includes('These two scans found the same protections'), same);
  assert.ok(same.includes('### Unchanged'));
});

test('pickDefault(): the scan just before this entry, else the first one after it', () => {
  const mine = entry('m', 'https://s.example/', T0 + 5 * HOUR, []);
  const list = C.others([mine, entry('a', 'https://s.example/', T0, []), entry('b', 'https://s.example/', T0 + 3 * HOUR, []), entry('c', 'https://s.example/', T0 + 9 * HOUR, [])], mine);
  assert.equal(C.pickDefault(list, mine).id, 'b', 'the previous scan');
  const first = entry('f', 'https://s.example/', T0 - HOUR, []);
  const after = C.others([first, entry('x', 'https://s.example/', T0 + HOUR, []), entry('y', 'https://s.example/', T0 + 4 * HOUR, [])], first);
  assert.equal(C.pickDefault(after, first).id, 'x', 'no earlier scan: the next one');
  assert.equal(C.pickDefault([], first), null);
  assert.equal(C.pickDefault(null, first), null);
});
