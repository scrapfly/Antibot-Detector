/** Activity tab: pages per day with a 7-day average, the calendar and its facts, weekday and hour. */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, element } = U;
  const V = root.StatsViews = root.StatsViews || {};
  const CALENDAR_MONTH_WEEKS = 14;
  const nice = max => typeof root.StatsCharts.niceScale === 'function' ? root.StatsCharts.niceScale(max).max : max;

  /** First day of the week in the page language, 1 = Monday .. 7 = Sunday; Monday when the browser cannot say. */
  function weekStartOf() {
    try {
      const locale = new Intl.Locale(U.locale());
      const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
      if (info && Number.isInteger(info.firstDay) && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay;
    } catch (_) { /* Monday */ }
    return 1;
  }
  /** The JavaScript weekday (0 = Sunday) shown in column c of a week that starts on weekStart. */
  const weekdayAt = (weekStart, c) => (weekStart % 7 + c) % 7;
  /** How many calendar weeks the timeline covers: more than a few months switches the calendar to its year layout. */
  function weeksOf(timeline, weekStart) {
    if (!timeline.length) return 0;
    const first = U.dayDate(timeline[0].date), iso = (first.getDay() + 6) % 7 + 1;
    return Math.ceil(((iso - weekStart + 7) % 7 + timeline.length) / 7);
  }
  const dayTip = day => [U.dayLabel(day.date, true),
    { label: tr('statsKpiPages', 'Pages saved'), value: num(day.entries) },
    { label: tr('statsDetections', 'Detections'), value: num(day.detections) },
    { label: tr('statsUniqueDomains', 'Unique domains'), value: num(day.uniqueDomains) },
    ...(day.partial ? [tr('statsTodayPartial', 'Today (still counting)')] : [])];

  function fact(label, value, small) {
    const wrap = element('div', 'stats-fact'), dd = element('dd', '', value);
    if (small) dd.appendChild(element('small', '', small));
    wrap.append(element('dt', '', label), dd);
    return wrap;
  }
  function renderFacts(app) {
    const { d } = app, s = d.stats;
    const from = d.firstSeen.oldestTs === null ? null : HistoryStats.dayKey(d.firstSeen.oldestTs);
    const facts = HistoryStats.activityFacts(s, from ? { from } : {});
    const pages = n => tr('statsKpiPages', 'Pages saved') + ': ' + num(n);
    byId('statsActivityFacts').replaceChildren(
      fact(tr('statsBusiestDay', 'Busiest day'), facts.busiest ? U.dayLabel(facts.busiest.date, true) : '–', facts.busiest ? pages(facts.busiest.entries) : ''),
      fact(tr('statsLongestStreak', 'Longest streak'), facts.longestStreak ? U.days(facts.longestStreak) : '–'),
      fact(tr('statsPeakHour', 'Peak hour'), facts.peakHour ? U.hourLabel(facts.peakHour.hour) : '–', facts.peakHour ? pages(facts.peakHour.entries) : ''),
      fact(tr('statsQuietDays', 'Days with nothing saved'), num(facts.quietDays)));
  }

  function render(app) {
    const { d } = app, s = d.stats, tl = s.timeline, weekStart = weekStartOf();
    const dailyMax = Math.max(1, ...tl.map(day => day.entries));
    root.StatsCharts.bars(byId('statsActivityTrend'), tl.map(day => ({ label: U.dayLabel(day.date), value: day.entries, partial: day.partial, tip: dayTip(day) })),
      U.chartOptions(tr('statsDailyVisits', 'Daily history entries'), { vertical: true, fixedMax: nice(dailyMax), valueLabels: 'auto', average: { window: 7 } }));
    byId('statsActivityLegend').hidden = tl.length < 3;
    U.setText('statsActivityLegend', tr('statsSevenDayAverage', 'Line: 7-day average'));
    // "All" keeps the latest year on the timeline; the weekday and hour charts still cover everything
    byId('statsActivityLimit').hidden = !d.clipped;
    if (d.clipped) U.setText('statsActivityLimit', fmt('statsTimelineLimitFmt', 'The latest {0} days are shown. Totals and exports include the entire selected range.', num(tl.length)));

    const labels = Array.from({ length: 7 }, (_, c) => U.weekdayLabel(weekdayAt(weekStart, c)));
    const heatmap = byId('statsHeatmap'), wrap = heatmap.parentNode;
    if (wrap && wrap.classList) wrap.classList.toggle('is-year', weeksOf(tl, weekStart) > CALENDAR_MONTH_WEEKS);
    root.StatsCharts.calendar(heatmap, tl.map(day => ({ date: day.date, label: U.dayLabel(day.date, true), value: day.entries, tip: dayTip(day) })),
      U.chartOptions(tr('statsActivityCalendar', 'Activity calendar'), { color: 'var(--s-heat)', weekStart, weekdayLabels: labels, monthLabel: U.monthLabel,
        today: HistoryStats.dayKey(d.now), legendLess: tr('statsLess', 'Less'), legendMore: tr('statsMore', 'More') }));
    renderFacts(app);

    const rowTip = (label, row) => [label, { label: tr('statsKpiPages', 'Pages saved'), value: num(row.entries) }, { label: tr('statsDetections', 'Detections'), value: num(row.detections) }];
    root.StatsCharts.bars(byId('statsWeekdays'), labels.map((label, c) => { const row = s.weekdays[weekdayAt(weekStart, c)]; return { label, value: row.entries, tip: rowTip(U.weekdayLabel(weekdayAt(weekStart, c), 'long'), row) }; }),
      U.chartOptions(tr('statsWeekdayActivity', 'Activity by weekday'), { vertical: true, highlight: 'max', valueLabels: 'auto' }));
    root.StatsCharts.bars(byId('statsHourly'), s.hourly.map(row => { const label = U.hourLabel(row.hour); return { label, value: row.entries, tip: rowTip(label, row) }; }),
      U.chartOptions(tr('statsHourlyActivity', 'Activity by hour'), { vertical: true, highlight: 'max', valueLabels: false }));
  }
  V.activity = { render, weekStartOf, weeksOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
