#!/usr/bin/env node
/**
 * Regenerates DEH_EARLY_HOOK_TARGETS in modules/detection/engine/detection-engine-hooks.js:
 * every enabled js_hooks target of the bundled detectors (detectors/index.json).
 * The MAIN world records calls to these from document_start, before the hook
 * definitions arrive from storage. test/early-hook-targets.test.js fails when the
 * list and the detectors drift apart.
 *
 *   node scripts/gen-early-hook-targets.js           rewrite the list
 *   node scripts/gen-early-hook-targets.js --check   exit 1 if it is out of date
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'modules/detection/engine/detection-engine-hooks.js');
const BEGIN = '// BEGIN generated: node scripts/gen-early-hook-targets.js';
const END = '// END generated';

function bundledHookTargets() {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'detectors/index.json'), 'utf8'));
  const targets = new Set();
  for (const [category, entry] of Object.entries(index)) {
    if (!entry || !Array.isArray(entry.detectors)) continue;
    for (const id of entry.detectors) {
      const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
      if (detector.enabled === false) continue;
      for (const hook of detector.detection?.js_hooks || []) {
        if (hook && hook.enabled !== false && typeof hook.target === 'string' && hook.target.trim()) {
          targets.add(hook.target.trim());
        }
      }
    }
  }
  return [...targets].sort();
}

function render(targets) {
  return [BEGIN,
    'const DEH_EARLY_HOOK_TARGETS = Object.freeze([',
    ...targets.map((t, i) => `    '${t}'${i < targets.length - 1 ? ',' : ''}`),
    ']);',
    END].join('\n');
}

const src = fs.readFileSync(FILE, 'utf8');
const start = src.indexOf(BEGIN);
const end = src.indexOf(END);
if (start < 0 || end < start) {
  console.error(`Markers not found in ${path.relative(root, FILE)}`);
  process.exit(2);
}
const next = src.slice(0, start) + render(bundledHookTargets()) + src.slice(end + END.length);
if (process.argv.includes('--check')) {
  if (next !== src) {
    console.error('DEH_EARLY_HOOK_TARGETS is out of date: run node scripts/gen-early-hook-targets.js');
    process.exit(1);
  }
  console.log('DEH_EARLY_HOOK_TARGETS up to date');
} else {
  fs.writeFileSync(FILE, next);
  console.log(`DEH_EARLY_HOOK_TARGETS: ${bundledHookTargets().length} targets`);
}

module.exports = { bundledHookTargets };
