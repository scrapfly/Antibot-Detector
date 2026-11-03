const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Every form control in the pages' HTML has a name a screen reader can say. A switch with only a slider next to it reads "checkbox,
// not checked": the person cannot tell which setting it is. The pages are static HTML; what JavaScript builds (the rule list's
// switches, the dialogs) is checked in the browser by `npm run e2e:controls`.

const root = path.join(__dirname, '..');
const PAGES = ['popup.html', ...fs.readdirSync(path.join(root, 'sections'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry => fs.readdirSync(path.join(root, 'sections', entry.name)).filter(name => name.endsWith('.html')).map(name => `sections/${entry.name}/${name}`))];

const ATTR = (attrs, name) => (new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs) || [])[1];
// Text now, or text that the translation system writes in (data-i18n) when the page opens
const hasText = (inner, attrs = '') => /\S/.test(inner.replace(/<[^>]*>/g, '')) || /\bdata-i18n="[^"]+"/.test(`${attrs} ${inner}`);
const TEXT_LIKE = ['text', 'search', 'url', 'email', 'tel', 'password', 'number'];

/** The controls of one page that have no name, as 'tag#id (line n)'. */
function unnamedControls(html) {
  const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)].map(m => ({ attrs: m[1], inner: m[2], start: m.index, end: m.index + m[0].length }));
  const textOfId = (id) => {
    const tag = new RegExp(`<([a-z0-9]+)\\b([^>]*\\bid="${id}"[^>]*)>([^<]*)`, 'i').exec(html);
    return tag ? hasText(tag[3], tag[2]) : false;
  };
  const found = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const type = (ATTR(attrs, 'type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
    // A file picker is a hidden input that a button opens; the button has the name
    if (['hidden', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    const id = ATTR(attrs, 'id');
    const named = !!(ATTR(attrs, 'aria-label') || ATTR(attrs, 'data-i18n-aria-label'))
      || (ATTR(attrs, 'aria-labelledby') || '').split(/\s+/).filter(Boolean).some(textOfId)
      || (id && labels.some(label => ATTR(label.attrs, 'for') === id && hasText(label.inner, label.attrs)))
      || labels.some(label => m.index > label.start && m.index < label.end && hasText(label.inner.replace(m[0], ''), label.attrs))
      || !!(ATTR(attrs, 'title') || ATTR(attrs, 'data-i18n-title'))
      || (TEXT_LIKE.includes(type) || tag === 'textarea') && !!(ATTR(attrs, 'placeholder') || ATTR(attrs, 'data-i18n-placeholder'));
    if (!named) found.push(`${tag}${id ? `#${id}` : ''} (line ${html.slice(0, m.index).split('\n').length})`);
  }
  return found;
}

test('every form control in the pages has a name', () => {
  const missing = {};
  for (const page of PAGES) {
    const list = unnamedControls(fs.readFileSync(path.join(root, page), 'utf8'));
    if (list.length) missing[page] = list;
  }
  assert.deepEqual(missing, {});
});

test('the check sees what it should: a switch with no text, an empty label, a missing target; and accepts the real ways to name', () => {
  const bad = [
    '<label class="switch"><input type="checkbox" id="a"><span class="slider"></span></label>',
    '<label class="switch" for="b"><input type="checkbox" id="b"></label>',
    '<input type="checkbox" id="c" aria-labelledby="nowhere">',
    '<select id="d"></select>',
    '<span id="e">   </span><input type="number" id="f" aria-labelledby="e">'
  ];
  for (const html of bad) assert.equal(unnamedControls(html).length, 1, html);
  const good = [
    '<span id="t" data-i18n="key">Text</span><input type="checkbox" id="a" aria-labelledby="t">',
    '<label for="b">Name</label><input type="number" id="b">',
    '<label>Name <input type="text" id="c"></label>',
    '<input type="text" id="d" placeholder="Search">',
    '<input type="checkbox" id="e" aria-label="Enable">',
    '<label class="x" for="f" data-i18n="key"></label><select id="f"></select>',
    '<input type="file" id="g">'
  ];
  for (const html of good) assert.deepEqual(unnamedControls(html), [], html);
});

test('the pages were found (a list of no pages would pass)', () => {
  assert.ok(PAGES.length >= 8, PAGES.join(', '));
  assert.ok(PAGES.includes('sections/settings/settings.html') && PAGES.includes('sections/rules/rules.html'));
  const controls = PAGES.reduce((sum, page) => sum + (fs.readFileSync(path.join(root, page), 'utf8').match(/<(input|select|textarea)\b/gi) || []).length, 0);
  assert.ok(controls >= 140, `controls seen: ${controls}`);
});

test('a notification is announced: the container is a polite live region and an error is an alert', () => {
  const source = fs.readFileSync(path.join(root, 'modules/ui/notification-manager.js'), 'utf8');
  assert.match(source, /container\.setAttribute\('role', 'status'\)/);
  assert.match(source, /container\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /safeType === 'error'\) toast\.setAttribute\('role', 'alert'\)/);
});
