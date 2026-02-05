function normalizeCookieHeaderScope(scope, fallback) {
  const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
  if (normalized === 'all_with_storage') return 'all';
  if (normalized === 'storage') return fallback;
  if (normalized === 'request' || normalized === 'response' || normalized === 'all') return normalized;
  return fallback;
}

class Rules {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.categoryManager = detectorManager.getCategoryManager();
    this.initialized = false;
    this.eventListenersSetup = false;
    this.paginationManager = null;
    this.colorManager = null;
    this.searchManager = null;
    this.allDetectors = [];
    this.filteredDetectors = [];
  }

  /**
   * Initialize rules section
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      // Keep WINDOW condition dropdowns aligned with the shared condition language (no duplicated lists).
      this.refreshWindowConditionWizardDropdown();
      this.setupPagination();
      this.initializeColorManager();
      this.initializeSearchManager();
      this.setupEventListeners();
      this.initialized = true;
    }
  }

  /**
   * Refresh the WINDOW helper modal condition dropdown menu content.
   * The base HTML provides a minimal fallback, but we prefer the shared condition language presets.
   */
  refreshWindowConditionWizardDropdown() {
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
  }

  /**
   * Load HTML template into rules tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/rules/rules.html'));
      const html = await response.text();

      const rulesTab = document.querySelector('#rulesTab');
      if (rulesTab) {
        rulesTab.innerHTML = html;
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load rules HTML:', error);
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('rulesPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectorsPage(items);
      }
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search functionality
    const searchInput = document.querySelector('#rulesSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Button event listeners
    this.setupButtonListeners();

    // Modal functionality
    this.setupModalEventListeners();

    // Toggle switches - handle enable/disable
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('detector-toggle')) {
        const toggle = e.target;
        const detectorName = toggle.dataset.detector;
        const category = toggle.dataset.category;
        const enabled = toggle.checked;

        if (detectorName && category) {
          this.updateDetectorEnabledState(category, detectorName, enabled);
        }
      }
    });
  }

  /**
   * Setup button event listeners
   */
  setupButtonListeners() {
    // Import button
    const importBtn = document.querySelector('#importRulesBtn');
    const importFile = document.querySelector('#importRulesFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }

    // Export button
    const exportBtn = document.querySelector('#exportRulesBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }

    // Clear button
    const clearBtn = document.querySelector('#clearRulesBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.handleClear());
    }

    // Add button
    const addBtn = document.querySelector('#addDetectorBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.handleAddDetector());
    }

    // Update button - checks for updates or applies pending ones
    const checkUpdatesBtn = document.querySelector('#checkUpdatesBtn');
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener('click', () => this.handleCheckUpdates());
    }

    // Check for pending updates on load (shows badge if any)
    this.checkPendingUpdates();
  }

  /**
   * Initialize color manager
   */
  initializeColorManager() {
    this.colorManager = new ColorManager();
    this.colorManager.initialize({
      onColorSelect: (color) => {
        Logger.ui('Color selected:', color);
        // Note: Colors are managed by CategoryManager in Settings, not stored per detector
      },
      onColorChange: (color) => {
        Logger.ui('Color changed:', color);
      }
    });
  }

  /**
   * Initialize search manager
   */
  initializeSearchManager() {
    if (typeof SearchManager !== 'undefined') {
      this.searchManager = new SearchManager({
        caseSensitive: false,
        searchOperator: 'AND'
      });
    } else {
      Logger.warn('UI', 'SearchManager not loaded');
    }
  }

  /**
   * Setup modal event listeners
   */
  setupModalEventListeners() {
    // Close modal events
    const closeBtn = document.querySelector('#closeRuleModal');
    const cancelBtn = document.querySelector('#cancelRuleEdit');
    const backdrop = document.querySelector('.rule-modal-backdrop');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeEditModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeEditModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeEditModal());
    }

    // Save button
    const saveBtn = document.querySelector('#saveRuleEdit');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveRule());
    }

    // Category change - update icon styling
    const categorySelect = document.querySelector('#detectorCategorySelect');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        const currentIconContainer = document.querySelector('.current-icon');
        if (currentIconContainer) {
          if (e.target.value.toLowerCase() === 'fingerprint') {
            currentIconContainer.classList.add('fingerprint-icon');
          } else {
            currentIconContainer.classList.remove('fingerprint-icon');
          }
        }
      });
    }

    // Method helper modal for all detection types
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.method-help-btn[data-method-help]');
      if (button) {
        event.stopPropagation();
        const methodType = button.dataset.methodHelp;
        this.openMethodHelpModal(methodType);
      }
    });

    // Change Icon button
    const changeIconBtn = document.querySelector('.change-icon-btn');
    if (changeIconBtn) {
      changeIconBtn.addEventListener('click', () => this.openIconPicker());
    }

    // Setup method settings modal
    this.setupMethodSettingsModal();

    // Setup DOM helper modal
    this.setupDomHelperModal();

    // Setup Window helper modal
    this.setupWindowHelperModal();

    // Setup Regex helper modal
    this.setupRegexHelperModal();

    // Setup Whole Word helper modal
    this.setupWholeWordHelperModal();

    // Setup Case Sensitive helper modal
    this.setupCaseSensitiveHelperModal();

    // Setup HTTP method color for network request modal dropdown
    const networkMethod = document.querySelector('#networkMethod');
    if (networkMethod) {
      this.updateHttpMethodColor(networkMethod);
      networkMethod.addEventListener('change', () => this.updateHttpMethodColor(networkMethod));
    }

    // Setup explanation modals
    this.setupRegexExplanationModal();
    this.setupWholeWordExplanationModal();
    this.setupCaseSensitiveExplanationModal();

    // Setup method help modal
    this.setupMethodHelpModal();
  }

  /**
   * Setup method settings modal event listeners
   */
  setupMethodSettingsModal() {
    // Prevent duplicate event listener registration
    if (this.eventListenersSetup) {
      return;
    }
    this.eventListenersSetup = true;

    const modal = document.querySelector('#methodSettingsModal');
    const closeBtn = document.querySelector('#closeMethodSettings');
    const cancelBtn = document.querySelector('#cancelMethodSettings');
    const saveBtn = document.querySelector('#saveMethodSettings');
    const backdrop = modal?.querySelector('.rule-modal-backdrop');
    const slider = document.querySelector('#confidenceSlider');
    const valueDisplay = document.querySelector('#confidenceValue');

    // Close modal events
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeMethodSettingsModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeMethodSettingsModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeMethodSettingsModal());
    }

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveMethodSettings());
    }

    // Update confidence value display when slider changes
    if (slider && valueDisplay) {
      slider.addEventListener('input', (e) => {
        valueDisplay.textContent = e.target.value;
      });
    }

    // Setup HTTP method badge radio button listeners for .checked class toggle
    document.querySelectorAll('.http-method-badge input[type="radio"], .http-method-badge input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', (e) => {
        // For radio buttons, remove .checked from all badges in the same group first
        if (e.target.type === 'radio') {
          const groupName = e.target.name;
          document.querySelectorAll(`input[name="${groupName}"]`).forEach(radio => {
            const badge = radio.closest('.http-method-badge');
            if (badge) badge.classList.remove('checked');
          });
        }

        const badge = e.target.closest('.http-method-badge');
        if (badge) {
          badge.classList.toggle('checked', e.target.checked);
        }

        // Handle custom method - show/hide input field
        if (e.target.id === 'payloadMethodCustom') {
          const customContainer = document.querySelector('#customMethodInputContainer');
          if (customContainer) {
            customContainer.style.display = e.target.checked ? 'block' : 'none';
          }
        } else if (e.target.name === 'payloadMethod') {
          // Hide custom input when selecting other methods
          const customContainer = document.querySelector('#customMethodInputContainer');
          if (customContainer) {
            customContainer.style.display = 'none';
          }
        }
      });
    });

    // Setup click handlers for settings buttons (using event delegation)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.method-action-btn.settings')) {
        e.stopPropagation();
        const button = e.target.closest('.method-action-btn.settings');
        const fieldActions = button.closest('.field-actions');
        const fieldType = fieldActions?.dataset.fieldType || 'name';
        const methodItem = button.closest('.method-item');
        if (methodItem) {
          this.openMethodSettingsModal(methodItem, fieldType);
        }
      }

      // Handle inline condition dropdown trigger
      if (e.target.closest('.condition-dropdown-trigger')) {
        e.stopPropagation();
        const trigger = e.target.closest('.condition-dropdown-trigger');
        const dropdown = trigger.closest('.condition-dropdown');
        if (dropdown) {
          document.querySelectorAll('.condition-dropdown.open').forEach(openDropdown => {
            if (openDropdown !== dropdown) {
              openDropdown.classList.remove('open');
            }
          });
          dropdown.classList.toggle('open');
          trigger.setAttribute('aria-expanded', dropdown.classList.contains('open') ? 'true' : 'false');
        }
        return;
      }

      // Handle inline condition option selection
      if (e.target.closest('.condition-dropdown .condition-option')) {
        e.stopPropagation();
        const option = e.target.closest('.condition-option');
        const dropdown = option.closest('.condition-dropdown');
          if (dropdown) {
            const value = option.dataset.value;
            const selectedText = dropdown.querySelector('.condition-selected-text');
            if (selectedText) {
              selectedText.textContent = value;
            }
            dropdown.dataset.conditionValue = value;
            dropdown.querySelectorAll('.condition-option').forEach(opt => {
              opt.classList.toggle('selected', opt === option);
            });

          const hiddenInput = dropdown.querySelector('.method-input.method-value');
          if (hiddenInput) {
            hiddenInput.value = value;
            const methodItem = dropdown.closest('.method-item');
            if (methodItem) {
              this.updateMethodIndicators(methodItem);
            }
          }

          // Handle wizard dropdown (window helper modal)
          const helperHidden = document.querySelector('#windowConditionSelect');
          if (helperHidden && dropdown.id === 'conditionDropdownContainer') {
            helperHidden.value = value;
            this.updateWindowRulePreview?.();
          }

          dropdown.classList.remove('open');
          const trigger = dropdown.querySelector('.condition-dropdown-trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
        return;
      }

      // Close condition dropdowns when clicking outside
      if (!e.target.closest('.condition-dropdown')) {
        document.querySelectorAll('.condition-dropdown.open').forEach(openDropdown => {
          openDropdown.classList.remove('open');
          const trigger = openDropdown.querySelector('.condition-dropdown-trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
      }

      // Handle delete button
      if (e.target.closest('.method-action-btn.delete')) {
        e.stopPropagation();
        const button = e.target.closest('.method-action-btn.delete');
        const fieldActions = button.closest('.field-actions');
        const fieldType = fieldActions?.dataset.fieldType || 'name';
        const methodItem = button.closest('.method-item');

        if (methodItem) {
          if (fieldType === 'value') {
            // Clear value input and hide value row
            const valueInput = methodItem.querySelector('.method-input.method-value');
            const valueContainer = methodItem.querySelector('.value-field-container');
            const addValueBtn = methodItem.querySelector('.add-value-btn');
            const methodKey = methodItem.querySelector('.method-input')?.dataset.methodKey || '';

            if (methodKey === 'window') {
              if (valueInput) {
                valueInput.value = 'exists';
                this.updateMethodIndicators(methodItem);
              }
              if (valueContainer) valueContainer.style.display = 'flex';
              if (addValueBtn) addValueBtn.style.display = 'none';
              return;
            }

            if (valueInput) {
              valueInput.value = '';
              // Clear value-related settings
              methodItem.dataset.valueRegex = 'false';
              methodItem.dataset.valueWholeword = 'false';
              methodItem.dataset.valueCase = 'false';
              // Update indicators
              this.updateMethodIndicators(methodItem);
              // Update the settings button to remove highlight
              const valueSettingsBtn = fieldActions.querySelector('.method-action-btn.settings');
              if (valueSettingsBtn) {
                valueSettingsBtn.classList.remove('has-custom-settings');
              }
            }
            // Hide value container and show "Add Value" button
            if (valueContainer) valueContainer.style.display = 'none';
            if (addValueBtn) addValueBtn.style.display = 'flex';
          } else {
            // Remove entire method item
            methodItem.remove();
          }
        }
      }

      // Handle "Add Value" button
      if (e.target.closest('.add-value-btn')) {
        e.stopPropagation();
        const button = e.target.closest('.add-value-btn');
        const methodItem = button.closest('.method-item');

        if (methodItem) {
          const valueContainer = methodItem.querySelector('.value-field-container');
          const valueInput = methodItem.querySelector('.method-input.method-value');

          // Hide "Add Value" button and show value container
          button.style.display = 'none';
          if (valueContainer) valueContainer.style.display = 'flex';
          // Focus the value input
          if (valueInput) valueInput.focus();
        }
      }

      // Handle add method button
      if (e.target.closest('.add-method-btn')) {
        e.stopPropagation();
        const button = e.target.closest('.add-method-btn');
        this.addNewMethodItem(button);
      }

      // Handle add section button
      if (e.target.closest('.add-section-btn')) {
        e.stopPropagation();
        this.addNewMethodSection();
      }

      // Handle method header click (toggle collapse)
      if (e.target.closest('.method-header')) {
        const header = e.target.closest('.method-header');
        // Don't toggle if clicking help button, add method button, or other interactive elements
        if (!e.target.closest('.method-help-btn') && !e.target.closest('.add-method-btn') && !e.target.closest('button')) {
          const section = header.closest('.method-section');
          if (section) {
            section.classList.toggle('collapsed');
          }
        }
      }
    });
  }

  /**
   * Open method settings modal for a specific method item
   * @param {HTMLElement} methodItem - The method item element
   * @param {string} fieldType - The field type ('name' or 'value')
   */
  openMethodSettingsModal(methodItem, fieldType = 'name') {
    const modal = document.querySelector('#methodSettingsModal');
    if (!modal) return;

    // Store reference to current method item and field type
    this.currentMethodItem = methodItem;
    this.currentFieldType = fieldType;

    // Determine method type from the method item
    const methodKey = methodItem.querySelector('.method-input')?.dataset.methodKey || '';
    const isContentMethod = methodKey === 'content';

    // Load current settings from data attributes
    const confidence = methodItem.dataset.confidence || '100';
    const nameRegex = methodItem.dataset.nameRegex === 'true';
    const nameWholeword = methodItem.dataset.nameWholeword === 'true';
    const nameCase = methodItem.dataset.nameCase === 'true';
    const valueRegex = methodItem.dataset.valueRegex === 'true';
    const valueWholeword = methodItem.dataset.valueWholeword === 'true';
    const valueCase = methodItem.dataset.valueCase === 'true';
    const checkScripts = methodItem.dataset.checkScripts === 'true'; // Default: false (entire page)

    // Load scope settings from data attributes
    let nameScope = methodItem.dataset.nameScope || (methodKey === 'header' || methodKey === 'cookie' ? (methodKey === 'header' ? 'response' : 'request') : '');
    let valueScope = methodItem.dataset.valueScope || (methodKey === 'header' || methodKey === 'cookie' ? (methodKey === 'header' ? 'response' : 'request') : '');
    const textScope = methodItem.dataset.textScope || 'all';

    if (methodKey === 'header') {
      nameScope = normalizeCookieHeaderScope(nameScope, 'response');
      valueScope = normalizeCookieHeaderScope(valueScope, 'response');
    } else if (methodKey === 'cookie') {
      nameScope = normalizeCookieHeaderScope(nameScope, 'request');
      valueScope = normalizeCookieHeaderScope(valueScope, 'request');
    }

    // Set values in modal
    const confidenceSlider = document.querySelector('#confidenceSlider');
    const confidenceValue = document.querySelector('#confidenceValue');

    if (confidenceSlider) confidenceSlider.value = confidence;
    if (confidenceValue) confidenceValue.textContent = confidence;

    // Set checkboxes
    const setCheckbox = (id, value) => {
      const checkbox = document.querySelector(`#${id}`);
      if (checkbox) checkbox.checked = value;
    };

    setCheckbox('nameRegex', nameRegex);
    setCheckbox('nameWholeWord', nameWholeword);
    setCheckbox('nameCaseSensitive', nameCase);
    setCheckbox('valueRegex', valueRegex);
    setCheckbox('valueWholeWord', valueWholeword);
    setCheckbox('valueCaseSensitive', valueCase);
    setCheckbox('checkScripts', checkScripts);

    // Set scope dropdowns
    const nameScopeSelect = document.querySelector('#nameScope');
    const valueScopeSelect = document.querySelector('#valueScope');
    const textScopeSelect = document.querySelector('#textScope');

    if (nameScopeSelect) nameScopeSelect.value = nameScope;
    if (valueScopeSelect) valueScopeSelect.value = valueScope;
    if (textScopeSelect) textScopeSelect.value = textScope;

    // Show only the relevant scope row based on field type
    const nameScopeRow = nameScopeSelect?.closest('.setting-option') || null;
    const valueScopeRow = document.querySelector('#valueScopeRow');
    if (fieldType === 'value') {
      if (nameScopeRow) nameScopeRow.style.display = 'none';
      if (valueScopeRow) valueScopeRow.style.display = 'flex';
    } else {
      if (nameScopeRow) nameScopeRow.style.display = 'flex';
      if (valueScopeRow) valueScopeRow.style.display = 'none';
    }

    // Load payload-specific settings from data attributes
    const payloadUrlPattern = methodItem.dataset.payloadUrlPattern || '';
    const payloadUrlRegex = methodItem.dataset.payloadUrlRegex === 'true';
    const payloadUrlCaseSensitive = methodItem.dataset.payloadUrlCaseSensitive === 'true';
    const payloadMethods = methodItem.dataset.payloadMethods || ''; // Comma-separated: "POST,PUT"

    // Set payload URL pattern input
    const payloadUrlInput = document.querySelector('#payloadUrlPattern');
    if (payloadUrlInput) payloadUrlInput.value = payloadUrlPattern;

    // Set payload URL regex checkbox
    setCheckbox('payloadUrlRegex', payloadUrlRegex);

    // Set payload URL case sensitive checkbox (if it exists)
    setCheckbox('payloadUrlCaseSensitive', payloadUrlCaseSensitive);

    // Set payload HTTP method radio buttons (single selection)
    const selectedMethod = payloadMethods ? payloadMethods.split(',')[0] : ''; // Take first method only
    const standardMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    // Clear all checked states first
    document.querySelectorAll('.http-method-badge').forEach(badge => {
      badge.classList.remove('checked');
    });
    document.querySelectorAll('input[name="payloadMethod"]').forEach(radio => {
      radio.checked = false;
    });

    // Check if it's a standard method or custom
    const isCustom = selectedMethod && !standardMethods.includes(selectedMethod.toUpperCase());

    if (isCustom) {
      // Custom method
      const customRadio = document.querySelector('#payloadMethodCustom');
      const customInput = document.querySelector('#customMethodInput');
      const customContainer = document.querySelector('#customMethodInputContainer');
      if (customRadio && customInput && customContainer) {
        customRadio.checked = true;
        customInput.value = selectedMethod;
        customContainer.style.display = 'block';
        const badge = customRadio.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');
      }
    } else if (selectedMethod) {
      // Standard method
      const capitalizedMethod = selectedMethod.charAt(0).toUpperCase() + selectedMethod.slice(1).toLowerCase();
      const radio = document.querySelector(`#payloadMethod${capitalizedMethod}`);
      if (radio) {
        radio.checked = true;
        const badge = radio.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');
      }
      // Hide custom container
      const customContainer = document.querySelector('#customMethodInputContainer');
      if (customContainer) customContainer.style.display = 'none';
    }

    // Show/hide scope settings groups based on method type
    const contentScopeGroup = document.querySelector('#contentScopeGroup');
    const headerCookieScopeGroup = document.querySelector('#headerCookieScopeGroup');
    const urlScopeGroup = document.querySelector('#urlScopeGroup');
    const payloadScopeGroup = document.querySelector('#payloadScopeGroup');

    const isHeaderOrCookie = methodKey === 'header' || methodKey === 'cookie';
    const isUrl = methodKey === 'url';
    const isPayload = methodKey === 'payload';

    if (contentScopeGroup) {
      contentScopeGroup.style.display = isContentMethod ? 'block' : 'none';
    }
    if (headerCookieScopeGroup) {
      headerCookieScopeGroup.style.display = isHeaderOrCookie ? 'block' : 'none';
    }
    if (urlScopeGroup) {
      urlScopeGroup.style.display = isUrl ? 'block' : 'none';
    }
    if (payloadScopeGroup) {
      payloadScopeGroup.style.display = isPayload ? 'block' : 'none';
    }

    // Get field option groups
    const nameFieldGroup = document.querySelector('#nameFieldOptionsGroup');
    const valueFieldGroup = document.querySelector('#valueFieldOptionsGroup');
    const patternOptionsTitle = document.querySelector('#patternOptionsTitle');

    // Show/hide field groups based on which field's settings button was clicked
    if (fieldType === 'value') {
      // Show only value options
      if (nameFieldGroup) nameFieldGroup.style.display = 'none';
      if (valueFieldGroup) valueFieldGroup.style.display = 'block';
    } else {
      // Show only name options (default)
      if (nameFieldGroup) nameFieldGroup.style.display = 'block';
      if (valueFieldGroup) valueFieldGroup.style.display = 'none';

      // Update title based on method type
      if (patternOptionsTitle) {
        if (methodKey === 'urls' || methodKey === 'url') {
          patternOptionsTitle.textContent = 'URL Pattern Matching';
        } else if (methodKey === 'content') {
          patternOptionsTitle.textContent = 'Text/Word Matching';
        } else if (methodKey === 'dom') {
          patternOptionsTitle.textContent = 'DOM Selector Matching';
        } else if (methodKey === 'payload') {
          patternOptionsTitle.textContent = 'Payload Text Matching';
        } else if (methodKey === 'js_hooks') {
          patternOptionsTitle.textContent = 'JS Hook Target Matching';
        } else if (methodKey === 'window') {
          patternOptionsTitle.textContent = 'Window Path Matching';
        } else {
          patternOptionsTitle.textContent = 'Name Field Matching';
        }
      }
    }

    // Hide entire Edit modal while Method Settings is open
    const editModal = document.querySelector('#editRuleModal');
    if (editModal) {
      editModal.style.visibility = 'hidden';
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Update visual indicators for method inputs
   * @param {HTMLElement} methodItem - The method item element
   */
  updateMethodIndicators(methodItem) {
    const nameInput = methodItem.querySelector('.method-input.method-name');
    const valueInput = methodItem.querySelector('.method-input.method-value');

    if (nameInput) {
      // Find indicator by data-for attribute (each input has its own badges in input-badges-row)
      const dataForName = nameInput.dataset.methodKey + '-' + nameInput.dataset.itemIndex;
      const nameIndicator = methodItem.querySelector(`.input-indicators[data-for="name-${dataForName}"]`);

      if (nameIndicator) {
        const indicators = [];

        const hasValue = nameInput.value.trim().length > 0;
        const hasSettings = methodItem.dataset.nameRegex === 'true' ||
          methodItem.dataset.nameWholeword === 'true' ||
          methodItem.dataset.nameCase === 'true';

        if (hasValue || hasSettings) {
          if (methodItem.dataset.nameRegex === 'true') indicators.push('RX');
          if (methodItem.dataset.nameWholeword === 'true') indicators.push('WW');
          if (methodItem.dataset.nameCase === 'true') indicators.push('CS');
        }

        nameIndicator.innerHTML = indicators.map(ind =>
          `<span class="indicator-badge" data-type="${ind}">${ind}</span>`
        ).join('');
      }
    }

    if (valueInput) {
      // Find indicator by data-for attribute (each input has its own badges in input-badges-row)
      const dataForValue = valueInput.dataset.methodKey + '-' + valueInput.dataset.itemIndex;
      const valueIndicator = methodItem.querySelector(`.input-indicators[data-for="value-${dataForValue}"]`);

      if (valueIndicator) {
        const indicators = [];

        const hasValue = valueInput.value.trim().length > 0;
        const hasSettings = methodItem.dataset.valueRegex === 'true' ||
          methodItem.dataset.valueWholeword === 'true' ||
          methodItem.dataset.valueCase === 'true';

        if (hasValue || hasSettings) {
          if (methodItem.dataset.valueRegex === 'true') indicators.push('RX');
          if (methodItem.dataset.valueWholeword === 'true') indicators.push('WW');
          if (methodItem.dataset.valueCase === 'true') indicators.push('CS');
        }

        valueIndicator.innerHTML = indicators.map(ind =>
          `<span class="indicator-badge" data-type="${ind}">${ind}</span>`
        ).join('');
      }
    }
  }

  /**
   * Close method settings modal
   */
  closeMethodSettingsModal() {
    const modal = document.querySelector('#methodSettingsModal');
    if (modal) {
      // Restore Edit modal visibility
      const editModal = document.querySelector('#editRuleModal');
      if (editModal) {
        editModal.style.visibility = '';
      }

      modal.style.display = 'none';
      document.body.style.overflow = '';
      this.currentMethodItem = null;
    }
  }

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Get available window condition options (from helper modal, with fallbacks)
   * @returns {string[]} Array of condition values
   */
  getWindowConditionOptions() {
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
  }

  /**
   * Get grouped window condition presets for dropdown rendering.
   * Falls back to the previous hardcoded grouping if the shared module isn't available.
   * @returns {{label:string, values:string[]}[]}
   */
  getWindowConditionGroups() {
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
  }

  /**
   * Render window condition options for select dropdown
   * @param {string} selectedValue
   * @returns {string}
   */
  renderWindowConditionOptions(selectedValue) {
    const options = this.getWindowConditionOptions();
    const normalized = (selectedValue || '').trim();
    const selected = normalized || 'exists';
    const allOptions = normalized && !options.includes(normalized)
      ? [normalized, ...options]
      : options;

    return allOptions.map((value) => {
      const safeValue = this.escapeHtml(value);
      return `<option value="${safeValue}"${value === selected ? ' selected' : ''}>${safeValue}</option>`;
    }).join('');
  }

  /**
   * Render window condition menu groups for inline dropdown
   * @param {string} selectedValue
   * @returns {string}
   */
  renderWindowConditionMenu(selectedValue) {
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
  }

  /**
   * Render inline condition dropdown for window method
   * @param {string} conditionValue
   * @param {string} methodKey
   * @param {string|number} itemIndex
   * @returns {string}
   */
  renderInlineConditionDropdown(conditionValue, methodKey, itemIndex) {
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
  }

  /**
   * Sync inline condition dropdown UI with hidden input value
   * @param {HTMLElement} methodItem
   */
  syncInlineConditionDropdown(methodItem) {
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
  }

  /**
   * Generate DOM selector templates based on keyword
   * @param {string} keyword - The keyword to generate templates for
   * @returns {Array} Array of selector templates
   */
  generateDomTemplates(keyword) {
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
  }

  /**
   * Display DOM selector suggestions in the modal
   * @param {string} keyword - The keyword to search for
   */
  displayDomSuggestions(keyword) {
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
  }


  // Helper modals (DOM, Condition, Window, Regex, WholeWord, CaseSensitive) are in helpers/helper-modals.js
  // Explanation modals (Regex, WholeWord, CaseSensitive, Method Help) are in modals/explanation-modals.js
  // Icon picker methods (openIconPicker, selectIcon, uploadCustomIcon) are in modals/icon-picker-modal.js

  /**
   * Save method settings from modal to method item
   */
  saveMethodSettings() {
    if (!this.currentMethodItem) return;

    // Get values from modal
    const confidence = parseInt(document.querySelector('#confidenceSlider')?.value || '100', 10);
    const nameRegex = document.querySelector('#nameRegex')?.checked || false;
    const nameWholeWord = document.querySelector('#nameWholeWord')?.checked || false;
    const nameCaseSensitive = document.querySelector('#nameCaseSensitive')?.checked || false;
    const valueRegex = document.querySelector('#valueRegex')?.checked || false;
    const valueWholeWord = document.querySelector('#valueWholeWord')?.checked || false;
    const valueCaseSensitive = document.querySelector('#valueCaseSensitive')?.checked || false;
    const checkScripts = document.querySelector('#checkScripts')?.checked || false; // Default: false (entire page)

    // Get scope values from modal
    let nameScope = document.querySelector('#nameScope')?.value || '';
    let valueScope = document.querySelector('#valueScope')?.value || '';
    const textScope = document.querySelector('#textScope')?.value || 'all';

    const methodType = this.currentMethodItem.dataset.methodType;
    if (methodType === 'header') {
      nameScope = normalizeCookieHeaderScope(nameScope, 'response');
      valueScope = normalizeCookieHeaderScope(valueScope, 'response');
    } else if (methodType === 'cookie') {
      nameScope = normalizeCookieHeaderScope(nameScope, 'request');
      valueScope = normalizeCookieHeaderScope(valueScope, 'request');
    }

    // Get payload-specific values from modal
    const payloadUrlPattern = document.querySelector('#payloadUrlPattern')?.value || '';
    const payloadUrlRegex = document.querySelector('#payloadUrlRegex')?.checked || false;
    const payloadUrlCaseSensitive = document.querySelector('#payloadUrlCaseSensitive')?.checked || false;

    // Get selected HTTP method (single selection)
    let payloadMethods = '';
    const selectedRadio = document.querySelector('input[name="payloadMethod"]:checked');
    if (selectedRadio) {
      if (selectedRadio.value === 'CUSTOM') {
        // Get custom method from input
        const customInput = document.querySelector('#customMethodInput');
        if (customInput && customInput.value.trim()) {
          payloadMethods = customInput.value.trim().toUpperCase();
        }
      } else {
        payloadMethods = selectedRadio.value;
      }
    }

    // Save to data attributes
    this.currentMethodItem.dataset.confidence = confidence;
    this.currentMethodItem.dataset.nameRegex = nameRegex;
    this.currentMethodItem.dataset.nameWholeword = nameWholeWord;
    this.currentMethodItem.dataset.nameCase = nameCaseSensitive;
    this.currentMethodItem.dataset.valueRegex = valueRegex;
    this.currentMethodItem.dataset.valueWholeword = valueWholeWord;
    this.currentMethodItem.dataset.valueCase = valueCaseSensitive;
    this.currentMethodItem.dataset.checkScripts = checkScripts;
    this.currentMethodItem.dataset.nameScope = nameScope;
    this.currentMethodItem.dataset.valueScope = valueScope;
    this.currentMethodItem.dataset.textScope = textScope;
    this.currentMethodItem.dataset.payloadUrlPattern = payloadUrlPattern;
    this.currentMethodItem.dataset.payloadUrlRegex = payloadUrlRegex;
    this.currentMethodItem.dataset.payloadUrlCaseSensitive = payloadUrlCaseSensitive;
    this.currentMethodItem.dataset.payloadMethods = payloadMethods;

    // Add visual indicator if settings are configured
    // Get method type to check if content search scope settings apply

    // Update visual indicators for both name and value settings buttons
    const nameSettingsBtn = this.currentMethodItem.querySelector('.field-actions[data-field-type="name"] .method-action-btn.settings');
    const valueSettingsBtn = this.currentMethodItem.querySelector('.field-actions[data-field-type="value"] .method-action-btn.settings');

    // Check if name or value have custom settings
    const hasNameCustomSettings = nameRegex || nameWholeWord || nameCaseSensitive ||
      (methodType === 'content' && checkScripts === true);
    const hasValueCustomSettings = valueRegex || valueWholeWord || valueCaseSensitive;

    if (nameSettingsBtn) {
      if (hasNameCustomSettings) {
        nameSettingsBtn.classList.add('has-custom-settings');
      } else {
        nameSettingsBtn.classList.remove('has-custom-settings');
      }
      nameSettingsBtn.title = `Name Settings (Confidence: ${confidence}%)`;
    }

    if (valueSettingsBtn) {
      if (hasValueCustomSettings) {
        valueSettingsBtn.classList.add('has-custom-settings');
      } else {
        valueSettingsBtn.classList.remove('has-custom-settings');
      }
      valueSettingsBtn.title = `Value Settings`;
    }

    // Update input indicators
    this.updateMethodIndicators(this.currentMethodItem);

    // Close modal
    this.closeMethodSettingsModal();
  }


  /**
   * Open edit modal for a detector rule
   * @param {object} detector - Detector data
   * @param {string} category - Detector category
   * @param {string} detectorName - Detector name
   */
  openEditModal(detector, category, detectorName, isNew = false) {
    const modal = document.querySelector('#editRuleModal');

    if (!modal) return;

    // Ensure detector has detection property before storing
    const detectorWithDetection = {
      ...detector,
      detection: detector.detection || {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      }
    };

    // Store current detector data BEFORE populating modal
    // Explicitly set isNew based on the parameter, not previous state
    this.currentEditDetector = {
      detector: detectorWithDetection,
      category,
      detectorName,
      isNew: isNew
    };

    // Set dynamic title based on whether it's a new detector
    const action = this.currentEditDetector.isNew ? 'Add' : 'Edit';
    const actionEl = document.querySelector('#editRuleModalAction');
    const nameEl = document.querySelector('#editRuleModalName');
    if (actionEl) actionEl.textContent = `${action} ${detectorWithDetection.displayName || detectorName}`;
    if (nameEl) nameEl.textContent = 'Detection Rule';

    // Populate modal with detector data (now currentEditDetector is available)
    this.populateModalData(detectorWithDetection);

    // Store snapshot of detection AFTER populating form (includes defaults from form)
    // This ensures comparison matches what save will produce
    this.currentEditDetector.originalDetection = this._collectDetectionFromForm();

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  /**
   * Close edit modal
   */
  closeEditModal() {
    const modal = document.querySelector('#editRuleModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
      this.currentEditDetector = null;
    }
  }

  /**
   * Collect detection methods from the form
   * Used to capture original state for change detection
   * @returns {object} Detection methods object
   */
  _collectDetectionFromForm() {
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (!methodsContainer) return {};

    const detectionMethods = {};
    const methodSections = methodsContainer.querySelectorAll('.method-section');

    methodSections.forEach(section => {
      const methodTitle = section.querySelector('.method-title')?.textContent.toLowerCase();
      if (!methodTitle) return;

      // Map display titles to detector data keys
      let methodType = methodTitle;
      if (methodTitle === 'js hooks') {
        methodType = 'js_hooks';
      }

      const methods = [];
      const methodItems = section.querySelectorAll('.method-item');

      methodItems.forEach(item => {
        const nameInput = item.querySelector('.method-name');
        const valueInput = item.querySelector('.method-value');

        const hasName = nameInput && nameInput.value.trim();

        if (hasName) {
          let methodData = {
            confidence: parseInt(item.dataset.confidence || '100'),
          };

          // Structure data based on method type
          if (methodType === 'header' || methodType === 'cookie') {
            methodData.name = nameInput.value;
            if (valueInput?.value) {
              methodData.value = valueInput.value;
            }
          } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
            methodData.text = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'dom') {
            methodData.selector = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'js_hooks') {
            methodData.target = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'window') {
            methodData.path = nameInput.value;
            methodData.condition = valueInput?.value || 'exists';
          }

          // Add optional pattern settings based on method type
          if (methodType === 'header' || methodType === 'cookie') {
            if (item.dataset.nameRegex === 'true') methodData.nameRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.nameWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.nameCaseSensitive = true;
            if (item.dataset.valueRegex === 'true') methodData.valueRegex = true;
            if (item.dataset.valueWholeword === 'true') methodData.valueWholeWord = true;
            if (item.dataset.valueCase === 'true') methodData.valueCaseSensitive = true;
          } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
            if (item.dataset.nameRegex === 'true') methodData.textRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.textWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.textCaseSensitive = true;
          } else if (methodType === 'dom') {
            if (item.dataset.nameRegex === 'true') methodData.selectorRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.selectorWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.selectorCaseSensitive = true;
          }

          // Content scope settings
          if (item.dataset.checkScripts === 'true') {
            methodData.checkScripts = true;
          }

          // Save scope settings based on method type
          if (methodType === 'header') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'response', 'response');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'response', 'response');
          } else if (methodType === 'cookie') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'request', 'request');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'request', 'request');
          } else if (methodType === 'url') {
            methodData.textScope = item.dataset.textScope || 'all';
          }

          // Save payload-specific settings
          if (methodType === 'payload') {
            const urlPattern = item.dataset.payloadUrlPattern || '';
            if (urlPattern) {
              methodData.urlPattern = urlPattern;
              if (item.dataset.payloadUrlRegex === 'true') {
                methodData.urlRegex = true;
              }
              if (item.dataset.payloadUrlCaseSensitive === 'true') {
                methodData.urlCaseSensitive = true;
              }
            }
            const methodsList = item.dataset.payloadMethods || '';
            if (methodsList) {
              methodData.methods = methodsList.split(',').filter(m => m.trim());
            }
          }

          methods.push(methodData);
        }
      });

      if (methods.length > 0) {
        detectionMethods[methodType] = methods;
      }
    });

    return detectionMethods;
  }

  /**
   * Populate modal with detector data
   * @param {object} detector - Detector data
   */
  populateModalData(detector) {
    // Populate detector information fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');
    const iconImg = document.querySelector('#currentDetectorIcon');

    if (nameInput) {
      nameInput.value = detector.name || detector.displayName || '';
    }

    if (categorySelect) {
      // Use the category from currentEditDetector or detector object
      const category = this.currentEditDetector?.category || detector.category || 'antibot';
      Logger.ui('Setting category:', category); // Debug log
      categorySelect.value = category;
    }

    if (iconImg) {
      // Default Scrapfly icon fallback
      const scrapflyIcon = chrome.runtime.getURL('icons/scrapfly.webp');
      const currentIconContainer = iconImg.parentElement;

      // Add fingerprint-icon class for fingerprint category
      const category = this.currentEditDetector?.category || detector.category || 'antibot';
      if (currentIconContainer) {
        if (category.toLowerCase() === 'fingerprint') {
          currentIconContainer.classList.add('fingerprint-icon');
        } else {
          currentIconContainer.classList.remove('fingerprint-icon');
        }
      }

      // Set error handler to fallback to Scrapfly icon
      iconImg.onerror = () => {
        iconImg.src = scrapflyIcon;
      };

      // Check for custom icon first
      if (detector.customIcon) {
        iconImg.src = detector.customIcon;
      } else if (!detector.icon || detector.icon === 'default') {
        // Use Scrapfly icon for default or when no icon is set
        iconImg.src = scrapflyIcon;
      } else if (detector.icon) {
        // Handle different icon types
        if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
          iconImg.src = detector.icon;
        } else {
          const normalizedIcon = detector.icon.trim().toLowerCase();

          // Treat legacy placeholders as default Scrapfly icon
          const legacyDefaults = ['custom.png', 'custom', 'placeholder.png', 'placeholder'];
          if (legacyDefaults.includes(normalizedIcon)) {
            iconImg.src = scrapflyIcon;
            // Normalize icon value so it persists as default when saved
            detector.icon = 'default';
            this.currentEditDetector.detector.icon = 'default';
          } else if (normalizedIcon.endsWith('.png') || normalizedIcon.endsWith('.jpg') || normalizedIcon.endsWith('.jpeg') || normalizedIcon.endsWith('.svg') || normalizedIcon.endsWith('.webp')) {
            iconImg.src = chrome.runtime.getURL(`detectors/icons/${detector.icon}`);
          } else {
            // It's an emoji or text, create a data URL
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(detector.icon, 16, 16);
            iconImg.src = canvas.toDataURL();
          }
        }
      } else {
        // No icon specified, use Scrapfly icon
        iconImg.src = scrapflyIcon;
      }
    }

    // Populate author field
    const authorInput = document.querySelector('#detectorAuthorInput');
    const authorHelp = document.querySelector('#authorHelp');

    if (authorInput) {
      // Set value (default to 'scrapfly' for new detectors)
      authorInput.value = detector.author || 'scrapfly';
      // Always allow editing author
      authorInput.removeAttribute('readonly');
      authorInput.classList.remove('readonly-field');
      if (authorHelp) {
        authorHelp.textContent = 'Who created this detector';
      }
    }

    // Set badge color using CategoryManager (colors come from Settings, not detector objects)
    if (this.colorManager && this.categoryManager) {
      const category = this.currentEditDetector?.category || 'antibot';
      const colorToSet = this.categoryManager.getCategoryColor(category) || '#3b82f6'; // Default to blue if no color
      Logger.ui('Loading category color:', detector.name, 'Category:', category, 'Color:', colorToSet);
      this.colorManager.setColor(colorToSet);

      // If it's a custom color, make sure it's stored on the rainbow picker
      const presetColors = this.colorManager.getPresetColors();
      if (!presetColors.includes(colorToSet)) {
        const rainbowPicker = document.querySelector('#rainbowPicker');
        if (rainbowPicker) {
          rainbowPicker.dataset.customColor = colorToSet;
        }
      }
    }

    // Populate detection methods
    this.populateDetectionMethods(detector);
  }

  /**
   * Populate detection methods in modal
   * @param {object} detector - Detector data
   */
  populateDetectionMethods(detector) {
    const container = document.querySelector('#detectionMethodsContainer');
    if (!container) return;

    // Ensure detector has a detection property
    if (!detector.detection) {
      detector.detection = {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      };
    }

    let methodsHtml = '';

    // Define all possible method types (matching detector data structure)
    const allMethodTypes = ['url', 'header', 'cookie', 'content', 'dom', 'js_hooks', 'window', 'payload'];
    // Support legacy 'scripts' type (maps to 'content')
    const legacyTypes = { 'scripts': 'content' };

    // Iterate through all method types to ensure all sections are shown
    allMethodTypes.forEach(methodType => {
      // Get methods from detector data (support legacy 'scripts' key)
      let methodsData = detector.detection?.[methodType];
      if (!methodsData && methodType === 'content') {
        // Check for legacy 'scripts' key
        methodsData = detector.detection?.['scripts'];
      }
      // Show section even if empty
      const displayName = methodType === 'content' ? 'CONTENT' :
                         methodType === 'dom' ? 'DOM' :
                         methodType === 'url' ? 'URL' :
                         methodType === 'header' ? 'HEADER' :
                         methodType === 'cookie' ? 'COOKIE' :
                         methodType === 'js_hooks' ? 'JS HOOKS' :
                         methodType === 'window' ? 'WINDOW' :
                         methodType === 'payload' ? 'PAYLOAD' :
                         methodType.toUpperCase();

      // Get color from CategoryManager
      const tagColor = this.detectorManager.categoryManager.getTagColor(methodType);
      const backgroundColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';

      // Parse hex color to RGB for muted style
      const methodHex = backgroundColor.replace('#', '');
      const methodR = parseInt(methodHex.substring(0, 2), 16) || 102;
      const methodG = parseInt(methodHex.substring(2, 4), 16) || 102;
      const methodB = parseInt(methodHex.substring(4, 6), 16) || 102;

      // Add help button for all method types
      const helpButtonTitle = methodType === 'js_hooks' ? 'What are JS hooks?' :
                             methodType === 'window' ? 'What are Window properties?' :
                             methodType === 'url' ? 'What is URL detection?' :
                             methodType === 'header' ? 'What is Header detection?' :
                             methodType === 'cookie' ? 'What is Cookie detection?' :
                             methodType === 'content' ? 'What is Content detection?' :
                             methodType === 'dom' ? 'What is DOM detection?' :
                             methodType === 'payload' ? 'What is Payload detection?' :
                             'What is this detection method?';

      const methodHelper = `
            <button class="method-help-btn" type="button" data-method-help="${methodType}" title="${helpButtonTitle}">?</button>
          `;

      // Count patterns for this method type
      const patternCount = Array.isArray(methodsData) ? methodsData.length : 0;
      const patternCountText = patternCount === 1 ? '1 pattern' : `${patternCount} patterns`;

      methodsHtml += `
        <div class="method-section collapsed">
          <div class="method-header">
            <div class="method-header-left">
              <svg class="method-collapse-icon" width="16" height="16" viewBox="0 0 24 24">
                <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" fill="currentColor"/>
              </svg>
              <div class="method-title" style="background: rgba(${methodR}, ${methodG}, ${methodB}, 0.2); color: ${backgroundColor}; border: 1px solid rgba(${methodR}, ${methodG}, ${methodB}, 0.35); padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; display: inline-block;">${displayName}</div>
            </div>
            <span class="method-pattern-count">${patternCountText}</span>
            ${methodHelper}
          </div>
          <div class="method-items">
      `;

      // Only add existing methods if there are any
      if (Array.isArray(methodsData) && methodsData.length > 0) {
        methodsData.forEach((method, index) => {
            // Get the appropriate values based on method type
            let name = '';
            let value = '';

            // Different method types have different structures
            if (methodType === 'header' || methodType === 'cookie') {
              name = method.name || '';
              value = method.value || '';
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              // Backward compatibility: content detection used to use 'value' instead of 'text'
              name = method.text || method.value || '';
              value = method.description || '';
            } else if (methodType === 'dom') {
              name = method.selector || '';
              value = method.description || '';
            } else if (methodType === 'js_hooks') {
              name = method.target || '';
              value = method.description || '';
            } else if (methodType === 'window') {
              name = method.path || '';
              value = method.condition || 'exists';
            }

            const confidence = method.confidence || 100;

            // Pattern options based on method type
            let nameRegex = false, nameWholeWord = false, nameCaseSensitive = false;
            let valueRegex = false, valueWholeWord = false, valueCaseSensitive = false;

            if (methodType === 'header' || methodType === 'cookie') {
              nameRegex = method.nameRegex || false;
              nameWholeWord = method.nameWholeWord || false;
              nameCaseSensitive = method.nameCaseSensitive || false;
              valueRegex = method.valueRegex || false;
              valueWholeWord = method.valueWholeWord || false;
              valueCaseSensitive = method.valueCaseSensitive || false;
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              nameRegex = method.textRegex || false;
              nameWholeWord = method.textWholeWord || false;
              nameCaseSensitive = method.textCaseSensitive || false;
            } else if (methodType === 'dom') {
              nameRegex = method.selectorRegex || false;
              nameWholeWord = method.selectorWholeWord || false;
              nameCaseSensitive = method.selectorCaseSensitive || false;
            }
            // Note: window and js_hooks have NO pattern options

            const checkScripts = method.checkScripts || false;

            // Load scope settings from JSON
            let nameScope = '';
            let valueScope = '';
            let textScope = 'all';

            if (methodType === 'header') {
              nameScope = normalizeCookieHeaderScope(method.nameScope || 'response', 'response');
              valueScope = normalizeCookieHeaderScope(method.valueScope || 'response', 'response');
            } else if (methodType === 'cookie') {
              nameScope = normalizeCookieHeaderScope(method.nameScope || 'request', 'request');
              valueScope = normalizeCookieHeaderScope(method.valueScope || 'request', 'request');
            } else if (methodType === 'url') {
              textScope = method.textScope || 'all';
            }

            // Load payload-specific settings from JSON
            let payloadUrlPattern = '';
            let payloadUrlRegex = false;
            let payloadUrlCaseSensitive = false;
            let payloadMethods = '';

            if (methodType === 'payload') {
              payloadUrlPattern = method.urlPattern || '';
              payloadUrlRegex = method.urlRegex || false;
              payloadUrlCaseSensitive = method.urlCaseSensitive || false;
              // Convert array of methods to comma-separated string
              if (Array.isArray(method.methods) && method.methods.length > 0) {
                payloadMethods = method.methods.join(',');
              }
            }

            // Skip completely empty method items
            if (!name && !value) {
              return;
            }

            // SIMPLIFICATION: js_hooks only needs target, no regex options
            // window now has dual inputs: path (required) + condition (optional, defaults to "exists")
            const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
            const isSingleInput = singleInputTypes.includes(methodType);

            let inputPlaceholder = 'Name';
            let valuePlaceholder = 'Value (optional)';
            if (methodType === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
            else if (methodType === 'content') inputPlaceholder = 'Text/Word to search';
            else if (methodType === 'url') inputPlaceholder = 'URL Pattern';
            else if (methodType === 'js_hooks') inputPlaceholder = 'JS Hook Target (e.g., navigator.webdriver)';
            else if (methodType === 'window') {
              inputPlaceholder = 'Window Path (e.g., grecaptcha, _cf_chl_opt)';
              valuePlaceholder = 'Condition (e.g., typeof object, typeof function)';
            }
            else if (methodType === 'cookie') {
              inputPlaceholder = 'Cookie Name (e.g., __cf_bm, session_id)';
              valuePlaceholder = 'Cookie Value Pattern (optional)';
            }
            else if (methodType === 'payload') inputPlaceholder = 'Text (e.g., sensor_data, challenge_token)';

            // Check if name and value have custom settings separately
            const hasNameCustomSettings = nameRegex || nameWholeWord || nameCaseSensitive ||
                                          (methodType === 'content' && checkScripts === true);
            const hasValueCustomSettings = valueRegex || valueWholeWord || valueCaseSensitive;

            const windowConditionDropdown = methodType === 'window'
              ? this.renderInlineConditionDropdown(value, methodType, index)
              : '';
            const showValueRow = !isSingleInput && (methodType === 'window' || value);

            methodsHtml += `
              <div class="method-item"
                data-confidence="${confidence}"
                data-name-regex="${nameRegex}"
                data-name-wholeword="${nameWholeWord}"
                data-name-case="${nameCaseSensitive}"
                data-value-regex="${valueRegex}"
                data-value-wholeword="${valueWholeWord}"
                data-value-case="${valueCaseSensitive}"
                data-check-scripts="${checkScripts}"
                data-name-scope="${nameScope}"
                data-value-scope="${valueScope}"
                data-text-scope="${textScope}"
                data-payload-url-pattern="${payloadUrlPattern}"
                data-payload-url-regex="${payloadUrlRegex}"
                data-payload-url-case-sensitive="${payloadUrlCaseSensitive}"
                data-payload-methods="${payloadMethods}">
                <div class="method-item-content">
                  <div class="method-item-inputs">
                    <div class="input-with-indicators">
                      <div class="input-row">
                        <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="${name}" data-method-key="${methodType}" data-item-index="${index}">
                        ${methodType === 'dom' ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="${index}">?</button>` : ''}
                        ${methodType === 'window' ? `<button class="window-helper-btn" title="Window Property Examples" data-input-index="${index}">?</button>` : ''}
                        <div class="field-actions" data-field-type="name">
                          ${methodType !== 'js_hooks' ? `
                          <button class="method-action-btn settings ${hasNameCustomSettings ? 'has-custom-settings' : ''}" title="Name Settings">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                            </svg>
                          </button>
                          ` : ''}
                          <button class="method-action-btn delete" title="Delete Method">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                              <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div class="input-badges-row">
                        <div class="input-indicators" data-for="name-${methodType}-${index}"></div>
                      </div>
                    </div>
                    ${!isSingleInput ? `
                    <div class="input-with-indicators value-field-container" style="display: ${showValueRow ? 'flex' : 'none'}">
                      <div class="input-row">
                        ${methodType === 'window'
                          ? windowConditionDropdown
                          : `<input type="text" class="method-input method-value" placeholder="${valuePlaceholder}" value="${value}" data-method-key="${methodType}" data-item-index="${index}">`
                        }
                        <div class="field-actions" data-field-type="value">
                          <button class="method-action-btn settings ${hasValueCustomSettings ? 'has-custom-settings' : ''}" title="Value Settings">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                            </svg>
                          </button>
                          <button class="method-action-btn delete" title="Clear Value">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                              <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div class="input-badges-row">
                        <div class="input-indicators" data-for="value-${methodType}-${index}"></div>
                      </div>
                    </div>
                    <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodType}" data-item-index="${index}">
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                      </svg>
                      Add Value
                    </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
        });
      }

      methodsHtml += `
          </div>
          <button class="add-method-btn" data-method-type="${methodType}">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
            </svg>
            Add Method
          </button>
        </div>
      `;
    });

    // Add button to add new method section
    container.innerHTML = methodsHtml;

    // Update indicators for all method items that have settings
    const methodItems = container.querySelectorAll('.method-item');
    methodItems.forEach(item => {
      const hasSettings =
        item.dataset.nameRegex === 'true' ||
        item.dataset.nameWholeword === 'true' ||
        item.dataset.nameCase === 'true' ||
        item.dataset.valueRegex === 'true' ||
        item.dataset.valueWholeword === 'true' ||
        item.dataset.valueCase === 'true';

      if (hasSettings) {
        this.updateMethodIndicators(item);
      }

      // Add input event listeners to update badges dynamically as user types
      const nameInput = item.querySelector('.method-input.method-name');
      const valueInput = item.querySelector('.method-input.method-value');

      if (nameInput) {
        nameInput.addEventListener('input', () => {
          this.updateMethodIndicators(item);
        });
      }

      if (valueInput) {
        const updateHandler = () => {
          this.updateMethodIndicators(item);
        };
        valueInput.addEventListener('input', updateHandler);
        valueInput.addEventListener('change', updateHandler);
      }
    });
  }

  /**
   * Add a new method item to a section
   * @param {HTMLElement} button - The button that was clicked
   */
  addNewMethodItem(button) {
    const methodSection = button.closest('.method-section');
    const methodItems = methodSection.querySelector('.method-items');
    let methodKey = methodSection.querySelector('.method-title').textContent.toLowerCase();

    // Map display name to internal key
    if (methodKey === 'js hooks') methodKey = 'js_hooks';

    const itemIndex = `new-${Date.now()}`;

    // Note: window, header, cookie are dual-input types (name + value/condition)
    const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';
    const isWindow = methodKey === 'window';

    let inputPlaceholder = 'Name';
    let valuePlaceholder = 'Value (optional)';
    if (methodKey === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
    else if (methodKey === 'content') inputPlaceholder = 'Text/Word to search';
    else if (methodKey === 'urls' || methodKey === 'url') inputPlaceholder = 'URL Pattern';
    else if (methodKey === 'js_hooks') inputPlaceholder = 'JS Hook Target (e.g., navigator.webdriver)';
    else if (methodKey === 'window') {
      inputPlaceholder = 'Window Path (e.g., grecaptcha, _cf_chl_opt)';
      valuePlaceholder = 'Condition (e.g., typeof object, typeof function)';
    }
    else if (methodKey === 'payload') inputPlaceholder = 'Text (e.g., sensor_data, challenge_token)';

    const windowConditionDropdown = isWindow ? this.renderInlineConditionDropdown('exists', methodKey, itemIndex) : '';
    const showValueRow = isWindow;

    const newMethodHtml = `
      <div class="method-item"
        data-confidence="100"
        data-name-regex="false"
        data-name-wholeword="false"
        data-name-case="false"
        data-value-regex="false"
        data-value-wholeword="false"
        data-value-case="false"
        data-payload-url-pattern=""
        data-payload-url-regex="false"
        data-payload-url-case-sensitive="false"
        data-payload-methods="">
        <div class="method-item-content">
          <div class="method-item-inputs">
            <div class="input-with-indicators">
              <div class="input-row">
                <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="" data-method-key="${methodKey}" data-item-index="${itemIndex}">
                ${isDom ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="${itemIndex}">?</button>` : ''}
                ${isWindow ? `<button class="window-helper-btn" title="Window Property Examples" data-input-index="${itemIndex}">?</button>` : ''}
                <div class="field-actions" data-field-type="name">
                  ${methodKey !== 'js_hooks' ? `
                  <button class="method-action-btn settings" title="Name Settings">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                    </svg>
                  </button>
                  ` : ''}
                  <button class="method-action-btn delete" title="Delete Method">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="input-badges-row">
                <div class="input-indicators" data-for="name-${methodKey}-${itemIndex}"></div>
              </div>
            </div>
            ${!isSingleInput ? `
            <div class="input-with-indicators value-field-container" style="display: ${showValueRow ? 'flex' : 'none'}">
              <div class="input-row">
                    ${isWindow
                      ? windowConditionDropdown
                      : `<input type="text" class="method-input method-value" placeholder="${valuePlaceholder}" value="" data-method-key="${methodKey}" data-item-index="${itemIndex}">`
                    }
                    <div class="field-actions" data-field-type="value">
                  <button class="method-action-btn settings" title="Value Settings">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                    </svg>
                  </button>
                  <button class="method-action-btn delete" title="Clear Value">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="input-badges-row">
                <div class="input-indicators" data-for="value-${methodKey}-${itemIndex}"></div>
              </div>
            </div>
            <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodKey}" data-item-index="${itemIndex}">
              <svg width="12" height="12" viewBox="0 0 24 24">
                <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
              </svg>
              Add Value
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    methodItems.insertAdjacentHTML('beforeend', newMethodHtml);
  }

  /**
   * Add a new method section
   */
  addNewMethodSection() {
    const container = document.querySelector('#detectionMethodsContainer');
    const addSectionBtn = container.querySelector('.add-section-btn');

    // Prompt for method type name
    const methodType = prompt('Enter detection method type (e.g., HEADERS, CONTENT, URLs):');
    if (!methodType) return;

    const methodKey = methodType.toLowerCase();
    // Note: window, header, cookie are dual-input types (name + value/condition)
    const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';
    const isWindow = methodKey === 'window';

    let inputPlaceholder = 'Name';
    if (methodKey === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
    else if (methodKey === 'content') inputPlaceholder = 'Text/Word to search';
    else if (methodKey === 'urls' || methodKey === 'url') inputPlaceholder = 'URL Pattern';
    else if (methodKey === 'window') inputPlaceholder = 'Window Path (e.g., grecaptcha, _cf_chl_opt)';

    const windowConditionDropdown = isWindow ? this.renderInlineConditionDropdown('exists', methodKey, 'new') : '';
    const showValueRow = isWindow;

    const newSectionHtml = `
      <div class="method-section">
        <div class="method-header">
          <div class="method-title">${methodType.toUpperCase()}</div>
        </div>
        <div class="method-items">
          <div class="method-item"
            data-confidence="100"
            data-name-regex="false"
            data-name-wholeword="false"
            data-name-case="false"
            data-value-regex="false"
            data-value-wholeword="false"
            data-value-case="false">
            <div class="method-item-content">
              <div class="method-item-inputs">
                <div class="input-with-indicators">
                  <div class="input-row">
                    <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="" data-method-key="${methodKey}" data-item-index="new">
                    ${isDom ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="new">?</button>` : ''}
                    ${isWindow ? `<button class="window-helper-btn" title="Window Property Examples" data-input-index="new">?</button>` : ''}
                    <div class="field-actions" data-field-type="name">
                      <button class="method-action-btn settings" title="Name Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button class="method-action-btn delete" title="Delete Method">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                          <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="input-badges-row">
                    <div class="input-indicators" data-for="name-${methodKey}-new"></div>
                  </div>
                </div>
                ${!isSingleInput ? `
                <div class="input-with-indicators value-field-container" style="display: ${showValueRow ? 'flex' : 'none'}">
                  <div class="input-row">
                    ${isWindow
                      ? windowConditionDropdown
                      : `<input type="text" class="method-input method-value" placeholder="Value (optional)" value="" data-method-key="${methodKey}" data-item-index="new">`
                    }
                    <div class="field-actions" data-field-type="value">
                      <button class="method-action-btn settings" title="Value Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button class="method-action-btn delete" title="Clear Value">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                          <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                <div class="input-badges-row">
                  <div class="input-indicators" data-for="value-${methodKey}-new"></div>
                </div>
              </div>
                <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodKey}" data-item-index="new">
                  <svg width="12" height="12" viewBox="0 0 24 24">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                  </svg>
                  Add Value
                </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
        <button class="add-method-btn" data-method-type="${methodType.toLowerCase()}">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
          </svg>
          Add Method
        </button>
      </div>
    `;

    addSectionBtn.insertAdjacentHTML('beforebegin', newSectionHtml);
  }

  /**
   * Update detector badge color
   * @param {string} detectorName - The detector name
   * @param {string} color - The new color
   */
  updateDetectorBadgeColor(detectorName, color) {
    if (!this.categoryManager || !detectorName || !color) return;

    // Get all categories
    const categories = this.categoryManager.getCategories();

    // Find and update the detector's color in categories
    Object.values(categories).forEach(category => {
      if (category.detectors && category.detectors[detectorName]) {
        category.detectors[detectorName].color = color;
      }
    });

    // Save updated categories to storage
    this.categoryManager.saveToStorage();
  }

  /**
   * Save rule changes
   */
  saveRule() {
    if (!this.currentEditDetector) return;

    // Get detector information from fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');

    if (nameInput) {
      this.currentEditDetector.detector.name = nameInput.value;
      this.currentEditDetector.detector.displayName = nameInput.value;
    }

    if (categorySelect) {
      this.currentEditDetector.detector.category = categorySelect.value;
      // Update the category in the parent structure
      this.currentEditDetector.category = categorySelect.value;
    }

    // Save author field
    const authorInput = document.querySelector('#detectorAuthorInput');
    if (authorInput) {
      const author = authorInput.value.trim() || 'scrapfly';
      this.currentEditDetector.detector.author = author;
    }

    // Colors are managed by CategoryManager in Settings, not stored per detector
    // No need to save color property to detector object anymore

    // Save custom icon if one was selected
    if (this.currentEditDetector.customIcon) {
      this.currentEditDetector.detector.customIcon = this.currentEditDetector.customIcon;
    }

    // Collect detection methods from the modal
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (methodsContainer) {
      const detectionMethods = {};

      // Get all method sections
      const methodSections = methodsContainer.querySelectorAll('.method-section');
      methodSections.forEach(section => {
        const methodTitle = section.querySelector('.method-title')?.textContent.toLowerCase();
        if (!methodTitle) return;

        // Map display titles to detector data keys
        let methodType = methodTitle;
        if (methodTitle === 'js hooks') {
          methodType = 'js_hooks';
        }
        // All other types already match the JSON structure (singular)

        const methods = [];
        const methodItems = section.querySelectorAll('.method-item');

        methodItems.forEach(item => {
          const nameInput = item.querySelector('.method-name');
          const valueInput = item.querySelector('.method-value');

          // Only include items that have the primary field (nameInput)
          // The secondary field (valueInput) is optional (description/condition)
          const hasName = nameInput && nameInput.value.trim();

          if (hasName) {
            // Create method data based on the type
            let methodData = {
              confidence: parseInt(item.dataset.confidence || '100'),
            };

            // Structure data based on method type
            if (methodType === 'header' || methodType === 'cookie') {
              methodData.name = nameInput.value;
              if (valueInput?.value) {
                methodData.value = valueInput.value;
              }
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              methodData.text = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'dom') {
              methodData.selector = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'js_hooks') {
              methodData.target = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'window') {
              methodData.path = nameInput.value;
              // Default condition to "exists" if not provided
              methodData.condition = valueInput?.value || 'exists';
            }

            // Add optional pattern settings based on method type
            // Note: window and js_hooks do NOT support pattern options
            if (methodType === 'header' || methodType === 'cookie') {
              if (item.dataset.nameRegex === 'true') methodData.nameRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.nameWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.nameCaseSensitive = true;
              if (item.dataset.valueRegex === 'true') methodData.valueRegex = true;
              if (item.dataset.valueWholeword === 'true') methodData.valueWholeWord = true;
              if (item.dataset.valueCase === 'true') methodData.valueCaseSensitive = true;
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              if (item.dataset.nameRegex === 'true') methodData.textRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.textWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.textCaseSensitive = true;
            } else if (methodType === 'dom') {
              if (item.dataset.nameRegex === 'true') methodData.selectorRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.selectorWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.selectorCaseSensitive = true;
            }
            // window and js_hooks: No pattern options at all
            // Content scope settings (only save if enabled - restricts search)
            if (item.dataset.checkScripts === 'true') {
              methodData.checkScripts = true;
            }

            // Save scope settings based on method type
            if (methodType === 'header') {
              methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'response', 'response');
              methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'response', 'response');
            } else if (methodType === 'cookie') {
              methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'request', 'request');
              methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'request', 'request');
            } else if (methodType === 'url') {
              methodData.textScope = item.dataset.textScope || 'all';
            }

            // Save payload-specific settings
            if (methodType === 'payload') {
              // Only include if urlPattern is set
              const urlPattern = item.dataset.payloadUrlPattern || '';
              if (urlPattern) {
                methodData.urlPattern = urlPattern;
                // Only include urlRegex if true
                if (item.dataset.payloadUrlRegex === 'true') {
                  methodData.urlRegex = true;
                }
                // Only include urlCaseSensitive if true
                if (item.dataset.payloadUrlCaseSensitive === 'true') {
                  methodData.urlCaseSensitive = true;
                }
              }
              // Only include methods if set
              const methodsList = item.dataset.payloadMethods || '';
              if (methodsList) {
                methodData.methods = methodsList.split(',').filter(m => m.trim());
              }
            }

            methods.push(methodData);
          }
        });

        if (methods.length > 0) {
          detectionMethods[methodType] = methods;
        }
      });

      // Update the detector's detection methods
      if (Object.keys(detectionMethods).length > 0) {
        this.currentEditDetector.detector.detection = detectionMethods;
        Logger.ui('Updated detection methods:', detectionMethods);
      }
    }

    Logger.ui('Saving rule for:', this.currentEditDetector.detector.displayName);

    // Check if detection methods actually changed (for existing detectors)
    const originalDetection = this.currentEditDetector.originalDetection || {};
    const currentDetection = this.currentEditDetector.detector.detection || {};
    const hasChanges = this.currentEditDetector.isNew ||
      JSON.stringify(originalDetection) !== JSON.stringify(currentDetection);

    // Only update timestamp and version if changes were made
    if (hasChanges) {
      // Generate timestamp for lastUpdated
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      // Update lastUpdated timestamp
      this.currentEditDetector.detector.lastUpdated = timestamp;

      // Auto-increment version (1.0 → 1.1 → 1.2, etc.)
      if (this.currentEditDetector.isNew) {
        // New detector starts at version 1.0
        this.currentEditDetector.detector.version = '1.0';
      } else {
        // Increment existing version
        const currentVersion = this.currentEditDetector.detector.version || '1.0';
        const versionNum = parseFloat(currentVersion) || 1.0;
        const newVersion = (versionNum + 0.1).toFixed(1);
        this.currentEditDetector.detector.version = newVersion;
        Logger.ui(`Version incremented: ${currentVersion} → ${newVersion}`);
      }
    } else {
      Logger.ui('No changes detected, version and timestamp unchanged');
    }

    // Handle new detector
    if (this.currentEditDetector.isNew) {
      const detectorName = this.currentEditDetector.detector.name || 'custom';
      const slugName = detectorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const detectorId = slugName || `custom-${Date.now()}`;

      this.currentEditDetector.detector.id = detectorId;

      this.detectorManager.addDetector(
        this.currentEditDetector.category,
        detectorId,
        this.currentEditDetector.detector
      ).then(success => {
        if (success) {
          Logger.ui('New detector added successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.ui('Detectors reloaded in background:', response);
          });
          this.displayRules();
        }
      });

      this.closeEditModal();
      return;
    }

    // Update existing detector in DetectorManager
    if (this.detectorManager) {
      const categoryDetectors = this.detectorManager.detectors[this.currentEditDetector.category];
      if (categoryDetectors && categoryDetectors[this.currentEditDetector.detectorName]) {
        const updatedDetector = {
          ...this.currentEditDetector.detector,
          customIcon: this.currentEditDetector.detector.customIcon
        };
        categoryDetectors[this.currentEditDetector.detectorName] = updatedDetector;

        Logger.ui('Detector updated, lastUpdated:', updatedDetector.lastUpdated);

        // Save to storage
        this.detectorManager.saveDetectorsToStorage().then(() => {
          Logger.ui('Detector saved to storage successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.ui('Detectors reloaded in background:', response);
          });
        }).catch(error => {
          Logger.error('UI', 'Failed to save detector:', error);
        });
      }
    }

    // Update the category's color if it changed
    if (this.categoryManager && this.colorManager) {
      const color = this.colorManager.getColor();
      this.updateDetectorBadgeColor(this.currentEditDetector.detectorName, color);
    }

    // Close modal
    this.closeEditModal();

    // Refresh the rules list to show updated data
    this.displayRules();
  }



  /**
   * Display rules (main entry point)
   */
  async displayRules() {
    Logger.ui('displayRules called');

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    const rulesList = document.querySelector('#rulesList');
    const detectorsEmpty = document.querySelector('#detectorsEmpty');

    if (!rulesList) {
      Logger.error('UI', 'Rules list element not found - HTML may not be loaded yet');
      return;
    }

    Logger.ui('Rules list found:', rulesList);

    const detectors = this.detectorManager.getAllDetectors();

    if (!detectors || Object.keys(detectors).length === 0) {
      // Show empty state
      if (detectorsEmpty) {
        detectorsEmpty.style.display = 'block';
      }
      if (rulesList) {
        rulesList.innerHTML = '';
      }
      return;
    }

    // Hide empty state
    if (detectorsEmpty) {
      detectorsEmpty.style.display = 'none';
    }

    // Flatten detectors from all categories into a single array
    this.allDetectors = [];
    for (const [category, categoryDetectors] of Object.entries(detectors)) {
      if (!categoryDetectors || Object.keys(categoryDetectors).length === 0) continue;

      for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
        // Ensure detector has detection property
        const detectorWithDefaults = {
          ...detector,
          displayName: detector.name || detectorName,
          detection: detector.detection || {
            urls: [],
            headers: [],
            cookies: [],
            content: [],
            dom: []
          }
        };

        this.allDetectors.push({
          category,
          detectorName,
          detector: detectorWithDefaults
        });
      }
    }

    // Sort detectors:
    // 1. Enabled detectors first, disabled last
    // 2. Within each group, sort by lastUpdated (newest first)
    const categoryPriority = {
      antibot: 0,
      captcha: 1,
      fingerprint: 2
    };

    this.allDetectors.sort((a, b) => {
      // First, sort by enabled status (enabled first)
      const aEnabled = a.detector.enabled !== false;
      const bEnabled = b.detector.enabled !== false;
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }

      // Then sort by lastUpdated (newest first)
      const aTimestamp = this.getSortTimestamp(a.detector.lastUpdated);
      const bTimestamp = this.getSortTimestamp(b.detector.lastUpdated);

      if (aTimestamp !== bTimestamp) {
        return bTimestamp - aTimestamp;
      }

      // When dates are equal, prioritize by category order: antibot → captcha → fingerprint
      const aPriority = categoryPriority[a.category] ?? 99;
      const bPriority = categoryPriority[b.category] ?? 99;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Final fallback: alphabetical by display name
      const aName = (a.detector.displayName || a.detectorName || '').toLowerCase();
      const bName = (b.detector.displayName || b.detectorName || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    this.filteredDetectors = [...this.allDetectors];

    // Setup pagination with all detectors
    if (this.paginationManager) {
      this.paginationManager.setItems(this.filteredDetectors);
    }
  }

  /**
   * Render detectors for current page
   * @param {Array} detectors - Detectors to render for current page
   */
  renderDetectorsPage(detectors) {
    const rulesList = document.querySelector('#rulesList');
    if (!rulesList) return;

    let rulesHtml = '';

    detectors.forEach(({ category, detectorName, detector }) => {
      const detectorIcon = this.getDetectorIcon(detector);
      const categoryInfo = this.categoryManager.getCategoryInfo(category);
      const categoryColor = categoryInfo?.colour || '#3b82f6';

      // Get detection methods from detector data
      const detectionMethods = this.getDetectionMethods(detector);

      const formattedLastUpdated = this.formatLastUpdated(detector.lastUpdated, detector.version);

      // Get category method badges with dynamic colors
      const categoryMethod = this.getCategoryMethod(category);

      // Parse category color to RGB for muted style
      const catHex = categoryColor.replace('#', '');
      const catR = parseInt(catHex.substring(0, 2), 16);
      const catG = parseInt(catHex.substring(2, 4), 16);
      const catB = parseInt(catHex.substring(4, 6), 16);

      // Create category badge with muted style
      const categoryBadge = `<span class="method-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.35);">${categoryMethod}</span>`;

      // Create the detector badge with muted style
      const detectorBadge = `<span class="method-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.35);">${detector.displayName}</span>`;

      const topBadges = `${categoryBadge}${detectorBadge}`;

      // Add disabled class if detector is disabled
      const isDisabled = detector.enabled === false;
      rulesHtml += `
        <div class="detector-card ${isDisabled ? 'detector-disabled' : ''}" data-detector-id="${detectorName}" data-category="${category}">
          <div class="detector-header">
            <div class="detector-icon">${detectorIcon}</div>
            <div class="detector-info">
              <div class="detector-name-row">
                <div class="detector-name">${detector.displayName}</div>
                <div class="detector-actions" data-stop-propagation="true">
                  <button class="edit-btn" title="Edit Detector" data-detector-id="${detectorName}" data-category="${category}">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25zM20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z" fill="currentColor"/>
                    </svg>
                  </button>
                  <button class="delete-btn" title="Delete Detector">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="detection-methods">
                ${topBadges}
              </div>
            </div>
          </div>
          <div class="detector-scripts">
            <div class="detection-methods">
              ${detectionMethods}
            </div>
            <div class="scripts-info">
              <div class="scripts-info-left">
                <div class="last-updated">
                  <span class="last-updated-value">${formattedLastUpdated}</span>
                </div>
                <div class="detector-author">
                  <i class="fas fa-user"></i>
                  <span class="author-name">${detector.author || 'scrapfly'}</span>
                  ${(detector.author || 'scrapfly').toLowerCase() === 'scrapfly' ? '<i class="fas fa-check-circle verified-badge" title="Official Scrapfly detector"></i>' : ''}
                </div>
              </div>
              <label class="toggle-switch-small" data-stop-propagation="true">
                <input type="checkbox" class="detector-toggle"
                       data-detector="${detectorName}"
                       data-category="${category}"
                       ${detector.enabled !== false ? 'checked' : ''}>
                <span class="toggle-slider-small"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    });

    rulesList.innerHTML = rulesHtml;

    // CSP-compliant stopPropagation handling
    rulesList.querySelectorAll('[data-stop-propagation]').forEach(el => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });

    // CSP-compliant image error fallback
    rulesList.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', function() {
        this.src = this.dataset.fallback;
      }, { once: true });
    });

    // Add click event listeners to detector cards and edit buttons
    this.setupDetectorCardListeners(detectors);
  }

  /**
   * Setup event listeners for detector cards
   * @param {Array} detectors - Array of detectors for current page
   */
  setupDetectorCardListeners(detectors) {
    // Add click listeners to detector cards
    const detectorCards = document.querySelectorAll('.detector-card');
    detectorCards.forEach((card, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];

        // Click on card to edit
        card.addEventListener('click', (e) => {
          // Don't open modal if clicking on action buttons, method badges, or toggle switch
          if (!e.target.closest('.detector-actions') && !e.target.closest('.method-tag') && !e.target.closest('.toggle-switch-small')) {
            // Pass the detector ensuring it has detection property
            const detectorToEdit = {
              ...detector,
              detection: detector.detection || {
                urls: [],
                headers: [],
                cookies: [],
                content: [],
                dom: []
              }
            };
            this.openEditModal(detectorToEdit, category, detectorName, false);
          }
        });

        // Add hover effect
        card.style.cursor = 'pointer';
      }
    });

    // Add click listeners to edit buttons
    const editButtons = document.querySelectorAll('.edit-btn');
    editButtons.forEach((btn, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Pass the detector ensuring it has detection property
          const detectorToEdit = {
            ...detector,
            detection: detector.detection || {
              urls: [],
              headers: [],
              cookies: [],
              content: [],
              dom: []
            }
          };
          this.openEditModal(detectorToEdit, category, detectorName, false);
        });
      }
    });

    // Add click listeners to delete buttons
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach((btn, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.handleDeleteDetector(category, detectorName, detector.displayName || detectorName);
        });
      }
    });
  }

  /**
   * Format detector last updated timestamp into friendly text
   * @param {string|number} rawTimestamp
   * @returns {string}
   */
  getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1h ago' : `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else if (diffWeeks < 4) {
      return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
    } else if (diffMonths < 12) {
      return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
    } else {
      return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
    }
  }

  formatCompactDate(date) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  }

  formatLastUpdated(rawTimestamp, version) {
    if (!rawTimestamp) {
      return 'Unknown';
    }

    let parsedDate = null;

    // Handle numeric timestamps directly
    if (typeof rawTimestamp === 'number') {
      const numericDate = new Date(rawTimestamp);
      if (!Number.isNaN(numericDate.getTime())) {
        parsedDate = numericDate;
      }
    }

    if (typeof rawTimestamp === 'string') {
      let normalized = rawTimestamp.trim();

      // Support legacy format "YYYY-MM-DD" by adding midnight time
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        normalized = `${normalized}T00:00:00`;
      }

      // Replace space separator with T for ISO compatibility
      if (normalized.includes(' ') && !normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
      }

      const dateObj = new Date(normalized);
      if (!Number.isNaN(dateObj.getTime())) {
        parsedDate = dateObj;
      }
    }

    if (!parsedDate) {
      return String(rawTimestamp);
    }

    // Format: "relative time (absolute time) | version"
    const relativeTime = this.getRelativeTime(parsedDate);
    const compactDate = this.formatCompactDate(parsedDate);
    const versionPart = version ? ` | ${version}` : '';

    return `${relativeTime} (${compactDate})${versionPart}`;
  }

  formatDateForDisplay(date) {
    const options = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    };
    return date.toLocaleString(undefined, options);
  }

  getSortTimestamp(rawTimestamp) {
    if (!rawTimestamp) {
      return 0;
    }

    if (typeof rawTimestamp === 'number') {
      return rawTimestamp;
    }

    if (typeof rawTimestamp === 'string') {
      let normalized = rawTimestamp.trim();

      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        normalized = `${normalized}T00:00:00`;
      }

      if (normalized.includes(' ') && !normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
      }

      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.getTime();
      }
    }

    return 0;
  }

  /**
   * Get detection methods from detector data
   * @param {object} detector - Detector object
   * @returns {string} HTML for detection method tags
   */
  getDetectionMethods(detector) {
    let methodsHtml = '';

    // Get detection methods from the detection object keys
    let detectionMethods = null;
    if (detector.detection && typeof detector.detection === 'object') {
      detectionMethods = Object.keys(detector.detection).filter(key =>
        detector.detection[key] &&
        (Array.isArray(detector.detection[key]) ? detector.detection[key].length > 0 : true)
      );
    }

    // Add detection methods from detector data
    if (detectionMethods && Array.isArray(detectionMethods)) {
      detectionMethods.forEach((method) => {
        const methodStr = typeof method === 'string' ? method : method.name || method.type || 'Unknown';

        // Get dynamic color from CategoryManager tags using original methodStr (preserve underscores)
        const tagColor = this.categoryManager.getTagColor(methodStr);

        // Format the name for display only (replace underscores and uppercase)
        const methodName = methodStr.replace(/_/g, ' ').toUpperCase();

        if (tagColor && tagColor !== '#666666') {
          // Parse hex color to RGB for semi-transparent background
          const hex = tagColor.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          // Use muted/subtle style: semi-transparent background with colored text
          methodsHtml += `<span class="method-tag" style="background: rgba(${r}, ${g}, ${b}, 0.25); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.4);">${methodName}</span>`;
        } else {
          // Fallback to CSS class
          const badgeClass = this.getMethodBadgeClass(methodStr);
          methodsHtml += `<span class="method-tag ${badgeClass}">${methodName}</span>`;
        }
      });
    } else {
      // Fallback: create detection methods based on category and add detector name
      const categoryMethod = this.getCategoryMethod(detector.category);
      const categoryClass = this.getCategoryClass(detector.category);

      if (categoryMethod) {
        methodsHtml += `<span class="method-tag ${categoryClass}">${categoryMethod}</span>`;
      }

      // Add detector name as secondary method if different from category
      if (detector.displayName && detector.displayName !== categoryMethod) {
        methodsHtml += `<span class="method-tag secondary">${detector.displayName}</span>`;
      }
    }

    return methodsHtml;
  }

  /**
   * Get category-based detection method
   * @param {string} category - Category name
   * @returns {string} Detection method name
   */
  getCategoryMethod(category) {
    return this.categoryManager.getCategoryDisplayName(category) || 'Detection';
  }

  /**
   * Get category-based CSS class for method tags
   * @param {string} category - Category name
   * @returns {string} CSS class name
   */
  getCategoryClass(category) {
    return this.categoryManager.getCategoryBadgeClass(category);
  }

  /**
   * Get method-specific badge class for detection method types
   * @param {string} method - Method name (cookies, headers, urls, scripts, etc.)
   * @returns {string} CSS class name
   */
  getMethodBadgeClass(method) {
    switch (method?.toLowerCase()) {
      case 'cookies':
        return 'primary'; // Orange
      case 'headers':
        return 'secondary'; // Purple
      case 'urls':
      case 'url':
        return 'fingerprint'; // Purple
      case 'content':
      case 'scripts': // Legacy support
      case 'script':
        return 'waf'; // Red
      default:
        return 'primary';
    }
  }

  /**
   * Get detector icon from detector data or fallback to Scrapfly icon
   * @param {object} detector - Detector object
   * @returns {string} Icon string (emoji or URL)
   */
  getDetectorIcon(detector) {
    // Default Scrapfly icon fallback
    const scrapflyIcon = chrome.runtime.getURL('icons/scrapfly.webp');

    // Fingerprint SVG icons mapping
    const fingerprintIcons = {
      'audio_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>',
      'battery_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2M14 11v2"/></svg>',
      'canvas_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h4l2-3 2 6 2-3h2"/></svg>',
      'clipboard_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
      'crypto_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>',
      'css_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 3h16l-1.5 15L12 21l-6.5-3L4 3z"/><path d="M8 8h8M7 12h6"/></svg>',
      'font_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
      'gamepads_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="2"/><path d="M15 10v4M13 12h4"/></svg>',
      'geolocation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
      'hardware_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
      'indexeddb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
      'media_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><polygon points="10,8 16,11 10,14" fill="currentColor"/></svg>',
      'navigator_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="none"/></svg>',
      'orientation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M9 6h6"/></svg>',
      'performance_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>',
      'screen_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      'storage_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M4 20v-3h16v3M4 7v10h16V7"/><path d="M4 11h16M4 15h16"/><circle cx="7" cy="9" r="1" fill="currentColor"/></svg>',
      'timezone_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg>',
      'usb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M7 7l5 5 5-5"/><circle cx="12" cy="16" r="2"/><path d="M6 12v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>',
      'webgl_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
      'webrtc_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 10l5-5M20 10V5h-5"/><path d="M9 14l-5 5M4 14v5h5"/><circle cx="12" cy="12" r="3"/></svg>'
    };

    // Check for custom uploaded icon first
    if (detector.customIcon) {
      return `<img src="${detector.customIcon}" alt="Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
    }

    // Try to get real icon from detector data
    if (detector.icon) {
      const lowerIcon = detector.icon.toLowerCase ? detector.icon.toLowerCase() : detector.icon;

      if (lowerIcon === 'default') {
        return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
      }
      // If icon is "custom.png" or "custom", use scrapfly icon directly
      if (detector.icon === 'custom.png' || detector.icon === 'custom') {
        return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
      }

      // Check for fingerprint SVG icons
      if (fingerprintIcons[lowerIcon]) {
        return `<div class="detector-icon-svg fingerprint-icon">${fingerprintIcons[lowerIcon]}</div>`;
      }

      // If it's a URL, return as image
      if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
        return `<img src="${detector.icon}" alt="Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
      }
      // If it's a filename, construct the path to the detectors/icons folder
      if (detector.icon.includes('.png') || detector.icon.includes('.jpg') || detector.icon.includes('.svg') || detector.icon.includes('.webp')) {
        return `<img src="detectors/icons/${detector.icon}" alt="${detector.displayName || detector.name} Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
      }
      // Otherwise return as emoji or text
      return detector.icon;
    }

    // Fallback to Scrapfly default icon
    return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
  }

  /**
   * Get category icon (fallback)
   * @param {string} category - Category name
   * @returns {string} Icon emoji
   */
  getCategoryIcon(category) {
    return this.categoryManager.getCategoryIcon(category);
  }

  /**
   * Handle import of detector rules
   * @param {Event} event - File input change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Ask user if they want to merge or replace
      // Use NotificationHelper for safe access
      const merge = await NotificationHelper.confirm({
            title: 'Import Detectors',
            message: 'Do you want to merge with existing detectors?',
            confirmText: 'Merge',
            cancelText: 'Replace All',
            type: 'info'
          });

      const success = await this.detectorManager.importDetectors(data, merge);
      if (success) {
        NotificationHelper.success('Detectors imported');
        this.displayRules();
      } else {
        NotificationHelper.error('Failed to import detectors. Check the file format.');
      }
    } catch (error) {
      NotificationHelper.error('Error reading file: ' + error.message);
    }

    // Reset file input
    event.target.value = '';
  }

  /**
   * Handle export of detector rules
   */
  handleExport() {
    const data = this.detectorManager.exportDetectors();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-detectors-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  // ============================================
  // Update Management Methods
  // ============================================

  /**
   * Check for pending updates and update badge
   */
  async checkPendingUpdates() {
    try {
      if (typeof UpdateManager === 'undefined') {
        Logger.debug('UI', 'UpdateManager not available');
        return;
      }

      // Get stored pending updates count and show badge
      const count = await UpdateManager.getPendingUpdatesCount();
      this.updateUpdatesBadge(count);
    } catch (error) {
      Logger.error('UI', 'Error checking pending updates', error);
      this.updateUpdatesBadge(0);
    }
  }

  // Note: handleCheckUpdates() and updateUpdatesBadge() are defined in rules-handlers.js as prototype methods

  // ============================================
  // End Update Management Methods
  // ============================================

  /**
   * Update detector enabled state
   * @param {string} category - Category name
   * @param {string} detectorName - Detector name
   * @param {boolean} enabled - Whether detector is enabled
   */
  async updateDetectorEnabledState(category, detectorName, enabled) {
    try {
      // Get the detector
      const detector = this.detectorManager.getDetector(category, detectorName);
      if (detector) {
        // Update enabled state
        detector.enabled = enabled;

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        // CRITICAL: Notify background.js to reload detectors
        // This ensures JS hooks use the updated enabled state on next page load
        chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
          Logger.ui(`Detectors reloaded in background after ${enabled ? 'enabling' : 'disabling'} ${detectorName}:`, response);
        });

        Logger.ui(`Detector ${detectorName} ${enabled ? 'enabled' : 'disabled'}`);

        // Update the visual appearance immediately
        const detectorCard = document.querySelector(`[data-detector-id="${detectorName}"][data-category="${category}"]`);
        if (detectorCard) {
          if (enabled) {
            detectorCard.classList.remove('detector-disabled');
          } else {
            detectorCard.classList.add('detector-disabled');
          }
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to update detector enabled state:', error);
    }
  }

  /**
   * Handle clearing all detectors
   */
  async handleClear() {
    const confirmed = await NotificationHelper.confirm({
          title: 'Clear All Detectors',
          message: 'This will remove ALL detectors. Are you sure?',
          confirmText: 'Clear All',
          cancelText: 'Cancel',
          type: 'danger'
        });

    if (!confirmed) {
      return;
    }

    const loader = NotificationHelper.loading('Clearing all detectors...');
    const success = await this.detectorManager.clearAllDetectors();
    loader.close();

    if (success) {
      NotificationHelper.success('All detectors cleared');
      this.displayRules();
    } else {
      NotificationHelper.error('Failed to clear detectors');
    }
  }

  /**
   * Handle deleting a detector
   * @param {string} category - Category name
   * @param {string} detectorName - Detector name
   * @param {string} displayName - Display name for confirmation
   */
  async handleDeleteDetector(category, detectorName, displayName) {
    const confirmed = await NotificationHelper.confirm({
      title: 'Delete Detector',
      message: `Are you sure you want to delete "${displayName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (!confirmed) {
      return;
    }

    try {
      // Remove detector from detectorManager
      if (this.detectorManager.detectors[category] && this.detectorManager.detectors[category][detectorName]) {
        delete this.detectorManager.detectors[category][detectorName];

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        // Reload detectors in background script
        chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
          Logger.ui('Detectors reloaded in background after delete:', response);
        });

        NotificationHelper.success(`Deleted "${displayName}"`);

        // Refresh the display
        this.displayRules();
      } else {
        NotificationHelper.error('Detector not found');
      }
    } catch (error) {
      Logger.error('UI', 'Failed to delete detector:', error);
      NotificationHelper.error('Failed to delete detector');
    }
  }

  /**
   * Handle adding a new detector
   */
  handleAddDetector() {
    // Get current timestamp in local time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Create a new empty detector
    const newDetector = {
      id: `custom-${Date.now()}`,
      name: 'New Detector',
      displayName: 'New Detector',
      category: 'antibot',
      icon: 'default',
      color: '#3b82f6',
      description: 'Custom detector',
      lastUpdated: timestamp,
      detection: {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      }
    };

    // Open edit modal with the new detector - pass isNew as true
    this.openEditModal(newDetector, 'antibot', newDetector.id, true);
  }

  /**
   * Handle search functionality
   * @param {string} query - Search query
   */
  handleSearch(query) {
    if (!query.trim()) {
      this.filteredDetectors = [...this.allDetectors];
    } else {
      // Simple search focused on name, category, and description only
      // Avoid searching detection pattern content to prevent false positives
      const searchTerm = query.toLowerCase().trim();
      this.filteredDetectors = this.allDetectors.filter(({ detector, category }) => {
        // Search in detector name, category, description only
        const searchableText = [
          detector.displayName,
          detector.name,
          category,
          detector.description
        ].filter(Boolean).join(' ').toLowerCase();

        // Check for basic text match first
        if (searchableText.includes(searchTerm)) {
          return true;
        }

        // Also allow searching by detection method TYPE names (COOKIE, HEADER, DOM, etc.)
        if (detector.detection) {
          const methodTypes = Object.keys(detector.detection)
            .filter(key => Array.isArray(detector.detection[key]) && detector.detection[key].length > 0)
            .map(key => key.toUpperCase().replace(/_/g, ' '))
            .join(' ')
            .toLowerCase();

          if (methodTypes.includes(searchTerm)) {
            return true;
          }
        }

        return false;
      });
    }

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(this.filteredDetectors);
    }
  }

  /**
   * Update HTTP Method select dropdown color based on selected value
   * @param {HTMLSelectElement} selectElement - The select element to update
   */
  updateHttpMethodColor(selectElement) {
    if (!selectElement) return;

    // Remove all method classes
    selectElement.classList.remove('method-get', 'method-post', 'method-put', 'method-patch', 'method-delete');

    // Add appropriate class based on selected value
    const value = selectElement.value.toLowerCase();
    if (value) {
      selectElement.classList.add(`method-${value}`);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rules;
} else if (typeof window !== 'undefined') {
  window.Rules = Rules;
}
