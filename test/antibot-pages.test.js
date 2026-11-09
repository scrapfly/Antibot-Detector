const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildPage, buildIndex, slugOf, code, cell, signalsOf, combinationsOf } = require('../scripts/lib/antibot-pages');
const { generate } = require('../scripts/generate-antibot-pages');

// docs/antibots/*.md are generated from detectors/antibot/*.json (signals, difficulty, website) and
// scripts/lib/antibot-blurbs.json (the hand-written "what it is"). They must never drift: regenerate with
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
  assert.match(page, /^# Demo bot protection: how to detect it \(and what it means for scraping\)\n/);
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

test('docs/antibots is exactly what the generator produces', () => {
  const files = generate(root);
  const dir = path.join(root, 'docs', 'antibots');
  const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  assert.deepStrictEqual(onDisk, Object.keys(files).sort());
  for (const [name, text] of Object.entries(files)) {
    assert.strictEqual(fs.readFileSync(path.join(dir, name), 'utf8'), text, `${name} is stale: run node scripts/generate-antibot-pages.js`);
  }
});

test('one page per anti-bot detector and one blurb per detector, no stray blurb', () => {
  const ids = fs.readdirSync(path.join(root, 'detectors', 'antibot')).filter(f => f.endsWith('.json')).map(f => slugOf(f.replace(/\.json$/, '')));
  const blurbs = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'lib', 'antibot-blurbs.json'), 'utf8'));
  delete blurbs._note;
  assert.deepStrictEqual(Object.keys(blurbs).sort(), ids.sort());
  for (const id of ids) assert.ok(blurbs[id].length > 40 && !/\{|\}/.test(blurbs[id]), id);
});

test('generated pages hold no byte-order mark and no unescaped table pipe breaks', () => {
  const mark = String.fromCharCode(0xFEFF);
  for (const [name, text] of Object.entries(generate(root))) {
    assert.ok(!text.includes(mark), name);
    for (const line of text.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| ---'))) {
      const columns = line.replace(/\\\|/g, '').split('|').length - 2;
      const header = text.split('\n').find(l => l.startsWith('| ---')).split('|').length - 2;
      assert.ok(columns === header, `${name}: ${line.slice(0, 80)}`);
    }
  }
});
