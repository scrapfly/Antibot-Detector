const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const statsCss = strip(read('sections/stats/stats.css'));
const lightCss = strip(read('modules/styles/theme-light.css'));
const commonCss = strip(read('modules/styles/common.css'));

/** Custom properties declared in the first block whose selector matches (balanced braces, no nesting needed). */
function tokens(css, selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'block not found: ' + selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}
/** The tokens of the @media print block. */
function printTokens() {
  const start = statsCss.indexOf('@media print');
  const block = statsCss.slice(start, statsCss.indexOf('body.stats-page {', start));
  const body = statsCss.slice(statsCss.indexOf('body.stats-page {', start) + 17, statsCss.indexOf('}', statsCss.indexOf('body.stats-page {', start)));
  assert.ok(block.length > 0);
  const out = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

const darkBase = tokens(commonCss, ':root');
const lightBase = { ...darkBase, ...tokens(commonCss, ':root[data-theme="light"]') };
const darkStats = tokens(statsCss, 'body.stats-page');
const lightStats = { ...darkStats, ...tokens(lightCss, ':root[data-theme="light"] body.stats-page') };

/* ----- a tiny colour toolkit: hex, rgb(a), var(), color-mix(in srgb, A [p%], B [q%]) ----- */
function parse(value, theme) {
  const v = String(value).trim();
  let m;
  if ((m = v.match(/^var\((--[\w-]+)\)$/))) {
    const next = theme[m[1]];
    assert.ok(next !== undefined, 'unresolved ' + m[1]);
    return parse(next, theme);
  }
  if ((m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i))) {
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  if ((m = v.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  if ((m = v.match(/^color-mix\(in srgb,\s*(.+)\)$/))) {
    const parts = splitTop(m[1]).map(s => {
      const pct = s.match(/\s([\d.]+)%$/);
      return { color: pct ? s.slice(0, pct.index) : s, pct: pct ? parseFloat(pct[1]) : null };
    });
    let [a, b] = parts;
    if (a.pct === null && b.pct === null) { a.pct = 50; b.pct = 50; }
    else if (a.pct === null) a.pct = 100 - b.pct;
    else if (b.pct === null) b.pct = 100 - a.pct;
    const ca = parse(a.color.replace(/var\((--[\w-]+)\)/g, '$&'), theme), cb = parse(b.color, theme);
    const wa = a.pct / 100, wb = b.pct / 100;
    return { r: ca.r * wa + cb.r * wb, g: ca.g * wa + cb.g * wb, b: ca.b * wa + cb.b * wb, a: 1 };
  }
  throw new Error('cannot parse colour: ' + v);
}
function splitTop(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
const lum = c => .2126 * lin(c.r) + .7152 * lin(c.g) + .0722 * lin(c.b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/** Equal as colours when both parse (so .10 and 0.1 match), else equal as text. */
function sameValue(a, b) {
  try {
    const x = parse(a, {}), y = parse(b, {});
    return ['r', 'g', 'b', 'a'].every(k => Math.abs(x[k] - y[k]) < 1e-6);
  } catch (_) {
    return String(a).replace(/\s+/g, ' ').toLowerCase() === String(b).replace(/\s+/g, ' ').toLowerCase();
  }
}
const hex = c => '#' + [c.r, c.g, c.b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('');

/** Resolve the ink tokens the way the page does (category colour, darkened by --s-ink-darken). */
function inks(theme) {
  const darken = parseFloat(theme['--s-ink-darken']);
  const cat = key => parse(theme['--cat-' + key], theme);
  const dark = c => ({ r: c.r * (1 - darken / 100), g: c.g * (1 - darken / 100), b: c.b * (1 - darken / 100), a: 1 });
  const neutral = parse(theme['--s-neutral'], theme), fp = cat('fingerprint');
  return {
    antibot: dark(cat('antibot')), captcha: dark(cat('captcha')), other: dark(cat('other')),
    fingerprint: { r: fp.r * .42 + neutral.r * .58, g: fp.g * .42 + neutral.g * .58, b: fp.b * .42 + neutral.b * .58, a: 1 }
  };
}

const THEMES = { dark: { ...darkBase, ...darkStats }, light: { ...lightBase, ...lightStats } };
const rows = [];
function check(theme, label, fg, bg, min) {
  const value = ratio(fg, bg);
  rows.push({ theme, label, ratio: value.toFixed(2), min, ok: value >= min });
  assert.ok(value >= min, `${theme}: ${label} ${value.toFixed(2)}:1 is below ${min}:1 (${hex(fg)} on ${hex(bg)})`);
}

test('graphic inks and the series colour reach 3:1 against the card in both themes', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const card = parse(theme['--s-card'], theme);
    const ink = inks(theme);
    for (const key of Object.keys(ink)) check(name, '--ink-' + key, ink[key], card, 3);
    check(name, '--s-series', parse(theme['--s-series'], theme), card, 3);
    check(name, '--s-neutral', parse(theme['--s-neutral'], theme), card, 3);
    check(name, '--s-heat', parse(theme['--s-heat'], theme), card, 2.5);
    check(name, '--s-control-border', parse(theme['--s-control-border'], theme), card, 3);
    for (const key of ['--danger', '--warning', '--success']) check(name, key, parse(theme[key], theme), card, 3);
  }
});

test('text tokens reach 4.5:1 on the card and the page in both themes', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const card = parse(theme['--s-card'], theme), page = parse(theme['--s-page'], theme);
    for (const key of ['--text-primary', '--text-secondary', '--s-ok-text', '--s-warn-text', '--s-danger-text', '--s-accent-text']) {
      check(name, key + ' on card', parse(theme[key], theme), card, 4.5);
      check(name, key + ' on page', parse(theme[key], theme), page, 4.5);
    }
    // Text on tinted surfaces: accent text on the soft accent, secondary on the neutral badge, semantic text on its tint
    const soft = over(parse(theme['--s-accent-soft'], theme), card);
    check(name, 'accent text on accent-soft', parse(theme['--s-accent-text'], theme), soft, 4.5);
    check(name, 'secondary on delta badge', parse(theme['--text-secondary'], theme), over(parse(theme['--s-inset-strong'], theme), card), 4.5);
    check(name, 'ok text on ok tint', parse(theme['--s-ok-text'], theme), over(parse(theme['--s-ok-bg'], theme), card), 4.5);
    check(name, 'warn text on warn tint', parse(theme['--s-warn-text'], theme), over(parse(theme['--s-warn-bg'], theme), card), 4.5);
    check(name, 'danger text on danger tint', parse(theme['--s-danger-text'], theme), over(parse(theme['--s-danger-bg'], theme), card), 4.5);
    check(name, 'on-accent on primary button', parse(theme['--s-on-accent'], theme), parse(theme['--accent-hover'], theme), 4.5);
    check(name, 'secondary on hovered row', parse(theme['--text-secondary'], theme), over(parse(theme['--s-accent-soft'], theme), card), 4.5);
  }
});

test('calendar numbers read on every level of the heat colour', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const card = parse(theme['--s-card'], theme), heat = parse(theme['--s-heat'], theme);
    const level = n => over({ ...heat, a: parseFloat(theme['--s-lv' + n]) }, card);
    check(name, 'day number on lv0', parse(theme['--text-secondary'], theme), over(parse(theme['--s-empty'], theme), card), 4.5);
    check(name, 'value on lv1', parse(theme['--text-primary'], theme), level(1), 4.5);
    check(name, 'day number on lv1', parse(theme['--text-primary'], theme), level(1), 4.5);
    check(name, 'value on lv2', parse(theme['--text-primary'], theme), level(2), 4.5);
    check(name, 'value on lv3', parse(theme['--s-cal-ink-3'], theme), level(3), 4.5);
    check(name, 'value on lv4', parse(theme['--s-cal-ink-4'], theme), level(4), 4.5);
  }
  if (process.env.STATS_CONTRAST_TABLE) console.table(rows);
});

test('the print block restates the light palette', () => {
  const print = printTokens();
  const skipped = new Set(['--text-primary', '--text-secondary', '--accent', '--accent-light', '--accent-hover', '--success', '--warning', '--danger', '--s-page', '--s-shadow', '--s-hit-filter']);
  const light = { ...lightStats, '--text-primary': lightBase['--text-primary'] };
  for (const [key, value] of Object.entries(print)) {
    if (skipped.has(key)) continue;
    assert.ok(sameValue(value, light[key]), key + ' differs between print and the light theme: ' + value + ' vs ' + light[key]);
  }
  for (const key of ['--text-primary', '--text-secondary', '--accent', '--accent-light', '--accent-hover', '--success', '--warning', '--danger']) {
    assert.equal(print[key].toLowerCase(), String(lightBase[key]).toLowerCase(), key + ' differs from the light theme');
  }
  // Every colour token the light theme redefines is either printed or deliberately screen-only
  const screenOnly = new Set(['--s-page', '--s-shadow', '--s-scroll', '--s-skel-a', '--s-skel-b', '--s-pop', '--s-pop-border', '--s-pop-shadow', '--s-hit-filter']);
  for (const key of Object.keys(tokens(lightCss, ':root[data-theme="light"] body.stats-page'))) {
    assert.ok(key in print || screenOnly.has(key), key + ' is missing from the print block');
  }
});

test('the light theme redefines every dark token that is a colour, and nothing else', () => {
  const light = tokens(lightCss, ':root[data-theme="light"] body.stats-page');
  for (const key of Object.keys(light)) assert.ok(key in darkStats, key + ' is not defined for the dark theme');
  // Tokens that carry the same value in both themes
  const shared = new Set(['--stats-max', '--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5', '--fs-6', '--fs-7', '--fs-kpi', '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6',
    '--r-card', '--r-ctl', '--r-pill', '--page-pad', '--cat-antibot', '--cat-captcha', '--cat-fingerprint', '--cat-other', '--s-series', '--s-heat', '--s-on-accent',
    '--s-lv1', '--s-lv2', '--s-lv3', '--s-lv4', '--ink-antibot', '--ink-captcha', '--ink-other', '--ink-fingerprint']);
  for (const key of Object.keys(darkStats)) {
    if (shared.has(key)) continue;
    assert.ok(key in light, key + ' has a dark value but no light counterpart');
  }
});

test('stats.css uses logical properties and keeps hard-coded colours inside tokens', () => {
  const physical = /(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right|border-top-left-radius|border-top-right-radius|border-bottom-left-radius|border-bottom-right-radius)\s*:/g;
  const found = [...statsCss.matchAll(physical)].map(m => m[2]);
  assert.deepEqual(found, [], 'physical properties in stats.css');
  assert.doesNotMatch(statsCss, /text-align\s*:\s*(left|right)/);
  assert.doesNotMatch(statsCss, /float\s*:/);
  // A hex colour outside a custom-property definition needs a light counterpart: only the mask ramp and the colour-mix base are allowed
  const bad = [];
  for (const decl of statsCss.split(/;|\{|\}/)) {
    const d = decl.trim();
    if (!/#[0-9a-f]{3,8}\b/i.test(d) || d.startsWith('--') || /^@/.test(d)) continue;
    if (/^(-webkit-)?mask-image\s*:/.test(d)) continue;
    bad.push(d.slice(0, 80));
  }
  assert.deepEqual(bad, [], 'hex colours outside tokens');
});

test('every class the page markup contract names has a rule', () => {
  const classes = ['stats-masthead', 'stats-masthead-inner', 'stats-logo', 'stats-heading', 'stats-subtitle', 'stats-menu', 'stats-menu-btn', 'stats-menu-pop', 'stats-menu-scope', 'stats-menu-item', 'stats-menu-note',
    'stats-bar', 'stats-bar-inner', 'stats-nav-wrap', 'stats-section-nav', 'stats-section-btn', 'stats-range', 'stats-range-btn', 'stats-main', 'stats-filters', 'stats-status', 'stats-status--error',
    'stats-skeleton', 'stats-skel-row', 'stats-skel-kpi', 'stats-skel-card', 'stats-empty', 'stats-empty-icon', 'stats-empty-actions', 'stats-btn', 'stats-btn--primary',
    'stats-scope', 'stats-scope-label', 'stats-scope-chip', 'stats-scope-count', 'stats-scope-note', 'stats-context', 'stats-compare', 'stats-lowdata', 'stats-banner', 'stats-banner--ok',
    'stats-headlines', 'stats-headline', 'stats-headline-eyebrow', 'stats-headline-line', 'stats-headline-main', 'stats-headline-sub', 'stats-kpis', 'stats-kpis--compact', 'stats-kpi', 'stats-kpi--compact',
    'stats-kpi-label', 'stats-kpi-row', 'stats-kpi-value', 'stats-kpi-sub', 'stats-kpi-spark', 'stats-panel', 'stats-lead', 'stats-grid', 'stats-card', 'stats-card--wide', 'stats-card--span-4', 'stats-card--span-5',
    'stats-card--span-6', 'stats-card--span-7', 'stats-card--span-8', 'stats-card--slim', 'stats-card-head', 'stats-card-meta', 'stats-card-sub', 'stats-card-note', 'stats-card-foot', 'stats-link-btn',
    'stats-chart', 'stats-chart-svg', 'stats-hit', 'stats-axis-label', 'stats-gridline', 'stats-seg', 'stats-seg-track', 'stats-avg-line', 'stats-bar-value', 'is-partial', 'stats-cal-wrap', 'is-year', 'stats-cal-cell',
    'stats-cal-head', 'stats-cal-month', 'stats-cal-wd', 'stats-cal-day', 'stats-cal-val', 'stats-cal-legend', 'stats-cal-swatch', 'is-today', 'on-fill', 'stats-facts', 'stats-fact',
    'stats-legend', 'stats-legend-item', 'stats-legend-swatch', 'stats-legend-label', 'stats-legend-value', 'stats-legend-share', 'is-zero', 'stats-series-legend',
    'stats-rank', 'stats-rank-row', 'stats-rank-n', 'stats-rank-name', 'stats-rank-label', 'stats-rank-sub', 'stats-rank-val', 'stats-rank-share', 'stats-rank-track',
    'stats-chip', 'stats-chip-label', 'stats-chip-icon', 'stats-brand', 'stats-brand-img', 'stats-headline-mark', 'stats-chip--muted', 'stats-dot', 'stats-pill', 'stats-pill--high', 'stats-pill--medium', 'stats-pill--low', 'stats-pill--none', 'stats-stack',
    'stats-delta', 'stats-delta--up', 'stats-delta--down', 'stats-delta--flat', 'stats-delta--new', 'stats-delta-arrow', 'stats-databar',
    'stats-table-toolbar', 'stats-search', 'stats-sort', 'stats-chips', 'stats-chip-btn', 'stats-chip-btn-icon', 'has-icon', 'stats-chip-count', 'stats-table-wrap', 'stats-table-wrap--flat', 'stats-table', 'is-stack', 'is-num', 'is-nowrap',
    'stats-table-footer', 'stats-table-more', 'stats-none', 'stats-none--inline', 'stats-none--ok', 'stats-category-badge', 'stats-signal', 'stats-signal-desc', 'stats-signal-raw',
    'stats-change', 'stats-change-added', 'stats-change-removed', 'stats-sites', 'stats-site', 'stats-site-name', 'stats-site-count', 'stats-changed-grid', 'stats-changed-col', 'stats-changed-list',
    'stats-changed-row', 'stats-changed-name', 'stats-changed-meta', 'stats-changed-empty', 'stats-decided', 'stats-decided-row', 'stats-decided-head', 'stats-decided-bar', 'stats-lift', 'stats-insight-line',
    'stats-subnav', 'stats-sub-btn', 'stats-subpanel', 'stats-spark', 'stats-spark-area', 'stats-spark-line', 'stats-spark-flat', 'stats-tooltip', 'stats-tooltip-title', 'stats-tooltip-line',
    'stats-tooltip-row', 'stats-sr-only', 'stats-footer', 'is-inert', 'is-empty', 'is-muted', 'can-scroll-start', 'can-scroll-end', 'lv0', 'lv1', 'lv2', 'lv3', 'lv4'];
  const missing = classes.filter(name => !new RegExp('\\.' + name.replace(/[-]/g, '\\-') + '(?![\\w-])').test(statsCss));
  assert.deepEqual(missing, [], 'classes without a CSS rule');
});

test('motion, forced-colors, print and coarse-pointer blocks exist, and the chart svg stays left to right', () => {
  assert.match(statsCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(statsCss, /@media \(forced-colors: active\)/);
  assert.match(statsCss, /@media print/);
  assert.match(statsCss, /@media \(pointer: coarse\)/);
  assert.match(statsCss, /\.stats-chart-svg \{[^}]*direction: ltr/);
  assert.match(statsCss, /\.stats-axis-label \{[^}]*unicode-bidi: plaintext/);
  assert.match(statsCss, /body\.stats-page \[hidden\] \{ display: none !important; \}/);
  assert.match(statsCss, /:root \{ color-scheme: dark; \}/);
  assert.match(read('modules/styles/theme-light.css'), /:root\[data-theme="light"\] body\.stats-page \{\s*color-scheme: light;/);
});
