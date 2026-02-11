/**
 * Rules Editor - Form rendering and data collection/saving.
 * Merges rules-editor-render.js + rules-editor-data.js.
 *
 * Dependencies: rules.js, rules-condition-ui.js (for renderInlineConditionDropdown)
 */

// ============================================
// Form Rendering
// ============================================

Rules.prototype.populateDetectionMethods = function(detector) {
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

    // Iterate through all method types to ensure all sections are shown
    allMethodTypes.forEach(methodType => {
      const methodsData = detector.detection?.[methodType];
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
              name = method.text || '';
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
  };

Rules.prototype.addNewMethodItem = function(button) {
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
  };

Rules.prototype.addNewMethodSection = function() {
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
  };

// ============================================
// Data Collection & Saving
// ============================================

Rules.prototype._collectDetectionFromForm = function() {
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
  };

Rules.prototype.updateDetectorBadgeColor = function(detectorName, color) {
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
  };

Rules.prototype.saveRule = function() {
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

    // Save custom icon if one was selected
    if (this.currentEditDetector.customIcon) {
      this.currentEditDetector.detector.customIcon = this.currentEditDetector.customIcon;
    }

    // Collect detection methods using shared extraction logic
    const detectionMethods = this._collectDetectionFromForm();
    if (Object.keys(detectionMethods).length > 0) {
      this.currentEditDetector.detector.detection = detectionMethods;
      Logger.ui('Updated detection methods:', detectionMethods);
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
  };
