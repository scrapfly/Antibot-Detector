const { test } = require('node:test');
const assert = require('node:assert/strict');
const { engineContext, plain } = require('./helpers/engine-context.js');

// Two URL rules with the same text (Rules → Duplicate rule, then edit only the confidence) are two rules: each keeps its own
// confidence, its own match and, in a combination, its own id. They used to share one "already found" slot keyed by the
// text, so after the first matched a script, resource or request address the second was skipped: the outcome depended on where
// the address was seen, the stronger rule lost its confidence, and a combination that named the second id could never fire.

const { Engine } = engineContext();
const SCRIPT = 'https://cdn.example.test/probe.js';
const TEXT = '^https://cdn\\.example\\.test/probe\\.js$';

const detector = (extra = {}) => ({
  id: 'detect-same-text', name: 'Same text', enabled: true, category: 'Anti-Bot',
  detection: { url: [
    { id: 'weak', text: TEXT, textRegex: true, textScope: 'all', confidence: 40 },
    { id: 'strong', text: TEXT, textRegex: true, textScope: 'all', confidence: 90 }
  ] },
  ...extra
});

function run(page, rules = detector()) {
  const engine = new Engine();
  engine.setDetectors({ antibot: { [rules.id]: rules } });
  return plain(engine.runDetector(rules, { url: 'https://site.test/', ...page }));
}

// Every place the engine reads an address from
const SEEN = {
  'the page address': { url: SCRIPT },
  'a script tag': { content: [{ type: 'external', src: SCRIPT, content: SCRIPT }] },
  'a fetched resource': { externalContent: [{ url: SCRIPT, type: 'javascript', content: '' }] },
  'a request the page made': { networkUrls: [{ url: SCRIPT, type: 'script', method: 'GET' }] }
};

for (const [where, page] of Object.entries(SEEN)) {
  test(`two rules with the same text both match an address seen as ${where}`, () => {
    const result = run(page);
    assert.deepEqual(result.matches.map(match => match.confidence).sort((a, b) => a - b), [40, 90], 'one match per rule, each with its own confidence');
    assert.equal(result.confidence, 90, 'the stronger rule decides');
  });

  test(`a combination naming the second of two same-text rules fires for an address seen as ${where}`, () => {
    const result = run(page, detector({
      combinations: [{ id: 'strong-seen', name: 'The strong rule', confidence: 95, when: { pattern: 'strong' } }]
    }));
    assert.deepEqual(result.matches.map(match => match.patternId).sort(), ['strong', 'weak']);
    assert.deepEqual(result.combinations.map(combination => combination.id), ['strong-seen']);
    assert.equal(result.confidence, 95);
  });
}

test('one rule still lists an address once, however many places it was seen in', () => {
  const rules = detector({ detection: { url: [{ id: 'only', text: TEXT, textRegex: true, textScope: 'all', confidence: 70 }] } });
  const everywhere = Object.assign({}, ...Object.values(SEEN));
  const result = run(everywhere, rules);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].confidence, 70);
  assert.equal(result.matches[0].fullUrl, SCRIPT);
});

test('rules with the same text but another scope each follow their own scope', () => {
  const rules = detector({ detection: { url: [
    { id: 'page-only', text: TEXT, textRegex: true, textScope: 'page_only', confidence: 30 },
    { id: 'scripts', text: TEXT, textRegex: true, textScope: 'page_and_scripts', confidence: 50 },
    { id: 'everywhere', text: TEXT, textRegex: true, textScope: 'all', confidence: 60 }
  ] } });
  const confidences = (page) => run(page, rules).matches.map(match => match.confidence).sort((a, b) => a - b);
  assert.deepEqual(confidences(SEEN['a request the page made']), [60], 'a request: only the rule that reads requests');
  assert.deepEqual(confidences(SEEN['a script tag']), [50, 60], 'a script tag: the scripts rule and the all rule');
  assert.deepEqual(confidences(SEEN['a fetched resource']), [60]);
  assert.deepEqual(confidences(SEEN['the page address']), [30, 50, 60], 'the page address: every rule reads it');
});
