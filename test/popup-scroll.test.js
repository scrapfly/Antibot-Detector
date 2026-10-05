'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('modules/styles/popup-scroll.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].flatMap(([, selectors, body]) => {
  const declarations = Object.fromEntries(body.trim().split(';').filter(Boolean).map(value => {
    const separator = value.indexOf(':');
    return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()];
  }));
  return selectors.split(',').map(selector => [selector.trim(), declarations]);
});
const rule = selector => {
  const found = rules.find(([candidate]) => candidate === selector);
  assert.ok(found, `Missing scoped layout rule: ${selector}`);
  return found[1];
};

test('popup loads scrolling overrides exactly once and after every other stylesheet', () => {
  const links = [...read('popup.html').matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.filter(link => link === 'modules/styles/popup-scroll.css').length, 1);
  assert.equal(links.at(-1), 'modules/styles/popup-scroll.css');
  assert.doesNotMatch(read('sections/stats/stats.html'), /popup-scroll\.css/);
});

test('one main scrollport keeps the fixed popup shell and header outside scrolling', () => {
  const main = rule('#app > .main');
  assert.equal(main['overflow-y'], 'auto');
  assert.equal(main['overflow-x'], 'hidden');
  assert.equal(main['min-height'], '0');
  assert.equal(main.flex, '1 1 0');
  const popup = read('modules/styles/popup.css');
  assert.match(popup, /body\s*\{[^}]*width:\s*400px;[^}]*height:\s*580px;[^}]*overflow:\s*hidden;/);
  assert.match(popup, /#app\s*\{[^}]*height:\s*580px;/);
  assert.match(read('popup.html'), /<\/header>\s*<main class="main">/);
  assert.equal(rules.filter(([, declarations]) => declarations['overflow-y'] === 'auto').length, 1);
});

test('tab, list and main content wrappers have natural height without nested scrolling', () => {
  for (const selector of [
    '#app > .main > .tab-content',
    '#app > .main > #detectionTab > #detectionResults',
    '#app > .main > #detectionTab > #detectionResults > #resultsList',
    '#app > .main > #historyTab > .history-list',
    '#app > .main > #rulesTab > .rules-list',
    '#app > .main > #advancedTab > #advancedContent'
  ]) {
    const declarations = rule(selector);
    assert.equal(declarations.flex, '0 0 auto');
    assert.equal(declarations.height, 'auto');
    assert.equal(declarations['max-height'], 'none');
    assert.equal(declarations.overflow, 'visible');
  }
  assert.equal(rule('#app > .main > .tab-content')['min-height'], '100%');
  assert.equal(rule('#app > .main > .tab-content')['padding-bottom'], '12px');
  assert.equal(rule('#app > .main > #detectionTab > #detectionResults > #resultsList')['scrollbar-gutter'], 'auto');
});

test('state cards can grow without clipping and hidden controls and modal scrolling are untouched', () => {
  for (const selector of [
    '#app > .main > #detectionTab > .loading-state',
    '#app > .main > .tab-content > .empty-state--centered',
    '#app > .main > #advancedTab > .advanced-loading'
  ]) assert.equal(rule(selector).flex, '1 0 auto');
  for (const [selector, declarations] of rules) {
    assert.ok(selector.startsWith('#app > .main'), selector);
    assert.ok(!Object.hasOwn(declarations, 'display'), `Do not override hidden state: ${selector}`);
    assert.ok(!Object.hasOwn(declarations, 'visibility'));
    assert.doesNotMatch(selector, /modal|textarea|\bpre\b|\bcode\b|\*/);
  }
  assert.doesNotMatch(css, /!important/);
  assert.equal(rule('#app > .main > #advancedTab > #advancedContent > .advanced-sub-tabs').position, 'static');
});

test('Advanced no-tools content fills the viewport without restoring nested scrolling', () => {
  const selector = '#app > .main > #advancedTab > #advancedContent.is-no-tools:not(.is-captures-view)';
  const empty = rule(selector);
  assert.equal(empty.flex, '1 0 auto');
  assert.equal(empty['padding-top'], '10px', 'balance the shared tab top and bottom insets');
  const content = '#app > .main > #advancedTab > #advancedContent';
  assert.equal(rule(content).flex, '0 0 auto', 'available tools and capture history keep natural height');
  assert.equal(rule(content).overflow, 'visible');
  assert.ok(rules.findIndex(([candidate]) => candidate === selector)
    > rules.findIndex(([candidate]) => candidate === content));
  for (const property of ['display', 'visibility', 'height', 'min-height', 'max-height', 'position', 'transform', 'overflow-y']) {
    assert.ok(!Object.hasOwn(empty, property), `no-tools centering must not override ${property}`);
  }
});

test('Advanced no-tools centering removes the trailing panel inset and balances card spacing', () => {
  const content = '#app > .main > #advancedTab > #advancedContent.is-no-tools:not(.is-captures-view)';
  assert.equal(rule(content + ' > #toolsPanel.active').padding, '0');
  const wrapper = content + ' > #toolsPanel.active > .captcha-tools-section--empty > .advanced-no-tools';
  assert.equal(rule(wrapper).padding, '12px 0');
  assert.match(read('sections/advanced/advanced-tools.js'), /classList\.toggle\('is-no-tools', noTools\)/);
  assert.match(read('sections/advanced/advanced-tools.js'), /class="captcha-tools-section captcha-tools-section--empty"/);
  assert.match(read('sections/advanced/advanced-tools.js'), /class="advanced-no-tools"/);
});

test('primary paginated tabs remove the trailing gap while other tabs retain spacing', () => {
  const general = rule('#app > .main > .tab-content');
  assert.equal(general['padding-bottom'], '12px');
  for (const tab of ['detectionTab', 'historyTab', 'rulesTab']) {
    const selector = `#app > .main > #${tab}`;
    assert.equal(rule(selector)['padding-bottom'], '0');
    assert.ok(rules.findIndex(([candidate]) => candidate === selector)
      > rules.findIndex(([candidate]) => candidate === '#app > .main > .tab-content'),
    'the zero-gap override must follow general tab spacing');
  }
  assert.ok(!rules.some(([selector]) => selector === '#app > .main > #advancedTab'));
});

test('primary pagination stays sticky within main with opaque nonshrinking controls', () => {
  const footers = [
    ['#app > .main > #detectionTab > #detectionResults > #detectionPagination', 'sections/detection/detection.html', 'detectionPagination'],
    ['#app > .main > #historyTab > #historyPagination', 'sections/history/history.html', 'historyPagination'],
    ['#app > .main > #rulesTab > #rulesPagination', 'sections/rules/rules.html', 'rulesPagination']
  ];
  for (const [selector, template, id] of footers) {
    assert.match(read(template), new RegExp(`<div id="${id}" class="pagination"`));
    const declarations = rule(selector);
    assert.equal(declarations.position, 'sticky');
    assert.equal(declarations.bottom, '0');
    assert.equal(declarations['z-index'], '20');
    assert.equal(declarations['flex-shrink'], '0');
    assert.equal(declarations.background, 'var(--bg-secondary)');
    assert.equal(declarations['box-shadow'], '0 -6px 0 var(--bg-primary)');
    assert.ok(!Object.hasOwn(declarations, 'display'), 'empty pagination remains hidden by runtime');
    assert.ok(!Object.hasOwn(declarations, 'height'), 'localized content determines footer height');
    assert.ok(!Object.hasOwn(declarations, 'transform'), 'sticky retains normal flow space for the last card');
  }
  assert.equal(rules.filter(([, declarations]) => declarations.position === 'sticky').length, 3);
});

// Execute the production methods with independently variable viewport and list
// dimensions. A CSS-only assertion cannot catch content-height resize feedback.
function sizingHarness() {
  const vm = require('node:vm');
  const main = { clientHeight: 400 };
  const list = {
    width: 340,
    height: 900,
    isConnected: true,
    children: [],
    classList: { toggle() {} },
    getBoundingClientRect() { return { width: this.width, height: this.height }; },
    set innerHTML(value) {
      this.children = [...value.matchAll(/data-height="(\d+)"/g)].map(match => ({
        getBoundingClientRect: () => ({ height: Number(match[1]) })
      }));
    }
  };
  const frames = [];
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const context = {
    self: {},
    document: { querySelector: selector => selector === '#resultsList' ? list : selector === '#app > .main' ? main : null },
    getComputedStyle: () => ({ paddingTop: '10px', paddingBottom: '10px', rowGap: '8px' }),
    ResizeObserver,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }
  };
  vm.runInNewContext(read('sections/detection/detection-ui.js'), context);
  const ui = context.self.DetectionUI;
  ui.buildDetectionCardHtml = item => `<div data-height="${item.height}"></div>`;
  const items = Array.from({ length: 10 }, () => ({ height: 100 }));
  let refits = 0;
  const state = { paginationManager: {
    filteredItems: items,
    refit() { refits++; ui.measurePageStarts.call(state, items); }
  } };
  const measure = () => Array.from(ui.measurePageStarts.call(state, items) || []);
  const flush = () => { while (frames.length) frames.shift()(); };
  return { ui, state, list, main, items, observers, frames, measure, flush, refits: () => refits };
}

test('production Detection page starts use viewport budget, not natural list height', () => {
  const h = sizingHarness();
  assert.deepEqual(h.measure(), [0, 4, 8]);
  assert.equal(h.state._detectionListHeight, 380);
  h.list.height = 180;
  assert.deepEqual(h.measure(), [0, 4, 8]);
  h.list.height = 2400;
  assert.deepEqual(h.measure(), [0, 4, 8]);
  h.main.clientHeight = 240;
  assert.deepEqual(h.measure(), [0, 3, 6, 9]);
  assert.equal(h.state._detectionListHeight, 220);
});

test('production observer ignores list content changes and refits viewport changes once', () => {
  const h = sizingHarness();
  h.measure();
  h.ui.observeResultsListSize.call(h.state);
  const observer = h.observers[0];
  assert.deepEqual(observer.targets, [h.main]);
  h.list.height = 1500;
  observer.callback();
  h.flush();
  assert.equal(h.refits(), 0);
  h.main.clientHeight = 240;
  observer.callback();
  observer.callback();
  assert.equal(h.frames.length, 1, 'coalesce viewport notifications into one animation frame');
  h.flush();
  assert.equal(h.refits(), 1);
  observer.callback();
  h.flush();
  assert.equal(h.refits(), 1, 'do not loop after refit renders another natural-height page');
});

test('production page sizing defers hidden lists and resumes when visible', () => {
  const h = sizingHarness();
  h.measure();
  h.ui.observeResultsListSize.call(h.state);
  h.list.width = 0;
  h.main.clientHeight = 240;
  assert.equal(h.ui.measurePageStarts.call(h.state, h.items), null);
  h.observers[0].callback();
  h.flush();
  assert.equal(h.refits(), 0);
  h.list.width = 340;
  h.observers[0].callback();
  h.flush();
  assert.equal(h.refits(), 1);
  assert.deepEqual(h.measure(), [0, 3, 6, 9]);
  h.list.isConnected = false;
  h.main.clientHeight = 300;
  h.observers[0].callback();
  h.flush();
  assert.equal(h.refits(), 1, 'detached list must not trigger refitting');
});

function tabSwitchHarness(initialized) {
  const vm = require('node:vm');
  const names = ['detection', 'history', 'rules', 'advanced'];
  const main = { scrollTop: 210 };
  const makeElement = () => ({ style: {}, classList: { add() {}, remove() {} } });
  const contents = Object.fromEntries(names.map(name => [name, makeElement()]));
  const buttons = Object.fromEntries(names.map(name => [name, makeElement()]));
  const context = {
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { error() { assert.fail('unexpected popup error'); } },
    window: { addEventListener() {} },
    document: {
      addEventListener() {},
      querySelectorAll: selector => selector === '.tab-btn' ? Object.values(buttons) : Object.values(contents),
      querySelector: selector => {
        if (selector === '#app > .main') return main;
        const name = names.find(name => selector === `#${name}Tab` || selector === `[data-tab="${name}"]`);
        return name ? selector.startsWith('#') ? contents[name] : buttons[name] : null;
      }
    }
  };
  vm.runInNewContext(read('popup.js') + '\nthis.PopupForScrollTests = ScrapflyPopup;', context);
  const popup = Object.create(context.PopupForScrollTests.prototype);
  popup.currentTab = 'detection';
  const calls = [];
  const record = (name, operation) => {
    calls.push(`${name}:${operation}`);
    if (operation !== 'cleanup') {
      assert.equal(main.scrollTop, 0, `${operation} must run after reset`);
      assert.equal(contents[name].style.visibility, 'visible', `${operation} must run after content is shown`);
    }
  };
  for (const name of names) popup[name] = {
    initialized,
    cleanup: () => record(name, 'cleanup'),
    setupEventListeners: () => record(name, 'listeners'),
    initialize: async () => { record(name, 'initialize'); popup[name].initialized = true; },
    displayHistory: () => record(name, 'display'),
    displayRules: () => record(name, 'display'),
    displayAdvancedTools: () => record(name, 'display')
  };
  return { popup, main, calls, contents };
}

for (const initialized of [false, true]) {
  test(`actual switchTab resets shared main before ${initialized ? 'refreshing' : 'lazy loading'} History, Rules and Advanced`, async () => {
    const h = tabSwitchHarness(initialized);
    for (const name of ['history', 'rules', 'advanced']) {
      h.main.scrollTop = 210;
      await h.popup.switchTab(name);
      assert.equal(h.main.scrollTop, 0);
      assert.equal(h.popup.currentTab, name);
      assert.equal(h.contents[name].style.visibility, 'visible');
      assert.ok(h.calls.includes(`${name}:display`));
    }
  });
}

test('actual switchTab preserves scroll and avoids refresh on an already initialized same tab', async () => {
  const h = tabSwitchHarness(true);
  for (const name of ['history', 'rules', 'advanced']) {
    h.popup.currentTab = name;
    h.main.scrollTop = 137;
    await h.popup.switchTab(name);
    assert.equal(h.main.scrollTop, 137);
    assert.deepEqual(h.calls, []);
  }
});

test('production observer disconnects its predecessor before observing the shared main', () => {
  const h = sizingHarness();
  h.ui.observeResultsListSize.call(h.state);
  h.ui.observeResultsListSize.call(h.state);
  assert.equal(h.observers.length, 2);
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.observers[1].disconnected, false);
  assert.deepEqual(h.observers[1].targets, [h.main]);
});

test('detection pagination sits at the bottom of the popup even on a short last page', () => {
  const results = rules.filter(([selector]) => selector === '#app > .main > #detectionTab > #detectionResults');
  assert.equal(results.at(-1)[1].flex, '1 0 auto', 'results fill the tab height');
  const footer = read('modules/styles/detection.css');
  assert.match(footer, /#detectionResults > #detectionPagination\s*\{\s*margin-top:\s*auto;/, 'spare height goes above the footer');
});
