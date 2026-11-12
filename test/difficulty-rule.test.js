const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The page difficulty (Low, Medium, High) colours the toolbar badge and is shown in the Detection tab, History, Statistics, Bulk scan
// and the exports. It used to take a detector's own difficulty as a minimum at any confidence, and to count fingerprinting toward
// "more than 2 detections → Medium": the whole word "hcaptcha" anywhere in a script (a 10% mention) made a page High with a red
// badge, and so did Canvas fingerprinting (a High detector) on its own. Since 3.1.8 only the anti-bot and CAPTCHA protections
// present on the page count (50% or more, History's own line), and the 80% high-tier rule stays as it was.

global.self = global;
require('../modules/core/categories.js');
const DetectionUtils = require('../utils/detection-utils.js');
global.DetectionUtils = DetectionUtils;
const HistoryPolicy = require('../modules/core/history-policy.js');
const FormatUtils = require('../utils/format-utils.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const level = (detections) => DetectionUtils.getDifficultyLevel(detections);
const d = (name, category, confidence, difficulty) => ({ detector: { name, ...(difficulty ? { difficulty } : {}) }, category, confidence, ...(difficulty ? { difficulty } : {}) });
const fingerprints = (n, difficulty = 'Low') => Array.from({ length: n }, (_, i) => d(`FP ${i}`, 'Fingerprint', 30, difficulty));

test('a passing mention of a hard vendor no longer makes a page High', () => {
  assert.equal(level([d('hCaptcha', 'CAPTCHA', 10, 'High')]), 'Low', 'the 10% "hcaptcha" word in a script');
  for (const [name, category, confidence] of [['Shape Security', 'Anti-Bot', 10], ['Ocule', 'Anti-Bot', 5], ['FunCaptcha (Arkose Labs)', 'CAPTCHA', 10], ['Google BotGuard', 'Anti-Bot', 10]]) {
    assert.equal(level([d(name, category, confidence, 'High')]), 'Low', name);
  }
  const colors = { low: '#low', medium: '#medium', high: '#high' };
  assert.equal(DetectionUtils.getBadgeColor([d('hCaptcha', 'CAPTCHA', 10, 'High')], colors), '#low', 'and the badge is not red');
});

test('a detector\'s own difficulty is a minimum once it is present: 50% or more, History\'s line', () => {
  assert.equal(DetectionUtils.PRESENT_CONFIDENCE, HistoryPolicy.CHANGE_SURE, 'the same line History uses for "found"');
  assert.equal(level([d('hCaptcha', 'CAPTCHA', 49, 'High')]), 'Low');
  assert.equal(level([d('hCaptcha', 'CAPTCHA', 50, 'High')]), 'High');
  assert.equal(level([d('HUMAN (PerimeterX)', 'Anti-Bot', 60, 'High')]), 'High');
  assert.equal(level([d('Google reCAPTCHA', 'CAPTCHA', 40, 'Medium')]), 'Low');
  assert.equal(level([d('Google reCAPTCHA', 'CAPTCHA', 55, 'Medium')]), 'Medium');
  // A weak mention beside a real protection sets nothing: the real one does
  assert.equal(level([d('Cloudflare Bot Management', 'Anti-Bot', 100, 'Medium'), d('hCaptcha', 'CAPTCHA', 10, 'High')]), 'Medium');
});

test('fingerprinting never raises the difficulty, however much of it there is', () => {
  assert.equal(level([d('Canvas Fingerprint', 'Fingerprint', 30, 'High')]), 'Low', 'Canvas fingerprinting is a High detector on its own');
  assert.equal(level(fingerprints(7)), 'Low');
  assert.equal(level([...fingerprints(5), d('hCaptcha', 'CAPTCHA', 10, 'High')]), 'Low', 'nor fingerprinting with a mention');
  // Adding fingerprinting to a page changes nothing, up or down
  for (const page of [[d('Akamai Bot Manager', 'Anti-Bot', 100, 'Low')], [d('Cloudflare Bot Management', 'Anti-Bot', 95, 'Medium')],
    [d('Akamai Bot Manager', 'Anti-Bot', 55, 'Low')], [d('DataDome', 'Anti-Bot', 90, 'Medium'), d('Cloudflare Turnstile', 'CAPTCHA', 100, 'Low')]]) {
    assert.equal(level([...page, ...fingerprints(6, 'High')]), level(page), page.map(x => x.detector.name).join(', '));
  }
});

test('Medium: two protections present, or a strong one; the 80% high-tier rule is kept', () => {
  assert.equal(level([d('Akamai Bot Manager', 'Anti-Bot', 55, 'Low')]), 'Low');
  assert.equal(level([d('Akamai Bot Manager', 'Anti-Bot', 70, 'Low')]), 'Medium', 'its confidence, as before');
  assert.equal(level([d('Akamai Bot Manager', 'Anti-Bot', 55, 'Low'), d('Cloudflare Turnstile', 'CAPTCHA', 55, 'Low')]), 'Medium', 'two together');
  assert.equal(level([d('Akamai Bot Manager', 'Anti-Bot', 55, 'Low'), d('Cloudflare Turnstile', 'CAPTCHA', 30, 'Low'), d('Sucuri', 'Anti-Bot', 20, 'Low')]), 'Low',
    'weak ones are not counted toward "several"');
  // The high-tier names at 80% or more, even with no difficulty of their own
  assert.equal(level([{ name: 'Arkose Labs', category: 'CAPTCHA', confidence: 85 }]), 'High');
  assert.equal(level([{ name: 'Arkose Labs', category: 'CAPTCHA', confidence: 75 }]), 'Medium');
  assert.equal(level([{ detector: { id: 'shape' }, name: 'Shape Security', category: 'antibot', confidence: 80 }]), 'High');
});

test('only anti-bot and CAPTCHA count: a custom category of its own does not; a WAF does, as the category module groups it', () => {
  assert.equal(level([d('Tracker', 'Analytics', 90, 'High')]), 'Low');
  assert.equal(level([d('My WAF', 'WAF', 90, 'High')]), 'High');
  assert.equal(DetectionUtils.isProtection({ category: 'Fingerprint' }), false);
  assert.equal(DetectionUtils.isProtection({ detector: { category: 'CAPTCHA' } }), true);
});

test('a saved detection without a score counts as found, as History counts it', () => {
  assert.equal(level([{ detector: { name: 'Imported' }, category: 'Anti-Bot', difficulty: 'High' }]), 'High');
  assert.equal(level([{ detector: { name: 'Imported' }, category: 'Anti-Bot', confidence: 0, difficulty: 'High' }]), 'Low');
});

test('the shipped rules that only mention a hard vendor leave a page Low on their own', () => {
  let seen = 0;
  for (const category of ['antibot', 'captcha']) {
    for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(name => name.endsWith('.json'))) {
      const detector = JSON.parse(read(`detectors/${category}/${file}`));
      if (detector.difficulty !== 'High') continue;
      for (const rules of Object.values(detector.detection || {})) {
        for (const rule of Array.isArray(rules) ? rules : []) {
          if (!(rule && rule.confidence < DetectionUtils.PRESENT_CONFIDENCE)) continue;
          seen++;
          const found = { detector: { id: detector.id, name: detector.name, difficulty: 'High' }, category: detector.category, confidence: rule.confidence, difficulty: 'High' };
          assert.equal(level([found]), 'Low', `${detector.id}: ${rule.id} (${rule.confidence}%)`);
        }
      }
    }
  }
  assert.ok(seen >= 10, `the weak rules of the High detectors are found (${seen})`);
});

test('the Difficulty tip names what set the level, lists what was weighed, and says when nothing counts', () => {
  const page = [d('Cloudflare Bot Management', 'Anti-Bot', 95, 'Medium'), d('hCaptcha', 'CAPTCHA', 10, 'High'), d('Canvas Fingerprint', 'Fingerprint', 30, 'High')];
  const tip = FormatUtils.difficultyTip(page, level(page));
  assert.equal(tip.detail, 'Set by Cloudflare Bot Management');
  assert.deepEqual(tip.rows.map(row => [row.label, row.value]), [['Cloudflare Bot Management', 'Medium']], 'the mention and the fingerprinting are not listed as High');
  const none = FormatUtils.difficultyTip(fingerprints(3, 'High'), 'Low');
  assert.equal(none.detail, 'No anti-bot or CAPTCHA found at 50% or more');
  assert.deepEqual(none.rows, []);
  const several = [d('Akamai Bot Manager', 'Anti-Bot', 55, 'Low'), d('Cloudflare Turnstile', 'CAPTCHA', 55, 'Low')];
  assert.equal(FormatUtils.difficultyTip(several, level(several)).detail, 'Raised by 2 protections together');
  // The text is in every language
  const english = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(english.tipDifficultyNoneCounted.message, none.detail);
});

test('every place that shows a page difficulty asks DetectionUtils, with the detections only', () => {
  const askers = {
    'sections/detection/detection-ui.js': /getDifficultyInfo\(detections\)/,
    'sections/detection/detection-actions.js': /getDifficultyInfo\(detections\)/,
    'sections/detection/detection-modals.js': /getDifficultyInfo\(\[detection\]\)/,
    'sections/history/history.js': /DetectionUtils\.getDifficultyInfo\(detections\)/,
    'sections/stats/history-stats.js': /utils\.getDifficultyLevel\(detections\)/,
    'background/bulk-scan-runner.js': /DetectionUtils\.getDifficultyLevel\(results\)/
  };
  for (const [file, pattern] of Object.entries(askers)) assert.match(read(file), pattern, file);
  // No caller hands in an average of its own any more: the rule weighs only what counts
  const shipped = ['background', 'modules', 'sections', 'utils'].flatMap(function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
      const file = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : (file.endsWith('.js') ? [file] : []);
    });
  });
  for (const file of shipped) {
    assert.ok(!/getDifficulty(?:Info|Level)\([^()]*(?:\([^()]*\))?[^()]*,[^()]*\)/.test(read(file)), `${file} passes a second argument to the difficulty`);
  }
});
