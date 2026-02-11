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
    suggestionsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see suggestions...</div>';
    return;
  }

  const patterns = this.generateDynamicRegexPatterns(keyword);
  suggestionsContainer.innerHTML = patterns.map(p => `
    <div class="regex-pattern" data-pattern="${p.pattern}">
      <div class="template-code">${p.pattern}</div>
      <div class="template-description">${p.description}</div>
    </div>
  `).join('');
};

Rules.prototype.setupRegexHelperModal = function() {
  this._regexHelperModal = this._setupPatternHelper({
    modalSelector: '#regexHelperModal',
    closeSelectors: ['#closeRegexHelper', '#closeRegexHelperBtn'],
    inputSelector: '#regexKeywordInput',
    stepSelectors: ['#regexStep1', '#regexStep2'],
    filterFn: this.filterRegexPatterns,
    onOpen: function() {
      if (this.currentMethodItem) {
        this.currentMethodItem.dataset.nameRegex = 'true';
        this.updateMethodIndicators(this.currentMethodItem);
      }
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
    if (e.target.closest('#regexHelperBtn') || e.target.closest('#regexHelperBtnValue')) {
      e.stopPropagation();
      this._regexHelperModal.open();
    }

    if (e.target.closest('.regex-pattern')) {
      e.stopPropagation();
      const pattern = e.target.closest('.regex-pattern');
      const patternText = pattern.dataset.pattern;

      if (patternText && this.currentMethodItem) {
        const nameInput = this.currentMethodItem.querySelector('.method-input.method-name');
        if (nameInput) {
          nameInput.value = patternText;
          this.currentMethodItem.dataset.nameRegex = 'true';
          this.updateMethodIndicators(this.currentMethodItem);
          NotificationHelper.success('Pattern applied');
          this._regexHelperModal.close();
        }
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
    examplesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see examples...</div>';
    return;
  }

  const examples = this.generateWholeWordExamples(keyword);
  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: var(--success); margin-bottom: 8px;">Pattern: ${keyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border);">Text</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Match?</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Reason</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${e.text}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.match ? 'var(--success)' : 'var(--danger)'};">${e.match ? '\u2713 Match' : '\u2717 No match'}</td>
            <td style="padding: 6px; border: 1px solid var(--border);">${e.reason}</td>
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
    openSelectors: ['#wholeWordHelperBtn'],
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
    examplesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see examples...</div>';
    return;
  }

  const examples = this.generateCaseSensitiveExamples(keyword);
  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: var(--danger); margin-bottom: 8px;">Pattern: ${keyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Text Found</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Sensitive</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Insensitive</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${e.text}</td>
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
    openSelectors: ['#caseSensitiveHelperBtn'],
    inputSelector: '#caseSensitiveKeywordInput',
    stepSelectors: ['#caseSensitiveStep1', '#caseSensitiveStep2'],
    filterFn: this.filterCaseSensitivePatterns
  });
};
