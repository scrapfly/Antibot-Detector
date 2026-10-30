const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Advanced → Captures → "Current site": on a page with no host (about:blank, a file, a tab with no address) the list is
// empty. It used to show every capture, while the count beside it showed none.
function load() {
  const context = { console, Logger: { debug() {}, error() {}, warn() {} }, chrome: {}, AdvancedHistoryStore: {}, Advanced: function() {}, URL };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sections/advanced/history/controller.js'), 'utf8'), context);
  const self = Object.create(context.Advanced.prototype);
  self.captureFilters = { site: 'current', module: 'all' };
  return self;
}
const captures = [{ id: 1, site: 'a.com', moduleId: 'akamai' }, { id: 2, site: 'b.com', moduleId: 'akamai' }, { id: 3, site: 'a.com', moduleId: 'recaptcha' }];
const ids = (list) => Array.from(list, c => c.id); // an array of this realm: the one applyFilters returns comes from the script's

test('Current site lists the captures of that site, and none when the tab has no host', () => {
  const adv = load();
  assert.deepEqual(ids(adv.applyFilters(captures, 'a.com')), [1, 3]);
  for (const none of ['', null, undefined]) assert.deepEqual(ids(adv.applyFilters(captures, none)), [], `current site ${JSON.stringify(none)}`);
  adv.captureFilters.site = 'all';
  assert.deepEqual(ids(adv.applyFilters(captures, '')), [1, 2, 3], 'All sites is not affected');
  adv.captureFilters.site = 'b.com';
  assert.deepEqual(ids(adv.applyFilters(captures, '')), [2], 'a chosen site is not affected');
});
