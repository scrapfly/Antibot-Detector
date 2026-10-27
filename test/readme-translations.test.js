const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The README in other languages (docs/README.<code>.md): the user part of the
// English README (everything before Development) translated, then a short
// pointer to the English developer docs and the licence. These tests fail when
// the English user part changes shape (a section, table row, list item, code
// block or code span added or removed) and a translation was not updated.

const root = path.join(__dirname, '..');
const LANGUAGES = [
  { file: 'docs/README.zh-CN.md', name: '简体中文' },
  { file: 'docs/README.es.md', name: 'Español' },
  { file: 'docs/README.ru.md', name: 'Русский' }
];
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

// Lines outside fenced code blocks, so a `## ` or `| ` inside code is not structure
const prose = text => {
  let fenced = false;
  return text.split('\n').filter(line => {
    if (line.startsWith('```')) { fenced = !fenced; return false; }
    return !fenced;
  });
};

// GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens (letters of any script kept)
const slug = heading => heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
const anchors = text => new Set(prose(text).filter(l => /^#{1,6} /.test(l)).map(l => slug(l.replace(/^#+ /, ''))));

const sections = text => {
  const parts = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) parts.push({ title: line.slice(3).trim(), body: [] });
    else if (parts.length) parts[parts.length - 1].body.push(line);
  }
  return parts.map(p => ({ title: p.title, body: p.body.join('\n') }));
};

const shape = body => {
  const lines = prose(body);
  return {
    subsections: lines.filter(l => l.startsWith('### ')).length,
    tableRows: lines.filter(l => l.startsWith('|')).length,
    listItems: lines.filter(l => /^\s*(-|\d+\.) /.test(l)).length,
    codeBlocks: (body.match(/^```/gm) || []).length / 2,
    details: (body.match(/<details>/g) || []).length
  };
};

const codeSpans = text => new Set(prose(text).join('\n').match(/`[^`\n]+`/g) || []);

const english = read('README.md');
const englishSections = sections(english);
const developmentAt = englishSections.findIndex(s => s.title === 'Development');
const englishUser = englishSections.slice(0, developmentAt);
const englishUserText = english.slice(0, english.indexOf('\n## Development'));

test('the English README links every translation from its language bar', () => {
  const bar = ['**English**', ...LANGUAGES.map(l => `[${l.name}](${l.file})`)].join(' · ');
  assert.ok(english.includes(`\n${bar}\n`), `README.md should carry the language bar: ${bar}`);
  assert.ok(developmentAt > 0, 'README.md should have a Development section');
});

for (const language of LANGUAGES) {
  test(`${language.file} matches the English README`, () => {
    assert.ok(fs.existsSync(path.join(root, language.file)), `${language.file} is missing`);
    const text = read(language.file);

    const bar = [
      '[English](../README.md)',
      ...LANGUAGES.map(l => (l === language ? `**${l.name}**` : `[${l.name}](${path.basename(l.file)})`))
    ].join(' · ');
    assert.ok(text.includes(`\n${bar}\n`), `language bar should read: ${bar}`);

    const translated = sections(text);
    assert.equal(translated.length, englishUser.length + 2,
      `${englishUser.length} translated sections (${englishUser.map(s => s.title).join(', ')}), then developer docs and licence`);
    englishUser.forEach((section, i) => {
      const expected = shape(section.body);
      // Contents lists one developer section where English has Development, Writing a detector and Contributing
      if (i === 0) expected.listItems -= 2;
      assert.deepEqual(shape(translated[i].body), expected,
        `"${translated[i].title}" should have the shape of "${section.title}" (update the translation)`);
    });

    const ownSpans = codeSpans(text);
    for (const span of codeSpans(englishUserText)) {
      assert.ok(ownSpans.has(span), `${span} from the English README is missing`);
    }

    // The detector lists are names, copied as written
    const nameLines = englishUserText.split('\n').filter(l => l.split(' · ').length > 10);
    assert.equal(nameLines.length, 3);
    for (const line of nameLines) assert.ok(text.includes(`\n${line}\n`), `detector list changed: ${line.slice(0, 60)}…`);
  });

  test(`${language.file}: every link and image resolves`, () => {
    const text = read(language.file);
    const own = anchors(text);
    const englishAnchors = anchors(english);
    const targets = [
      ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]),
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    ].filter(t => !/^https?:/.test(t));
    assert.ok(targets.length > 10);
    for (const target of targets) {
      const [file, anchor] = target.split('#');
      if (!file) {
        assert.ok(own.has(decodeURIComponent(anchor)), `#${anchor} has no heading in ${language.file}`);
        continue;
      }
      const resolved = path.join(root, path.dirname(language.file), file);
      assert.ok(fs.existsSync(resolved), `${target} does not exist`);
      if (anchor) {
        assert.equal(path.relative(root, resolved), 'README.md', `${target}: anchors are only checked in README.md`);
        assert.ok(englishAnchors.has(anchor), `${target} has no heading in README.md`);
      }
    }
  });
}
