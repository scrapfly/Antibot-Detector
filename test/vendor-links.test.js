const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Detection details dialog: the vendor's website and the protection's page in docs/antibots, in the person's language.
// The addresses come from data (the detector's `website`, the generated docs pages), never from the view code.

const root = path.join(__dirname, '..');
const V = () => require('../modules/core/vendor-links.js');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const detectorsOf = (category) => fs.readdirSync(path.join(root, 'detectors', category))
  .filter(f => /^detect-.+\.json$/.test(f)).map(f => readJson(`detectors/${category}/${f}`));

test('the docs languages are the ones the pages are generated in', () => {
  const { LANGS } = require('../scripts/lib/antibot-pages.js');
  assert.deepEqual([...V().DOCS_LANGUAGES], LANGS.map(l => l.code));
});

test('every interface language reads its own docs when they exist, otherwise the English ones', () => {
  const expected = { en: 'en', es: 'es', ru: 'ru', zh_CN: 'zh-CN', ja: 'ja', pt_BR: 'pt-BR', de: 'de', fr: 'fr', ko: 'ko' };
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    assert.equal(V().docsLanguage(locale), expected[locale] || 'en', locale);
  }
  assert.equal(V().docsLanguage('es-419'), 'es', 'a regional Spanish reads the Spanish pages');
  assert.equal(V().docsLanguage('de-AT'), 'de');
  assert.equal(V().docsLanguage('pt-BR'), 'pt-BR');
  assert.equal(V().docsLanguage('pt-PT'), 'en', 'not the Brazilian pages');
  assert.equal(V().docsLanguage('zh-TW'), 'en', 'not the Simplified pages');
  assert.equal(V().docsLanguage('zh'), 'en');
  for (const junk of [undefined, null, '', 7, 'xx']) assert.equal(V().docsLanguage(junk), 'en', String(junk));
});

test('every official anti-bot detector links a docs page that exists, in every docs language', () => {
  const official = new Set(readJson('detectors/index.json').antibot.detectors);
  const antibot = detectorsOf('antibot');
  assert.ok(antibot.length > 40);
  for (const detector of antibot) {
    assert.ok(official.has(detector.id), `${detector.id} is an official detector (index.json)`);
    for (const language of V().DOCS_LANGUAGES) {
      const url = V().docsUrl(detector, { official: true, category: 'antibot', locale: language });
      assert.ok(url.startsWith(V().DOCS_URL), url);
      const file = path.join(root, 'docs', 'antibots', ...url.slice(V().DOCS_URL.length).split('/'));
      assert.ok(fs.existsSync(file), `${detector.id} (${language}): ${file}`);
    }
  }
  assert.equal(V().docsUrl({ id: 'detect-cloudflare' }, { official: true, category: 'antibot', locale: 'es' }),
    'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/es/cloudflare.md');
  assert.equal(V().docsUrl({ id: 'detect-cloudflare' }, { official: true, category: 'antibot', locale: 'uk' }),
    'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/cloudflare.md', 'no Ukrainian pages: English');
});

test('no docs page for CAPTCHAs, fingerprinting, custom detectors or odd ids', () => {
  assert.equal(V().docsUrl({ id: 'detect-recaptcha' }, { official: true, category: 'captcha', locale: 'en' }), '');
  assert.equal(V().docsUrl({ id: 'detect-canvas-fingerprint' }, { official: true, category: 'fingerprint', locale: 'en' }), '');
  assert.equal(V().docsUrl({ id: 'detect-cloudflare' }, { official: false, category: 'antibot', locale: 'en' }), '', 'a custom detector');
  for (const id of ['../x', 'detect-A B', '', null, 'detect-x/y']) {
    assert.equal(V().docsUrl({ id }, { official: true, category: 'antibot' }), '', String(id));
  }
  assert.equal(V().docsUrl(null, { official: true, category: 'antibot' }), '');
});

test('the website is the detector\'s own https address, only for official detectors', () => {
  let linked = 0;
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    for (const detector of detectorsOf(category)) {
      if (!detector.website) continue;
      assert.equal(V().websiteUrl(detector, { official: true }), new URL(detector.website).href, `${detector.id} links an https site`);
      linked++;
    }
  }
  assert.ok(linked > 80, 'nearly every detector names its site');
  assert.equal(V().websiteUrl({ website: 'https://www.hcaptcha.com/' }, { official: false }), '', 'nothing vouches for a custom detector\'s address');
  for (const website of ['http://example.com/', 'javascript:alert(1)', 'data:text/html,x', 'not a url', '', 7, null]) {
    assert.equal(V().websiteUrl({ website }, { official: true }), '', String(website));
  }
  assert.equal(V().websiteUrl({}, { official: true }), '');
});
