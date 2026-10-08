const { test } = require('node:test');
const assert = require('node:assert');

// Detection and History details show each fired combination as a checklist:
// full name, confidence, then every condition with ✓ found / ○ not found and
// the pattern's own description.

global.DetectionCombinations = require('../modules/detection/detection-combinations.js');
const CC = require('../modules/ui/combination-checklist.js');

const definition = {
  id: 'detect-x',
  detection: {
    url: [{ id: 'sdk', text: '^https://cdn\\.x/sdk\\.js', confidence: 50, description: 'Official SDK script' }],
    dom: [{ id: 'widget', selector: '.x-widget[data-key]', confidence: 40, description: 'Widget with a site key' }],
    window: [
      { id: 'render', path: 'x.render', confidence: 10, standalone: false, description: 'Render API' },
      { id: 'execute', path: 'x.execute', confidence: 10, standalone: false }
    ],
    cookie: [{ id: 'session', name: 'x_sess', value: '^[0-9a-f]{32}$', confidence: 30, description: 'Session cookie' }]
  },
  combinations: [
    { id: 'pair', name: 'SDK and widget', confidence: 70, when: { all: [{ pattern: 'sdk' }, { pattern: 'widget' }] } },
    { id: 'api', name: 'SDK, widget and an API', confidence: 90,
      when: { all: [{ pattern: 'sdk' }, { pattern: 'widget' }, { any: [{ pattern: 'render' }, { pattern: 'execute' }] }] } },
    { id: 'auto', name: 'Two of three', when: { atLeast: 2, of: [{ pattern: 'sdk' }, { pattern: 'session' }, { pattern: 'widget' }] } }
  ]
};
const matches = [
  { type: 'url', patternId: 'sdk', fullUrl: 'https://cdn.x/sdk.js?v=2', confidence: 50 },
  { type: 'dom', patternId: 'widget', value: '.x-widget[data-key]=', confidence: 40 },
  { type: 'window', pattern: 'x.render', confidence: 10 }
];
const scored = () => DetectionCombinations.score(definition, matches);
const label = (m) => ({ url: 'URL', dom: 'DOM', window: 'Window', cookie: 'Cookie' }[m] || m);

test('cards come highest confidence first, and the one that set the score is marked', () => {
  const result = scored();
  const cards = CC.build({ combinations: result.combinations, definition, matches, detectionConfidence: result.confidence });
  assert.deepStrictEqual(cards.map(c => [c.id, c.confidence, c.setsScore]), [['api', 90, true], ['pair', 70, false], ['auto', 50, false]]);
  assert.strictEqual(cards.find(c => c.id === 'auto').auto, true, 'no own confidence: Auto');
  assert.strictEqual(cards.find(c => c.id === 'api').auto, false);
});

test('every tie is marked, and nothing is marked when a single pattern scored higher', () => {
  const combos = [{ id: 'a', name: 'A', confidence: 80, when: { all: [{ pattern: 'sdk' }] }, found: ['sdk'] },
    { id: 'b', name: 'B', confidence: 80, when: { all: [{ pattern: 'widget' }] }, found: ['widget'] }];
  assert.deepStrictEqual(CC.build({ combinations: combos, definition, detectionConfidence: 80 }).map(c => c.setsScore), [true, true]);
  assert.deepStrictEqual(CC.build({ combinations: combos, definition, detectionConfidence: 95 }).map(c => c.setsScore), [false, false]);
});

test('the tree keeps every row; the card lists only what was found, flat and in rule order', () => {
  const result = scored();
  const [card] = CC.build({ combinations: result.combinations, definition, matches, detectionConfidence: 90 });
  assert.strictEqual(card.tree.mode, 'all');
  const [sdk, widget, group] = card.tree.items;
  assert.deepStrictEqual([sdk.description, sdk.met, sdk.value], ['Official SDK script', true, 'https://cdn.x/sdk.js?v=2']);
  assert.strictEqual(widget.description, 'Widget with a site key');
  assert.deepStrictEqual([group.kind, group.mode, group.met], ['group', 'any', true]);
  assert.deepStrictEqual(group.items.map(i => [i.id, i.found]), [['render', true], ['execute', false]]);
  // Shown: the three signals found together; the alternative that was not needed is not
  assert.deepStrictEqual(CC.foundRows(card.tree).found.map(i => i.id), ['sdk', 'widget', 'render']);
  const html = CC.renderHtml([card], { methodLabel: label });
  const order = ['SDK, widget and an API', 'Sets the detection score', 'Found together on this page:', 'Official SDK script',
    'Widget with a site key', 'Render API'].map(text => html.indexOf(text));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order.join(','));
  assert.ok(!html.includes('x.execute'), 'an unneeded alternative is not listed');
  assert.ok(!/One of these|All of these|At least/.test(html), 'no group headings');
});

test('HTML: full name, a found mark with a label, method and raw pattern in the tip, no chips or Copy', () => {
  const result = scored();
  const html = CC.renderHtml(CC.build({ combinations: result.combinations, definition, matches, detectionConfidence: 90 }), { methodLabel: label });
  assert.match(html, /<h5 class="match-combo-name" dir="auto">SDK, widget and an API<\/h5>/);
  assert.match(html, /★<\/span> Sets the detection score/);
  assert.match(html, /role="img" aria-label="Found"><svg/);
  assert.ok(!html.includes('aria-label="Not found"'));
  assert.match(html, /data-tip="URL: \^https:\/\/cdn\\\.x\/sdk\\\.js" data-tip-detail="https:\/\/cdn\.x\/sdk\.js\?v=2"/);
  assert.ok(!/match-combo-chip|match-combo-copy|>Copy</.test(html), 'no method chips, no Copy button');
  for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), id);
});

test('at least N, NOT rows and method rows read in plain words', () => {
  const combos = [
    { id: 'n', name: 'Not', confidence: 60, when: { all: [{ pattern: 'sdk' }, { not: { pattern: 'session' } }, { method: 'dom' }] }, found: ['sdk', 'method:dom'] },
    { id: 'm', name: 'Min', confidence: 50, when: { atLeast: 2, of: [{ pattern: 'sdk' }, { pattern: 'widget' }, { pattern: 'session' }] }, found: ['sdk', 'widget'] }
  ];
  const cards = CC.build({ combinations: combos, definition, detectionConfidence: 60 });
  const [not, min] = cards;
  assert.deepStrictEqual(not.tree.items.map(i => [i.kind, i.negative, i.found, i.met]),
    [['pattern', false, true, true], ['pattern', true, false, true], ['method', false, true, true]]);
  assert.deepStrictEqual(CC.foundRows(not.tree).absent.map(i => i.id), ['session'], 'absent as required');
  assert.deepStrictEqual(CC.foundRows(min.tree).found.map(i => i.id), ['sdk', 'widget']);
  const html = CC.renderHtml(cards, { methodLabel: label });
  assert.match(html, /class="match-combo-row is-absent"[\s\S]*?class="match-combo-not">Not present:<\/span> Session cookie/);
  assert.match(html, /aria-label="Not present"/);
  assert.match(html, />Any DOM pattern</);
});

test('descriptions fall back to the match, then the pattern id', () => {
  const combos = [{ id: 'gone', name: 'Old', confidence: 40, when: { all: [{ pattern: 'old-url' }, { pattern: 'mystery' }] }, found: ['old-url', 'mystery'] }];
  const oldMatches = [{ type: 'url', patternId: 'old-url', pattern: '/old/', description: 'Old endpoint', confidence: 40 }];
  const [card] = CC.build({ combinations: combos, definition: null, matches: oldMatches, detectionConfidence: 40 });
  assert.deepStrictEqual(card.tree.items.map(i => [i.method, i.description, i.text]), [['url', 'Old endpoint', '/old/'], ['', '', 'mystery']]);
});

test('names and descriptions are escaped and kept on one line', () => {
  const evil = { ...definition, detection: { url: [{ id: 'sdk', text: '<b>', description: '<img src=x onerror=alert(1)>' }] } };
  const combos = [{ id: 'e', name: 'A <script>\nB', confidence: 40, when: { all: [{ pattern: 'sdk' }] }, found: ['sdk'] }];
  const cards = CC.build({ combinations: combos, definition: evil, detectionConfidence: 40 });
  const html = CC.renderHtml(cards);
  assert.ok(!html.includes('<script>') && !html.includes('<img') && !html.includes('<b>'));
  assert.match(html, /A &lt;script&gt; B/);
  assert.strictEqual(cards[0].name, 'A <script> B');
});

test('History: the tree comes from the rule by id and its key; implied rows are not stored', () => {
  const key = (id) => DetectionCombinations.treeKey(definition.combinations.find(c => c.id === id).when);
  // As history-store keeps them: id, score, rule key; the name comes from the rule
  const slim = [{ id: 'api', confidence: 90, h: key('api') }, { id: 'pair', confidence: 70, h: key('pair') }];
  const cards = CC.build({ combinations: slim, definition, found: ['render'], detectionConfidence: 90, fromHistory: true });
  assert.deepStrictEqual(cards.map(c => [c.id, c.name, c.unavailable]), [['api', 'SDK, widget and an API', ''], ['pair', 'SDK and widget', '']]);
  const [sdk, widget, group] = cards[0].tree.items;
  assert.deepStrictEqual([sdk.found, widget.found], [true, true], 'rows every match must have had are implied');
  assert.deepStrictEqual(group.items.map(i => i.found), [true, false], 'only the OR row is stored');
  assert.strictEqual(cards[0].setsScore, true);
});

test('History: an edited, removed or older entry shows only its name and score, with the reason', () => {
  const edited = { ...definition, combinations: [{ id: 'api', name: 'Renamed', confidence: 90, when: { all: [{ pattern: 'sdk' }, { pattern: 'session' }] } }] };
  const stored = [{ id: 'api', confidence: 90, h: DetectionCombinations.treeKey(definition.combinations[1].when) }];
  const [changed] = CC.build({ combinations: stored, definition: edited, found: [], fromHistory: true });
  assert.deepStrictEqual([changed.name, changed.unavailable, changed.tree], ['Renamed', 'changed', null]);
  assert.match(CC.renderHtml([changed]), /This rule changed or was removed after the scan, so only its name and score are shown\./);

  const [removed] = CC.build({ combinations: [{ id: 'gone-combo', confidence: 60, h: 'abc' }], definition, fromHistory: true });
  assert.deepStrictEqual([removed.name, removed.unavailable], ['gone-combo', 'changed'], 'the id stands in for a lost name');

  const [old] = CC.build({ combinations: [{ id: 'api', name: 'Saved name', confidence: 90 }], definition, fromHistory: true });
  assert.deepStrictEqual([old.name, old.unavailable], ['Saved name', 'notSaved']);
  const oldHtml = CC.renderHtml([old]);
  assert.match(oldHtml, /Saved name[\s\S]*90%/);
  assert.ok(!oldHtml.includes('match-combo-unavailable'), 'History says why once, above the list');
});

test('combinations without a name get a numbered one, and junk input is skipped', () => {
  const cards = CC.build({ combinations: [null, { id: 'x', confidence: 10, when: { all: [{ pattern: 'sdk' }] }, found: ['sdk'] }, 'junk'], definition });
  assert.deepStrictEqual(cards.map(c => c.name), ['Combination 1']);
  assert.deepStrictEqual(CC.build({}), []);
  assert.strictEqual(CC.renderHtml(null), '');
});

test('pattern text shows cookie and header values', () => {
  assert.strictEqual(CC.patternText('cookie', { name: 'a', value: 'b' }), 'a = b');
  assert.strictEqual(CC.patternText('dom', { selector: '#x' }), '#x');
  assert.strictEqual(CC.patternText('url', null), '');
});
