const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection details dialog, under the description: what the difficulty level means for this protection, the vendor's website,
// the protection's page in docs/antibots (in the person's language) and Open tools, which goes to the Advanced tools for it.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function el() {
  const attrs = {};
  const listeners = {};
  return {
    hidden: false, textContent: '', attrs,
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return name in attrs ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    click() { (listeners.click || []).forEach(fn => fn({ preventDefault() {} })); }
  };
}

function load({ locale = 'en', minConfidence = 50 } = {}) {
  const context = vm.createContext({ console, self: {}, URL, setTimeout, Promise });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/vendor-links.js',
    'modules/advanced/captcha-vendors.js', 'modules/advanced/vendor-registry.js', 'sections/detection/detection-modals.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.I18n = { locale: () => locale, format: () => null, tr: (k, fb) => fb };
  context.DetectionUtils.setOfficialDetectorIds(['detect-cloudflare', 'detect-recaptcha', 'detect-canvas-fingerprint']);
  const requested = [];
  const switched = [];
  context.Advanced = {
    MIN_TOOL_CONFIDENCE: 50,
    readMinToolConfidence: async () => minConfidence,
    requestTools: (id) => requested.push(id)
  };
  context.window = { popupInstance: { switchTab: async (tab) => { switched.push(tab); } } };
  return { context, requested, switched };
}

const DEFINITIONS = {
  antibot: { 'detect-cloudflare': { id: 'detect-cloudflare', name: 'Cloudflare Bot Management', author: 'Scrapfly', website: 'https://www.cloudflare.com/products/bot-management/', difficulty: 'Medium' } },
  captcha: { 'detect-recaptcha': { id: 'detect-recaptcha', name: 'reCAPTCHA', author: 'Scrapfly', website: 'https://www.google.com/recaptcha/' },
    'detect-mine': { id: 'detect-mine', name: 'Mine', author: 'Someone', website: 'https://mine.example/' } },
  fingerprint: { 'detect-canvas-fingerprint': { id: 'detect-canvas-fingerprint', name: 'Canvas', author: 'Scrapfly', website: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' } }
};

function modal(context) {
  const elements = { difficultyNote: el(), links: el(), website: el(), docs: el(), openTools: el() };
  const self = {
    modalElements: elements,
    detectorManager: { getAllDetectors: () => DEFINITIONS },
    closed: 0,
    closeDetectionModal() { this.closed++; }
  };
  context.DetectionModals.bindAboutLinks.call(self);
  return { self, elements };
}

const detection = (id, category, confidence) => ({ detector: { id, name: id }, category, confidence });
const render = async (context, self, d, difficulty) => {
  await context.DetectionModals.renderAbout.call(self, d, difficulty);
};

test('the difficulty line says what the level means', async () => {
  const { context } = load();
  const { self, elements } = modal(context);
  for (const [level, words] of [['Low', /usually/i], ['Medium', /challenge/i], ['High', /hard/i]]) {
    await render(context, self, detection('detect-cloudflare', 'Anti-Bot', 90), level);
    assert.equal(elements.difficultyNote.hidden, false, level);
    assert.match(elements.difficultyNote.textContent, words, level);
  }
  await render(context, self, detection('detect-cloudflare', 'Anti-Bot', 90), 'Unknown');
  assert.equal(elements.difficultyNote.hidden, true, 'nothing to explain');
});

test('an official anti-bot links its website and its docs page in the person\'s language', async () => {
  const { context } = load({ locale: 'es' });
  const { self, elements } = modal(context);
  await render(context, self, detection('detect-cloudflare', 'Anti-Bot', 90), 'Medium');
  assert.equal(elements.links.hidden, false);
  assert.equal(elements.website.hidden, false);
  assert.equal(elements.website.getAttribute('href'), 'https://www.cloudflare.com/products/bot-management/');
  assert.equal(elements.docs.hidden, false);
  assert.equal(elements.docs.getAttribute('href'), 'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/es/cloudflare.md');
  for (const link of [elements.website, elements.docs]) {
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  }
});

test('a language without docs pages gets the English page', async () => {
  const { context } = load({ locale: 'uk' });
  const { self, elements } = modal(context);
  await render(context, self, detection('detect-cloudflare', 'Anti-Bot', 90), 'Medium');
  assert.equal(elements.docs.getAttribute('href'), 'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/cloudflare.md');
});

test('CAPTCHAs and fingerprinting have a website but no docs page; a custom detector has neither', async () => {
  const { context } = load();
  const { self, elements } = modal(context);
  await render(context, self, detection('detect-recaptcha', 'CAPTCHA', 30), 'Medium');
  assert.equal(elements.website.hidden, false);
  assert.equal(elements.website.getAttribute('href'), 'https://www.google.com/recaptcha/');
  assert.equal(elements.docs.hidden, true);
  assert.equal(elements.docs.getAttribute('href'), null, 'no stale address left behind');
  await render(context, self, detection('detect-canvas-fingerprint', 'Fingerprint', 30), 'Low');
  assert.equal(elements.website.hidden, false);
  assert.equal(elements.docs.hidden, true);
  await render(context, self, detection('detect-mine', 'CAPTCHA', 90), 'Low');
  assert.equal(elements.website.hidden, true, 'nothing vouches for the address a custom detector carries');
  assert.equal(elements.website.getAttribute('href'), null);
  assert.equal(elements.docs.hidden, true);
  assert.equal(elements.openTools.hidden, true);
  assert.equal(elements.links.hidden, true, 'no row when there is nothing in it');
});

test('Open tools shows for a protection with Advanced tools above the minimum, and goes to them', async () => {
  const { context, requested, switched } = load();
  const { self, elements } = modal(context);
  await render(context, self, detection('detect-recaptcha', 'CAPTCHA', 90), 'Medium');
  assert.equal(elements.openTools.hidden, false);
  elements.openTools.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requested, ['detect-recaptcha'], 'Advanced is told which protection to open');
  assert.equal(self.closed, 1, 'the dialog closes');
  assert.deepEqual(switched, ['advanced']);
});

test('no Open tools without Advanced tools for the vendor, or at or below the minimum confidence', async () => {
  const { context } = load({ minConfidence: 60 });
  const { self, elements } = modal(context);
  await render(context, self, detection('detect-canvas-fingerprint', 'Fingerprint', 100), 'Low');
  assert.equal(elements.openTools.hidden, true, 'no tools for this one');
  await render(context, self, detection('detect-recaptcha', 'CAPTCHA', 60), 'Medium');
  assert.equal(elements.openTools.hidden, true, 'Advanced would not list it');
  await render(context, self, detection('detect-recaptcha', 'CAPTCHA', 61), 'Medium');
  assert.equal(elements.openTools.hidden, false);
});

test('the dialog has the line, the links and the button, and the popup loads the links module before it', () => {
  const html = read('sections/detection/detection.html');
  const modalHtml = html.slice(html.indexOf('id="detectionDetailModal"'));
  for (const id of ['detectionModalDifficultyNote', 'detectionModalLinks', 'detectionModalWebsite', 'detectionModalDocs', 'detectionModalOpenTools']) {
    assert.match(modalHtml, new RegExp(`id="${id}"`), id);
  }
  assert.match(modalHtml, /id="detectionModalWebsite"[^>]*>[\s\S]*?data-i18n="detectionModalWebsite"/);
  assert.match(modalHtml, /id="detectionModalDocs"[^>]*>[\s\S]*?data-i18n="detectionModalDocs"/);
  assert.match(modalHtml, /<button type="button" id="detectionModalOpenTools"[^>]*>[\s\S]*?data-i18n="advancedToolsLoadTools"/);
  const popup = [...read('popup.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(popup.includes('modules/core/vendor-links.js'));
  assert.ok(popup.indexOf('modules/core/vendor-links.js') < popup.indexOf('sections/detection/detection-modals.js'));
  // No vendor address is written in the view code: they come from the detectors' JSON
  assert.doesNotMatch(read('sections/detection/detection-modals.js'), /https?:\/\//);
});

test('every language explains the three levels and names the links, translated', () => {
  const keys = ['detectionModalDifficultyLow', 'detectionModalDifficultyMedium', 'detectionModalDifficultyHigh', 'detectionModalWebsite', 'detectionModalDocs'];
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const key of keys) assert.ok(en[key] && en[key].message && en[key].description, key);
  for (const locale of fs.readdirSync(path.join(root, '_locales')).filter(name => name !== 'en')) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of keys) {
      assert.ok(messages[key] && messages[key].message.trim(), `${locale}: ${key}`);
      if (key.startsWith('detectionModalDifficulty')) assert.notEqual(messages[key].message, en[key].message, `${locale}: ${key} is translated`);
    }
  }
});
