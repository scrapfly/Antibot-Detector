'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPage, entry, textOf, flatten } = require('./stats-page-harness.js');

// Defects an independent QA pass found on the rebuilt page, kept as regressions.

const domainRows = () => Array.from({ length: 70 }, (_, i) => {
  const host = `domain${String(i).padStart(2, '0')}.example`;
  return entry(host, 0, i < 10 ? [['hCaptcha', 'captcha']] : i < 40 ? [['Cloudflare', 'antibot']] : []);
});

test('opening a site from the Overview clears stale Domains filters, so the site is found', async () => {
  const ui = await createPage(domainRows());
  ui.section('domains');
  ui.click('difficulty', 'Medium');
  assert.equal(ui.rows('statsDomainTable').length, 30, 'only the Medium domains show');
  ui.section('overview');
  const rows = ui.id('statsHardest').children;
  rows[0].events.click();
  assert.equal(ui.id('statsDomainSearch').value, textOf(rows[0].children[0]));
  assert.equal(ui.rows('statsDomainTable').length, 1, 'the clicked site shows although the Medium chip was on');
  assert.equal(ui.button('difficulty', 'Medium').attributes['aria-pressed'], 'false');
});

test('a hardest-site row opens its domain with Enter and with Space, and is announced as a link', async () => {
  const ui = await createPage(domainRows());
  const rows = ui.id('statsHardest').children;
  assert.equal(rows[0].attributes.role, 'link');
  ui.key(rows[0], ' ');
  assert.deepEqual(ui.visiblePanel(), ['domains']);
  ui.section('overview');
  ui.key(ui.id('statsHardest').children[0], 'Enter');
  assert.deepEqual(ui.visiblePanel(), ['domains']);
});

test('headline names follow their own direction, so a Latin name keeps its start in Arabic', async () => {
  const ui = await createPage(domainRows());
  assert.equal(ui.id('headlineTopName').attributes.dir, 'auto');
});

test('"Show more" and "Clear" that hide themselves hand the keyboard to the search field, not to the body', async () => {
  const ui = await createPage(domainRows(), { preferences: { scrapfly_stats_section: 'domains' } });
  const search = ui.id('statsDomainSearch');
  assert.notEqual(search.focused, true);
  ui.id('statsDomainMore').events.click();
  assert.equal(ui.id('statsDomainMore').hidden, true);
  assert.equal(search.focused, true);
  search.focused = false;
  search.value = 'domain69';
  search.events.input();
  ui.id('statsDomainClear').events.click();
  assert.equal(search.focused, true);
});

test('"Biggest change" is offered only when there is a previous period to compare with', async () => {
  const items = Array.from({ length: 6 }, (_, i) => entry('a' + i + '.example', i * 12, [['Cloudflare', 'antibot', 90]]));
  const ui = await createPage(items, { preferences: { scrapfly_stats_section: 'protections', scrapfly_stats_range: 0 } });
  const option = () => ui.id('statsProtectionSort').querySelector('option[value="change"]');
  assert.equal(option().disabled, true, 'the All range has no previous period');
  ui.days(30);
  assert.equal(option().disabled, false);
});

test('the Activity tab says when the All range shows only the latest year', async () => {
  const items = [entry('old.example', 500, [['Cloudflare', 'antibot', 90]]), entry('new.example', 1, [['Cloudflare', 'antibot', 90]])];
  const ui = await createPage(items, { preferences: { scrapfly_stats_section: 'activity', scrapfly_stats_range: 0 } });
  assert.equal(ui.id('statsActivityLimit').hidden, false);
  assert.match(ui.text('statsActivityLimit'), /latest 365 days/);
  ui.days(30);
  assert.equal(ui.id('statsActivityLimit').hidden, true);
});

test('with a range selected but no full previous period, the changes card says so instead of asking for a range', async () => {
  const ui = await createPage([entry('a.example', 0, [['Cloudflare', 'antibot', 90]])], { preferences: { scrapfly_stats_range: 30 } });
  assert.match(ui.text('changedMoving'), /No full previous period yet/);
  ui.days(0);
  assert.match(ui.text('changedMoving'), /Choose 7, 30 or 90 days/);
});

test('the counts read the same for one item and for many: label first, number after', async () => {
  const ui = await createPage([entry('a.example', 0, [['Cloudflare', 'antibot', 90]])], { preferences: { scrapfly_stats_section: 'domains' } });
  assert.equal(ui.text('statsDomainCount'), 'Rows: 1 of 1');
  assert.match(ui.text('statsExportScope'), /Entries: 1/);
});

test('the Show chips carry the anti-bot, CAPTCHA and fingerprint icons instead of a dot', async () => {
  const ui = await createPage(domainRows());
  for (const key of ['antibot', 'captcha', 'fingerprint']) {
    const chip = ui.button('category', key);
    const nodes = flatten(chip);
    assert.equal(nodes.some(node => node.classes.has('stats-dot')), false, key + ' chip has no dot');
    const icon = nodes.find(node => node.dataset.categoryIcon === key);
    assert.ok(icon, key + ' chip has an icon slot');
    assert.match(icon.innerHTML, /^<svg /, key + ' icon is filled in');
  }
});
