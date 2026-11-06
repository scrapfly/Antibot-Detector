'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// "Label: value" in the Detection tab's tips is written by the translators, not joined with an ASCII colon: French puts a space
// before it ("Confiance : 85 %"), Traditional Chinese uses the full-width one. The details dialog already read them from
// clipboardConfidenceFmt and clipboardDifficultyFmt; the summary tiles and the cards' tips now do too.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const MESSAGES = {
  clipboardConfidenceFmt: 'Confiance : {0} %', clipboardDifficultyFmt: 'Difficulté : {0}',
  statConfidence: 'Confiance', statDifficulty: 'Difficulté', statDetections: 'Détections',
  difficultyLow: 'Faible', difficultyMedium: 'Moyenne', difficultyHigh: 'Élevée'
};
const I18n = {
  get: (key) => MESSAGES[key] || '',
  tr: (key, fallback) => MESSAGES[key] || fallback,
  format: (key, ...args) => (MESSAGES[key] ? MESSAGES[key].replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]) : null)
};

function load() {
  const context = vm.createContext({ console, self: {}, I18n, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

const cloudflare = { detector: { name: 'Cloudflare Bot Management' }, category: 'Anti-Bot', confidence: 85, difficulty: 'Medium', matches: [{ type: 'cookie' }] };
const hcaptcha = { detector: { name: 'hCaptcha' }, category: 'CAPTCHA', confidence: 81, difficulty: 'High', matches: [{ type: 'url' }] };

test('the summary tiles\' tips use the translated "Label: value" forms', () => {
  const context = load();
  const tiles = { count: {}, confidence: {}, difficulty: {} };
  const tile = (attrs) => ({ setAttribute: (key, value) => { attrs[key] = value; }, removeAttribute: (key) => { delete attrs[key]; } });
  const leaf = (attrs) => ({ textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, closest: () => tile(attrs) });
  context.document = { querySelector: (selector) => ({
    '#detectionsCount': leaf(tiles.count), '#overallConfidence': leaf(tiles.confidence), '#difficultyLevel': leaf(tiles.difficulty),
    '.overall-confidence .stat-icon-inline': leaf({}), '#difficultyIcon': leaf({})
  })[selector] || null };
  context.DetectionUI.updateStats.call({ getDifficultyInfo: () => ({ difficulty: 'Medium' }) }, [cloudflare, hcaptcha]);
  assert.equal(tiles.confidence['data-tip'], 'Confiance : 83 %', 'French: a space before the colon and before the percent sign');
  assert.equal(tiles.difficulty['data-tip'], 'Difficulté : Moyenne');
  assert.equal(tiles.count['data-tip'], 'Détections', 'the count tile has no label: value title');
});

test('a card\'s confidence and difficulty tips use them too', () => {
  const context = load();
  const state = {
    detectorManager: { getCategoryInfo: () => ({ colour: '#FF5733' }) },
    getGlobalDetectionIndex: (detection, index) => index, getDetectorIcon: () => '<img src="x.png" alt="">'
  };
  const html = context.DetectionUI.buildDetectionCardHtml.call(state, cloudflare, 0);
  assert.match(html, /class="card-sure" data-tip="Confiance : 85 %"/);
  assert.match(html, /diff-metric[^"]*card-difficulty[^>]*data-tip="Difficulté : Moyenne"/);
});

test('every one of them still reads in English when no translation is loaded', () => {
  const context = vm.createContext({ console, self: {}, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const state = { detectorManager: { getCategoryInfo: () => ({ colour: '#FF5733' }) }, getGlobalDetectionIndex: (d, i) => i, getDetectorIcon: () => '' };
  const html = context.DetectionUI.buildDetectionCardHtml.call(state, cloudflare, 0);
  assert.match(html, /data-tip="Confidence: 85%"/);
  assert.match(html, /data-tip="Difficulty: Medium"/);
});

test('the two keys carry their own colon in every language (they are the ones the details dialog already uses)', () => {
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    for (const key of ['clipboardConfidenceFmt', 'clipboardDifficultyFmt']) {
      assert.match(messages[key].message, /\{0\}/, `${code}: ${key}`);
    }
  }
  const source = read('sections/detection/detection-ui.js');
  assert.doesNotMatch(source, /statConfidence', 'Confidence'\)\}: /, 'no hand-joined "Confidence: value"');
  assert.doesNotMatch(source, /statDifficulty', 'Difficulty'\)\}: /, 'no hand-joined "Difficulty: value"');
});
