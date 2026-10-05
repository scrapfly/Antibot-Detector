/* Plain DOM/SVG renderers. Labels and tooltip lines are supplied by the caller. */
(function(root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const positive = value => Math.max(0, number(value));
  const fmt = (o, v, digits) => o.formatNumber ? String(o.formatNumber(v, digits)) : String(v);
  const text = value => value == null ? '' : String(value);
  function node(host, tag, attrs = {}, label, svg = true) {
    const doc = host.ownerDocument || document;
    const n = svg ? doc.createElementNS(NS, tag) : doc.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, String(value)));
    if (label !== undefined) n.textContent = text(label);
    host.appendChild(n);
    return n;
  }
  function start(host, data, o, height = 240) {
    host.replaceChildren();
    if (o.hideTooltip) o.hideTooltip();
    const measured = host.getBoundingClientRect ? host.getBoundingClientRect().width : host.clientWidth;
    const width = Math.max(260, number(measured) || number(host.clientWidth) || 260);
    if (!data.length) {
      node(host, 'div', { class: 'stats-none' }, o.emptyLabel || '', false);
      return null;
    }
    const svg = node(host, 'svg', { class: 'stats-chart-svg', width: '100%', height, viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': text(o.title) });
    node(svg, 'title', {}, o.title || '');
    return { svg, width, height, hits: [] };
  }
  function hit(c, n, label, values, tip, o) {
    const lines = tip == null ? [text(label), ...values] : (Array.isArray(tip) ? tip.map(text) : [text(tip)]);
    const summary = lines.join(': ');
    n.setAttribute('class', 'stats-hit');
    n.setAttribute('tabindex', c.hits.length ? '-1' : '0');
    n.setAttribute('role', 'img');
    n.setAttribute('aria-label', summary);
    node(n, 'title', {}, summary);
    const show = event => { if (o.onTooltip) o.onTooltip(event, lines); };
    n.addEventListener('pointerenter', show);
    n.addEventListener('pointermove', show);
    n.addEventListener('focus', show);
    ['pointerleave', 'blur'].forEach(type => n.addEventListener(type, () => { if (o.hideTooltip) o.hideTooltip(); }));
    n.addEventListener('keydown', event => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const i = c.hits.indexOf(n);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? c.hits.length - 1 : (i + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + c.hits.length) % c.hits.length;
      event.preventDefault();
      c.hits.forEach((item, index) => item.setAttribute('tabindex', index === next ? '0' : '-1'));
      c.hits[next].focus();
    });
    c.hits.push(n);
  }
  function label(svg, x, y, value, anchor = 'start') {
    const n = node(svg, 'text', { x, y, class: 'stats-axis-label', 'text-anchor': anchor, fill: 'currentColor', 'font-size': 11 }, value);
    node(n, 'title', {}, value);
    return n;
  }
  function shortened(value, count) {
    const s = text(value);
    return s.length > count ? s.slice(0, Math.max(1, count - 1)) + '…' : s;
  }
  function grid(c, max, o, left = 42, bottom = 202) {
    for (let i = 0; i <= 4; i++) {
      const y = bottom - i * (bottom - 16) / 4;
      node(c.svg, 'line', { x1: left, x2: c.width - 16, y1: y, y2: y, class: 'stats-gridline', stroke: 'currentColor', opacity: .12 });
      label(c.svg, left - 6, y + 4, fmt(o, max * i / 4, 1), 'end');
    }
  }
  function bars(host, points = [], o = {}) {
    const c = start(host, points, o, o.vertical ? 240 : Math.max(100, points.length * 32 + 20));
    if (!c) return;
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...points.map(p => positive(p.value)));
    if (o.vertical) {
      grid(c, max, o);
      const slot = (c.width - 58) / points.length;
      const step = Math.max(1, Math.ceil(60 / slot));
      points.forEach((p, i) => {
        const height = max ? Math.min(max, positive(p.value)) / max * 186 : 0;
        const g = node(c.svg, 'g');
        node(g, 'rect', { x: 42 + i * slot + slot * .1, y: 202 - height, width: slot * .8, height, fill: p.color || o.color || '#3b82f6' });
        node(g, 'rect', { x: 42 + i * slot, y: 16, width: slot, height: 186, fill: 'transparent' });
        hit(c, g, p.label, [fmt(o, number(p.value))], p.tip, o);
        if (i % step === 0) label(c.svg, 42 + (i + .5) * slot, 226, shortened(p.label, 8), 'middle');
      });
      return;
    }
    const left = Math.min(160, c.width * .42), available = Math.max(1, c.width - left - 62);
    points.forEach((p, i) => {
      const y = 12 + i * 32;
      const l = label(c.svg, 4, y + 16, shortened(p.label, Math.floor(left / 7)));
      node(l, 'title', {}, p.label);
      const g = node(c.svg, 'g');
      node(g, 'rect', { x: left, y, width: max ? Math.min(max, positive(p.value)) / max * available : 0, height: 22, rx: 3, fill: p.color || o.color || '#3b82f6' });
      node(g, 'rect', { x: left, y, width: available, height: 24, fill: 'transparent' });
      hit(c, g, p.label, [fmt(o, number(p.value))], p.tip, o);
      label(c.svg, left + available + 5, y + 16, fmt(o, number(p.value)));
    });
  }
  function line(host, points = [], o = {}) {
    const c = start(host, points, o);
    if (!c) return;
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...points.map(p => positive(p.value)));
    grid(c, max, o);
    const x = i => 42 + (c.width - 58) * (points.length === 1 ? .5 : i / (points.length - 1));
    const y = v => 202 - (max ? Math.min(max, positive(v)) / max : 0) * 186;
    let segment = [];
    function flush() {
      if (!segment.length) return;
      const d = segment.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
      if (o.fill) node(c.svg, 'path', { d: `${d} L${segment[segment.length - 1][0]} 202 L${segment[0][0]} 202 Z`, fill: o.color || '#3b82f6', opacity: .15 });
      node(c.svg, 'path', { d, fill: 'none', stroke: o.color || '#3b82f6', 'stroke-width': 2 });
      segment = [];
    }
    points.forEach((p, i) => { if (p.value == null || !Number.isFinite(p.value)) flush(); else segment.push([x(i), y(p.value)]); });
    flush();
    const step = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((c.width - 58) / 80))));
    points.forEach((p, i) => {
      if (i % step === 0) label(c.svg, x(i), 226, shortened(p.label, 12), i === 0 ? 'start' : 'middle');
      if (p.value == null || !Number.isFinite(p.value)) return;
      const n = node(c.svg, 'circle', { cx: x(i), cy: y(p.value), r: 5, fill: p.color || o.color || '#3b82f6' });
      hit(c, n, p.label, [fmt(o, p.value)], p.tip, o);
    });
  }
  function stacked(host, rows = [], o = {}) {
    const series = o.series || [];
    const c = start(host, rows, o, o.vertical ? 240 : Math.max(100, rows.length * 34 + 20));
    if (!c) return;
    const totals = rows.map(row => series.reduce((sum, s) => sum + positive((row.values || {})[s.key]), 0));
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...totals), left = Math.min(140, c.width * .4), available = c.width - left - 16;
    if (o.vertical) {
      grid(c, max, o);
      const slot = (c.width - 58) / rows.length;
      const step = Math.max(1, Math.ceil(80 / slot));
      rows.forEach((row, i) => {
        const g = node(c.svg, 'g');
        let y = 202;
        series.forEach(s => {
          const value = positive((row.values || {})[s.key]);
          const height = max ? value / max * 186 : 0;
          y -= height;
          if (value > 0) node(g, 'rect', { x: 42 + i * slot + slot * .1, y, width: slot * .8, height, fill: s.color || o.color || '#3b82f6' });
        });
        node(g, 'rect', { x: 42 + i * slot, y: 16, width: slot, height: 186, fill: 'transparent' });
        hit(c, g, row.label, series.map(s => `${text(s.label)}: ${fmt(o, positive((row.values || {})[s.key]))}`), row.tip, o);
        if (i % step === 0) label(c.svg, 42 + (i + .5) * slot, 226, shortened(row.label, 10), i === 0 ? 'start' : 'middle');
      });
      return;
    }
    rows.forEach((row, i) => {
      label(c.svg, 4, i * 34 + 29, shortened(row.label, Math.floor(left / 7)));
      let x = left;
      series.forEach(s => {
        const value = positive((row.values || {})[s.key]);
        const width = max ? value / max * available : 0;
        if (value > 0) {
          const n = node(c.svg, 'rect', { x, y: i * 34 + 12, width, height: 24, fill: s.color || o.color || '#3b82f6' });
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
    const total = parts.reduce((sum, p) => sum + positive(p.value), 0), cx = c.width / 2, cy = 110, r = 74;
    node(c.svg, 'circle', { cx, cy, r, fill: 'none', stroke: 'currentColor', opacity: .1, 'stroke-width': 26 });
    let offset = 0;
    parts.forEach(p => {
      const value = positive(p.value), share = total ? value / total : 0;
      if (value > 0) {
        const n = node(c.svg, 'circle', { cx, cy, r, fill: 'none', stroke: p.color || o.color || '#3b82f6', 'stroke-width': 26, 'stroke-dasharray': `${share * 2 * Math.PI * r} ${2 * Math.PI * r}`, 'stroke-dashoffset': -offset * 2 * Math.PI * r, transform: `rotate(-90 ${cx} ${cy})` });
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
      const item = node(legend, 'div', { class: 'stats-legend-item' }, undefined, false);
      const swatch = node(item, 'span', { class: 'stats-legend-swatch', 'aria-hidden': 'true' }, undefined, false);
      swatch.style.backgroundColor = p.color || o.color || '#3b82f6';
      node(item, 'span', { class: 'stats-legend-label' }, p.label, false);
      node(item, 'span', { class: 'stats-legend-value' }, fmt(o, number(p.value)), false);
      node(item, 'span', { class: 'stats-legend-share' }, fmt(o, total ? positive(p.value) / total * 100 : 0, 1) + '%', false);
    });
  }
  function heatmap(host, points = [], o = {}) {
    const c = start(host, points, o, Math.max(120, Math.ceil(points.length / 7) * 24 + 36));
    if (!c) return;
    c.svg.setAttribute('class', 'stats-chart-svg stats-heatmap');
    const group = node(c.svg, 'g', { class: 'stats-heatmap-grid' });
    const days = points.map(p => {
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text(p.date)) ? Date.parse(p.date + 'T00:00:00Z') : NaN;
      return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : null;
    });
    const known = days.filter(day => day !== null);
    const first = known.length ? Math.min(...known) : 0;
    const firstWeek = first - ((first + 3) % 7 + 7) % 7;
    const slots = days.map((day, i) => day === null ? i : day - firstWeek);
    const columns = Math.max(1, Math.floor((c.width - 16) / 24));
    const weeks = Math.ceil((Math.max(0, ...slots) + 1) / 7);
    const blocks = Math.ceil(weeks / columns);
    const height = blocks * 188 + 24;
    c.svg.setAttribute('height', height);
    c.svg.setAttribute('viewBox', `0 0 ${c.width} ${height}`);
    const max = Number.isFinite(o.fixedMax) && o.fixedMax > 0 ? o.fixedMax : Math.max(0, ...points.map(p => positive(p.value)));
    points.forEach((p, i) => {
      const week = Math.floor(slots[i] / 7), day = slots[i] % 7;
      const n = node(group, 'rect', { x: 8 + week % columns * 24, y: 8 + Math.floor(week / columns) * 188 + day * 24, width: 20, height: 20, rx: 3, fill: o.color || '#3b82f6', 'fill-opacity': max && positive(p.value) ? .2 + .8 * Math.min(max, positive(p.value)) / max : .08, 'data-date': text(p.date) });
      hit(c, n, p.label || p.date, [fmt(o, number(p.value))], p.tip, o);
      n.setAttribute('class', 'stats-hit stats-heatmap-cell');
    });
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
        node(g, 'rect', { x: left + j * cell, y: left + i * cell, width: cell - 3, height: cell - 3, rx: 3, fill: a.color || o.color || '#3b82f6', 'fill-opacity': max && value ? .2 + .8 * value / max : .06 });
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
    const ymin = Math.min(0, ...valid.map(p => p.y)), ymax = Math.max(0, Number.isFinite(o.yMax) && o.yMax > 0 ? o.yMax : 0, ...valid.map(p => p.y));
    for (let i = 0; i <= 4; i++) {
      const y = 202 - i * 186 / 4;
      node(c.svg, 'line', { x1: 42, x2: c.width - 16, y1: y, y2: y, class: 'stats-gridline', stroke: 'currentColor', opacity: .12 });
      label(c.svg, 36, y + 4, fmt(o, ymin + (ymax - ymin) * i / 4, 1), 'end');
    }
    label(c.svg, c.width / 2, 252, o.xLabel, 'middle');
    label(c.svg, 44, 12, o.yLabel);
    label(c.svg, 42, 226, fmt(o, xmin));
    label(c.svg, c.width - 16, 226, fmt(o, xmax), 'end');
    valid.forEach(p => {
      const n = node(c.svg, 'circle', { cx: 42 + (xmax === xmin ? .5 : (p.x - xmin) / (xmax - xmin)) * (c.width - 58), cy: 202 - (ymax === ymin ? 0 : (p.y - ymin) / (ymax - ymin)) * 186, r: Math.max(3, Math.min(18, positive(p.radius) || 4)), fill: o.color || '#3b82f6', opacity: .75 });
      hit(c, n, p.label, [text(o.xLabel) + ': ' + fmt(o, p.x), text(o.yLabel) + ': ' + fmt(o, p.y)], p.tip, o);
    });
  }
  const api = { bars, line, stacked, donut, heatmap, matrix, scatter };
  root.StatsCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
