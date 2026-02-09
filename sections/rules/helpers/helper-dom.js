/**
 * Rules helper modal extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.setupDomHelperModal = function() {
  const modal = document.querySelector('#domHelperModal');
  const closeBtn = document.querySelector('#closeDomHelper');
  const cancelBtn = document.querySelector('#cancelDomHelper');
  const useBtn = document.querySelector('#useDomSelector');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');
  const keywordInput = document.querySelector('#domKeywordInput');

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeDomHelperModal());
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => this.closeDomHelperModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeDomHelperModal());
  }

  // Use selector button
  if (useBtn) {
    useBtn.addEventListener('click', () => this.useDomSelector());
  }

  // Keyword input for filtering suggestions
  if (keywordInput) {
    keywordInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      this.displayDomSuggestions(keyword);
    });
  }

  // Setup click handlers for DOM helper button and templates (using event delegation)
  document.addEventListener('click', (e) => {
    // Handle DOM helper button clicks
    if (e.target.closest('.dom-helper-btn')) {
      e.stopPropagation();
      const button = e.target.closest('.dom-helper-btn');
      const inputIndex = button.dataset.inputIndex;
      const methodItem = button.closest('.method-item');
      if (methodItem) {
        this.openDomHelperModal(methodItem, inputIndex);
      }
    }

    // Handle Window helper button clicks
    if (e.target.closest('.window-helper-btn')) {
      e.stopPropagation();
      const button = e.target.closest('.window-helper-btn');
      const inputIndex = button.dataset.inputIndex;
      const methodItem = button.closest('.method-item');
      if (methodItem) {
        this.openWindowHelperModal(methodItem, inputIndex);
      }
    }

    // Handle condition helper button clicks (for WINDOW method)
    if (e.target.closest('.condition-helper-btn')) {
      e.stopPropagation();
      const button = e.target.closest('.condition-helper-btn');
      const inputIndex = button.dataset.inputIndex;
      const methodItem = button.closest('.method-item');
      if (methodItem) {
        this.openConditionHelperModal(methodItem, inputIndex);
      }
    }

    // Handle template/suggestion clicks - directly apply selector
    if (e.target.closest('.dom-template, .dom-suggestion')) {
      e.stopPropagation();
      const suggestion = e.target.closest('.dom-template, .dom-suggestion');
      const selector = suggestion.dataset.selector || suggestion.querySelector('.template-code')?.textContent;
      if (selector) {
        this.useDomSelector(selector);
      }
    }
  });
};

Rules.prototype.openDomHelperModal = function(methodItem, inputIndex) {
  const modal = document.querySelector('#domHelperModal');
  if (!modal) return;

  // Store reference to current method item
  this.currentDomMethodItem = methodItem;

  // Get current DOM selector value
  const nameInput = methodItem.querySelector('.method-input.method-name');
  const currentValue = nameInput?.value || '';

  // Put current value in keyword input for searching
  const keywordInput = document.querySelector('#domKeywordInput');
  if (keywordInput) {
    keywordInput.value = currentValue;
  }

  // Display initial suggestions (empty keyword shows all examples)
  this.displayDomSuggestions('');

  // Hide parent modal backdrop to prevent blur stacking
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = 'none';

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Focus keyword input after modal is visible
  if (keywordInput) {
    keywordInput.focus();
  }
};

Rules.prototype.useDomSelector = function(selectorValue) {
  // Use provided selector or fall back to keyword input
  const keywordInput = document.querySelector('#domKeywordInput');
  const selector = selectorValue || keywordInput?.value.trim();

  if (!selector) {
    NotificationHelper.error('Please enter a selector');
    return;
  }

  // Update the DOM input field
  if (this.currentDomMethodItem) {
    const nameInput = this.currentDomMethodItem.querySelector('.method-input.method-name');
    if (nameInput) {
      nameInput.value = selector;
    }
  }

  // Close modal
  this.closeDomHelperModal();
};

Rules.prototype.closeDomHelperModal = function() {
  const modal = document.querySelector('#domHelperModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    this.currentDomMethodItem = null;

    // Restore parent modal backdrop
    const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
    if (editBackdrop) editBackdrop.style.display = '';
  }
};

// ============================================
// Condition Helper Modal (for WINDOW method)
// ============================================
