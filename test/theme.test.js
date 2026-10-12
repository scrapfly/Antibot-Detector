const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Theme: Dark (default), Light (Scrapfly palette) or System,
// applied before the first paint from a localStorage copy.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load({ cached = null, stored, prefersLight = false } = {}) {
  const attrs = {};
  const local = new Map(cached ? [['scrapfly_theme', cached]] : []);
  const listeners = [];
  const writes = [];
  const ctx = {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
    localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v) },
    matchMedia: () => ({ matches: prefersLight, addEventListener() {} }),
    chrome: { storage: {
      local: { get: async () => (stored ? { scrapfly_theme: stored } : {}), set: async (o) => { writes.push(o); } },
      onChanged: { addListener: fn => listeners.push(fn) }
    } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('modules/core/theme.js'), ctx);
  return { ctx, attrs, local, listeners, writes, theme: ctx.ScrapflyTheme };
}

test('the cached choice paints first, storage confirms it, Dark is the default', async () => {
  let t = load();
  assert.strictEqual(t.attrs['data-theme'], 'dark');
  t = load({ cached: 'light', stored: 'light' });
  assert.strictEqual(t.attrs['data-theme'], 'light', 'applied synchronously from the cache');
  t = load({ cached: 'light', stored: 'dark' });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(t.attrs['data-theme'], 'dark', 'storage wins when the cache is stale');
  assert.strictEqual(t.local.get('scrapfly_theme'), 'dark');
});

test('System follows the browser; set() saves and applies; other pages follow storage changes', async () => {
  const t = load({ prefersLight: true });
  assert.strictEqual(t.theme.resolve('system'), 'light');
  assert.strictEqual(t.theme.resolve('nonsense'), 'dark');
  await t.theme.set('system');
  assert.strictEqual(t.attrs['data-theme'], 'light');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.writes)), [{ scrapfly_theme: 'system' }]);
  t.listeners.forEach(fn => fn({ scrapfly_theme: { newValue: 'dark' } }, 'local'));
  assert.strictEqual(t.attrs['data-theme'], 'dark');
});

test('both pages load the theme before their stylesheets paint, and the light rules stay scoped', () => {
  for (const file of ['popup.html', 'sections/stats/stats.html']) {
    const html = read(file);
    assert.ok(html.indexOf('core/theme.js') > 0 && html.indexOf('core/theme.js') < html.indexOf('</head>'), file);
    assert.ok(html.includes('theme-light.css'), file);
  }
  const css = read('modules/styles/theme-light.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.split('}').map(r => r.split('{')[0]).join(',').split(',').map(s => s.trim()).filter(Boolean);
  assert.ok(selectors.every(s => s.startsWith(':root[data-theme="light"]')), 'every light rule is scoped');
});
