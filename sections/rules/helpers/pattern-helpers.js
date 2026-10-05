/**
 * Pattern helper modals - Regex, Whole Word, Case Sensitive.
 *
 * All three use the shared single-screen helper pattern (RuleHelperKit):
 * pinned search bar, compact rows with outlined chips, pinned footer, and a
 * useful default state (never an empty "start typing" box).
 *   - Regex: pick a generated pattern (or type your own) -> "Use pattern".
 *   - Whole word / Case sensitive: live match examples for a typed value.
 *
 * Dependencies: rules-modal-lifecycle.js, rules.js, helpers/helper-kit.js
 */

const PATTERN_HELPER_SAMPLES = {
  regex: 'token',
  wholeWord: '_abck',
  caseSensitive: 'Akamai'
};

// ============================================
// Shared factory for pattern helper modals
// ============================================

Rules.prototype._setupPatternHelper = function(config) {
  const modal = new RulesModalLifecycle(config.modalSelector);
  modal.setupCloseListeners(...config.closeSelectors);

  if (config.openSelectors) {
    for (const sel of config.openSelectors) {
      modal.setupOpenListener(sel);
    }
  }

  const input = document.querySelector(config.inputSelector);
  if (input) {
    input.addEventListener('input', (e) => {
      config.filterFn.call(this, e.target.value.trim());
    });
  }

  modal.onOpen = () => {
    if (input) input.value = '';
    config.onOpen?.call(this);
    config.filterFn.call(this, '');
    const body = modal.getModal()?.querySelector('.rule-modal-body');
    if (body) body.scrollTop = 0;
    input?.focus();
  };

  RuleHelperKit.onEscape(config.modalSelector, () => modal.close());
  return modal;
};

// ============================================
// Regex Helper
// ============================================

Rules.prototype.generateDynamicRegexPatterns = function(input) {
  const fmt = RuleHelperKit.fmt;
  const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    { pattern: `^${escaped}`, description: fmt('rhRegexStartsFmt', 'Starts with “{0}”', input) },
    { pattern: `${escaped}$`, description: fmt('rhRegexEndsFmt', 'Ends with “{0}”', input) },
    { pattern: `.*${escaped}.*`, description: fmt('rhRegexContainsFmt', 'Contains “{0}” anywhere', input) },
    { pattern: `\\b${escaped}\\b`, description: fmt('rhRegexWordFmt', 'Whole word “{0}”', input) },
    { pattern: `(${escaped}|alternative)`, description: fmt('rhRegexOrFmt', '“{0}” or another option', input) },
    { pattern: `^${escaped}.+$`, description: fmt('rhRegexStartsMoreFmt', 'Starts with “{0}” followed by more text', input) }
  ];
};

const REGEX_QUICK_REFERENCE = [
  ['.', 'rhRefAny', 'any character'],
  ['*', 'rhRefZeroMore', '0 or more'],
  ['+', 'rhRefOneMore', '1 or more'],
  ['?', 'rhRefOptional', 'optional'],
  ['^', 'rhRefStart', 'start'],
  ['$', 'rhRefEnd', 'end'],
  ['\\d', 'rhRefDigit', 'digit'],
  ['\\w', 'rhRefWord', 'letter, digit or _'],
  ['\\s', 'rhRefSpace', 'whitespace'],
  ['(a|b)', 'rhRefOr', 'a or b']
];

/** Render the regex quick reference card (used by the helper and the explanation). */
Rules.prototype.renderRegexQuickReference = function(container) {
  if (!container) return;
  const el = RuleHelperKit.el;
  container.replaceChildren();
  const grid = el('dl', 'rh-ref');
  REGEX_QUICK_REFERENCE.forEach(([token, key, fallback]) => {
    const item = el('div', 'rh-ref-item');
    item.appendChild(el('dt', 'rh-ref-token', token));
    item.appendChild(el('dd', 'rh-ref-text', RuleHelperKit.tr(key, fallback)));
    grid.appendChild(item);
  });
  container.appendChild(grid);
};

Rules.prototype.filterRegexPatterns = function(keyword) {
  const state = this._regexHelperState || (this._regexHelperState = { pattern: '' });
  const query = String(keyword || '').trim();
  const sample = query || PATTERN_HELPER_SAMPLES.regex;

  const items = this.generateDynamicRegexPatterns(sample).map((p) => ({
    value: p.pattern,
    desc: p.description
  }));
  if (query) items.push(RuleHelperKit.customItem(query));

  RuleHelperKit.setSectionHead(
    document.querySelector('#regexSuggestionsHead'),
    query
      ? RuleHelperKit.tr('rhResults', 'Results')
      : RuleHelperKit.fmt('rhExamplesForFmt', 'Examples for “{0}”', sample),
    null,
    { plain: !query }
  );

  if (!items.some((item) => item.value === state.pattern)) state.pattern = '';
  this._regexHelperList?.render(items, { selectedValue: state.pattern || null });
  if (query && this._regexHelperList?.interactiveCount()) this._regexHelperList.setActive(0, false);
  this.updateRegexPatternPreview();
};

Rules.prototype.selectRegexPattern = function(item) {
  if (!item) return;
  this._regexHelperState.pattern = item.value;
  this._regexHelperList?.setSelected(item.value);
  this.updateRegexPatternPreview();
};

Rules.prototype.updateRegexPatternPreview = function() {
  const pattern = this._regexHelperState?.pattern || '';
  const dock = document.querySelector('#regexPreviewSection');
  if (dock) dock.hidden = !pattern;
  RuleHelperKit.renderCode(document.querySelector('#regexPreviewContent'),
    pattern ? [{ text: pattern, cls: 'tok-cond' }] : []);
  const useBtn = document.querySelector('#useRegexPattern');
  if (useBtn) useBtn.disabled = !pattern;
};

Rules.prototype.useRegexPattern = function(patternText) {
  const pattern = String(patternText || this._regexHelperState?.pattern || '');
  if (!pattern) return;
  if (this.applyRegexHelperPattern(pattern)) {
    this._regexHelperModal?.close();
  }
};

Rules.prototype.setRegexHelperTargetEnabled = function(target) {
  if (target === 'payloadUrl') {
    const payloadUrlRegex = document.querySelector('#payloadUrlRegex');
    if (payloadUrlRegex) payloadUrlRegex.checked = true;
    return;
  }

  if (!this.currentMethodItem) return;

  if (target === 'value') {
    this.currentMethodItem.dataset.valueRegex = 'true';
    const valueRegex = document.querySelector('#valueRegex');
    if (valueRegex) valueRegex.checked = true;
  } else {
    this.currentMethodItem.dataset.nameRegex = 'true';
    const nameRegex = document.querySelector('#nameRegex');
    if (nameRegex) nameRegex.checked = true;
  }

  this.updateMethodIndicators(this.currentMethodItem);
};

Rules.prototype.applyRegexHelperPattern = function(patternText) {
  const target = this.currentPatternHelperTarget || 'name';

  if (target === 'payloadUrl') {
    const payloadUrlInput = document.querySelector('#payloadUrlPattern');
    if (!payloadUrlInput) return false;
    payloadUrlInput.value = patternText;
    this.setRegexHelperTargetEnabled(target);
    return true;
  }

  if (!this.currentMethodItem) return false;

  const inputSelector = target === 'value'
    ? '.method-input.method-value'
    : '.method-input.method-name';
  const input = this.currentMethodItem.querySelector(inputSelector);
  if (!input) return false;

  input.value = patternText;
  this.setRegexHelperTargetEnabled(target);
  return true;
};

Rules.prototype.setupRegexHelperModal = function() {
  this._regexHelperState = { pattern: '' };
  this._regexHelperList = new RuleHelperKit.List({
    listEl: document.querySelector('#regexSuggestions'),
    input: document.querySelector('#regexKeywordInput'),
    onSelect: (item) => this.selectRegexPattern(item),
    onApply: (item) => this.useRegexPattern(item.value)
  });

  this._regexHelperModal = this._setupPatternHelper({
    modalSelector: '#regexHelperModal',
    closeSelectors: ['#closeRegexHelper', '#closeRegexHelperBtn'],
    inputSelector: '#regexKeywordInput',
    filterFn: this.filterRegexPatterns,
    onOpen: function() {
      this._regexHelperState.pattern = '';
      this.renderRegexQuickReference(document.querySelector('#regexQuickRef'));
    }
  });

  document.querySelector('#useRegexPattern')?.addEventListener('click', () => this.useRegexPattern());

  // Open buttons remember which field the pattern goes to.
  document.addEventListener('click', (e) => {
    const helperBtn = e.target.closest('#regexHelperBtn, #regexHelperBtnValue, #payloadUrlRegexHelperBtn');
    if (!helperBtn) return;
    e.stopPropagation();
    this.currentPatternHelperTarget = helperBtn.id === 'regexHelperBtnValue'
      ? 'value'
      : helperBtn.id === 'payloadUrlRegexHelperBtn'
        ? 'payloadUrl'
        : 'name';
    this._regexHelperModal.open();
  });
};

// ============================================
// Whole Word Helper
// ============================================

Rules.prototype.generateWholeWordExamples = function(input) {
  const tr = RuleHelperKit.tr;
  return [
    { text: input, match: true, reason: tr('rhWwExact', 'Exact word') },
    { text: `test${input}`, match: false, reason: tr('rhWwJoinedBefore', 'Joined to the text before') },
    { text: `${input}More`, match: false, reason: tr('rhWwJoinedAfter', 'Joined to the text after') },
    { text: `test ${input} more`, match: true, reason: tr('rhWwSpaces', 'Separated by spaces') }
  ];
};

function patternHelperMatchChip(match) {
  return match
    ? { text: '✓ ' + RuleHelperKit.tr('rhMatch', 'Match'), tone: 'success' }
    : { text: '\u00D7 ' + RuleHelperKit.tr('rhNoMatch', 'No match'), tone: 'danger' };
}

/** Rows showing how whole-word matching treats `sample`. */
Rules.prototype.renderWholeWordExamples = function(listEl, sample) {
  if (!listEl) return;
  const list = new RuleHelperKit.List({ listEl });
  list.render(this.generateWholeWordExamples(sample).map((example) => ({
    value: example.text,
    desc: example.reason,
    chips: [patternHelperMatchChip(example.match)]
  })), { staticRows: true });
};

Rules.prototype.filterWholeWordPatterns = function(keyword) {
  const sample = String(keyword || '').trim() || PATTERN_HELPER_SAMPLES.wholeWord;
  RuleHelperKit.setSectionHead(document.querySelector('#wholeWordExamplesHead'),
    RuleHelperKit.fmt('rhHowMatchesFmt', 'How “{0}” matches', sample), null, { plain: true });
  this.renderWholeWordExamples(document.querySelector('#wholeWordExamples'), sample);
};

Rules.prototype.setupWholeWordHelperModal = function() {
  this._wholeWordHelperModal = this._setupPatternHelper({
    modalSelector: '#wholeWordHelperModal',
    closeSelectors: ['#closeWholeWordHelper', '#closeWholeWordHelperBtn'],
    openSelectors: ['#wholeWordHelperBtn', '#wholeWordHelperBtnValue'],
    inputSelector: '#wholeWordKeywordInput',
    filterFn: this.filterWholeWordPatterns
  });
};

// ============================================
// Case Sensitive Helper
// ============================================

Rules.prototype.generateCaseSensitiveExamples = function(input) {
  const variations = [
    { text: input, sensitive: true, insensitive: true }
  ];

  const lower = input.toLowerCase();
  if (lower !== input) {
    variations.push({ text: lower, sensitive: false, insensitive: true });
  }

  const upper = input.toUpperCase();
  if (upper !== input && upper !== lower) {
    variations.push({ text: upper, sensitive: false, insensitive: true });
  }

  const capitalized = input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
  if (capitalized !== input && capitalized !== lower && capitalized !== upper) {
    variations.push({ text: capitalized, sensitive: false, insensitive: true });
  }

  return variations;
};

/**
 * Two groups of rows (case sensitive on / off) for `sample`, rendered into
 * `container` with the shared section head + list markup.
 */
Rules.prototype.renderCaseSensitiveExamples = function(container, sample) {
  if (!container) return;
  const el = RuleHelperKit.el;
  const examples = this.generateCaseSensitiveExamples(sample);
  container.replaceChildren();

  [
    ['sensitive', 'rhCsOnTitle', 'With Case sensitive on'],
    ['insensitive', 'rhCsOffTitle', 'With Case sensitive off']
  ].forEach(([field, key, fallback]) => {
    const section = el('div', 'rh-section');
    section.appendChild(el('div', 'rh-subtitle', RuleHelperKit.tr(key, fallback)));
    const listEl = el('div', 'rh-list');
    section.appendChild(listEl);
    container.appendChild(section);
    new RuleHelperKit.List({ listEl }).render(examples.map((example) => ({
      value: example.text,
      chips: [patternHelperMatchChip(example[field])]
    })), { staticRows: true });
  });
};

Rules.prototype.filterCaseSensitivePatterns = function(keyword) {
  const sample = String(keyword || '').trim() || PATTERN_HELPER_SAMPLES.caseSensitive;
  RuleHelperKit.setSectionHead(document.querySelector('#caseSensitiveExamplesHead'),
    RuleHelperKit.fmt('rhHowMatchesFmt', 'How “{0}” matches', sample), null, { plain: true });
  this.renderCaseSensitiveExamples(document.querySelector('#caseSensitiveExamples'), sample);
};

Rules.prototype.setupCaseSensitiveHelperModal = function() {
  this._caseSensitiveHelperModal = this._setupPatternHelper({
    modalSelector: '#caseSensitiveHelperModal',
    closeSelectors: ['#closeCaseSensitiveHelper', '#closeCaseSensitiveHelperBtn'],
    openSelectors: ['#caseSensitiveHelperBtn', '#caseSensitiveHelperBtnValue', '#payloadUrlCaseHelperBtn'],
    inputSelector: '#caseSensitiveKeywordInput',
    filterFn: this.filterCaseSensitivePatterns
  });
};
