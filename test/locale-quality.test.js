const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tokensOf, codeSpans, lineBreaks } = require('../scripts/lib/locale-tokens');
const { literalsOf, missingLiterals } = require('../scripts/lib/rule-literals');
const { fontCodePoints } = require('../scripts/lib/woff2-cmap');

// What a translation must keep, and the checks that hold every language to it.

const root = path.join(__dirname, '..');
const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8' });

test('placeholders, tags and URLs are tokens; a URL ends before the sentence punctuation after it', () => {
  assert.deepStrictEqual(tokensOf('Showing {0} of {1}'), ['{0}', '{1}']);
  assert.deepStrictEqual(tokensOf('Visit https://example.com/path. Then <b>go</b>.'), ['</b>', '<b>', 'https://example.com/path']);
  assert.deepStrictEqual(tokensOf('Hello'), []);
  assert.strictEqual(codeSpans('Use `.class` or `[attribute]`'), 2);
  assert.strictEqual(lineBreaks('a\nb\nc'), 2);
});

test('rule literals: names, patterns, paths and domains stay; prose and slashed word pairs do not', () => {
  assert.deepStrictEqual(literalsOf('Other cookies (bm_mi, bm_sv); short names'), ['bm_mi', 'bm_sv']);
  assert.deepStrictEqual(literalsOf('Sensor script under /akam/<version>/'), ['<version>', '/akam/']);
  assert.deepStrictEqual(literalsOf('Cookie shape hash~state~token'), ['hash~state~token']);
  assert.deepStrictEqual(literalsOf('CHEQ visitor/session id cookie'), [], 'visitor/session is prose');
  assert.deepStrictEqual(literalsOf('GDPR-compliant CAPTCHA service'), [], 'acronyms are translated or not as the language does');
  assert.ok(literalsOf('Ping to m1.openfpcdn.io for monitoring').includes('m1.openfpcdn.io'));
  assert.deepStrictEqual(missingLiterals('Cookie bm_sz is set', 'Cookie bm_sz es establecida'), []);
  assert.deepStrictEqual(missingLiterals('Cookie bm_sz is set', 'La cookie bm-sz se establece'), ['bm_sz'], 'a translated cookie name is caught');
});

test('the font reader lists the glyphs a bundled font draws', () => {
  const plex = fontCodePoints(path.join(root, 'assets/fonts/IBMPlexSans-Regular.woff2'));
  for (const letter of 'AaZz09ąćęłńóśźżčřšžťůěğşıİ') assert.ok(plex.has(letter.codePointAt(0)), `Plex Sans lacks ${letter}`);
  assert.ok(plex.has('ґ'.codePointAt(0)) && plex.has('ї'.codePointAt(0)), 'Plex Sans draws Ukrainian');
  assert.ok(plex.has('ệ'.codePointAt(0)), 'Plex Sans draws Vietnamese');
  assert.ok(!plex.has('ก'.codePointAt(0)), 'Plex Sans itself has no Thai: the script gets its own family');
  const thai = fontCodePoints(path.join(root, 'assets/fonts/IBMPlexSansThai-Regular.woff2'));
  for (const letter of 'กขคงจชซดตนบปมยรลวสหอะาิีึืุูเแโใไ่้๊๋์') assert.ok(thai.has(letter.codePointAt(0)), `IBM Plex Sans Thai lacks ${letter}`);
});

test('every shipped language passes the translation checks', () => {
  const ui = run('check-locale-quality.js');
  assert.strictEqual(ui.status, 0, ui.stdout + ui.stderr);
  const rules = run('check-rule-i18n.js');
  assert.strictEqual(rules.status, 0, rules.stdout + rules.stderr);
});

test('a broken translation is caught: lost placeholder, sister-language letters, over-long Web Store text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locale-quality-'));
  try {
    const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
    const withPlaceholder = Object.keys(en).find(k => /\{0\}/.test(en[k].message));
    const uk = {};
    for (const [key, v] of Object.entries(en)) uk[key] = { message: /[A-Za-z]{4,}/.test(v.message) ? 'Український текст' : v.message };
    uk[withPlaceholder] = { message: 'Текст без позначки' };              // the {0} is lost
    uk.btnCancel = { message: 'Отменить, ёжик' };                          // Russian letters (ё) in Ukrainian
    uk.extensionDescription = { message: 'Д'.repeat(140) };                // over the 132 characters of the Web Store
    fs.mkdirSync(path.join(dir, 'uk'));
    fs.writeFileSync(path.join(dir, 'uk', 'messages.json'), JSON.stringify(uk));
    const r = run('check-locale-quality.js', '--locale', 'uk', '--dir', dir, '--verbose');
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`${withPlaceholder}: placeholders/tokens differ`));
    assert.match(r.stdout, /btnCancel: has letters uk does not use/);
    assert.match(r.stdout, /extensionDescription: 140 characters \(Web Store limit 132\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
