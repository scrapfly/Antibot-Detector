const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// A rule in .gitignore wider than its author meant makes `git add` skip a new file without a word. Two did: "docs/*" (every new
// file under docs/ but the translated READMEs and the anti-bot pages) and an unanchored "test-*.js" / "test-*.html" (a new
// test/test-x.js or scripts/test-x.js). git is asked about paths that do not exist yet.

const root = path.join(__dirname, '..');
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
// --no-index judges the rules alone, whether or not a path is already tracked
const ignored = file => git('check-ignore', '-q', '--no-index', file).status === 0;
// No git, or these files copied out of a checkout: nothing to ask
const usable = (git('rev-parse', '--is-inside-work-tree').stdout || '').trim() === 'true';
const skip = usable ? false : 'git is not available here, or this is not a checkout';

test('a new file under docs/, test/ or scripts/ is not ignored', { skip }, () => {
  for (const file of ['docs/NEW.md', 'docs/notes/plan.md', 'docs/antibots/new.md', 'docs/README.xx.md', 'test/test-x.js', 'test/test-x.html', 'scripts/test-x.js']) {
    assert.equal(ignored(file), false, `${file} is ignored, so git add would skip it without a word (git check-ignore -v ${file} names the rule)`);
  }
});

test('scratch files at the repository root stay ignored', { skip }, () => {
  for (const file of ['test-scratch.js', 'test-scratch.html']) assert.equal(ignored(file), true, `${file} should stay out of git`);
});
