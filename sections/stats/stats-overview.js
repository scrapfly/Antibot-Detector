/** Overview tab: banner, headlines, KPI cards, trend, protections seen, tiers, hardest sites, what changed, fingerprint teaser. */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, share, element } = U;
  const V = root.StatsViews = root.StatsViews || {};
  const HEADLINES = ['Top', 'Hardest', 'Newest', 'Riser'];

  function renderBanner(app) {
    const { state, d } = app;
    const banner = byId('statsBanner'), t = d.stats.totals;
    banner.hidden = t.detections > 0 || t.entries === 0;
    if (banner.hidden) return;
    // Pages whose only detections are fingerprinting API use are good news, not an empty result
    const clear = !state.scope.has('fingerprint') && d.counts.fingerprint > 0;
    banner.classList.toggle('stats-banner--ok', clear);
    U.setText('statsBannerTitle', clear ? tr('statsAllClearTitle', 'No anti-bot or CAPTCHA found in this range') : tr('statsScopeEmptyTitle', 'Nothing to show for these categories'));
    U.setText('statsBannerDesc', clear ? fmt('statsAllClearDescFmt', 'These pages only show fingerprinting API use. Pages: {0}.', num(d.counts.fingerprintPages)) : tr('statsScopeEmptyDesc', 'Pick another category or a longer range.'));
    byId('statsBannerAction').hidden = !clear;
  }

  function setHeadline(name, view) {
    const node = byId('headline' + name), main = byId('headline' + name + 'Name'), dot = byId('headline' + name + 'Dot');
    node.classList.toggle('is-muted', !!view.muted);
    main.textContent = view.text;
    main.setAttribute('dir', 'auto'); // a Latin protection name keeps its start in a right-to-left page
    main.setAttribute('title', view.text);
    // The protection's own logo (or its category icon); hostname headlines keep the plain colour dot
    const mark = view.category ? U.brandMark(view.text, view.category, view.color) : null;
    dot.className = mark ? 'stats-headline-mark ' + mark.className : 'stats-dot';
    dot.innerHTML = mark ? mark.innerHTML : '';
    dot.hidden = !mark && !view.color;
    if (view.color) U.setVar(dot, '--c', view.color);
    U.fillDelta(byId('headline' + name + 'Delta'), view.delta || null);
    U.setText('headline' + name + 'Sub', view.sub || '');
  }
  const previousPages = (d, name) => {
    const row = d.compare && d.compare.usable ? d.compare.prevIndex.get(name.toLowerCase()) : null;
    return row ? row.pages : 0;
  };
  function renderHeadlines(app) {
    const { d } = app, s = d.stats, t = s.totals;
    const top = s.detectorMetrics[0];
    setHeadline('Top', top ? { text: top.name, color: U.ink(top.category), category: top.category,
      delta: d.compare && d.compare.usable ? U.deltaView(HistoryStats.delta(top.pages, previousPages(d, top.name)), previousPages(d, top.name)) : null,
      sub: fmt('statsHeadlineTopSubFmt', '{0} of pages · pages: {1}', share(t.entries ? top.pages / t.entries : 0), num(top.pages)) }
      : { text: tr('statsNoData', 'No data in this range'), muted: true });
    const hardest = HistoryStats.hardestDomains(s.domainMetrics, 1)[0];
    setHeadline('Hardest', hardest ? { text: hardest.hostname, color: U.DIFFICULTY_COLORS[hardest.difficulty],
      sub: fmt('statsHeadlineHardestSubFmt', 'Protections: {0} · Difficulty: {1}', num(hardest.stackTotal), U.difficultyLabel(hardest.difficulty)) }
      : { text: tr('statsNoData', 'No data in this range'), muted: true });
    const newest = d.newProtections[0];
    setHeadline('Newest', newest ? { text: newest.name, color: U.ink(newest.category), category: newest.category,
      sub: fmt('statsHeadlineNewestSubFmt', 'First seen on {0} · {1}', newest.hostname || '–', U.dateText(newest.ts)) }
      : { text: tr('statsHeadlineNothingNew', 'Nothing new in this range'), muted: true });
    const usable = d.compare && d.compare.usable;
    const riser = usable ? d.compare.movers.rising[0] : null;
    setHeadline('Riser', riser ? { text: riser.name, color: U.ink(riser.category), category: riser.category, delta: U.deltaView(HistoryStats.delta(riser.now, riser.before), riser.before),
      sub: fmt('statsHeadlineRiserSubFmt', 'Pages {0} → {1} vs previous period', num(riser.before), num(riser.now)) }
      : { text: usable ? tr('statsChangedNothing', 'Nothing changed in this range.') : tr('statsHeadlineNeedsCompare', 'Needs a previous period'), muted: true });
  }

  /** Layered domains from the domain rows: a saved page with at least two anti-bot, CAPTCHA or other protections together. */
  function layeredRows(rows) {
    return rows.map(row => ({ row, count: row.maxStack || 0 }))
      .filter(item => item.count >= 2).sort((a, b) => b.count - a.count || b.row.visits - a.row.visits || a.row.hostname.localeCompare(b.row.hostname));
  }
  function renderKpis(app) {
    const { d } = app, s = d.stats, t = s.totals, tl = s.timeline, sum = d.summary, usable = d.compare && d.compare.usable, prev = usable ? d.compare.prev : null;
    const delta = (current, before) => usable ? U.deltaView(HistoryStats.delta(current, before), before) : null;
    const spark = (id, key, tone) => root.StatsCharts.sparkline(byId(id), tl.map(day => day[key]), { color: tone });
    U.setText('kpiEntries', num(t.entries));
    U.fillDelta(byId('kpiEntriesDelta'), prev ? delta(sum.pages, prev.pages) : null);
    U.setText('kpiEntriesSub', fmt('statsKpiPagesSubFmt', 'Active days: {0}', num(t.activeDays)));
    spark('kpiEntriesSpark', 'entries', 'var(--accent)');
    U.setText('kpiDomains', num(t.uniqueDomains));
    U.fillDelta(byId('kpiDomainsDelta'), prev ? delta(sum.domains, prev.domains) : null);
    U.setText('kpiDomainsSub', fmt('statsKpiDomainsSubFmt', '{0} with detections ({1})', num(sum.domainsWithDetections), share(sum.domains ? sum.domainsWithDetections / sum.domains : 0)));
    spark('kpiDomainsSpark', 'uniqueDomains', 'var(--accent)');
    U.setText('kpiLayered', num(sum.layeredDomains));
    U.fillDelta(byId('kpiLayeredDelta'), prev ? delta(sum.layeredDomains, prev.layeredDomains) : null);
    U.setText('kpiLayeredSub', fmt('statsKpiLayeredSubFmt', '{0} with a CAPTCHA', num(sum.captchaDomains)));
    spark('kpiLayeredSpark', 'layeredDomains', 'var(--warning)');
    U.setText('kpiDetectors', num(t.uniqueDetectors));
    U.fillDelta(byId('kpiDetectorsDelta'), prev ? delta(sum.protections, prev.protections) : null);
    const extra = [];
    if (d.ranged && d.newProtections.length) extra.push(fmt('statsKpiProtectionsNewFmt', '{0} new this period', num(d.newProtections.length)));
    if (app.state.rules.length) extra.push(fmt('statsKpiProtectionsRulesFmt', 'of {0} rules', num(app.state.rules.length)));
    U.setText('kpiDetectorsSub', extra.join(' · '));
    spark('kpiDetectorsSpark', 'protections', 'var(--ink-antibot)');
    renderKpiTips(app);
  }
  /** Hover tips on the four cards: what each number counts, with a breakdown. */
  function renderKpiTips(app) {
    const { d } = app, s = d.stats, t = s.totals;
    const tierRows = [['both', 'statsTierBoth', 'Anti-bot and CAPTCHA'], ['antibot', 'statsTierAntibot', 'Anti-bot only'], ['captcha', 'statsTierCaptcha', 'CAPTCHA only'], ['none', 'statsTierNone', 'No anti-bot or CAPTCHA']]
      .filter(([key]) => s.pageTiers[key] > 0).map(([key, id, text]) => ({ label: tr(id, text), value: share(t.entries ? s.pageTiers[key] / t.entries : 0) }));
    U.setTip(byId('kpiEntriesCard'), tr('statsKpiPages', 'Pages saved'), tr('statsTipPages', 'Pages saved to History in this range.'), tierRows);
    U.setTip(byId('kpiDomainsCard'), tr('statsUniqueDomains', 'Unique domains'), tr('tipStatsDomains', 'Different sites among the saved pages.'),
      s.domainMetrics.slice(0, 5).map(row => ({ label: row.hostname, value: fmt('statsTipPagesFmt', '{0} pages', num(row.visits)) })));
    U.setTip(byId('kpiLayeredCard'), tr('statsKpiLayered', 'Layered sites'), tr('statsTipLayered', 'Domains where two or more different protections were detected.'),
      layeredRows(s.domainMetrics).slice(0, 5).map(item => ({ label: item.row.hostname, value: num(item.count) })));
    U.setTip(byId('kpiDetectorsCard'), tr('statsKpiProtections', 'Protections seen'), tr('tipStatsDetectors', 'Different protections seen, each counted once.'),
      s.detectorMetrics.slice(0, 5).map(row => ({ label: row.name, dot: 'cat-' + row.category, value: fmt('statsTipPagesFmt', '{0} pages', num(row.pages)) })));
  }

  function renderTrend(app) {
    const { state, d } = app, s = d.stats, tl = s.timeline;
    const keys = U.activeCategories(state.scope, d.counts);
    const series = keys.map(key => ({ key, label: U.categoryLabel(key), color: U.ink(key) }));
    const total = day => keys.reduce((sum, key) => sum + day.categories[key], 0);
    const title = state.scope.has('fingerprint') ? tr('statsOverTime', 'Detections over time') : tr('statsOverTimeProtections', 'Protections found over time');
    const meta = fmt('statsTimelineMetaFmt', '{0} detections · {1} days', num(tl.reduce((sum, day) => sum + total(day), 0)), num(tl.length));
    U.setText('statsTimelineTitle', title);
    U.setText('timelineMeta', meta);
    const rows = tl.map(day => ({ label: U.dayLabel(day.date), values: day.categories, partial: day.partial,
      tip: [U.dayLabel(day.date, true), ...series.map(item => ({ label: item.label, value: num(day.categories[item.key]), color: item.color, category: item.key })),
        ...(day.partial ? [tr('statsTodayPartial', 'Today (still counting)')] : [])] }));
    const max = Math.max(1, ...tl.map(total));
    const nice = typeof root.StatsCharts.niceScale === 'function' ? root.StatsCharts.niceScale(max).max : max;
    root.StatsCharts.stacked(byId('statsTimeline'), rows, U.chartOptions(title, { series, vertical: true, fixedMax: nice, summary: meta }));
    byId('statsTimelineLegend').replaceChildren(...series.map(item => U.categoryBadge(item.key)));
    byId('statsTimelineLimit').hidden = !d.clipped;
    U.setText('statsTimelineLimit', fmt('statsTimelineLimitFmt', 'The latest {0} days are shown. Totals and exports include the entire selected range.', num(tl.length)));
  }

  function renderProtections(app) {
    const { d } = app, s = d.stats, t = s.totals, usable = d.compare && d.compare.usable;
    const rows = s.detectorMetrics.slice(0, 8).map(row => {
      const before = usable ? (d.compare.prevIndex.get(row.name.toLowerCase()) || { pages: 0 }).pages : 0;
      const delta = usable ? U.deltaView(HistoryStats.delta(row.pages, before), before) : null;
      return { label: row.name, value: row.pages, color: U.ink(row.category), meta: { text: U.categoryLabel(row.category), color: U.ink(row.category) },
        share: share(t.entries ? row.pages / t.entries : 0), delta: U.rankDelta(delta), tip: U.protectionTip(row) };
    });
    root.StatsCharts.rank(byId('statsTopDetectors'), rows, U.chartOptions(tr('statsKpiProtections', 'Protections seen'), { showRank: true }));
  }

  function renderTiers(app) {
    const s = app.d.stats;
    const parts = [
      { label: tr('statsTierBoth', 'Anti-bot and CAPTCHA'), value: s.pageTiers.both, color: U.mixInk() },
      { label: tr('statsTierAntibot', 'Anti-bot only'), value: s.pageTiers.antibot, color: U.ink('antibot') },
      { label: tr('statsTierCaptcha', 'CAPTCHA only'), value: s.pageTiers.captcha, color: U.ink('captcha') },
      { label: tr('statsTierNone', 'No anti-bot or CAPTCHA'), value: s.pageTiers.none, color: U.DIFFICULTY_COLORS.None }];
    root.StatsCharts.segments(byId('statsTiers'), parts, U.chartOptions(tr('statsPageTiers', 'How protected are your pages'), { keepZero: true, formatShare: share }));
    const levels = ['High', 'Medium', 'Low', 'None'].map(level => ({ label: U.difficultyLabel(level), value: s.difficulty[level], color: U.DIFFICULTY_COLORS[level] }));
    root.StatsCharts.segments(byId('statsDifficulty'), levels, U.chartOptions(tr('statsEstimatedDifficulty', 'Estimated difficulty'), { formatShare: share }));
  }

  function renderHardest(app) {
    const host = byId('statsHardest'), rows = HistoryStats.hardestDomains(app.d.stats.domainMetrics, 6);
    host.replaceChildren();
    if (!rows.length) { host.appendChild(element('li', 'stats-changed-empty', tr('statsNoData', 'No data in this range'))); return; }
    rows.forEach(row => {
      const li = element('li', 'stats-site');
      li.tabIndex = 0;
      li.setAttribute('role', 'link');
      const name = element('span', 'stats-site-name', row.hostname);
      name.setAttribute('dir', 'ltr');
      name.setAttribute('title', row.hostname);
      li.append(name, U.pill(row.difficulty), U.stack(row), element('span', 'stats-site-count', tr('statsPagesColumn', 'Pages') + ': ' + num(row.visits)));
      const open = () => app.openDomain(row.hostname);
      li.addEventListener('click', open);
      li.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      host.appendChild(li);
    });
  }

  /** meta is a date or a "38 → 64" pair: a date follows the page direction (Arabic dates carry their own marks), the pair stays left to right. */
  function changedRow(label, color, meta, delta, ltr, isDate = false, category = '') {
    const li = element('li', 'stats-changed-row');
    const name = element('span', 'stats-changed-name', label);
    name.setAttribute('title', label);
    if (ltr) name.setAttribute('dir', 'ltr');
    const when = element('span', 'stats-changed-meta', meta);
    if (isDate) when.setAttribute('data-kind', 'date');
    li.append(category ? U.brandMark(label, category, color) : U.dot(color), name, when);
    if (delta) li.appendChild(U.deltaBadge(delta));
    return li;
  }
  /** Added and removed protections: the glyph is decoration, the screen-reader prefix says what it means. */
  function changeCell(row) {
    const cell = element('div', 'stats-change');
    const part = (items, cls, glyph, srKey, srText) => {
      if (!items.length) return;
      const span = element('span', cls), mark = element('span', '', glyph);
      mark.setAttribute('aria-hidden', 'true');
      span.append(mark, element('span', 'stats-sr-only', tr(srKey, srText) + ' '), document.createTextNode(' ' + items.map(item => item.name).join(', ')));
      cell.appendChild(span);
    };
    part(row.added, 'stats-change-added', '+', 'statsChangeAddedSr', 'Added:');
    part(row.removed, 'stats-change-removed', '−', 'statsChangeRemovedSr', 'Removed:');
    return cell;
  }
  function renderChanged(app) {
    const { d } = app, usable = d.compare && d.compare.usable;
    const text = { nothing: tr('statsChangedNothing', 'Nothing changed in this range.'), needs: app.state.days > 0 ? tr('statsChangedNoPrevious', 'No full previous period yet.') : tr('statsChangedNeedsCompare', 'Choose 7, 30 or 90 days to see rising and falling protections.') };
    const fill = (id, rows, empty) => byId(id).replaceChildren(...(rows.length ? rows : [element('li', 'stats-changed-empty', empty)]));
    const comparison = usable ? text.nothing : text.needs;
    fill('changedNew', d.newProtections.slice(0, 4).map(row => changedRow(row.name, U.ink(row.category), U.dateText(row.ts), null, false, true, row.category)), text.nothing);
    const m = usable ? d.compare.movers : null;
    const moving = m ? [...m.rising, ...m.falling].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name)).slice(0, 4)
      .map(row => changedRow(row.name, U.ink(row.category), num(row.before) + ' → ' + num(row.now), U.deltaView(HistoryStats.delta(row.now, row.before), row.before), false, false, row.category)) : [];
    fill('changedMoving', moving, comparison);
    fill('changedGone', m ? m.gone.slice(0, 4).map(row => changedRow(row.name, U.ink(row.category), num(row.before) + ' → ' + num(row.now), null, false, false, row.category)) : [], comparison);
    fill('changedSwitched', d.changes.rows.slice(0, 4).map(row => {
      const cat = (row.added[0] || row.removed[0] || {}).category;
      const li = changedRow(row.hostname, U.ink(cat), U.dateText(row.timestamp), null, true, true, cat);
      li.appendChild(changeCell(row));
      return li;
    }), text.nothing);
  }

  function renderFingerprint(app) {
    const { state, d } = app, card = byId('statsFingerprintCard');
    const profile = d.fingerprint;
    card.hidden = state.scope.has('fingerprint') || !profile || profile.detections === 0;
    if (card.hidden) return;
    U.setText('fpSummary', fmt('statsFingerprintSummaryFmt', 'Fingerprinting APIs ran on {0} of pages · techniques: {1}', share(d.selectedAll.length ? profile.pages / d.selectedAll.length : 0), num(profile.distinct)));
    U.setText('fpTop', profile.techniques.length ? fmt('statsFingerprintTopFmt', 'Most common: {0}', U.list(profile.techniques.map(row => row.name))) : '');
    byId('fpTop').hidden = !profile.techniques.length;
  }

  V.overview = {
    layeredRows,
    render(app) {
      renderBanner(app);
      renderHeadlines(app);
      renderKpis(app);
      renderTrend(app);
      renderProtections(app);
      renderTiers(app);
      renderHardest(app);
      renderChanged(app);
      renderFingerprint(app);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
