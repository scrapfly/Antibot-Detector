const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// In the light theme a dropdown's arrow drawn in a pale colour (made for the dark theme) is white on white: the box no longer
// shows it is a dropdown. Every dropdown arrow drawn pale has a light-theme rule that draws it dark, and an Advanced tool
// without a logo shows its fallback shield in a colour that reads on its white tile.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function cssFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : cssFiles(rel);
    return entry.name.endsWith('.css') ? [rel] : [];
  });
}

const allCss = [...cssFiles('modules'), ...cssFiles('sections')].map(file => ({ file, css: read(file) }));
// The dropdown arrow's path, as every dropdown of the interface draws it
const ARROW = "M1.2 1.5L5 5.3l3.8-3.8";
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(match => ({ selectors: match[1].trim().split(',').map(s => s.trim()), body: match[2] }));
const arrowColour = (body) => {
  if (!body.includes(ARROW)) return null;
  const match = body.match(/stroke='%23([0-9a-fA-F]{6})'/);
  return match ? match[1] : null;
};

test('every dropdown arrow drawn pale for the dark theme is drawn dark in the light theme', () => {
  const light = new Map();
  for (const { css } of allCss) {
    for (const rule of rules(css)) {
      const colour = arrowColour(rule.body);
      if (!colour) continue;
      for (const selector of rule.selectors) {
        const bare = selector.replace(/^:root\[data-theme="light"\]\s*/, '');
        if (bare !== selector) light.set(bare, colour);
      }
    }
  }
  let pale = 0;
  for (const { file, css } of allCss) {
    for (const rule of rules(css)) {
      const colour = arrowColour(rule.body);
      if (!colour || luminance(colour) < 0.5) continue;
      for (const selector of rule.selectors) {
        if (selector.startsWith(':root[data-theme="light"]')) continue;
        pale++;
        assert.ok(light.has(selector), `${file}: ${selector} draws its arrow #${colour} and has no light-theme arrow`);
        assert.ok(luminance(light.get(selector)) < 0.5, `${selector}: the light-theme arrow is dark enough to see on a light field`);
      }
    }
  }
  assert.ok(pale >= 2, 'the shared dropdown and the Settings dropdowns are checked');
});

test('the fallback icon of an Advanced tool without a logo reads on its white tile in the light theme', () => {
  const lightTheme = read('modules/styles/theme-light.css');
  const rule = rules(lightTheme).find(r => r.selectors.includes(':root[data-theme="light"] .advanced-launch-icon'));
  assert.ok(rule, 'the light theme gives the tile its own icon colour');
  assert.match(rule.body, /color:\s*var\(--text-secondary\)/);
});
