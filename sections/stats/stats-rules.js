/** Rules tab (the rule library against what History found) and Tools tab (Advanced captures that are still live). */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, share, element } = U;
  const V = root.StatsViews = root.StatsViews || {};
  const KINDS = { official: ['statsRulesOfficial', 'Official'], custom: ['statsRulesCustom', 'Custom'], edited: ['statsRulesSourceEdited', 'Edited'] };
  const STATUSES = { quiet: ['statsRuleStatusQuiet', 'Not in range'], unseen: ['statsRuleStatusUnseen', 'Not in History'] };
  const categoryKey = key => U.CATEGORY_KEYS.includes(key) ? key : 'other';
  /** Below this many saved pages a rule that never matched proves little. */
  const MIN_HISTORY = 50;

  /** The rule statistics use every category: the scope never applies here. */
  function ruleStats(app) {
    const { state, d } = app;
    if (d.ruleStats === undefined) {
      d.ruleStats = typeof RuleStats === 'undefined' ? null : RuleStats.compute(state.rules, {
        detectorMetrics: HistoryStats.detectorSummary(d.selectedAll), incompatible: state.incompatible, isOfficial: app.isOfficialRule,
        seen: HistoryStats.detectorSeen(state.items), historyEntries: state.items.length, minHistory: MIN_HISTORY });
    }
    return d.ruleStats;
  }
  function renderTiles(app, r) {
    const t = r.totals;
    U.setText('rulesCoverage', t.enabled ? share(t.matched / t.enabled) : '–');
    U.setText('rulesCoverageSub', fmt('statsRulesCoverageFmt', '{0} of {1} enabled rules matched in this range', num(t.matched), num(t.enabled)));
    U.setText('rulesAttention', num(t.attention));
    const unseen = r.neverMatched.filter(row => row.attention).length;
    const parts = [];
    if (unseen) parts.push(tr('statsRuleStatusUnseen', 'Not in History') + ': ' + num(unseen));
    if (t.waiting) parts.push(tr('statsRulesWaiting', 'Waiting for a newer extension') + ': ' + num(t.waiting));
    U.setText('rulesAttentionSub', parts.length ? parts.join(' · ') : tr('statsRulesAttentionNone', 'Nothing needs attention.'));
    byId('rulesWaitingTile').hidden = !t.waiting;
    U.setText('rulesWaitingCount', num(t.waiting));
    U.setText('rulesTotal', num(t.total));
    const label = (id, text, count) => tr(id, text) + ': ' + num(count);
    U.setText('rulesLibrarySub', [label('statsRulesOfficial', 'Official', t.official - t.modified), label('statsRulesCustom', 'Custom', t.custom),
      label('statsRulesSourceEdited', 'Edited', t.modified), label('statsRulesDisabled', 'Disabled', t.disabled)].join(' · '));
    const quiet = [tr('statsRulesOfficialQuietNote', 'Official rules for vendors you have not met stay quiet. That is normal.')];
    if (app.state.items.length < MIN_HISTORY) quiet.push(fmt('statsRulesWeakAbsenceFmt', 'Not much History to judge by yet (pages: {0}), so a rule that never matched proves little.', num(app.state.items.length)));
    U.setText('statsRulesQuietNote', quiet.join(' '));
  }
  function renderUnused(app, r) {
    const rows = r.neverMatched.slice(0, app.state.limits.unused);
    U.table(byId('statsUnusedTable'), {
      caption: tr('statsRulesNeverMatched', 'Not found in this range'),
      headers: [tr('statsRuleColumn', 'Rule'), tr('statsCategoryColumn', 'Category'), tr('statsRuleKindColumn', 'Type'), tr('statsRulesStatusColumn', 'Status'), { text: tr('statsPatternsUnit', 'patterns'), num: true }],
      rows: rows.map(row => ({ tone: row.attention ? 'attention' : row.kind === 'official' ? 'muted' : '',
        cells: [row.name, U.categoryBadge(categoryKey(row.category)), tr(...KINDS[row.kind]), tr(...STATUSES[row.status]), num(row.patterns)] })),
      empty: tr('statsRulesAllMatched', 'Every enabled rule found something in this range.'), ok: true
    });
    U.tableCount('statsUnused', rows.length, r.neverMatched.length);
  }
  function renderMissing(app, r) {
    const rows = r.missingDescriptions.slice(0, app.state.limits.missing);
    U.table(byId('statsMissingTable'), {
      caption: tr('statsRulesMissingDescriptions', 'Patterns without a description'),
      headers: [tr('statsRuleColumn', 'Rule'), tr('statsCategoryColumn', 'Category'), { text: tr('statsMissingColumn', 'Without description'), num: true }, { text: tr('statsPatternsUnit', 'patterns'), num: true }],
      rows: rows.map(row => [row.name, U.categoryBadge(categoryKey(row.category)), num(row.missing), num(row.patterns)]),
      empty: tr('statsRulesAllDescribed', 'Every pattern has a description.'), ok: true
    });
    U.tableCount('statsMissing', rows.length, r.missingDescriptions.length);
  }
  function renderRules(app) {
    const r = ruleStats(app);
    if (!r) return;
    renderTiles(app, r);
    renderUnused(app, r);
    renderMissing(app, r);
    byId('statsWaitingCard').hidden = !r.waiting.length;
    U.table(byId('statsWaitingTable'), { caption: tr('statsRulesWaiting', 'Waiting for a newer extension'),
      headers: [tr('statsRuleColumn', 'Rule'), tr('statsRuleVersionColumn', 'Rule version'), tr('statsNeedsExtensionColumn', 'Needs extension')],
      rows: r.waiting.map(row => [row.name, row.version || '–', row.minExtensionVersion || '–']) });
    const rows = Object.keys(r.patternsByMethod).filter(key => r.patternsByMethod[key] > 0).sort((a, b) => r.patternsByMethod[b] - r.patternsByMethod[a])
      .map(key => ({ label: U.methodLabel(key), value: r.patternsByMethod[key], color: U.DIFFICULTY_COLORS.None }));
    root.StatsCharts.rank(byId('statsRulePatterns'), rows, U.chartOptions(tr('statsRulesPatternsByMethod', 'Patterns by method'), { showRank: false }));
  }

  /** Advanced keeps captures for 30 minutes: only those that have not expired, whatever the date range. */
  function renderTools(app, now = Date.now()) {
    const { state } = app, t = ToolsStats.compute(state.captures, { since: null, now, dayKey: HistoryStats.dayKey });
    U.setText('toolsSaved', num(t.total));
    U.setText('toolsExpiring', num(t.expiringSoon));
    U.setText('toolsVendors', num(t.byModule.length));
    byId('statsToolsStale').hidden = !t.stale;
    U.setText('statsToolsStale', fmt('statsToolsStaleFmt', 'Expired captures waiting to be cleaned up: {0}. Open Advanced to remove them.', num(t.stale)));
    const rows = t.live.slice(0, state.limits.capture);
    U.table(byId('statsCaptureTable'), {
      caption: tr('statsToolsSavedCaptures', 'Saved captures'),
      headers: [tr('statsToolsColVendor', 'Vendor'), tr('statsToolsColTool', 'Tool'), tr('statsDomainColumn', 'Domain'), { text: tr('statsToolsColSaved', 'Saved'), nowrap: true }, { text: tr('statsToolsColExpires', 'Expires'), nowrap: true }],
      rows: rows.map(row => { const host = element('span', '', row.hostname || '–'); host.setAttribute('dir', 'ltr'); return [row.name, row.tool || tr('statsToolsCapture', 'Capture'), host, U.relative(row.timestamp, now), row.expiresAt === null ? '–' : U.relative(row.expiresAt, now)]; }),
      empty: tr('statsToolsNoLive', 'No captures are saved right now.')
    });
    U.tableCount('statsCapture', rows.length, t.live.length);
  }
  function init(app) {
    const { state } = app;
    byId('statsUnusedMore').addEventListener('click', () => { state.limits.unused += app.PAGE.unused; renderUnused(app, ruleStats(app)); });
    byId('statsMissingMore').addEventListener('click', () => { state.limits.missing += app.PAGE.missing; renderMissing(app, ruleStats(app)); });
    byId('statsCaptureMore').addEventListener('click', () => { state.limits.capture += app.PAGE.capture; renderTools(app); });
  }
  V.rules = { init, render: renderRules };
  V.tools = { render: app => renderTools(app) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
