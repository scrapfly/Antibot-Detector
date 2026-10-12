'use strict';
// Statistics → Signals, Combinations, Rules, Tools and the Domains changes:
// the pure aggregations behind them.
const test = require('node:test');
const assert = require('node:assert/strict');
const HistoryStats = require('../sections/stats/history-stats.js');
const RuleStats = require('../sections/stats/rule-stats.js');
const ToolsStats = require('../sections/stats/tools-stats.js');

const NOW = new Date(2026, 9, 12, 15).getTime();
const DAY = 86400000;

const cloudflare = (extra = {}) => ({ name: 'Cloudflare', category: 'antibot', confidence: 90, detector: { id: 'detect-cloudflare' },
  matches: [{ type: 'cookie', value: 'cf_clearance=SECRET-VALUE', confidence: 90 }, { type: 'url', fullUrl: 'https://a.com/cdn-cgi/challenge?token=SECRET', confidence: 70 }], ...extra });
const amazon = () => ({ name: 'Amazon Bot Protection', category: 'antibot', confidence: 95, detector: { id: 'detect-amazon' },
  matches: [{ type: 'dom', value: 'input[name="metadata1"]=abc', confidence: 40 }, { type: 'url', pattern: 'fwcim', confidence: 40 }],
  combinations: [{ id: 'metadata1-with-fwcim-script', confidence: 95 }] });
const canvas = () => ({ name: 'Canvas', category: 'fingerprint', confidence: 30, matches: [{ type: 'js_hooks', value: 'HTMLCanvasElement.prototype.toDataURL', confidence: 30 }] });

test('signals name what matched without cookie values or URL queries', () => {
  assert.equal(HistoryStats.signalLabel({ type: 'cookie', value: 'cf_clearance=SECRET' }), 'cf_clearance');
  assert.equal(HistoryStats.signalLabel({ type: 'header', value: 'server: cloudflare' }), 'server');
  assert.equal(HistoryStats.signalLabel({ type: 'url', fullUrl: 'https://a.com/x/y?token=SECRET#h' }), 'a.com/x/y');
  assert.equal(HistoryStats.signalLabel({ type: 'dom', value: '#captcha=Some text' }), '#captcha');
  assert.equal(HistoryStats.signalLabel({ type: 'dom', value: 'input[name="metadata1"]=a=b' }), 'input[name="metadata1"]', 'an attribute selector keeps its own "="');
  assert.equal(HistoryStats.signalLabel({ type: 'js_hooks', value: 'Navigator.prototype.webdriver' }), 'Navigator.prototype.webdriver');
  assert.equal(HistoryStats.signalLabel({ type: 'payload', value: 'sensor_data=SECRET' }), '', 'payload values are never shown');
  assert.equal(HistoryStats.methodOf({ type: 'cookies' }), 'cookie');
  assert.equal(HistoryStats.methodOf({ type: 'mystery' }), 'other');
});

test('methods, signals, decisions and combinations are counted per detection', () => {
  const s = HistoryStats.compute([
    { timestamp: NOW, hostname: 'a.com', detections: [cloudflare(), canvas()] },
    { timestamp: NOW - DAY, hostname: 'a.com', detections: [cloudflare()] },
    { timestamp: NOW, hostname: 'amazon.com', detections: [amazon()] }
  ], { now: NOW });
  assert.equal(s.totalMatches, 7);
  assert.equal(s.methods.cookie, 2);
  assert.equal(s.methods.url, 3);
  assert.equal(s.methods.js_hooks, 1);
  assert.equal(s.methodsByCategory.fingerprint.js_hooks, 1);
  assert.equal(s.methodsByCategory.antibot.dom, 1);
  const top = s.signalMetrics.find(row => row.method === 'cookie');
  assert.equal(s.signalMetrics[0].pages, 2);
  assert.deepEqual([top.label, top.method, top.detector, top.pages, top.avgConfidence], ['cf_clearance', 'cookie', 'Cloudflare', 2, 90]);
  assert.ok(!JSON.stringify(s.signalMetrics).includes('SECRET'), 'no cookie value or query reaches Statistics');
  assert.deepEqual(s.decided, { single: { detections: 3, avgConfidence: 70 }, combination: { detections: 1, avgConfidence: 95 } });
  assert.deepEqual(s.combinationMetrics.map(row => [row.detector, row.id, row.pages, row.avgConfidence]),
    [['Amazon Bot Protection', 'metadata1-with-fwcim-script', 1, 95]]);
  assert.deepEqual(s.weakEvidence.map(row => row.name), ['Canvas', 'Amazon Bot Protection']);
  assert.deepEqual(s.togetherMetrics, [{ a: 'Canvas', b: 'Cloudflare', pages: 1 }]);
  assert.equal(s.detectorMetrics.find(row => row.name === 'Cloudflare').id, 'detect-cloudflare');
});

test('a domain change lists the protections that appeared and disappeared, newest first', () => {
  const recaptcha = { name: 'reCAPTCHA', category: 'captcha' }, turnstile = { name: 'Turnstile', category: 'captcha' };
  const s = HistoryStats.compute([
    { timestamp: NOW - 2 * DAY, hostname: 'shop.com', detections: [recaptcha] },
    { timestamp: NOW - DAY, hostname: 'shop.com', detections: [recaptcha] },
    { timestamp: NOW, hostname: 'shop.com', detections: [turnstile] },
    { timestamp: NOW, hostname: 'empty.com', detections: [] }
  ], { now: NOW });
  assert.equal(s.domainChangeCount, 1);
  assert.deepEqual(s.domainChanges[0], { hostname: 'shop.com', timestamp: NOW, previous: NOW - DAY, added: ['Turnstile'], removed: ['reCAPTCHA'] });
});

test('first seen compares the range with all of History', () => {
  const items = [
    { timestamp: NOW - 40 * DAY, hostname: 'old.com', detections: [{ name: 'Cloudflare', category: 'antibot' }] },
    { timestamp: NOW - DAY, hostname: 'old.com', detections: [{ name: 'Cloudflare', category: 'antibot' }] },
    { timestamp: NOW - DAY, hostname: 'new.com', detections: [{ name: 'DataDome', category: 'antibot' }] }
  ];
  const since = HistoryStats.rangeStart(30, NOW);
  const seen = HistoryStats.firstSeen(items, since, NOW);
  assert.deepEqual(seen.protections.map(row => [row.name, row.hostname]), [['DataDome', 'new.com']]);
  assert.deepEqual(seen.domains.map(row => row.hostname), ['new.com']);
  assert.equal(HistoryStats.rangeStart(0, NOW), null, '"All" has no first-seen');
  assert.deepEqual(HistoryStats.firstSeen(items, null, NOW), { protections: [], domains: [] });
});

const library = () => ({ timestamp: 'x', detectors: {
  antibot: {
    'detect-cloudflare': { id: 'detect-cloudflare', name: 'Cloudflare', author: 'Scrapfly',
      detection: { cookie: [{ name: 'cf_clearance', description: 'Clearance cookie after a passed challenge' }], url: [{ text: '/cdn-cgi/' }] } },
    'detect-amazon': { id: 'detect-amazon', name: 'Amazon Bot Protection', author: 'Scrapfly', userModified: true,
      detection: { dom: [{ selector: 'input[name="metadata1"]', description: 'Hidden metadata1 field' }] },
      combinations: [{ id: 'metadata1-with-fwcim-script', name: 'metadata1 with FWCIM' }] },
    'my-waf': { id: 'my-waf', name: 'My WAF', author: 'me', detection: { header: [{ name: 'x-waf' }] } },
    'off-rule': { id: 'off-rule', name: 'Off', author: 'Scrapfly', enabled: false, detection: {} }
  }
} });

test('rule stats split official, custom, edited and disabled, and find unused and undescribed rules', () => {
  const rules = RuleStats.parseDetectors(JSON.stringify(library()));
  assert.equal(rules.length, 4);
  const metrics = [{ name: 'Cloudflare', id: 'detect-cloudflare', pages: 5, domains: 2, avgConfidence: 90 },
    { name: 'amazon bot protection', id: '', pages: 1, domains: 1, avgConfidence: 95 }];
  const r = RuleStats.compute(rules, { detectorMetrics: metrics, officialIds: ['detect-cloudflare', 'detect-amazon', 'off-rule'],
    incompatible: [{ id: 'detect-new', name: 'New Vendor', remoteVersion: '1.0.0', minExtensionVersion: '2.9' }, 'junk'] });
  assert.deepEqual(r.totals, { total: 4, official: 3, custom: 1, modified: 1, disabled: 1, withCombinations: 1, patterns: 4, described: 2 });
  assert.deepEqual(r.patternsByMethod, { cookie: 1, header: 1, url: 1, content: 0, dom: 1, window: 0, js_hooks: 0, payload: 0 });
  assert.deepEqual(r.neverMatched.map(row => row.id), ['my-waf'], 'disabled rules are not "unused"');
  assert.deepEqual(r.active.map(row => [row.id, row.pages]), [['detect-cloudflare', 5], ['detect-amazon', 1]], 'matched by id, else by name');
  assert.deepEqual(r.missingDescriptions.map(row => [row.id, row.missing]), [['detect-cloudflare', 1], ['my-waf', 1]]);
  assert.deepEqual(r.waiting, [{ id: 'detect-new', name: 'New Vendor', category: '', version: '1.0.0', minExtensionVersion: '2.9' }]);
});

test('signals and combinations show the rule\'s own description and name', () => {
  const rules = RuleStats.parseDetectors(library());
  const map = RuleStats.descriptions(rules);
  assert.equal(RuleStats.descriptionOf(map, { detectorId: 'detect-cloudflare', detector: 'Cloudflare', method: 'cookie', label: 'CF_Clearance' }), 'Clearance cookie after a passed challenge');
  assert.equal(RuleStats.descriptionOf(map, { detectorId: '', detector: 'Amazon Bot Protection', method: 'dom', label: 'input[name="metadata1"]' }), 'Hidden metadata1 field');
  assert.equal(RuleStats.descriptionOf(map, { detectorId: 'detect-cloudflare', detector: 'Cloudflare', method: 'url', label: '/cdn-cgi/' }), '');
  assert.equal(RuleStats.combinationName(rules, 'detect-amazon', 'Amazon Bot Protection', 'metadata1-with-fwcim-script'), 'metadata1 with FWCIM');
  assert.equal(RuleStats.combinationName(rules, '', 'Gone', 'x'), '');
});

test('tool stats group Advanced captures by vendor, tool and day within the range', () => {
  const raw = { akamai: [{ timestamp: NOW, data: { tool: 'akamai-scripts', label: 'Analyze Scripts' } }, { timestamp: NOW - DAY, data: {} }, { timestamp: 'bad' }],
    awswaf: [{ timestamp: NOW - 2 * DAY, data: {} }], hcaptcha: [{ timestamp: NOW - 60 * DAY, data: {} }], junk: 'x' };
  const captures = ToolsStats.parse(JSON.stringify(raw));
  assert.equal(captures.length, 4);
  const t = ToolsStats.compute(captures, { since: HistoryStats.rangeStart(30, NOW), now: NOW, dayKey: HistoryStats.dayKey });
  assert.equal(t.total, 3);
  assert.deepEqual(t.byModule.map(row => [row.name, row.count]), [['Akamai Bot Manager', 2], ['AWS WAF', 1]]);
  assert.deepEqual(t.byTool.map(row => [row.capture, row.label, row.count]), [[true, '', 2], [false, 'Analyze Scripts', 1]]);
  assert.equal(t.perDay.get(HistoryStats.dayKey(NOW)), 1);
  assert.equal(ToolsStats.compute(captures, { since: null, now: NOW }).total, 4);
  assert.deepEqual(ToolsStats.parse('not json'), []);
});
