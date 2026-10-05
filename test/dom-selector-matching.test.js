const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { demMatchDOMSelector: match } = require('../modules/detection/engine/detection-engine-matching.js');

const element = (tag, attributes = {}) => ({ selector: tag, attributes });

test('serialized DOM matches compound widget selectors and exact class tokens', () => {
  const widget = element('div', { class: 'form-widget h-captcha active', 'data-sitekey': 'test-key' });
  assert.equal(match('.h-captcha[data-sitekey]', widget), true);
  assert.equal(match('div.h-captcha.active[data-sitekey="test-key"]', widget), true);
  assert.equal(match('button.h-captcha[data-sitekey]', widget), false);
  assert.equal(match('.captcha', widget), false);
  assert.equal(match('.h-captcha', element('div', { class: 'custom-h-captcha-label' })), false);
  assert.equal(match('.h-captcha[data-sitekey]', element('div', { class: 'h-captcha' })), false);
  assert.equal(match('.h-captcha[data-sitekey]', element('button', { class: 'h-captcha', 'data-sitekey': '' })), true);
});

test('serialized DOM applies every attribute operator without losing empty attributes', () => {
  const node = element('input', { name: 'captcha-response', type: 'hidden', 'data-flags': 'first second', lang: 'en-US', 'data-empty': '' });
  for (const selector of ['input[type="hidden"][name="captcha-response"]', '[data-empty]', '[data-empty=""]', '[name^="captcha-"]', '[name$="-response"]', '[name*="cha-res"]', '[data-flags~="second"]', '[lang|="en"]']) {
    assert.equal(match(selector, node), true, selector);
  }
  for (const selector of ['[missing]', '[data-empty^=""]', '[name$=""]', '[name*=""]', '[data-flags~="sec"]', '[data-flags~="first second"]', '[lang|="e"]', '[name="CAPTCHA-RESPONSE"]']) {
    assert.equal(match(selector, node), false, selector);
  }
  assert.equal(match('[type="HIDDEN" i]', node), true);
  assert.equal(match('[type="HIDDEN"]', node), true);
  assert.equal(match('input[type="hidden"]', element('input', { type: 'HIDDEN' })), true);
  assert.equal(match('[type="HIDDEN" s]', node), false);
});

test('serialized DOM matches selector lists and authority-safe src prefixes', () => {
  const selector = "iframe[src^='https://www.google.com/recaptcha/'], iframe[src^='https://www.recaptcha.net/recaptcha/']";
  for (const src of ['https://www.google.com/recaptcha/api2/anchor?k=test', 'https://www.recaptcha.net/recaptcha/api2/anchor?k=test']) {
    assert.equal(match(selector, { selector: 'iframe', src, attributes: { src: src.slice(0, 40) + '...' } }), true);
    assert.equal(match(selector, element('script', { src })), false);
  }
  for (const src of ['https://www.google.com.evil.test/recaptcha/api2/anchor', 'https://evil.test/?next=https://www.google.com/recaptcha/api2/anchor', 'https://www.google.com@evil.test/recaptcha/']) {
    assert.equal(match(selector, element('iframe', { src })), false, src);
  }
  assert.equal(match('[data-label="a,b"], #alternate', element('div', { 'data-label': 'a,b' })), true);
  assert.equal(match('div#alternate', element('div', { id: 'alternate' })), true);
  assert.equal(match('div#alternate', element('div', { id: 'alternate-extra' })), false);
});

test('serialized DOM rejects malformed, unsupported, or partial selectors instead of matching a prefix', () => {
  const widget = element('div', { class: 'h-captcha', 'data-sitekey': 'test', 'data-label': 'a,b' });
  for (const selector of ['', null, '.h-captcha ', '.h-captcha[data-sitekey', '.h-captcha[data-sitekey!=\'\']', '.h-captcha:not([data-sitekey=""])', 'form .h-captcha', '.h-captcha > input', '.h-captcha + input', '.h-captcha,', '.h-captcha,,#other', '.h-captcha[', '.h-captcha?bad', '.h-captcha[unknown="x"]trailing']) {
    // Trailing whitespace around an otherwise valid selector is allowed by CSS.
    if (selector === '.h-captcha ') {
      assert.equal(match(selector, widget), true);
    } else {
      assert.equal(match(selector, widget), false, String(selector));
    }
  }
  assert.equal(match('.h-captcha, form input', widget), false, 'unsupported alternate must not be silently ignored');
});

test('serialized DOM does not trust synthetic selector equality as element evidence', () => {
  assert.equal(match('.h-captcha[data-sitekey]', { selector: '.h-captcha[data-sitekey]' }), false);
  assert.equal(match('[data-sitekey]', { selector: '[data-sitekey]' }), false);
  assert.equal(match('[id]', { selector: 'div', id: '', attributes: {} }), false);
  assert.equal(match('[id]', { selector: 'div', id: '', attributes: { id: '' } }), true);
});

function extractionContext(nodes) {
  const context = vm.createContext({
    Logger: { detection() {}, cache() {}, debug() {} },
    NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_SKIP: 3 },
    document: { body: {}, createTreeWalker(_root, _kind, filter) {
      const accepted = nodes.filter(node => filter.acceptNode(node) === 1);
      let index = -1;
      return { nextNode() { index += 1; this.currentNode = accepted[index]; return !!this.currentNode; } };
    } }
  });
  for (const file of ['modules/detection/engine/detection-engine-matching.js', 'modules/detection/engine/detection-engine-extractors.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}
function node(tag, attrs) {
  return { tagName: tag.toUpperCase(), attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    hasAttribute(name) { return Object.hasOwn(attrs, name); }, getAttribute(name) { return attrs[name] ?? null; } };
}

test('DOM capture retains compound-selector metadata on response fields and non-div widgets without copying tokens', () => {
  const context = extractionContext([
    node('input', { type: 'hidden', name: 'frc-captcha-response', value: 'secret-response-token' }),
    node('button', { class: 'g-recaptcha', 'data-sitekey': 'public-key', 'data-action': 'submit' }),
    node('span', { class: 'geetest_panel' }),
    node('span', { 'data-captchaeu-sitekey': 'public-key' }),
    node('input', { type: 'password', name: 'password', value: 'secret-password' })
  ]);
  context.selectors = ['input[type="hidden"][name="frc-captcha-response"]', 'button.g-recaptcha[data-sitekey][data-action="submit"]', '.geetest_panel', '[data-captchaeu-sitekey]'];
  const capture = vm.runInContext('demExtractDOM.call({ getElementAttributes: demGetElementAttributes, detectors: { captcha: { fixture: { detection: { dom: selectors.map(selector => ({ selector })) } } } } })', context);
  assert.ok(capture.some(item => match('input[type="hidden"][name="frc-captcha-response"]', item)));
  assert.ok(capture.some(item => match('button.g-recaptcha[data-sitekey][data-action="submit"]', item)));
  assert.ok(capture.some(item => match('.geetest_panel', item)));
  assert.ok(capture.some(item => match('[data-captchaeu-sitekey]', item)));
  assert.ok(!JSON.stringify(capture).includes('secret-'));
  assert.ok(!JSON.stringify(capture).includes('password'), 'ordinary input metadata need not be collected');
});
