const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Hover tips with breakdowns: the History and Detection metric tiles explain
// their numbers (detections per category, the scores behind an average, what
// set the difficulty) through the shared Tooltip and data-tip-rows.

const root = path.join(__dirname, '..');
const FormatUtils = require('../utils/format-utils.js');
global.DetectionUtils = require('../utils/detection-utils.js');

const detections = [
  { detector: { name: 'Cloudflare Bot Management' }, category: 'Anti-Bot', confidence: 85, difficulty: 'Medium' },
  { detector: { name: 'hCaptcha' }, category: 'CAPTCHA', confidence: 90, difficulty: 'High' },
  { detector: { name: 'Canvas Fingerprint' }, category: 'fingerprint', confidence: 40 },
  { detector: { name: 'Audio Fingerprint' }, category: 'fingerprint', confidence: 30, difficulty: 'Low' },
  { detector: 'Legacy string detector', category: 'Something else', confidence: 55 }
];

const decode = (attrs) => {
  const get = (name) => {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
  };
  return { title: get('data-tip'), detail: get('data-tip-detail'), dot: get('data-tip-dot'), rows: JSON.parse(get('data-tip-rows') || '[]') };
};

test('category breakdown counts every category with its share, in a fixed order', () => {
  const b = FormatUtils.detectionBreakdown(detections);
  assert.strictEqual(b.total, 5);
  assert.deepStrictEqual(b.categories, [
    { key: 'antibot', count: 1, pct: 20 }, { key: 'captcha', count: 1, pct: 20 },
    { key: 'fingerprint', count: 2, pct: 40 }, { key: 'other', count: 1, pct: 20 }
  ]);
  assert.deepStrictEqual([b.min, b.max, b.average], [30, 90, 60]);
  assert.deepStrictEqual(b.scores.map(s => s.name), ['hCaptcha', 'Cloudflare Bot Management', 'Legacy string detector', 'Canvas Fingerprint', 'Audio Fingerprint']);
});

test('the Detections tip lists each category with count and share, like the category bar', () => {
  const tip = FormatUtils.detectionsTip(detections, 'Detections');
  assert.strictEqual(tip.title, 'Detections');
  assert.deepStrictEqual(tip.rows.map(r => [r.label, r.value, r.dot]), [
    ['Anti-bot', '1 · 20%', 'cat-antibot'], ['Captcha', '1 · 20%', 'cat-captcha'],
    ['Fingerprint', '2 · 40%', 'cat-fingerprint'], ['Other', '1 · 20%', 'cat-other']
  ]);
});

test('the Confidence tip names the range and the strongest detections, with tones', () => {
  const tip = FormatUtils.confidenceTip(detections, 'Confidence: 60%', 3);
  assert.strictEqual(tip.detail, 'Average of 5 detections, from 30% to 90%');
  assert.deepStrictEqual(tip.rows, [
    { label: 'hCaptcha', dot: 'cat-captcha', value: '90%', tone: 'red' },
    { label: 'Cloudflare Bot Management', dot: 'cat-antibot', value: '85%', tone: 'red' },
    { label: 'Legacy string detector', dot: 'cat-other', value: '55%', tone: 'amber' },
    { label: '+2 more' }
  ]);
  // One detection: no misleading "average of 1"
  assert.strictEqual(FormatUtils.confidenceTip(detections.slice(0, 1)).detail, 'Average confidence across detected protections.');
});

test('the Difficulty tip says which protection set the level, hardest first', () => {
  const level = DetectionUtils.getDifficultyLevel(detections);
  assert.strictEqual(level, 'High');
  const tip = FormatUtils.difficultyTip(detections, level, 'Difficulty: High');
  assert.strictEqual(tip.detail, 'Set by hCaptcha');
  assert.deepStrictEqual(tip.rows.slice(0, 2).map(r => [r.label, r.value, r.tone]), [['hCaptcha', 'High', 'red'], ['Cloudflare Bot Management', 'Medium', 'amber']]);
  assert.deepStrictEqual(tip.rows.at(-1), { label: '+1 more' });
  // Fingerprint-only pages stay Low and name their own level source
  const low = detections.slice(2, 4);
  assert.strictEqual(FormatUtils.difficultyTip(low, 'Low').detail, 'Set by Audio Fingerprint');
});

test('Medium raised by several protections together is explained as such', () => {
  const many = [1, 2, 3].map(i => ({ detector: { name: `Fingerprint ${i}` }, category: 'fingerprint', confidence: 30, difficulty: 'Low' }))
    .concat([{ detector: { name: 'Generic' }, category: 'Anti-Bot', confidence: 20, difficulty: 'Low' }]);
  const level = DetectionUtils.getDifficultyLevel(many);
  assert.strictEqual(level, 'Medium');
  assert.strictEqual(FormatUtils.difficultyTip(many, level).detail, 'Raised by 4 protections together');
});

test('tipAttrs escapes every value so names cannot break out of the attribute', () => {
  const attrs = FormatUtils.tipAttrs('A "quoted" <title>', "It's & more", [{ label: '"><img src=x onerror=alert(1)>', value: '1' }], 'cat-captcha');
  assert.ok(!/<img/.test(attrs));
  const back = decode(attrs);
  assert.strictEqual(back.title, 'A "quoted" <title>');
  assert.strictEqual(back.detail, "It's & more");
  assert.strictEqual(back.dot, 'cat-captcha');
  assert.strictEqual(back.rows[0].label, '"><img src=x onerror=alert(1)>');
});

test('the metric helpers keep their one-word tip unless a breakdown is passed', () => {
  assert.match(FormatUtils.confidenceHtml(70), /data-tip="Confidence"/);
  assert.match(FormatUtils.difficultyHtml('High', 'High'), /data-tip="Difficulty"/);
  const tip = FormatUtils.confidenceTip(detections, 'Confidence: 60%');
  const html = FormatUtils.confidenceHtml(60, 'history-metric', tip);
  assert.strictEqual(decode(html).title, 'Confidence: 60%');
  assert.strictEqual(decode(html).rows.length, tip.rows.length);
});

test('method hints cover every detection method, singular or plural', () => {
  for (const method of ['url', 'urls', 'header', 'headers', 'cookie', 'cookies', 'content', 'dom', 'js_hooks', 'window', 'payload']) {
    assert.ok(FormatUtils.methodHint(method).length > 10, method);
  }
  assert.strictEqual(FormatUtils.methodHint('nonsense'), '');
});

test('the Tooltip renders rows as text, skips bad JSON and never trusts dot classes', () => {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.classList = { add: c => { this.className = `${this.className || ''} ${c}`.trim(); }, toggle() {} }; this.style = {}; this.attrs = {}; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this.children = c; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
    hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
    removeAttribute(k) { delete this.attrs[k]; }
    getBoundingClientRect() { return { top: 100, bottom: 120, left: 10, width: 50, height: 20 }; }
    get textContent() { return this._text ?? this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = v; this.children = []; }
  }
  const body = new El('body');
  const doc = { readyState: 'complete', body, createElement: t => new El(t), createTextNode: t => Object.assign(new El('#text'), { _text: t }), addEventListener() {} };
  const ctx = vm.createContext({ document: doc, window: { innerHeight: 600, innerWidth: 400, addEventListener() {} }, JSON, Math });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/ui/tooltip.js'), 'utf8'), ctx);
  const target = new El('div');
  target.setAttribute('data-tip', 'Detections');
  target.setAttribute('data-tip-rows', JSON.stringify([
    { label: '<b>Captcha</b>', value: '3 · 60%', dot: 'cat-captcha' },
    { label: 'Bad dot', value: '1', dot: 'x" onmouseover="alert(1)' },
    { label: 'Toned', value: '90%', tone: 'red' }
  ]));
  ctx.Tooltip.show(target);
  const tip = body.children[0];
  const rows = tip.children.find(c => c.className === 'ui-tip-rows');
  assert.ok(rows, 'rows rendered');
  assert.strictEqual(rows.children.length, 3);
  const first = rows.children[0];
  assert.strictEqual(first.children[0].textContent, '<b>Captcha</b>', 'labels are text, not HTML');
  assert.match(first.children[0].children[0].className, /cat-captcha/);
  assert.strictEqual(rows.children[1].children[0].children[0].tagName, '#text', 'unsafe dot class is dropped');
  assert.match(rows.children[2].children[1].className, /tone-red/);
  target.setAttribute('data-tip-rows', '{not json');
  assert.strictEqual(ctx.Tooltip.rowsOf(target).length, 0);
});

test('every new tip string exists in all 12 locales with the same placeholders', () => {
  const locales = fs.readdirSync(path.join(root, '_locales'));
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  const keys = Object.keys(en).filter(k => /^tip[A-Z]/.test(k));
  assert.ok(keys.length >= 30);
  for (const locale of locales) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
    for (const key of keys) {
      const placeholders = s => (s.match(/\{\d\}/g) || []).sort().join();
      assert.ok(messages[key]?.message, `${locale}/${key}`);
      assert.strictEqual(placeholders(messages[key].message), placeholders(en[key].message), `${locale}/${key}`);
    }
  }
});
