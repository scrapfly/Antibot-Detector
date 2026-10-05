/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.refreshWindowConditionWizardDropdown = function() {
    // The window property helper builds its condition picker from the shared
    // condition language presets (see helpers/helper-window.js).
    this.renderWindowConditionSelect?.(document.querySelector('#windowConditionSelect')?.value || 'exists');
  };

Rules.prototype.getWindowConditionOptions = function() {
    const lang = globalThis.ScrapflyWindowConditionLanguage;
    const defaults = (lang && typeof lang.getPresetValues === 'function')
      ? lang.getPresetValues()
      // Fallback must mirror PRESET_GROUPS in window-condition-language.js
      : [
          'typeof object',
          'typeof function',
          'typeof string',
          'typeof number',
          'typeof boolean',
          'typeof symbol',
          'typeof bigint',
          'exists',
          'truthy',
          'falsy',
          '!== undefined',
          '=== undefined',
          '!== null',
          '=== null',
          'array',
          'non-empty array',
          'empty array',
          'has length',
          'has keys',
          'empty object',
          '> 0',
          '>= 0',
          '=== 0',
          '!== 0',
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

    // Fallback must mirror PRESET_GROUPS in window-condition-language.js
    return [
      { label: 'Type', values: ['typeof object', 'typeof function', 'typeof string', 'typeof number', 'typeof boolean', 'typeof symbol', 'typeof bigint'] },
      { label: 'Existence', values: ['exists', 'truthy', 'falsy', '!== undefined', '=== undefined', '!== null', '=== null'] },
      { label: 'Collections', values: ['array', 'non-empty array', 'empty array', 'has length', 'has keys', 'empty object'] },
      { label: 'Numeric', values: ['> 0', '>= 0', '=== 0', '!== 0', '> 1', '>= 1'] },
      { label: 'String', values: ['length > 0', 'length === 0'] },
      { label: 'Boolean', values: ['=== true', '=== false'] }
    ];
  };

/**
 * Group heading of the condition menu in the UI language. Reuses the keys of
 * the window property helper (WINDOW_CONDITION_GROUP_KEYS in
 * helpers/helper-window.js); the preset group names themselves stay English.
 * @param {string} label - Preset group name (Type, Existence, ...)
 * @returns {string}
 */
Rules.prototype.getWindowConditionGroupLabel = function(label) {
    const keys = (typeof WINDOW_CONDITION_GROUP_KEYS !== 'undefined') ? WINDOW_CONDITION_GROUP_KEYS : null;
    const entry = keys && keys[label];
    if (!entry) return label;
    return (typeof I18n !== 'undefined' && I18n.get(entry[0])) || entry[1];
  };

Rules.prototype.renderWindowConditionMenu = function(selectedValue) {
    const options = this.getWindowConditionOptions();
    const normalized = (selectedValue || '').trim();
    const selected = normalized || 'exists';
    const available = new Set(options);

    const groups = this.getWindowConditionGroups();
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const otherLabel = FormatUtils.escapeHtml((_t && _t.get('ruleConditionGroupOther')) || 'Other');
    const customLabel = FormatUtils.escapeHtml((_t && _t.get('rhCustomChip')) || 'Custom');

    const renderOption = (value) => {
      const safeValue = FormatUtils.escapeHtml(value);
      const isSelected = value === selected;
      return `<div class="condition-option${isSelected ? ' selected' : ''}" data-value="${safeValue}">${safeValue}</div>`;
    };

    const renderedGroups = groups.map((group) => {
      const values = group.values.filter((value) => available.has(value));
      if (values.length === 0) return '';
      return `
        <div class="condition-group">
          <div class="condition-group-label">${FormatUtils.escapeHtml(this.getWindowConditionGroupLabel(group.label))}</div>
          ${values.map(renderOption).join('')}
        </div>
      `;
    }).join('');

    const extras = options.filter((value) => !groups.some((group) => group.values.includes(value)));
    const extraGroup = extras.length
      ? `
        <div class="condition-group">
          <div class="condition-group-label">${otherLabel}</div>
          ${extras.map(renderOption).join('')}
        </div>
      `
      : '';

    const customGroup = normalized && !options.includes(normalized)
      ? `
        <div class="condition-group">
          <div class="condition-group-label">${customLabel}</div>
          ${renderOption(normalized)}
        </div>
      `
      : '';

    return renderedGroups + extraGroup + customGroup;
  };

Rules.prototype.renderInlineConditionDropdown = function(conditionValue, methodKey, itemIndex) {
    const selected = (conditionValue || 'exists').trim() || 'exists';
    const safeSelected = FormatUtils.escapeHtml(selected);
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
