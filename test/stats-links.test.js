'use strict';
// Statistics: a protection's name shows the domains that have it, a host name opens that site's History.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPage, entry, flatten, textOf, messages } = require('./stats-page-harness.js');

const plain = value => JSON.parse(JSON.stringify(value));
const root = path.join(__dirname, '..');
const pages = () => [
  entry('shop.example', 0, [['Cloudflare Bot Management', 'antibot', 100], ['Turnstile', 'captcha', 90]]),
  entry('news.example', 1, [['Turnstile', 'captcha', 90]]),
  entry('plain.example', 2, [['Kasada', 'antibot', 80]])
];
const withTabs = (ui) => {
  const created = [];
  ui.context.chrome.runtime = { getURL: (p) => `chrome-extension://abc/${p}` };
  ui.context.chrome.tabs = { create: async (options) => { created.push(plain(options)); return { id: 1 }; } };
  return created;
};
const buttons = (ui, id, cls) => flatten(ui.id(id)).filter(node => node.tagName === 'button' && node.classes.has(cls));

test('a protection of the Protections table is a button: it shows the domains that have it', async () => {
  const ui = await createPage(pages(), { preferences: { scrapfly_stats_section: 'protections' } });
  const links = buttons(ui, 'statsProtectionTable', 'stats-cell-link');
  assert.deepEqual(plain(links.map(node => textOf(node)).sort()), ['Cloudflare Bot Management', 'Kasada', 'Turnstile']);
  const turnstile = links.find(node => textOf(node) === 'Turnstile');
  assert.equal(turnstile.attributes.title, 'Show the domains with Turnstile');
  assert.equal(turnstile.type, 'button');
  turnstile.events.click();
  assert.deepEqual(ui.visiblePanel(), ['domains']);
  assert.equal(ui.id('statsDomainSearch').value, 'Turnstile');
  assert.deepEqual(plain(ui.rows('statsDomainTable').map(n => textOf(n)).sort()), ['news.example', 'shop.example']);
});

test('clicking a protection clears a stale chip, so the domains that have it all show', async () => {
  const ui = await createPage(pages(), { preferences: { scrapfly_stats_section: 'domains' } });
  ui.click('flag', 'captcha'); // a flag that would hide the Kasada domain
  assert.equal(ui.rows('statsDomainTable').every(n => /shop|news/.test(textOf(n))), true);
  ui.section('protections');
  buttons(ui, 'statsProtectionTable', 'stats-cell-link').find(node => textOf(node) === 'Kasada').events.click();
  assert.deepEqual(plain(ui.rows('statsDomainTable').map(n => textOf(n))), ['plain.example']);
});

test('a host name of the Domains table opens that site in History, in a new tab', async () => {
  const ui = await createPage(pages(), { preferences: { scrapfly_stats_section: 'domains' } });
  const created = withTabs(ui);
  const links = buttons(ui, 'statsDomainTable', 'stats-link-btn');
  assert.deepEqual(plain(links.map(node => textOf(node)).sort()), ['news.example', 'plain.example', 'shop.example']);
  const shop = links.find(node => textOf(node) === 'shop.example');
  assert.equal(shop.attributes.title, 'Open shop.example in History');
  assert.equal(shop.attributes.dir, 'ltr');
  shop.events.click();
  await ui.settle();
  assert.deepEqual(created, [{ url: 'chrome-extension://abc/popup.html?tab=history&search=shop.example', active: true }]);
});

test('the address is encoded, so a host cannot add a parameter of its own', async () => {
  const ui = await createPage([entry('evil.example&settings=data', 0, [['Kasada', 'antibot', 80]])], { preferences: { scrapfly_stats_section: 'domains' } });
  const created = withTabs(ui);
  buttons(ui, 'statsDomainTable', 'stats-link-btn')[0].events.click();
  await ui.settle();
  assert.equal(created.length, 1);
  assert.equal(created[0].url, 'chrome-extension://abc/popup.html?tab=history&search=evil.example%26settings%3Ddata');
});

test('the Protection changes table links its host names too, and a failing tab open is swallowed', async () => {
  const items = [entry('moved.example', 5, [['Cloudflare', 'antibot']]), entry('moved.example', 1, [['hCaptcha', 'captcha']])];
  const ui = await createPage(items, { preferences: { scrapfly_stats_section: 'domains' } });
  const links = buttons(ui, 'statsChangeTable', 'stats-link-btn');
  assert.equal(links.length, 1);
  ui.context.chrome.runtime = { getURL: (p) => p };
  ui.context.chrome.tabs = { create: async () => { throw new Error('no window'); } };
  assert.doesNotThrow(() => links[0].events.click());
  await ui.settle();
});

test('both strings exist in English, and the style gives a keyboard focus the same cue as a hover', () => {
  assert.equal(messages.statsShowDomainsWithFmt.message, 'Show the domains with {0}');
  assert.equal(messages.statsOpenInHistoryFmt.message, 'Open {0} in History');
  const css = fs.readFileSync(path.join(root, 'sections/stats/stats.css'), 'utf8');
  assert.ok(/\.stats-cell-link:hover \.stats-stack, \.stats-cell-link:focus-visible \.stats-stack/.test(css));
});

test('a protection click lists exactly the domains that have it, not a site or a rule whose name contains it', async () => {
  const list = [
    entry('datadome.co', 0, [['Cloudflare Bot Management', 'antibot', 100]]),
    entry('shop.example', 1, [['DataDome', 'antibot', 100]]),
    entry('other.example', 2, [['DataDome Captcha', 'captcha', 90]])
  ];
  const ui = await createPage(list, { preferences: { scrapfly_stats_section: 'protections' } });
  const link = buttons(ui, 'statsProtectionTable', 'stats-cell-link').find(node => textOf(node) === 'DataDome');
  link.events.click();
  assert.deepEqual(plain(ui.rows('statsDomainTable').map(n => textOf(n))), ['shop.example'], 'the text search would also list datadome.co and the DataDome Captcha site');
});

test('host names stay on a printed page; the page-control links do not', () => {
  const css = fs.readFileSync(path.join(root, 'sections/stats/stats.css'), 'utf8');
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /\.stats-link-btn:not\(\.stats-host-link\)/);
  assert.doesNotMatch(print.split('}')[0] + print, /[,\s]\.stats-link-btn,/, 'no rule hides every link button');
  assert.match(fs.readFileSync(path.join(root, 'sections/stats/stats-protections.js'), 'utf8'), /'stats-link-btn stats-host-link'/);
});

