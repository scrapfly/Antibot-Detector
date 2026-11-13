'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPage, entry, textOf, flatten } = require('./stats-page-harness.js');

// Statistics → Site: one site's report, opened from the page address (History → ⋯ → Site report), Domains and Hardest sites.

const plain = value => JSON.parse(JSON.stringify(value));
const rowOf = th => th.parentNode;
const cells = row => row.children.map(textOf);
const secret = { matches: [{ type: 'cookie', name: 'datadome', value: 'SECRET-COOKIE' }] };

/** shop.example under two spellings, over 60 days, plus another site. */
function history() {
  return [
    entry('shop.example', 60, [['DataDome', 'antibot', 70]], { url: 'https://shop.example/cart?token=SECRET-QUERY', httpStatus: 200, note: 'SECRET-NOTE' }),
    entry('www.shop.example', 20, [['DataDome', 'antibot', 95], ['hCaptcha', 'captcha', 80]], { url: 'https://www.shop.example/cart', httpStatus: 403 }),
    entry('shop.example', 2, [['DataDome', 'antibot', 90], ['Canvas Fingerprint', 'fingerprint', 30]], { url: 'https://shop.example/login',
      changed: { added: ['DataDome'], removed: ['Kasada'] } }),
    entry('other.example', 1, [['Cloudflare', 'antibot', 90]])
  ].map(item => ({ ...item, detections: item.detections.map(d => ({ ...d, ...secret })) }));
}

test('the page address opens a site\'s report: www and the bare host together, whatever the date range', async () => {
  const ui = await createPage(history(), { search: '?site=www.shop.example' });
  assert.deepEqual(ui.visiblePanel(), ['site']);
  assert.equal(ui.id('stats-tab-site').hidden, false);
  assert.equal(ui.button('section', 'site').attributes['aria-selected'], 'true');
  assert.equal(ui.text('statsSiteHost'), 'shop.example');
  assert.equal(ui.id('statsSiteHost').attributes.dir, 'ltr');
  assert.match(ui.text('statsSiteSummary'), /^Pages: 2 · Scans: 3 · /, 'the 60-day-old scan counts although the range is 30 days');
  assert.equal(ui.text('statsSiteAlso'), 'Also saved as: www.shop.example');
  assert.equal(ui.id('statsSiteEmpty').hidden, true);
  assert.equal(ui.text('statsContext'), '', 'no range line: the report is not limited to the range');
  assert.ok(!ui.writes.some(write => write.scrapfly_stats_section === 'site'), 'a site is never saved as the tab to reopen');
});

test('the protections table: first and last seen, pages, scans and the confidence range, in the category scope', async () => {
  const ui = await createPage(history(), { search: '?site=shop.example' });
  const rows = ui.rows('statsSiteProtectionTable').map(th => cells(rowOf(th)));
  assert.deepEqual(rows.map(row => row[0]), ['DataDome', 'hCaptcha'], 'fingerprinting is hidden by the default scope');
  const [name, category, first, last, pages, scans, confidence] = rows[0];
  assert.equal(name, 'DataDome');
  assert.match(category, /Anti-bot/);
  assert.notEqual(first, last);
  assert.equal(pages, '2');
  assert.equal(scans, '3');
  assert.equal(confidence, '70% – 95%');
  ui.chip('fingerprint');
  assert.ok(ui.rows('statsSiteProtectionTable').some(th => textOf(th) === 'Canvas Fingerprint'), 'a chip turned on adds its category');
});

test('the timeline: protection by scan, oldest first, a mark per scan that found it, and its words for screen readers', async () => {
  const ui = await createPage(history(), { search: '?site=shop.example' });
  const table = flatten(ui.id('statsSiteTimeline')).find(node => node.tagName === 'table');
  assert.ok(table, 'a table: its columns follow the writing direction');
  const head = flatten(table).filter(node => node.tagName === 'th' && node.scope === 'col');
  assert.equal(head.length, 4, 'the corner and three scans');
  assert.match(head[1].attributes.title, /\/cart · HTTP status: 200$/, 'the oldest scan first, with its page and status');
  assert.match(head[3].attributes.title, /\/login$/);
  const dd = ui.rows('statsSiteTimeline').find(th => textOf(th) === 'DataDome');
  const marks = rowOf(dd).children.slice(1).map(td => td.classes.has('is-on'));
  assert.deepEqual(marks, [true, true, true]);
  const hc = ui.rows('statsSiteTimeline').find(th => textOf(th) === 'hCaptcha');
  const tds = rowOf(hc).children.slice(1);
  assert.deepEqual(tds.map(td => td.classes.has('is-on')), [false, true, false]);
  assert.match(tds[0].attributes.title, /^hCaptcha, .+: not found$/);
  assert.match(tds[1].attributes.title, /^hCaptcha, .+: 80%$/);
  assert.ok(flatten(tds[1]).some(node => node.classes.has('stats-sr-only') && /80%/.test(node.textContent)), 'read out, not only hovered');
  assert.equal(ui.id('statsSiteTimelineLimit').hidden, true);
  assert.equal(ui.id('statsSiteTimeline').attributes.role, 'region');
});

test('a big History: the timeline shows the latest 30 scans and says so; the table still counts every scan', async () => {
  const items = Array.from({ length: 40 }, (_, i) => entry('shop.example', 40 - i, [['DataDome', 'antibot', 90]], { url: `https://shop.example/p${i}` }));
  const ui = await createPage(items, { search: '?site=shop.example' });
  const head = flatten(ui.id('statsSiteTimeline')).filter(node => node.tagName === 'th' && node.scope === 'col');
  assert.equal(head.length, 31);
  assert.equal(ui.text('statsSiteTimelineLimit'), 'Showing the latest 30 of 40 scans.');
  assert.equal(ui.id('statsSiteTimelineLimit').hidden, false);
  assert.equal(cells(rowOf(ui.rows('statsSiteProtectionTable')[0]))[5], '40');
});

test('the timeline opens on its newest scans, at the end of the row in either direction', async () => {
  for (const [dir, expected] of [['ltr', 900], ['rtl', -900]]) {
    const ui = await createPage(history(), { search: '?site=shop.example', dir });
    ui.id('statsSiteTimeline').scrollWidth = 900;
    ui.section('overview');
    ui.section('site');
    assert.equal(ui.id('statsSiteTimeline').scrollLeft, expected, dir);
  }
});

test('HTTP statuses with their tone, and the scans saved without one', async () => {
  const ui = await createPage(history(), { search: '?site=shop.example' });
  const rows = ui.rows('statsSiteStatusTable');
  assert.deepEqual(rows.map(textOf), ['200', '403']);
  assert.ok(flatten(rows[1]).some(node => node.classes.has('is-warn')), 'a 4xx is amber');
  assert.equal(ui.text('statsSiteStatusUnknown'), 'Scans without a known status: 1');
  assert.equal(ui.id('statsSiteStatusUnknown').hidden, false);
});

test('changed pages list what was added and removed; a page and "Show in History" open History narrowed to it', async () => {
  const ui = await createPage(history(), { search: '?site=shop.example' });
  const rows = ui.rows('statsSiteChangeTable');
  assert.equal(rows.length, 1);
  assert.match(textOf(rowOf(rows[0])), /\+ Added: DataDome/);
  assert.match(textOf(rowOf(rows[0])), /− Removed: Kasada/);
  const link = flatten(rows[0]).find(node => node.tagName === 'button');
  assert.equal(textOf(link), '/login');
  link.events.click();
  ui.id('statsSiteHistory').events.click();
  assert.deepEqual(ui.opened, ['chrome-extension://test/popup.html?tab=history&search=shop.example%2Flogin', 'chrome-extension://test/popup.html?tab=history&search=shop.example']);
  assert.equal(ui.id('statsSiteChangeFooter').hidden, false);
  assert.equal(ui.id('statsSiteChangeMore').hidden, true);
});

test('many changed pages: 20 first, then Show more', async () => {
  const items = Array.from({ length: 25 }, (_, i) => entry('shop.example', i, [['DataDome', 'antibot']], { url: `https://shop.example/p${i}`, changed: { added: ['DataDome'], removed: [] } }));
  const ui = await createPage(items, { search: '?site=shop.example' });
  assert.equal(ui.rows('statsSiteChangeTable').length, 20);
  assert.equal(ui.text('statsSiteChangeCount'), 'Rows: 20 of 25');
  ui.id('statsSiteChangeMore').events.click();
  assert.equal(ui.rows('statsSiteChangeTable').length, 25);
});

test('exports: Markdown and JSON of every category, named after the site, with no cookie, query or note', async () => {
  const ui = await createPage(history(), { search: '?site=shop.example' });
  assert.equal(ui.id('statsSiteExportMd').disabled, false);
  await ui.id('statsSiteExportMd').events.click();
  await ui.id('statsSiteExportJson').events.click();
  assert.equal(ui.saves.length, 2);
  const [[md, mdName, mdFormat], [json, jsonName, jsonFormat]] = ui.saves;
  assert.match(mdName, /^scrapfly-site-report-shop\.example-\d{4}-\d{2}-\d{2}\.md$/);
  assert.equal(mdFormat, 'md');
  assert.match(jsonName, /\.json$/);
  assert.equal(jsonFormat, 'json');
  assert.ok(md.startsWith('# Site report: shop.example'));
  assert.match(md, /Canvas Fingerprint/, 'exports hold every category, whatever the chips show');
  const data = JSON.parse(json);
  assert.equal(data.site, 'shop.example');
  assert.equal(data.scans, 3);
  for (const text of [md, json]) for (const word of ['SECRET', 'datadome']) assert.ok(!text.includes(word), word);
  assert.match(ui.text('statsStatus'), /Download started: scrapfly-site-report-shop\.example-/);
});

test('a failed or canceled export says so', async () => {
  const failing = await createPage(history(), { search: '?site=shop.example', save: async () => { throw new Error('nope'); } });
  await failing.id('statsSiteExportJson').events.click();
  assert.equal(failing.text('statsStatus'), 'Could not export the data. Please try again.');
  assert.equal(failing.id('statsSiteExportJson').disabled, false, 'the button is back');
  const canceled = await createPage(history(), { search: '?site=shop.example', save: async () => { throw Object.assign(new Error('USER_CANCELED'), { canceled: true }); } });
  await canceled.id('statsSiteExportMd').events.click();
  assert.equal(canceled.text('statsStatus'), 'Export canceled');
});

test('a site History has no scan of: the report says so and offers nothing to export', async () => {
  const ui = await createPage(history(), { search: '?site=nothing.example' });
  assert.deepEqual(ui.visiblePanel(), ['site']);
  assert.equal(ui.text('statsSiteEmpty'), 'No saved scans of nothing.example.');
  assert.equal(ui.id('statsSiteEmpty').hidden, false);
  assert.equal(ui.id('statsSiteExportMd').disabled, true);
  assert.equal(ui.id('statsSiteExportJson').disabled, true);
  assert.ok(ui.all.filter(node => node.dataset.sitePart !== undefined).every(node => node.hidden));
});

test('no site, or an address that is not one: no Site tab, and asking for it opens the Overview', async () => {
  for (const search of ['', '?site=', '?site=%20%20', '?other=shop.example']) {
    const ui = await createPage(history(), { search });
    assert.equal(ui.id('stats-tab-site').hidden, true, search);
    assert.deepEqual(ui.visiblePanel(), ['overview'], search);
    ui.section('site');
    assert.deepEqual(ui.visiblePanel(), ['overview'], search);
  }
});

test('Domains: each row has a Site report button that opens that site; the host name still opens History', async () => {
  const ui = await createPage(history(), { preferences: { scrapfly_stats_section: 'domains' } });
  const row = rowOf(ui.rows('statsDomainTable').find(th => /^www\.shop\.example/.test(textOf(th))));
  flatten(row).find(node => node.classes.has('stats-host-link')).events.click();
  assert.deepEqual(ui.opened, ['chrome-extension://test/popup.html?tab=history&search=www.shop.example']);
  const button = flatten(row).find(node => node.classes.has('stats-row-btn'));
  assert.equal(button.attributes['aria-label'], 'Site report: www.shop.example');
  button.events.click();
  assert.deepEqual(ui.visiblePanel(), ['site']);
  assert.equal(ui.text('statsSiteHost'), 'shop.example', 'www opens the one site');
  assert.ok(!ui.writes.some(write => write.scrapfly_stats_section === 'site'), 'the saved tab stays Domains');
});

test('the report follows History: a new scan saved while the page is open shows up', async () => {
  const items = history();
  const ui = await createPage(items, { search: '?site=shop.example' });
  assert.match(ui.text('statsSiteSummary'), /Scans: 3/);
  const next = [...items, entry('shop.example', 0, [['Akamai', 'antibot', 90]], { url: 'https://shop.example/', httpStatus: 503 })];
  await ui.storage({ scrapfly_history: {} }, { scrapfly_history: JSON.stringify({ items: next }) });
  assert.match(ui.text('statsSiteSummary'), /Scans: 4/);
  assert.ok(ui.rows('statsSiteProtectionTable').some(th => textOf(th) === 'Akamai'));
  assert.ok(flatten(ui.id('statsSiteStatusTable')).some(node => node.classes.has('is-error')), 'a 5xx is red');
});

test('an empty History: the empty state, as on every other tab', async () => {
  const ui = await createPage([], { search: '?site=shop.example' });
  assert.equal(ui.id('statsContent').hidden, true);
  assert.equal(ui.id('statsEmpty').hidden, false);
  assert.equal(ui.text('statsEmptyTitle'), 'No history yet');
  assert.deepEqual(plain(ui.saves), []);
});
