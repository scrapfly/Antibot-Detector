const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The Advanced tab's vendor names and categories come from one place, the vendor registry
// (modules/advanced/vendor-registry.js). A vendor described as data in captcha-vendors.js, or a new
// one added to the registry, needs no entry in the base module: the notifications and titles
// already read it from there.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const context = vm.createContext({ AdvancedCaptchaVendors: require('../modules/advanced/captcha-vendors.js'), Logger: { debug() {} } });
vm.runInContext(read('modules/advanced/vendor-registry.js'), context);
vm.runInContext(read('sections/advanced/base-advanced-module.js'), context);
const Base = vm.runInContext('BaseAdvancedModule', context);
const registry = context.AdvancedVendorRegistry;
const dataDriven = context.AdvancedCaptchaVendors.list;

// What the hand-written modules were called before the names moved into the registry: notifications keep them
const HAND_WRITTEN = {
  akamai: 'Akamai', awswaf: 'AWS WAF', cloudflare: 'Cloudflare', datadome: 'DataDome', funcaptcha: 'FunCaptcha',
  geetest: 'Geetest', hcaptcha: 'hCaptcha', imperva: 'Imperva', recaptcha: 'reCAPTCHA', shapesecurity: 'Shape Security', turnstile: 'Turnstile'
};

test('the vendors with their own Advanced module keep the short names notifications use', () => {
  for (const [id, name] of Object.entries(HAND_WRITTEN)) assert.strictEqual(Base.displayNameOf(id), name, id);
});

test('every vendor of the registry has a display name, and the module reads it from there', () => {
  const ids = Object.keys(registry.vendors);
  assert.ok(ids.length >= Object.keys(HAND_WRITTEN).length + dataDriven.length, 'bespoke and data-driven vendors are all registered');
  for (const id of ids) {
    const vendor = registry.vendors[id];
    assert.ok(vendor.displayName && vendor.displayName.trim(), `${id} has a displayName`);
    assert.strictEqual(Base.displayNameOf(id), vendor.displayName, id);
  }
});

test('a vendor described as data needs no entry of its own: its name and category come with it', () => {
  assert.ok(dataDriven.length >= 10, 'the data-driven CAPTCHA vendors are loaded');
  for (const vendor of dataDriven) {
    assert.strictEqual(Base.displayNameOf(vendor.vendorId), vendor.productName, vendor.vendorId);
    assert.strictEqual(Base.isCaptchaModule(vendor.vendorId), true, vendor.vendorId);
  }
});

test('a module is a CAPTCHA module by its vendor category', () => {
  for (const id of ['funcaptcha', 'geetest', 'hcaptcha', 'recaptcha', 'turnstile']) assert.strictEqual(Base.isCaptchaModule(id), true, id);
  for (const id of ['akamai', 'awswaf', 'cloudflare', 'datadome', 'imperva', 'shapesecurity']) assert.strictEqual(Base.isCaptchaModule(id), false, id);
});

test('an unknown module is shown by its own id and is not a CAPTCHA module', () => {
  assert.strictEqual(Base.displayNameOf('somevendor'), 'somevendor');
  assert.strictEqual(Base.isCaptchaModule('somevendor'), false);
  assert.strictEqual(Base.displayNameOf(undefined), undefined);
});

test('the Advanced sections keep no hand-written list of vendor names or CAPTCHA modules', () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  for (const file of walk('sections/advanced').filter(name => name.endsWith('.js'))) {
    assert.ok(!/DISPLAY_NAMES|CAPTCHA_MODULES/.test(read(file)), `${file} mentions a vendor list that the registry replaced`);
  }
});

test('the worker side of each vendor names it the way the registry does', () => {
  const folder = path.join(root, 'background/advanced/vendors');
  let checked = 0;
  for (const id of fs.readdirSync(folder).filter(name => fs.statSync(path.join(folder, name)).isDirectory())) {
    const vendor = registry.vendors[registry.canonical(id)];
    if (!vendor) continue; // the generic CAPTCHA interceptor serves every data-driven vendor
    const source = read(`background/advanced/vendors/${id}/interceptor.js`);
    // The page notices ("module: 'Akamai'" above the title, "{0} Monitoring Started") name the vendor
    const written = new Set([...source.matchAll(/\bmodule: '([^']+)'/g)].map(match => match[1]));
    for (const name of written) assert.strictEqual(name, vendor.displayName, `${id} writes "${name}"`);
    checked += written.size ? 1 : 0;
  }
  assert.ok(checked >= 6, 'the vendors that name themselves in a page notice are checked');
});
