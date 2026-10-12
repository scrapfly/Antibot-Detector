/** Local history dashboard. Charts, filters and exports share one range snapshot. */
(function() {
  'use strict';
  const DEFAULT_COLORS = { ...FormatUtils.DEFAULT_CATEGORY_COLORS, other: '#8b8b8b' };
  const DIFFICULTY_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e', None: '#6b7280' };
  const CATEGORIES = Object.keys(DEFAULT_COLORS);
  const SECTIONS = ['overview', 'activity', 'protections', 'domains', 'confidence', 'signals', 'combinations', 'rules', 'tools'];
  // Same order as the rule editor; distinct hues so the donut stays readable
  const METHOD_COLORS = { cookie: '#f59e0b', header: '#ec4899', url: '#06b6d4', content: '#14b8a6', dom: '#3b82f6',
    window: '#22c55e', js_hooks: '#8b5cf6', payload: '#f97316', other: '#6b7280' };
  const RANGE_KEY = 'scrapfly_stats_range';
  const SECTION_KEY = 'scrapfly_stats_section';
  const TABLE_PAGE = 50;
  // Rule lists can hold most of the library: shorter pages
  const RULE_PAGE = 15;
  const CHART_PAGE_SIZES = { timeline: 30, protections: 12, domains: 12, scatter: 25 };
  const pageOf = key => key === 'unusedLimit' || key === 'missingLimit' ? RULE_PAGE : TABLE_PAGE;
  const LIST_LIMITS = ['domainLimit', 'protectionLimit', 'signalLimit', 'combinationLimit', 'unusedLimit', 'missingLimit', 'changeLimit'];
  const state = { items: [], days: 30, section: 'overview', colors: { ...DEFAULT_COLORS }, stats: null,
    now: 0, exporting: false, loadVersion: 0, chartPages: {},
    rules: [], captures: [], incompatible: [], officialIds: new Set(), bundledOfficialIds: [], ruleStats: null, toolStats: null, firstSeen: null, descriptions: new Map(),
    ...Object.fromEntries(LIST_LIMITS.map(key => [key, pageOf(key)])) };
  const byId = id => document.getElementById(id);
  const tr = (key, fallback) => I18n.tr(key, fallback);
  const fmt = (key, fallback, ...args) => {
    const translated = I18n.format(key, ...args);
    return translated || args.reduce((message, arg, i) => message.split('{' + i + '}').join(String(arg)), fallback);
  };
  const locale = () => String(I18n._overrideLocale || chrome.i18n.getUILanguage() || 'en').replace('_', '-');
  const num = (value, digits = 0) => {
    try { return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(value); }
    catch (_) { return String(value); }
  };
  const percent = value => {
    try { return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 1 }).format(value / 100); }
    catch (_) { return num(value, 1) + '%'; }
  };
  const confidence = value => value === null ? tr('timeUnknown', 'Unknown') : percent(value);
  const set = (id, value) => { byId(id).textContent = value; };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const categoryLabel = key => ({ antibot: tr('categoryAntibot', 'Anti-bot'), captcha: tr('categoryCaptcha', 'Captcha'),
    fingerprint: tr('categoryFingerprint', 'Fingerprint'), other: tr('statsCategoryOther', 'Other') }[key] || key);
  const difficultyLabel = key => ({ High: tr('difficultyHigh', 'High'), Medium: tr('difficultyMedium', 'Medium'),
    Low: tr('difficultyLow', 'Low'), None: tr('statsDifficultyNone', 'No detections') }[key]);
  const entriesTip = value => fmt('statsTipEntriesFmt', '{0} entries', num(value));
  const detectionsTip = value => fmt('statsTipDetectionsFmt', '{0} detections', num(value));
  const pagesTip = value => fmt('statsTipPagesFmt', '{0} pages', num(value));
  const domainsTip = value => fmt('statsTipDomainsFmt', '{0} domains', num(value));
  const visitsTip = value => fmt('statsTipVisitsFmt', '{0} visits', num(value));
  const capturesTip = value => fmt('statsTipCapturesFmt', '{0} captures', num(value));
  const dayDate = key => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12); };
  const dayLabel = (key, full = false) => new Intl.DateTimeFormat(locale(), full ? { dateStyle: 'medium' } : { day: 'numeric', month: 'short' }).format(dayDate(key));
  const dayTip = day => [dayLabel(day.date, true), entriesTip(day.entries), detectionsTip(day.detections), domainsTip(day.uniqueDomains)];
  const domainTip = row => [row.hostname, visitsTip(row.visits), detectionsTip(row.detections), tr('statsDistinctDetectors', 'Distinct protections') + ': ' + num(row.uniqueDetectors), tr('statConfidence', 'Confidence') + ': ' + confidence(row.avgConfidence)];
  const methodLabel = key => FormatUtils.methodLabel(key);
  const protectionTip = row => [row.name, categoryLabel(row.category), pagesTip(row.pages), domainsTip(row.domains), tr('statConfidence', 'Confidence') + ': ' + confidence(row.avgConfidence)];

  let tooltipAnchor = null;
  function hideTooltip() {
    byId('statsTooltip').hidden = true;
    if (tooltipAnchor) tooltipAnchor.removeAttribute('aria-describedby');
    tooltipAnchor = null;
  }
  function showTooltip(event, lines) {
    const tip = byId('statsTooltip');
    if (tooltipAnchor && tooltipAnchor !== event.currentTarget) tooltipAnchor.removeAttribute('aria-describedby');
    tooltipAnchor = event.currentTarget;
    if (tooltipAnchor) tooltipAnchor.setAttribute('aria-describedby', tip.id);
    tip.replaceChildren(...lines.map((line, i) => element('div', i ? 'stats-tooltip-line' : 'stats-tooltip-title', String(line))));
    tip.hidden = false;
    const anchor = event.currentTarget && event.currentTarget.getBoundingClientRect();
    const keyboard = event.type === 'focus' || !Number.isFinite(event.clientX);
    const x = keyboard ? (anchor ? anchor.left + anchor.width / 2 : 8) : event.clientX;
    const y = keyboard ? (anchor ? anchor.bottom : 8) : event.clientY;
    const rect = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - rect.width - 8)) + 'px';
    tip.style.top = Math.max(8, y + 12 + rect.height > window.innerHeight ? y - rect.height - 12 : y + 12) + 'px';
  }
  const chartOptions = (key, fallback, extra = {}) => ({ title: tr(key, fallback), emptyLabel: tr('statsNoData', 'No data in this range'),
    formatNumber: num, color: '#3b82f6', onTooltip: showTooltip, hideTooltip, ...extra });
  function bindTooltip(node, lines) {
    node.tabIndex = 0;
    node.setAttribute('aria-label', lines.join(': '));
    node.addEventListener('pointermove', event => showTooltip(event, lines));
    node.addEventListener('focus', event => showTooltip(event, lines));
    node.addEventListener('pointerleave', hideTooltip);
    node.addEventListener('blur', hideTooltip);
  }
  function status(message, error = false) {
    set('statsStatus', message);
    byId('statsStatus').hidden = !message;
    byId('statsStatus').classList.toggle('stats-status--error', error);
  }
  function updateExportButtons() {
    document.querySelectorAll('[data-export]').forEach(button => { button.disabled = state.exporting || !state.stats || !state.stats.totals.entries; });
  }
  function selectSection(section, persist = true) {
    if (!SECTIONS.includes(section)) return;
    // Tools is only offered when Advanced has saved something
    if (section === 'tools' && !state.captures.length) section = 'overview';
    state.section = section;
    hideTooltip();
    document.querySelectorAll('[data-section]').forEach(button => {
      const active = button.dataset.section === section;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    SECTIONS.forEach(key => { byId('stats-panel-' + key).hidden = key !== section; });
    if (state.stats && !byId('statsContent').hidden) renderSection();
    if (persist) StorageManager.saveToStorage(SECTION_KEY, section, { wrapMetadata: false });
  }
  async function loadData(preferences = false) {
    const version = ++state.loadVersion;
    const stored = await StorageManager.readRaw(['scrapfly_history', 'scrapfly_settings', RANGE_KEY, SECTION_KEY,
      'scrapfly_detectors', 'scrapfly_advanced_history', 'scrapfly_incompatible_updates', 'scrapfly_remote_official_ids']);
    if (version !== state.loadVersion) return;
    state.items = HistoryStats.parseStoredHistory(stored.scrapfly_history);
    if (typeof RuleStats !== 'undefined') {
      state.rules = RuleStats.parseDetectors(stored.scrapfly_detectors);
      if (typeof RuleI18n !== 'undefined') RuleI18n.indexRules(state.rules);
      state.descriptions = RuleStats.descriptions(state.rules);
    }
    state.captures = typeof ToolsStats !== 'undefined' ? ToolsStats.parse(stored.scrapfly_advanced_history) : [];
    state.incompatible = Array.isArray(stored.scrapfly_incompatible_updates) ? stored.scrapfly_incompatible_updates : [];
    const remote = Array.isArray(stored.scrapfly_remote_official_ids) ? stored.scrapfly_remote_official_ids : [];
    state.officialIds = new Set([...state.bundledOfficialIds, ...remote].filter(id => typeof id === 'string'));
    if (preferences) {
      if ([0, 7, 30, 90].includes(stored[RANGE_KEY])) state.days = stored[RANGE_KEY];
      if (SECTIONS.includes(stored[SECTION_KEY])) state.section = stored[SECTION_KEY];
    }
    const colors = StorageManager.normalizeSettings(stored.scrapfly_settings).categoryColors || {};
    state.colors = { ...DEFAULT_COLORS };
    CATEGORIES.forEach(key => { if (/^#[0-9a-f]{6}$/i.test(colors[key])) state.colors[key] = colors[key]; });
    render();
  }
  function render() {
    hideTooltip();
    state.now = Date.now();
    const selected = HistoryStats.filterByRange(state.items, state.days, state.now);
    const days = HistoryStats.timelineDays(selected, state.days, state.now, 365);
    state.stats = HistoryStats.compute(selected, { now: state.now, days, top: 8 });
    const since = HistoryStats.rangeStart(state.days, state.now);
    state.firstSeen = HistoryStats.firstSeen(state.items, since, state.now);
    state.ruleStats = typeof RuleStats !== 'undefined' ? RuleStats.compute(state.rules, {
      detectorMetrics: state.stats.detectorMetrics, incompatible: state.incompatible, isOfficial: isOfficialRule }) : null;
    state.toolStats = typeof ToolsStats !== 'undefined' ? ToolsStats.compute(state.captures, { since, now: state.now, dayKey: HistoryStats.dayKey }) : null;
    byId('stats-tab-tools').hidden = !state.captures.length;
    const hasEntries = selected.length > 0;
    byId('statsContent').hidden = !hasEntries;
    byId('statsEmpty').hidden = hasEntries;
    set('statsEmptyTitle', state.items.length ? tr('statsRangeEmptyTitle', 'No entries in this range') : tr('statsEmptyTitle', 'No history yet'));
    set('statsEmptyDesc', state.items.length ? tr('statsRangeEmptyDesc', 'Choose a longer date range to explore your saved history.') : tr('statsEmptyDesc', 'Statistics appear here once pages with detections are saved to the history.'));
    set('statsSubtitle', fmt('statsSubtitleFmt', 'Computed locally from {0} history entries. Nothing leaves your browser.', num(state.items.length)));
    set('statsExportScope', fmt('statsExportScopeFmt', 'Export the selected range: {0} entries', num(selected.length)));
    document.querySelectorAll('[data-days]').forEach(button => {
      const active = Number(button.dataset.days) === state.days;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const earliestVisible = state.stats.timeline.length ? dayDate(state.stats.timeline[0].date).setHours(0, 0, 0, 0) : 0;
    const clipped = selected.some(item => { const timestamp = HistoryStats.getTimestamp(item); return timestamp !== null && timestamp < earliestVisible; });
    byId('statsTimelineLimit').hidden = !clipped;
    set('statsTimelineLimit', fmt('statsTimelineLimitFmt', 'The latest {0} days are shown. Totals and exports include the entire selected range.', num(days)));
    updateExportButtons();
    renderKpis();
    selectSection(state.section, false);
  }
  function renderKpis() {
    const t = state.stats.totals;
    set('kpiEntries', num(t.entries));
    set('kpiEntriesSub', fmt('statsWithDetectionsFmt', '{0} with detections', num(t.entriesWithDetections)));
    set('kpiDomains', num(t.uniqueDomains));
    set('kpiDomainsSub', fmt('statsVisitsPerDomainFmt', '{0} visits per domain', num(t.uniqueDomains ? t.entries / t.uniqueDomains : 0, 1)));
    set('kpiDetections', num(t.detections));
    set('kpiDetectionsSub', fmt('statsPerEntryFmt', '{0} per entry', num(t.avgDetectionsPerEntry, 1)));
    set('kpiDetectors', num(t.uniqueDetectors));
    set('kpiDetectorsSub', t.validConfidenceCount ? fmt('statsAvgConfidenceFmt', '{0}% average confidence', num(t.avgConfidence)) : tr('timeUnknown', 'Unknown'));
    set('insightRate', percent(t.detectionRate));
    set('insightDays', num(t.activeDays));
    set('insightConfidence', confidence(t.validConfidenceCount ? t.avgConfidence : null));
    const firstSeen = state.firstSeen || { protections: [], domains: [] };
    set('insightNew', state.days ? num(firstSeen.protections.length) : '–');
    const protectedDomain = mostProtectedDomain();
    set('insightProtectedDomain', protectedDomain ? protectedDomain.hostname : '–');
    renderKpiTips();
  }
  /** Hover tips on the summary tiles: what each number counts, with a breakdown. */
  function renderKpiTips() {
    const s = state.stats, t = s.totals;
    const tile = id => {
      const node = byId(id);
      return node && typeof node.closest === 'function' ? node.closest('.stats-kpi, .stats-insight') : null;
    };
    const tip = (id, title, detail, rows = []) => {
      const node = tile(id);
      if (!node) return;
      node.tabIndex = 0;
      node.setAttribute('data-tip', title);
      if (detail) node.setAttribute('data-tip-detail', detail); else node.removeAttribute('data-tip-detail');
      const list = rows.filter(Boolean);
      if (list.length) node.setAttribute('data-tip-rows', JSON.stringify(list)); else node.removeAttribute('data-tip-rows');
    };
    const share = (count, total) => fmt('tipCountShareFmt', '{0} · {1}%', num(count), total ? Math.round(count / total * 100) : 0);
    const categoryRows = CATEGORIES.filter(key => s.categories[key] > 0)
      .map(key => ({ label: categoryLabel(key), dot: 'cat-' + key, value: share(s.categories[key], t.detections) }));
    const difficultyRows = ['High', 'Medium', 'Low', 'None'].filter(level => s.difficulty[level] > 0)
      .map(level => ({ label: difficultyLabel(level), value: share(s.difficulty[level], t.entries),
        tone: { High: 'red', Medium: 'amber', Low: 'green' }[level] }));
    tip('kpiEntries', tr('statsEntries', 'History entries'), tr('tipStatsEntries', 'Pages saved to History in this range.'), difficultyRows);
    tip('kpiDomains', tr('statsUniqueDomains', 'Unique domains'), tr('tipStatsDomains', 'Different sites among the saved pages.'),
      s.topDomains.slice(0, 5).map(row => ({ label: row.hostname, value: fmt('statsTipVisitsFmt', '{0} visits', num(row.visits)) })));
    tip('kpiDetections', tr('statsDetections', 'Detections'), tr('tipStatsDetections', 'Protections found across all saved pages, counting repeats.'), categoryRows);
    tip('kpiDetectors', tr('statsDistinctDetectors', 'Distinct protections'), tr('tipStatsDetectors', 'Different protections seen, each counted once.'),
      s.topDetectors.slice(0, 5).map(row => ({ label: row.name, dot: 'cat-' + row.category, value: fmt('statsTipPagesFmt', '{0} pages', num(row.pages)) })));
    tip('insightRate', tr('statsDetectionRate', 'Entries with detections'),
      fmt('tipStatsRateFmt', '{0} of {1} entries', num(t.entriesWithDetections), num(t.entries)));
    tip('insightDays', tr('statsActiveDays', 'Active days'), tr('tipStatsActiveDays', 'Days with at least one saved page.'));
    const firstSeen = state.firstSeen || { protections: [], domains: [] };
    tip('insightNew', tr('statsFirstSeen', 'New this period'),
      state.days ? fmt('statsFirstSeenTipFmt', '{0} protections and {1} domains saved for the first time in this range.', num(firstSeen.protections.length), num(firstSeen.domains.length))
        : tr('statsFirstSeenAllTip', 'Choose 7, 30 or 90 days to see what is new.'),
      firstSeen.protections.slice(0, 5).map(row => ({ label: row.name, dot: 'cat-' + row.category, value: row.hostname || '' })));
    const protectedDomain = mostProtectedDomain();
    tip('insightProtectedDomain', tr('statsMostProtectedDomain', 'Most protected domain'),
      protectedDomain ? fmt('statsMostProtectedTipFmt', '{0} distinct protections over {1} visits.', num(protectedDomain.uniqueDetectors), num(protectedDomain.visits)) : tr('statsNoData', 'No data in this range'));
    tip('insightConfidence', tr('statsAverageConfidence', 'Average confidence'),
      fmt('statsConfidenceKnownFmt', '{0} detections have confidence values; {1} have no valid score.', num(t.validConfidenceCount), num(t.unknownConfidenceCount)));
  }
  function isOfficialRule(detector) {
    if (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.isOfficialDetector === 'function') return DetectionUtils.isOfficialDetector(detector, state.officialIds);
    return RuleStats.defaultIsOfficial(state.officialIds)(detector);
  }
  function mostProtectedDomain() {
    return (state.stats ? state.stats.domainMetrics : []).filter(row => row.uniqueDetectors > 0)
      .slice().sort((a, b) => b.uniqueDetectors - a.uniqueDetectors || b.visits - a.visits || a.hostname.localeCompare(b.hostname))[0] || null;
  }
  function renderRankedList(id, rows, domain = false) {
    const host = byId(id);
    host.replaceChildren();
    if (!rows.length) { host.appendChild(element('li', 'stats-none', tr('statsNoData', 'No data in this range'))); return; }
    const max = Math.max(...rows.map(row => domain ? row.visits : row.pages));
    rows.forEach(row => {
      const value = domain ? row.visits : row.pages;
      const li = element('li', 'stats-bars-item');
      const head = element('div', 'stats-bars-header');
      head.appendChild(element('span', 'stats-bars-label', domain ? row.hostname : row.name));
      if (!domain) head.appendChild(element('span', 'stats-bars-meta', categoryLabel(row.category)));
      head.appendChild(element('span', 'stats-bars-value', num(value)));
      const track = element('div', 'stats-bars-track'), fill = element('div', 'stats-bars-fill');
      fill.style.width = (max ? value / max * 100 : 0) + '%';
      fill.style.backgroundColor = domain ? '#3b82f6' : state.colors[row.category];
      track.appendChild(fill);
      li.append(head, track);
      bindTooltip(li, domain ? domainTip(row) : protectionTip(row));
      host.appendChild(li);
    });
  }
  function chartPage(group, rows) {
    const size = CHART_PAGE_SIZES[group];
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const previous = state.chartPages[group];
    const page = Math.max(0, Math.min(pages - 1, Number.isInteger(previous) ? previous : group === 'timeline' ? pages - 1 : 0));
    state.chartPages[group] = page;
    // Anchor time windows at the latest day so the newest page is always full.
    const end = group === 'timeline' ? Math.max(0, rows.length - (pages - 1 - page) * size) : Math.min(rows.length, (page + 1) * size);
    const start = group === 'timeline' ? Math.max(0, end - size) : page * size;
    return { rows: rows.slice(start, end), start, end, total: rows.length, page, pages };
  }
  function chartPagination(id, group, page) {
    if (page.pages <= 1) return;
    const host = byId(id), controls = element('div', 'stats-chart-pagination');
    const label = element('span', 'stats-chart-page-label',
      fmt('statsChartPage', 'Page {0} of {1}', num(page.page + 1), num(page.pages)) + ' · ' +
      fmt('statsChartShowing', 'Showing {0}–{1} of {2}', num(page.start + 1), num(page.end), num(page.total)));
    label.setAttribute('aria-live', 'polite');
    const previous = element('button', 'stats-chart-page-btn', document.documentElement.dir === 'rtl' ? '›' : '‹');
    const next = element('button', 'stats-chart-page-btn', document.documentElement.dir === 'rtl' ? '‹' : '›');
    [[previous, -1, 'statsChartPrevious', 'Previous chart page'], [next, 1, 'statsChartNext', 'Next chart page']].forEach(([button, direction, key, fallback]) => {
      button.type = 'button';
      button.disabled = direction < 0 ? page.page === 0 : page.page === page.pages - 1;
      button.setAttribute('aria-label', tr(key, fallback));
      button.setAttribute('data-chart-page-group', group);
      button.setAttribute('data-chart-page-direction', String(direction));
      button.addEventListener('click', () => {
        if (button.disabled) return;
        state.chartPages[group] += direction;
        hideTooltip();
        renderSection();
        const replacement = byId(id).querySelector('[data-chart-page-direction="' + direction + '"]');
        if (replacement) {
          // Keep keyboard focus on this chart, including when a boundary is reached.
          if (replacement.disabled) byId(id).querySelector('.stats-chart-page-label')?.focus();
          else replacement.focus();
        }
      });
    });
    label.tabIndex = -1;
    controls.append(previous, label, next);
    host.appendChild(controls);
  }
  function renderSection() {
    const s = state.stats;
    const timePage = chartPage('timeline', s.timeline);
    const daily = timePage.rows.map(day => ({ label: dayLabel(day.date), value: day.detections, tip: dayTip(day) }));
    if (state.section === 'overview') {
      StatsCharts.line(byId('statsTimeline'), daily, chartOptions('statsOverTime', 'Detections over time', { fill: true, fixedMax: Math.max(1, ...s.timeline.map(day => day.detections)) }));
      chartPagination('statsTimeline', 'timeline', timePage);
      set('timelineMeta', fmt('statsTimelineMetaFmt', '{0} detections · {1} days', num(timePage.rows.reduce((sum, day) => sum + day.detections, 0)), num(timePage.rows.length)));
      StatsCharts.donut(byId('statsCategories'), CATEGORIES.map(key => ({ label: categoryLabel(key), value: s.categories[key], color: state.colors[key] })), chartOptions('statsByCategory', 'By category', { centerValue: num(s.totals.detections), centerLabel: tr('statsDetectionsUnit', 'detections') }));
      StatsCharts.donut(byId('statsDifficulty'), Object.keys(DIFFICULTY_COLORS).map(key => ({ label: difficultyLabel(key), value: s.difficulty[key], color: DIFFICULTY_COLORS[key] })), chartOptions('statsByDifficulty', 'By difficulty', { centerValue: num(s.totals.entries), centerLabel: tr('statsPagesUnit', 'pages') }));
      renderRankedList('statsTopDetectors', s.detectorMetrics.slice(0, 8));
      renderRankedList('statsTopDomains', s.domainMetrics.slice(0, 8), true);
    } else if (state.section === 'activity') {
      StatsCharts.line(byId('statsActivityTrend'), timePage.rows.map(day => ({ label: dayLabel(day.date), value: day.entries, tip: dayTip(day) })), chartOptions('statsDailyVisits', 'Daily history entries', { fill: true, fixedMax: Math.max(1, ...s.timeline.map(day => day.entries)) }));
      chartPagination('statsActivityTrend', 'timeline', timePage);
      StatsCharts.heatmap(byId('statsHeatmap'), timePage.rows.map(day => ({ date: day.date, label: dayLabel(day.date, true), value: day.entries, tip: dayTip(day) })), chartOptions('statsActivityCalendar', 'Activity calendar', { fixedMax: Math.max(1, ...s.timeline.map(day => day.entries)) }));
      chartPagination('statsHeatmap', 'timeline', timePage);
      StatsCharts.bars(byId('statsHourly'), s.hourly.map(row => {
        const label = new Intl.DateTimeFormat(locale(), { hour: 'numeric' }).format(new Date(2026, 0, 4, row.hour));
        return { label, value: row.entries, tip: [label, entriesTip(row.entries), detectionsTip(row.detections)] };
      }), chartOptions('statsHourlyActivity', 'Activity by hour', { vertical: true }));
      StatsCharts.bars(byId('statsWeekdays'), s.weekdays.map(row => {
        const label = new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2026, 0, 4 + row.weekday, 12));
        return { label, value: row.entries, tip: [label, entriesTip(row.entries), detectionsTip(row.detections)] };
      }), chartOptions('statsWeekdayActivity', 'Activity by weekday', { vertical: true }));
    } else if (state.section === 'protections') {
      const protectionPage = chartPage('protections', s.detectorMetrics);
      StatsCharts.bars(byId('statsProtectionRanking'), protectionPage.rows.map(row => ({ label: row.name, value: row.pages, color: state.colors[row.category], tip: protectionTip(row) })), chartOptions('statsProtectionRanking', 'Protection ranking', { fixedMax: Math.max(1, ...s.detectorMetrics.map(row => row.pages)) }));
      chartPagination('statsProtectionRanking', 'protections', protectionPage);
      const labels = CATEGORIES.map(key => ({ key, label: categoryLabel(key), color: state.colors[key] }));
      StatsCharts.matrix(byId('statsCategoryOverlap'), labels, s.categoryOverlap, chartOptions('statsCategoryOverlap', 'Categories found together'));
      StatsCharts.stacked(byId('statsCategoryTrend'), timePage.rows.map(day => ({ label: dayLabel(day.date), values: day.categories, tip: [dayLabel(day.date, true), ...CATEGORIES.map(key => categoryLabel(key) + ': ' + num(day.categories[key]))] })), chartOptions('statsCategoryTrend', 'Categories over time', { series: labels, vertical: true, fixedMax: Math.max(1, ...s.timeline.map(day => day.detections)) }));
      chartPagination('statsCategoryTrend', 'timeline', timePage);
      byId('statsCategoryLegend').replaceChildren(...CATEGORIES.map(key => categoryBadge(key)));
      renderProtectionTable();
    } else if (state.section === 'domains') {
      const domainPage = chartPage('domains', s.domainMetrics), scatterPage = chartPage('scatter', s.domainMetrics);
      StatsCharts.bars(byId('statsDomainRanking'), domainPage.rows.map(row => ({ label: row.hostname, value: row.visits, tip: domainTip(row) })), chartOptions('statsDomainRanking', 'Domain ranking', { fixedMax: Math.max(1, ...s.domainMetrics.map(row => row.visits)) }));
      chartPagination('statsDomainRanking', 'domains', domainPage);
      StatsCharts.scatter(byId('statsDomainScatter'), scatterPage.rows.map(row => ({ label: row.hostname, x: row.visits, y: row.detections, radius: row.uniqueDetectors, tip: domainTip(row) })), chartOptions('statsDomainMap', 'Visits and detections', { xLabel: tr('statsVisitsUnit', 'visits'), yLabel: tr('statsDetectionsUnit', 'detections'), xMax: Math.max(1, ...s.domainMetrics.map(row => row.visits)), yMax: Math.max(1, ...s.domainMetrics.map(row => row.detections)) }));
      chartPagination('statsDomainScatter', 'scatter', scatterPage);
      renderDomainTable();
      renderChangeTable();
      renderFirstSeen();
      table(byId('statsTogetherTable'), [tr('statsProtectionColumn', 'Protection'), tr('statsProtectionColumn', 'Protection'), tr('statsPagesUnit', 'pages')],
        s.togetherMetrics.slice(0, 10).map(row => [row.a, row.b, num(row.pages)]), tr('statsFoundTogether', 'Protections found together'));
    } else if (state.section === 'signals') {
      renderSignals();
    } else if (state.section === 'combinations') {
      renderCombinations();
    } else if (state.section === 'rules') {
      renderRules();
    } else if (state.section === 'tools') {
      renderTools();
    } else {
      const bandLabel = row => num(row.min) + '–' + (row.max === 100 ? num(100) : '<' + num(row.max + 1)) + '%';
      StatsCharts.bars(byId('statsConfidenceHistogram'), s.confidenceBuckets.map(row => ({ label: bandLabel(row), value: row.count, tip: [bandLabel(row), detectionsTip(row.count)] })), chartOptions('statsConfidenceDistribution', 'Confidence distribution', { vertical: true }));
      set('statsConfidenceKnown', fmt('statsConfidenceKnownFmt', '{0} detections have confidence values; {1} have no valid score.', num(s.totals.validConfidenceCount), num(s.totals.unknownConfidenceCount)));
      StatsCharts.bars(byId('statsCategoryConfidence'), s.categoryConfidence.filter(row => row.withConfidence).map(row => ({ label: categoryLabel(row.category), value: row.avgConfidence, color: state.colors[row.category], tip: [categoryLabel(row.category), confidence(row.avgConfidence), detectionsTip(row.withConfidence)] })), chartOptions('statsCategoryConfidence', 'Confidence by category', { fixedMax: 100, formatNumber: value => percent(value) }));
      StatsCharts.line(byId('statsConfidenceTrend'), timePage.rows.map(day => ({ label: dayLabel(day.date), value: day.avgConfidence, tip: [dayLabel(day.date, true), confidence(day.avgConfidence)] })), chartOptions('statsConfidenceTrend', 'Confidence over time', { fixedMax: 100, formatNumber: value => percent(value) }));
      chartPagination('statsConfidenceTrend', 'timeline', timePage);
    }
  }
  function categoryBadge(key) {
    const badge = element('span', 'stats-category-badge');
    const dot = element('span', 'stats-legend-swatch');
    dot.style.backgroundColor = state.colors[key];
    dot.setAttribute('aria-hidden', 'true');
    badge.append(dot, document.createTextNode(categoryLabel(key)));
    return badge;
  }
  function table(host, headers, rows, caption, emptyMessage) {
    host.replaceChildren();
    if (!rows.length) { host.appendChild(element('div', 'stats-none', emptyMessage || tr('statsNoData', 'No data in this range'))); return; }
    const node = element('table', 'stats-table');
    const cap = element('caption', 'stats-sr-only', caption);
    const head = element('thead'), header = element('tr');
    headers.forEach(text => { const th = element('th', '', text); th.scope = 'col'; header.appendChild(th); });
    head.appendChild(header);
    const body = element('tbody');
    rows.forEach(values => {
      const row = element('tr');
      values.forEach((value, index) => {
        const cell = element(index ? 'td' : 'th');
        if (!index) cell.scope = 'row';
        if (value instanceof Node) cell.appendChild(value); else cell.textContent = String(value);
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    node.append(cap, head, body);
    host.appendChild(node);
  }
  function tableCount(prefix, visible, total) {
    set(prefix + 'Count', fmt('statsTableCountFmt', '{0} of {1} rows', num(visible), num(total)));
    byId(prefix + 'More').hidden = visible >= total;
  }
  /** A pattern as its rule describes it, with the raw pattern below; just the pattern when undescribed. */
  function signalCell(signal) {
    const description = FormatUtils.ruleText(typeof RuleStats !== 'undefined' ? RuleStats.descriptionOf(state.descriptions, signal) : '');
    const cell = element('div', 'stats-signal');
    if (description) cell.appendChild(element('span', 'stats-signal-desc', description));
    const raw = element('code', 'stats-signal-raw' + (description ? '' : ' is-main'), signal.label);
    raw.setAttribute('dir', 'ltr');
    cell.appendChild(raw);
    return cell;
  }
  function methodBadge(key) {
    const badge = element('span', 'stats-category-badge');
    const dot = element('span', 'stats-legend-swatch');
    dot.style.backgroundColor = METHOD_COLORS[key] || METHOD_COLORS.other;
    dot.setAttribute('aria-hidden', 'true');
    badge.append(dot, document.createTextNode(methodLabel(key)));
    return badge;
  }
  function renderSignals() {
    const s = state.stats;
    const keys = Object.keys(METHOD_COLORS);
    StatsCharts.donut(byId('statsMethods'), keys.map(key => ({ label: methodLabel(key), value: s.methods[key] || 0, color: METHOD_COLORS[key] })),
      chartOptions('statsMethods', 'Detection methods', { centerValue: num(s.totalMatches), centerLabel: tr('statsMatchesUnit', 'matches') }));
    const used = keys.filter(key => CATEGORIES.some(category => (s.methodsByCategory[category] || {})[key] > 0));
    const series = used.map(key => ({ key, label: methodLabel(key), color: METHOD_COLORS[key] }));
    StatsCharts.stacked(byId('statsMethodsByCategory'), CATEGORIES.filter(category => used.some(key => s.methodsByCategory[category][key] > 0)).map(category => ({
      label: categoryLabel(category), values: s.methodsByCategory[category],
      tip: [categoryLabel(category), ...used.filter(key => s.methodsByCategory[category][key] > 0).map(key => methodLabel(key) + ': ' + num(s.methodsByCategory[category][key]))]
    })), chartOptions('statsMethodsByCategory', 'Methods by category', { series }));
    byId('statsMethodLegend').replaceChildren(...used.map(methodBadge));
    renderSignalTable();
    StatsCharts.bars(byId('statsWeakEvidence'), s.weakEvidence.map(row => ({ label: row.name, value: row.avgMatchConfidence, color: state.colors[row.category],
      tip: [row.name, categoryLabel(row.category), tr('statConfidence', 'Confidence') + ': ' + confidence(row.avgMatchConfidence), pagesTip(row.pages)] })),
    chartOptions('statsWeakEvidence', 'Weakest evidence', { fixedMax: 100, formatNumber: value => percent(value) }));
  }
  function renderSignalTable() {
    const all = state.stats.signalMetrics, rows = all.slice(0, state.signalLimit);
    table(byId('statsSignalTable'), [tr('statsSignalColumn', 'Signal'), tr('statsMethodColumn', 'Method'), tr('statsProtectionColumn', 'Protection'), tr('statsPagesUnit', 'pages'), tr('statsAverageConfidence', 'Average confidence')],
      rows.map(row => [signalCell(row), methodBadge(row.method), row.detector, num(row.pages), confidence(row.avgConfidence)]), tr('statsTopSignals', 'Most matched signals'));
    tableCount('statsSignal', rows.length, all.length);
  }
  function renderCombinations() {
    const s = state.stats, d = s.decided;
    const parts = [
      { key: 'single', label: tr('statsDecidedSingle', 'Single pattern'), color: '#6b7280' },
      { key: 'combination', label: tr('statsDecidedCombination', 'Combination'), color: '#8b5cf6' }];
    StatsCharts.donut(byId('statsDecided'), parts.map(p => ({ label: p.label, value: d[p.key].detections, color: p.color })),
      chartOptions('statsDecidedBy', 'How detections were decided', { centerValue: num(s.totals.detections), centerLabel: tr('statsDetectionsUnit', 'detections') }));
    StatsCharts.bars(byId('statsCombinationGain'), parts.filter(p => d[p.key].avgConfidence !== null).map(p => ({ label: p.label, value: d[p.key].avgConfidence, color: p.color,
      tip: [p.label, confidence(d[p.key].avgConfidence), detectionsTip(d[p.key].detections)] })),
    chartOptions('statsCombinationGain', 'Confidence by decision', { fixedMax: 100, formatNumber: value => percent(value) }));
    renderCombinationTable();
  }
  function renderCombinationTable() {
    const all = state.stats.combinationMetrics, rows = all.slice(0, state.combinationLimit);
    const comboName = row => FormatUtils.ruleText((typeof RuleStats !== 'undefined' && RuleStats.combinationName(state.rules, row.detectorId, row.detector, row.id)) || row.name) || row.id;
    table(byId('statsCombinationTable'), [tr('statsCombinationColumn', 'Combination'), tr('statsProtectionColumn', 'Protection'), tr('statsPagesUnit', 'pages'), tr('statsAverageConfidence', 'Average confidence')],
      rows.map(row => [comboName(row), row.detector, num(row.pages), confidence(row.avgConfidence)]), tr('statsTopCombinations', 'Combinations that fired'),
      tr('statsNoCombinations', 'No detection in this range was decided by a combination.'));
    tableCount('statsCombination', rows.length, all.length);
  }
  function renderRules() {
    const r = state.ruleStats;
    if (!r) return;
    set('rulesTotal', num(r.totals.total));
    set('rulesOfficial', num(r.totals.official));
    set('rulesCustom', num(r.totals.custom));
    set('rulesModified', num(r.totals.modified));
    set('rulesDisabled', num(r.totals.disabled));
    StatsCharts.bars(byId('statsRuleActive'), r.active.slice(0, 10).map(row => ({ label: row.name, value: row.pages, color: state.colors[row.category],
      tip: [row.name, row.official ? tr('tipOfficialDetector', 'Official Scrapfly detector') : tr('tipCustomDetector', 'Custom detector'), pagesTip(row.pages), domainsTip(row.domains)] })),
    chartOptions('statsRulesMostActive', 'Most active rules'));
    const methodKeys = Object.keys(r.patternsByMethod).filter(key => r.patternsByMethod[key] > 0);
    StatsCharts.bars(byId('statsRulePatterns'), methodKeys.map(key => ({ label: methodLabel(key), value: r.patternsByMethod[key], color: METHOD_COLORS[key],
      tip: [methodLabel(key), fmt('statsTipPatternsFmt', '{0} patterns', num(r.patternsByMethod[key]))] })), chartOptions('statsRulesPatternsByMethod', 'Patterns by method'));
    const kind = row => row.official ? tr('statsRulesOfficial', 'Official') : tr('statsRulesCustom', 'Custom');
    const unused = r.neverMatched.slice(0, state.unusedLimit);
    table(byId('statsUnusedTable'), [tr('statsRuleColumn', 'Rule'), tr('statsCategoryColumn', 'Category'), tr('statsRuleKindColumn', 'Type'), tr('statsPatternsUnit', 'patterns')],
      unused.map(row => [row.name, categoryBadge(CATEGORIES.includes(row.category) ? row.category : 'other'), kind(row), num(row.patterns)]),
      tr('statsRulesNeverMatched', 'Not found in this range'), tr('statsRulesAllMatched', 'Every enabled rule found something in this range.'));
    tableCount('statsUnused', unused.length, r.neverMatched.length);
    const missing = r.missingDescriptions.slice(0, state.missingLimit);
    table(byId('statsMissingTable'), [tr('statsRuleColumn', 'Rule'), tr('statsCategoryColumn', 'Category'), tr('statsMissingColumn', 'Without description'), tr('statsPatternsUnit', 'patterns')],
      missing.map(row => [row.name, categoryBadge(CATEGORIES.includes(row.category) ? row.category : 'other'), num(row.missing), num(row.patterns)]),
      tr('statsRulesMissingDescriptions', 'Patterns without a description'), tr('statsRulesAllDescribed', 'Every pattern has a description.'));
    tableCount('statsMissing', missing.length, r.missingDescriptions.length);
    byId('statsWaitingCard').hidden = !r.waiting.length;
    table(byId('statsWaitingTable'), [tr('statsRuleColumn', 'Rule'), tr('statsRuleVersionColumn', 'Rule version'), tr('statsNeedsExtensionColumn', 'Needs extension')],
      r.waiting.map(row => [row.name, row.version || '–', row.minExtensionVersion || '–']), tr('statsRulesWaiting', 'Waiting for a newer extension'));
  }
  function renderTools() {
    const t = state.toolStats;
    if (!t) return;
    StatsCharts.bars(byId('statsToolsVendors'), t.byModule.map(row => ({ label: row.name, value: row.count, tip: [row.name, capturesTip(row.count)] })),
      chartOptions('statsToolsByVendor', 'Captures by vendor'));
    StatsCharts.bars(byId('statsToolsTools'), t.byTool.slice(0, 10).map(row => {
      const label = row.capture ? tr('statsToolsCapture', 'Capture') : row.label;
      return { label, value: row.count, tip: [label, capturesTip(row.count)] };
    }), chartOptions('statsToolsByTool', 'Most used tools'));
    const timePage = chartPage('timeline', state.stats.timeline);
    StatsCharts.line(byId('statsToolsTimeline'), timePage.rows.map(day => ({ label: dayLabel(day.date), value: t.perDay.get(day.date) || 0,
      tip: [dayLabel(day.date, true), capturesTip(t.perDay.get(day.date) || 0)] })),
    chartOptions('statsToolsOverTime', 'Captures over time', { fill: true, fixedMax: Math.max(1, ...state.stats.timeline.map(day => t.perDay.get(day.date) || 0)) }));
    chartPagination('statsToolsTimeline', 'timeline', timePage);
  }
  function renderChangeTable() {
    const s = state.stats, all = s.domainChanges, rows = all.slice(0, state.changeLimit);
    const when = ts => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(ts));
    const change = row => {
      const cell = element('div', 'stats-change');
      row.added.forEach(name => cell.appendChild(element('span', 'stats-change-added', '+ ' + name)));
      row.removed.forEach(name => cell.appendChild(element('span', 'stats-change-removed', '− ' + name)));
      return cell;
    };
    table(byId('statsChangeTable'), [tr('statsDomainColumn', 'Domain'), tr('statsChangeColumn', 'Change'), tr('statsDateColumn', 'Date')],
      rows.map(row => [row.hostname, change(row), when(row.timestamp)]), tr('statsDomainChanges', 'Protection changes'),
      tr('statsNoChanges', 'No domain changed its protections between saved visits in this range.'));
    tableCount('statsChange', rows.length, all.length);
  }
  function renderFirstSeen() {
    const firstSeen = state.firstSeen || { protections: [], domains: [] };
    const when = ts => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(ts));
    const rows = state.days ? firstSeen.protections.slice(0, 10).map(row => [row.name, categoryBadge(row.category), row.hostname || '–', when(row.ts)]) : [];
    table(byId('statsFirstSeenTable'), [tr('statsProtectionColumn', 'Protection'), tr('statsCategoryColumn', 'Category'), tr('statsDomainColumn', 'Domain'), tr('statsDateColumn', 'Date')],
      rows, tr('statsFirstSeen', 'New this period'),
      state.days ? tr('statsNothingNew', 'Nothing new: every protection here was already in History before this range.') : tr('statsFirstSeenAllTip', 'Choose 7, 30 or 90 days to see what is new.'));
  }
  function renderProtectionTable() {
    const all = state.stats.detectorMetrics, rows = all.slice(0, state.protectionLimit);
    table(byId('statsProtectionTable'), [tr('statsProtectionColumn', 'Protection'), tr('statsCategoryColumn', 'Category'), tr('statsPagesUnit', 'pages'), tr('statsSectionDomains', 'Domains'), tr('statsAverageConfidence', 'Average confidence')],
      rows.map(row => [row.name, categoryBadge(row.category), num(row.pages), num(row.domains), confidence(row.avgConfidence)]), tr('statsProtectionDetails', 'All protections'));
    tableCount('statsProtection', rows.length, all.length);
  }
  function renderDomainTable() {
    const query = byId('statsDomainSearch').value.trim().toLowerCase();
    const sort = byId('statsDomainSort').value;
    const all = state.stats.domainMetrics.filter(row => row.hostname.toLowerCase().includes(query)).slice().sort((a, b) => {
      const name = a.hostname.localeCompare(b.hostname, locale());
      if (sort === 'name') return name;
      const av = sort === 'confidence' ? (a.avgConfidence === null ? -1 : a.avgConfidence) : a[sort];
      const bv = sort === 'confidence' ? (b.avgConfidence === null ? -1 : b.avgConfidence) : b[sort];
      return bv - av || name;
    });
    const rows = all.slice(0, state.domainLimit);
    table(byId('statsDomainTable'), [tr('statsDomainColumn', 'Domain'), tr('statsVisitsUnit', 'visits'), tr('statsDetections', 'Detections'), tr('statsDistinctDetectors', 'Distinct protections'), tr('statsAverageConfidence', 'Average confidence')],
      rows.map(row => [row.hostname, num(row.visits), num(row.detections), num(row.uniqueDetectors), confidence(row.avgConfidence)]), tr('statsDomainDetails', 'All domains'), tr('statsNoMatchingDomains', 'No domains match your search.'));
    tableCount('statsDomain', rows.length, all.length);
  }
  async function exportData(format) {
    if (state.exporting || !state.stats || !state.stats.totals.entries) return;
    state.exporting = true;
    updateExportButtons();
    status('');
    try {
      const result = await StatsExport.download(format, state.items, { days: state.days, now: state.now });
      status(fmt('statsExportStartedFmt', 'Download started: {0}', result.filename));
    } catch (_) { status(tr('statsExportFailed', 'Could not export the data. Please try again.'), true); }
    finally { state.exporting = false; updateExportButtons(); }
  }
  async function init() {
    try {
      const stored = await StorageManager.readRaw(['scrapfly_language_override']);
      await I18n.loadOverride(stored.scrapfly_language_override);
    } catch (_) { /* Browser locale remains available. */ }
    I18n.apply(document);
    document.title = tr('settingsHistoryStatsTitle', 'History statistics') + ' · Scrapfly';
    document.documentElement.lang = locale();
    document.documentElement.dir = /^ar\b/.test(locale()) ? 'rtl' : 'ltr';
    const tabs = [...document.querySelectorAll('[data-section]')];
    tabs.forEach(button => {
      button.addEventListener('click', () => selectSection(button.dataset.section));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const backward = document.documentElement.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(button) + (event.key === backward ? -1 : 1) + tabs.length) % tabs.length;
        selectSection(tabs[index].dataset.section);
        tabs[index].focus();
        tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
    document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => {
      state.days = Number(button.dataset.days);
      state.chartPages = {};
      LIST_LIMITS.forEach(key => { state[key] = pageOf(key); });
      status('');
      render();
      StorageManager.saveToStorage(RANGE_KEY, state.days, { wrapMetadata: false });
    }));
    document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => exportData(button.dataset.export)));
    ['input', 'change'].forEach(type => {
      byId(type === 'input' ? 'statsDomainSearch' : 'statsDomainSort').addEventListener(type, () => { state.domainLimit = TABLE_PAGE; if (state.stats) renderDomainTable(); });
    });
    byId('statsDomainMore').addEventListener('click', () => { state.domainLimit += TABLE_PAGE; renderDomainTable(); });
    byId('statsProtectionMore').addEventListener('click', () => { state.protectionLimit += TABLE_PAGE; renderProtectionTable(); });
    [['statsSignalMore', 'signalLimit', () => renderSignalTable()], ['statsCombinationMore', 'combinationLimit', () => renderCombinationTable()],
      ['statsUnusedMore', 'unusedLimit', () => renderRules()], ['statsMissingMore', 'missingLimit', () => renderRules()],
      ['statsChangeMore', 'changeLimit', () => renderChangeTable()]].forEach(([id, key, again]) => byId(id).addEventListener('click', () => { state[key] += pageOf(key); again(); }));
    // Official ids of the detectors shipped with this build (Rules → Update adds its own in storage)
    try {
      if (typeof fetch === 'function') {
        const index = await (await fetch('../../detectors/index.json')).json();
        state.bundledOfficialIds = Object.values(index || {}).flatMap(entry => entry && Array.isArray(entry.detectors) ? entry.detectors : []);
      }
    } catch (_) { /* custom vs official falls back to stored ids */ }
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
    window.addEventListener('scroll', hideTooltip, { passive: true });
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { if (state.stats && !byId('statsContent').hidden) renderSection(); });
    });
    if (typeof RuleI18n !== 'undefined') { try { await RuleI18n.load(); } catch (_) { /* English rule texts */ } }
    try { await loadData(true); }
    catch (_) { status(tr('statsLoadFailed', 'Could not load the history. Please reload this page.'), true); }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.scrapfly_language_override) { location.reload(); return; }
      if (changes.scrapfly_history || changes.scrapfly_settings || changes.scrapfly_detectors || changes.scrapfly_advanced_history || changes.scrapfly_incompatible_updates) {
        loadData().catch(() => status(tr('statsLoadFailed', 'Could not load the history. Please reload this page.'), true));
      }
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
