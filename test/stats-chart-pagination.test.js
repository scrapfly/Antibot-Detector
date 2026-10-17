'use strict';
/**
 * The Statistics charts used to be paged (30 days at a time, 12 rows at a time). The redesign draws the whole range and
 * lists the rest in tables, so what remains to test is that nothing is paged, cut or lost.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPage, entry, textOf, messages, read } = require('./stats-page-harness.js');

const msg = (key, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), messages[key].message);
const labels = call => Array.from(call.args[1], row => row.label);
/** `count` pages spread over the last `days` days; the last one is exactly `days` - 1 days back, so the range is covered end to end. */
function history(days = 90, count = 70) {
  return Array.from({ length: count }, (_, i) => entry(`domain${String(i).padStart(3, '0')}.example`, i === count - 1 ? days - 1 : i % days,
    [[`Protection${String(i).padStart(3, '0')}`, 'antibot', i % 101]]));
}
const pagingControls = ui => ui.all.filter(node => node.dataset.chartPageDirection || node.dataset.chartPageGroup || node.classes.has('stats-chart-pagination') || node.classes.has('stats-chart-page-btn'));

test('the paging code is gone from the page scripts', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '../sections/stats')).filter(f => /^stats.*\.js$/.test(f) && f !== 'stats-charts.js')) {
    assert.doesNotMatch(read('sections/stats/' + file), /chartPage|CHART_PAGE_SIZES|chart-page|chartPagination/, file);
  }
  assert.doesNotMatch(read('sections/stats/stats.html'), /chart-page|data-chart-page/);
});

test('time charts draw the whole range in one piece and no tab shows page controls', async () => {
  const ui = await createPage(history(), { preferences: { scrapfly_stats_range: 90 } });
  assert.equal(ui.chart('statsTimeline').args[1].length, 90);
  const first = labels(ui.chart('statsTimeline'));
  assert.equal(new Set(first).size, 90, 'ninety different days');
  for (const [section, id] of [['activity', 'statsActivityTrend'], ['activity', 'statsHeatmap']]) {
    ui.section(section);
    assert.equal(ui.chart(id).args[1].length, 90, id);
  }
  for (const section of ['overview', 'protections', 'domains', 'evidence', 'activity', 'rules']) {
    ui.section(section);
    assert.deepEqual(pagingControls(ui), [], section + ' has no page controls');
  }
});

test('the range sets how many days are drawn, and only the 365-day cap shortens them', async () => {
  const ui = await createPage(history(90), { preferences: { scrapfly_stats_range: 7 } });
  assert.equal(ui.chart('statsTimeline').args[1].length, 7);
  assert.equal(ui.id('statsTimelineLimit').hidden, true);
  ui.days(30);
  assert.equal(ui.chart('statsTimeline').args[1].length, 30);
  ui.days(90);
  assert.equal(ui.chart('statsTimeline').args[1].length, 90);
  const long = await createPage(history(400), { preferences: { scrapfly_stats_range: 0 } });
  const rows = long.chart('statsTimeline').args[1];
  assert.equal(rows.length, 365);
  assert.equal(new Set(Array.from(rows, row => row.tip[0])).size, 365, 'every one of the 365 days, once');
  assert.equal(long.id('statsTimelineLimit').hidden, false);
  assert.equal(long.text('statsTimelineLimit'), msg('statsTimelineLimitFmt', 365));
  assert.equal(long.chart('statsTimeline').args[1].filter(row => row.partial).length, 1);
});

test('lists are capped by what fits the card, and the tables behind them hold everything', async () => {
  const ui = await createPage(history(), { preferences: { scrapfly_stats_range: 90 } });
  assert.equal(ui.chart('statsTopDetectors').args[1].length, 8, 'the Overview ranking shows the top eight');
  assert.ok(ui.id('statsHardest').children.length <= 6);
  ui.section('protections');
  assert.equal(ui.rows('statsProtectionTable').length, 50);
  assert.equal(ui.text('statsProtectionCount'), 'Rows: 50 of 70');
  ui.id('statsProtectionMore').events.click();
  const names = ui.rows('statsProtectionTable').map(node => textOf(node));
  assert.equal(names.length, 70);
  assert.equal(new Set(names).size, 70, 'no row repeats and none is missing');
  assert.ok(names.every(name => name.startsWith('Protection')));
  assert.equal(ui.id('statsProtectionMore').hidden, true);
  assert.ok(ui.chart('statsStacks').args[1].length <= 20, 'common stacks are capped by the data layer');
  ui.section('domains');
  assert.equal(ui.rows('statsDomainTable').length, 50);
  ui.id('statsDomainMore').events.click();
  assert.equal(new Set(ui.rows('statsDomainTable').map(node => node.textContent)).size, 70);
});

test('a change of range or scope starts the lists again from their first rows', async () => {
  const ui = await createPage(history(), { preferences: { scrapfly_stats_range: 90, scrapfly_stats_section: 'protections' } });
  ui.id('statsProtectionMore').events.click();
  assert.equal(ui.rows('statsProtectionTable').length, 70);
  ui.days(30);
  assert.ok(ui.rows('statsProtectionTable').length <= 50);
  ui.days(90);
  assert.equal(ui.rows('statsProtectionTable').length, 50, 'back to the first page');
  ui.id('statsProtectionMore').events.click();
  ui.chip('captcha');
  assert.equal(ui.rows('statsProtectionTable').length, 50, 'a scope change resets the page too');
});

test('a live History shrink redraws every list with what is left, and the export source is never narrowed', async () => {
  const ui = await createPage(history(150, 150), { preferences: { scrapfly_stats_range: 0 } });
  assert.equal(ui.chart('statsTimeline').args[1].length, 150);
  ui.section('protections');
  ui.id('statsProtectionMore').events.click();
  assert.equal(ui.rows('statsProtectionTable').length, 100);
  await ui.storage({ scrapfly_history: {} }, { scrapfly_history: { items: history(2, 2) } });
  assert.equal(ui.rows('statsProtectionTable').length, 2);
  assert.equal(ui.id('statsProtectionMore').hidden, true);
  ui.section('overview');
  assert.equal(ui.chart('statsTimeline').args[1].length, 2);
  assert.equal(ui.chart('statsTopDetectors').args[1].length, 2);
  assert.equal(ui.text('kpiEntries'), '2');
  assert.ok(ui.writes.every(write => !Object.hasOwn(write, 'scrapfly_history')));
  const big = await createPage(history(90, 75), { preferences: { scrapfly_stats_range: 90 } });
  await big.button('export', 'json').events.click();
  assert.equal(big.downloads[0][1].length, 75, 'whatever was drawn, every entry is exported');
  assert.equal(big.downloads[0][2].days, 90);
});
