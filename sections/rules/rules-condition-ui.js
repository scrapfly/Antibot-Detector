/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.refreshWindowConditionWizardDropdown = function() {
    const menu = document.querySelector('#conditionDropdownMenu');
    if (!menu) return;

    const hidden = document.querySelector('#windowConditionSelect');
    const selected = (hidden?.value || 'exists').trim() || 'exists';

    // Rebuild menu using the same rendering as inline dropdowns.
    menu.innerHTML = this.renderWindowConditionMenu(selected);

    // Keep trigger text consistent with the hidden value.
    const triggerText = document.querySelector('#conditionDropdownTrigger .condition-selected-text');
    if (triggerText) {
      triggerText.textContent = selected;
    }
  };

Rules.prototype.escapeHtml = function(str) {
    return FormatUtils.escapeHtml(str);
  };

Rules.prototype.getWindowConditionOptions = function() {
    const lang = globalThis.ScrapflyWindowConditionLanguage;
    const defaults = (lang && typeof lang.getPresetValues === 'function')
      ? lang.getPresetValues()
      : [
          'exists',
          'truthy',
          'falsy',
          'typeof object',
          'typeof function',
          'typeof string',
          'typeof number',
          'typeof boolean',
          '!== undefined',
          '=== undefined',
          '!== null',
          '=== null',
          'not undefined',
          'not null',
          'array',
          'non-empty array',
          'empty array',
          'has keys',
          'empty object',
          '> 0',
          '>= 0',
          '=== 0',
          '> 1',
          '>= 1',
          'length > 0',
          'length === 0',
          '=== true',
          '=== false'
        ];

    const options = [];
    const addOption = (value) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return;
      if (!options.includes(trimmed)) {
        options.push(trimmed);
      }
    };

    // Keep UI and engine aligned by defaulting to the shared condition language.
    defaults.forEach(addOption);

    const existsIndex = options.indexOf('exists');
    if (existsIndex > 0) {
      options.splice(existsIndex, 1);
      options.unshift('exists');
    } else if (existsIndex === -1) {
      options.unshift('exists');
    }

    return options;
  };

Rules.prototype.getWindowConditionGroups = function() {
    const lang = globalThis.ScrapflyWindowConditionLanguage;
    if (lang && typeof lang.getPresetGroups === 'function') {
      return lang.getPresetGroups();
    }

    return [
      { label: 'Type', values: ['typeof object', 'typeof function', 'typeof string', 'typeof number', 'typeof boolean'] },
      { label: 'Existence', values: ['exists', 'truthy', 'falsy', '!== undefined', '=== undefined', '!== null', '=== null', 'not undefined', 'not null'] },
      { label: 'Collections', values: ['array', 'non-empty array', 'empty array', 'has keys', 'empty object'] },
      { label: 'Numeric', values: ['> 0', '>= 0', '=== 0', '> 1', '>= 1'] },
      { label: 'String', values: ['length > 0', 'length === 0'] },
      { label: 'Boolean', values: ['=== true', '=== false'] }
    ];
  };

Rules.prototype.renderWindowConditionMenu = function(selectedValue) {
    const options = this.getWindowConditionOptions();
    const normalized = (selectedValue || '').trim();
    const selected = normalized || 'exists';
    const available = new Set(options);

    const groups = this.getWindowConditionGroups();

    const renderOption = (value) => {
      const safeValue = this.escapeHtml(value);
      const isSelected = value === selected;
      return `<div class="condition-option${isSelected ? ' selected' : ''}" data-value="${safeValue}">${safeValue}</div>`;
    };

    const renderedGroups = groups.map((group) => {
      const values = group.values.filter((value) => available.has(value));
      if (values.length === 0) return '';
      return `
        <div class="condition-group">
          <div class="condition-group-label">${group.label}</div>
          ${values.map(renderOption).join('')}
        </div>
      `;
    }).join('');

    const extras = options.filter((value) => !groups.some((group) => group.values.includes(value)));
    const extraGroup = extras.length
      ? `
        <div class="condition-group">
          <div class="condition-group-label">Other</div>
          ${extras.map(renderOption).join('')}
        </div>
      `
      : '';

    const customGroup = normalized && !options.includes(normalized)
      ? `
        <div class="condition-group">
          <div class="condition-group-label">Custom</div>
          ${renderOption(normalized)}
        </div>
      `
      : '';

    return renderedGroups + extraGroup + customGroup;
  };

Rules.prototype.renderInlineConditionDropdown = function(conditionValue, methodKey, itemIndex) {
    const selected = (conditionValue || 'exists').trim() || 'exists';
    const safeSelected = this.escapeHtml(selected);
    const menu = this.renderWindowConditionMenu(selected);

    return `
      <div class="condition-dropdown inline-condition-dropdown" data-condition-dropdown="window" data-condition-value="${safeSelected}">
        <button type="button" class="condition-dropdown-trigger" aria-expanded="false">
          <span class="condition-selected-text">${safeSelected}</span>
          <svg class="dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 8L1 3h10z"/>
          </svg>
        </button>
        <div class="condition-dropdown-menu">
          ${menu}
        </div>
        <input type="hidden" class="method-input method-value" value="${safeSelected}" data-method-key="${methodKey}" data-item-index="${itemIndex}">
      </div>
    `;
  };

Rules.prototype.syncInlineConditionDropdown = function(methodItem) {
    const dropdown = methodItem?.querySelector('.inline-condition-dropdown');
    if (!dropdown) return;
    const hiddenInput = dropdown.querySelector('.method-input.method-value');
    const value = hiddenInput?.value || 'exists';
    const selectedText = dropdown.querySelector('.condition-selected-text');
    if (selectedText) {
      selectedText.textContent = value;
    }
    dropdown.dataset.conditionValue = value;
    dropdown.querySelectorAll('.condition-option').forEach((option) => {
      option.classList.toggle('selected', option.dataset.value === value);
    });
  };

Rules.prototype.generateDomTemplates = function(keyword) {
    if (!keyword || keyword.trim() === '') return [];

    // Store original keyword for display and create CSS-safe version
    const originalKeyword = keyword;
    const cssKeyword = keyword.replace(/\s+/g, '-').toLowerCase();

    const templates = [
      // Basic selectors (use CSS-safe keyword for selector, original for display)
      { selector: `.${cssKeyword}`, label: `Class selector for "${originalKeyword}"` },
      { selector: `#${cssKeyword}`, label: `ID selector for "${originalKeyword}"` },
      { selector: `[data-${cssKeyword}]`, label: `Data attribute for "${originalKeyword}"` },
      { selector: `[class*='${originalKeyword}']`, label: `Classes containing "${originalKeyword}"` },
      { selector: `[id*='${originalKeyword}']`, label: `IDs containing "${originalKeyword}"` },
      { selector: `iframe[src*='${originalKeyword}']`, label: `Iframes with "${originalKeyword}" in URL` },
      { selector: `[title*='${originalKeyword}']`, label: `Elements with "${originalKeyword}" in title` },
      { selector: `[alt*='${originalKeyword}']`, label: `Elements with "${originalKeyword}" in alt text` }
    ];

    // Only show element selector if it's a valid HTML tag name
    if (!keyword.includes(' ') && !keyword.includes('-')) {
      templates.splice(5, 0,
        { selector: `${cssKeyword}`, label: `${originalKeyword} HTML tag` },
        { selector: `[${cssKeyword}]`, label: `Elements with ${originalKeyword} attribute` }
      );
    }

    // For compound words, also generate variations
    if (cssKeyword.includes('-') || cssKeyword.includes('_')) {
      const camelCase = cssKeyword.replace(/[-_]([a-z])/g, (g) => g[1].toUpperCase());
      templates.push(
        { selector: `.${camelCase}`, label: `Class selector for "${camelCase}" (camelCase)` }
      );
    }

    return templates;
  };

Rules.prototype.displayDomSuggestions = function(keyword) {
    const suggestionsContainer = document.querySelector('#domSuggestions');
    const customInput = document.querySelector('#domCustomInput');

    if (!suggestionsContainer) return;

    // Clear existing suggestions
    suggestionsContainer.innerHTML = '';

    if (!keyword || keyword.trim() === '') {
      // Show empty state message
      suggestionsContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">
          Start typing above to see suggestions...
        </div>
      `;
      return;
    }

    // Generate dynamic templates based on keyword
    const templates = this.generateDomTemplates(keyword);

    // Build HTML for all suggestions
    let suggestionsHTML = '';

    templates.forEach(template => {
      const escapedSelector = this.escapeHtml(template.selector);
      const escapedLabel = this.escapeHtml(template.label);
      suggestionsHTML += `
        <div class="dom-suggestion" data-selector="${escapedSelector}">
          <div class="dom-suggestion-selector">${escapedSelector}</div>
          <div class="dom-suggestion-label">${escapedLabel}</div>
        </div>
      `;
    });

    // Set all suggestions at once
    suggestionsContainer.innerHTML = suggestionsHTML;

    // Update custom input placeholder
    if (customInput) {
      customInput.placeholder = `Or enter custom selector for "${keyword}"...`;
    }
  };
