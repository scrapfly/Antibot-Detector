/**
 * DOM selector helper (rule editor, DOM method).
 *
 * Same single-screen pattern as the window property helper (RuleHelperKit):
 * search box -> selector rows (selectors used by the loaded detectors, plus
 * selector templates generated from the typed keyword, plus the typed value
 * as a custom selector) -> preview -> "Use selector".
 *
 * Also owns the delegated click handling of the "?" helper buttons that the
 * rule editor renders next to DOM / WINDOW inputs.
 *
 * Dependencies: rules.js, helpers/helper-kit.js
 */

Rules.prototype.setupDomHelperModal = function() {
  const modal = document.querySelector('#domHelperModal');
  const keywordInput = document.querySelector('#domKeywordInput');

  this._domHelperState = { selector: '', catalog: [] };

  if (modal) {
    this._domHelperList = new RuleHelperKit.List({
      listEl: document.querySelector('#domSuggestions'),
      input: keywordInput,
      onSelect: (item) => this.selectDomSelector(item),
      onApply: (item) => this.useDomSelector(item.value)
    });

    ['#closeDomHelper', '#cancelDomHelper'].forEach((selector) => {
      document.querySelector(selector)?.addEventListener('click', () => this.closeDomHelperModal());
    });
    modal.querySelector('.rule-modal-backdrop')?.addEventListener('click', () => this.closeDomHelperModal());
    document.querySelector('#useDomSelector')?.addEventListener('click', () => this.useDomSelector());
    keywordInput?.addEventListener('input', (e) => this.displayDomSuggestions(e.target.value));

    RuleHelperKit.onEscape('#domHelperModal', () => this.closeDomHelperModal());
  }

  // "?" helper buttons in the rule editor (event delegation).
  document.addEventListener('click', (e) => {
    const openers = [
      ['.dom-helper-btn', (item, index) => this.openDomHelperModal(item, index)],
      ['.window-helper-btn', (item, index) => this.openWindowHelperModal(item, index)],
      ['.condition-helper-btn', (item, index) => this.openConditionHelperModal(item, index)]
    ];
    for (const [selector, open] of openers) {
      const button = e.target.closest(selector);
      if (!button) continue;
      e.stopPropagation();
      const methodItem = button.closest('.method-item');
      if (methodItem) open(methodItem, button.dataset.inputIndex);
      return;
    }
  });
};

/** Selectors used by the loaded detectors (detector name + category chip). */
Rules.prototype.getDomSelectorCatalog = function() {
  const detectors = this.detectorManager?.getAllDetectors?.() || {};
  const items = [];
  for (const [category, categoryDetectors] of Object.entries(detectors)) {
    for (const detector of Object.values(categoryDetectors || {})) {
      const domChecks = detector?.detection?.dom;
      if (!Array.isArray(domChecks)) continue;
      for (const check of domChecks) {
        const selector = String(check?.selector || check?.name || '').trim();
        if (!selector) continue;
        items.push({
          value: selector,
          desc: detector.name || '',
          chip: this.getCategoryLabel ? this.getCategoryLabel(category) : category,
          title: check.description || ''
        });
      }
    }
  }
  items.sort((a, b) => a.desc.localeCompare(b.desc) || a.value.localeCompare(b.value));
  return RuleHelperKit.uniqueByValue(items);
};

/** Selector templates for a typed keyword. */
Rules.prototype.generateDomTemplates = function(keyword) {
  const original = String(keyword || '').trim();
  if (!original) return [];

  const tr = RuleHelperKit.tr;
  const cssKeyword = original.replace(/\s+/g, '-').toLowerCase();
  const quoted = original.replace(/'/g, "\\'");
  const templates = [
    { selector: `.${cssKeyword}`, label: tr('rhDomClass', 'Class') },
    { selector: `#${cssKeyword}`, label: tr('rhDomId', 'ID') },
    { selector: `[data-${cssKeyword}]`, label: tr('rhDomData', 'Data attribute') },
    { selector: `[class*='${quoted}']`, label: tr('rhDomClassContains', 'Class contains') },
    { selector: `[id*='${quoted}']`, label: tr('rhDomIdContains', 'ID contains') },
    { selector: `iframe[src*='${quoted}']`, label: tr('rhDomIframe', 'Iframe URL contains') },
    { selector: `[title*='${quoted}']`, label: tr('rhDomTitle', 'Title contains') },
    { selector: `[alt*='${quoted}']`, label: tr('rhDomAlt', 'Alt text contains') }
  ];

  if (/^[a-z][a-z0-9]*$/i.test(original)) {
    templates.splice(5, 0,
      { selector: cssKeyword, label: tr('rhDomTag', 'HTML tag') },
      { selector: `[${cssKeyword}]`, label: tr('rhDomAttr', 'Has attribute') }
    );
  }

  if (/[-_]/.test(cssKeyword)) {
    const camelCase = cssKeyword.replace(/[-_]([a-z])/g, (g) => g[1].toUpperCase());
    templates.push({ selector: `.${camelCase}`, label: tr('rhDomCamel', 'camelCase class') });
  }

  return templates;
};

Rules.prototype.displayDomSuggestions = function(keyword) {
  const state = this._domHelperState;
  if (!state || !this._domHelperList) return;

  const query = String(keyword || '').trim();
  const ranked = RuleHelperKit.rankItems(state.catalog, query);
  const templateChip = RuleHelperKit.tr('rhChipTemplate', 'Template');
  const templates = this.generateDomTemplates(query).map((template) => ({
    value: template.selector,
    desc: template.label,
    chip: templateChip
  }));

  let items = RuleHelperKit.uniqueByValue(ranked.concat(templates));
  const exact = items.some((item) => item.value === query);
  if (query && !exact) {
    items = items.concat([RuleHelperKit.customItem(query)]);
  } else if (!query && state.selector && !items.some((item) => item.value === state.selector)) {
    items = [RuleHelperKit.customItem(state.selector)].concat(items);
  }

  RuleHelperKit.setSectionHead(
    document.querySelector('#domSuggestionsHead'),
    query ? RuleHelperKit.tr('rhResults', 'Results') : RuleHelperKit.tr('rhSuggestions', 'Suggestions'),
    ranked.length + templates.length
  );

  // Templates always exist for a typed keyword; the no-results note is about
  // the detector catalog.
  const noMatches = query && ranked.length === 0;
  const emptyEl = document.querySelector('#domNoResults');
  if (emptyEl) {
    emptyEl.replaceChildren();
    if (noMatches) {
      emptyEl.appendChild(RuleHelperKit.renderEmpty(
        RuleHelperKit.fmt('rhNoResultsFmt', 'No matches for “{0}”', query),
        RuleHelperKit.tr('rhNoResultsHint', 'You can still use it as a custom value.')
      ));
    }
    emptyEl.hidden = !noMatches;
  }

  this._domHelperList.render(items, { selectedValue: state.selector || null });
  if (query && this._domHelperList.interactiveCount()) {
    this._domHelperList.setActive(0, false);
  }
};

Rules.prototype.selectDomSelector = function(item) {
  if (!item) return;
  this._domHelperState.selector = item.value;
  this._domHelperList?.setSelected(item.value);
  this.updateDomSelectorPreview();
};

Rules.prototype.updateDomSelectorPreview = function() {
  const selector = this._domHelperState?.selector || '';
  const dock = document.querySelector('#domPreviewSection');
  if (dock) dock.hidden = !selector;
  RuleHelperKit.renderCode(document.querySelector('#domPreviewContent'),
    selector ? [{ text: selector, cls: 'tok-prop' }] : []);
  const useBtn = document.querySelector('#useDomSelector');
  if (useBtn) useBtn.disabled = !selector;
};

Rules.prototype.openDomHelperModal = function(methodItem, inputIndex) {
  const modal = document.querySelector('#domHelperModal');
  if (!modal) return;

  this.currentDomMethodItem = methodItem;
  const currentValue = (methodItem?.querySelector('.method-input.method-name')?.value || '').trim();

  const state = this._domHelperState || (this._domHelperState = { selector: '', catalog: [] });
  state.catalog = this.getDomSelectorCatalog();
  state.selector = currentValue;

  const keywordInput = document.querySelector('#domKeywordInput');
  if (keywordInput) keywordInput.value = '';

  this.displayDomSuggestions('');
  this.updateDomSelectorPreview();

  // Hide parent modal backdrop to prevent blur stacking
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const body = modal.querySelector('.rule-modal-body');
  if (body) body.scrollTop = 0;
  modal.querySelector('.rh-row[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });

  keywordInput?.focus();
};

Rules.prototype.useDomSelector = function(selectorValue) {
  const selector = String(selectorValue || this._domHelperState?.selector || '').trim();
  if (!selector) {
    this.updateDomSelectorPreview();
    return;
  }

  if (this.currentDomMethodItem) {
    const nameInput = this.currentDomMethodItem.querySelector('.method-input.method-name');
    if (nameInput) {
      nameInput.value = selector;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  this.closeDomHelperModal();
};

Rules.prototype.closeDomHelperModal = function() {
  const modal = document.querySelector('#domHelperModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  this.currentDomMethodItem = null;

  // Restore parent modal backdrop
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = '';
};
