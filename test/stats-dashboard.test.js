'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPage, entry, flatten, textOf, messages, NOW, html, read } = require('./stats-page-harness.js');

/** Cross-realm values (the page runs in a vm) compare by their JSON form. */
const plain = value => JSON.parse(JSON.stringify(value));
const msg = (key, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), messages[key].message);
const labels = call => Array.from(call.args[1], row => row.label);
const fingerprintMatches = [{ type: 'js_hooks', target: 'HTMLCanvasElement.toDataURL', confidence: 30 }];

const basic = () => [
  entry('alpha.example', 0, [['Cloudflare', 'antibot', 50]]),
  entry('beta.example', 0, [['Canvas', 'fingerprint', 30]]),
  entry('old.example', 40, [])
];
/** Protections and fingerprinting on a handful of domains, so the scope has something to hide. */
const mixed = () => [
  entry('shop.example', 0, [['Cloudflare Bot Management', 'antibot', 100], ['Canvas Fingerprint', 'fingerprint', 30]]),
  entry('shop.example', 1, [['Cloudflare Bot Management', 'antibot', 100], ['Canvas Fingerprint', 'fingerprint', 30]]),
  entry('news.example', 1, [['Turnstile', 'captcha', 90], ['Audio Fingerprint', 'fingerprint', 20]]),
  entry('fp-only.example', 2, [['Navigator Fingerprint', 'fingerprint', 25]])
].map(item => ({ ...item, detections: item.detections.map(d => d.category === 'fingerprint' ? { ...d, matches: fingerprintMatches } : d) }));

test('standalone load graph has existing unique scripts in dependency order', () => {
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(scripts).size, scripts.length);
  scripts.forEach(src => assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'sections/stats', src)), src));
  const at = name => scripts.indexOf(name);
  for (const dependency of ['history-stats.js', 'rule-stats.js', 'tools-stats.js', 'stats-charts.js', 'stats-export.js', 'stats-ui.js', '../../modules/core/storage-manager.js', '../../modules/core/i18n.js', '../../utils/format-utils.js']) {
    assert.ok(at(dependency) >= 0 && at(dependency) < at('stats.js'), dependency);
  }
  for (const view of ['overview', 'protections', 'evidence', 'activity', 'rules']) {
    assert.ok(at('stats-ui.js') < at(`stats-${view}.js`) && at(`stats-${view}.js`) < at('stats.js'), view);
    assert.ok(at('history-stats.js') < at(`stats-${view}.js`) && at('stats-charts.js') < at(`stats-${view}.js`), view);
  }
  assert.ok(at('../../modules/core/logger.js') < at('../../modules/core/storage-manager.js'));
  assert.ok(at('history-stats.js') < at('stats-export.js'));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('every id the page scripts name literally exists in stats.html', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const missing = [];
  for (const file of fs.readdirSync(path.join(__dirname, '../sections/stats')).filter(f => /^stats(-(ui|overview|protections|evidence|activity|rules))?\.js$/.test(f))) {
    const code = read('sections/stats/' + file);
    for (const m of code.matchAll(/(?:byId|setText)\('([A-Za-z][\w-]*)'(?=\s*[),])/g)) if (!ids.has(m[1])) missing.push(file + ': ' + m[1]);
  }
  assert.deepEqual(missing, []);
  // The ids built from a prefix: headline{Top,Hardest,Newest,Riser}{,Dot,Name,Delta,Sub} and the scope counts
  for (const name of ['Top', 'Hardest', 'Newest', 'Riser']) for (const part of ['', 'Dot', 'Name', 'Delta', 'Sub']) assert.ok(ids.has('headline' + name + part), 'headline' + name + part);
  for (const key of ['Antibot', 'Captcha', 'Fingerprint', 'Other']) assert.ok(ids.has('scopeCount' + key));
  for (const prefix of ['statsProtection', 'statsDomain', 'statsChange', 'statsSignal', 'statsCombination', 'statsUnused', 'statsMissing', 'statsCapture']) {
    for (const part of ['Count', 'More', 'Footer']) assert.ok(ids.has(prefix + part), prefix + part);
  }
});

test('the page reads history without writing and a fingerprint-only page still counts as a page', async () => {
  const ui = await createPage(basic());
  assert.equal(ui.text('kpiEntries'), '2');
  assert.equal(ui.text('kpiDomains'), '2');
  assert.equal(ui.text('kpiDetectors'), '1', 'only Cloudflare is in the default scope');
  assert.equal(ui.id('statsContent').hidden, false);
  assert.equal(ui.id('statsSkeleton').hidden, true);
  assert.equal(ui.id('statsMain').attributes['aria-busy'], undefined);
  assert.equal(ui.writes.length, 0);
  assert.equal(typeof ui.stored.scrapfly_history, 'string');
  assert.deepEqual(plain(ui.chartCalls.map(call => call.key)).filter((key, i, all) => all.indexOf(key) === i).sort(), ['rank', 'segments', 'sparkline', 'stacked']);
  assert.equal(ui.chartCalls.filter(call => call.key === 'sparkline').length, 4);
});

test('the default scope hides fingerprint techniques everywhere, and the chip shows them and remembers it', async () => {
  const ui = await createPage(mixed());
  const everywhere = () => {
    const rank = labels(ui.chart('statsTopDetectors'));
    const protections = (ui.section('protections'), ui.text('statsProtectionTable'));
    const stacks = ui.chart('statsStacks').args[1].map(row => row.label).join(' ');
    const domains = (ui.section('domains'), ui.text('statsDomainTable') + ' ' + ui.text('statsChangeTable'));
    ui.section('evidence'); ui.click('sub', 'signals');
    const signals = ui.text('statsSignalTable');
    ui.click('sub', 'confidence');
    const unconfirmed = JSON.stringify(plain(ui.chart('statsUnconfirmed') ? ui.chart('statsUnconfirmed').args[1] : []));
    ui.section('overview');
    return { rank: rank.join(' '), protections, stacks, domains, signals, unconfirmed };
  };
  const hidden = everywhere();
  assert.ok(!/Fingerprint|toDataURL/.test(JSON.stringify(hidden)), JSON.stringify(hidden));
  assert.match(hidden.rank, /Cloudflare Bot Management/);
  assert.equal(ui.text('kpiEntries'), '4', 'the fingerprint-only page is still a page');
  assert.equal(ui.id('statsScopeNote').hidden, false);
  assert.match(ui.text('statsScopeNoteText'), /Fingerprinting detections hidden: 4 \(57% of all\)/);
  assert.equal(ui.text('scopeCountFingerprint'), '4', 'chip counts are never scoped');
  assert.equal(ui.id('statsFingerprintCard').hidden, false, 'the teaser covers what the scope hides');
  assert.match(ui.text('fpSummary'), /100%|75%/);
  assert.match(ui.text('fpTop'), /Audio Fingerprint|Canvas Fingerprint|Navigator Fingerprint/);

  ui.chip('fingerprint');
  assert.deepEqual(plain(ui.writes.find(w => w.scrapfly_stats_scope).scrapfly_stats_scope).sort(), ['antibot', 'captcha', 'fingerprint', 'other']);
  assert.equal(ui.button('category', 'fingerprint').attributes['aria-pressed'], 'true');
  assert.equal(ui.id('statsScopeNote').hidden, true);
  assert.equal(ui.id('statsFingerprintCard').hidden, true);
  assert.equal(ui.text('kpiEntries'), '4');
  assert.match(labels(ui.chart('statsTopDetectors')).join(' '), /Canvas Fingerprint/);
  ui.section('evidence'); ui.click('sub', 'signals');
  assert.match(ui.text('statsSignalTable'), /toDataURL/);
});

test('a stored scope is validated: an invalid one falls back to the default, a valid one is used', async () => {
  const fallback = await createPage(mixed(), { preferences: { scrapfly_stats_scope: ['bogus'] } });
  assert.equal(fallback.button('category', 'fingerprint').attributes['aria-pressed'], 'false');
  assert.equal(fallback.button('category', 'antibot').attributes['aria-pressed'], 'true');
  const empty = await createPage(mixed(), { preferences: { scrapfly_stats_scope: [] } });
  assert.equal(empty.button('category', 'captcha').attributes['aria-pressed'], 'true');
  const chosen = await createPage(mixed(), { preferences: { scrapfly_stats_scope: ['antibot', 'fingerprint'] } });
  assert.equal(chosen.button('category', 'captcha').attributes['aria-pressed'], 'false');
  assert.equal(chosen.button('category', 'fingerprint').attributes['aria-pressed'], 'true');
  assert.ok(!/Turnstile/.test(labels(chosen.chart('statsTopDetectors')).join(' ')), 'captcha is out of that scope');
  assert.match(labels(chosen.chart('statsTopDetectors')).join(' '), /Canvas Fingerprint/);
  assert.equal(chosen.writes.length, 0, 'reading a scope does not write it back');
});

test('the last visible category cannot be turned off, and the refusal is announced', async () => {
  const ui = await createPage(basic());
  assert.equal(ui.button('category', 'other').hidden, true, 'the Other chip waits for a detection in it');
  ui.chip('antibot');
  assert.equal(ui.button('category', 'antibot').attributes['aria-pressed'], 'false');
  const writes = ui.writes.length;
  ui.chip('captcha');
  assert.equal(ui.button('category', 'captcha').attributes['aria-pressed'], 'true', 'the hidden Other category does not count as a selection');
  assert.equal(ui.id('statsStatus').hidden, false);
  assert.equal(ui.text('statsStatus'), messages.statsScopeKeepOne.message);
  assert.equal(ui.id('statsStatus').classes.has('stats-status--error'), false);
  assert.equal(ui.writes.length, writes, 'nothing was saved');
  ui.chip('antibot');
  assert.equal(ui.text('statsStatus'), '', 'the next action clears the message');
});

test('Rules use every category and make the chips inert; Tools hides the filter row', async () => {
  const detectors = { detectors: {
    fingerprint: { canvas: { id: 'canvas', name: 'Canvas Fingerprint', author: 'me', detection: { js_hooks: [{ target: 'HTMLCanvasElement.toDataURL' }] } } },
    antibot: { unused: { id: 'unused', name: 'Unused rule', author: 'me', detection: { dom: [{ selector: '#x' }] } } } } };
  const ui = await createPage(mixed(), { preferences: { scrapfly_detectors: detectors, scrapfly_advanced_history: { akamai: [{ timestamp: NOW - 60000, expiresAt: NOW + 600000, data: {} }] } } });
  ui.section('rules');
  assert.match(ui.text('rulesCoverageSub'), /^1 of 2 enabled rules matched in this range$/, 'a fingerprint rule matches although fingerprint is out of scope');
  assert.equal(ui.id('statsScope').classes.has('is-inert'), true);
  assert.equal(ui.id('statsScope').attributes['aria-disabled'], 'true');
  assert.equal(ui.text('statsScopeNoteText'), messages.statsScopeRulesNote.message);
  assert.equal(ui.id('statsScopeShow').hidden, true);
  assert.match(ui.text('statsContext'), /Anti-bot, Captcha, and Fingerprint/);
  assert.match(ui.text('statsUnusedTable'), /Unused rule/);
  assert.match(ui.text('statsUnusedTable'), /Custom/);
  ui.chip('fingerprint');
  assert.equal(ui.button('category', 'fingerprint').attributes['aria-pressed'], 'false', 'inert chips ignore clicks');
  assert.equal(ui.writes.filter(w => w.scrapfly_stats_scope).length, 0);
  ui.section('tools');
  assert.equal(ui.id('statsFilters').classes.has('is-empty'), true);
  ui.section('overview');
  assert.equal(ui.id('statsFilters').classes.has('is-empty'), false);
  assert.equal(ui.id('statsScope').classes.has('is-inert'), false);
});

test('exports receive every entry and category, whatever the scope and the view', async () => {
  const ui = await createPage(mixed());
  ui.chip('captcha');
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads[0][0], 'json');
  assert.equal(ui.downloads[0][1].length, 4);
  assert.ok(ui.downloads[0][1].some(item => item.detections.some(d => d.category === 'fingerprint')), 'fingerprint detections are exported');
  assert.ok(ui.downloads[0][1].some(item => item.detections.some(d => d.category === 'captcha')), 'so is the category that was just turned off');
  assert.equal(ui.downloads[0][2].days, 30);
  assert.equal(ui.downloads[0][2].now, NOW);
  assert.match(ui.text('statsStatus'), /Download started: test\.json/);
  await ui.button('export', 'csv').events.click();
  assert.equal(ui.downloads[1][0], 'csv');
});

test('export failures are visible, a dismissed Save As is neutral, concurrent clicks are ignored', async () => {
  let reject;
  const ui = await createPage(basic(), { download: () => new Promise((_, fail) => { reject = fail; }) });
  const pending = ui.button('export', 'csv').events.click();
  assert.equal(ui.button('export', 'json').disabled, true);
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads.length, 1);
  reject(new Error('blocked'));
  await pending;
  assert.equal(ui.text('statsStatus'), messages.statsExportFailed.message);
  assert.equal(ui.id('statsStatus').hidden, false);
  assert.equal(ui.id('statsStatus').classes.has('stats-status--error'), true);
  assert.equal(ui.button('export', 'csv').disabled, false);
  const canceled = await createPage(basic(), { download: async () => { throw Object.assign(new Error('Download canceled'), { canceled: true }); } });
  await canceled.button('export', 'json').events.click();
  assert.equal(canceled.text('statsStatus'), messages.statsExportCanceled.message);
  assert.equal(canceled.id('statsStatus').classes.has('stats-status--error'), false, 'canceling is not an error');
});

test('the Export menu opens and closes with its button, Escape and a pointer outside', async () => {
  const ui = await createPage(basic());
  const button = ui.id('statsExportBtn'), menu = ui.id('statsExportMenu');
  assert.equal(menu.hidden, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
  button.events.click();
  assert.equal(menu.hidden, false);
  assert.equal(button.attributes['aria-expanded'], 'true');
  assert.equal(ui.button('export', 'csv').focused, true, 'the first item takes focus');
  assert.match(ui.text('statsExportScope'), /Entries: 2/);
  button.focused = false;
  ui.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.hidden, true);
  assert.equal(button.focused, true, 'Escape returns focus to the button');
  assert.equal(button.attributes['aria-expanded'], 'false');
  button.events.click();
  ui.dispatch('pointerdown', { target: { closest: () => null } });
  assert.equal(menu.hidden, true, 'a pointer outside closes it');
  button.events.click();
  ui.dispatch('pointerdown', { target: { closest: selector => selector === '.stats-menu' ? {} : null } });
  assert.equal(menu.hidden, false, 'a pointer inside does not');
  ui.button('export', 'json').events.click();
  assert.equal(menu.hidden, true, 'choosing a format closes it');
});

test('every panel opens alone, with accessible tabs, and the choice is saved', async () => {
  const ui = await createPage(mixed(), { preferences: { scrapfly_advanced_history: { akamai: [{ timestamp: NOW - 1000, expiresAt: NOW + 900000, data: {} }] } } });
  const sections = ['overview', 'protections', 'domains', 'evidence', 'activity', 'rules', 'tools'];
  assert.equal(ui.id('stats-tab-tools').hidden, false, 'Tools appears once Advanced has saved something');
  for (const section of sections) {
    ui.section(section);
    assert.deepEqual(ui.visiblePanel(), [section]);
    for (const other of sections) {
      assert.equal(ui.button('section', other).attributes['aria-selected'], String(other === section));
      assert.equal(ui.button('section', other).tabIndex, other === section ? 0 : -1);
    }
    assert.equal(ui.writes.at(-1).scrapfly_stats_section, section);
  }
  assert.ok(ui.chartCalls.some(call => call.key === 'calendar'));
  assert.ok(ui.chartCalls.some(call => call.key === 'bars'));
  assert.ok(ui.chartCalls.some(call => call.key === 'segments'));
  assert.ok(ui.chartCalls.every(call => !['line', 'donut', 'matrix', 'scatter', 'heatmap'].includes(call.key)), 'the retired renderers are not called');
});

test('a saved legacy section opens Evidence on the matching view', async () => {
  const ui = await createPage(mixed(), { preferences: { scrapfly_stats_section: 'signals' } });
  assert.deepEqual(ui.visiblePanel(), ['evidence']);
  assert.equal(ui.id('stats-sub-signals').hidden, false);
  assert.equal(ui.id('stats-sub-confidence').hidden, true);
  assert.equal(ui.button('sub', 'signals').attributes['aria-selected'], 'true');
  assert.ok(ui.chart('statsMethods'));
  const combos = await createPage(mixed(), { preferences: { scrapfly_stats_section: 'combinations' } });
  assert.equal(combos.id('stats-sub-combinations').hidden, false);
  const plainSub = await createPage(mixed(), { preferences: { scrapfly_stats_section: 'evidence', scrapfly_stats_sub: 'combinations' } });
  assert.equal(plainSub.id('stats-sub-combinations').hidden, false);
  ui.click('sub', 'combinations');
  assert.equal(ui.writes.at(-1).scrapfly_stats_sub, 'combinations');
  assert.equal(ui.id('stats-sub-signals').hidden, true);
});

test('the evidence pills are a tablist of their own: arrows move inside it and flip in right-to-left', async () => {
  const ui = await createPage(mixed(), { preferences: { scrapfly_stats_section: 'evidence' } });
  ui.key(ui.button('sub', 'confidence'), 'ArrowRight');
  assert.equal(ui.id('stats-sub-signals').hidden, false);
  assert.equal(ui.button('sub', 'signals').focused, true);
  ui.key(ui.button('sub', 'signals'), 'End');
  assert.equal(ui.id('stats-sub-combinations').hidden, false);
  ui.key(ui.button('sub', 'combinations'), 'ArrowRight');
  assert.equal(ui.id('stats-sub-confidence').hidden, false, 'wraps inside the three pills');
  ui.context.document.documentElement.dir = 'rtl';
  ui.key(ui.button('sub', 'confidence'), 'ArrowRight');
  assert.equal(ui.id('stats-sub-combinations').hidden, false, 'ArrowRight goes backwards in RTL');
  assert.deepEqual(ui.visiblePanel(), ['evidence'], 'the section tabs are untouched');
});

test('headline cards and footer links open the tab they point to', async () => {
  const ui = await createPage(mixed());
  const goes = [['headlineTop', 'protections'], ['headlineHardest', 'domains'], ['headlineNewest', 'protections'], ['headlineRiser', 'protections']];
  for (const [id, section] of goes) {
    ui.section('overview');
    assert.equal(ui.id(id).dataset.go, section);
    ui.id(id).events.click();
    assert.deepEqual(ui.visiblePanel(), [section], id);
  }
  ui.section('overview');
  assert.equal(ui.text('headlineTopName'), 'Cloudflare Bot Management');
  assert.match(ui.text('headlineTopSub'), /50% of pages · pages: 2/);
  assert.equal(ui.text('headlineHardestName'), 'news.example', 'a CAPTCHA page is the hardest site');
  assert.match(ui.text('headlineHardestSub'), /Protections: 1 · Difficulty: High/);
});

test('tab keyboard navigation skips the hidden Tools tab, follows focus and flips in right-to-left', async () => {
  const ui = await createPage(mixed());
  assert.equal(ui.id('stats-tab-tools').hidden, true);
  ui.key(ui.button('section', 'overview'), 'End');
  assert.deepEqual(ui.visiblePanel(), ['rules']);
  assert.equal(ui.button('section', 'rules').focused, true);
  ui.key(ui.button('section', 'rules'), 'ArrowRight');
  assert.deepEqual(ui.visiblePanel(), ['overview'], 'wraps past the hidden Tools');
  ui.key(ui.button('section', 'overview'), 'ArrowLeft');
  assert.deepEqual(ui.visiblePanel(), ['rules']);
  ui.key(ui.button('section', 'rules'), 'Home');
  assert.deepEqual(ui.visiblePanel(), ['overview']);
  ui.context.document.documentElement.dir = 'rtl';
  ui.key(ui.button('section', 'overview'), 'ArrowRight');
  assert.deepEqual(ui.visiblePanel(), ['rules'], 'ArrowRight goes backwards in RTL');
  ui.key(ui.button('section', 'rules'), 'ArrowLeft');
  assert.deepEqual(ui.visiblePanel(), ['overview']);
  ui.key(ui.button('section', 'overview'), 'a');
  assert.deepEqual(ui.visiblePanel(), ['overview']);
  const withTools = await createPage(mixed(), { preferences: { scrapfly_advanced_history: { akamai: [{ timestamp: NOW - 1000, data: {} }] } } });
  withTools.key(withTools.button('section', 'overview'), 'End');
  assert.deepEqual(withTools.visiblePanel(), ['tools']);
});

test('range, section and live history updates keep the selected context and recompute totals', async () => {
  const ui = await createPage(basic(), { preferences: { scrapfly_stats_range: 0, scrapfly_stats_section: 'domains' } });
  assert.deepEqual(ui.visiblePanel(), ['domains']);
  assert.equal(ui.rows('statsDomainTable').length, 3);
  ui.days(7);
  assert.equal(ui.rows('statsDomainTable').length, 2);
  assert.equal(ui.button('days', 7).attributes['aria-pressed'], 'true');
  assert.equal(ui.button('days', 0).attributes['aria-pressed'], 'false');
  assert.equal(ui.writes.at(-1).scrapfly_stats_range, 7);
  await ui.storage({ scrapfly_history: {} }, { scrapfly_history: { items: basic().slice(0, 1) } });
  assert.equal(ui.rows('statsDomainTable').length, 1);
  assert.deepEqual(ui.visiblePanel(), ['domains']);
  ui.section('overview');
  assert.equal(ui.text('kpiEntries'), '1');
  assert.equal(ui.button('days', 7).attributes['aria-pressed'], 'true');
  assert.ok(ui.writes.every(write => !Object.hasOwn(write, 'scrapfly_history')), 'History is read-only here');
});

test('storage writes are debounced into one reload, and a language change reloads the page', async () => {
  const ui = await createPage(basic());
  let loads = 0;
  const get = ui.context.chrome.storage.local.get;
  ui.context.chrome.storage.local.get = async (...args) => { loads++; return get(...args); };
  ui.stored.scrapfly_history = { items: basic().slice(0, 1) };
  for (let i = 0; i < 5; i++) { ui.changes[0]({ scrapfly_history: {} }, 'local'); ui.timers.tick(100); }
  assert.equal(ui.text('kpiEntries'), '2', 'nothing yet: the burst is still going');
  ui.timers.tick(400);
  await ui.settle();
  assert.equal(loads, 1, 'one load for the whole burst');
  assert.equal(ui.text('kpiEntries'), '1');
  ui.changes[0]({ scrapfly_stats_section: {} }, 'local');
  ui.changes[0]({ scrapfly_history: {} }, 'sync');
  ui.timers.tick(1000);
  assert.equal(loads, 1, 'its own keys and other areas do not reload');
  ui.changes[0]({ scrapfly_language_override: {} }, 'local');
  assert.equal(ui.context.reloaded, true);
});

test('empty history and an empty range are distinct; only the second offers a way out', async () => {
  const none = await createPage([]);
  assert.equal(none.text('statsEmptyTitle'), messages.statsEmptyTitle.message);
  assert.equal(none.id('statsEmptyAll').hidden, true);
  assert.equal(none.id('statsContent').hidden, true);
  assert.equal(none.id('statsBar').classes.has('is-empty'), true);
  assert.equal(none.button('export', 'csv').disabled, true);
  const old = await createPage([entry('old.example', 90, [['Cloudflare', 'antibot']])]);
  assert.equal(old.text('statsEmptyTitle'), messages.statsRangeEmptyTitle.message);
  assert.equal(old.id('statsEmptyAll').hidden, false);
  assert.equal(old.id('statsContent').hidden, true);
  old.id('statsEmptyAll').events.click();
  assert.equal(old.id('statsContent').hidden, false);
  assert.equal(old.id('statsEmpty').hidden, true);
  assert.equal(old.button('days', 0).attributes['aria-pressed'], 'true');
  assert.equal(old.writes.at(-1).scrapfly_stats_range, 0);
  assert.equal(old.button('export', 'json').disabled, false);
  assert.equal(old.id('statsBar').classes.has('is-empty'), false);
});

test('a failed load says so and still removes the skeleton', async () => {
  const ui = await createPage(basic());
  ui.context.chrome.storage.local.get = async () => { throw new Error('storage unavailable'); };
  ui.changes[0]({ scrapfly_history: {} }, 'local');
  ui.timers.tick(500);
  await ui.settle();
  assert.equal(ui.text('statsStatus'), messages.statsLoadFailed.message);
  assert.equal(ui.id('statsStatus').classes.has('stats-status--error'), true);
});

/** One page a day for 200 days, so every range has a full previous period behind it. */
const longHistory = () => Array.from({ length: 200 }, (_, i) => entry('site' + (i % 7) + '.example', i, [['Cloudflare', 'antibot', 100]]));

test('the baseline caption names the previous period, or why there is none', async () => {
  const ui = await createPage(longHistory());
  for (const days of [7, 30, 90]) {
    ui.days(days);
    assert.match(ui.text('statsCompare'), /^Compared with the previous period \(.+ – .+\)$/, days + ' days');
  }
  ui.days(0);
  assert.equal(ui.text('statsCompare'), messages.statsCompareNone.message);
  const young = await createPage(Array.from({ length: 10 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])));
  assert.match(young.text('statsCompare'), /^History starts on .+, so there is no full previous period to compare\.$/);
  assert.equal(young.id('kpiEntriesDelta').hidden, true, 'no badge without a usable baseline');
  for (const section of ['evidence', 'activity', 'rules']) { young.section(section); assert.equal(young.text('statsCompare'), '', section); }
});

test('neutral comparison badges: pages 15 against 10 is up 50%, and an unchanged count is flat', async () => {
  const current = Array.from({ length: 15 }, (_, i) => entry('site.example', i, [['Cloudflare', 'antibot']]));
  const previous = Array.from({ length: 10 }, (_, i) => entry('site.example', 50 + i, [['Cloudflare', 'antibot']]));
  const ui = await createPage([...current, ...previous]);
  const delta = ui.id('kpiEntriesDelta');
  assert.equal(delta.hidden, false);
  assert.equal(delta.classes.has('stats-delta--up'), true);
  assert.equal(textOf(delta), '▲ 50%');
  assert.equal(delta.attributes['aria-label'], msg('statsDeltaUpFmt', '50%'));
  assert.equal(delta.attributes.title, msg('statsDeltaWasFmt', 10));
  const same = ui.id('kpiDomainsDelta');
  assert.equal(same.classes.has('stats-delta--flat'), true, 'one domain on both sides: no change');
  assert.equal(textOf(same), '=');
  assert.equal(same.attributes['aria-label'], messages.statsDeltaFlat.message);
});

test('a previous period under 10 pages shows the absolute change, and a change under 5% is flat', async () => {
  const history = [
    ...Array.from({ length: 6 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])),
    ...Array.from({ length: 3 }, (_, i) => entry('a.example', 40 + i, [['Cloudflare', 'antibot']])),
    entry('a.example', 59, [])
  ];
  const ui = await createPage(history);
  assert.equal(ui.id('kpiEntriesDelta').classes.has('stats-delta--up'), true);
  assert.equal(textOf(ui.id('kpiEntriesDelta')), '▲ +2', 'previous base 4 is below 10: absolute');
  assert.equal(ui.id('kpiEntriesDelta').attributes['aria-label'], msg('statsDeltaUpFmt', 2));
  const flat = await createPage([...Array.from({ length: 21 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])),
    ...Array.from({ length: 20 }, (_, i) => entry('a.example', 30 + i, [['Cloudflare', 'antibot']])), entry('a.example', 59, [])]);
  assert.equal(flat.id('kpiEntriesDelta').classes.has('stats-delta--flat'), true);
  const down = await createPage([...Array.from({ length: 10 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])),
    ...Array.from({ length: 19 }, (_, i) => entry('a.example', 30 + i, [['Cloudflare', 'antibot']])), entry('a.example', 59, [])]);
  assert.equal(down.id('kpiEntriesDelta').classes.has('stats-delta--down'), true);
  assert.equal(textOf(down.id('kpiEntriesDelta')), '▼ 50%');
  const fresh = await createPage([...Array.from({ length: 5 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])), entry('a.example', 59, [['Cloudflare', 'antibot']])]);
  assert.equal(fresh.id('kpiDetectorsDelta').classes.has('stats-delta--flat'), true, 'Cloudflare was there before: no change');
  const brand = await createPage([entry('a.example', 0, [['Cloudflare', 'antibot']]), entry('a.example', 59, [])]);
  assert.equal(brand.id('kpiDetectorsDelta').classes.has('stats-delta--new'), true, 'no protections before: new');
  assert.equal(textOf(brand.id('kpiDetectorsDelta')), 'new');
});

test('what changed: new, rising and switched lists, and the rules of the baseline', async () => {
  const history = [
    ...Array.from({ length: 12 }, (_, i) => entry('site' + (i % 3) + '.example', i, [['Cloudflare', 'antibot', 100]])),
    ...Array.from({ length: 4 }, (_, i) => entry('site1.example', 2 + i, [['Kasada', 'antibot', 100]])),
    ...Array.from({ length: 12 }, (_, i) => entry('site' + (i % 3) + '.example', 50 + i, [['Cloudflare', 'antibot', 100]])),
    ...Array.from({ length: 5 }, (_, i) => entry('gone.example', 52 + i, [['DataDome', 'antibot', 100]])),
    entry('switch.example', 45, [['Akamai Bot Manager', 'antibot', 100]], { url: 'https://switch.example/login' }),
    entry('switch.example', 3, [['PerimeterX', 'antibot', 100]], { url: 'https://switch.example/login' }),
    entry('switch.example', 2, [['PerimeterX', 'antibot', 100]], { url: 'https://switch.example/other/1' })
  ];
  const ui = await createPage(history);
  assert.match(ui.text('changedNew'), /Kasada/, 'first seen inside the range');
  assert.ok(!/Cloudflare/.test(ui.text('changedNew')));
  assert.match(ui.text('changedGone'), /DataDome/, 'seen before, not now');
  assert.match(ui.text('changedSwitched'), /switch\.example/);
  assert.match(ui.text('changedSwitched'), /Akamai Bot Manager|PerimeterX/);
  assert.match(ui.text('kpiDetectorsSub'), /new this period/);
  ui.section('domains');
  assert.match(ui.text('statsChangeTable'), /\/login/, 'the same page is compared with its earlier copy');
  assert.ok(!/\/other/.test(ui.text('statsChangeTable')), 'a different page of the same domain is not a change');
  ui.days(0);
  assert.equal(ui.text('statsCompare'), messages.statsCompareNone.message);
  ui.section('overview');
  assert.equal(ui.text('headlineRiserName'), messages.statsHeadlineNeedsCompare.message);
  assert.equal(ui.id('headlineRiser').classes.has('is-muted'), true);
  assert.match(ui.text('changedMoving'), /Choose 7, 30 or 90 days/);
});

test('the all-clear banner: only fingerprinting found, so good news with a way to show it', async () => {
  const ui = await createPage([entry('a.example', 0, [['Canvas Fingerprint', 'fingerprint', 30]]), entry('b.example', 1, [['Navigator Fingerprint', 'fingerprint', 30]])]);
  assert.equal(ui.id('statsBanner').hidden, false);
  assert.equal(ui.id('statsBanner').classes.has('stats-banner--ok'), true);
  assert.equal(ui.text('statsBannerTitle'), messages.statsAllClearTitle.message);
  assert.equal(ui.text('statsBannerDesc'), msg('statsAllClearDescFmt', 2));
  assert.equal(ui.id('statsBannerAction').hidden, false);
  assert.equal(ui.text('kpiEntries'), '2');
  assert.equal(ui.text('kpiDetectors'), '0');
  ui.id('statsBannerAction').events.click();
  assert.equal(ui.id('statsBanner').hidden, true);
  assert.equal(ui.button('category', 'fingerprint').attributes['aria-pressed'], 'true');
  const empty = await createPage([entry('a.example', 0, [])]);
  assert.equal(empty.id('statsBanner').hidden, false);
  assert.equal(empty.id('statsBanner').classes.has('stats-banner--ok'), false);
  assert.equal(empty.text('statsBannerTitle'), messages.statsScopeEmptyTitle.message);
  assert.equal(empty.id('statsBannerAction').hidden, true);
  const found = await createPage(basic());
  assert.equal(found.id('statsBanner').hidden, true);
});

test('a few pages get a low-data note, and the context line names the range and the scope', async () => {
  const ui = await createPage(basic());
  assert.equal(ui.id('statsLowData').hidden, false);
  assert.equal(ui.text('statsLowData'), msg('statsLowDataFmt', 2));
  assert.match(ui.text('statsContext'), /^Pages: 2 · Domains: 2 · .+ – .+ · Anti-bot and Captcha$/);
  ui.days(0);
  assert.match(ui.text('statsContext'), /All history since /);
  const many = await createPage(Array.from({ length: 12 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']])));
  assert.equal(many.id('statsLowData').hidden, true);
  many.chip('fingerprint');
  assert.match(many.text('statsContext'), /Anti-bot, Captcha, and Fingerprint$/);
});

test('range clicks and tab switches never recompute the scope; the scope and the range recompute once', async () => {
  const ui = await createPage(mixed());
  const compute = ui.spy('compute'), scope = ui.spy('scopeItems');
  for (const section of ['protections', 'domains', 'evidence', 'activity', 'rules', 'overview']) ui.section(section);
  assert.equal(compute.calls, 0, 'switching tabs reuses the aggregation');
  ui.resize(603);
  assert.equal(compute.calls, 0);
  ui.days(90);
  assert.equal(compute.calls, 1);
  assert.equal(scope.calls, 0, 'a range click does not scope again');
  ui.chip('fingerprint');
  assert.equal(compute.calls, 2);
  assert.equal(scope.calls, 1);
  ui.days(90);
  assert.equal(compute.calls, 2, 'the same range, scope and minute are memoised');
});

test('a resize of at least 8px redraws the open tab only', async () => {
  const ui = await createPage(mixed(), { preferences: { scrapfly_stats_section: 'activity' } });
  const before = ui.chartCalls.length;
  ui.resize(603);
  assert.equal(ui.chartCalls.length, before, 'a scrollbar appearing is not a resize');
  ui.resize(900);
  assert.ok(ui.chartCalls.length > before);
  assert.ok(ui.chartCalls.slice(before).every(call => ['bars', 'calendar'].includes(call.key)), 'only the Activity charts');
  const again = ui.chartCalls.length;
  ui.resize(905);
  assert.equal(ui.chartCalls.length, again);
});

test('KPI cards carry deltas, sparklines and tooltip rows', async () => {
  const ui = await createPage(mixed());
  assert.deepEqual(plain(['kpiEntriesSpark', 'kpiDomainsSpark', 'kpiLayeredSpark', 'kpiDetectorsSpark'].map(id => ui.chart(id).args[1].length)), [30, 30, 30, 30]);
  assert.equal(ui.text('kpiLayered'), '0');
  const tip = JSON.parse(ui.id('kpiDetectorsCard').attributes['data-tip-rows']);
  assert.deepEqual(tip.map(row => row.label), ['Cloudflare Bot Management', 'Turnstile']);
  assert.equal(ui.id('kpiEntriesCard').attributes['data-tip-detail'], messages.statsTipPages.message);
  assert.equal(ui.id('kpiLayeredCard').attributes['data-tip-detail'], messages.statsTipLayered.message);
  const layered = await createPage([entry('a.example', 0, [['Cloudflare', 'antibot'], ['hCaptcha', 'captcha']]), entry('b.example', 0, [['Cloudflare', 'antibot']])]);
  assert.equal(layered.text('kpiLayered'), '1');
  assert.match(layered.text('kpiLayeredSub'), /^1 with a CAPTCHA$/);
  assert.equal(JSON.parse(layered.id('kpiLayeredCard').attributes['data-tip-rows'])[0].label, 'a.example');
});

test('the trend stacks the whole range by category, with today still counting', async () => {
  const ui = await createPage(mixed());
  const call = ui.chart('statsTimeline');
  assert.equal(call.key, 'stacked');
  assert.equal(call.args[1].length, 30);
  assert.equal(call.args[1].at(-1).partial, true);
  assert.equal(call.args[1].filter(row => row.partial).length, 1);
  assert.deepEqual(plain(call.args[2].series.map(s => s.key)), ['antibot', 'captcha']);
  assert.deepEqual(plain(call.args[2].series.map(s => s.color)), ['var(--ink-antibot)', 'var(--ink-captcha)']);
  assert.equal(call.args[2].vertical, true);
  assert.ok(call.args[2].fixedMax >= 2);
  assert.equal(ui.text('statsTimelineTitle'), messages.statsOverTimeProtections.message);
  const today = call.args[1].at(-1).tip;
  assert.equal(today.at(-1), messages.statsTodayPartial.message);
  assert.equal(typeof today[1], 'object', 'tooltip rows are { label, value, color }');
  ui.chip('fingerprint');
  assert.equal(ui.text('statsTimelineTitle'), messages.statsOverTime.message);
  assert.deepEqual(plain(ui.chart('statsTimeline').args[2].series.map(s => s.key)), ['antibot', 'captcha', 'fingerprint']);
  assert.equal(ui.chart('statsTimeline').args[2].series.at(-1).color, 'var(--ink-fingerprint)');
});

test('protections seen: ranked with share, category chip and delta; tiers and difficulty as proportion bars', async () => {
  const ui = await createPage(longHistory());
  const rank = ui.chart('statsTopDetectors').args[1];
  assert.equal(rank[0].label, 'Cloudflare');
  assert.equal(rank[0].meta.text, 'Anti-bot');
  assert.equal(rank[0].color, 'var(--ink-antibot)');
  assert.equal(rank[0].share, '100%');
  assert.ok(rank[0].delta && ['up', 'down', 'flat', 'new'].includes(rank[0].delta.kind));
  const tiers = ui.chart('statsTiers');
  assert.equal(tiers.key, 'segments');
  assert.equal(tiers.args[2].keepZero, true);
  assert.deepEqual(plain(tiers.args[1].map(p => p.label)), ['Anti-bot and CAPTCHA', 'Anti-bot only', 'CAPTCHA only', 'No anti-bot or CAPTCHA']);
  assert.deepEqual(plain(tiers.args[1].map(p => p.value)), [0, 30, 0, 0]);
  const levels = ui.chart('statsDifficulty').args[1];
  assert.deepEqual(plain(levels.map(p => p.color)), ['var(--danger)', 'var(--warning)', 'var(--success)', 'var(--s-neutral)']);
  assert.equal(levels[1].value, 30);
});

test('hardest sites list its protections as chips and open the domain in Domains', async () => {
  const ui = await createPage([entry('tough.example', 0, [['Cloudflare Bot Management', 'antibot'], ['Turnstile', 'captcha'], ['hCaptcha', 'captcha'], ['Kasada', 'antibot']]), entry('easy.example', 0, [['Kasada', 'antibot']])]);
  const rows = ui.id('statsHardest').children;
  assert.equal(rows.length, 2);
  assert.equal(textOf(rows[0].children[0]), 'tough.example');
  assert.equal(rows[0].children[0].attributes.dir, 'ltr');
  assert.match(textOf(rows[0]), /High/);
  assert.match(textOf(rows[0]), /\+1 more/, 'three chips and the rest counted');
  rows[0].events.click();
  assert.deepEqual(ui.visiblePanel(), ['domains']);
  assert.equal(ui.id('statsDomainSearch').value, 'tough.example');
  assert.deepEqual(plain(ui.rows('statsDomainTable').map(n => textOf(n))), ['tough.example']);
});

const domainRows = () => Array.from({ length: 70 }, (_, i) => {
  const host = `domain${String(i).padStart(2, '0')}.example`;
  return entry(host, 0, i < 10 ? [['hCaptcha', 'captcha']] : i < 40 ? [['Cloudflare', 'antibot']] : []);
});
const pick = (ui, fn) => (fn(), plain(ui.rows('statsDomainTable').map(n => textOf(n))));

test('domain explorer: search, sort, chips, clear and show more, without touching the export source', async () => {
  const ui = await createPage(domainRows(), { preferences: { scrapfly_stats_section: 'domains' } });
  assert.equal(ui.rows('statsDomainTable').length, 50);
  assert.equal(ui.text('statsDomainCount'), 'Rows: 50 of 70');
  ui.id('statsDomainMore').events.click();
  assert.equal(ui.rows('statsDomainTable').length, 70);
  assert.equal(ui.id('statsDomainMore').hidden, true);
  assert.deepEqual(pick(ui, () => { ui.id('statsDomainSearch').value = 'DOMAIN69'; ui.id('statsDomainSearch').events.input(); }), ['domain69.example']);
  assert.equal(ui.id('statsDomainClear').hidden, false);
  assert.equal(pick(ui, () => { ui.id('statsDomainSearch').value = 'hcaptcha'; ui.id('statsDomainSearch').events.input(); }).length, 10, 'searches protection names too');
  assert.equal(ui.text('statsDomainCount'), 'Rows: 10 of 10');
  ui.id('statsDomainClear').events.click();
  assert.equal(ui.id('statsDomainSearch').value, '');
  assert.equal(ui.id('statsDomainClear').hidden, true);
  assert.equal(ui.rows('statsDomainTable').length, 50, 'clearing restores the first page');
  assert.equal(textOf(ui.rows('statsDomainTable')[0]), 'domain00.example', 'hardest first: a CAPTCHA domain leads');
  const firstRow = ui.id('statsDomainTable').children[0].children[2].children[0];
  assert.match(textOf(firstRow.children[1]), /High/);
  ui.click('difficulty', 'High');
  assert.equal(ui.button('difficulty', 'High').attributes['aria-pressed'], 'true');
  assert.equal(ui.rows('statsDomainTable').length, 10);
  assert.equal(textOf(ui.button('difficulty', 'High').children[1]), '10');
  assert.equal(textOf(ui.button('difficulty', 'Medium').children[1]), '30');
  ui.click('difficulty', 'Medium');
  assert.equal(ui.rows('statsDomainTable').length, 40, 'difficulty chips add up');
  ui.click('flag', 'captcha');
  assert.equal(ui.rows('statsDomainTable').length, 10, 'the CAPTCHA flag narrows them');
  ui.id('statsDomainClear').events.click();
  ui.id('statsDomainSort').value = 'name';
  ui.id('statsDomainSort').events.change();
  assert.equal(textOf(ui.rows('statsDomainTable')[0]), 'domain00.example');
  ui.id('statsDomainSort').value = 'visits';
  ui.id('statsDomainSort').events.change();
  assert.equal(ui.rows('statsDomainTable').length, 50);
  await ui.button('export', 'json').events.click();
  assert.equal(ui.downloads[0][1].length, 70);
  assert.equal(ui.downloads[0][2].days, 30);
});

test('domain explorer: hostnames are left-to-right, the difficulty is a pill and the last seen is relative', async () => {
  const ui = await createPage([entry('one.example', 0, [['Cloudflare', 'antibot']]), entry('two.example', 5, [['Cloudflare', 'antibot']]), entry('three.example', 40, [['Kasada', 'antibot']])],
    { preferences: { scrapfly_stats_range: 0, scrapfly_stats_section: 'domains' } });
  const th = ui.rows('statsDomainTable');
  assert.ok(th.every(node => node.attributes.dir === 'ltr' && node.tagName === 'th'));
  const cells = host => textOf(ui.id('statsDomainTable').children[0].children[2].children.find(row => textOf(row.children[0]) === host));
  assert.match(cells('one.example'), /3 hours ago/);
  assert.match(cells('two.example'), /5 days ago/);
  assert.match(cells('three.example'), /2026/, 'older than 30 days: the date');
  assert.match(cells('one.example'), /Medium/);
});

test('domain explorer: the Changed chip lists domains whose protection changed on the same page', async () => {
  const ui = await createPage([
    entry('changed.example', 5, [['Cloudflare', 'antibot']]), entry('changed.example', 1, [['hCaptcha', 'captcha']]),
    entry('stable.example', 5, [['Cloudflare', 'antibot']]), entry('stable.example', 1, [['Cloudflare', 'antibot']])
  ], { preferences: { scrapfly_stats_section: 'domains' } });
  assert.equal(textOf(ui.button('flag', 'changed').children[1]), '1');
  ui.click('flag', 'changed');
  assert.deepEqual(plain(ui.rows('statsDomainTable').map(n => textOf(n))), ['changed.example']);
  const text = ui.text('statsChangeTable');
  assert.match(text, /Replaced/);
  assert.match(text, /Added:/);
  assert.match(text, /Removed:/);
  assert.match(text, /hCaptcha/);
  assert.match(text, /vs /);
});

test('Signals, Combinations and Rules read History and the rule library without writing', async () => {
  const detectors = { detectors: { captcha: {
    turnstile: { id: 'turnstile', name: 'Turnstile', author: 'Scrapfly', detection: { cookie: [{ name: 'cf_chl', description: 'Challenge cookie' }] }, combinations: [{ id: 'c1', name: 'Cookie and widget' }] },
    unused: { id: 'unused', name: 'Unused rule', author: 'me', detection: { dom: [{ selector: '#x' }] } } } } };
  const history = [
    { ...entry('shop.example', 0), detections: [{ name: 'Turnstile', category: 'captcha', confidence: 90, matches: [{ type: 'cookie', value: 'cf_chl=SECRET', confidence: 90 }], combinations: [{ id: 'c1', confidence: 90 }] }] },
    { ...entry('shop.example', 2), detections: [{ name: 'reCAPTCHA', category: 'captcha', confidence: 80, matches: [{ type: 'js_hooks', value: 'grecaptcha.render', confidence: 80 }] }] }
  ];
  const ui = await createPage(history, { preferences: { scrapfly_detectors: detectors } });
  ui.section('evidence'); ui.click('sub', 'signals');
  const methods = ui.chart('statsMethods');
  assert.equal(methods.key, 'rank');
  assert.deepEqual(plain(Array.from(methods.args[1], row => [row.label, row.value])).sort(), [['Cookies', 1], ['JavaScript hooks', 1]]);
  const signals = ui.text('statsSignalTable');
  assert.match(signals, /Challenge cookie/, 'the rule description is shown');
  assert.match(signals, /cf_chl/);
  assert.ok(!signals.includes('SECRET'), 'never a cookie value');
  ui.click('sub', 'combinations');
  assert.match(ui.text('statsCombinationTable'), /Cookie and widget/, 'combination named from the rule');
  ui.section('rules');
  assert.equal(ui.text('rulesTotal'), '2');
  assert.match(ui.text('rulesLibrarySub'), /Official: 0 · Custom: 2 · Edited: 0 · Disabled: 0/);
  assert.equal(ui.id('rulesWaitingTile').hidden, true);
  assert.equal(ui.id('statsWaitingCard').hidden, true);
  assert.match(ui.text('statsUnusedTable'), /Unused rule/);
  assert.match(ui.text('statsRulesQuietNote'), /Not much History to judge by yet \(pages: 2\)/);
  assert.ok(ui.writes.every(write => Object.keys(write).every(key => ['scrapfly_stats_section', 'scrapfly_stats_sub'].includes(key))), 'only the chosen tabs are saved');
});

test('Evidence: strong-evidence tiles, a distribution by category and the mentioned-not-confirmed list', async () => {
  const history = [
    ...Array.from({ length: 5 }, (_, i) => entry('a' + i + '.example', i, [['Turnstile', 'captcha', i === 0 ? 100 : 5], ['Cloudflare Bot Management', 'antibot', 100]]))
  ];
  const ui = await createPage(history, { preferences: { scrapfly_stats_section: 'evidence' } });
  const tiles = ui.id('statsStrongEvidence').children;
  assert.equal(tiles.length, 2);
  assert.deepEqual(plain(tiles.map(tile => [tile.children[0].textContent, textOf(tile.children[1])])), [['Anti-bot', '100%'], ['Captcha', '20%']]);
  assert.equal(tiles[0].attributes['data-tone'], 'antibot');
  assert.equal(tiles[1].attributes['data-tone'], 'captcha');
  assert.equal(tiles[1].attributes['data-tip-detail'], msg('statsStrongEvidenceTipFmt', 1, 5));
  const hist = ui.chart('statsConfidenceHistogram');
  assert.equal(hist.key, 'stacked');
  assert.equal(hist.args[1].length, 5);
  assert.equal(hist.args[1][0].label, '0–<20%');
  assert.equal(hist.args[1][4].label, '80–100%');
  assert.equal(hist.args[1][0].values.captcha, 4);
  assert.equal(hist.args[1][4].values.antibot, 5);
  const unconfirmed = ui.chart('statsUnconfirmed');
  assert.equal(unconfirmed.key, 'rank');
  assert.equal(unconfirmed.args[1][0].label, 'Turnstile');
  assert.match(unconfirmed.args[1][0].meta.text, /Weak: 4/);
  assert.equal(unconfirmed.args[1][0].sub, messages.statsUnconfirmedNoDriver.message);
  const all = await createPage([entry('a.example', 0, [['Cloudflare Bot Management', 'antibot', 100]])], { preferences: { scrapfly_stats_section: 'evidence' } });
  assert.equal(all.text('statsUnconfirmed'), messages.statsUnconfirmedNone.message);
  assert.equal(all.id('statsUnconfirmed').children[0].classes.has('stats-none--ok'), true);
});

test('Combinations: how each category was decided, with the lift of combinations in points', async () => {
  const decided = (single, combo) => ({ ...entry('a.example', 0), detections: [
    { name: 'Turnstile', category: 'captcha', confidence: single, matches: [], combinations: [] },
    { name: 'hCaptcha', category: 'captcha', confidence: combo, matches: [], combinations: [{ id: 'c1', confidence: combo }] }] });
  const ui = await createPage([decided(16, 100)], { preferences: { scrapfly_stats_section: 'evidence', scrapfly_stats_sub: 'combinations' } });
  const segments = ui.chartCalls.filter(call => call.key === 'segments');
  assert.equal(segments.length, 1);
  assert.deepEqual(plain(segments[0].args[1].map(p => p.label)), ['Single pattern', 'Combination']);
  assert.equal(segments[0].args[1][1].color, 'var(--ink-captcha)');
  const rows = ui.id('statsDecided').children;
  assert.match(textOf(rows[0]), /Captcha/);
  assert.match(textOf(rows[0]), /\+84 pts/);
  assert.match(textOf(rows[0]), /Single pattern: 1 · 16% average/);
  assert.equal(ui.id('statsDecidedInsight').hidden, false);
  assert.equal(ui.text('statsDecidedInsight'), msg('statsLiftStrongFmt', 'Captcha', '16%', '100%'));
  const small = await createPage([decided(80, 90)], { preferences: { scrapfly_stats_section: 'evidence', scrapfly_stats_sub: 'combinations' } });
  assert.equal(small.id('statsDecidedInsight').hidden, true, 'a lift under 20 points is not worth a sentence');
});

test('Activity: the whole timeline without paging, calendar facts and weekday order', async () => {
  const history = Array.from({ length: 40 }, (_, i) => entry('a.example', i, [['Cloudflare', 'antibot']]));
  const ui = await createPage(history, { preferences: { scrapfly_stats_section: 'activity', scrapfly_stats_range: 90 } });
  const trend = ui.chart('statsActivityTrend');
  assert.equal(trend.key, 'bars');
  assert.equal(trend.args[1].length, 90, 'no paging: all 90 days');
  assert.equal(trend.args[1].at(-1).partial, true);
  assert.deepEqual(plain(trend.args[2].average), { window: 7 });
  assert.equal(trend.args[2].vertical, true);
  const calendar = ui.chart('statsHeatmap');
  assert.equal(calendar.key, 'calendar');
  assert.equal(calendar.args[1].length, 90);
  assert.equal(calendar.args[2].today, '2026-10-17');
  assert.equal(calendar.args[2].weekdayLabels.length, 7);
  assert.ok(Number.isInteger(calendar.args[2].weekStart) && calendar.args[2].weekStart >= 1 && calendar.args[2].weekStart <= 7);
  assert.equal(calendar.args[2].legendLess, 'Less');
  assert.equal(calendar.args[2].legendMore, 'More');
  const facts = ui.id('statsActivityFacts').children;
  assert.equal(facts.length, 4);
  assert.match(textOf(facts[1]), /Longest streak 40 days/);
  assert.match(textOf(facts[3]), /Days with nothing saved 0/, 'days before History began are not "nothing saved"');
  const weekdays = ui.chart('statsWeekdays').args[1];
  assert.equal(weekdays.length, 7);
  assert.equal(weekdays[0].label, calendar.args[2].weekdayLabels[0], 'the weekday bars start on the same day as the calendar');
  assert.equal(ui.chart('statsHourly').args[1].length, 24);
  assert.equal(ui.chart('statsHourly').args[2].highlight, 'max');
});

test('Tools lists live captures only, counts the expired ones apart and refreshes while visible', async () => {
  const captures = { akamai: [
    { timestamp: NOW - 120000, expiresAt: NOW + 1680000, hostname: 'one.example', data: { tool: 't', label: 'Analyze Scripts' } },
    { timestamp: NOW - 1500000, expiresAt: NOW + 240000, url: 'https://two.example/x', data: {} },
    { timestamp: NOW - 3000000, expiresAt: NOW - 1200000, hostname: 'old.example', data: {} }] };
  const ui = await createPage(basic(), { preferences: { scrapfly_advanced_history: captures, scrapfly_stats_section: 'tools' } });
  assert.deepEqual(ui.visiblePanel(), ['tools']);
  assert.equal(ui.text('toolsSaved'), '2');
  assert.equal(ui.text('toolsExpiring'), '1');
  assert.equal(ui.text('toolsVendors'), '1');
  // The note names the retention set in Settings (30 minutes unless it was changed)
  assert.equal(ui.text('statsToolsRetention'), msg('statsToolsRetentionNoteFmt', '30 minutes'));
  const slow = await createPage(basic(), { preferences: { scrapfly_advanced_history: captures, scrapfly_stats_section: 'tools', scrapfly_settings: { detection: { captureRetentionMinutes: 180 } } } });
  assert.equal(slow.text('statsToolsRetention'), msg('statsToolsRetentionNoteFmt', '3 hours'));
  assert.equal(ui.id('statsToolsStale').hidden, false);
  assert.equal(ui.text('statsToolsStale'), msg('statsToolsStaleFmt', 1));
  const rows = ui.rows('statsCaptureTable');
  assert.equal(rows.length, 2);
  assert.ok(!/old\.example/.test(ui.text('statsCaptureTable')));
  assert.match(ui.text('statsCaptureTable'), /Analyze Scripts/);
  assert.match(ui.text('statsCaptureTable'), /two\.example/);
  assert.match(ui.text('statsCaptureTable'), /Capture/);
  assert.match(ui.text('statsCaptureTable'), /2 minutes ago/);
  assert.match(ui.text('statsCaptureTable'), /in 28 minutes/);
  const resting = ui.timers.pending;
  ui.section('overview');
  assert.equal(ui.timers.pending, resting - 1, 'leaving Tools stops the refresh');
  ui.section('tools');
  assert.equal(ui.timers.pending, resting);
  ui.setNow(NOW + 5 * 60000);
  ui.timers.tick(60000);
  assert.match(ui.text('statsCaptureTable'), /7 minutes ago/, 'the relative times moved on');
  assert.equal(ui.text('toolsSaved'), '1', 'the capture that had 4 minutes left has expired');
  assert.equal(ui.text('toolsExpiring'), '0');
  assert.equal(ui.text('statsToolsStale'), msg('statsToolsStaleFmt', 2));
  const none = await createPage(basic(), { preferences: { scrapfly_stats_section: 'tools' } });
  assert.deepEqual(none.visiblePanel(), ['overview'], 'a saved Tools tab falls back to Overview without captures');
  assert.equal(none.id('stats-tab-tools').hidden, true);
  const expired = await createPage(basic(), { preferences: { scrapfly_advanced_history: { akamai: [{ timestamp: NOW - 3000000, expiresAt: NOW - 1200000, data: {} }] } } });
  expired.section('tools');
  assert.equal(expired.text('statsCaptureTable'), messages.statsToolsNoLive.message);
  assert.equal(expired.id('statsCaptureFooter').hidden, true);
});

test('when the local day changes the page draws everything again', async () => {
  const ui = await createPage(basic());
  const days = ui.chart('statsTimeline').args[1];
  assert.equal(days.at(-1).tip[0], new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(NOW)));
  const compute = ui.spy('compute');
  ui.timers.tick(60000);
  assert.equal(compute.calls, 0, 'the same day: nothing to redraw');
  ui.setNow(NOW + 86400000);
  ui.timers.tick(10 * 3600000);
  assert.equal(compute.calls, 1);
  const next = ui.chart('statsTimeline').args[1];
  assert.equal(next.at(-1).tip[0], new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(NOW + 86400000)));
  assert.equal(next.at(-1).partial, true);
  assert.ok(ui.timers.pending >= 1, 'and the next midnight is scheduled');
});

test('settings colours become the category tokens the inks are made from', async () => {
  const ui = await createPage(basic(), { preferences: { scrapfly_settings: { categoryColors: { antibot: '#112233', captcha: 'red', fingerprint: '#abcdef' } } } });
  assert.equal(ui.body.style.props['--cat-antibot'], '#112233');
  assert.equal(ui.body.style.props['--cat-fingerprint'], '#abcdef');
  assert.ok(!ui.body.style.props['--cat-captcha'] || /^#[0-9a-f]{6}$/i.test(ui.body.style.props['--cat-captcha']), 'only hex colours are applied');
});

test('chart tooltips: rows render as label and value, a tap elsewhere hides a pinned one', async () => {
  const ui = await createPage(basic());
  const tip = ui.id('statsTooltip');
  const anchor = Object.assign(new (ui.context.Node)('g'), {});
  const call = ui.chart('statsTimeline');
  call.args[2].onTooltip({ currentTarget: anchor, clientX: 10, clientY: 10, type: 'pointermove' }, ['Oct 16, 2026', { label: 'Anti-bot', value: '3', color: 'var(--ink-antibot)' }, 'Today (still counting)']);
  assert.equal(tip.hidden, false);
  assert.equal(tip.children[0].classes.has('stats-tooltip-title'), true);
  assert.equal(tip.children[1].classes.has('stats-tooltip-row'), true);
  assert.equal(tip.children[1].children[0].textContent, 'Anti-bot');
  assert.equal(tip.children[1].children[1].textContent, '3');
  assert.equal(tip.children[1].children[0].style['--c'], 'var(--ink-antibot)');
  assert.equal(tip.children[2].classes.has('stats-tooltip-line'), true);
  assert.equal(anchor.attributes['aria-describedby'], 'statsTooltip');
  ui.dispatch('pointerdown', { target: anchor });
  assert.equal(tip.hidden, false, 'a tap on the anchor keeps it');
  ui.dispatch('pointerdown', { target: new (ui.context.Node)('div') });
  assert.equal(tip.hidden, true);
  assert.equal(anchor.attributes['aria-describedby'], undefined);
  call.args[2].onTooltip({ currentTarget: anchor, clientX: 10, clientY: 10, type: 'pointermove' }, ['a']);
  ui.dispatch('keydown', { key: 'Escape' });
  assert.equal(tip.hidden, true, 'Escape hides it');
});

test('no hard-coded English: every key the page asks for exists in the English locale', () => {
  const keys = new Set();
  for (const file of ['stats.js', 'stats-ui.js', 'stats-overview.js', 'stats-protections.js', 'stats-evidence.js', 'stats-activity.js', 'stats-rules.js']) {
    const code = read('sections/stats/' + file);
    for (const m of code.matchAll(/\b(?:tr|fmt)\('([A-Za-z][\w]*)'/g)) keys.add(m[1]);
    for (const m of code.matchAll(/\btr\(\.\.\.KINDS|\[\s*'(stats[A-Za-z]+)'/g)) if (m[1]) keys.add(m[1]);
  }
  for (const m of html.matchAll(/data-i18n(?:-aria-label|-placeholder)?="([^"]+)"/g)) keys.add(m[1]);
  const missing = [...keys].filter(key => !messages[key]);
  assert.deepEqual(missing, []);
  assert.ok(keys.size > 100);
});
