const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Copy buttons show "Copied!" for a moment and then put their own label back. Two clicks inside that moment used to take
// the feedback text for the label: the first timer restored it, the second found nothing, and the button stayed on "Copied!".
function load() {
  const timers = new Map();
  let next = 0;
  class HTMLInputElement {}
  class HTMLTextAreaElement {}
  const context = { console, Logger: { error() {} }, HTMLInputElement, HTMLTextAreaElement, NotificationHelper: { micro() {}, success() {} },
    navigator: { clipboard: { writeText: async () => {} } }, document: {},
    window: { setTimeout: (fn, delay) => { timers.set(++next, { fn, delay }); return next; }, clearTimeout: (id) => timers.delete(id) } };
  context.window.FormatUtils = undefined;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules/core/categories.js'), 'utf8'), context); // format-utils reads it when it loads
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'utils/format-utils.js'), 'utf8') + '\nglobalThis.FormatUtils = FormatUtils;', context);
  const button = (label) => ({ dataset: {}, textContent: label, innerHTML: `<b>${label}</b>`, classList: { add() {}, remove() {} } });
  const run = () => { const pending = [...timers.entries()]; timers.clear(); for (const [, t] of pending) t.fn(); };
  return { FormatUtils: context.FormatUtils, button, timers, run };
}

test('a second click on a copy button during the feedback keeps its label', async () => {
  const { FormatUtils, button, timers, run } = load();
  const el = button('Copy value');
  assert.equal(await FormatUtils.copyToClipboard('x', { element: el }), true);
  assert.match(el.textContent, /Copied!/);
  assert.equal(await FormatUtils.copyToClipboard('x', { element: el }), true, 'a second click inside the delay');
  assert.match(el.textContent, /Copied!/);
  assert.equal(timers.size, 1, 'one revert timer: the first was replaced, not stacked');
  run();
  assert.equal(el.innerHTML, '<b>Copy value</b>', 'the label and its markup are back');
  assert.equal(el.dataset.copyOriginal, undefined);
  assert.equal(el.dataset.copyOriginalHtml, undefined);
});

test('a copy after the feedback ended starts over from the label, and one click behaves as before', async () => {
  const { FormatUtils, button, run } = load();
  const el = button('Copy name');
  await FormatUtils.copyToClipboard('x', { element: el });
  run();
  assert.equal(el.innerHTML, '<b>Copy name</b>');
  await FormatUtils.copyToClipboard('x', { element: el });
  assert.match(el.textContent, /Copied!/);
  run();
  assert.equal(el.innerHTML, '<b>Copy name</b>');
});
