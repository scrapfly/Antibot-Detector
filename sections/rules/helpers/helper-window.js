/**
 * Rules helper modal extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.openConditionHelperModal = function(methodItem, inputIndex) {
  // Store reference to current method item
  this.currentConditionMethodItem = methodItem;

  // Hide parent modal backdrop to prevent blur stacking
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = 'none';

  const describeCondition = (value) => {
    const v = (value || '').trim();
    if (!v) return 'Truthy (default)';
    if (v === 'exists' || v === '!== undefined' || v === 'not undefined') return 'Property is defined (not undefined)';
    if (v === '=== undefined') return 'Property is undefined';
    if (v === '!== null' || v === 'not null') return 'Property is not null';
    if (v === '=== null') return 'Property is null';
    if (v === 'truthy') return 'Property is truthy';
    if (v === 'falsy') return 'Property is falsy';
    if (v.startsWith('typeof ')) return `Type check: ${v}`;
    if (v === 'array') return 'Property is an array';
    if (v === 'non-empty array') return 'Array has items';
    if (v === 'empty array') return 'Array is empty';
    if (v === 'has keys') return 'Object has at least one key';
    if (v === 'empty object') return 'Object has no keys';
    if (v === 'has length') return 'Value has a numeric length';
    if (v.startsWith('length ')) return `Length comparison: ${v}`;
    if (/^(>=|<=|>|<|===|!==)\\s*-?\\d/.test(v)) return `Numeric comparison: ${v}`;
    return 'Condition';
  };

  // Condition examples for WINDOW method (prefer shared language presets)
  const lang = globalThis.ScrapflyWindowConditionLanguage;
  const values = (lang && typeof lang.getPresetValues === 'function')
    ? lang.getPresetValues()
    : [
        'exists',
        'typeof object',
        'typeof function',
        'typeof string',
        'typeof number',
        'typeof boolean',
        'truthy',
        'falsy',
        '!== undefined',
        '=== undefined',
        '!== null',
        '=== null',
        'array'
      ];

  const conditionExamples = values.map((value) => ({ value, description: describeCondition(value) }));

  // Create modal using DOM methods
  const modalContainer = document.createElement('div');
  modalContainer.classList.add('condition-helper-modal-container');

  const modal = document.createElement('div');
  modal.className = 'condition-helper-modal';
  modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(2px);';

  const content = document.createElement('div');
  content.className = 'condition-helper-content';
  content.style.cssText = 'background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5);';

  const title = document.createElement('h3');
  title.textContent = 'Window Condition Examples';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px; color: var(--text-primary);';

  const description = document.createElement('p');
  description.textContent = 'Click on an example to use it:';
  description.style.cssText = 'margin: 0 0 16px 0; font-size: 12px; color: var(--text-secondary);';

  const examplesContainer = document.createElement('div');
  examplesContainer.className = 'condition-examples';
  examplesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';

  // Create example elements
  conditionExamples.forEach(example => {
    const exampleDiv = document.createElement('div');
    exampleDiv.className = 'condition-example';
    exampleDiv.dataset.value = example.value;
    exampleDiv.style.cssText = 'cursor: pointer; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; transition: all 0.2s;';

    const valueDiv = document.createElement('div');
    valueDiv.textContent = example.value;
    valueDiv.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 2px; font-family: Monaco, Courier New, monospace;';

    const descDiv = document.createElement('div');
    descDiv.textContent = example.description;
    descDiv.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    exampleDiv.appendChild(valueDiv);
    exampleDiv.appendChild(descDiv);
    examplesContainer.appendChild(exampleDiv);

    // Add hover and click handlers
    exampleDiv.addEventListener('mouseenter', () => {
      exampleDiv.style.borderColor = 'var(--accent)';
      exampleDiv.style.background = 'var(--bg-tertiary)';
      exampleDiv.style.transform = 'translateX(4px)';
    });
    exampleDiv.addEventListener('mouseleave', () => {
      exampleDiv.style.borderColor = 'var(--border)';
      exampleDiv.style.background = 'var(--bg-secondary)';
      exampleDiv.style.transform = 'translateX(0)';
    });
    exampleDiv.addEventListener('click', () => {
      const conditionValue = exampleDiv.dataset.value;
      if (this.currentConditionMethodItem) {
        const valueInput = this.currentConditionMethodItem.querySelector('.method-input.method-value');
        if (valueInput) {
          valueInput.value = conditionValue;
        }
        this.syncInlineConditionDropdown?.(this.currentConditionMethodItem);
        this.updateMethodIndicators?.(this.currentConditionMethodItem);
      }
      document.body.removeChild(modalContainer);
      this.currentConditionMethodItem = null;
      // Restore parent modal backdrop
      const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
      if (editBackdrop) editBackdrop.style.display = '';
    });
  });

  const closeBtn = document.createElement('button');
  closeBtn.id = 'closeConditionHelper';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'width: 100%; padding: 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modalContainer);
    this.currentConditionMethodItem = null;
    // Restore parent modal backdrop
    const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
    if (editBackdrop) editBackdrop.style.display = '';
  });

  // Assemble modal
  content.appendChild(title);
  content.appendChild(description);
  content.appendChild(examplesContainer);
  content.appendChild(closeBtn);
  modal.appendChild(content);
  modalContainer.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modalContainer);
      this.currentConditionMethodItem = null;
      // Restore parent modal backdrop
      const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
      if (editBackdrop) editBackdrop.style.display = '';
    }
  });

  document.body.appendChild(modalContainer);
};

// ============================================
// Window Helper Modal
// ============================================

Rules.prototype.setupWindowHelperModal = function() {
  const modal = document.querySelector('#windowHelperModal');
  const closeBtn = document.querySelector('#closeWindowHelper');
  const cancelBtn = document.querySelector('#cancelWindowHelper');
  const useBtn = document.querySelector('#useWindowProperty');
  const backBtn = document.querySelector('#backWindowHelper');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');
  const keywordInput = document.querySelector('#windowKeywordInput');
  const customInput = document.querySelector('#windowCustomInput');

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeWindowHelperModal());
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => this.closeWindowHelperModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeWindowHelperModal());
  }

  // Back button
  if (backBtn) {
    backBtn.addEventListener('click', () => this.goBackWindowHelper());
  }

  // Use property button
  if (useBtn) {
    useBtn.addEventListener('click', () => this.useWindowProperty());
  }

  // Custom input - update preview on change
  if (customInput) {
    customInput.addEventListener('input', () => this.updateWindowRulePreview());
  }

  // Keyword input for filtering suggestions
  if (keywordInput) {
    keywordInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      this.displayWindowSuggestions(keyword);
      this.updateWindowHelperSteps(keyword.length > 0 ? 2 : 1);
    });
  }

  // Setup click handlers for suggestions (using event delegation)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.window-suggestion')) {
      e.stopPropagation();
      const suggestion = e.target.closest('.window-suggestion');
      const property = suggestion.dataset.property;
      const customInput = document.querySelector('#windowCustomInput');
      if (property && customInput) {
        customInput.value = property;
        // Advance to step 3 (condition selection)
        this.updateWindowHelperSteps(3);
      }
    }
  });
};

Rules.prototype.updateWindowHelperSteps = function(activeStep) {
  const stepsContainer = document.querySelector('#windowHelperModal .dom-helper-steps');
  const step1 = document.querySelector('#windowStep1');
  const step2 = document.querySelector('#windowStep2');
  const step3 = document.querySelector('#windowStep3');
  const conditionSection = document.querySelector('#windowConditionSection');
  const backBtn = document.querySelector('#backWindowHelper');
  const useBtn = document.querySelector('#useWindowProperty');

  if (step1 && step2 && step3 && stepsContainer) {
    // Update progress indicator
    stepsContainer.setAttribute('data-progress', activeStep);

    // Step 1
    step1.classList.toggle('active', activeStep === 1);
    step1.classList.toggle('completed', activeStep > 1);

    // Step 2
    step2.classList.toggle('active', activeStep === 2);
    step2.classList.toggle('completed', activeStep > 2);

    // Step 3
    step3.classList.toggle('active', activeStep === 3);
    step3.classList.remove('completed'); // Last step never shows completed

    // Show/hide condition section
    if (conditionSection) {
      conditionSection.style.display = activeStep === 3 ? 'block' : 'none';
    }

    // Update back button visibility
    if (backBtn) {
      backBtn.classList.toggle('hidden', activeStep === 1);
    }

    // Update button text based on step
    if (useBtn) {
      switch (activeStep) {
        case 1:
          useBtn.textContent = 'Next: Choose Property';
          break;
        case 2:
          useBtn.textContent = 'Next: Select Condition';
          break;
        case 3:
          useBtn.textContent = 'Use Property';
          break;
      }
    }

    // Update preview
    this.updateWindowRulePreview();
  }
};

Rules.prototype.updateWindowRulePreview = function() {
  const customInput = document.querySelector('#windowCustomInput');
  const conditionSelect = document.querySelector('#windowConditionSelect');
  const previewContent = document.querySelector('#windowPreviewContent');

  if (customInput && previewContent) {
    const property = customInput.value.trim();
    const condition = conditionSelect?.value || 'exists';

    if (property) {
      previewContent.textContent = `Window: "${property}" (${condition})`;
      previewContent.style.color = '';
    } else {
      previewContent.textContent = '';
    }
  }
};

Rules.prototype.goBackWindowHelper = function() {
  const step2 = document.querySelector('#windowStep2');
  const step3 = document.querySelector('#windowStep3');

  if (step3?.classList.contains('active')) {
    this.updateWindowHelperSteps(2);
  } else if (step2?.classList.contains('active')) {
    this.updateWindowHelperSteps(1);
    const keywordInput = document.querySelector('#windowKeywordInput');
    if (keywordInput) {
      keywordInput.focus();
    }
  }
};

Rules.prototype.generateWindowTemplates = function(keyword) {
  if (!keyword || keyword.trim() === '') return [];

  const cssKeyword = keyword.replace(/\s+/g, '-').toLowerCase();

  const templates = [
    { property: cssKeyword, label: `Property "${keyword}"` },
    { property: `window.${cssKeyword}`, label: `window.${cssKeyword}` },
    { property: `navigator.${cssKeyword}`, label: `navigator.${cssKeyword}` },
    { property: `document.${cssKeyword}`, label: `document.${cssKeyword}` },
    { property: `globalThis.${cssKeyword}`, label: `globalThis.${cssKeyword}` }
  ];

  return templates;
};

Rules.prototype.displayWindowSuggestions = function(keyword) {
  const suggestionsContainer = document.querySelector('#windowSuggestions');
  if (!suggestionsContainer) return;

  suggestionsContainer.innerHTML = '';

  if (!keyword || keyword.trim() === '') {
    suggestionsContainer.innerHTML = `
      <div class="suggestions-empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
        </svg>
        <div class="empty-title">Start typing to see suggestions</div>
        <div class="empty-hint">We'll show common window properties matching your search</div>
        <div class="empty-examples">
          Try: <code>chrome</code> <code>webkit</code> <code>eval</code> <code>cdc_</code>
        </div>
      </div>
    `;
    return;
  }

  const templates = this.generateWindowTemplates(keyword);

  templates.forEach(template => {
    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'window-suggestion';
    suggestionDiv.dataset.property = template.property;
    suggestionDiv.style.cssText = 'padding: 10px 12px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;';
    suggestionDiv.innerHTML = `
      <div style="font-family: 'Monaco', 'Courier New', monospace; font-size: 12px; color: var(--accent); font-weight: 500;">${this.escapeHtml(template.property)}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${template.label}</div>
    `;
    suggestionDiv.addEventListener('mouseenter', () => {
      suggestionDiv.style.background = 'var(--bg-secondary)';
    });
    suggestionDiv.addEventListener('mouseleave', () => {
      suggestionDiv.style.background = 'var(--bg-tertiary)';
    });
    suggestionsContainer.appendChild(suggestionDiv);
  });
};

Rules.prototype.openWindowHelperModal = function(methodItem, inputIndex) {
  const modal = document.querySelector('#windowHelperModal');
  if (!modal) return;

  this.currentWindowMethodItem = methodItem;

  const nameInput = methodItem.querySelector('.method-input.method-name');
  const currentValue = nameInput?.value || '';

  // Clear keyword input FIRST (existing value goes only in custom input, not here)
  const keywordInput = document.querySelector('#windowKeywordInput');
  if (keywordInput) {
    keywordInput.value = '';
  }

  // Set custom input to current value (existing property goes here)
  const customInput = document.querySelector('#windowCustomInput');
  if (customInput) {
    customInput.value = currentValue;
  }

  this.displayWindowSuggestions('');
  this.updateWindowHelperSteps(1);
  this.resetConditionDropdown();

  // Update preview if there's an existing value
  this.updateWindowRulePreview();

  // Hide parent modal backdrop to prevent blur stacking
  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  if (editBackdrop) editBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Focus keyword input after modal is visible
  if (keywordInput) {
    keywordInput.focus();
  }
};

Rules.prototype.resetConditionDropdown = function() {
  const container = document.querySelector('#conditionDropdownContainer');
  const hiddenInput = document.querySelector('#windowConditionSelect');
  const selectedText = document.querySelector('.condition-selected-text');
  const menu = document.querySelector('#conditionDropdownMenu');

  if (hiddenInput) {
    hiddenInput.value = 'exists';
  }

  if (selectedText) {
    selectedText.textContent = 'Exists';
  }

  if (menu) {
    menu.querySelectorAll('.condition-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === 'exists');
    });
  }

  if (container) {
    container.classList.remove('open');
  }
};

Rules.prototype.useWindowProperty = function() {
  const customInput = document.querySelector('#windowCustomInput');
  const property = customInput?.value.trim();
  const step3 = document.querySelector('#windowStep3');
  const isOnStep3 = step3?.classList.contains('active');

  if (!property) {
    alert('Please select or enter a property');
    return;
  }

  // If we're not on step 3 yet, move to step 3 (condition selection)
  if (!isOnStep3) {
    this.updateWindowHelperSteps(3);
    return;
  }

  // We're on step 3, now apply both property and condition
  const conditionSelect = document.querySelector('#windowConditionSelect');
  const condition = conditionSelect?.value || 'exists';

  if (this.currentWindowMethodItem) {
    const nameInput = this.currentWindowMethodItem.querySelector('.method-input.method-name');
    const valueInput = this.currentWindowMethodItem.querySelector('.method-input.method-value');

    if (nameInput) {
      nameInput.value = property;
    }
    if (valueInput) {
      valueInput.value = condition;
    }

    this.syncInlineConditionDropdown?.(this.currentWindowMethodItem);
    this.updateMethodIndicators(this.currentWindowMethodItem);
  }

  this.closeWindowHelperModal();
};

Rules.prototype.closeWindowHelperModal = function() {
  const modal = document.querySelector('#windowHelperModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    this.currentWindowMethodItem = null;

    // Restore parent modal backdrop
    const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
    if (editBackdrop) editBackdrop.style.display = '';
  }
};

// ============================================
// Regex Helper Modal
// ============================================
