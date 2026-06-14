/**
 * Pattern Helper Modals - Regex, Whole Word, Case Sensitive
 * Merges 3 identical helper files into one data-driven module.
 *
 * Dependencies: rules-modal-lifecycle.js, rules.js
 */

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
      const keyword = e.target.value.toLowerCase().trim();
      config.filterFn.call(this, keyword);
    });
  }

  modal.onOpen = () => {
    if (input) {
      input.value = '';
      input.focus();
    }
    if (config.stepSelectors) {
      const step1 = document.querySelector(config.stepSelectors[0]);
      const step2 = document.querySelector(config.stepSelectors[1]);
      if (step1) step1.classList.add('active');
      if (step2) step2.classList.remove('active');
    }
    config.filterFn.call(this, '');
    config.onOpen?.call(this);
  };

  return modal;
};

// ============================================
// Regex Helper
// ============================================

Rules.prototype.generateDynamicRegexPatterns = function(input) {
  const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    { pattern: `^${escaped}`, description: `Starts with "${input}"` },
    { pattern: `${escaped}$`, description: `Ends with "${input}"` },
    { pattern: `.*${escaped}.*`, description: `Contains "${input}" anywhere` },
    { pattern: `\\b${escaped}\\b`, description: `Whole word match "${input}"` },
    { pattern: `(${escaped}|alternative)`, description: `"${input}" OR another option` },
    { pattern: `^${escaped}.+$`, description: `Starts with "${input}" + more characters` }
  ];
};

Rules.prototype.filterRegexPatterns = function(keyword) {
  const suggestionsContainer = document.querySelector('#regexSuggestions');
  if (!suggestionsContainer) return;

  if (!keyword) {
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const msg = (_t && _t.get('helperPatternStartTypingSuggestions')) || 'Start typing above to see suggestions...';
    const div = document.createElement('div');
    div.style.cssText = 'text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;';
    div.textContent = msg;
    suggestionsContainer.replaceChildren(div);
    return;
  }

  const patterns = this.generateDynamicRegexPatterns(keyword);
  const safeHtml = patterns.map(p => {
    const safePattern = FormatUtils.escapeHtml(p.pattern);
    const safeDescription = FormatUtils.escapeHtml(p.description);
    return `
    <div class="regex-pattern" data-pattern="${safePattern}">
      <div class="template-code">${safePattern}</div>
      <div class="template-description">${safeDescription}</div>
    </div>
  `;
  }).join('');
  suggestionsContainer.innerHTML = safeHtml;
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
  this._regexHelperModal = this._setupPatternHelper({
    modalSelector: '#regexHelperModal',
    closeSelectors: ['#closeRegexHelper', '#closeRegexHelperBtn'],
    inputSelector: '#regexKeywordInput',
    stepSelectors: ['#regexStep1', '#regexStep2'],
    filterFn: this.filterRegexPatterns,
    onOpen: function() {
      this.setRegexHelperTargetEnabled(this.currentPatternHelperTarget || this.currentFieldType || 'name');
    }
  });

  // Regex-specific: Enter key selects first pattern
  const keywordInput = document.querySelector('#regexKeywordInput');
  if (keywordInput) {
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstPattern = document.querySelector('.regex-pattern');
        if (firstPattern) firstPattern.click();
      }
    });
  }

  // Regex-specific: Event delegation for open buttons and pattern clicks
  document.addEventListener('click', (e) => {
    const helperBtn = e.target.closest('#regexHelperBtn, #regexHelperBtnValue, #payloadUrlRegexHelperBtn');
    if (helperBtn) {
      e.stopPropagation();
      this.currentPatternHelperTarget = helperBtn.id === 'regexHelperBtnValue'
        ? 'value'
        : helperBtn.id === 'payloadUrlRegexHelperBtn'
          ? 'payloadUrl'
          : 'name';
      this._regexHelperModal.open();
    }

    if (e.target.closest('.regex-pattern')) {
      e.stopPropagation();
      const pattern = e.target.closest('.regex-pattern');
      const patternText = pattern.dataset.pattern;

      if (patternText && this.applyRegexHelperPattern(patternText)) {
        NotificationHelper.success('Pattern applied');
        this._regexHelperModal.close();
      }
    }
  });
};

// ============================================
// Whole Word Helper
// ============================================

Rules.prototype.generateWholeWordExamples = function(input) {
  return [
    { text: input, match: true, reason: 'Exact word, surrounded by boundaries' },
    { text: `test${input}`, match: false, reason: 'Connected to "test", not isolated' },
    { text: `${input}More`, match: false, reason: 'Connected to "More", not isolated' },
    { text: `test ${input} more`, match: true, reason: 'Separated by spaces (word boundaries)' }
  ];
};

Rules.prototype.filterWholeWordPatterns = function(keyword) {
  const examplesContainer = document.querySelector('#wholeWordExamples');
  if (!examplesContainer) return;

  if (!keyword) {
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const msg = (_t && _t.get('helperPatternStartTypingExamples')) || 'Start typing above to see examples...';
    const div = document.createElement('div');
    div.style.cssText = 'text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;';
    div.textContent = msg;
    examplesContainer.replaceChildren(div);
    return;
  }

  const examples = this.generateWholeWordExamples(keyword);
  const safeKeyword = FormatUtils.escapeHtml(keyword);
  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: var(--success); margin-bottom: 8px;">Pattern: ${safeKeyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border);">Text</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Match?</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Reason</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${FormatUtils.escapeHtml(e.text)}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.match ? 'var(--success)' : 'var(--danger)'};">${e.match ? '\u2713 Match' : '\u2717 No match'}</td>
            <td style="padding: 6px; border: 1px solid var(--border);">${FormatUtils.escapeHtml(e.reason)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
};

Rules.prototype.setupWholeWordHelperModal = function() {
  this._wholeWordHelperModal = this._setupPatternHelper({
    modalSelector: '#wholeWordHelperModal',
    closeSelectors: ['#closeWholeWordHelper', '#closeWholeWordHelperBtn'],
    openSelectors: ['#wholeWordHelperBtn', '#wholeWordHelperBtnValue'],
    inputSelector: '#wholeWordKeywordInput',
    stepSelectors: ['#wholeWordStep1', '#wholeWordStep2'],
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

Rules.prototype.filterCaseSensitivePatterns = function(keyword) {
  const examplesContainer = document.querySelector('#caseSensitiveExamples');
  if (!examplesContainer) return;

  if (!keyword) {
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const msg = (_t && _t.get('helperPatternStartTypingExamples')) || 'Start typing above to see examples...';
    const div = document.createElement('div');
    div.style.cssText = 'text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;';
    div.textContent = msg;
    examplesContainer.replaceChildren(div);
    return;
  }

  const examples = this.generateCaseSensitiveExamples(keyword);
  const safeKeyword = FormatUtils.escapeHtml(keyword);
  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: var(--danger); margin-bottom: 8px;">Pattern: ${safeKeyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Text Found</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Sensitive</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Insensitive</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${FormatUtils.escapeHtml(e.text)}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.sensitive ? 'var(--success)' : 'var(--danger)'};">${e.sensitive ? '\u2713 Match' : '\u2717 No match'}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.insensitive ? 'var(--success)' : 'var(--danger)'};">${e.insensitive ? '\u2713 Match' : '\u2717 No match'}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
};

Rules.prototype.setupCaseSensitiveHelperModal = function() {
  this._caseSensitiveHelperModal = this._setupPatternHelper({
    modalSelector: '#caseSensitiveHelperModal',
    closeSelectors: ['#closeCaseSensitiveHelper', '#closeCaseSensitiveHelperBtn'],
    openSelectors: ['#caseSensitiveHelperBtn', '#caseSensitiveHelperBtnValue', '#payloadUrlCaseHelperBtn'],
    inputSelector: '#caseSensitiveKeywordInput',
    stepSelectors: ['#caseSensitiveStep1', '#caseSensitiveStep2'],
    filterFn: this.filterCaseSensitivePatterns
  });
};
