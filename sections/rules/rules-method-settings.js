/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.setupMethodSettingsModal = function() {
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
  };

Rules.prototype.openMethodSettingsModal = function(methodItem, fieldType = 'name') {
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
  };

Rules.prototype.updateMethodIndicators = function(methodItem) {
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
  };

Rules.prototype.closeMethodSettingsModal = function() {
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
  };

Rules.prototype.saveMethodSettings = function() {
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
  };

Rules.prototype.updateHttpMethodColor = function(selectElement) {
    if (!selectElement) return;

    // Remove all method classes
    selectElement.classList.remove('method-get', 'method-post', 'method-put', 'method-patch', 'method-delete');

    // Add appropriate class based on selected value
    const value = selectElement.value.toLowerCase();
    if (value) {
      selectElement.classList.add(`method-${value}`);
    }
  };
