'use strict';
// Statistics → Rules: a rule is matched to History by the name a protection has had, as History, Compare and the watchlist do.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../modules/core/categories.js');
const RuleStats = require('../sections/stats/rule-stats.js');
const HistoryStats = require('../sections/stats/history-stats.js');

const rules = RuleStats.parseDetectors({ detectors: { antibot: {
  'detect-human': { id: 'detect-human', name: 'HUMAN Security', author: 'Scrapfly', detection: { cookie: [{ name: '_px3' }] } }
} } });
const items = [{ timestamp: 1, url: 'https://a.test/', detections: [{ name: 'PerimeterX', category: 'antibot', confidence: 90 }] }];

test('an entry saved under an old name of the protection still counts for the renamed rule', () => {
  const r = RuleStats.compute(rules, { detectorMetrics: HistoryStats.detectorSummary(items), seen: HistoryStats.detectorSeen(items),
    officialIds: ['detect-human'], historyEntries: 100 });
  assert.equal(r.totals.matched, 1);
  assert.equal(r.neverMatched.length, 0);
});

test('a rule seen under an old name is quiet, not unseen', () => {
  const r = RuleStats.compute(rules, { detectorMetrics: [], seen: HistoryStats.detectorSeen(items), officialIds: ['detect-human'], historyEntries: 100 });
  assert.equal(r.neverMatched[0].status, 'quiet');
});
