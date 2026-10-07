const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// The MAIN world records these targets from document_start, before the stored
// hook definitions arrive (detection-engine-hooks.js, DEH_EARLY_HOOK_TARGETS).
// The list is generated from the bundled detectors and must not drift from them.
test('the early hook targets match the bundled detectors', () => {
  const script = path.join(__dirname, '..', 'scripts', 'gen-early-hook-targets.js');
  assert.doesNotThrow(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }),
    'run: node scripts/gen-early-hook-targets.js');
});
