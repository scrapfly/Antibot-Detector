'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPage, entry, textOf, messages, NOW } = require('./stats-page-harness.js');

const plain = value => JSON.parse(JSON.stringify(value));
const msg = (key, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), messages[key].message);
/** The page's own helpers, taken from a loaded page. */
async function helpers(items = [entry('a.example', 0, [['Cloudflare', 'antibot']])]) {
  const page = await createPage(items);
  return { page, U: page.context.StatsUI, V: page.context.StatsViews, HistoryStats: require('vm').runInContext('HistoryStats', page.context) };
}

test('shares are Intl percentages with one decimal below 10%', async () => {
  const { U } = await helpers();
  assert.equal(U.share(0.5), '50%');
  assert.equal(U.share(0.086), '8.6%');
  assert.equal(U.share(0.004), '0.4%');
  assert.equal(U.share(1), '100%');
  assert.equal(U.share(0), '0%');
  assert.equal(U.share(NaN), '0%');
  assert.equal(U.percent(87.5), '87.5%');
  assert.equal(U.signed(3), '+3');
  assert.equal(U.signed(-2), '-2');
  assert.equal(U.signed(0), '0');
  assert.equal(U.days(30), '30 days');
  assert.equal(U.num(1234567), '1,234,567');
  assert.equal(U.confidence(null), messages.timeUnknown.message);
  assert.equal(U.list(['a', 'b', 'c']), 'a, b, and c');
});

test('comparison views are neutral: arrows and text, never a verdict', async () => {
  const { U, HistoryStats, page } = await helpers();
  const view = (cur, prev) => plain(U.deltaView(HistoryStats.delta(cur, prev), prev));
  assert.equal(U.deltaView(HistoryStats.delta(0, 0), 0), null);
  assert.deepEqual(view(5, 0), { kind: 'new', text: 'new', label: 'new', tip: msg('statsDeltaWasFmt', 0) });
  assert.deepEqual(view(104, 100), { kind: 'flat', text: '', label: messages.statsDeltaFlat.message, tip: msg('statsDeltaWasFmt', 100) });
  assert.deepEqual(view(12, 10), { kind: 'up', text: '20%', label: msg('statsDeltaUpFmt', '20%'), tip: msg('statsDeltaWasFmt', 10) });
  assert.deepEqual(view(60, 100), { kind: 'down', text: '40%', label: msg('statsDeltaDownFmt', '40%'), tip: msg('statsDeltaWasFmt', 100) });
  assert.deepEqual(view(7, 4), { kind: 'up', text: '+3', label: msg('statsDeltaUpFmt', 3), tip: msg('statsDeltaWasFmt', 4) });
  assert.deepEqual(view(1, 4), { kind: 'down', text: '-3', label: msg('statsDeltaDownFmt', 3), tip: msg('statsDeltaWasFmt', 4) });
  assert.equal(view(0, 5).kind, 'down');
  const badge = U.deltaBadge(U.deltaView(HistoryStats.delta(12, 10), 10));
  assert.equal(badge.className, 'stats-delta stats-delta--up');
  assert.equal(textOf(badge), '▲ 20%');
  assert.equal(badge.children[0].attributes['aria-hidden'], 'true', 'the arrow is decoration, the label carries the meaning');
  assert.equal(textOf(U.deltaBadge(U.deltaView(HistoryStats.delta(0, 5), 5))), '▼ -5', 'a protection that vanished: down by its previous pages');
  assert.equal(U.deltaBadge(null), null);
  const node = new page.context.Node('span');
  U.fillDelta(node, null);
  assert.equal(node.hidden, true);
  U.fillDelta(node, U.deltaView(HistoryStats.delta(12, 10), 10));
  assert.equal(node.hidden, false);
  assert.equal(node.className, 'stats-delta stats-delta--up');
});

test('dates and times: relative to now, a range that crosses a year names it', async () => {
  const { U, page } = await helpers();
  const now = NOW, at = (mins) => now + mins * 60000;
  assert.equal(U.relative(at(-0.2), now), 'now');
  assert.equal(U.relative(at(-5), now), '5 minutes ago');
  assert.equal(U.relative(at(28), now), 'in 28 minutes');
  assert.equal(U.relative(at(-180), now), '3 hours ago');
  assert.equal(U.relative(now - 86400000, now), 'yesterday');
  assert.equal(U.relative(now - 5 * 86400000, now), '5 days ago');
  assert.equal(U.daysAgo(new Date(2026, 9, 17, 0, 5).getTime(), new Date(2026, 9, 17, 23, 55).getTime()), 0);
  assert.equal(U.daysAgo(new Date(2026, 9, 16, 23, 55).getTime(), new Date(2026, 9, 17, 0, 5).getTime()), 1, 'ten minutes apart, but a calendar day');
  assert.equal(U.daysAgo(new Date(2026, 2, 28, 12).getTime(), new Date(2026, 2, 30, 12).getTime()), 2, 'a daylight-saving change does not shift the count');
  assert.equal(U.rangeText(new Date(2026, 8, 18).getTime(), new Date(2026, 9, 17).getTime()).replace(/[\u2009\u202f\u00a0]/g, ' '), 'Sep 18 – Oct 17');
  assert.match(U.rangeText(new Date(2025, 11, 20).getTime(), new Date(2026, 0, 18).getTime()), /2025.*2026/);
  assert.equal(U.dayLabel('2026-10-05'), 'Oct 5');
  assert.equal(U.dayLabel('2026-10-05', true), 'Oct 5, 2026');
  assert.equal(U.monthLabel('2026-10-05'), 'Oct');
  assert.equal(U.hourLabel(9), '9 AM');
  assert.equal(U.weekdayLabel(0), 'Sun');
  assert.equal(U.weekdayLabel(1, 'long'), 'Monday');
  assert.ok(page);
});

test('the Activity helpers place weekdays and weeks for the language first day of the week', async () => {
  const { V } = await helpers();
  const { weekStartOf, weeksOf } = V.activity;
  assert.ok(weekStartOf() >= 1 && weekStartOf() <= 7);
  const row = date => ({ date });
  const days = (from, count) => Array.from({ length: count }, (_, i) => { const d = new Date(from); d.setDate(d.getDate() + i); return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }; });
  // 2026-10-05 is a Monday
  assert.equal(weeksOf(days(new Date(2026, 9, 5, 12), 7), 1), 1);
  assert.equal(weeksOf(days(new Date(2026, 9, 5, 12), 8), 1), 2);
  assert.equal(weeksOf(days(new Date(2026, 9, 5, 12), 7), 7), 2, 'a Sunday-first week splits a Monday-to-Sunday span in two');
  assert.equal(weeksOf(days(new Date(2026, 9, 5, 12), 98), 1), 14, 'fourteen weeks is still the month layout');
  assert.equal(weeksOf(days(new Date(2026, 9, 6, 12), 98), 1), 15, 'one day later it is the year layout');
  assert.equal(weeksOf([], 1), 0);
  assert.ok(row);
});

test('tables: labelled cells, a left-to-right first column, row tones and the empty line', async () => {
  const { U, page } = await helpers();
  const host = page.id('statsSignalTable');
  const code = U.element('code', '', 'x');
  const table = U.table(host, { caption: 'Caption', ltrFirst: true,
    headers: ['Name', { text: 'Pages', num: true }, { text: 'Seen', nowrap: true, title: 'hint' }],
    rows: [['a.example', '5', 'today'], { tone: 'attention', cells: [code, 7, 'later'] }] });
  assert.equal(table.className, 'stats-table is-stack');
  assert.equal(table.children[0].tagName, 'caption');
  assert.equal(textOf(table.children[0]), 'Caption');
  const head = table.children[1].children[0].children;
  assert.deepEqual(plain(head.map(th => th.scope)), ['col', 'col', 'col']);
  assert.equal(head[1].className, 'is-num');
  assert.equal(head[2].attributes.title, 'hint');
  const rows = table.children[2].children;
  assert.equal(rows[0].children[0].tagName, 'th');
  assert.equal(rows[0].children[0].scope, 'row');
  assert.equal(rows[0].children[0].attributes.dir, 'ltr');
  assert.equal(rows[0].children[0].textContent, 'a.example');
  assert.equal(rows[0].children[1].attributes['data-label'], 'Pages');
  assert.equal(rows[0].children[1].className, 'is-num');
  assert.equal(rows[0].children[2].className, 'is-nowrap');
  assert.equal(rows[1].className, 'is-attention');
  assert.equal(rows[1].children[0].children[0], code, 'a Node cell is used as it is');
  assert.equal(rows[1].children[1].textContent, '7');
  const plainTable = U.table(host, { caption: 'c', headers: ['A'], rows: [['x']], stack: false });
  assert.equal(plainTable.className, 'stats-table');
  assert.equal(U.table(host, { caption: 'c', headers: ['A'], rows: [] }), null);
  assert.equal(host.children[0].className, 'stats-none stats-none--inline');
  assert.equal(textOf(host), messages.statsNoData.message);
  U.table(host, { caption: 'c', headers: ['A'], rows: [], empty: 'All good', ok: true });
  assert.equal(host.children[0].className, 'stats-none stats-none--inline stats-none--ok');
  assert.equal(host.children[0].textContent, 'All good');
});

test('a table is a keyboard region only while it scrolls', async () => {
  const { U, page } = await helpers();
  const host = page.id('statsSignalTable');
  Object.assign(host, { scrollWidth: 900, clientWidth: 600, scrollHeight: 100, clientHeight: 100 });
  U.table(host, { caption: 'Wide', headers: ['A'], rows: [['x']] });
  assert.equal(host.attributes.tabindex, '0');
  assert.equal(host.attributes.role, 'region');
  assert.equal(host.attributes['aria-label'], 'Wide');
  Object.assign(host, { scrollWidth: 600, clientWidth: 600, scrollHeight: 900, clientHeight: 680 });
  U.table(host, { caption: 'Tall', headers: ['A'], rows: [['x']] });
  assert.equal(host.attributes.role, 'region', 'vertical scrolling counts too');
  Object.assign(host, { scrollWidth: 600, clientWidth: 600, scrollHeight: 300, clientHeight: 680 });
  U.table(host, { caption: 'Short', headers: ['A'], rows: [['x']] });
  assert.equal(host.attributes.tabindex, undefined);
  assert.equal(host.attributes.role, undefined);
});

test('the footer under a table counts its rows and disappears with them', async () => {
  const { U, page } = await helpers();
  U.tableCount('statsSignal', 50, 120);
  assert.equal(page.text('statsSignalCount'), 'Rows: 50 of 120');
  assert.equal(page.id('statsSignalMore').hidden, false);
  assert.equal(page.id('statsSignalFooter').hidden, false);
  U.tableCount('statsSignal', 120, 120);
  assert.equal(page.id('statsSignalMore').hidden, true);
  U.tableCount('statsSignal', 0, 0);
  assert.equal(page.id('statsSignalFooter').hidden, true);
});

test('chips, pills, stacks and badges carry their meaning in text, not only in colour', async () => {
  const { U } = await helpers();
  const chip = U.chip('Cloudflare Bot Management', 'antibot');
  assert.equal(chip.attributes.title, 'Cloudflare Bot Management', 'the full name is the title when the label is cut');
  assert.equal(chip.style['--c'], 'var(--ink-antibot)');
  assert.equal(chip.children[0].attributes['aria-hidden'], 'true');
  assert.equal(chip.children[0].className, 'stats-chip-icon', 'without a known logo the category icon shows, not a bare dot');
  assert.match(chip.children[0].innerHTML, /^<svg /, 'the category icon is filled in');
  // When the protection's logo is known it shows instead of the category icon
  U.setBrandIcons({ 'cloudflare bot management': 'cloudflare_official.png' });
  const branded = U.chip('Cloudflare Bot Management', 'antibot');
  assert.equal(branded.children[0].className, 'stats-brand', 'a known logo renders the brand mark');
  assert.match(branded.children[0].innerHTML, /cloudflare_official\.png/, 'the logo file is used');
  assert.equal(U.chip('Some Unlisted Protection', 'captcha').children[0].className, 'stats-chip-icon', 'an unknown protection falls back to the category icon');
  U.setBrandIcons({});
  assert.equal(chip.children[1].textContent, 'Cloudflare Bot Management');
  assert.equal(U.chip('x', null, true).className, 'stats-chip stats-chip--muted');
  assert.equal(U.pill('High').className, 'stats-pill stats-pill--high');
  assert.equal(U.pill('High').textContent, 'High');
  assert.equal(U.pill('None').textContent, 'No protection');
  const stack = U.stack({ stack: [{ name: 'A', category: 'antibot' }, { name: 'B', category: 'captcha' }, { name: 'C', category: 'antibot' }, { name: 'D', category: 'antibot' }], stackTotal: 6 });
  assert.equal(stack.children.length, 4, 'three chips and the rest');
  assert.equal(stack.children[3].textContent, '+3 more');
  assert.equal(stack.children[3].attributes.title, 'D', 'the "+N more" chip names the protections it hides');
  assert.equal(U.stack({ stack: [{ name: 'A', category: 'antibot' }], stackTotal: 1 }).children.length, 1);
  const badge = U.categoryBadge('captcha');
  assert.equal(badge.style['--c'], 'var(--ink-captcha)');
  assert.equal(textOf(badge), 'Captcha');
  assert.equal(textOf(U.methodBadge('cookie')), 'Cookies');
  assert.equal(U.ink('unknown'), 'var(--ink-other)');
  assert.equal(U.ink('fingerprint'), 'var(--ink-fingerprint)');
  assert.equal(U.mixInk(), '#8b5cf6');
  assert.equal(U.activeCategories(new Set(['antibot', 'captcha', 'other']), { other: 0 }).join(), 'antibot,captcha');
  assert.equal(U.activeCategories(new Set(['antibot', 'captcha', 'other']), { other: 2 }).join(), 'antibot,captcha,other');
  assert.equal(U.activeCategories(new Set(['fingerprint', 'antibot']), { other: 0 }).join(), 'antibot,fingerprint', 'drawing order: anti-bot first, fingerprint last');
});

test('databars and tooltip rows are bounded and safe', async () => {
  const { U } = await helpers();
  const bar = U.databar(30, 60, 'var(--ink-antibot)');
  assert.equal(bar.children[0].textContent, '30');
  assert.equal(bar.children[1].children[0].style['--w'], '50.00%');
  assert.equal(bar.children[1].children[0].style['--bar'], 'var(--ink-antibot)');
  assert.equal(U.databar(90, 60).children[1].children[0].style['--w'], '100.00%');
  assert.equal(U.databar(5, 0).children[1].children[0].style['--w'], '0.00%');
  const node = U.element('div');
  U.setTip(node, 'Title', 'Detail', [{ label: 'A', value: '1' }, null, { label: 'B', value: '2' }]);
  assert.equal(node.attributes['data-tip'], 'Title');
  assert.equal(node.attributes['data-tip-detail'], 'Detail');
  assert.equal(JSON.parse(node.attributes['data-tip-rows']).length, 2, 'empty rows are dropped');
  U.setTip(node, 'Title', '', []);
  assert.equal(node.attributes['data-tip-detail'], undefined);
  assert.equal(node.attributes['data-tip-rows'], undefined);
  assert.equal(node.tabIndex, 0);
});

test('an unknown category shows its own chip and is stacked after the others', async () => {
  const items = [entry('a.example', 0, [['Cloudflare', 'antibot', 100], ['Mystery Shield', 'something-else', 100]]), entry('b.example', 1, [['hCaptcha', 'captcha', 90]])];
  const page = await createPage(items);
  assert.equal(page.button('category', 'other').hidden, false, 'a category nobody named still appears once something is found in it');
  assert.equal(page.text('scopeCountOther'), '1');
  assert.deepEqual(plain(page.chart('statsTimeline').args[2].series.map(s => s.key)), ['antibot', 'captcha', 'other']);
  assert.match(page.text('statsContext'), /Anti-bot, Captcha, and Other$/);
  page.chip('other');
  assert.equal(page.button('category', 'other').attributes['aria-pressed'], 'false');
  assert.deepEqual(plain(page.chart('statsTimeline').args[2].series.map(s => s.key)), ['antibot', 'captcha']);
  assert.ok(!/Mystery/.test(Array.from(page.chart('statsTopDetectors').args[1], row => row.label).join(' ')));
});
