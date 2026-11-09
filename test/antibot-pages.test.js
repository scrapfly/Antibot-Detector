const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildPage, buildIndex, slugOf, code, cell, signalsOf, combinationsOf, LANGS } = require('../scripts/lib/antibot-pages');
const { generate, listMarkdown } = require('../scripts/generate-antibot-pages');

// docs/antibots/*.md are generated from detectors/antibot/*.json (signals, difficulty, website) and
// scripts/lib/antibot-blurbs/<code>.json and the strings in scripts/lib/antibot-pages-i18n/<code>.json, one pair per language (the hand-written "what it is"). They must never drift: regenerate with
// node scripts/generate-antibot-pages.js.

const root = path.join(__dirname, '..');
const sample = {
  id: 'detect-demo', name: 'Demo', difficulty: 'High', website: 'https://demo.example/', version: '1.2.3', lastUpdated: '2026-01-02',
  description: 'Demo protection',
  detection: {
    cookie: [{ id: 'c', name: '^demo$|x', nameRegex: true, confidence: 100, description: 'Demo cookie' }],
    header: [{ id: 'h', name: '^server$', value: '^Demo$', confidence: 40, standalone: false, description: 'Demo header' }],
    url: [{ id: 'u', text: 'https://js.demo.example/`a`', confidence: 90, description: 'Demo script' }],
    window: [{ id: 'w', path: 'demoKey', condition: 'typeof string', confidence: 60, description: 'Key' }]
  },
  combinations: [{ id: 'k', name: 'Both', confidence: 95, when: { all: [{ pattern: 'c' }, { any: [{ pattern: 'u' }, { pattern: 'w' }] }] } }]
};

test('slugOf drops the detect- prefix', () => {
  assert.strictEqual(slugOf('detect-aws-waf'), 'aws-waf');
});

test('cell and code keep table rows intact', () => {
  assert.strictEqual(cell('a|b\nc'), 'a\\|b c');
  assert.strictEqual(code('a|b'), '`a\\|b`');
  assert.strictEqual(code('a`b'), '``a`b``');
});

test('signalsOf reads each kind and marks weak signals', () => {
  const s = signalsOf(sample);
  assert.strictEqual(s.cookie[0].confidence, '100%');
  assert.strictEqual(s.header[0].confidence, '40% (corroboration only)');
  assert.strictEqual(s.header[0].signal, '^server$: ^Demo$');
  assert.strictEqual(s.window[0].signal, 'demoKey (typeof string)');
});

test('combinationsOf describes the condition with the rules\' own texts', () => {
  assert.deepStrictEqual(combinationsOf(sample), [{ name: 'Both', confidence: '95%', when: 'Demo cookie and (Demo script or Key)' }]);
});

test('a page has the title, every section, the links and the signals', () => {
  const page = buildPage(sample, 'Demo is a made-up product.');
  assert.match(page, /^\*\*English\*\* \| .*\n\n# Demo bot protection: how to detect it \(and what it means for scraping\)\n/);
  for (const h of ['## What it is', '## How to tell a site uses Demo', '### Cookies', '### Response headers', '### Script and request URLs',
    '### JavaScript globals (window)', '### Combinations', '## Difficulty', '## What it means for scraping', '## Detect it with the extension']) {
    assert.ok(page.includes(h), h);
  }
  assert.ok(!page.includes('### DOM elements'), 'empty kinds are left out');
  assert.ok(page.includes('Demo is a made-up product.'));
  assert.ok(page.includes('**High.**'));
  assert.ok(page.includes('https://demo.example/'));
  assert.ok(page.includes('https://scrapfly.io/docs/scrape-api/anti-scraping-protection'));
  assert.ok(page.includes('(../../README.md)') && page.includes('(README.md)'));
  assert.ok(page.includes('4 public signals'));
});

test('the index lists every detector sorted by name with difficulty and link', () => {
  const idx = buildIndex([{ id: 'detect-b', name: 'Beta', difficulty: 'Low' }, { id: 'detect-a', name: 'Alpha', difficulty: 'High' }]);
  assert.ok(idx.indexOf('| Alpha | High | [Alpha](a.md) |') < idx.indexOf('| Beta | Low | [Beta](b.md) |'));
});

const lib = path.join(root, 'scripts', 'lib');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const flat = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const placeholders = text => [...new Set(String(text).match(/\{\w+\}/g) || [])].sort().join();
const detectorSlugs = () => fs.readdirSync(path.join(root, 'detectors', 'antibot')).filter(f => f.endsWith('.json')).map(f => slugOf(f.replace(/\.json$/, '')));

test('the languages are the README languages, English first', () => {
  assert.deepStrictEqual(LANGS.map(l => l.code), ['en', 'es', 'ru', 'zh-CN', 'ja', 'pt-BR', 'de', 'fr', 'ko']);
  for (const l of LANGS) assert.ok(fs.existsSync(path.join(root, 'docs', l.code === 'en' ? 'README.md' : `README.${l.code}.md`)) || l.code === 'en', l.code);
});

test('docs/antibots is exactly what the generator produces, in every language', () => {
  const files = generate(root);
  const dir = path.join(root, 'docs', 'antibots');
  assert.deepStrictEqual(listMarkdown(dir).sort(), Object.keys(files).sort());
  assert.strictEqual(Object.keys(files).length, LANGS.length * (detectorSlugs().length + 1));
  for (const [name, text] of Object.entries(files)) {
    assert.strictEqual(fs.readFileSync(path.join(dir, name), 'utf8'), text, `${name} is stale: run node scripts/generate-antibot-pages.js`);
  }
});

test('one page per anti-bot detector and one blurb per detector in every language, no stray blurb', () => {
  const ids = detectorSlugs().sort();
  for (const { code: lang } of LANGS) {
    const blurbs = readJson(path.join(lib, 'antibot-blurbs', `${lang}.json`));
    delete blurbs._note;
    assert.deepStrictEqual(Object.keys(blurbs).sort(), ids, lang);
    for (const id of ids) assert.ok(blurbs[id].length > 20 && !/\{|\}/.test(blurbs[id]) && !blurbs[id].includes('|'), `${lang}/${id}`);
  }
});

test('every language has every string the English table has, with the same placeholders and code spans', () => {
  const en = readJson(path.join(lib, 'antibot-pages-i18n', 'en.json'));
  for (const { code: lang } of LANGS) {
    const t = readJson(path.join(lib, 'antibot-pages-i18n', `${lang}.json`));
    assert.deepStrictEqual(flat(t).sort(), flat(en).sort(), lang);
    for (const key of Object.keys(en)) {
      assert.strictEqual(typeof t[key], 'string', `${lang}.${key}`);
      assert.ok(t[key].trim().length > 0, `${lang}.${key} is empty`);
      assert.ok(!t[key].includes('|'), `${lang}.${key} holds a pipe`);
      assert.strictEqual(placeholders(t[key]), placeholders(en[key]), `${lang}.${key} placeholders`);
      assert.deepStrictEqual((t[key].match(/`[^`]*`/g) || []).sort(), (en[key].match(/`[^`]*`/g) || []).sort(), `${lang}.${key} code spans`);
    }
    if (lang !== 'en') {
      const same = Object.keys(en).filter(k => t[k] === en[k] && /\s/.test(en[k].trim()) && !['notAvailable', 'linkApi', 'linkStore', 'linkAspShort'].includes(k));
      assert.deepStrictEqual(same, [], `${lang} left English sentences untranslated`);
    }
  }
});

test('every language page links to the same page in every language and to its own README', () => {
  const files = generate(root);
  for (const { code: lang } of LANGS) {
    const prefix = lang === 'en' ? '' : `${lang}/`;
    const page = files[`${prefix}akamai.md`];
    assert.ok(page.split('\n')[0].includes(`**${LANGS.find(l => l.code === lang).name}**`), lang);
    for (const other of LANGS.filter(l => l.code !== lang)) {
      const target = other.code === 'en' ? (lang === 'en' ? '' : '../') : (lang === 'en' ? `${other.code}/` : `../${other.code}/`);
      assert.ok(page.split('\n')[0].includes(`(${target}akamai.md)`), `${lang} -> ${other.code}`);
      const from = path.join(root, 'docs', 'antibots', prefix);
      assert.ok(fs.existsSync(path.join(from, `${target}akamai.md`)), `${lang} -> ${other.code} resolves`);
    }
    const readme = lang === 'en' ? '../../README.md' : `../../README.${lang}.md`;
    assert.ok(page.includes(`(${readme})`), lang);
    assert.ok(fs.existsSync(path.join(root, 'docs', 'antibots', prefix, readme)), `${lang} README resolves`);
  }
});

test('the project README links go to the README\'s own language index', () => {
  assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('](docs/antibots/README.md)'));
  for (const { code: lang } of LANGS.filter(l => l.code !== 'en')) {
    const text = fs.readFileSync(path.join(root, 'docs', `README.${lang}.md`), 'utf8');
    assert.ok(text.includes(`](antibots/${lang}/README.md)`), lang);
    assert.ok(!text.includes('](antibots/README.md)'), lang);
  }
});

test('generated pages hold no byte-order mark and no unescaped table pipe breaks', () => {
  const mark = String.fromCharCode(0xFEFF);
  for (const [name, text] of Object.entries(generate(root))) {
    assert.ok(!text.includes(mark), name);
    const lines = text.split('\n');
    const header = lines.find(l => l.startsWith('| ---')).split('|').length - 2;
    for (const line of lines.filter(l => l.startsWith('| ') && !l.startsWith('| ---'))) {
      const columns = line.replace(/\\\|/g, '').split('|').length - 2;
      assert.ok(columns === header, `${name}: ${line.slice(0, 80)}`);
    }
  }
});
