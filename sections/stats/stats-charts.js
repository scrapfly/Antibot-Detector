/* Plain DOM/SVG renderers. Labels and tooltip lines are supplied by the caller; nothing here knows about history.
 *
 * Every renderer: host.replaceChildren(), o.hideTooltip(), then o.emptyLabel in div.stats-none when there is nothing to draw.
 * Common options o: title, emptyLabel, formatNumber(v, digits), color, onTooltip(event, lines), hideTooltip(),
 *   fixedMax (taken literally), integer (default true), formatTick(v), summary (svg <desc>).
 * Tooltip lines are strings or { label, value, color } objects. Colours may be hex or var(...) / color-mix(...).
 *
 * bars / stacked (vertical)  points { label, value, color?, tip?, partial? }; o.valueLabels 'auto'|true|false, o.highlight 'max', o.average { window }
 * calendar (alias heatmap)    points { date, label, value, tip? }; o.weekStart, weekdayLabels, monthLabel, today, legendLess, legendMore
 * rank                        HTML list; rows { label, value, sub?, color?, meta?, share?, delta?, tip? }
 * segments                    proportion bar + legend; parts { label, value, color, tip? }; o.keepZero, formatShare, showLegend
 * sparkline                   values[]; o.color becomes --tone
 * niceScale(max, { integer }) -> { max, step } with four equal intervals
 * line, donut, matrix, scatter, and the horizontal bars/stacked are unchanged apart from colours and tick rounding.
 */
(function(root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_COLOR = '#3b82f6';
  const CSS_COLOR = /^(var|color-mix)\(/;
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const positive = value => Math.max(0, number(value));
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const fmt = (o, v, digits) => o.formatNumber ? String(o.formatNumber(v, digits)) : String(v);
  const text = value => value == null ? '' : String(value);
  const isObject = value => value !== null && typeof value === 'object';
  let uid = 0;

  function node(host, tag, attrs = {}, label, svg = true) {
    const doc = host.ownerDocument || document;
    const n = svg ? doc.createElementNS(NS, tag) : doc.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, String(value)));
    if (label !== undefined) n.textContent = text(label);
    host.appendChild(n);
    return n;
  }
  // var(...) and color-mix(...) are not valid presentation attributes: they only resolve as CSS declarations.
  function paint(n, prop, value) {
    const v = text(value).trim();
    if (CSS_COLOR.test(v) && n.style) {
      if (typeof n.style.setProperty === 'function') n.style.setProperty(prop, v);
      else n.style[prop] = v;
    } else n.setAttribute(prop, v);
  }
  function setVar(n, name, value) {
    const v = text(value);
    if (!n.style) return;
    if (typeof n.style.setProperty === 'function') n.style.setProperty(name, v);
    else n.style[name] = v;
  }
  // Every renderer starts the same way: clear the host and any tooltip left over from the previous render.
  function begin(host, o) {
    host.replaceChildren();
    if (o.hideTooltip) o.hideTooltip();
  }
  function none(host, o) {
    node(host, 'div', { class: 'stats-none' }, o.emptyLabel || '', false);
  }
  function widthOf(host) {
    const measured = host.getBoundingClientRect ? host.getBoundingClientRect().width : host.clientWidth;
    return Math.max(260, number(measured) || number(host.clientWidth) || 260);
  }
  function start(host, data, o, height = 240) {
    begin(host, o);
    const width = widthOf(host);
    if (!data.length) {
      none(host, o);
      return null;
    }
    const svg = node(host, 'svg', { class: 'stats-chart-svg', width: '100%', height, viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': text(o.title) });
    node(svg, 'title', {}, o.title || '');
    if (o.summary) {
      const id = `stats-chart-desc-${++uid}`;
      node(svg, 'desc', { id }, o.summary);
      svg.setAttribute('aria-describedby', id);
    }
    return { svg, width, height, hits: [] };
  }

  // Tooltip lines are strings or { label, value, color } objects; the objects reach o.onTooltip untouched.
  function lineList(tip, fallback) {
    const raw = tip == null ? fallback : (Array.isArray(tip) ? tip : [tip]);
    return raw.map(line => isObject(line) ? line : text(line));
  }
  function describe(lines) {
    let out = '';
    lines.forEach((line, i) => {
      const part = isObject(line) ? (line.value == null || line.value === '' ? text(line.label) : `${text(line.label)}: ${text(line.value)}`) : line;
      out += i ? (isObject(lines[i - 1]) ? ', ' : ': ') + part : part;
    });
    return out;
  }
  function focusAt(items, next) {
    items.forEach((item, index) => item.setAttribute('tabindex', index === next ? '0' : '-1'));
    items[next].focus();
  }
  const touch = event => !!event && event.pointerType === 'touch';
  function hit(c, n, label, values, tip, o) {
    const lines = lineList(tip, [text(label), ...values.map(text)]);
    n.setAttribute('class', 'stats-hit');
    n.setAttribute('tabindex', c.hits.length ? '-1' : '0');
    n.setAttribute('role', 'img');
    n.setAttribute('aria-label', describe(lines));
    const show = event => { if (o.onTooltip) o.onTooltip(event, lines); };
    n.addEventListener('pointerenter', show);
    n.addEventListener('pointermove', show);
    n.addEventListener('focus', show);
    // A touch tooltip stays until the next tap, so lifting the finger must not hide it.
    n.addEventListener('pointerleave', event => { if (!touch(event) && o.hideTooltip) o.hideTooltip(); });
    n.addEventListener('blur', () => { if (o.hideTooltip) o.hideTooltip(); });
    n.addEventListener('keydown', event => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
      if (c.neighbours) keys.push('PageUp', 'PageDown');
      if (!keys.includes(event.key)) return;
      const i = c.hits.indexOf(n), count = c.hits.length;
      let next;
      if (c.neighbours) {
        const target = c.neighbours(i, event.key);
        if (target === null) { event.preventDefault(); return; }
        if (Number.isInteger(target)) next = clamp(target, 0, count - 1);
      }
      if (next === undefined) next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (i + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + count) % count;
      event.preventDefault();
      focusAt(c.hits, next);
    });
    c.hits.push(n);
  }

  function label(svg, x, y, value, anchor = 'start') {
    const n = node(svg, 'text', { x, y, class: 'stats-axis-label', 'text-anchor': anchor, fill: 'currentColor', 'font-size': 11 }, value);
    node(n, 'title', {}, value);
    return n;
  }
  // Short, self-explanatory text (values, weekday names): no <title> because the text is never shortened.
  function plain(svg, x, y, value, anchor, cls, size = 11) {
    return node(svg, 'text', { x, y, class: cls, 'text-anchor': anchor, fill: 'currentColor', 'font-size': size }, value);
  }
  function shortened(value, count) {
    const s = text(value);
    return s.length > count ? s.slice(0, Math.max(1, count - 1)) + '…' : s;
  }

  const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const tidy = value => Number(value.toPrecision(12));
  // Four equal intervals with a round step, so the axis never reads 0, 7.5, 15, 22.5, 30.
  function niceScale(max, options = {}) {
    const integer = !options || options.integer !== false;
    const m = Number(max);
    if (!(m > 0) || !Number.isFinite(m) || (integer && m <= 4)) return { max: 4, step: 1 };
    const raw = m / 4, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow;
    let step = tidy((NICE_STEPS.find(s => s >= f - 1e-9) || 10) * pow);
    if (integer) step = Math.max(1, Math.ceil(step));
    return { max: tidy(4 * step), step };
  }
  function tick(o, v) {
    return o.formatTick ? String(o.formatTick(v)) : fmt(o, v, Number.isInteger(v) ? 0 : 1);
  }
  // A finite fixedMax is taken literally (the caller knows the whole-range scale); otherwise the data max is rounded up.
  function grid(c, dataMax, o, left = 42, bottom = 202) {
    const literal = Number.isFinite(o.fixedMax) && o.fixedMax > 0;
    const max = literal ? o.fixedMax : niceScale(dataMax, { integer: o.integer !== false }).max;
    for (let i = 0; i <= 4; i++) {
      const y = bottom - i * (bottom - 16) / 4;
      node(c.svg, 'line', { x1: left, x2: c.width - 16, y1: y, y2: y, class: 'stats-gridline', stroke: 'currentColor', opacity: .12 });
      label(c.svg, left - 6, y + 4, tick(o, max * i / 4), 'end');
    }
    return { max };
  }

  function trailingMean(points, size) {
    return points.map((p, i) => {
      if (p.partial) return null;
      let sum = 0, count = 0;
      for (let k = Math.max(0, i - size + 1); k <= i; k++) if (!points[k].partial) { sum += positive(points[k].value); count++; }
      return count ? sum / count : null;
    });
  }
  function bars(host, points = [], o = {}) {
    const c = start(host, points, o, o.vertical ? 240 : Math.max(100, points.length * 32 + 20));
    if (!c) return;
    if (o.vertical) {
      const values = points.map(p => positive(p.value));
      const { max } = grid(c, Math.max(0, ...values), o);
      const slot = (c.width - 58) / points.length;
      const step = Math.max(1, Math.ceil(60 / slot));
      const top = Math.max(0, ...values), peak = values.indexOf(top);
      const mark = o.highlight === 'max' && top > 0;
      const y = v => 202 - (max ? Math.min(max, v) / max : 0) * 186;
      points.forEach((p, i) => {
        const height = max ? Math.min(max, values[i]) / max * 186 : 0;
        const width = slot * .8;
        const colour = p.color || o.color || DEFAULT_COLOR;
        const g = node(c.svg, 'g');
        const bar = node(g, 'rect', { x: 42 + i * slot + slot * .1, y: 202 - height, width, height, rx: Math.min(3, width / 2) });
        paint(bar, 'fill', colour);
        if (p.partial) {
          bar.setAttribute('opacity', .5);
          paint(bar, 'stroke', colour);
          bar.setAttribute('stroke-dasharray', '3 3');
          bar.setAttribute('class', 'is-partial');
        } else if (mark) {
          if (values[i] === top) bar.setAttribute('data-peak', '1');
          else bar.setAttribute('opacity', .72);
        }
        node(g, 'rect', { x: 42 + i * slot, y: 16, width: slot, height: 186, fill: 'transparent' });
        hit(c, g, p.label, [fmt(o, number(p.value))], p.tip, o);
        if (i % step === 0) label(c.svg, 42 + (i + .5) * slot, 226, shortened(p.label, 8), 'middle');
      });
      const everyBar = o.valueLabels === true || (o.valueLabels !== false && slot >= 26);
      if (o.valueLabels !== false && (everyBar || top > 0)) {
        points.forEach((p, i) => {
          if (!everyBar && i !== peak) return;
          const tag = plain(c.svg, 42 + (i + .5) * slot, Math.max(12, y(values[i]) - 4), fmt(o, number(p.value)), 'middle', 'stats-axis-label stats-bar-value');
          tag.setAttribute('pointer-events', 'none');
        });
      }
      if (o.average) {
        const size = Number.isInteger(o.average.window) && o.average.window > 0 ? o.average.window : 7;
        const means = trailingMean(points, size);
        const steps = [];
        means.forEach((mean, i) => { if (mean !== null) steps.push(`${means[i - 1] == null ? 'M' : 'L'}${42 + (i + .5) * slot} ${y(mean)}`); });
        const d = steps.join(' '), vertices = steps.length;
        if (vertices > 1) {
          // Drawn after the bars; it must never take the pointer from the column hit areas underneath.
          const avg = node(c.svg, 'path', { d, class: 'stats-avg-line', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' });
          avg.setAttribute('vector-effect', 'non-scaling-stroke');
        }
      }
      return;
    }
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...points.map(p => positive(p.value)));
    const left = Math.min(160, c.width * .42), available = Math.max(1, c.width - left - 62);
    points.forEach((p, i) => {
      const y = 12 + i * 32;
      const l = label(c.svg, 4, y + 16, shortened(p.label, Math.floor(left / 7)));
      node(l, 'title', {}, p.label);
      const g = node(c.svg, 'g');
      const bar = node(g, 'rect', { x: left, y, width: max ? Math.min(max, positive(p.value)) / max * available : 0, height: 22, rx: 3 });
      paint(bar, 'fill', p.color || o.color || DEFAULT_COLOR);
      node(g, 'rect', { x: left, y, width: available, height: 24, fill: 'transparent' });
      hit(c, g, p.label, [fmt(o, number(p.value))], p.tip, o);
      label(c.svg, left + available + 5, y + 16, fmt(o, number(p.value)));
    });
  }
  function line(host, points = [], o = {}) {
    const c = start(host, points, o);
    if (!c) return;
    const { max } = grid(c, Math.max(0, ...points.map(p => positive(p.value))), o);
    const x = i => 42 + (c.width - 58) * (points.length === 1 ? .5 : i / (points.length - 1));
    const y = v => 202 - (max ? Math.min(max, positive(v)) / max : 0) * 186;
    let segment = [];
    function flush() {
      if (!segment.length) return;
      const d = segment.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
      if (o.fill) {
        const area = node(c.svg, 'path', { d: `${d} L${segment[segment.length - 1][0]} 202 L${segment[0][0]} 202 Z`, opacity: .15 });
        paint(area, 'fill', o.color || DEFAULT_COLOR);
      }
      const stroke = node(c.svg, 'path', { d, fill: 'none', 'stroke-width': 2 });
      paint(stroke, 'stroke', o.color || DEFAULT_COLOR);
      segment = [];
    }
    points.forEach((p, i) => { if (p.value == null || !Number.isFinite(p.value)) flush(); else segment.push([x(i), y(p.value)]); });
    flush();
    const step = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((c.width - 58) / 80))));
    points.forEach((p, i) => {
      if (i % step === 0) label(c.svg, x(i), 226, shortened(p.label, 12), i === 0 ? 'start' : 'middle');
      if (p.value == null || !Number.isFinite(p.value)) return;
      const n = node(c.svg, 'circle', { cx: x(i), cy: y(p.value), r: 5 });
      paint(n, 'fill', p.color || o.color || DEFAULT_COLOR);
      hit(c, n, p.label, [fmt(o, p.value)], p.tip, o);
    });
  }
  function stacked(host, rows = [], o = {}) {
    const series = o.series || [];
    const c = start(host, rows, o, o.vertical ? 240 : Math.max(100, rows.length * 34 + 20));
    if (!c) return;
    const totals = rows.map(row => series.reduce((sum, s) => sum + positive((row.values || {})[s.key]), 0));
    if (o.vertical) {
      const { max } = grid(c, Math.max(0, ...totals), o);
      const slot = (c.width - 58) / rows.length;
      const step = Math.max(1, Math.ceil(80 / slot));
      rows.forEach((row, i) => {
        const g = node(c.svg, 'g');
        let y = 202;
        series.forEach(s => {
          const value = positive((row.values || {})[s.key]);
          const height = max ? value / max * 186 : 0;
          y -= height;
          if (!(value > 0)) return;
          const seg = node(g, 'rect', { x: 42 + i * slot + slot * .1, y, width: slot * .8, height, class: row.partial ? 'stats-seg is-partial' : 'stats-seg' });
          paint(seg, 'fill', s.color || o.color || DEFAULT_COLOR);
          if (height >= 6) seg.setAttribute('rx', 2);
          if (row.partial) seg.setAttribute('opacity', .5);
        });
        node(g, 'rect', { x: 42 + i * slot, y: 16, width: slot, height: 186, fill: 'transparent' });
        hit(c, g, row.label, series.map(s => `${text(s.label)}: ${fmt(o, positive((row.values || {})[s.key]))}`), row.tip, o);
        if (i % step === 0) label(c.svg, 42 + (i + .5) * slot, 226, shortened(row.label, 10), i === 0 ? 'start' : 'middle');
      });
      return;
    }
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...totals), left = Math.min(140, c.width * .4), available = c.width - left - 16;
    rows.forEach((row, i) => {
      label(c.svg, 4, i * 34 + 29, shortened(row.label, Math.floor(left / 7)));
      let x = left;
      series.forEach(s => {
        const value = positive((row.values || {})[s.key]);
        const width = max ? value / max * available : 0;
        if (value > 0) {
          const n = node(c.svg, 'rect', { x, y: i * 34 + 12, width, height: 24 });
          paint(n, 'fill', s.color || o.color || DEFAULT_COLOR);
          hit(c, n, row.label, [text(s.label), fmt(o, value)], row.tip, o);
        }
        x += width;
      });
    });
  }
  function donut(host, parts = [], o = {}) {
    host.replaceChildren();
    const layout = node(host, 'div', { class: 'stats-donut-layout' }, undefined, false);
    const area = node(layout, 'div', { class: 'stats-donut' }, undefined, false);
    const c = start(area, parts, o, 220);
    if (!c) return;
    c.width = 220;
    c.svg.setAttribute('viewBox', '0 0 220 220');
    const total = parts.reduce((sum, p) => sum + positive(p.value), 0), cx = c.width / 2, cy = 110, r = 74, circumference = 2 * Math.PI * r;
    node(c.svg, 'circle', { cx, cy, r, fill: 'none', stroke: 'currentColor', opacity: .1, 'stroke-width': 26 });
    // Two or more slices get a 2px gap so neighbours of similar colour stay distinguishable.
    const gap = parts.filter(p => positive(p.value) > 0).length > 1 ? 2 : 0;
    let offset = 0;
    parts.forEach(p => {
      const value = positive(p.value), share = total ? value / total : 0;
      if (value > 0) {
        const arc = Math.max(0, share * circumference - gap);
        const n = node(c.svg, 'circle', { cx, cy, r, fill: 'none', 'stroke-width': 26, 'stroke-dasharray': `${arc} ${circumference}`, 'stroke-dashoffset': -(offset * circumference + gap / 2), transform: `rotate(-90 ${cx} ${cy})` });
        paint(n, 'stroke', p.color || o.color || DEFAULT_COLOR);
        hit(c, n, p.label, [fmt(o, value)], p.tip, o);
      }
      offset += share;
    });
    const center = label(c.svg, cx, cy, shortened(o.centerValue, 11), 'middle');
    center.setAttribute('class', 'stats-axis-label stats-donut-center-value');
    center.setAttribute('font-size', 24);
    center.children[0].textContent = text(o.centerValue);
    const caption = label(c.svg, cx, cy + 22, shortened(o.centerLabel, 20), 'middle');
    caption.setAttribute('class', 'stats-axis-label stats-donut-center-label');
    caption.setAttribute('font-size', 12);
    caption.children[0].textContent = text(o.centerLabel);
    const legend = node(layout, 'div', { class: 'stats-legend' }, undefined, false);
    parts.forEach(p => {
      // Zero rows stay by default; a caller that passes keepZero: false gets a legend of what is actually drawn.
      if (o.keepZero === false && !(positive(p.value) > 0)) return;
      const item = node(legend, 'div', { class: 'stats-legend-item' }, undefined, false);
      const swatch = node(item, 'span', { class: 'stats-legend-swatch', 'aria-hidden': 'true' }, undefined, false);
      swatch.style.backgroundColor = p.color || o.color || DEFAULT_COLOR;
      node(item, 'span', { class: 'stats-legend-label' }, p.label, false);
      node(item, 'span', { class: 'stats-legend-value' }, fmt(o, number(p.value)), false);
      node(item, 'span', { class: 'stats-legend-share' }, fmt(o, total ? positive(p.value) / total * 100 : 0, 1) + '%', false);
    });
  }

  const DAY_MS = 86400000;
  const LEVEL_OPACITY = [.08, .28, .48, .72, 1];
  const parseDay = date => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text(date)) ? Date.parse(date + 'T00:00:00Z') : NaN;
    return Number.isFinite(parsed) ? Math.floor(parsed / DAY_MS) : null;
  };
  // Up to four distinct values: one level each. More: quartiles of the positive values.
  function levelOf(values) {
    const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
    const distinct = [...new Set(sorted)];
    if (distinct.length <= 4) return v => v > 0 ? distinct.indexOf(v) + 1 : 0;
    const q = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    const [q1, q2, q3] = [q(.25), q(.5), q(.75)];
    return v => v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4;
  }
  // Calendar key steps. Month mode runs weeks down the rows, year mode runs them across the columns.
  const CAL_STEPS = {
    month: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -28, PageDown: 28 },
    year: { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, PageUp: -28, PageDown: 28 }
  };
  function calendarKeys(entries, mode) {
    const days = entries.map(e => e.day), exact = days.every(d => d !== null);
    return (i, key) => {
      const last = entries.length - 1;
      if (key === 'Home') return 0;
      if (key === 'End') return last;
      const step = CAL_STEPS[mode][key];
      if (step === undefined) return undefined;
      if (!exact) { const index = clamp(i + step, 0, last); return index === i ? null : index; }
      // Real days, possibly sparse: of the saved days in the direction of travel, take the one nearest the target day.
      const forward = step > 0, aim = days[i] + step;
      let target = -1, gap = Infinity;
      days.forEach((d, k) => {
        if (forward ? k <= i : k >= i) return;
        const g = Math.abs(d - aim);
        if (g < gap || (!forward && g === gap)) { gap = g; target = k; }
      });
      if (target < 0) return null;
      return target;
    };
  }
  function calendar(host, points = [], o = {}) {
    const c = start(host, points, o, 120);
    if (!c) return;
    const weekStart = Number.isInteger(o.weekStart) && o.weekStart >= 1 && o.weekStart <= 7 ? o.weekStart : 1;
    const entries = points.map((point, index) => ({ p: point || {}, index, day: parseDay((point || {}).date) }));
    if (entries.every(e => e.day !== null)) entries.sort((a, b) => a.day - b.day || a.index - b.index);
    const columnOf = day => ((((day + 3) % 7) + 7) % 7 - (weekStart - 1) + 7) % 7;
    const known = entries.filter(e => e.day !== null).map(e => e.day);
    const first = known.length ? Math.min(...known) : 0;
    const firstWeek = first - columnOf(first);
    entries.forEach((e, k) => { e.slot = e.day === null ? k : e.day - firstWeek; });
    const weeks = Math.ceil((entries.reduce((m, e) => Math.max(m, e.slot), 0) + 1) / 7);
    const month = weeks <= 14;
    const level = levelOf(entries.map(e => positive(e.p.value)));
    const colour = o.color || DEFAULT_COLOR;
    const pitch = clamp(Math.floor((c.width - 40) / weeks), 11, 26);
    let height;
    if (month) {
      height = 18 + weeks * 52;
      c.svg.setAttribute('viewBox', `0 0 400 ${height}`);
      c.svg.style.maxWidth = '400px';
    } else {
      const natural = 36 + weeks * pitch;
      height = 18 + 7 * pitch;
      const scrolls = natural > c.width;
      c.svg.setAttribute('viewBox', `0 0 ${Math.max(c.width, natural)} ${height}`);
      if (scrolls) {
        c.svg.setAttribute('width', natural);
        // Stylesheets set .stats-chart-svg to width: 100%, which beats the attribute: pin the natural width inline.
        c.svg.style.width = `${natural}px`;
        c.svg.style.maxWidth = 'none';
      }
      if (host.style) host.style.overflowX = scrolls ? 'auto' : '';
    }
    if (month && host.style) host.style.overflowX = '';
    c.svg.setAttribute('height', height);
    c.svg.setAttribute('class', `stats-chart-svg stats-calendar stats-calendar--${month ? 'month' : 'year'}`);
    const labels = Array.isArray(o.weekdayLabels) ? o.weekdayLabels : null;
    if (month && labels) {
      for (let col = 0; col < 7; col++) plain(c.svg, col * 58 + 26, 12, labels[col], 'middle', 'stats-axis-label stats-cal-head');
    }
    if (!month) {
      if (labels) [0, 2, 4].forEach(col => plain(c.svg, 30, 18 + col * pitch + pitch - 5, labels[col], 'end', 'stats-axis-label stats-cal-wd', 10));
      if (typeof o.monthLabel === 'function') {
        const marks = [], seen = new Set();
        entries.forEach(e => {
          const key = text(e.p.date).slice(0, 7);
          if (e.day === null || seen.has(key)) return;
          seen.add(key);
          const week = Math.floor(e.slot / 7);
          // Two month names closer than three weeks would overlap: keep the later one.
          while (marks.length && week - marks[marks.length - 1].week < 3) marks.pop();
          marks.push({ week, date: text(e.p.date) });
        });
        marks.forEach(m => plain(c.svg, 36 + m.week * pitch, 12, o.monthLabel(m.date), 'start', 'stats-axis-label stats-cal-month'));
      }
    }
    const group = node(c.svg, 'g', { class: 'stats-cal-grid' });
    const monthsSeen = new Set();
    entries.forEach(e => {
      const p = e.p, value = positive(p.value), lv = level(value);
      const week = Math.floor(e.slot / 7), col = e.slot % 7;
      const x = month ? col * 58 : 36 + week * pitch, y = month ? 18 + week * 52 : 18 + col * pitch;
      const width = month ? 52 : pitch - 3, cellHeight = month ? 46 : pitch - 3;
      const g = node(group, 'g');
      const rect = node(g, 'rect', { x, y, width, height: cellHeight, rx: month ? 8 : 3, 'fill-opacity': LEVEL_OPACITY[lv] });
      paint(rect, 'fill', colour);
      if (month) {
        plain(g, x + 7, y + 14, /^\d{4}-\d{2}-\d{2}$/.test(text(p.date)) ? String(Number(text(p.date).slice(8, 10))) : '', 'start', lv >= 3 ? 'stats-cal-day on-fill' : 'stats-cal-day');
        // Without a month cue "31, 1, 2" is ambiguous: the first saved day of each month names its month in the free corner.
        const monthKey = text(p.date).slice(0, 7);
        if (typeof o.monthLabel === 'function' && e.day !== null && !monthsSeen.has(monthKey)) {
          monthsSeen.add(monthKey);
          // Room left of the day number is about 4 characters; a long name (Arabic, German) is shortened rather than overlapping it.
          const fits = Math.floor((width - 14 - String(Number(text(p.date).slice(8, 10))).length * 6.5 - 4) / 5.5);
          if (fits >= 2) plain(g, x + width - 7, y + 14, shortened(o.monthLabel(text(p.date)), fits), 'end', lv >= 3 ? 'stats-axis-label stats-cal-month on-fill' : 'stats-axis-label stats-cal-month', 10);
        }
        if (value > 0) plain(g, x + width - 7, y + cellHeight - 8, fmt(o, number(p.value)), 'end', lv >= 3 ? 'stats-cal-val on-fill' : 'stats-cal-val', 13);
      }
      hit(c, g, p.label || p.date, [fmt(o, number(p.value))], p.tip, o);
      g.setAttribute('class', `stats-hit stats-cal-cell lv${lv}${o.today && text(p.date) === text(o.today) ? ' is-today' : ''}`);
      g.setAttribute('data-date', text(p.date));
    });
    c.neighbours = calendarKeys(entries, month ? 'month' : 'year');
    if (!month && host.style && host.style.overflowX === 'auto' && Number.isFinite(host.scrollWidth)) host.scrollLeft = host.scrollWidth;
    const legend = node(host, 'div', { class: 'stats-cal-legend' }, undefined, false);
    // The legend sits in the scrolling host: keep it at the visible start instead of scrolling it away with the weeks.
    if (!month && host.style && host.style.overflowX === 'auto') { legend.style.position = 'sticky'; legend.style.insetInlineStart = '0'; }
    node(legend, 'span', {}, o.legendLess, false);
    for (let lv = 0; lv <= 4; lv++) {
      const swatch = node(legend, 'i', { class: `stats-cal-swatch lv${lv}`, 'aria-hidden': 'true' }, undefined, false);
      if (o.color) setVar(swatch, '--c', o.color);
    }
    node(legend, 'span', {}, o.legendMore, false);
  }

  function matrix(host, labels = [], values = {}, o = {}) {
    const left = 100, cell = 42;
    const c = start(host, labels, o, left + labels.length * cell + 10);
    if (!c) return;
    const width = Math.max(c.width, left + labels.length * cell + 10);
    c.svg.setAttribute('class', 'stats-chart-svg stats-matrix');
    c.svg.setAttribute('viewBox', `0 0 ${width} ${c.height}`);
    c.svg.setAttribute('width', width);
    host.style.overflowX = 'auto';
    const max = Math.max(0, ...labels.flatMap(a => labels.map(b => positive((values[a.key] || {})[b.key]))));
    labels.forEach((a, i) => {
      label(c.svg, left - 6, left + i * cell + 26, shortened(a.label, 13), 'end');
      const top = label(c.svg, left + i * cell + 24, left - 8, shortened(a.label, 13));
      top.setAttribute('transform', `rotate(-45 ${left + i * cell + 24} ${left - 8})`);
      labels.forEach((b, j) => {
        const value = positive((values[a.key] || {})[b.key]);
        const g = node(c.svg, 'g');
        const rect = node(g, 'rect', { x: left + j * cell, y: left + i * cell, width: cell - 3, height: cell - 3, rx: 3, 'fill-opacity': max && value ? .2 + .8 * value / max : .06 });
        paint(rect, 'fill', a.color || o.color || DEFAULT_COLOR);
        label(g, left + j * cell + 19, left + i * cell + 25, fmt(o, value), 'middle');
        hit(c, g, `${text(a.label)} / ${text(b.label)}`, [fmt(o, value)], null, o);
        g.setAttribute('class', 'stats-hit stats-matrix-cell');
      });
    });
  }
  function scatter(host, points = [], o = {}) {
    const c = start(host, points, o, 260);
    if (!c) return;
    const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    const xmin = Math.min(0, ...valid.map(p => p.x)), xmax = Math.max(0, Number.isFinite(o.xMax) && o.xMax > 0 ? o.xMax : 0, ...valid.map(p => p.x));
    const ymin = Math.min(0, ...valid.map(p => p.y)), dataMax = Math.max(0, ...valid.map(p => p.y));
    const external = Number.isFinite(o.yMax) && o.yMax > 0 ? o.yMax : 0;
    // Without negative values the y axis gets round ticks like the other charts; an external maximum is kept literally.
    const ymax = ymin < 0 ? Math.max(dataMax, external) : (external >= dataMax && external > 0 ? external : niceScale(Math.max(dataMax, external), { integer: o.integer !== false }).max);
    for (let i = 0; i <= 4; i++) {
      const y = 202 - i * 186 / 4, v = ymin + (ymax - ymin) * i / 4;
      node(c.svg, 'line', { x1: 42, x2: c.width - 16, y1: y, y2: y, class: 'stats-gridline', stroke: 'currentColor', opacity: .12 });
      label(c.svg, 36, y + 4, o.formatTick ? String(o.formatTick(v)) : fmt(o, v, ymin < 0 ? 1 : Number.isInteger(v) ? 0 : 1), 'end');
    }
    label(c.svg, c.width / 2, 252, o.xLabel, 'middle');
    label(c.svg, 44, 12, o.yLabel);
    label(c.svg, 42, 226, fmt(o, xmin));
    label(c.svg, c.width - 16, 226, fmt(o, xmax), 'end');
    valid.forEach(p => {
      const n = node(c.svg, 'circle', { cx: 42 + (xmax === xmin ? .5 : (p.x - xmin) / (xmax - xmin)) * (c.width - 58), cy: 202 - (ymax === ymin ? 0 : (p.y - ymin) / (ymax - ymin)) * 186, r: Math.max(3, Math.min(18, positive(p.radius) || 4)), opacity: .75 });
      paint(n, 'fill', o.color || DEFAULT_COLOR);
      hit(c, n, p.label, [text(o.xLabel) + ': ' + fmt(o, p.x), text(o.yLabel) + ': ' + fmt(o, p.y)], p.tip, o);
    });
  }

  const ARROWS = { up: '▲', down: '▼', flat: '=', new: '' };
  function deltaBadge(parent, delta) {
    const kind = Object.prototype.hasOwnProperty.call(ARROWS, delta.kind) ? delta.kind : 'flat';
    const badge = node(parent, 'span', { class: `stats-delta stats-delta--${kind}`, 'aria-label': text(delta.label) }, undefined, false);
    if (delta.tip != null) badge.setAttribute('title', text(delta.tip));
    node(badge, 'span', { class: 'stats-delta-arrow', 'aria-hidden': 'true' }, ARROWS[kind], false);
    node(badge, 'span', { class: 'stats-delta-text' }, delta.text, false);
    return badge;
  }
  // Ranked list in HTML so long names wrap with logical CSS instead of being cut inside an SVG.
  function rank(host, rows = [], o = {}) {
    begin(host, o);
    const list = (Array.isArray(rows) ? rows : []).filter(isObject);
    if (!list.length) return none(host, o);
    const max = Number.isFinite(o.max) && o.max > 0 ? o.max : Math.max(0, ...list.map(r => positive(r.value)));
    const formatValue = typeof o.formatValue === 'function' ? o.formatValue : v => fmt(o, v);
    const first = Number.isFinite(o.rankStart) ? o.rankStart : 1;
    const ol = node(host, 'ol', { class: 'stats-rank' }, undefined, false);
    if (o.title) ol.setAttribute('aria-label', text(o.title));
    const items = [];
    list.forEach((row, i) => {
      const w = max ? clamp(positive(row.value) / max * 100, 0, 100) : 0;
      const lines = lineList(row.tip, [text(row.label), formatValue(number(row.value))]);
      const li = node(ol, 'li', { class: 'stats-rank-row', tabindex: i ? '-1' : '0', 'aria-label': describe(lines), 'data-w': Math.round(w) }, undefined, false);
      setVar(li, '--w', `${Number(w.toFixed(2))}%`);
      setVar(li, '--bar', row.color || 'var(--s-series)');
      if (o.showRank !== false) node(li, 'span', { class: 'stats-rank-n' }, first + i, false);
      const name = node(li, 'span', { class: 'stats-rank-name' }, undefined, false);
      node(name, 'span', { class: 'stats-rank-label' }, row.label, false);
      if (isObject(row.meta) && text(row.meta.text) !== '') {
        const chip = node(name, 'span', { class: 'stats-chip' }, undefined, false);
        if (row.meta.color) setVar(chip, '--c', row.meta.color);
        node(chip, 'i', { class: 'stats-dot', 'aria-hidden': 'true' }, undefined, false);
        node(chip, 'span', { class: 'stats-chip-label' }, row.meta.text, false);
      }
      if (text(row.sub) !== '') node(name, 'span', { class: 'stats-rank-sub' }, row.sub, false);
      node(li, 'span', { class: 'stats-rank-val' }, formatValue(number(row.value)), false);
      if (text(row.share) !== '') node(li, 'span', { class: 'stats-rank-share' }, row.share, false);
      if (isObject(row.delta)) deltaBadge(li, row.delta);
      const track = node(li, 'span', { class: 'stats-rank-track' }, undefined, false);
      node(track, 'i', {}, undefined, false);
      // Over the change badge only the badge's own tip shows, not the row's tooltip as well
      const show = event => {
        if (event && event.target && typeof event.target.closest === 'function' && event.target.closest('.stats-delta')) { if (o.hideTooltip) o.hideTooltip(); return; }
        if (o.onTooltip) o.onTooltip(event, lines);
      };
      li.addEventListener('pointerenter', show);
      li.addEventListener('pointermove', show);
      li.addEventListener('focus', show);
      li.addEventListener('pointerleave', event => { if (!touch(event) && o.hideTooltip) o.hideTooltip(); });
      li.addEventListener('blur', () => { if (o.hideTooltip) o.hideTooltip(); });
      li.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const at = items.indexOf(li);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : clamp(at + (event.key === 'ArrowUp' ? -1 : 1), 0, items.length - 1);
        event.preventDefault();
        focusAt(items, next);
      });
      items.push(li);
    });
  }
  // One proportion bar plus its legend: part-to-whole at a glance, without the weight of a donut.
  function segments(host, parts = [], o = {}) {
    const list = (Array.isArray(parts) ? parts : []).filter(isObject);
    const values = list.map(p => positive(p.value));
    const total = values.reduce((sum, v) => sum + v, 0);
    const c = start(host, total > 0 ? list : [], o, 16);
    if (!c) return;
    const share = typeof o.formatShare === 'function' ? o.formatShare : f => `${Math.round(f * 1000) / 10}%`;
    c.svg.setAttribute('class', 'stats-chart-svg stats-segments');
    node(c.svg, 'rect', { class: 'stats-seg-track', x: 0, y: 0, width: c.width, height: 16, rx: 8 });
    const shown = list.map((p, i) => ({ p, value: values[i] })).filter(item => item.value > 0);
    const room = c.width - 2 * (shown.length - 1);
    // A sliver still needs 3px to be visible; the rest of the bar gives up exactly that width.
    let slivers = shown.filter(item => item.value / total * room < 3), rest;
    for (;;) {
      rest = shown.filter(item => !slivers.includes(item)).reduce((sum, item) => sum + item.value, 0);
      const squeezed = shown.filter(item => !slivers.includes(item) && rest > 0 && Math.max(0, room - 3 * slivers.length) * item.value / rest < 3);
      if (!squeezed.length) break;
      slivers = slivers.concat(squeezed);
    }
    let x = 0;
    shown.forEach(item => {
      const width = slivers.includes(item) ? 3 : rest > 0 ? Math.max(0, room - 3 * slivers.length) * item.value / rest : room / shown.length;
      const g = node(c.svg, 'g');
      const rect = node(g, 'rect', { x, y: 0, width, height: 16, rx: 4 });
      paint(rect, 'fill', item.p.color || o.color || DEFAULT_COLOR);
      hit(c, g, item.p.label, [`${fmt(o, item.value)} · ${share(item.value / total)}`], item.p.tip, o);
      g.setAttribute('class', 'stats-hit stats-seg');
      x += width + 2;
    });
    if (o.showLegend === false) return;
    const legend = node(host, 'div', { class: 'stats-legend' }, undefined, false);
    list.forEach((p, i) => {
      if (!(values[i] > 0) && !o.keepZero) return;
      const item = node(legend, 'div', { class: values[i] > 0 ? 'stats-legend-item' : 'stats-legend-item is-zero' }, undefined, false);
      const swatch = node(item, 'span', { class: 'stats-legend-swatch', 'aria-hidden': 'true' }, undefined, false);
      swatch.style.backgroundColor = p.color || o.color || DEFAULT_COLOR;
      node(item, 'span', { class: 'stats-legend-label' }, p.label, false);
      node(item, 'span', { class: 'stats-legend-value' }, fmt(o, values[i]), false);
      node(item, 'span', { class: 'stats-legend-share' }, share(values[i] / total), false);
    });
  }
  // Tiny trend line for a KPI card. Colour and stroke come from CSS through --tone.
  function sparkline(host, values = [], o = {}) {
    host.replaceChildren();
    const clean = (Array.isArray(values) ? values : []).map(positive);
    if (clean.length < 2) return;
    const series = clean.length <= 60 ? clean : Array.from({ length: 60 }, (_, k) => {
      const part = clean.slice(Math.floor(k * clean.length / 60), Math.floor((k + 1) * clean.length / 60));
      return part.reduce((sum, v) => sum + v, 0) / part.length;
    });
    const svg = node(host, 'svg', { class: 'stats-spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    if (o.color) setVar(svg, '--tone', o.color);
    const max = Math.max(...series);
    if (!(max > 0)) {
      const flat = node(svg, 'line', { class: 'stats-spark-flat', x1: 0, x2: 100, y1: 14, y2: 14, 'stroke-dasharray': '2 3' });
      flat.setAttribute('vector-effect', 'non-scaling-stroke');
      return;
    }
    const d = series.map((v, i) => `${i ? 'L' : 'M'}${Number((i / (series.length - 1) * 100).toFixed(2))} ${Number((26 - v / max * 24).toFixed(2))}`).join(' ');
    node(svg, 'path', { class: 'stats-spark-area', d: `${d} L100 28 L0 28 Z` });
    node(svg, 'path', { class: 'stats-spark-line', d, fill: 'none' }).setAttribute('vector-effect', 'non-scaling-stroke');
  }

  const api = { bars, line, stacked, donut, heatmap: calendar, calendar, matrix, scatter, rank, segments, sparkline, niceScale };
  root.StatsCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
