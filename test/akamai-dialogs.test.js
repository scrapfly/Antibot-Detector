const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Akamai's result dialogs (Analyze Scripts, Extract Sensor Information,
// Capture Details) use the shared kit dialog: copyable rows, code blocks with
// their own Copy, and the main action in a fixed footer.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const copied = [];
  const context = {
    window: {}, self: {}, console, URL,
    Logger: { debug() {}, error() {}, warn() {}, ui() {} },
    AdvancedUtils: { copyToClipboard: (text, button) => { copied.push({ text, button }); } }
  };
  vm.createContext(context);
  vm.runInContext(read('utils/format-utils.js'), context);
  context.FormatUtils = context.self.FormatUtils;
  vm.runInContext(`${read('sections/advanced/base-advanced-module.js')}\nthis.BaseAdvancedModule = BaseAdvancedModule;`, context);
  vm.runInContext(`${read('sections/advanced/modules/akamai/akamai-advanced.js')}\nthis.AkamaiAdvanced = AkamaiAdvanced;`, context);
  vm.runInContext(read('sections/advanced/modules/akamai/akamai-advanced-ui.js'), context);
  const module = Object.create(context.AkamaiAdvanced.prototype);
  module.tabInfo = { url: 'https://shop.example.com/men/' };
  const opened = [];
  module.openKitModal = (opts) => { opened.push(opts); };
  return { context, module, opened, copied };
}

const evil = 'https://shop.example.com/a<img src=x onerror=alert(1)>/eGs';

test('Analyze Scripts: counts and level as rows, script URL escaped, Export Code in the footer', () => {
  const { module, opened } = load();
  let exported = null;
  module.showScriptParsingModal = (scripts, urls) => { exported = urls; };
  module.displayAnalysisModal({ scriptCount: 114, scripts: [], sensorDataUrls: [], akamaiScriptPath: evil, patterns: {}, cookies: { _abck: true }, sbsdUrls: [] });
  const [dialog] = opened;
  assert.equal(dialog.title, 'Akamai Analysis');
  assert.equal(dialog.subtitle, 'Found 1 relevant script(s)');
  assert.match(dialog.body, /class="adv-kit-facts"/);
  assert.match(dialog.body, /<dt>Total Scripts<\/dt>\s*<dd>114<\/dd>/);
  assert.match(dialog.body, /adv-kit-chip--blue">Standard</);
  assert.doesNotMatch(dialog.body, /<img src=x/);
  assert.match(dialog.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(dialog.actions.length, 1);
  assert.equal(dialog.actions[0].primary, true);
  dialog.actions[0].onClick();
  assert.deepEqual([...exported], [evil]);
});

test('Extract Sensor Information: payload in a code block, URL as a copyable row, Copy all as JSON', () => {
  const { module, opened, copied } = load();
  const sensor = '3;0;1;0;4273475;"<b>x</b>"';
  module.displaySensorDataModal({ sensorData: sensor, sensorScriptUrl: evil });
  const [dialog] = opened;
  assert.equal(dialog.subtitle, 'shop.example.com');
  assert.match(dialog.body, /class="adv-kit-code"/);
  assert.match(dialog.body, /Sensor Data \(\d+ chars\)/);
  assert.match(dialog.body, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(dialog.body, /<b>x<\/b>|<img src=x/);
  // No more Copy buttons laid over the text
  assert.doesNotMatch(dialog.body, /position:\s*absolute/);
  assert.match(dialog.body, /class="adv-kit-field"/);
  const button = {};
  dialog.actions[0].onClick(button);
  const json = JSON.parse(copied[0].text);
  assert.equal(json.sensorData, sensor);
  assert.equal(json.sensorScriptUrl, evil);
  assert.equal(copied[0].button, button);
});

test('Extract Sensor Information without data says so instead of an empty box', () => {
  const { module, opened } = load();
  module.displaySensorDataModal({});
  assert.match(opened[0].body, /adv-kit-note[^>]*>No sensor data captured</);
  assert.doesNotMatch(opened[0].body, /adv-kit-code"/);
});

test('Capture Details: cookie and level as chips, version and page copyable, challenges listed', () => {
  const { module } = load();
  const html = module.renderCaptureDetailsContent({ timestamp: 1700000000000, url: evil,
    captureData: { abckCookie: 'x', abckCookieLevel: 'easy', akamaiVersion: 'Akamai V3', requiresSbsd: true, requiresPixel: true } });
  assert.match(html, /<dt>ABCK Cookie<\/dt>\s*<dd><span class="adv-kit-chip adv-kit-chip--green">Found</);
  assert.match(html, /adv-kit-chip--green">Easy</);
  assert.match(html, /data-copy="Akamai V3"/);
  assert.match(html, /adv-kit-chip--red">SBSD Challenge</);
  assert.match(html, /adv-kit-chip--red">Pixel Challenge</);
  assert.doesNotMatch(html, /<img src=x/);
});

test('kitFacts escapes text values and skips empty rows', () => {
  const { context } = load();
  const html = context.BaseAdvancedModule.kitFacts([{ label: 'A<b>', value: '<i>1</i>' }, { label: 'Empty', value: '' }, null]);
  assert.match(html, /<dt>A&lt;b&gt;<\/dt>\s*<dd>&lt;i&gt;1&lt;\/i&gt;<\/dd>/);
  assert.doesNotMatch(html, /Empty/);
  assert.equal(context.BaseAdvancedModule.kitFacts([]), '');
});
