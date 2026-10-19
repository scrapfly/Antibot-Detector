/** Protections tab (ranked table, common stacks) and Domains tab (explorer, protection changes of the same page). */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, share, element } = U;
  const V = root.StatsViews = root.StatsViews || {};

  /** A control that hid itself after being pressed ("Show more" at the end, "Clear") must not drop the keyboard on the page body. */
  function refocus(fallback) {
    const active = document.activeElement;
    if (fallback && (!active || active === document.body || active.hidden || (active.closest && active.closest('[hidden]')))) fallback.focus();
  }

  /* ---------- Protections ---------- */
  /** Detector rows with their pages in the previous period, sorted by the chosen column. */
  function protectionRows(app) {
    const { state, d } = app, usable = d.compare && d.compare.usable;
    const rows = d.stats.detectorMetrics.map(row => {
      const before = usable ? (d.compare.prevIndex.get(row.name.toLowerCase()) || { pages: 0 }).pages : 0;
      return { ...row, before, diff: usable ? row.pages - before : 0 };
    });
    // "Biggest change" needs a previous period: offer it only when there is one
    const sortSelect = byId('statsProtectionSort'), changeOption = sortSelect && sortSelect.querySelector('option[value="change"]');
    if (changeOption) changeOption.disabled = !usable;
    if (!usable && state.protectionSort === 'change') { state.protectionSort = 'pages'; if (sortSelect) sortSelect.value = 'pages'; }
    const by = state.protectionSort;
    if (by === 'domains') rows.sort((a, b) => b.domains - a.domains || b.pages - a.pages || a.name.localeCompare(b.name));
    else if (by === 'change' && usable) rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.pages - a.pages || a.name.localeCompare(b.name));
    return rows;
  }
  function strongCell(row) {
    const scored = row.strong + row.moderate + row.weak;
    if (!scored) return '–';
    const cell = element('span', '', share(row.strong / scored));
    const counts = [['statsTierStrong', 'Strong', row.strong], ['statsTierModerate', 'Moderate', row.moderate], ['statsTierWeak', 'Weak', row.weak]]
      .map(([key, text, count]) => ({ label: tr(key, text), value: num(count) }));
    cell.setAttribute('data-tip', tr('statsStrongEvidence', 'Strong evidence'));
    cell.setAttribute('data-tip-rows', JSON.stringify(counts));
    // The counts are also read out: the hover tip alone would leave keyboard and screen-reader users without them
    cell.appendChild(element('span', 'stats-sr-only', ' (' + counts.map(c => c.label + ': ' + c.value).join(', ') + ')'));
    return cell;
  }
  function renderProtectionTable(app) {
    const { state, d } = app, usable = d.compare && d.compare.usable;
    const all = protectionRows(app), rows = all.slice(0, state.limits.protection);
    const max = Math.max(1, ...all.map(row => row.pages));
    U.table(byId('statsProtectionTable'), {
      caption: tr('statsProtectionDetails', 'All protections'),
      headers: [tr('statsProtectionColumn', 'Protection'), tr('statsCategoryColumn', 'Category'), { text: tr('statsPagesColumn', 'Pages'), num: true },
        { text: tr('statsSectionDomains', 'Domains'), num: true }, { text: tr('statsChangeVsPrevColumn', 'Change'), num: true },
        { text: tr('statsStrongColumn', 'Strong evidence'), num: true, title: tr('statsTierHint', 'Strong is 80% or more, moderate 40-79%, weak below 40%. 100% means a signal only that protection produces.') }],
      rows: rows.map(row => {
        const name = element('span', 'stats-stack');
        name.append(U.brandMark(row.name, row.category, U.ink(row.category)), document.createTextNode(row.name));
        const delta = usable ? U.deltaBadge(U.deltaView(HistoryStats.delta(row.pages, row.before), row.before)) : null;
        return [name, U.categoryBadge(row.category), U.databar(row.pages, max, U.ink(row.category)), num(row.domains), delta || '–', strongCell(row)];
      })
    });
    U.tableCount('statsProtection', rows.length, all.length);
  }
  function renderStacks(app) {
    const rows = app.d.stats.stackMetrics.map(row => ({ label: row.names.join(' + '), value: row.domains, sub: U.list(row.hostnames) }));
    root.StatsCharts.rank(byId('statsStacks'), rows, U.chartOptions(tr('statsCommonStacks', 'Common protection stacks'), {}));
  }

  /* ---------- Domains ---------- */
  const filtersActive = f => !!(f.query || f.difficulty.size || f.captcha || f.changed);
  function domainIndex(app) {
    const d = app.d;
    if (!d.domainIndex) d.domainIndex = d.stats.domainMetrics.map(row => (row.hostname + '\n' + row.stack.map(item => item.name).join('\n')).toLowerCase());
    return d.domainIndex;
  }
  /** Rows matching the search, with the counts each chip would give against that search. */
  function searchedDomains(app) {
    const { state, d } = app, query = state.domain.query.trim().toLowerCase(), index = domainIndex(app);
    const rows = d.stats.domainMetrics.filter((row, i) => !query || index[i].includes(query));
    const changed = new Set(d.changes.hostnames);
    return { rows, changed, counts: { High: rows.filter(r => r.difficulty === 'High').length, Medium: rows.filter(r => r.difficulty === 'Medium').length,
      Low: rows.filter(r => r.difficulty === 'Low').length, captcha: rows.filter(r => r.hasCaptcha).length, changed: rows.filter(r => changed.has(r.hostname)).length } };
  }
  const rankOf = row => HistoryStats.DIFFICULTY_RANK[row.difficulty] || 0;
  const SORTS = {
    hardest: (a, b) => rankOf(b) - rankOf(a) || b.uniqueDetectors - a.uniqueDetectors || b.visits - a.visits || a.hostname.localeCompare(b.hostname),
    visits: (a, b) => b.visits - a.visits || a.hostname.localeCompare(b.hostname),
    lastSeen: (a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0) || a.hostname.localeCompare(b.hostname),
    confidence: (a, b) => (b.avgConfidence === null ? -1 : b.avgConfidence) - (a.avgConfidence === null ? -1 : a.avgConfidence) || a.hostname.localeCompare(b.hostname),
    name: (a, b) => a.hostname.localeCompare(b.hostname)
  };
  function lastSeen(row, now) {
    if (!row.lastTimestamp) return '–';
    return U.daysAgo(row.lastTimestamp, now) <= 30 ? U.relative(row.lastTimestamp, now) : U.dateText(row.lastTimestamp);
  }
  function renderDomainChips(app, found) {
    const f = app.state.domain;
    document.querySelectorAll('[data-difficulty]').forEach(button => {
      button.setAttribute('aria-pressed', String(f.difficulty.has(button.dataset.difficulty)));
      const count = button.querySelector && button.querySelector('.stats-chip-count');
      if (count) count.textContent = num(found.counts[button.dataset.difficulty]);
    });
    document.querySelectorAll('[data-flag]').forEach(button => {
      button.setAttribute('aria-pressed', String(!!f[button.dataset.flag]));
      const count = button.querySelector && button.querySelector('.stats-chip-count');
      if (count) count.textContent = num(found.counts[button.dataset.flag]);
    });
    byId('statsDomainClear').hidden = !filtersActive(f);
  }
  function renderDomainTable(app) {
    const { state, d } = app, f = state.domain;
    const found = searchedDomains(app);
    renderDomainChips(app, found);
    const all = found.rows.filter(row => (!f.difficulty.size || f.difficulty.has(row.difficulty)) && (!f.captcha || row.hasCaptcha) && (!f.changed || found.changed.has(row.hostname)))
      .sort(SORTS[f.sort] || SORTS.hardest);
    const rows = all.slice(0, state.limits.domain);
    U.table(byId('statsDomainTable'), {
      caption: tr('statsDomainDetails', 'All domains'), ltrFirst: true,
      headers: [tr('statsDomainColumn', 'Domain'), tr('statsDifficultyColumn', 'Difficulty'), tr('statsStackColumn', 'Protections'), { text: tr('statsPagesColumn', 'Pages'), num: true }, { text: tr('statsLastSeenColumn', 'Last seen'), nowrap: true }],
      rows: rows.map(row => [row.hostname, U.pill(row.difficulty), row.stackTotal ? U.stack(row) : '–', num(row.visits), lastSeen(row, d.now)]),
      empty: tr('statsNoMatchingDomains', 'No domains match your search.')
    });
    U.tableCount('statsDomain', rows.length, all.length);
  }
  function renderChangeTable(app) {
    const { state, d } = app, all = d.changes.rows, rows = all.slice(0, state.limits.change);
    const kinds = { gained: ['statsChangeKindGained', 'Gained'], dropped: ['statsChangeKindDropped', 'Dropped'], replaced: ['statsChangeKindReplaced', 'Replaced'] };
    const change = row => {
      const cell = element('div');
      cell.appendChild(element('div', 'stats-change-kind', tr(kinds[row.kind][0], kinds[row.kind][1])));
      const chips = element('div', 'stats-change');
      const part = (items, cls, glyph, key, text) => items.forEach(item => {
        const span = element('span', cls), mark = element('span', '', glyph);
        mark.setAttribute('aria-hidden', 'true');
        span.append(mark, element('span', 'stats-sr-only', tr(key, text) + ' '), document.createTextNode(' ' + item.name));
        chips.appendChild(span);
      });
      part(row.added, 'stats-change-added', '+', 'statsChangeAddedSr', 'Added:');
      part(row.removed, 'stats-change-removed', '−', 'statsChangeRemovedSr', 'Removed:');
      cell.appendChild(chips);
      return cell;
    };
    const when = row => {
      const cell = element('div', '', U.dateText(row.timestamp));
      cell.appendChild(element('div', 'stats-card-note', fmt('statsChangeSinceFmt', 'vs {0}', U.dateText(row.previous))));
      return cell;
    };
    const path = row => { const code = element('code', '', row.path || '/'); code.setAttribute('dir', 'ltr'); return code; };
    U.table(byId('statsChangeTable'), {
      caption: tr('statsDomainChanges', 'Protection changes'), ltrFirst: true,
      headers: [tr('statsDomainColumn', 'Domain'), tr('statsChangePageColumn', 'Page'), tr('statsChangeColumn', 'Change'), { text: tr('statsDateColumn', 'Date'), nowrap: true }],
      rows: rows.map(row => [row.hostname, path(row), change(row), when(row)]),
      empty: tr('statsNoChanges', 'No domain changed its protections between saved visits in this range.')
    });
    U.tableCount('statsChange', rows.length, all.length);
  }

  function initProtections(app) {
    const { state } = app;
    byId('statsProtectionSort').addEventListener('change', () => {
      state.protectionSort = byId('statsProtectionSort').value;
      state.limits.protection = app.PAGE.protection;
      if (state.d) renderProtectionTable(app);
    });
    byId('statsProtectionMore').addEventListener('click', () => { state.limits.protection += app.PAGE.protection; renderProtectionTable(app); refocus(byId('statsProtectionSort')); });
  }
  function initDomains(app) {
    const { state } = app;
    const reset = () => { state.limits.domain = app.PAGE.domain; if (state.d) renderDomainTable(app); };
    byId('statsDomainSearch').addEventListener('input', () => { state.domain.query = byId('statsDomainSearch').value; reset(); });
    byId('statsDomainSort').addEventListener('change', () => { state.domain.sort = byId('statsDomainSort').value; reset(); });
    document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
      const level = button.dataset.difficulty;
      if (state.domain.difficulty.has(level)) state.domain.difficulty.delete(level); else state.domain.difficulty.add(level);
      reset();
    }));
    document.querySelectorAll('[data-flag]').forEach(button => button.addEventListener('click', () => { state.domain[button.dataset.flag] = !state.domain[button.dataset.flag]; reset(); }));
    byId('statsDomainClear').addEventListener('click', () => {
      state.domain.query = ''; state.domain.difficulty.clear(); state.domain.captcha = false; state.domain.changed = false;
      byId('statsDomainSearch').value = '';
      reset();
      refocus(byId('statsDomainSearch'));
    });
    byId('statsDomainMore').addEventListener('click', () => { state.limits.domain += app.PAGE.domain; renderDomainTable(app); refocus(byId('statsDomainSearch')); });
    byId('statsChangeMore').addEventListener('click', () => { state.limits.change += app.PAGE.change; renderChangeTable(app); });
  }

  V.protections = { init: initProtections, render(app) { renderProtectionTable(app); renderStacks(app); } };
  V.domains = { init: initDomains, render(app) { renderDomainTable(app); renderChangeTable(app); } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
