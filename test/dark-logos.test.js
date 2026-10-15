const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Dark theme logos: assets/logos-dark/ holds a copy of every brand logo without
// the white square baked into the icon (scripts/generate-dark-logos.js). Rules
// cards and Advanced's supported protections show it; the light theme shows
// the original.

const root = path.join(__dirname, '..');
const iconDir = path.join(root, 'detectors/icons');
const darkDir = path.join(root, 'assets/logos-dark');
const pngSize = file => { const head = fs.readFileSync(file).subarray(16, 24); return [head.readUInt32BE(0), head.readUInt32BE(4)]; };

test('every brand logo has a dark copy of the same size, and nothing else is there', () => {
  const brand = fs.readdirSync(iconDir).filter(file => /_official\.png$/.test(file) || file === 'custom.png').sort();
  assert.ok(brand.length >= 34);
  assert.deepEqual(fs.readdirSync(darkDir).sort(), brand, 'run: node scripts/generate-dark-logos.js');
  for (const file of brand) assert.deepEqual(pngSize(path.join(darkDir, file)), pngSize(path.join(iconDir, file)), file);
  // Every detector's brand logo is one of them
  for (const category of ['antibot', 'captcha']) {
    for (const file of fs.readdirSync(path.join(root, 'detectors', category)).filter(name => name.endsWith('.json'))) {
      const { icon } = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, file), 'utf8'));
      if (/_official\.png$/.test(icon || '')) assert.ok(brand.includes(icon), `${file}: ${icon}`);
    }
  }
});

test('Rules cards show the dark copy of a brand logo, and the original for the light theme', () => {
  const context = { Rules: function Rules() {}, I18n: { get: () => null, format: () => null },
    FormatUtils: { escapeHtml: s => String(s || ''), escapeAttr: s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
    chrome: { runtime: { getURL: p => 'chrome-extension://x/' + p } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules-formatters.js'), 'utf8'), context);
  const rules = new context.Rules();
  const html = rules.getDetectorIcon({ name: 'Akamai Bot Manager', icon: 'akamai_official.png' }, 'antibot');
  assert.match(html, /^<span class="detector-logo"><img src="assets\/logos-dark\/akamai_official\.png" [^>]*class="detector-icon-img detector-logo-dark" data-fallback="detectors\/icons\/akamai_official\.png">/);
  assert.match(html, /<img src="detectors\/icons\/akamai_official\.png" alt="" class="detector-icon-img detector-logo-light" data-fallback="chrome-extension:\/\/x\/icons\/icon128\.png"><\/span>$/);
  // The Scrapfly default and fingerprint icons are unchanged
  assert.doesNotMatch(rules.getDetectorIcon({ name: 'BotGuard', icon: 'custom.png' }, 'antibot'), /logos-dark/);
  assert.doesNotMatch(rules.getDetectorIcon({ name: 'Canvas', icon: 'canvas_fingerprint.png' }, 'fingerprint'), /logos-dark/);
  // The light theme hides the copy and shows the original
  const light = fs.readFileSync(path.join(root, 'modules/styles/theme-light.css'), 'utf8');
  assert.match(light, /:root\[data-theme="light"\] \.detector-logo \.detector-logo-dark \{\s*display: none;/);
  assert.match(light, /:root\[data-theme="light"\] \.detector-logo \.detector-logo-light \{\s*display: inline;/);
});
