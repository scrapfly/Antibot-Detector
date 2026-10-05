const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function scanCard(html) {
  const start = html.indexOf('<div class="detection-scan-card"');
  assert.ok(start >= 0, 'scan card must be present');
  const tags = /<\/?div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  let tag;
  while ((tag = tags.exec(html))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex).replace(/\n\s*/g, '\n');
  }
  assert.fail('scan card must have balanced markup');
}

const popup = read('popup.html');
const detection = read('sections/detection/detection.html');
const card = scanCard(popup);

test('startup and live detection use identical scan cards', () => {
  assert.equal(scanCard(detection), card);
  assert.match(popup, /class="loading-state" style="display: flex;"/);
  assert.match(detection, /id="loadingState" class="loading-state" style="display: none;"/);
});

test('scan state announces its status while keeping visual activity decorative', () => {
  assert.match(card, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(card, /class="detection-scan-activity" aria-hidden="true"/);
  assert.equal((card.match(/class="detection-scan-bar"/g) || []).length, 5);
  assert.doesNotMatch(card, /detection-scan-icon|detection-scan-progress|<img\b/);
  assert.match(card, /<ul class="detection-scan-checks" role="list">/);
  assert.equal((card.match(/class="detection-scan-separator" aria-hidden="true">·/g) || []).length, 2);
  assert.doesNotMatch(card, /<svg\b|detection-scan-dot/);
});

test('scan categories describe coverage without pretending to report measured progress', () => {
  assert.equal((card.match(/class="detection-scan-check"/g) || []).length, 3);
  for (const key of ['categoryAntibot', 'categoryCaptcha', 'categoryFingerprint']) {
    assert.equal((card.match(new RegExp(`data-i18n="${key}"`, 'g')) || []).length, 1);
  }
  assert.doesNotMatch(card, /role="progressbar"|aria-valuenow|aria-valuemax|status-completed|\d+%|✓/);
  assert.doesNotMatch(card, /loading-spinner|spinner-svg|loading-text/);
});

test('scan categories are quiet wrapping labels rather than boxed controls', () => {
  const css = read('modules/styles/detection.css');
  const list = css.match(/\.detection-scan-checks\s*\{([^}]*)\}/)?.[1];
  const item = css.match(/\.detection-scan-check\s*\{([^}]*)\}/)?.[1];
  assert.ok(list);
  assert.ok(item);
  assert.match(list, /display: flex;/);
  assert.match(list, /flex-wrap: wrap;/);
  assert.match(list, /justify-content: center;/);
  assert.match(item, /display: inline-flex;/);
  assert.match(item, /color: var\(--text-secondary\);/);
  assert.doesNotMatch(item, /border\s*:|background\s*:|padding\s*:|min-height\s*:/);
  assert.doesNotMatch(css, /\.detection-scan-dot\b/);
});

test('all scan text has a nonempty translation in every supported locale', () => {
  const keys = [...card.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]);
  const localeDir = path.join(root, '_locales');
  const locales = fs.readdirSync(localeDir).filter(locale => fs.existsSync(path.join(localeDir, locale, 'messages.json')));
  assert.equal(locales.length, 12);
  for (const locale of locales) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of keys) {
      assert.ok(messages[key]?.message?.trim(), `${locale} must translate ${key}`);
    }
  }
});

test('scan content is centered without the old badge, card frame or progress track', () => {
  const css = read('modules/styles/detection.css');
  assert.match(css, /#detectionTab \.loading-state\s*\{[^}]*flex-direction: column;[^}]*align-items: center;[^}]*justify-content: center;/);
  const layout = css.match(/\.detection-scan-card\s*\{([^}]*)\}/)?.[1];
  assert.ok(layout);
  assert.match(layout, /display: flex;/);
  assert.match(layout, /flex-direction: column;/);
  assert.match(layout, /align-items: center;/);
  assert.match(layout, /text-align: center;/);
  assert.doesNotMatch(layout, /border\s*:|background\s*:/);
  assert.doesNotMatch(css, /\.detection-scan-icon\b|\.detection-scan-progress\b|detection-scan-sweep/);
});

test('scan styles wrap long text and leave all five signal bars static for reduced motion', () => {
  const css = read('modules/styles/detection.css');
  for (const selector of ['title', 'description', 'hint']) {
    assert.match(css, new RegExp(`\\.detection-scan-${selector}\\s*\\{[^}]*overflow-wrap: anywhere;`));
  }
  assert.match(css, /\.detection-scan-bar\s*\{[^}]*animation: detection-scan-wave /);
  assert.match(css, /@keyframes detection-scan-wave/);
  assert.match(css, /@media\s*\(prefers-reduced-motion: reduce\)\s*\{\s*\.detection-scan-bar\s*\{[^}]*animation: none !important;[^}]*transform: none;[^}]*opacity: 0\.65;/);
  assert.doesNotMatch(css, /\.loading-spinner\b|\.spinner-svg\b|\.spinner-circle\b/);
});
