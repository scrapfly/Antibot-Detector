/**
 * Helpers shared by the Statistics page: formatting, DOM building, tables and the chart tooltip.
 * Nothing here reads History. Load after i18n.js and before the stats-*.js views and stats.js.
 */
(function(root) {
  'use strict';
  const byId = id => document.getElementById(id);
  const tr = (key, fallback) => I18n.tr(key, fallback);
  const fmt = (key, fallback, ...args) => {
    const translated = I18n.format(key, ...args);
    return translated || args.reduce((message, arg, i) => message.split('{' + i + '}').join(String(arg)), fallback);
  };
  const locale = () => String(I18n._overrideLocale || chrome.i18n.getUILanguage() || 'en').replace('_', '-');

  // Intl objects are costly to build and a table or chart formats hundreds of values: keep one per locale and option set.
  const formatters = new Map();
  function intl(kind, options) {
    const key = kind + '|' + locale() + '|' + JSON.stringify(options || {});
    if (!formatters.has(key)) {
      let made = null;
      try { made = new Intl[kind](locale(), options); } catch (_) { made = null; }
      formatters.set(key, made);
    }
    return formatters.get(key);
  }
  const num = (value, digits = 0) => {
    const f = intl('NumberFormat', { maximumFractionDigits: digits });
    return f ? f.format(value) : String(value);
  };
  /** A 0..100 score as a percentage. */
  const percent = value => {
    const f = intl('NumberFormat', { style: 'percent', maximumFractionDigits: 1 });
    return f ? f.format(value / 100) : num(value, 1) + '%';
  };
  /** A share (0..1) as a percentage: one decimal below 10%, none from there. */
  const share = fraction => {
    const value = Number.isFinite(fraction) ? fraction : 0;
    const f = intl('NumberFormat', { style: 'percent', maximumFractionDigits: value > 0 && value < .1 ? 1 : 0 });
    return f ? f.format(value) : Math.round(value * 100) + '%';
  };
  const signed = value => {
    const f = intl('NumberFormat', { signDisplay: 'exceptZero', maximumFractionDigits: 0 });
    return f ? f.format(value) : (value > 0 ? '+' : '') + value;
  };
  /** "12 days" in the page language. */
  const days = count => {
    const f = intl('NumberFormat', { style: 'unit', unit: 'day', unitDisplay: 'long' });
    return f ? f.format(count) : String(count);
  };
  const list = names => {
    const f = intl('ListFormat', { style: 'long', type: 'conjunction' });
    return f ? f.format(names) : names.join(', ');
  };
  const confidence = value => value === null || value === undefined ? tr('timeUnknown', 'Unknown') : percent(value);

  const dateText = ts => {
    const f = intl('DateTimeFormat', { dateStyle: 'medium' });
    return f ? f.format(new Date(ts)) : new Date(ts).toDateString();
  };
  const dayDate = key => { const [year, month, day] = String(key).split('-').map(Number); return new Date(year, month - 1, day, 12); };
  const dayLabel = (key, full = false) => {
    const f = intl('DateTimeFormat', full ? { dateStyle: 'medium' } : { day: 'numeric', month: 'short' });
    return f ? f.format(dayDate(key)) : String(key);
  };
  /** "Sep 18 – Oct 17"; the year is added when the range crosses one. */
  function rangeText(from, to) {
    const a = new Date(from), b = new Date(to);
    const f = intl('DateTimeFormat', a.getFullYear() === b.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    if (!f) return dateText(from) + ' – ' + dateText(to);
    try { return f.formatRange(a, b); } catch (_) { return f.format(a) + ' – ' + f.format(b); }
  }
  const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  /** Whole local calendar days between a time and now (0 = today). */
  const daysAgo = (ts, now) => Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  /** "5 minutes ago", "in 20 minutes", "yesterday": the unit follows the distance. */
  function relative(ts, now) {
    const f = intl('RelativeTimeFormat', { numeric: 'auto' });
    if (!f) return dateText(ts);
    const diff = ts - now, abs = Math.abs(diff);
    if (abs < 60000) return f.format(0, 'second');
    if (abs < 3600000) return f.format(Math.round(diff / 60000), 'minute');
    if (abs < 86400000) return f.format(Math.round(diff / 3600000), 'hour');
    return f.format(-daysAgo(ts, now), 'day');
  }
  const hourLabel = hour => {
    const f = intl('DateTimeFormat', { hour: 'numeric' });
    return f ? f.format(new Date(2026, 0, 4, hour)) : String(hour);
  };
  const weekdayLabel = (weekday, style = 'short') => {
    const f = intl('DateTimeFormat', { weekday: style });
    return f ? f.format(new Date(2026, 0, 4 + weekday, 12)) : String(weekday);
  };
  const monthLabel = key => {
    const f = intl('DateTimeFormat', { month: 'short' });
    return f ? f.format(dayDate(key)) : String(key).slice(5, 7);
  };

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const setText = (id, value) => { byId(id).textContent = value; };
  function setVar(node, name, value) {
    if (!node.style) return;
    if (typeof node.style.setProperty === 'function') node.style.setProperty(name, value); else node.style[name] = value;
  }

  // Colour roles: anti-bot and CAPTCHA carry the saturated inks, fingerprint is quiet, difficulty has its own tokens.
  const CATEGORY_KEYS = Categories.KEYS_AND_OTHER;
  const ink = key => 'var(--ink-' + (CATEGORY_KEYS.includes(key) ? key : 'other') + ')';
  const DIFFICULTY_COLORS = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--success)', None: 'var(--s-neutral)' };
  /** Anti-bot and CAPTCHA together is its own tier: a violet that neither category ink mixes into, readable on both card colours. */
  const mixInk = () => '#8b5cf6';
  /** The categories a chart stacks, in drawing order: the ones in scope, and "other" only when something was found in it. */
  const activeCategories = (scope, counts) => ['antibot', 'captcha', 'other', 'fingerprint'].filter(key => scope.has(key) && (key !== 'other' || (counts && counts.other > 0)));
  const categoryLabel = key => (Categories.LABELS[key] ? tr(...Categories.LABELS[key]) : key);
  const difficultyLabel = key => ({ High: tr('difficultyHigh', 'High'), Medium: tr('difficultyMedium', 'Medium'),
    Low: tr('difficultyLow', 'Low'), None: tr('statsDifficultyNoneScoped', 'No protection') }[key] || key);
  const methodLabel = key => FormatUtils.methodLabel(key);

  function dot(color) {
    const node = element('i', 'stats-dot');
    node.setAttribute('aria-hidden', 'true');
    if (color) setVar(node, '--c', color);
    return node;
  }
  /**
   * The category's own icon, or a plain dot when the category has none (e.g. "other").
   * A colour is set on the mark itself; inside a chip the icon inherits the chip's --c, so omit it there.
   */
  function categoryMark(category, color) {
    const svg = category && typeof FormatUtils !== 'undefined' ? FormatUtils.categoryIconSvg(category) : '';
    if (!svg) return dot(color);
    const node = element('span', 'stats-chip-icon');
    node.setAttribute('aria-hidden', 'true');
    if (color) setVar(node, '--c', color);
    node.innerHTML = svg;
    return node;
  }
  // A protection's own logo by name (the stored rules carry it); render() sets this each pass.
  let brandIcons = {};
  function setBrandIcons(map) { brandIcons = map && typeof map === 'object' ? map : {}; }
  /** The protection's own logo when its icon is known, otherwise the category icon. */
  function brandMark(name, category, color) {
    const icon = name ? brandIcons[String(name).toLowerCase()] : '';
    if (icon && typeof FormatUtils !== 'undefined' && FormatUtils.brandLogoHtml) {
      const span = element('span', 'stats-brand');
      span.setAttribute('aria-hidden', 'true');
      span.innerHTML = FormatUtils.brandLogoHtml(icon, name || '', 'stats-brand-img');
      return span;
    }
    return categoryMark(category, color);
  }
  /** A protection as a chip: its logo (or category icon) and name, ellipsised with the full name in the title. */
  function chip(name, category, muted = false) {
    const node = element('span', muted ? 'stats-chip stats-chip--muted' : 'stats-chip');
    node.setAttribute('title', name);
    if (category) { setVar(node, '--c', ink(category)); node.appendChild(brandMark(name, category)); }
    node.appendChild(element('span', 'stats-chip-label', name));
    return node;
  }
  function categoryBadge(key) {
    const badge = element('span', 'stats-category-badge');
    setVar(badge, '--c', ink(key));
    badge.append(categoryMark(key), document.createTextNode(categoryLabel(key)));
    return badge;
  }
  /** Method names carry their meaning in the label, so the badge stays neutral. */
  function methodBadge(key) {
    const badge = element('span', 'stats-category-badge');
    badge.appendChild(document.createTextNode(methodLabel(key)));
    return badge;
  }
  const pill = level => element('span', 'stats-pill stats-pill--' + String(level || 'none').toLowerCase(), difficultyLabel(level));
  /** The protections of a domain: three chips and a "+N more". */
  function stack(row, limit = 3) {
    const wrap = element('span', 'stats-stack');
    const names = row.stack || [];
    names.slice(0, limit).forEach(item => wrap.appendChild(chip(item.name, item.category)));
    const more = Math.max(0, (row.stackTotal || names.length) - Math.min(limit, names.length));
    if (more > 0) {
      const chipNode = element('span', 'stats-chip stats-chip--muted', fmt('statsMoreStackFmt', '+{0} more', num(more)));
      const hidden = names.slice(limit).map(item => item.name).filter(Boolean);
      if (hidden.length) chipNode.setAttribute('title', hidden.join(', '));
      wrap.appendChild(chipNode);
    }
    return wrap;
  }
  const none = (text, ok = false) => element('div', ok ? 'stats-none stats-none--inline stats-none--ok' : 'stats-none stats-none--inline', text);

  const ARROWS = { up: '▲', down: '▼', flat: '=', new: '' };
  /** What a comparison badge shows. Neutral: the direction is the arrow and the text, never a colour. */
  function deltaView(delta, previous) {
    if (!delta) return null;
    const was = fmt('statsDeltaWasFmt', 'Previous period: {0}', num(previous));
    if (delta.kind === 'new') return { kind: 'new', text: tr('statsDeltaNew', 'new'), label: tr('statsDeltaNew', 'new'), tip: was };
    if (delta.kind === 'flat') return { kind: 'flat', text: '', label: tr('statsDeltaFlat', 'No change compared with the previous period'), tip: was };
    const size = delta.ratio === null ? num(Math.abs(delta.diff)) : share(Math.abs(delta.ratio));
    return { kind: delta.kind, text: delta.ratio === null ? signed(delta.diff) : size, tip: was,
      label: fmt(delta.kind === 'up' ? 'statsDeltaUpFmt' : 'statsDeltaDownFmt', (delta.kind === 'up' ? 'Up' : 'Down') + ' {0} compared with the previous period', size) };
  }
  /** Fills a badge element with a deltaView() result, or hides it when there is none. */
  function fillDelta(node, view) {
    if (!view) { node.hidden = true; return node; }
    node.hidden = false;
    node.className = 'stats-delta stats-delta--' + view.kind;
    node.setAttribute('aria-label', view.label);
    node.setAttribute('title', view.tip);
    const arrow = element('span', 'stats-delta-arrow', ARROWS[view.kind]);
    arrow.setAttribute('aria-hidden', 'true');
    node.replaceChildren(arrow, element('span', 'stats-delta-text', view.text));
    return node;
  }
  const deltaBadge = view => view ? fillDelta(element('span'), view) : null;
  /** Rows of the chart libraries take the same shape. */
  const rankDelta = view => view ? { kind: view.kind, text: view.text, label: view.label, tip: view.tip } : undefined;

  /** A value with a small bar behind it, for table cells. */
  function databar(value, max, color) {
    const wrap = element('div', 'stats-databar');
    const track = element('span'), fill = element('i');
    setVar(fill, '--w', (max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0).toFixed(2) + '%');
    setVar(fill, '--bar', color || 'var(--s-series)');
    track.appendChild(fill);
    wrap.append(element('b', '', num(value)), track);
    return wrap;
  }
  /** Tooltip tile attributes understood by modules/ui/tooltip.js. */
  function setTip(node, title, detail, rows = []) {
    if (!node) return;
    node.tabIndex = 0;
    node.setAttribute('data-tip', title);
    if (detail) node.setAttribute('data-tip-detail', detail); else node.removeAttribute('data-tip-detail');
    const kept = rows.filter(Boolean);
    if (kept.length) node.setAttribute('data-tip-rows', JSON.stringify(kept)); else node.removeAttribute('data-tip-rows');
  }

  /**
   * Fills a table host. o: { caption, headers: [text | { text, num, nowrap, title }], rows: [cells | { cells, tone }],
   * empty, ok, ltrFirst, stack }. A cell is a string, a number or a Node. Returns the table, or null when there are no rows.
   */
  function table(host, o) {
    host.replaceChildren();
    const rows = o.rows || [];
    const regionless = () => { ['tabindex', 'role', 'aria-label'].forEach(name => host.removeAttribute(name)); };
    if (!rows.length) { host.appendChild(none(o.empty !== undefined ? o.empty : tr('statsNoData', 'No data in this range'), o.ok)); regionless(); return null; }
    const headers = (o.headers || []).map(h => typeof h === 'string' ? { text: h } : h);
    const node = element('table', o.stack === false ? 'stats-table' : 'stats-table is-stack');
    node.appendChild(element('caption', 'stats-sr-only', o.caption || ''));
    const head = element('thead'), header = element('tr');
    headers.forEach(h => {
      const th = element('th', h.num ? 'is-num' : '', h.text);
      th.scope = 'col';
      if (h.title) th.setAttribute('title', h.title);
      header.appendChild(th);
    });
    head.appendChild(header);
    const body = element('tbody');
    rows.forEach(entry => {
      const cells = Array.isArray(entry) ? entry : entry.cells, tone = Array.isArray(entry) ? '' : entry.tone;
      const row = element('tr', tone ? 'is-' + tone : '');
      cells.forEach((value, index) => {
        const h = headers[index] || {};
        const cell = element(index ? 'td' : 'th', index ? [h.num ? 'is-num' : '', h.nowrap ? 'is-nowrap' : ''].filter(Boolean).join(' ') : '');
        if (!index) {
          cell.scope = 'row';
          if (o.ltrFirst) cell.setAttribute('dir', 'ltr');
        } else cell.setAttribute('data-label', h.text || '');
        if (value instanceof Node) cell.appendChild(value); else cell.textContent = String(value);
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    node.append(head, body);
    host.appendChild(node);
    // A scrolling table is a region keyboard users can reach; one that fits is not a tab stop
    const overflows = (host.scrollWidth > host.clientWidth + 1) || (host.scrollHeight > host.clientHeight + 1);
    if (overflows) {
      host.setAttribute('tabindex', '0');
      host.setAttribute('role', 'region');
      host.setAttribute('aria-label', o.caption || '');
    } else regionless();
    return node;
  }
  /** "50 of 120 rows" under a table, and its Show more button; the whole footer goes when there is nothing to count. */
  function tableCount(prefix, visible, total) {
    setText(prefix + 'Count', fmt('statsTableCountFmt', '{0} of {1} rows', num(visible), num(total)));
    byId(prefix + 'More').hidden = visible >= total;
    byId(prefix + 'Footer').hidden = total === 0;
  }

  let tooltipAnchor = null;
  function hideTooltip() {
    const tip = byId('statsTooltip');
    tip.hidden = true;
    if (tooltipAnchor) tooltipAnchor.removeAttribute('aria-describedby');
    tooltipAnchor = null;
  }
  /** Lines are strings (the first is the title) or { label, value, color } rows. */
  function showTooltip(event, lines) {
    const tip = byId('statsTooltip');
    if (tooltipAnchor && tooltipAnchor !== event.currentTarget) tooltipAnchor.removeAttribute('aria-describedby');
    tooltipAnchor = event.currentTarget || null;
    if (tooltipAnchor) tooltipAnchor.setAttribute('aria-describedby', tip.id);
    tip.replaceChildren(...lines.map((line, i) => {
      if (line && typeof line === 'object') {
        const row = element('div', 'stats-tooltip-row'), label = element('span', '');
        const mark = line.category ? categoryMark(line.category, line.color || ink(line.category)) : null;
        if (mark && mark.className === 'stats-chip-icon') {
          // The category's own icon, coloured; no --c on the label so its dot pseudo-element stays off
          label.append(mark, document.createTextNode(String(line.label)));
        } else {
          if (line.color) setVar(label, '--c', line.color);
          label.textContent = String(line.label);
        }
        row.append(label, element('b', '', String(line.value)));
        return row;
      }
      return element('div', i ? 'stats-tooltip-line' : 'stats-tooltip-title', String(line));
    }));
    tip.hidden = false;
    const anchor = event.currentTarget && event.currentTarget.getBoundingClientRect && event.currentTarget.getBoundingClientRect();
    const keyboard = event.type === 'focus' || !Number.isFinite(event.clientX);
    const x = keyboard ? (anchor ? anchor.left + anchor.width / 2 : 8) : event.clientX;
    const y = keyboard ? (anchor ? anchor.bottom : 8) : event.clientY;
    const rect = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - rect.width - 8)) + 'px';
    tip.style.top = Math.max(8, y + 12 + rect.height > window.innerHeight ? y - rect.height - 12 : y + 12) + 'px';
  }
  /** A tap anywhere but on the element that owns the tooltip dismisses it (touch tooltips stay until then). */
  function hideTooltipOutside(target) {
    if (tooltipAnchor && !(target && typeof tooltipAnchor.contains === 'function' && tooltipAnchor.contains(target))) hideTooltip();
  }
  /** A tooltip on a plain node (not a chart hit); also a keyboard stop. */
  function bindTooltip(node, lines) {
    node.tabIndex = 0;
    node.setAttribute('aria-label', lines.map(line => line && typeof line === 'object' ? line.label + ': ' + line.value : String(line)).join(', '));
    node.addEventListener('pointermove', event => showTooltip(event, lines));
    node.addEventListener('focus', event => showTooltip(event, lines));
    node.addEventListener('pointerleave', hideTooltip);
    node.addEventListener('blur', hideTooltip);
  }
  const chartOptions = (title, extra = {}) => ({ title, emptyLabel: tr('statsNoData', 'No data in this range'),
    formatNumber: num, color: 'var(--s-series)', onTooltip: showTooltip, hideTooltip, ...extra });
  /** The line of a protection: category, pages, domains and confidence. */
  const protectionTip = row => [row.name,
    { label: tr('statsCategoryColumn', 'Category'), value: categoryLabel(row.category), color: ink(row.category) },
    { label: tr('statsPagesColumn', 'Pages'), value: num(row.pages) },
    { label: tr('statsSectionDomains', 'Domains'), value: num(row.domains) },
    { label: tr('statConfidence', 'Confidence'), value: confidence(row.avgConfidence) }];

  root.StatsUI = { byId, tr, fmt, locale, num, percent, share, signed, days, list, confidence, dateText, dayDate, dayLabel, rangeText, daysAgo, relative,
    hourLabel, weekdayLabel, monthLabel, element, setText, setVar, ink, mixInk, CATEGORY_KEYS, DIFFICULTY_COLORS, activeCategories, categoryLabel, difficultyLabel,
    methodLabel, dot, categoryMark, setBrandIcons, brandMark, chip, categoryBadge, methodBadge, pill, stack, none, deltaView, fillDelta, deltaBadge, rankDelta, databar, setTip, table,
    tableCount, hideTooltip, hideTooltipOutside, showTooltip, bindTooltip, chartOptions, protectionTip };
})(typeof globalThis !== 'undefined' ? globalThis : this);
