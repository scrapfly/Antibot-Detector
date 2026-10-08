/**
 * Window property helper (rule editor, WINDOW method).
 *
 * One compact screen built on RuleHelperKit: search box -> suggestion rows
 * (popular bot-detection properties from the loaded detectors plus common
 * automation markers, filtered as you type, with the typed value usable as a
 * custom property) -> inline condition picker using the canonical presets of
 * window-condition-language.js with a live preview -> "Add property".
 *
 * Dependencies: rules.js, helpers/helper-kit.js, rules-condition-ui.js
 */

const rulesHelperTr = (key, fallback) => RuleHelperKit.tr(key, fallback);

// Canonical condition presets. The runtime list comes from
// ScrapflyWindowConditionLanguage; this fallback must mirror PRESET_GROUPS in
// modules/detection/hooks/window-condition-language.js (drift-guarded by
// test/window-condition-fallback-parity.test.js).
const WINDOW_CONDITION_FALLBACK_GROUPS = [
  { label: 'Type', values: ['typeof object', 'typeof function', 'typeof string', 'typeof number', 'typeof boolean', 'typeof symbol', 'typeof bigint'] },
  { label: 'Existence', values: ['exists', 'truthy', 'falsy', '!== undefined', '=== undefined', '!== null', '=== null'] },
  { label: 'Collections', values: ['array', 'non-empty array', 'empty array', 'has length', 'has keys', 'empty object'] },
  { label: 'Numeric', values: ['> 0', '>= 0', '=== 0', '!== 0', '> 1', '>= 1'] },
  { label: 'String', values: ['length > 0', 'length === 0'] },
  { label: 'Boolean', values: ['=== true', '=== false'] }
];

// Plain-language label per canonical condition (rhCond<Slug> keys)
const WINDOW_CONDITION_LABEL_KEYS = {
  'typeof object': 'rhCondTypeObject',
  'typeof function': 'rhCondTypeFunction',
  'typeof string': 'rhCondTypeString',
  'typeof number': 'rhCondTypeNumber',
  'typeof boolean': 'rhCondTypeBoolean',
  'typeof symbol': 'rhCondTypeSymbol',
  'typeof bigint': 'rhCondTypeBigint',
  'exists': 'rhCondExists',
  'truthy': 'rhCondTruthy',
  'falsy': 'rhCondFalsy',
  '!== undefined': 'rhCondNotUndefined',
  '=== undefined': 'rhCondUndefined',
  '!== null': 'rhCondNotNull',
  '=== null': 'rhCondNull',
  'array': 'rhCondArray',
  'non-empty array': 'rhCondNonEmptyArray',
  'empty array': 'rhCondEmptyArray',
  'has length': 'rhCondHasLength',
  'has keys': 'rhCondHasKeys',
  'empty object': 'rhCondEmptyObject',
  '> 0': 'rhCondGt0',
  '>= 0': 'rhCondGte0',
  '=== 0': 'rhCondEq0',
  '!== 0': 'rhCondNe0',
  '> 1': 'rhCondGt1',
  '>= 1': 'rhCondGte1',
  'length > 0': 'rhCondLenGt0',
  'length === 0': 'rhCondLenEq0',
  '=== true': 'rhCondTrue',
  '=== false': 'rhCondFalse'
};

/** "is an object" for 'typeof object'; the raw condition when it has no label. */
Rules.prototype.windowConditionLabel = function(condition) {
  const key = WINDOW_CONDITION_LABEL_KEYS[condition];
  return key ? rulesHelperTr(key, condition) : condition;
};

const WINDOW_CONDITION_GROUP_KEYS = {
  Type: ['rhCondGroupType', 'Type'],
  Existence: ['rhCondGroupExistence', 'Existence'],
  Collections: ['rhCondGroupCollections', 'Collections'],
  Numeric: ['rhCondGroupNumeric', 'Numeric'],
  String: ['rhCondGroupString', 'String'],
  Boolean: ['rhCondGroupBoolean', 'Boolean']
};

// Common automation / headless markers that no bundled detector covers.
// Descriptions are tool names (not translated); the chip is localised.
const WINDOW_AUTOMATION_PROPERTIES = [
  { value: 'navigator.webdriver', desc: 'WebDriver', condition: '=== true' },
  { value: 'cdc_adoQpoasnfa76pfcZLmcfl_Array', desc: 'ChromeDriver', condition: 'exists' },
  { value: 'cdc_adoQpoasnfa76pfcZLmcfl_Promise', desc: 'ChromeDriver', condition: 'exists' },
  { value: '__playwright__binding__', desc: 'Playwright', condition: 'exists' },
  { value: '__pwInitScripts', desc: 'Playwright', condition: 'exists' },
  { value: '__selenium_unwrapped', desc: 'Selenium', condition: 'exists' },
  { value: '__webdriver_evaluate', desc: 'Selenium', condition: 'exists' },
  { value: '__fxdriver_unwrapped', desc: 'Selenium (Firefox)', condition: 'exists' },
  { value: 'domAutomation', desc: 'Chromium automation', condition: 'exists' },
  { value: 'domAutomationController', desc: 'Chromium automation', condition: 'exists' },
  { value: 'callPhantom', desc: 'PhantomJS', condition: 'typeof function' },
  { value: '_phantom', desc: 'PhantomJS', condition: 'exists' },
  { value: '__nightmare', desc: 'Nightmare', condition: 'exists' },
  { value: 'Buffer', desc: 'Node.js / Electron', condition: 'exists' },
  { value: 'navigator.plugins', desc: 'Headless Chrome', condition: 'length === 0' },
  { value: 'chrome', desc: 'Headless Chrome', condition: '=== undefined' }
];

Rules.prototype.getWindowConditionPresetGroups = function() {
  const lang = globalThis.ScrapflyWindowConditionLanguage;
  if (lang && typeof lang.getPresetGroups === 'function') return lang.getPresetGroups();
  return WINDOW_CONDITION_FALLBACK_GROUPS;
};

Rules.prototype.isValidWindowCondition = function(condition) {
  const lang = globalThis.ScrapflyWindowConditionLanguage;
  if (!lang || typeof lang.compile !== 'function') return !!String(condition || '').trim();
  try {
    return !!lang.compile(condition).ok;
  } catch (e) {
    return false;
  }
};

/**
 * Popular window properties: the automation markers above plus every window
 * path used by the loaded detectors (detector name as description, detector
 * category as chip, detector condition as the suggested condition).
 */
Rules.prototype.getWindowPropertyCatalog = function() {
  const automationChip = rulesHelperTr('rhChipAutomation', 'Automation');
  const items = WINDOW_AUTOMATION_PROPERTIES.map((entry) => ({
    value: entry.value,
    desc: entry.desc,
    chip: automationChip,
    condition: entry.condition
  }));

  const detectors = this.detectorManager?.getAllDetectors?.() || {};
  const fromDetectors = [];
  for (const [category, categoryDetectors] of Object.entries(detectors)) {
    for (const detector of Object.values(categoryDetectors || {})) {
      const windowChecks = detector?.detection?.window;
      if (!Array.isArray(windowChecks)) continue;
      for (const check of windowChecks) {
        const path = String(check?.path || check?.name || '').trim();
        if (!path) continue;
        fromDetectors.push({
          value: path,
          desc: detector.name || '',
          chip: this.getCategoryLabel ? this.getCategoryLabel(category) : category,
          condition: check.condition || 'exists',
          title: check.description || ''
        });
      }
    }
  }
  fromDetectors.sort((a, b) => a.desc.localeCompare(b.desc) || a.value.localeCompare(b.value));

  return RuleHelperKit.uniqueByValue(items.concat(fromDetectors));
};

// ============================================
// Window Helper Modal
// ============================================

Rules.prototype.setupWindowHelperModal = function() {
  const modal = document.querySelector('#windowHelperModal');
  if (!modal) return;

  const keywordInput = document.querySelector('#windowKeywordInput');
  const conditionSelect = document.querySelector('#windowConditionSelect');
  const useBtn = document.querySelector('#useWindowProperty');

  this._windowHelperState = { property: '', catalog: [] };

  this._windowHelperList = new RuleHelperKit.List({
    listEl: document.querySelector('#windowSuggestions'),
    input: keywordInput,
    onSelect: (item) => this.selectWindowProperty(item),
    onApply: (item) => {
      this.selectWindowProperty(item);
      this.useWindowProperty();
    }
  });

  ['#closeWindowHelper', '#cancelWindowHelper'].forEach((selector) => {
    document.querySelector(selector)?.addEventListener('click', () => this.closeWindowHelperModal());
  });
  modal.querySelector('.rule-modal-backdrop')?.addEventListener('click', () => this.closeWindowHelperModal());
  useBtn?.addEventListener('click', () => this.useWindowProperty());

  keywordInput?.addEventListener('input', (e) => this.displayWindowSuggestions(e.target.value));

  conditionSelect?.addEventListener('change', () => this.updateWindowRulePreview());
  conditionSelect?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !useBtn?.disabled) {
      e.preventDefault();
      this.useWindowProperty();
    }
  });

  RuleHelperKit.onEscape('#windowHelperModal', () => this.closeWindowHelperModal());
};

/**
 * (Re)build the condition <select> from the canonical preset groups, keeping
 * a non-canonical current value available under its own group.
 */
Rules.prototype.renderWindowConditionSelect = function(selectedValue) {
  const select = document.querySelector('#windowConditionSelect');
  if (!select) return;

  const selected = String(selectedValue || '').trim() || 'exists';
  const groups = this.getWindowConditionPresetGroups();
  const known = new Set();
  select.replaceChildren();

  groups.forEach((group) => {
    const labelInfo = WINDOW_CONDITION_GROUP_KEYS[group.label];
    const optgroup = document.createElement('optgroup');
    optgroup.label = labelInfo ? rulesHelperTr(labelInfo[0], labelInfo[1]) : group.label;
    group.values.forEach((value) => {
      known.add(value);
      const option = document.createElement('option');
      option.value = value;
      // Plain words first, the stored condition after it for people who know the syntax
      const label = this.windowConditionLabel(value);
      option.textContent = label === value ? value : `${label}  (${value})`;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });

  if (!known.has(selected)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = rulesHelperTr('rhCondGroupCustom', 'Current value');
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = selected;
    optgroup.appendChild(option);
    select.insertBefore(optgroup, select.firstChild);
  }

  select.value = selected;
};

Rules.prototype.displayWindowSuggestions = function(keyword) {
  const state = this._windowHelperState;
  if (!state || !this._windowHelperList) return;

  const query = String(keyword || '').trim();
  const ranked = RuleHelperKit.rankItems(state.catalog, query);
  let items = ranked;

  const exact = state.catalog.some((item) => item.value === query);
  if (query && !exact) {
    // The typed value stays usable: last when there are matches, alone otherwise.
    items = ranked.concat([RuleHelperKit.customItem(query)]);
  } else if (!query && state.property && !state.catalog.some((item) => item.value === state.property)) {
    items = [RuleHelperKit.customItem(state.property)].concat(ranked);
  }

  const head = document.querySelector('#windowSuggestionsHead');
  const noMatches = query && ranked.length === 0;
  RuleHelperKit.setSectionHead(
    head,
    query ? rulesHelperTr('rhResults', 'Results') : rulesHelperTr('rhSuggestions', 'Suggestions'),
    ranked.length
  );

  const emptyEl = document.querySelector('#windowNoResults');
  if (emptyEl) {
    emptyEl.replaceChildren();
    if (noMatches) {
      emptyEl.appendChild(RuleHelperKit.renderEmpty(
        RuleHelperKit.fmt('rhNoResultsFmt', 'No matches for “{0}”', query),
        rulesHelperTr('rhNoResultsHint', 'You can still use it as a custom value.')
      ));
    }
    emptyEl.hidden = !noMatches;
  }

  this._windowHelperList.render(items, { selectedValue: state.property || null });
  if (query && this._windowHelperList.interactiveCount()) {
    this._windowHelperList.setActive(0, false);
  }
};

Rules.prototype.selectWindowProperty = function(item) {
  if (!item) return;
  const state = this._windowHelperState;
  const isNew = state.property !== item.value;
  state.property = item.value;

  const customInput = document.querySelector('#windowCustomInput');
  if (customInput) customInput.value = item.value;

  // A catalog entry suggests the condition its detector uses.
  if (isNew && item.condition) {
    this.renderWindowConditionSelect(item.condition);
  }

  this._windowHelperList?.setSelected(item.value);
  this.updateWindowRulePreview();
};

Rules.prototype.updateWindowRulePreview = function() {
  const property = (document.querySelector('#windowCustomInput')?.value || '').trim();
  const condition = (document.querySelector('#windowConditionSelect')?.value || 'exists').trim();
  const dock = document.querySelector('#windowConditionSection');
  const sentence = document.querySelector('#windowRuleSentence');
  const status = document.querySelector('#windowConditionStatus');
  const useBtn = document.querySelector('#useWindowProperty');

  const conditionOk = this.isValidWindowCondition(condition);
  const valid = !!property && conditionOk;

  if (dock) dock.hidden = !property;

  // "Matches pages where window.__nightmare exists on the page", with the parts highlighted
  if (sentence) {
    sentence.replaceChildren();
    if (property) {
      const prop = RuleHelperKit.el('code', 'tok-prop', `window.${property.replace(/^window\./, '')}`);
      const cond = RuleHelperKit.el('strong', 'tok-cond', this.windowConditionLabel(condition));
      const template = rulesHelperTr('rhWindowSentenceFmt', 'Matches pages where {0} {1}');
      template.split(/(\{[01]\})/).forEach((part) => {
        if (part === '{0}') sentence.appendChild(prop);
        else if (part === '{1}') sentence.appendChild(cond);
        else if (part) sentence.appendChild(document.createTextNode(part));
      });
    }
  }

  // Only speak up when something is wrong; a preset is always valid
  if (status) {
    status.hidden = conditionOk;
    status.textContent = conditionOk ? '' : rulesHelperTr('rhConditionInvalid', 'Unknown condition');
  }

  if (useBtn) useBtn.disabled = !valid;
};

Rules.prototype.openWindowHelperModal = function(methodItem, inputIndex) {
  const modal = document.querySelector('#windowHelperModal');
  if (!modal) return;

  this.currentWindowMethodItem = methodItem;

  const currentProperty = (methodItem?.querySelector('.method-input.method-name')?.value || '').trim();
  const currentCondition = (methodItem?.querySelector('.method-input.method-value')?.value || '').trim();

  const state = this._windowHelperState || (this._windowHelperState = { property: '', catalog: [] });
  state.catalog = this.getWindowPropertyCatalog();
  state.property = currentProperty;

  const customInput = document.querySelector('#windowCustomInput');
  if (customInput) customInput.value = currentProperty;

  const keywordInput = document.querySelector('#windowKeywordInput');
  if (keywordInput) keywordInput.value = '';

  this.renderWindowConditionSelect(currentCondition || 'exists');
  this.displayWindowSuggestions('');
  this.updateWindowRulePreview();

  // Hide parent modal backdrop to prevent blur stacking
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const body = modal.querySelector('.rule-modal-body');
  if (body) body.scrollTop = 0;
  const selectedRow = modal.querySelector('.rh-row[aria-selected="true"]');
  if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });

  keywordInput?.focus();
};

Rules.prototype.useWindowProperty = function() {
  const property = (document.querySelector('#windowCustomInput')?.value || '').trim();
  const condition = (document.querySelector('#windowConditionSelect')?.value || 'exists').trim() || 'exists';

  if (!property || !this.isValidWindowCondition(condition)) {
    this.updateWindowRulePreview();
    return;
  }

  if (this.currentWindowMethodItem) {
    const nameInput = this.currentWindowMethodItem.querySelector('.method-input.method-name');
    const valueInput = this.currentWindowMethodItem.querySelector('.method-input.method-value');

    if (nameInput) {
      nameInput.value = property;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (valueInput) valueInput.value = condition;

    this.syncInlineConditionDropdown?.(this.currentWindowMethodItem);
    this.updateMethodIndicators?.(this.currentWindowMethodItem);
  }

  this.closeWindowHelperModal();
};

Rules.prototype.closeWindowHelperModal = function() {
  const modal = document.querySelector('#windowHelperModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  this.currentWindowMethodItem = null;

  // Restore parent modal backdrop
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = '';
};
