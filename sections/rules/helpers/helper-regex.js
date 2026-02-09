/**
 * Rules helper modal extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.setupRegexHelperModal = function() {
  const modal = document.querySelector('#regexHelperModal');
  const closeBtn = document.querySelector('#closeRegexHelper');
  const closeFooterBtn = document.querySelector('#closeRegexHelperBtn');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');
  const keywordInput = document.querySelector('#regexKeywordInput');

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeRegexHelperModal());
  }
  if (closeFooterBtn) {
    closeFooterBtn.addEventListener('click', () => this.closeRegexHelperModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeRegexHelperModal());
  }

  // Setup keyword input for step 1 (filtering patterns)
  if (keywordInput) {
    keywordInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      this.filterRegexPatterns(keyword);
    });

    // Also handle Enter key to move to next step or select first pattern
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstPattern = document.querySelector('.regex-pattern');
        if (firstPattern) {
          firstPattern.click();
        }
      }
    });
  }

  // Setup click handlers for regex helper button and patterns
  document.addEventListener('click', (e) => {
    // Handle regex helper button click (for both name and value fields)
    if (e.target.closest('#regexHelperBtn') || e.target.closest('#regexHelperBtnValue')) {
      e.stopPropagation();
      this.openRegexHelperModal();
    }

    // Handle regex pattern clicks - insert into input field
    if (e.target.closest('.regex-pattern')) {
      e.stopPropagation();
      const pattern = e.target.closest('.regex-pattern');
      const patternText = pattern.dataset.pattern;

      if (patternText && this.currentMethodItem) {
        // Insert pattern into the input field
        const nameInput = this.currentMethodItem.querySelector('.method-input.method-name');
        if (nameInput) {
          nameInput.value = patternText;

          // Auto-enable regex checkbox in the method settings
          this.currentMethodItem.dataset.nameRegex = 'true';

          // Update visual indicators
          this.updateMethodIndicators(this.currentMethodItem);

          // Show success message
          NotificationHelper.success('Pattern applied');

          // Close modal
          this.closeRegexHelperModal();
        }
      }
    }
  });
};

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

  // If no keyword, show placeholder
  if (!keyword) {
    suggestionsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see suggestions...</div>';
    return;
  }

  // Generate patterns dynamically from user input
  const patterns = this.generateDynamicRegexPatterns(keyword);

  suggestionsContainer.innerHTML = patterns.map(p => `
    <div class="regex-pattern" data-pattern="${p.pattern}">
      <div class="template-code">${p.pattern}</div>
      <div class="template-description">${p.description}</div>
    </div>
  `).join('');
};

Rules.prototype.openRegexHelperModal = function() {
  const modal = document.querySelector('#regexHelperModal');
  if (!modal) return;

  // Auto-enable regex toggle when opening helper
  if (this.currentMethodItem) {
    this.currentMethodItem.dataset.nameRegex = 'true';
    this.updateMethodIndicators(this.currentMethodItem);
  }

  // Reset keyword input and show all patterns
  const keywordInput = document.querySelector('#regexKeywordInput');
  if (keywordInput) {
    keywordInput.value = '';
    keywordInput.focus();
  }

  // Display all patterns initially
  this.filterRegexPatterns('');

  // Update step indicators - focus on step 1
  const step1 = document.querySelector('#regexStep1');
  const step2 = document.querySelector('#regexStep2');
  if (step1) step1.classList.add('active');
  if (step2) step2.classList.remove('active');

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

Rules.prototype.closeRegexHelperModal = function() {
  const modal = document.querySelector('#regexHelperModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Restore parent modal backdrop
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
};

// ============================================
// Whole Word Helper Modal
// ============================================
