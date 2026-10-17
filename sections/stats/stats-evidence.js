/** Evidence tab: Confidence (strong-evidence share, distribution, mentioned-not-confirmed), Signals and Combinations. */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, share, percent, element } = U;
  const V = root.StatsViews = root.StatsViews || {};
  const TONES = { antibot: 'antibot', captcha: 'captcha' };
  /** At least this many points of lift between single patterns and combinations is worth a sentence. */
  const LIFT_NOTE_MIN = 20;
  const inScope = app => U.activeCategories(app.state.scope, app.d.counts);
  const nice = max => typeof root.StatsCharts.niceScale === 'function' ? root.StatsCharts.niceScale(max).max : max;

  /* ---------- Confidence ---------- */
  function renderStrong(app) {
    const host = byId('statsStrongEvidence'), keys = inScope(app);
    const rows = keys.map(key => app.d.stats.categoryConfidence.find(row => row.category === key)).filter(row => row && row.withConfidence > 0);
    host.replaceChildren();
    if (!rows.length) { host.appendChild(U.none(tr('statsNoData', 'No data in this range'))); return; }
    rows.forEach(row => {
      const tile = element('div', 'stats-kpi stats-kpi--compact');
      tile.setAttribute('data-tone', TONES[row.category] || 'accent');
      const value = element('div', 'stats-kpi-row');
      value.appendChild(element('div', 'stats-kpi-value', share(row.strong / row.withConfidence)));
      tile.append(element('div', 'stats-kpi-label', U.categoryLabel(row.category)), value, element('div', 'stats-kpi-sub', tr('statsStrongEvidence', 'Strong evidence')));
      U.setTip(tile, tr('statsStrongEvidence', 'Strong evidence'), fmt('statsStrongEvidenceTipFmt', '{0} of {1} detections score 80% or more.', num(row.strong), num(row.withConfidence)));
      host.appendChild(tile);
    });
  }
  const bandLabel = row => num(row.min) + '–' + (row.max === 100 ? num(100) : '<' + num(row.max + 1)) + '%';
  function renderDistribution(app) {
    const s = app.d.stats, keys = inScope(app);
    const series = keys.map(key => ({ key, label: U.categoryLabel(key), color: U.ink(key) }));
    const rows = s.confidenceByCategory.map(band => ({ label: bandLabel(band), values: band,
      tip: [bandLabel(band), ...series.map(item => ({ label: item.label, value: num(band[item.key]), color: item.color }))] }));
    const max = Math.max(1, ...s.confidenceByCategory.map(band => keys.reduce((sum, key) => sum + band[key], 0)));
    root.StatsCharts.stacked(byId('statsConfidenceHistogram'), rows, U.chartOptions(tr('statsConfidenceDistribution', 'Confidence distribution'), { series, vertical: true, fixedMax: nice(max) }));
    byId('statsConfidenceLegend').replaceChildren(...series.map(item => U.categoryBadge(item.key)));
    U.setText('statsConfidenceKnown', fmt('statsConfidenceKnownFmt', '{0} detections have confidence values; {1} have no valid score.', num(s.totals.validConfidenceCount), num(s.totals.unknownConfidenceCount)));
  }
  function renderUnconfirmed(app) {
    const s = app.d.stats, host = byId('statsUnconfirmed');
    if (!s.unconfirmed.length) {
      host.replaceChildren(s.detectorMetrics.some(row => row.category !== 'fingerprint')
        ? U.none(tr('statsUnconfirmedNone', 'Every frequent protection was confirmed by strong evidence.'), true) : U.none(tr('statsNoData', 'No data in this range')));
      return;
    }
    const rows = s.unconfirmed.map(row => ({
      label: row.name, value: row.pages, color: U.ink(row.category),
      sub: row.driver ? fmt('statsUnconfirmedDriverFmt', 'Mostly found through {0}: {1}', U.methodLabel(row.driver.method), row.driver.label) : tr('statsUnconfirmedNoDriver', 'No single signal stands out.'),
      meta: { text: (row.weak ? tr('statsTierWeak', 'Weak') + ': ' + num(row.weak) : tr('statsTierModerate', 'Moderate') + ': ' + num(row.moderate)), color: U.ink(row.category) },
      tip: [row.name, { label: tr('statsPagesColumn', 'Pages'), value: num(row.pages) },
        { label: tr('statsTierStrong', 'Strong'), value: num(row.strong) }, { label: tr('statsTierModerate', 'Moderate'), value: num(row.moderate) }, { label: tr('statsTierWeak', 'Weak'), value: num(row.weak) }] }));
    root.StatsCharts.rank(host, rows, U.chartOptions(tr('statsUnconfirmed', 'Mentioned, not confirmed'), {}));
  }

  /* ---------- Signals ---------- */
  /** A pattern as its rule describes it, with the raw pattern below; just the pattern when undescribed. */
  function signalCell(app, signal) {
    const description = FormatUtils.ruleText(typeof RuleStats !== 'undefined' ? RuleStats.descriptionOf(app.state.descriptions, signal) : '');
    const cell = element('div', 'stats-signal');
    if (description) cell.appendChild(element('span', 'stats-signal-desc', description));
    const raw = element('code', 'stats-signal-raw' + (description ? '' : ' is-main'), signal.label);
    raw.setAttribute('dir', 'ltr');
    cell.appendChild(raw);
    return cell;
  }
  function renderMethods(app) {
    const s = app.d.stats;
    const rows = Object.keys(s.methods).filter(key => s.methods[key] > 0).sort((a, b) => s.methods[b] - s.methods[a])
      .map(key => ({ label: U.methodLabel(key), value: s.methods[key], share: share(s.totalMatches ? s.methods[key] / s.totalMatches : 0) }));
    root.StatsCharts.rank(byId('statsMethods'), rows, U.chartOptions(tr('statsMethods', 'Detection methods'), { showRank: false }));
  }
  function renderSignalTable(app) {
    const { state, d } = app, all = d.stats.signalMetrics, rows = all.slice(0, state.limits.signal);
    U.table(byId('statsSignalTable'), {
      caption: tr('statsTopSignals', 'Most matched signals'),
      headers: [tr('statsSignalColumn', 'Signal'), tr('statsMethodColumn', 'Method'), tr('statsProtectionColumn', 'Protection'), { text: tr('statsPagesColumn', 'Pages'), num: true }, { text: tr('statsAverageConfidence', 'Average confidence'), num: true }],
      rows: rows.map(row => [signalCell(app, row), U.methodBadge(row.method), row.detector, num(row.pages), U.confidence(row.avgConfidence)])
    });
    U.tableCount('statsSignal', rows.length, all.length);
  }

  /* ---------- Combinations ---------- */
  function renderDecided(app) {
    const s = app.d.stats, host = byId('statsDecided'), insight = byId('statsDecidedInsight');
    host.replaceChildren();
    insight.hidden = true;
    const keys = inScope(app).filter(key => s.decidedByCategory[key].single.detections + s.decidedByCategory[key].combination.detections > 0);
    if (!keys.length) { host.appendChild(U.none(tr('statsNoData', 'No data in this range'))); return; }
    let best = null;
    const single = tr('statsDecidedSingle', 'Single pattern'), combination = tr('statsDecidedCombination', 'Combination');
    keys.forEach(key => {
      const c = s.decidedByCategory[key];
      const row = element('div', 'stats-decided-row'), head = element('div', 'stats-decided-head'), bar = element('div', 'stats-decided-bar');
      head.appendChild(U.categoryBadge(key));
      const lift = c.single.avgConfidence !== null && c.combination.avgConfidence !== null ? c.combination.avgConfidence - c.single.avgConfidence : null;
      if (lift !== null) {
        head.appendChild(element('span', 'stats-lift', fmt('statsLiftFmt', '{0} pts', U.signed(lift))));
        if (lift >= LIFT_NOTE_MIN && (!best || lift > best.lift)) best = { key, lift, from: c.single.avgConfidence, to: c.combination.avgConfidence };
      }
      const avg = (label, part) => fmt('statsDecidedAvgFmt', '{0}: {1} · {2} average', label, num(part.detections), part.avgConfidence === null ? tr('timeUnknown', 'Unknown') : percent(part.avgConfidence));
      row.append(head, bar, element('p', 'stats-card-note', avg(single, c.single) + '  ·  ' + avg(combination, c.combination)));
      host.appendChild(row);
      root.StatsCharts.segments(bar, [{ label: single, value: c.single.detections, color: U.DIFFICULTY_COLORS.None, tip: [avg(single, c.single)] },
        { label: combination, value: c.combination.detections, color: U.ink(key), tip: [avg(combination, c.combination)] }],
      U.chartOptions(U.categoryLabel(key), { formatShare: share, keepZero: true }));
    });
    if (best) {
      insight.hidden = false;
      insight.textContent = fmt('statsLiftStrongFmt', 'In {0}, combinations lift confidence from {1} to {2}.', U.categoryLabel(best.key), percent(best.from), percent(best.to));
    }
  }
  function renderCombinationTable(app) {
    const { state, d } = app, all = d.stats.combinationMetrics, rows = all.slice(0, state.limits.combination);
    const name = row => FormatUtils.ruleText((typeof RuleStats !== 'undefined' && RuleStats.combinationName(state.rules, row.detectorId, row.detector, row.id)) || row.name) || row.id;
    U.table(byId('statsCombinationTable'), {
      caption: tr('statsTopCombinations', 'Combinations that fired'),
      headers: [tr('statsCombinationColumn', 'Combination'), tr('statsProtectionColumn', 'Protection'), { text: tr('statsPagesColumn', 'Pages'), num: true }, { text: tr('statsAverageConfidence', 'Average confidence'), num: true }],
      rows: rows.map(row => [name(row), row.detector, num(row.pages), U.confidence(row.avgConfidence)]),
      empty: tr('statsNoCombinations', 'No detection in this range was decided by a combination.')
    });
    U.tableCount('statsCombination', rows.length, all.length);
  }

  function renderSub(app) {
    const sub = app.state.sub;
    if (sub === 'signals') { renderMethods(app); renderSignalTable(app); }
    else if (sub === 'combinations') { renderDecided(app); renderCombinationTable(app); }
    else { renderStrong(app); renderDistribution(app); renderUnconfirmed(app); }
  }
  function init(app) {
    const { state } = app;
    byId('statsSignalMore').addEventListener('click', () => { state.limits.signal += app.PAGE.signal; renderSignalTable(app); });
    byId('statsCombinationMore').addEventListener('click', () => { state.limits.combination += app.PAGE.combination; renderCombinationTable(app); });
  }
  V.evidence = { init, render: renderSub };
})(typeof globalThis !== 'undefined' ? globalThis : this);
