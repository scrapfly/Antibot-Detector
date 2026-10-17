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
// Same fake, but style behaves like CSSStyleDeclaration: setProperty records into props (the real-browser path of paint and setVar).
const realDoc = { createElement: tag => realElement(tag), createElementNS: (_, tag) => realElement(tag) };
function realElement(tag) { const n = new Element(tag, realDoc); n.style = { props: {}, setProperty(key, value) { this.props[key] = value; } }; return n; }
const realHost = width => { const n = realElement('div'); if (width !== undefined) n.clientWidth = width; return n; };
const host = width => { const n = doc.createElement('div'); if (width !== undefined) n.clientWidth = width; return n; };
const all = n => [n, ...n.children.flatMap(all)];
const find = (n, tag) => all(n).filter(e => e.tagName === tag);
const hits = n => all(n).filter(e => (e.attrs.class || '').split(' ').includes('stats-hit'));
const opts = { title: 'Translated title', emptyLabel: 'Translated empty', formatNumber: (v, d) => d === undefined ? String(v) : v.toFixed(d) };
function finite(n) {
  for (const e of all(n)) for (const [k, v] of Object.entries(e.attrs)) {
    if (['viewBox', 'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'opacity', 'fill-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'data-w'].includes(k)) assert.ok(!/NaN|Infinity|undefined/.test(v), `${k}: ${v}`);
  }
}
const KEYS = ['bars', 'line', 'stacked', 'donut', 'heatmap', 'calendar', 'matrix', 'scatter', 'rank', 'segments', 'sparkline', 'niceScale'];
test('exports the twelve methods globally and through Node, heatmap is the calendar', () => {
  assert.equal(globalThis.StatsCharts, charts);
  assert.deepEqual(Object.keys(charts), KEYS);
  assert.equal(charts.heatmap, charts.calendar);
});
test('every renderer replaces content and handles empty arrays with caller text', () => {
  for (const key of KEYS.filter(k => !['sparkline', 'niceScale'].includes(k))) {
    let hidden = 0;
    const n = host(); n.appendChild(doc.createElement('old'));
    const withHide = { ...opts, hideTooltip: () => hidden++ };
    if (key === 'matrix') charts[key](n, [], {}, withHide); else charts[key](n, [], withHide);
    assert.equal(find(n, 'old').length, 0, key);
    assert.equal(all(n).find(e => e.attrs.class === 'stats-none').textContent, opts.emptyLabel, key);
    assert.ok(hidden >= 1, `${key} hides the tooltip`);
  }
});
test('segments with a zero total, and rank rows without objects, show the caller empty label', () => {
  const n = host();
  charts.segments(n, [{ label: 'A', value: 0 }, { label: 'B', value: -3 }, { label: 'C', value: NaN }], opts);
  assert.equal(find(n, 'svg').length, 0);
  assert.equal(all(n).find(e => e.attrs.class === 'stats-none').textContent, opts.emptyLabel);
  charts.rank(n, [null, undefined], opts);
  assert.equal(all(n).find(e => e.attrs.class === 'stats-none').textContent, opts.emptyLabel);
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
test('paged stacked preserves whole-range scales', () => {
  for (const vertical of [false, true]) {
    const n = host(326);
    charts.stacked(n, [{ label: 'page', values: { a: 2 } }], { ...opts, vertical, fixedMax: 10, series: [{ key: 'a', label: 'A' }] });
    const r = find(n, 'rect')[0];
    const expected = vertical ? 186 * .2 : (326 - 326 * .4 - 16) * .2;
    assert.equal(Number(r.attrs[vertical ? 'height' : 'width']), expected);
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

// ---- paint, setVar, summary ------------------------------------------------------------------------------------
test('hex colours stay attributes, var() and color-mix() become style declarations in every renderer', () => {
  const css = 'var(--ink-antibot)', mixed = 'color-mix(in srgb, red 40%, blue)';
  const series = [{ key: 'a', label: 'A', color: css }, { key: 'b', label: 'B', color: mixed }];
  const runs = [
    n => charts.bars(n, [{ label: 'a', value: 2, color: css }], { ...opts, vertical: true }),
    n => charts.bars(n, [{ label: 'a', value: 2, color: css }], opts),
    n => charts.line(n, [{ label: 'a', value: 1 }, { label: 'b', value: 3 }], { ...opts, color: css, fill: true }),
    n => charts.stacked(n, [{ label: 'a', values: { a: 1, b: 2 } }], { ...opts, vertical: true, series }),
    n => charts.stacked(n, [{ label: 'a', values: { a: 1, b: 2 } }], { ...opts, series }),
    n => charts.donut(n, [{ label: 'a', value: 1, color: css }, { label: 'b', value: 2, color: mixed }], opts),
    n => charts.calendar(n, [{ date: '2026-01-01', value: 1 }], { ...opts, color: css }),
    n => charts.matrix(n, [{ key: 'a', label: 'A', color: css }], { a: { a: 1 } }, opts),
    n => charts.scatter(n, [{ label: 'a', x: 1, y: 1 }], { ...opts, color: css }),
    n => charts.segments(n, [{ label: 'a', value: 1, color: css }], opts)
  ];
  const isCss = value => /^(var|color-mix)\(/.test(value || '');
  runs.forEach((run, i) => {
    const n = host(); run(n);
    assert.equal(all(n).filter(e => isCss(e.attrs.fill) || isCss(e.attrs.stroke)).length, 0, `run ${i} leaked a CSS function into an attribute`);
    assert.ok(all(n).filter(e => isCss(e.style.fill) || isCss(e.style.stroke)).length >= 1, `run ${i} painted through style`);
    const r = realHost(); run(r);
    assert.ok(all(r).filter(e => isCss((e.style.props || {}).fill) || isCss((e.style.props || {}).stroke)).length >= 1, `run ${i} uses style.setProperty when present`);
  });
  const n = host();
  charts.bars(n, [{ label: 'a', value: 2, color: css }, { label: 'b', value: 3, color: '#123456' }], { ...opts, vertical: true });
  const [first, , second] = find(n, 'rect');
  assert.equal(first.style.fill, css); assert.equal(first.attrs.fill, undefined);
  assert.equal(second.attrs.fill, '#123456'); assert.equal(second.style.fill, undefined);
});
test('svg summary becomes a desc referenced by aria-describedby, and is absent otherwise', () => {
  const n = host();
  charts.bars(n, [{ label: 'a', value: 1 }], { ...opts, summary: 'Three days, peak on Monday' });
  const svg = find(n, 'svg')[0], desc = find(n, 'desc')[0];
  assert.equal(desc.textContent, 'Three days, peak on Monday');
  assert.equal(svg.attrs['aria-describedby'], desc.attrs.id);
  assert.deepEqual(svg.children.slice(0, 2).map(e => e.tagName), ['title', 'desc']);
  const second = host();
  charts.line(second, [{ label: 'a', value: 1 }], { ...opts, summary: 'x' });
  assert.notEqual(find(second, 'desc')[0].attrs.id, desc.attrs.id);
  charts.bars(n, [{ label: 'a', value: 1 }], opts);
  assert.equal(find(n, 'desc').length, 0);
  assert.equal(find(n, 'svg')[0].attrs['aria-describedby'], undefined);
});

// ---- niceScale and the grid ------------------------------------------------------------------------------------
test('niceScale returns four round intervals for the documented vectors', () => {
  const cases = [[0, { max: 4, step: 1 }], [3, { max: 4, step: 1 }], [9.8, { max: 12, step: 3 }], [13, { max: 16, step: 4 }], [168, { max: 200, step: 50 }], [1382, { max: 1600, step: 400 }], [100, { max: 100, step: 25 }]];
  for (const [input, expected] of cases) assert.deepEqual(charts.niceScale(input), expected, String(input));
  assert.deepEqual(charts.niceScale(0.4, { integer: false }), { max: 0.4, step: 0.1 });
  for (const bad of [-5, NaN, Infinity, undefined, null, 'x']) assert.deepEqual(charts.niceScale(bad), { max: 4, step: 1 });
  for (let max = 1; max < 5000; max += 7) {
    const { max: top, step } = charts.niceScale(max);
    assert.ok(top >= max && top === 4 * step && Number.isInteger(step), `${max} -> ${top}`);
  }
});
const ticksOf = n => all(n).filter(e => e.attrs.class === 'stats-axis-label' && e.attrs.x === '36' && e.attrs['text-anchor'] === 'end').map(e => e.textContent);
test('grid ticks: auto max is niceScaled, fixedMax is literal, formatTick and integer are honoured', () => {
  let n = host();
  charts.bars(n, [{ label: 'a', value: 0 }, { label: 'b', value: 9.8 }], { ...opts, vertical: true });
  assert.deepEqual(ticksOf(n), ['0', '3', '6', '9', '12']);
  assert.equal(find(n, 'line').length, 5);
  n = host();
  charts.bars(n, [{ label: 'a', value: 20 }], { ...opts, vertical: true, fixedMax: 100 });
  assert.deepEqual(ticksOf(n), ['0', '25', '50', '75', '100']);
  n = host();
  charts.bars(n, [{ label: 'a', value: 2 }], { ...opts, vertical: true, fixedMax: 10 });
  assert.deepEqual(ticksOf(n), ['0', '2.5', '5', '7.5', '10']);
  n = host();
  charts.bars(n, [{ label: 'a', value: 0.4 }], { ...opts, vertical: true, integer: false });
  assert.deepEqual(ticksOf(n), ['0', '0.1', '0.2', '0.3', '0.4']);
  n = host();
  charts.line(n, [{ label: 'a', value: 50 }, { label: 'b', value: 90 }], { ...opts, formatTick: v => `${v}%` });
  assert.deepEqual(ticksOf(n), ['0%', '25%', '50%', '75%', '100%']);
  n = host();
  charts.stacked(n, [{ label: 'a', values: { a: 3 } }], { ...opts, vertical: true, series: [{ key: 'a', label: 'A' }] });
  assert.deepEqual(ticksOf(n), ['0', '1', '2', '3', '4']);
  n = host();
  charts.bars(n, [{ label: 'a', value: 0 }], { ...opts, vertical: true });
  assert.deepEqual(ticksOf(n), ['0', '1', '2', '3', '4']);
  finite(n);
});
test('the grid max drives bar heights, so a niceScaled axis keeps proportions', () => {
  const n = host();
  charts.bars(n, [{ label: 'a', value: 6 }, { label: 'b', value: 12 }], { ...opts, vertical: true });
  const rects = find(n, 'rect');
  assert.equal(Number(rects[2].attrs.height), 186);
  assert.equal(Number(rects[0].attrs.height), 93);
});

// ---- hit(): structured lines, touch, keyboard -------------------------------------------------------------------
test('tooltip lines may be { label, value, color } objects, passed through untouched', () => {
  const n = host(); let shown;
  const a = { label: 'Anti-bot', value: '3', color: 'var(--ink-antibot)' }, b = { label: 'CAPTCHA', value: '2' };
  charts.bars(n, [{ label: 'Mon', value: 5, tip: ['Mon 12', a, b] }, { label: 'Tue', value: 1, tip: a }], { ...opts, onTooltip: (event, lines) => { shown = lines; } });
  const [first, second] = hits(n);
  first.events.pointerenter({});
  assert.equal(shown[1], a); assert.equal(shown[2], b); assert.equal(shown[0], 'Mon 12');
  assert.equal(first.attrs['aria-label'], 'Mon 12: Anti-bot: 3, CAPTCHA: 2');
  second.events.focus({});
  assert.deepEqual(shown, [a]);
  assert.equal(second.attrs['aria-label'], 'Anti-bot: 3');
  assert.equal(a.value, '3');
});
test('hit nodes carry the label in aria-label only: no per-node title child', () => {
  const n = host();
  charts.bars(n, [{ label: 'a', value: 1 }], { ...opts, vertical: true });
  charts.line(n, [{ label: 'a', value: 1 }], opts);
  for (const h of hits(n)) assert.ok(h.children.every(c => c.tagName !== 'title'), h.attrs['aria-label']);
  assert.equal(find(n, 'svg')[0].children[0].tagName, 'title');
});
test('touch pointerleave keeps the tooltip, mouse pointerleave and blur hide it', () => {
  const n = host(); let hidden = 0;
  charts.bars(n, [{ label: 'a', value: 1 }], { ...opts, hideTooltip: () => hidden++ });
  const [a] = hits(n); const base = hidden;
  a.events.pointerleave({ pointerType: 'touch' }); assert.equal(hidden, base);
  a.events.pointerleave({ pointerType: 'mouse' }); assert.equal(hidden, base + 1);
  a.events.pointerleave(); assert.equal(hidden, base + 2);
  a.events.blur(); assert.equal(hidden, base + 3);
});
const press = (node, key) => { let prevented = false; node.events.keydown({ key, preventDefault: () => { prevented = true; } }); return prevented; };
test('without neighbours the arrow keys wrap and Home/End jump', () => {
  const n = host();
  charts.bars(n, [{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }], opts);
  const [a, b, c] = hits(n);
  press(a, 'ArrowLeft'); assert.ok(c.focused);
  press(c, 'Home'); assert.ok(a.focused);
  press(a, 'End'); assert.equal(c.attrs.tabindex, '0'); assert.equal(a.attrs.tabindex, '-1');
  assert.equal(press(b, 'PageDown'), false); assert.equal(b.focused, undefined);
});

// ---- bars: vertical extras -----------------------------------------------------------------------------------
const labelsOf = n => all(n).filter(e => (e.attrs.class || '').includes('stats-bar-value'));
test('vertical bars are rounded: rx = min(3, width / 2)', () => {
  let n = host(326);
  charts.bars(n, [{ label: 'a', value: 1 }, { label: 'b', value: 2 }], { ...opts, vertical: true });
  assert.equal(find(n, 'rect')[0].attrs.rx, '3');
  n = host(326);
  charts.bars(n, Array.from({ length: 90 }, (_, i) => ({ label: String(i), value: i })), { ...opts, vertical: true });
  const bar = find(n, 'rect')[0];
  assert.equal(Number(bar.attrs.rx), Number(bar.attrs.width) / 2);
  finite(n);
});
test('valueLabels: auto labels every bar when slots are wide, only the first maximum when narrow', () => {
  let n = host(640);
  charts.bars(n, [{ label: 'a', value: 1 }, { label: 'b', value: 5 }, { label: 'c', value: 5 }], { ...opts, vertical: true });
  assert.deepEqual(labelsOf(n).map(e => e.textContent), ['1', '5', '5']);
  assert.ok(labelsOf(n).every(e => e.attrs['text-anchor'] === 'middle' && e.attrs.class === 'stats-axis-label stats-bar-value'));
  n = host(326);
  charts.bars(n, Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: i === 7 ? 40 : i })), { ...opts, vertical: true });
  assert.deepEqual(labelsOf(n).map(e => e.textContent), ['40']);
  const peak = labelsOf(n)[0], bar = find(n, 'rect')[7 * 2];
  assert.ok(Math.abs(Number(peak.attrs.y) - (Number(bar.attrs.y) - 4)) < 1e-9);
  assert.ok(Math.abs(Number(peak.attrs.x) - (Number(bar.attrs.x) + Number(bar.attrs.width) / 2)) < 1e-9);
  n = host(326);
  charts.bars(n, Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: 1 })), { ...opts, vertical: true, valueLabels: true });
  assert.equal(labelsOf(n).length, 24);
  n = host(640);
  charts.bars(n, [{ label: 'a', value: 1 }, { label: 'b', value: 5 }], { ...opts, vertical: true, valueLabels: false });
  assert.equal(labelsOf(n).length, 0);
  n = host(326);
  charts.bars(n, Array.from({ length: 24 }, () => ({ label: 'z', value: 0 })), { ...opts, vertical: true });
  assert.equal(labelsOf(n).length, 0);
});
test('value labels clamp inside the plot and never take the pointer', () => {
  const n = host(640);
  charts.bars(n, [{ label: 'a', value: 10 }], { ...opts, vertical: true, fixedMax: 10 });
  assert.equal(labelsOf(n)[0].attrs.y, '12');
  assert.equal(labelsOf(n)[0].attrs['pointer-events'], 'none');
  finite(n);
});
test('highlight max marks the peak and dims the rest', () => {
  const n = host(640);
  charts.bars(n, [{ label: 'a', value: 1 }, { label: 'b', value: 5 }, { label: 'c', value: 3 }], { ...opts, vertical: true, highlight: 'max' });
  const bars = [find(n, 'rect')[0], find(n, 'rect')[2], find(n, 'rect')[4]];
  assert.deepEqual(bars.map(b => b.attrs['data-peak']), [undefined, '1', undefined]);
  assert.deepEqual(bars.map(b => b.attrs.opacity), ['0.72', undefined, '0.72']);
  const flat = host(640);
  charts.bars(flat, [{ label: 'a', value: 0 }], { ...opts, vertical: true, highlight: 'max' });
  assert.equal(find(flat, 'rect')[0].attrs.opacity, undefined);
});
test('partial points are dashed, translucent and tooltipped by the caller', () => {
  const n = host(640);
  charts.bars(n, [{ label: 'a', value: 2, color: '#123456' }, { label: 'today', value: 1, color: '#123456', partial: true, tip: ['Today (still counting)'] }], { ...opts, vertical: true, highlight: 'max' });
  const [full, , partial] = find(n, 'rect');
  assert.equal(partial.attrs.class, 'is-partial');
  assert.equal(partial.attrs.opacity, '0.5');
  assert.equal(partial.attrs['stroke-dasharray'], '3 3');
  assert.equal(partial.attrs.stroke, partial.attrs.fill);
  assert.equal(full.attrs.class, undefined);
  assert.equal(hits(n)[1].attrs['aria-label'], 'Today (still counting)');
  const css = host(640);
  charts.bars(css, [{ label: 'today', value: 1, color: 'var(--s-series)', partial: true }], { ...opts, vertical: true });
  assert.equal(find(css, 'rect')[0].style.stroke, 'var(--s-series)');
  assert.equal(find(css, 'rect')[0].attrs.stroke, undefined);
});
test('average draws a trailing mean path after the bars, skips partial points and ignores the pointer', () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ label: String(i), value: i + 1 }));
  let n = host(640);
  charts.bars(n, points, { ...opts, vertical: true, average: { window: 7 } });
  const avg = all(n).find(e => e.attrs.class === 'stats-avg-line');
  assert.equal(avg.attrs.fill, 'none');
  assert.equal(avg.attrs['pointer-events'], 'none');
  assert.equal(avg.attrs.d.split('L').length, 10);
  assert.ok(avg.attrs.d.startsWith('M'));
  const svg = find(n, 'svg')[0];
  assert.ok(svg.children.indexOf(avg) > svg.children.findLastIndex(e => e.tagName === 'g'));
  const slot = (640 - 58) / 10, last = avg.attrs.d.split('L').pop().split(' ').map(Number);
  assert.equal(last[0], 42 + 9.5 * slot);
  assert.ok(Math.abs(last[1] - (202 - 7 / 12 * 186)) < 1e-9, 'mean of 4..10 is 7 on a 0..12 axis');
  const first = avg.attrs.d.slice(1).split('L')[0].split(' ').map(Number);
  assert.ok(Math.abs(first[1] - (202 - 1 / 12 * 186)) < 1e-9, 'first point is its own mean');
  n = host(640);
  charts.bars(n, points.map((p, i) => ({ ...p, partial: i === 9 })), { ...opts, vertical: true, average: { window: 7 } });
  assert.equal(all(n).find(e => e.attrs.class === 'stats-avg-line').attrs.d.split('L').length, 9);
  n = host(640);
  charts.bars(n, [{ label: 'a', value: 1 }], { ...opts, vertical: true, average: { window: 7 } });
  assert.equal(all(n).filter(e => e.attrs.class === 'stats-avg-line').length, 0);
  n = host(640);
  charts.bars(n, points, { ...opts, vertical: true });
  assert.equal(all(n).filter(e => e.attrs.class === 'stats-avg-line').length, 0);
  assert.equal(hits(n).length, 10);
});
test('horizontal bars keep their geometry and ignore the vertical-only options', () => {
  const n = host(326);
  charts.bars(n, [{ label: 'a', value: 5, partial: true }, { label: 'b', value: 10 }], { ...opts, highlight: 'max', average: { window: 7 }, valueLabels: true });
  assert.equal(labelsOf(n).length, 0);
  assert.equal(all(n).filter(e => e.attrs.class === 'stats-avg-line').length, 0);
  assert.equal(find(n, 'svg')[0].attrs.height, '100');
  assert.equal(find(n, 'rect')[0].attrs.rx, '3');
  assert.equal(find(n, 'rect')[0].attrs.opacity, undefined);
});

// ---- stacked: vertical extras --------------------------------------------------------------------------------
test('stacked vertical segments carry stats-seg, rx only when tall, partial rows are translucent', () => {
  const n = host(640);
  charts.stacked(n, [{ label: 'a', values: { a: 100, b: 1 } }, { label: 'today', values: { a: 50 }, partial: true }], { ...opts, vertical: true, series: [{ key: 'a', label: 'A', color: '#abc' }, { key: 'b', label: 'B', color: 'var(--ink-captcha)' }] });
  const segs = all(n).filter(e => (e.attrs.class || '').split(' ').includes('stats-seg'));
  assert.equal(segs.length, 3);
  assert.equal(segs[0].attrs.rx, '2');
  assert.equal(segs[1].attrs.rx, undefined, 'a segment under 6px stays square');
  assert.equal(segs[1].style.fill, 'var(--ink-captcha)');
  assert.equal(segs[2].attrs.class, 'stats-seg is-partial');
  assert.equal(segs[2].attrs.opacity, '0.5');
  assert.equal(segs[0].attrs.opacity, undefined);
  assert.equal(hits(n).length, 2);
  finite(n);
});
test('stacked tooltips accept structured rows from the caller', () => {
  const n = host(640); let shown;
  const row = { label: 'Anti-bot', value: '4', color: 'var(--ink-antibot)' };
  charts.stacked(n, [{ label: 'Mon', values: { a: 4 }, tip: ['Mon', row] }], { ...opts, vertical: true, series: [{ key: 'a', label: 'A' }], onTooltip: (event, lines) => { shown = lines; } });
  hits(n)[0].events.pointerenter({});
  assert.equal(shown[1], row);
});

// ---- calendar ------------------------------------------------------------------------------------------------
const cells = n => hits(n).filter(e => (e.attrs.class || '').includes('stats-cal-cell'));
const cellRect = cell => cell.children.find(e => e.tagName === 'rect');
const dayKeys = (offset, count) => Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 0, 1 + offset + i)).toISOString().slice(0, 10));
const calendarOf = (count, value = i => i + 1, extra = {}, width = 640) => {
  const n = host(width);
  charts.calendar(n, dayKeys(0, count).map((date, i) => ({ date, label: date, value: value(i) })), { ...opts, ...extra });
  return n;
};
test('calendar month mode: 58 x 52 pitch, viewBox 400, weekday header, no leading blanks', () => {
  const n = host(640);
  charts.calendar(n, [{ date: '2026-01-01', label: 'one', value: 0 }, { date: '2026-01-09', label: 'nine', value: 2 }], { ...opts, weekdayLabels: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] });
  assert.equal(hits(n).length, 2);
  assert.deepEqual(hits(n).map(e => e.attrs['data-date']), ['2026-01-01', '2026-01-09']);
  assert.equal(hits(n)[0].attrs['aria-label'], 'one: 0');
  assert.equal(hits(n)[0].tagName, 'g');
  const [a, b] = cells(n).map(cellRect);
  assert.equal(Number(b.attrs.x) - Number(a.attrs.x), 58);
  assert.equal(Number(b.attrs.y) - Number(a.attrs.y), 52);
  assert.deepEqual([a.attrs.x, a.attrs.y, a.attrs.width, a.attrs.height, a.attrs.rx], ['174', '18', '52', '46', '8']);
  const svg = find(n, 'svg')[0];
  assert.equal(svg.attrs.viewBox, '0 0 400 122');
  assert.equal(svg.style.maxWidth, '400px');
  assert.equal(svg.attrs.width, '100%');
  assert.equal(svg.attrs.height, '122');
  assert.equal(cells(n).length, 2, 'blank cells are not drawn');
  const head = all(n).filter(e => (e.attrs.class || '').includes('stats-cal-head'));
  assert.deepEqual(head.map(e => e.textContent), ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  assert.deepEqual(head.map(e => e.attrs.x), ['26', '84', '142', '200', '258', '316', '374']);
  assert.ok(head.every(e => e.attrs['text-anchor'] === 'middle'));
  finite(n);
});
test('calendar month cells show the day of the month and the value, bright cells flip to on-fill', () => {
  const n = calendarOf(10, i => i);
  const cell = cells(n)[9];
  assert.equal(cell.children.find(e => (e.attrs.class || '').startsWith('stats-cal-day')).textContent, '10');
  assert.equal(cell.children.find(e => (e.attrs.class || '').startsWith('stats-cal-day')).attrs.class, 'stats-cal-day on-fill', 'the day number flips with the value on bright cells');
  assert.equal(cells(n)[2].children.find(e => (e.attrs.class || '').startsWith('stats-cal-day')).attrs.class, 'stats-cal-day');
  const values = cell.children.filter(e => (e.attrs.class || '').startsWith('stats-cal-val'));
  assert.equal(values.length, 1); assert.equal(values[0].textContent, '9');
  assert.equal(values[0].attrs['text-anchor'], 'end');
  assert.ok(values[0].attrs.class.includes('on-fill'));
  assert.equal(cells(n)[0].children.filter(e => (e.attrs.class || '').startsWith('stats-cal-val')).length, 0, 'zero cells print no value');
  const low = cells(n)[2].children.find(e => (e.attrs.class || '').startsWith('stats-cal-val'));
  assert.ok(!low.attrs.class.includes('on-fill'));
});
test('calendar levels: one level per distinct value up to four, quartiles beyond, zero is lv0, fixedMax is ignored', () => {
  const lv = n => cells(n).map(c => c.attrs.class.match(/lv(\d)/)[1]).join('');
  assert.equal(lv(calendarOf(4, i => [0, 5, 5, 9][i])), '0112');
  assert.equal(lv(calendarOf(4, i => [1, 10, 100, 1000][i])), '1234');
  assert.equal(lv(calendarOf(10, i => i + 1)), '1112233344');
  assert.equal(lv(calendarOf(5, () => 0)), '00000');
  assert.equal(lv(calendarOf(4, i => [-3, NaN, 2, 2][i])), '0011');
  const n = calendarOf(4, i => [1, 10, 100, 1000][i], { fixedMax: 5 });
  assert.deepEqual(cells(n).map(c => cellRect(c).attrs['fill-opacity']), ['0.28', '0.48', '0.72', '1'].map((v, i) => i === 0 ? '0.28' : v));
  assert.equal(cellRect(cells(calendarOf(1, () => 0))[0]).attrs['fill-opacity'], '0.08');
  assert.equal(cells(n)[0].attrs.class, 'stats-hit stats-cal-cell lv1');
});
test('calendar paints cells through o.color and marks today', () => {
  const n = calendarOf(5, i => i + 1, { color: 'var(--s-heat)', today: '2026-01-03' });
  assert.equal(cellRect(cells(n)[0]).style.fill, 'var(--s-heat)');
  assert.equal(cellRect(cells(n)[0]).attrs.fill, undefined);
  assert.deepEqual(cells(n).map(c => c.attrs.class.includes('is-today')), [false, false, true, false, false]);
  assert.ok(cells(n)[2].attrs.class.startsWith('stats-hit stats-cal-cell '));
  assert.equal(cellRect(cells(calendarOf(1))[0]).attrs.fill, '#3b82f6');
});
test('calendar weekStart shifts the columns and the week boundaries', () => {
  const data = [{ date: '2026-01-01', value: 1 }, { date: '2026-01-09', value: 1 }];
  const xy = weekStart => { const n = host(640); charts.calendar(n, data, { ...opts, weekStart }); return cells(n).map(c => [cellRect(c).attrs.x, cellRect(c).attrs.y]); };
  assert.deepEqual(xy(1), [['174', '18'], ['232', '70']]);
  assert.deepEqual(xy(7), [['232', '18'], ['290', '70']]);
  assert.deepEqual(xy(4), [['0', '18'], ['58', '70']]);
  assert.deepEqual(xy(0), xy(1), 'invalid weekStart falls back to Monday');
  assert.deepEqual(xy(9), xy(1));
  const n = host(640);
  charts.calendar(n, data, { ...opts, weekStart: 7, weekdayLabels: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] });
  assert.equal(all(n).filter(e => (e.attrs.class || '').includes('stats-cal-head'))[0].textContent, 'Su');
});
test('calendar column math also holds before 1970', () => {
  const n = host(640);
  charts.calendar(n, [{ date: '1969-12-29', value: 1 }, { date: '1969-12-31', value: 1 }], { ...opts, weekStart: 1 });
  assert.deepEqual(cells(n).map(c => cellRect(c).attrs.x), ['0', '116']);
});
test('calendar legend: less, five swatches, more', () => {
  const n = calendarOf(5, i => i + 1, { legendLess: 'Less', legendMore: 'More', color: 'var(--s-heat)' });
  const legend = all(n).find(e => e.attrs.class === 'stats-cal-legend');
  assert.equal(n.children[n.children.length - 1], legend);
  assert.deepEqual(legend.children.map(e => e.tagName), ['span', 'i', 'i', 'i', 'i', 'i', 'span']);
  assert.deepEqual([legend.children[0].textContent, legend.children[6].textContent], ['Less', 'More']);
  assert.deepEqual(legend.children.slice(1, 6).map(e => e.attrs.class), [0, 1, 2, 3, 4].map(l => `stats-cal-swatch lv${l}`));
  assert.ok(legend.children.slice(1, 6).every(e => e.attrs['aria-hidden'] === 'true' && e.style['--c'] === 'var(--s-heat)'));
});
test('calendar year mode (more than 14 weeks): pitch, month and weekday labels, no text in cells', () => {
  const n = calendarOf(200, i => i % 5, { weekdayLabels: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], monthLabel: key => key.slice(0, 7) }, 640);
  const svg = find(n, 'svg')[0];
  assert.ok(svg.attrs.class.includes('stats-calendar--year'));
  const weeks = Math.ceil((3 + 199 + 1) / 7);
  const pitch = Math.max(11, Math.min(26, Math.floor((640 - 40) / weeks)));
  assert.equal(svg.attrs.viewBox, `0 0 640 ${18 + 7 * pitch}`);
  assert.equal(svg.style.maxWidth, undefined);
  const [first, second] = cells(n).map(cellRect);
  assert.deepEqual([first.attrs.x, first.attrs.y, first.attrs.width, first.attrs.rx], ['36', String(18 + 3 * pitch), String(pitch - 3), '3']);
  assert.equal(Number(second.attrs.y) - Number(first.attrs.y), pitch);
  assert.ok(cells(n).every(c => c.children.length === 1 && c.children[0].tagName === 'rect'));
  assert.deepEqual(all(n).filter(e => (e.attrs.class || '').includes('stats-cal-wd')).map(e => e.textContent), ['Mo', 'We', 'Fr']);
  const months = all(n).filter(e => (e.attrs.class || '').includes('stats-cal-month'));
  assert.deepEqual(months.map(e => e.textContent), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  assert.equal(months[1].attrs.y, '12');
  assert.equal(n.style.overflowX, '');
  assert.equal(hits(n).length, 200);
  finite(n);
});
test('calendar year mode drops a month label that would overlap the next one', () => {
  const n = host(640);
  const dates = ['2025-12-30', '2025-12-31', ...dayKeys(0, 160)];
  charts.calendar(n, dates.map((date, i) => ({ date, value: i + 1 })), { ...opts, monthLabel: key => key.slice(0, 7) });
  const names = all(n).filter(e => (e.attrs.class || '').includes('stats-cal-month')).map(e => e.textContent);
  assert.ok(!names.includes('2025-12'), names.join());
  assert.equal(names[0], '2026-01');
});
test('calendar year mode scrolls to the newest week when the plot is wider than the host', () => {
  const n = host(300); n.scrollWidth = 999;
  charts.calendar(n, dayKeys(0, 365).map((date, i) => ({ date, value: i % 7 })), opts);
  const svg = find(n, 'svg')[0], weeks = Math.ceil((3 + 364 + 1) / 7);
  assert.equal(svg.attrs.width, String(36 + weeks * 11));
  assert.equal(svg.attrs.viewBox.split(' ')[2], String(36 + weeks * 11));
  assert.equal(svg.style.width, `${36 + weeks * 11}px`, 'pinned inline so a width: 100% stylesheet cannot shrink it');
  assert.equal(svg.style.maxWidth, 'none');
  assert.equal(n.style.overflowX, 'auto');
  assert.equal(n.scrollLeft, 999);
  const legend = all(n).find(e => e.attrs.class === 'stats-cal-legend');
  assert.deepEqual([legend.style.position, legend.style.insetInlineStart], ['sticky', '0'], 'the legend stays in view while the weeks scroll');
  charts.calendar(n, dayKeys(0, 30).map(date => ({ date, value: 1 })), opts);
  assert.equal(n.style.overflowX, '', 'a later month render clears the scroll');
  finite(n);
});
test('calendar keyboard in month mode: day and week steps, clamped, no wrap', () => {
  const h = hits(calendarOf(20));
  assert.equal(h.filter(e => e.attrs.tabindex === '0').length, 1);
  assert.ok(press(h[0], 'ArrowRight')); assert.ok(h[1].focused); assert.equal(h[1].attrs.tabindex, '0'); assert.equal(h[0].attrs.tabindex, '-1');
  press(h[1], 'ArrowDown'); assert.ok(h[8].focused);
  h[1].focused = false; press(h[8], 'ArrowUp'); assert.ok(h[1].focused);
  h[0].focused = false; press(h[1], 'ArrowLeft'); assert.ok(h[0].focused);
  h[0].focused = false;
  assert.ok(press(h[0], 'ArrowLeft'), 'stays and still swallows the key'); assert.ok(!h[0].focused);
  press(h[0], 'ArrowUp'); assert.ok(!h[0].focused);
  press(h[0], 'PageDown'); assert.ok(h[19].focused, 'clamps to the last day');
  h[19].focused = false;
  press(h[19], 'ArrowRight'); assert.ok(!h[19].focused);
  h[0].focused = false; press(h[19], 'PageUp'); assert.ok(h[0].focused);
  press(h[0], 'End'); assert.equal(h[19].attrs.tabindex, '0');
  press(h[19], 'Home'); assert.equal(h[0].attrs.tabindex, '0');
  assert.equal(h[0].events.keydown({ key: 'a', preventDefault: () => assert.fail('other keys stay native') }), undefined);
});
test('calendar keyboard in year mode runs down the week first: Up/Down day, Left/Right week', () => {
  const h = hits(calendarOf(120));
  press(h[0], 'ArrowDown'); assert.ok(h[1].focused);
  press(h[1], 'ArrowRight'); assert.ok(h[8].focused);
  h[1].focused = false; press(h[8], 'ArrowLeft'); assert.ok(h[1].focused);
  h[0].focused = false; press(h[1], 'ArrowUp'); assert.ok(h[0].focused);
  press(h[0], 'PageDown'); assert.ok(h[28].focused);
  h[0].focused = false; press(h[28], 'PageUp'); assert.ok(h[0].focused);
  press(h[0], 'End'); assert.ok(h[119].focused);
  h[119].focused = false; press(h[119], 'ArrowRight'); assert.ok(!h[119].focused, 'no wrap past the last day');
  press(h[112], 'ArrowRight'); assert.ok(h[119].focused, 'a week step past the end clamps to the last day');
});
test('calendar keyboard follows real days across gaps and sorts points chronologically', () => {
  const n = host(640);
  charts.calendar(n, [{ date: '2026-01-09', value: 1 }, { date: '2026-01-01', value: 1 }, { date: '2026-01-03', value: 1 }, { date: '2026-01-20', value: 1 }], opts);
  const h = hits(n);
  assert.deepEqual(h.map(e => e.attrs['data-date']), ['2026-01-01', '2026-01-03', '2026-01-09', '2026-01-20']);
  press(h[0], 'ArrowRight'); assert.ok(h[1].focused, 'next saved day');
  press(h[1], 'ArrowDown'); assert.ok(h[2].focused, '+7 days from Jan 3 lands on the next saved day, Jan 9');
  h[1].focused = false; press(h[2], 'ArrowUp'); assert.ok(h[1].focused);
});
test('calendar tolerates invalid dates, singletons and sparse input with finite geometry', () => {
  for (const data of [[{ date: '2026-01-01', value: 0 }], [{ date: 'nope', value: 3 }, { date: '2026-01-02', value: 1 }], [{ value: 2 }], [{ date: '2026-01-01', value: Infinity }]]) {
    const n = host(260); charts.calendar(n, data, opts); finite(n);
    assert.equal(hits(n).length, data.length);
  }
  const n = host(260);
  charts.calendar(n, [{ date: 'nope', value: 3 }, { date: '2026-01-02', value: 1 }], opts);
  press(hits(n)[0], 'ArrowRight'); assert.ok(hits(n)[1].focused, 'index steps when a date is invalid');
});
test('calendar stays fast on a multi-year history', () => {
  const begin = Date.now(), n = host(900);
  charts.calendar(n, Array.from({ length: 3000 }, (_, i) => ({ date: new Date(Date.UTC(2018, 0, 1 + i)).toISOString().slice(0, 10), value: i % 9 })), { ...opts, monthLabel: k => k });
  assert.equal(hits(n).length, 3000);
  assert.ok(Date.now() - begin < 3000);
});

// ---- rank ----------------------------------------------------------------------------------------------------
const rankRows = n => all(n).filter(e => e.attrs.class === 'stats-rank-row');
const cls = (n, name) => all(n).filter(e => e.attrs.class === name);
test('rank keeps long labels intact and sets --w, data-w and --bar', () => {
  const n = host(), long = 'x'.repeat(90);
  charts.rank(n, [{ label: long, value: 5 }, { label: 'B', value: 10, color: 'var(--ink-captcha)' }, { label: 'C', value: 0 }, { label: 'D', value: 3.3333 }], opts);
  const list = all(n).find(e => e.tagName === 'ol');
  assert.equal(list.attrs.class, 'stats-rank');
  assert.equal(list.attrs['aria-label'], 'Translated title');
  const rows = rankRows(n);
  assert.equal(cls(n, 'stats-rank-label')[0].textContent, long);
  assert.deepEqual(rows.map(r => r.attrs['data-w']), ['50', '100', '0', '33']);
  assert.deepEqual(rows.map(r => r.style['--w']), ['50%', '100%', '0%', '33.33%']);
  assert.deepEqual(rows.map(r => r.style['--bar']), ['var(--s-series)', 'var(--ink-captcha)', 'var(--s-series)', 'var(--s-series)']);
  assert.deepEqual(rows.map(r => r.attrs.tabindex), ['0', '-1', '-1', '-1']);
  assert.equal(rows[0].attrs['aria-label'], `${long}: 5`);
  assert.deepEqual(cls(n, 'stats-rank-n').map(e => e.textContent), ['1', '2', '3', '4']);
  assert.deepEqual(cls(n, 'stats-rank-val').map(e => e.textContent), ['5', '10', '0', '3.3333']);
  assert.equal(cls(n, 'stats-rank-track').length, 4);
  assert.ok(cls(n, 'stats-rank-track').every(t => t.children.length === 1 && t.children[0].tagName === 'i'));
  const real = realHost();
  charts.rank(real, [{ label: 'A', value: 1, color: '#abc' }], opts);
  assert.equal(rankRows(real)[0].style.props['--w'], '100%');
  assert.equal(rankRows(real)[0].style.props['--bar'], '#abc');
  finite(n);
});
test('rank child order, optional parts, max, rankStart, showRank and formatValue', () => {
  const n = host();
  charts.rank(n, [{ label: 'A', value: 2, sub: 'sub text', share: '40%', meta: { text: 'Anti-bot', color: 'var(--ink-antibot)' }, delta: { kind: 'up', text: '26%', label: 'Up 26%', tip: 'Previous: 8' } }, { label: 'B', value: 1 }], { ...opts, max: 4, rankStart: 9, formatValue: v => `${v} pages` });
  const [a, b] = rankRows(n);
  assert.deepEqual(a.children.map(e => e.attrs.class.split(' ')[0]), ['stats-rank-n', 'stats-rank-name', 'stats-rank-val', 'stats-rank-share', 'stats-delta', 'stats-rank-track']);
  assert.deepEqual(b.children.map(e => e.attrs.class), ['stats-rank-n', 'stats-rank-name', 'stats-rank-val', 'stats-rank-track']);
  assert.deepEqual(a.children[1].children.map(e => e.attrs.class), ['stats-rank-label', 'stats-chip', 'stats-rank-sub']);
  assert.equal(a.attrs['data-w'], '50');
  assert.equal(cls(n, 'stats-rank-n')[0].textContent, '9');
  assert.equal(cls(n, 'stats-rank-val')[0].textContent, '2 pages');
  assert.equal(cls(n, 'stats-rank-sub')[0].textContent, 'sub text');
  assert.equal(cls(n, 'stats-rank-share')[0].textContent, '40%');
  const chip = cls(n, 'stats-chip')[0];
  assert.equal(chip.style['--c'], 'var(--ink-antibot)');
  assert.equal(chip.children[0].attrs.class, 'stats-dot'); assert.equal(chip.children[0].attrs['aria-hidden'], 'true');
  assert.equal(chip.children[1].textContent, 'Anti-bot');
  const noRank = host();
  charts.rank(noRank, [{ label: 'A', value: 1 }], { ...opts, showRank: false });
  assert.equal(cls(noRank, 'stats-rank-n').length, 0);
  const wide = host();
  charts.rank(wide, [{ label: 'A', value: 50 }, { label: 'B', value: 500 }], { ...opts, max: 100 });
  assert.deepEqual(rankRows(wide).map(r => r.attrs['data-w']), ['50', '100'], '--w is clamped to 100');
});
test('rank delta badge DOM matches the shared contract for every kind', () => {
  const n = host();
  const kinds = [['up', '▲', '26%'], ['down', '▼', '3'], ['flat', '=', ''], ['new', '', 'new']];
  charts.rank(n, kinds.map(([kind, , label]) => ({ label: kind, value: 1, delta: { kind, text: label, label: `${kind} label`, tip: kind === 'up' ? 'Previous period: 8' : undefined } })), opts);
  const badges = all(n).filter(e => (e.attrs.class || '').startsWith('stats-delta '));
  assert.deepEqual(badges.map(b => b.attrs.class), kinds.map(([kind]) => `stats-delta stats-delta--${kind}`));
  assert.deepEqual(badges.map(b => b.attrs['aria-label']), kinds.map(([kind]) => `${kind} label`));
  assert.equal(badges[0].attrs.title, 'Previous period: 8'); assert.equal(badges[1].attrs.title, undefined);
  badges.forEach((b, i) => {
    assert.equal(b.children.length, 2);
    assert.equal(b.children[0].attrs.class, 'stats-delta-arrow'); assert.equal(b.children[0].attrs['aria-hidden'], 'true');
    assert.equal(b.children[0].textContent, kinds[i][1]);
    assert.equal(b.children[1].attrs.class, 'stats-delta-text'); assert.equal(b.children[1].textContent, kinds[i][2]);
  });
  const odd = host();
  charts.rank(odd, [{ label: 'x', value: 1, delta: { kind: 'sideways', text: '?', label: '' } }], opts);
  assert.equal(all(odd).find(e => (e.attrs.class || '').startsWith('stats-delta ')).attrs.class, 'stats-delta stats-delta--flat');
});
test('rank tooltips, aria-label from tip lines, touch and roving keyboard', () => {
  const n = host(); let shown, hidden = 0;
  const row = { label: 'Cloudflare', value: 4, tip: ['Cloudflare', { label: 'Pages', value: '4', color: 'var(--ink-antibot)' }] };
  charts.rank(n, [row, { label: 'Akamai', value: 3, tip: ['Akamai', 'three'] }, { label: 'DataDome', value: 1 }], { ...opts, onTooltip: (event, lines) => { shown = { event, lines }; }, hideTooltip: () => hidden++ });
  const [a, b, c] = rankRows(n); const base = hidden;
  assert.equal(a.attrs['aria-label'], 'Cloudflare: Pages: 4');
  assert.equal(b.attrs['aria-label'], 'Akamai: three');
  const event = {}; a.events.pointerenter(event);
  assert.equal(shown.event, event); assert.equal(shown.lines[1], row.tip[1]);
  c.events.focus({}); assert.deepEqual(shown.lines, ['DataDome', '1']);
  a.events.pointerleave({ pointerType: 'touch' }); assert.equal(hidden, base);
  a.events.pointerleave({ pointerType: 'mouse' }); a.events.blur(); assert.equal(hidden, base + 2);
  assert.ok(press(a, 'ArrowDown')); assert.ok(b.focused); assert.deepEqual([a, b, c].map(r => r.attrs.tabindex), ['-1', '0', '-1']);
  a.focused = false; press(b, 'ArrowUp'); assert.ok(a.focused);
  press(a, 'End'); assert.ok(c.focused);
  c.focused = false; press(c, 'ArrowDown'); assert.ok(c.focused, 'clamped at the end, no wrap: focus lands on the same row');
  a.focused = false; press(c, 'Home'); assert.ok(a.focused);
  assert.equal(a.events.keydown({ key: 'Tab', preventDefault: () => assert.fail('Tab must remain native') }), undefined);
});

// ---- segments ------------------------------------------------------------------------------------------------
const segRects = n => hits(n).map(h => h.children[0]);
test('segments omit zero parts from bar and legend unless keepZero', () => {
  const parts = [{ label: 'A', value: 3, color: '#abc' }, { label: 'Zero', value: 0, color: '#def' }, { label: 'B', value: 1, color: 'var(--ink-captcha)' }];
  const n = host(326);
  charts.segments(n, parts, opts);
  const svg = find(n, 'svg')[0];
  assert.equal(svg.attrs.class, 'stats-chart-svg stats-segments');
  assert.equal(svg.attrs.viewBox, '0 0 326 16'); assert.equal(svg.attrs.height, '16'); assert.equal(svg.attrs.role, 'group');
  assert.equal(svg.attrs['aria-label'], 'Translated title');
  assert.equal(svg.children[0].tagName, 'title');
  const track = svg.children[1];
  assert.deepEqual([track.attrs.class, track.attrs.rx, track.attrs.width], ['stats-seg-track', '8', '326']);
  assert.equal(hits(n).length, 2);
  assert.ok(hits(n).every(h => h.attrs.class === 'stats-hit stats-seg'));
  assert.deepEqual(segRects(n).map(r => r.attrs.rx), ['4', '4']);
  assert.equal(segRects(n)[0].attrs.fill, '#abc'); assert.equal(segRects(n)[1].style.fill, 'var(--ink-captcha)');
  const items = all(n).filter(e => (e.attrs.class || '').startsWith('stats-legend-item'));
  assert.deepEqual(items.map(i => i.children[1].textContent), ['A', 'B']);
  assert.deepEqual(items.map(i => i.attrs.class), ['stats-legend-item', 'stats-legend-item']);
  assert.deepEqual(cls(n, 'stats-legend-share').map(e => e.textContent), ['75%', '25%']);
  assert.deepEqual(cls(n, 'stats-legend-value').map(e => e.textContent), ['3', '1']);
  assert.equal(items[0].children[0].style.backgroundColor, '#abc');
  assert.equal(items[0].children[0].attrs['aria-hidden'], 'true');
  const kept = host(326);
  charts.segments(kept, parts, { ...opts, keepZero: true });
  assert.equal(hits(kept).length, 2, 'a zero part is still never drawn');
  const rows = all(kept).filter(e => (e.attrs.class || '').startsWith('stats-legend-item'));
  assert.deepEqual(rows.map(i => i.attrs.class), ['stats-legend-item', 'stats-legend-item is-zero', 'stats-legend-item']);
  assert.equal(rows[1].children[3].textContent, '0%');
  const bare = host(326);
  charts.segments(bare, parts, { ...opts, showLegend: false });
  assert.equal(all(bare).filter(e => e.attrs.class === 'stats-legend').length, 0);
  finite(n);
});
test('segments: gaps are 2px, slivers get 3px, the bar always fills the track exactly', () => {
  const n = host(326);
  charts.segments(n, [{ label: 'big', value: 10000 }, { label: 'sliver', value: 1 }, { label: 'mid', value: 2000 }], opts);
  const rects = segRects(n), w = rects.map(r => Number(r.attrs.width)), x = rects.map(r => Number(r.attrs.x));
  assert.equal(w[1], 3);
  assert.ok(w.every(v => v >= 3));
  assert.equal(x[1] - (x[0] + w[0]), 2); assert.equal(x[2] - (x[1] + w[1]), 2);
  assert.ok(Math.abs(x[2] + w[2] - 326) < 1e-9);
  const lone = host(326);
  charts.segments(lone, [{ label: 'only', value: 7 }], opts);
  assert.equal(segRects(lone)[0].attrs.width, '326');
  const crowd = host(326);
  charts.segments(crowd, Array.from({ length: 120 }, (_, i) => ({ label: String(i), value: 1 })), opts);
  assert.equal(hits(crowd).length, 120);
  finite(crowd);
  const edge = host(326);
  charts.segments(edge, [{ label: 'a', value: 1 }, { label: 'b', value: 1000 }, { label: 'c', value: 105 }], opts);
  assert.ok(segRects(edge).every(r => Number(r.attrs.width) >= 3));
});
test('segments tooltips carry label, value and share through formatShare', () => {
  const n = host(); let shown;
  charts.segments(n, [{ label: 'A', value: 1 }, { label: 'B', value: 3, tip: ['Custom', { label: 'x', value: 'y' }] }], { ...opts, formatShare: f => `${Math.round(f * 100)} per cent`, onTooltip: (event, lines) => { shown = lines; } });
  hits(n)[0].events.pointerenter({});
  assert.deepEqual(shown, ['A', '1 · 25 per cent']);
  assert.equal(hits(n)[0].attrs['aria-label'], 'A: 1 · 25 per cent');
  assert.equal(cls(n, 'stats-legend-share')[0].textContent, '25 per cent');
  hits(n)[1].events.focus({});
  assert.equal(shown[0], 'Custom');
  assert.equal(cls(n, 'stats-legend-share').length, 2);
});

// ---- sparkline -----------------------------------------------------------------------------------------------
const dOf = n => find(n, 'path').map(p => p.attrs.d);
test('sparkline renders nothing for fewer than two values', () => {
  for (const values of [[], [3], undefined, null, 'ab']) {
    const n = host(); n.appendChild(doc.createElement('old'));
    assert.equal(charts.sparkline(n, values, opts), undefined);
    assert.equal(n.children.length, 0);
  }
});
test('sparkline draws an area and a line scaled to the max, tone through --tone', () => {
  const n = host();
  charts.sparkline(n, [0, 2, 4], { color: 'var(--ink-antibot)' });
  const svg = find(n, 'svg')[0];
  assert.deepEqual([svg.attrs.class, svg.attrs.viewBox, svg.attrs.preserveAspectRatio, svg.attrs['aria-hidden']], ['stats-spark', '0 0 100 28', 'none', 'true']);
  assert.equal(svg.style['--tone'], 'var(--ink-antibot)');
  assert.deepEqual(find(n, 'path').map(p => p.attrs.class), ['stats-spark-area', 'stats-spark-line']);
  assert.equal(find(n, 'path')[1].attrs.d, 'M0 26 L50 14 L100 2');
  assert.equal(find(n, 'path')[0].attrs.d, 'M0 26 L50 14 L100 2 L100 28 L0 28 Z');
  assert.equal(find(n, 'path')[1].attrs.fill, 'none');
  assert.equal(find(n, 'line').length, 0);
  const real = realHost();
  charts.sparkline(real, [1, 2], { color: 'var(--tone-x)' });
  assert.equal(find(real, 'svg')[0].style.props['--tone'], 'var(--tone-x)');
  const bare = host(); charts.sparkline(bare, [1, 2], {});
  assert.equal(find(bare, 'svg')[0].style['--tone'], undefined);
  charts.sparkline(bare, [1, 2]); assert.equal(find(bare, 'svg').length, 1, 'replaces the previous render');
});
test('sparkline draws a dashed flat baseline for an all-zero series and clamps junk to zero', () => {
  for (const values of [[0, 0, 0], [NaN, -4, -Infinity]]) {
    const n = host(); charts.sparkline(n, values, opts);
    const flat = find(n, 'line')[0];
    assert.equal(flat.attrs.class, 'stats-spark-flat'); assert.equal(flat.attrs['stroke-dasharray'], '2 3');
    assert.equal(flat.attrs.y1, '14'); assert.equal(flat.attrs.y2, '14');
    assert.equal(find(n, 'path').length, 0);
  }
  const n = host(); charts.sparkline(n, [NaN, -3, 4], opts);
  assert.equal(find(n, 'path')[1].attrs.d, 'M0 26 L50 26 L100 2');
  finite(n);
});
test('sparkline averages more than 60 values down to at most 60 buckets', () => {
  const n = host();
  charts.sparkline(n, Array.from({ length: 200 }, (_, i) => i), opts);
  const d = dOf(n)[1];
  assert.equal(d.split(' L').length, 60);
  assert.ok(d.startsWith('M0 '));
  assert.ok(d.endsWith(' 2'), 'the last bucket is the maximum');
  const exact = host(); charts.sparkline(exact, Array.from({ length: 60 }, (_, i) => i), opts);
  assert.equal(dOf(exact)[1].split(' L').length, 60);
  const huge = host(); charts.sparkline(huge, Array.from({ length: 10000 }, (_, i) => i % 13), opts);
  assert.equal(dOf(huge)[1].split(' L').length, 60);
  finite(huge);
});

// ---- donut extras (optional parts of the contract) -------------------------------------------------------------
test('donut: keepZero false hides zero legend rows, two or more slices get a 2px gap', () => {
  const n = host();
  charts.donut(n, [{ label: 'A', value: 3 }, { label: 'Z', value: 0 }, { label: 'B', value: 1 }], { ...opts, keepZero: false });
  assert.deepEqual(cls(n, 'stats-legend-label').map(e => e.textContent), ['A', 'B']);
  const circumference = 2 * Math.PI * 74;
  const arcs = hits(n).map(h => Number(h.attrs['stroke-dasharray'].split(' ')[0]));
  assert.ok(Math.abs(arcs[0] - (.75 * circumference - 2)) < 1e-9);
  assert.ok(Math.abs(arcs[1] - (.25 * circumference - 2)) < 1e-9);
  const single = host();
  charts.donut(single, [{ label: 'A', value: 5 }], opts);
  assert.equal(hits(single)[0].attrs['stroke-dasharray'].split(' ')[0], String(circumference));
  finite(n);
});

// ---- cross-cutting: finite geometry for hostile and sparse input -----------------------------------------------
test('every renderer keeps finite geometry for singleton, zero-only, sparse and hostile input', () => {
  for (const value of [0, NaN, Infinity, -Infinity, -5, null, undefined, '7']) {
    const point = [{ label: 'a', value }];
    const checks = [
      n => charts.bars(n, point, { ...opts, vertical: true, average: { window: 3 }, highlight: 'max', valueLabels: true }),
      n => charts.bars(n, point, opts),
      n => charts.line(n, point, opts),
      n => charts.stacked(n, [{ label: 'a', values: { a: value } }], { ...opts, vertical: true, series: [{ key: 'a', label: 'A' }] }),
      n => charts.donut(n, point, opts),
      n => charts.calendar(n, [{ date: '2026-01-01', value }], opts),
      n => charts.segments(n, [{ label: 'a', value }, { label: 'b', value: 1 }], opts),
      n => charts.rank(n, point, opts),
      n => charts.sparkline(n, [value, value, 1], opts)
    ];
    for (const check of checks) { const n = host(260); check(n); finite(n); }
  }
  const n = host(260);
  charts.bars(n, [{ label: 'a', value: 3, partial: true }], { ...opts, vertical: true, average: { window: 7 } });
  assert.equal(all(n).filter(e => e.attrs.class === 'stats-avg-line').length, 0);
  finite(n);
});
test('hostile labels stay inert text in the HTML renderers', () => {
  const evil = '<img src=x onerror=attack()>';
  const n = host();
  charts.rank(n, [{ label: evil, value: 1, sub: evil, share: evil, meta: { text: evil }, delta: { kind: 'up', text: evil, label: evil } }], opts);
  charts.segments(n, [{ label: evil, value: 1 }], opts);
  assert.equal(find(n, 'img').length, 0);
  assert.ok(all(n).some(e => e.textContent === evil));
});
test('calendar month mode names the month on the first saved day of each month when monthLabel is given', () => {
  const n = host(640);
  charts.calendar(n, ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'].map((date, i) => ({ date, value: i + 1 })), { ...opts, monthLabel: key => key.slice(5, 7) === '01' ? 'Jan' : 'Feb' });
  const named = cells(n).map(c => c.children.filter(e => (e.attrs.class || '').includes('stats-cal-month')).map(e => e.textContent));
  assert.deepEqual(named, [['Jan'], [], ['Feb'], []]);
  const tag = all(n).find(e => (e.attrs.class || '').includes('stats-cal-month'));
  assert.equal(tag.attrs['text-anchor'], 'end');
  assert.equal(all(calendarOf(5)).filter(e => (e.attrs.class || '').includes('stats-cal-month')).length, 0, 'no label without monthLabel');
  const long = host(640);
  charts.calendar(long, [{ date: '2026-09-18', value: 1 }, { date: '2026-10-01', value: 1 }], { ...opts, monthLabel: () => 'September' });
  const cues = all(long).filter(e => (e.attrs.class || '').includes('stats-cal-month')).map(e => e.textContent);
  assert.deepEqual(cues, ['Se…', 'Sept…'], 'a long name is shortened to the room beside the day number (less room beside two digits)');
  finite(long);
});
