'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const charts = require('../sections/stats/stats-charts.js');
class Element {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this.textContent = ''; this.clientWidth = 640; }
  appendChild(n) { this.children.push(n); return n; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getBoundingClientRect() { return { width: this.clientWidth }; }
  addEventListener(k, fn) { this.events[k] = fn; }
  focus() { this.focused = true; if (this.events.focus) this.events.focus({ target: this }); }
}
const doc = { createElement: tag => new Element(tag, doc), createElementNS: (_, tag) => new Element(tag, doc) };
const host = width => { const n = doc.createElement('div'); if (width !== undefined) n.clientWidth = width; return n; };
const all = n => [n, ...n.children.flatMap(all)];
const find = (n, tag) => all(n).filter(e => e.tagName === tag);
const hits = n => all(n).filter(e => (e.attrs.class || '').split(' ').includes('stats-hit'));
const opts = { title: 'Translated title', emptyLabel: 'Translated empty', formatNumber: (v, d) => d === undefined ? String(v) : v.toFixed(d) };
function finite(n) {
  for (const e of all(n)) for (const [k, v] of Object.entries(e.attrs)) {
    if (['viewBox', 'd', 'x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'stroke-dasharray', 'stroke-dashoffset'].includes(k)) assert.ok(!/NaN|Infinity|undefined/.test(v), `${k}: ${v}`);
  }
}
test('exports the seven methods globally and through Node', () => {
  assert.equal(globalThis.StatsCharts, charts);
  assert.deepEqual(Object.keys(charts), ['bars', 'line', 'stacked', 'donut', 'heatmap', 'matrix', 'scatter']);
});
test('every renderer replaces content and handles empty arrays with caller text', () => {
  for (const key of Object.keys(charts)) {
    const n = host(); n.appendChild(doc.createElement('old'));
    if (key === 'matrix') charts[key](n, [], {}, opts); else charts[key](n, [], opts);
    assert.equal(find(n, 'old').length, 0);
    assert.equal(all(n).find(e => e.attrs.class === 'stats-none').textContent, opts.emptyLabel);
  }
});
test('bars use measured width, minimum 260, zero width for zero and safe labels', () => {
  for (const width of [0, 180, 720]) {
    const n = host(width);
    charts.bars(n, [{ label: '<img onerror=attack()>', value: 0 }, { label: 'b', value: 8 }], opts);
    assert.equal(find(n, 'svg')[0].attrs.viewBox.split(' ')[2], String(Math.max(260, width)));
    assert.equal(find(n, 'rect')[0].attrs.width, '0');
    assert.equal(find(n, 'img').length, 0);
    assert.equal(hits(n)[0].attrs['aria-label'], '<img onerror=attack()>: 0');
    finite(n);
  }
});
test('line splits null gaps including fills and keeps actual zero points', () => {
  const n = host(260);
  charts.line(n, [{ label: 'a', value: 0 }, { label: 'gap', value: null }, { label: 'b', value: 70 }], { ...opts, fixedMax: 100, fill: true });
  assert.equal(find(n, 'path').length, 4);
  assert.equal(hits(n).length, 2);
  assert.equal(hits(n)[0].attrs.cy, '202');
  assert.equal(hits(n)[1].attrs.cy, String(202 - .7 * 186));
  assert.ok(find(n, 'path').filter(p => p.attrs.fill === 'none').every(p => !p.attrs.d.includes('L')));
  finite(n);
});
test('line singleton, all-null and nonfinite values have finite geometry', () => {
  for (const points of [[{ label: 'a', value: 0 }], [{ label: 'a', value: null }], [{ label: 'a', value: Infinity }]]) {
    const n = host(); charts.line(n, points, opts); finite(n);
    assert.equal(hits(n).length, points[0].value === 0 ? 1 : 0);
  }
});
test('stacked ignores missing and zero series without fabricating segments', () => {
  const n = host(260);
  charts.stacked(n, [{ label: 'row', values: { a: 2 } }, { label: 'empty', values: {} }], { ...opts, series: [{ key: 'a', label: 'A', color: '#abc' }, { key: 'b', label: 'B', color: '#def' }] });
  assert.equal(hits(n).length, 1);
  assert.equal(hits(n)[0].attrs.fill, '#abc');
  finite(n);
});
test('donut preserves formatted center and emits all legend classes with true shares', () => {
  const n = host();
  charts.donut(n, [{ label: 'A', value: 3, color: '#abc' }, { label: 'B', value: 1, color: '#def' }], { ...opts, centerValue: '1,234.50%', centerLabel: 'Given label' });
  assert.ok(find(n, 'text').some(e => e.textContent === '1,234.50%'));
  assert.deepEqual(all(n).filter(e => e.attrs.class === 'stats-legend-share').map(e => e.textContent), ['75.0%', '25.0%']);
  assert.equal(hits(n).length, 2);
  finite(n);
  charts.donut(n, [{ label: 'zero', value: 0 }], opts);
  assert.equal(hits(n).length, 0);
  assert.equal(all(n).find(e => e.attrs.class === 'stats-legend-share').textContent, '0.0%');
  finite(n);
});
test('donut remains square in wide hosts and retains full long center text in titles', () => {
  const n = host(566), centerValue = '12345678901234567890', centerLabel = 'A long translated center description';
  charts.donut(n, [{ label: 'A', value: 1 }], { ...opts, centerValue, centerLabel });
  assert.equal(find(n, 'svg')[0].attrs.viewBox, '0 0 220 220');
  assert.equal(find(n, 'circle')[0].attrs.cx, '110');
  const value = all(n).find(e => (e.attrs.class || '').includes('stats-donut-center-value'));
  const caption = all(n).find(e => (e.attrs.class || '').includes('stats-donut-center-label'));
  assert.equal(value.attrs['font-size'], '24');
  assert.equal(caption.attrs['font-size'], '12');
  assert.equal(value.children[0].textContent, centerValue);
  assert.equal(caption.children[0].textContent, centerLabel);
  assert.ok(value.textContent.endsWith('…'));
  finite(n);
});
test('heatmap preserves sparse dates and exact values without invented points', () => {
  const n = host(260);
  charts.heatmap(n, [{ date: '2026-01-01', label: 'one', value: 0 }, { date: '2026-01-09', label: 'nine', value: 2 }], opts);
  assert.equal(hits(n).length, 2);
  assert.deepEqual(hits(n).map(e => e.attrs['data-date']), ['2026-01-01', '2026-01-09']);
  assert.equal(hits(n)[0].attrs['aria-label'], 'one: 0');
  assert.equal(Number(hits(n)[1].attrs.x) - Number(hits(n)[0].attrs.x), 24);
  assert.equal(Number(hits(n)[1].attrs.y) - Number(hits(n)[0].attrs.y), 24);
  finite(n);
});
test('matrix renders zero missing entries and uses supplied key ordering', () => {
  const n = host(720);
  charts.matrix(n, [{ key: 'b', label: 'B' }, { key: 'a', label: 'A' }], { b: { a: 4 } }, opts);
  assert.equal(hits(n).length, 4);
  assert.deepEqual(hits(n).map(e => e.attrs['aria-label']), ['B / B: 0', 'B / A: 4', 'A / B: 0', 'A / A: 0']);
  assert.equal(find(n, 'svg')[0].attrs.viewBox.split(' ')[2], '720');
  finite(n);
});
test('scatter rejects invalid coordinates and accepts singleton zero and negative axes', () => {
  const n = host(260);
  charts.scatter(n, [{ label: 'origin', x: 0, y: 0, radius: 0 }, { label: 'negative', x: -5, y: -10, radius: Infinity }, { label: 'invalid', x: NaN, y: 2 }], { ...opts, xLabel: 'X', yLabel: 'Y' });
  assert.equal(hits(n).length, 2);
  assert.ok(find(n, 'text').some(e => e.textContent === '-10.0'));
  finite(n);
});
test('bars fixedMax retains confidence proportions in both orientations', () => {
  for (const vertical of [false, true]) {
    const n = host(326);
    charts.bars(n, [{ label: 'confidence', value: 20 }], { ...opts, vertical, fixedMax: 100 });
    const rects = find(n, 'rect');
    assert.equal(Number(rects[0].attrs[vertical ? 'height' : 'width']) / Number(rects[1].attrs[vertical ? 'height' : 'width']), .2);
    finite(n);
  }
});
test('vertical histograms and 365-day stacks stay 240 high with all points focusable', () => {
  const n = host(326);
  charts.bars(n, Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: i, color: '#123456' })), { ...opts, vertical: true });
  assert.equal(find(n, 'svg')[0].attrs.height, '240');
  assert.equal(hits(n).length, 24);
  const ticks = find(n, 'text').filter(e => e.attrs.y === '226');
  assert.equal(ticks.length, 4);
  for (let i = 1; i < ticks.length; i++) assert.ok(Number(ticks[i].attrs.x) - Number(ticks[i - 1].attrs.x) >= 60);
  assert.equal(find(n, 'rect')[0].attrs.height, '0');
  assert.equal(find(n, 'rect')[0].attrs.fill, '#123456');
  finite(n);
  charts.stacked(n, Array.from({ length: 365 }, (_, i) => ({ label: String(i), values: { a: i % 3 } })), { ...opts, vertical: true, series: [{ key: 'a', label: 'A', color: '#abc' }] });
  assert.equal(find(n, 'svg')[0].attrs.height, '240');
  assert.equal(hits(n).length, 365);
  assert.equal(hits(n).filter(e => e.attrs.tabindex === '0').length, 1);
  finite(n);
});
test('paged stacked and heatmap preserve whole-range scales', () => {
  for (const vertical of [false, true]) {
    const n = host(326);
    charts.stacked(n, [{ label: 'page', values: { a: 2 } }], { ...opts, vertical, fixedMax: 10, series: [{ key: 'a', label: 'A' }] });
    const r = find(n, 'rect')[0];
    const expected = vertical ? 186 * .2 : (326 - 326 * .4 - 16) * .2;
    assert.equal(Number(r.attrs[vertical ? 'height' : 'width']), expected);
    finite(n);
  }
  for (const fixedMax of [10, 0, -1, Infinity, NaN]) {
    const n = host();
    charts.heatmap(n, [{ date: '2026-01-01', value: 2 }], { ...opts, fixedMax });
    assert.ok(Math.abs(Number(hits(n)[0].attrs['fill-opacity']) - (fixedMax === 10 ? .36 : 1)) < 1e-12);
    finite(n);
  }
});
test('paged scatter honors external maxima without clipping observed points', () => {
  const n = host(326);
  charts.scatter(n, [{ label: 'page', x: 2, y: 4 }], { ...opts, xMax: 10, yMax: 20 });
  assert.equal(Number(hits(n)[0].attrs.cx), 42 + .2 * (326 - 58));
  assert.equal(Number(hits(n)[0].attrs.cy), 202 - .2 * 186);
  charts.scatter(n, [{ label: 'page', x: 12, y: 24 }], { ...opts, xMax: 10, yMax: 20 });
  assert.equal(Number(hits(n)[0].attrs.cx), 310);
  assert.equal(Number(hits(n)[0].attrs.cy), 16);
  for (const invalid of [0, -1, NaN, Infinity]) {
    charts.scatter(n, [{ label: 'page', x: 2, y: 4 }], { ...opts, xMax: invalid, yMax: invalid });
    assert.equal(Number(hits(n)[0].attrs.cx), 310);
    finite(n);
  }
});
test('tooltips use caller lines and roving focus does not intercept Tab', () => {
  const n = host(); let shown, hidden = 0;
  charts.bars(n, [{ label: 'A', value: 1, tip: ['provided', '<safe>'] }, { label: 'B', value: 2 }], { ...opts, onTooltip: (event, lines) => { shown = { event, lines }; }, hideTooltip: () => hidden++ });
  const [a, b] = hits(n);
  assert.deepEqual([a.attrs.tabindex, b.attrs.tabindex], ['0', '-1']);
  const event = { target: a }; a.events.pointerenter(event);
  assert.equal(shown.event, event); assert.deepEqual(shown.lines, ['provided', '<safe>']);
  let prevented = false;
  a.events.keydown({ key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.ok(prevented && b.focused);
  assert.deepEqual([a.attrs.tabindex, b.attrs.tabindex], ['-1', '0']);
  b.events.keydown({ key: 'Tab', preventDefault: () => assert.fail('Tab must remain native') });
  b.events.blur(); assert.equal(hidden, 2);
  assert.equal(find(n, 'svg')[0].attrs['aria-label'], opts.title);
});
