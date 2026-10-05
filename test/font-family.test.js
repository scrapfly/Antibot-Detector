// Every font in the extension is IBM Plex (the scrapfly.io typeface), reached
// through the --font-sans / --font-mono tokens or inheritance. This guard
// fails on any font-family, `font:` shorthand or style.fontFamily in the
// shipped CSS/HTML/JS that names anything else.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test', 'scripts']);

function shippedFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) shippedFiles(path.join(dir, entry.name), out);
    } else if (/\.(css|html|js)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const ALLOWED = new Set(['var(--font-sans)', 'var(--font-mono)', 'inherit']);

// The in-page notification is drawn inside web pages, where the extension's
// @font-face rules do not exist: it uses PAGE_NOTIFICATION_FONT_STACK (the
// bundled Plex installed as a FontFace, then a system fallback), passed into
// the injected function as `fontStack`.
// Every module draws through the one shared renderer (renderPageNotice).
const INJECTED_PAGE_NOTIFICATION = new Map([
  ['sections/advanced/base-interceptor-helpers.js', '${fontStack}']
]);

// Trim a captured value to the declaration: `${…}` placeholders are kept
// whole, a stray closing quote/bracket from an HTML attribute or template
// literal is dropped, and !important is ignored.
function clean(raw) {
  let value = raw.trim();
  value = value.startsWith('${') ? value.slice(0, value.indexOf('}') + 1) : value.split('}')[0];
  value = value.trim().replace(/\s*!important$/i, '').trim();
  for (const q of ['"', "'", '`']) {
    if (value.endsWith(q) && value.split(q).length % 2 === 0) value = value.slice(0, -1).trim();
  }
  return value.replace(/>$/, '').trim();
}

// `font:` shorthand is fine when its family part is a token
const shorthandUsesToken = (value) => /(^|\s)var\(--font-(sans|mono)\)$/.test(value);

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function fontFaceRanges(text) {
  const ranges = [];
  const re = /@font-face\s*\{[^}]*\}/g;
  let m;
  while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function findViolations(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const faces = fontFaceRanges(text);
  const inFace = (i) => faces.some(([a, b]) => i >= a && i < b);
  const found = [];

  const declaration = /font-family\s*:\s*([^;\n]+)/gi;
  let m;
  while ((m = declaration.exec(text))) {
    const value = clean(m[1]);
    if (ALLOWED.has(value)) continue;
    if (inFace(m.index) && /^['"]IBM Plex (Sans|Mono)( (Arabic|Devanagari|JP|KR|SC))?['"]$/.test(value)) continue;
    if (INJECTED_PAGE_NOTIFICATION.get(rel) === value) continue;
    found.push(`${rel}:${lineOf(text, m.index)} font-family: ${value}`);
  }

  const shorthand = /(?:^|[\s;{"'`])font\s*:\s*([^;\n]+)/gi;
  while ((m = shorthand.exec(text))) {
    const value = clean(m[1]);
    if (ALLOWED.has(value) || shorthandUsesToken(value)) continue;
    found.push(`${rel}:${lineOf(text, m.index)} font: ${value}`);
  }

  const scripted = /\.?fontFamily\s*[:=]\s*([^;,\n}]+)/g;
  while ((m = scripted.exec(text))) {
    const value = clean(m[1]).replace(/^['"`]|['"`]$/g, '');
    if (ALLOWED.has(value)) continue;
    found.push(`${rel}:${lineOf(text, m.index)} fontFamily = ${value}`);
  }

  const scriptedFont = /\.style\.font\s*=\s*([^;\n]+)/g;
  while ((m = scriptedFont.exec(text))) {
    found.push(`${rel}:${lineOf(text, m.index)} style.font = ${clean(m[1])}`);
  }
  return found;
}

test('no shipped CSS/HTML/JS declares a font other than the Plex tokens or inherit', () => {
  const violations = shippedFiles().flatMap(findViolations);
  assert.deepStrictEqual(violations, []);
});

test('the guard catches each way of bypassing the tokens', () => {
  const tmp = path.join(root, 'modules', 'styles', '__font_guard_probe__.css');
  fs.writeFileSync(tmp, [
    '.a { font-family: Arial, sans-serif; }',
    '.b { font: 12px monospace; }',
    '.c { font-family: var(--font-sans) !important; }',
    '.d { font: inherit; }',
    '.e { font: 600 11px/1 var(--font-sans); }',
    '@font-face { font-family: \'Comic Sans\'; src: url(x.woff2); }'
  ].join('\n'));
  try {
    const found = findViolations(tmp).map(v => v.replace(/^.*?:\d+ /, ''));
    assert.deepStrictEqual(found, ['font-family: Arial, sans-serif', "font-family: 'Comic Sans'", 'font: 12px monospace']);
  } finally {
    fs.unlinkSync(tmp);
  }
  const js = 'el.style.fontFamily = "Georgia"; x.style.font = "10px serif"; y.style.fontFamily = "var(--font-mono)";';
  const tmpJs = path.join(root, 'modules', 'ui', '__font_guard_probe__.js');
  fs.writeFileSync(tmpJs, js);
  try {
    const found = findViolations(tmpJs).map(v => v.replace(/^.*?:\d+ /, ''));
    assert.deepStrictEqual(found, ['fontFamily = Georgia', 'style.font = "10px serif"']);
  } finally {
    fs.unlinkSync(tmpJs);
  }
});

test('the tokens lead with IBM Plex, and elements the UA gives another font inherit them', () => {
  const common = fs.readFileSync(path.join(root, 'modules/styles/common.css'), 'utf8');
  assert.match(common, /--font-sans-ja:\s*'IBM Plex Sans'/);
  assert.match(common, /--font-sans-zh:\s*'IBM Plex Sans'/);
  assert.match(common, /--font-sans:\s*var\(--font-sans-ja\);/);
  assert.match(common, /--font-mono-ja:\s*'IBM Plex Mono'/);
  assert.match(common, /--font-mono-zh:\s*'IBM Plex Mono'/);
  assert.match(common, /--font-mono:\s*var\(--font-mono-ja\);/);
  // Form controls do not inherit the body font by default…
  assert.match(common, /button, input, select, textarea \{\s*font-family: inherit;/);
  // …and code/kbd/pre/samp default to the generic `monospace` (Consolas)
  assert.match(common, /code, kbd, pre, samp \{\s*font-family: var\(--font-mono\);/);
  for (const page of ['popup.html', 'sections/stats/stats.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /modules\/styles\/common\.css/, `${page} loads the font tokens`);
  }
});

test('the in-page notification installs the bundled Plex faces and names them first', () => {
  const helpers = fs.readFileSync(path.join(root, 'sections/advanced/base-interceptor-helpers.js'), 'utf8');
  assert.match(helpers, /const PAGE_NOTIFICATION_FONT_STACK = `'\$\{PAGE_NOTIFICATION_FONT_FAMILY\}', /);
  const files = [...helpers.matchAll(/\['(assets\/fonts\/IBMPlexSans-[A-Za-z]+\.woff2)'/g)].map(m => m[1]);
  assert.ok(files.length >= 2);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const rel of INJECTED_PAGE_NOTIFICATION.keys()) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(text, /injectPageNotificationFonts\(/, `${rel} installs the fonts before drawing`);
    // The shared notice draws in a Shadow DOM (\`* { … }\` inside it); the legacy injectors use the id selector
    assert.match(text, /(\[id\^="scrapfly-capture-notification"\] \* |\* \{ box-sizing: border-box; )[^\n]*font-family: \$\{fontStack\} !important;/, `${rel} applies the stack to every descendant`);
  }
});

// Arabic, Devanagari, Japanese, Korean and Chinese text has no glyphs in IBM
// Plex Sans: each script gets its IBM Plex family, bundled, fenced by a
// unicode-range so Latin-only pages never load it.
const SCRIPT_FACES = {
  Arabic: { weights: ['400', '500', '600', '700'], probe: 0x0627 },
  Devanagari: { weights: ['400', '500', '600', '700'], probe: 0x0939 },
  JP: { weights: ['100 500', '600 900'], probe: 0x3042 },
  KR: { weights: ['100 500', '600 900'], probe: 0xD55C },
  SC: { weights: ['100 500', '600 900'], probe: 0x4E2D }
};

function parseFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (prop) => (body.match(new RegExp(prop + '\\s*:\\s*([^;]+);')) || [])[1];
    return {
      family: (get('font-family') || '').replace(/['"]/g, ''),
      src: (body.match(/url\('([^']+)'\)/) || [])[1],
      weight: get('font-weight'),
      range: get('unicode-range')
    };
  });
}

function inRange(range, code) {
  return range.split(',').some((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16));
    return code >= a && code <= (b ?? a);
  });
}

test('each non-Latin script has its bundled IBM Plex family, off for Latin text', () => {
  const css = fs.readFileSync(path.join(root, 'modules/styles/common.css'), 'utf8');
  const faces = parseFaces(css);
  for (const [script, { weights, probe }] of Object.entries(SCRIPT_FACES)) {
    const family = `IBM Plex Sans ${script}`;
    const own = faces.filter(f => f.family === family);
    assert.deepStrictEqual(own.map(f => f.weight), weights, family);
    for (const face of own) {
      const file = path.join(root, 'modules/styles', face.src);
      assert.ok(fs.existsSync(file), face.src);
      assert.ok(face.range, `${family} ${face.weight} has a unicode-range`);
      assert.ok(inRange(face.range, probe), `${family} covers U+${probe.toString(16)}`);
      for (const latin of [0x41, 0x61, 0x30, 0x20, 0xE9, 0x2014]) {
        assert.ok(!inRange(face.range, latin), `${family} would load for U+${latin.toString(16)}`);
      }
    }
  }
  // Plex Sans first, then the scripts; Chinese text puts SC ahead of JP
  const stack = (name) => (css.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepStrictEqual(stack('font-sans-ja').slice(0, 6),
    ['IBM Plex Sans', 'IBM Plex Sans Arabic', 'IBM Plex Sans Devanagari', 'IBM Plex Sans JP', 'IBM Plex Sans KR', 'IBM Plex Sans SC']);
  assert.deepStrictEqual(stack('font-sans-zh').slice(0, 6),
    ['IBM Plex Sans', 'IBM Plex Sans Arabic', 'IBM Plex Sans Devanagari', 'IBM Plex Sans SC', 'IBM Plex Sans JP', 'IBM Plex Sans KR']);
  assert.deepStrictEqual(stack('font-mono-ja').slice(0, 6),
    ['IBM Plex Mono', 'IBM Plex Sans Arabic', 'IBM Plex Sans Devanagari', 'IBM Plex Sans JP', 'IBM Plex Sans KR', 'IBM Plex Sans SC']);
  assert.deepStrictEqual(stack('font-mono-zh').slice(0, 6),
    ['IBM Plex Mono', 'IBM Plex Sans Arabic', 'IBM Plex Sans Devanagari', 'IBM Plex Sans SC', 'IBM Plex Sans JP', 'IBM Plex Sans KR']);
  assert.match(css, /:root:lang\(zh\) \{\s*--font-sans: var\(--font-sans-zh\);\s*--font-mono: var\(--font-mono-zh\);/);
});

test('every bundled font file is tracked by git (not swallowed by .gitignore)', () => {
  const { execFileSync } = require('node:child_process');
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-o', '-c', '--exclude-standard', 'assets/fonts'], { cwd: root, encoding: 'utf8' });
  } catch (_) {
    return; // not a git checkout (packaged copy): nothing to check
  }
  const listed = new Set(tracked.split('\n').filter(Boolean));
  for (const file of fs.readdirSync(path.join(root, 'assets/fonts'))) {
    assert.ok(listed.has(`assets/fonts/${file}`), `assets/fonts/${file} is ignored by git`);
  }
});
