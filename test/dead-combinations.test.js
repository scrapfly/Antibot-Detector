const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Combinations = require('../modules/detection/detection-combinations.js');

// E-10 ratchet. A combination whose evidence already holds a standalone rule that scores at least its tier can never raise a
// detector's confidence: that rule says it alone (a proof-grade rule scores 100), and the tier only names what was found for
// the checklist, a label rather than score. 153 of the 351 combinations were like that when this was written. The list is
// computed with the engine's own score() (the best standalone match or the best satisfied combination) and pinned in
// fixtures/dead-combinations.json, so a NEW such combination has to be added there on purpose, and one that starts to matter
// (or goes away) has to leave it: the list only shrinks.

const root = path.join(__dirname, '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
const index = readJson('detectors/index.json');

const product = lists => lists.reduce((all, options) => all.flatMap(had => options.map(option => [...had, ...option])), [[]]);
const choose = (list, n) => (n === 0 ? [[]] : list.flatMap((x, i) => choose(list.slice(i + 1), n - 1).map(rest => [x, ...rest])));
/** Every way a condition can hold, as the ids of the patterns that have to be seen (a NOT needs only an absence). */
function ways(node, patterns) {
  if (typeof node.pattern === 'string') return [[node.pattern]];
  if (typeof node.method === 'string') return patterns.filter(p => p.method === node.method).map(p => [p.id]);
  if (node.not) return [[]];
  if (node.all) return product(node.all.map(n => ways(n, patterns)));
  if (node.any) return node.any.filter(Combinations.hasPositive).flatMap(n => ways(n, patterns));
  if (node.of) return choose(node.of.filter(Combinations.hasPositive), node.atLeast).flatMap(group => product(group.map(n => ways(n, patterns))));
  return [];
}

function deadCombinations() {
  const dead = [];
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    for (const id of index[category].detectors) {
      const detector = readJson('detectors', category, `${id}.json`);
      const patterns = Combinations.listPatterns(detector);
      const known = new Set(patterns.map(p => p.id));
      const standaloneOnly = { ...detector, combinations: [] };
      for (const combination of detector.combinations || []) {
        // It matters when, for some evidence that satisfies it, its tier is above what the standalone rules score on that evidence
        const raises = ways(combination.when, patterns).filter(ids => ids.every(patternId => known.has(patternId))).some(ids => {
          const matches = [...new Set(ids)].map(patternId => {
            const { method, pattern } = patterns.find(p => p.id === patternId);
            return { type: method, patternId, confidence: pattern.confidence };
          });
          const satisfied = Combinations.score(detector, matches).combinations.find(c => c.id === combination.id);
          return Boolean(satisfied) && satisfied.confidence > Combinations.score(standaloneOnly, matches).confidence;
        });
        if (!raises) dead.push(`${detector.id}/${combination.id}`);
      }
    }
  }
  return dead.sort();
}

test('E-10: the combinations that can never raise a score are exactly the pinned ones', () => {
  const pinned = readJson('test/fixtures/dead-combinations.json').dead;
  const dead = deadCombinations();
  const added = dead.filter(name => !pinned.includes(name));
  const gone = pinned.filter(name => !dead.includes(name));
  assert.deepEqual(added, [], `${added.length} new combination(s) never raise a score, a standalone rule already scores their tier: raise the tier above that rule, or add the name(s) to test/fixtures/dead-combinations.json on purpose`);
  assert.deepEqual(gone, [], `${gone.length} pinned combination(s) can raise a score now, or no longer exist: remove the name(s) from test/fixtures/dead-combinations.json`);
});
