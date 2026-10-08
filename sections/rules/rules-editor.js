/**
 * Rules Editor - Form rendering and data collection/saving.
 * Merges rules-editor-render.js + rules-editor-data.js.
 *
 * Dependencies: rules.js, rules-condition-ui.js (for renderInlineConditionDropdown)
 */

// ============================================
// Form Rendering
// ============================================

const METHOD_PATTERNS_PER_PAGE = 3;

// UI text of the pattern rows, in the UI language. Every value is
// attribute-escaped because the rows are built as HTML strings.
const rulesEditorText = (key, fallback) => {
  const value = (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
  return FormatUtils.escapeAttr(value);
};

const rulesEditorFormat = (key, fallback, ...args) => {
  const formatted = (typeof I18n !== 'undefined') ? I18n.format(key, ...args) : null;
  let value = formatted;
  if (value === null || value === undefined) {
    value = fallback;
    args.forEach((arg, i) => { value = value.split('{' + i + '}').join(String(arg)); });
  }
  return FormatUtils.escapeAttr(value);
};

// "?" button title of each method section
const RULES_EDITOR_HELP_TITLES = {
  js_hooks: ['rulesUiHelpJsHooks', 'What are JS hooks?'],
  window: ['rulesUiHelpWindow', 'What are Window properties?'],
  url: ['rulesUiHelpUrl', 'What is URL detection?'],
  header: ['rulesUiHelpHeader', 'What is Header detection?'],
  cookie: ['rulesUiHelpCookie', 'What is Cookie detection?'],
  content: ['rulesUiHelpContent', 'What is Content detection?'],
  dom: ['rulesUiHelpDom', 'What is DOM detection?'],
  payload: ['rulesUiHelpPayload', 'What is Payload detection?']
};

Rules.prototype.getMethodHelpButtonTitle = function(methodType) {
    const entry = RULES_EDITOR_HELP_TITLES[methodType] || ['rulesUiHelpGeneric', 'What is this detection method?'];
    return rulesEditorText(entry[0], entry[1]);
  };

// Placeholders of the name and value inputs of a pattern row
Rules.prototype.getMethodInputPlaceholders = function(methodType) {
    let name = rulesEditorText('ruleFieldName', 'Name');
    let value = rulesEditorText('rulesUiValueOptionalPlaceholder', 'Value (optional)');
    if (methodType === 'dom') name = rulesEditorText('rulesUiDomSelectorPlaceholder', 'CSS Selector (e.g., .class, #id, [attr])');
    else if (methodType === 'content') name = rulesEditorText('rulesUiContentTextPlaceholder', 'Text/Word to search');
    else if (methodType === 'url' || methodType === 'urls') name = rulesEditorText('rulesUiUrlPatternPlaceholder', 'URL Pattern');
    else if (methodType === 'js_hooks') name = rulesEditorText('rulesUiJsHookTargetPlaceholder', 'JS Hook Target (e.g., Navigator.prototype.webdriver)');
    else if (methodType === 'window') {
      name = rulesEditorText('rulesUiWindowPathPlaceholder', 'Window Path (e.g., grecaptcha, _cf_chl_opt)');
      value = rulesEditorText('rulesUiWindowConditionPlaceholder', 'Condition (e.g., typeof object, typeof function)');
    } else if (methodType === 'cookie') {
      name = rulesEditorText('rulesUiCookieNamePlaceholder', 'Cookie Name (e.g., __cf_bm, session_id)');
      value = rulesEditorText('rulesUiCookieValuePlaceholder', 'Cookie Value Pattern (optional)');
    } else if (methodType === 'payload') name = rulesEditorText('rulesUiPayloadTextPlaceholder', 'Text (e.g., sensor_data, challenge_token)');
    return { name, value };
  };

// Button titles and labels shared by every pattern row and section
Rules.prototype.getMethodRowTexts = function() {
    return {
      nameSettings: rulesEditorText('rulesUiNameSettings', 'Name Settings'),
      valueSettings: rulesEditorText('rulesUiValueSettings', 'Value Settings'),
      deleteMethod: rulesEditorText('rulesUiDeleteMethod', 'Delete Method'),
      clearValue: rulesEditorText('rulesUiClearValue', 'Clear Value'),
      addValue: rulesEditorText('rulesUiAddValue', 'Add Value'),
      previousPage: rulesEditorText('paginationPrev', 'Previous page'),
      nextPage: rulesEditorText('paginationNext', 'Next page'),
      searchPatterns: rulesEditorText('methodSearchPatterns', 'Search patterns...'),
      addPattern: rulesEditorText('methodAddPattern', 'Add Pattern'),
      emptyPagination: rulesEditorFormat('paginationShowingItems', 'Showing {0}-{1} of {2} {3}', 0, 0, 0,
        (typeof I18n !== 'undefined' && I18n.get('methodSuffixPatterns')) || 'patterns'),
      firstPage: rulesEditorFormat('rulesUiPageOfFmt', 'Page {0} / {1}', 1, 1)
    };
  };

Rules.prototype.populateDetectionMethods = function(detector) {
    const container = document.querySelector('#detectionMethodsContainer');
    if (!container) return;

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

    const allMethodTypes = ['url', 'header', 'cookie', 'content', 'dom', 'js_hooks', 'window', 'payload'];

    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const rowTexts = this.getMethodRowTexts();
    allMethodTypes.forEach(methodType => {
      const methodsData = detector.detection?.[methodType];
      const helpButtonTitle = this.getMethodHelpButtonTitle(methodType);

      const methodHelper = `
            <button class="method-help-btn" type="button" data-method-help="${methodType}" title="${helpButtonTitle}">?</button>
          `;

      const patternCount = Array.isArray(methodsData) ? methodsData.length : 0;
      const patternCountText = patternCount === 1
        ? ((_t && _t.get('methodOnePattern')) || '1 pattern')
        : ((_t && _t.format('methodPatternsFmt', patternCount)) || `${patternCount} patterns`);

      methodsHtml += `
        <div class="method-section collapsed" data-method-type="${methodType}">
          <div class="method-header">
            <div class="method-header-left">
              <svg class="method-collapse-icon" width="16" height="16" viewBox="0 0 24 24">
                <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" fill="currentColor"/>
              </svg>
              ${this.renderMethodChip(methodType, 'method-title')}
              ${methodType === 'js_hooks' ? `<span class="method-scope-tag" role="img" title="${rulesEditorText('mhJsHooksOnlyFingerprint', 'Only Fingerprint rules use hooks: anti-bot and CAPTCHA rules ignore them.')}" aria-label="${rulesEditorText('mhJsHooksOnlyFingerprint', 'Only Fingerprint rules use hooks: anti-bot and CAPTCHA rules ignore them.')}">!</span>` : ''}
            </div>
            <span class="method-pattern-count">${patternCountText}</span>
            ${methodHelper}
          </div>
          ${methodType === 'js_hooks' ? `<p class="method-scope-note">${rulesEditorText('mhJsHooksOnlyFingerprint', 'Only Fingerprint rules use hooks: anti-bot and CAPTCHA rules ignore them.')}</p>` : ''}
          <div class="method-search-row">
            <input
              type="text"
              class="method-search-input"
              data-method-search="${methodType}"
              placeholder="${(_t && _t.get('methodSearchPatterns')) || 'Search patterns...'}"
            >
          </div>
          <div class="method-items">
      `;

      if (Array.isArray(methodsData) && methodsData.length > 0) {
        methodsData.forEach((method, index) => {
            let name = '';
            let value = '';

            // Extract name/value based on method type's data structure
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
            // Stable id combinations refer to, and whether the pattern may fire alone
            const patternId = ((typeof DetectionCombinations !== 'undefined') && DetectionCombinations.idOf(detector, method))
              || `${methodType}-${index + 1}`;
            const standalone = method.standalone === false ? 'false' : 'true';

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
            const checkScripts = method.checkScripts === true || method.scope === 'scripts';

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

            let payloadUrlPattern = '';
            let payloadUrlRegex = false;
            let payloadUrlCaseSensitive = false;
            let payloadMethods = '';

            if (methodType === 'payload') {
              payloadUrlPattern = method.urlPattern || '';
              payloadUrlRegex = method.urlRegex || false;
              payloadUrlCaseSensitive = method.urlCaseSensitive || false;
              if (Array.isArray(method.methods) && method.methods.length > 0) {
                payloadMethods = method.methods.join(',');
              }
            }

            if (!name && !value) {
              return;
            }

            // js_hooks: single input (target only); window: dual inputs (path + condition)
            const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
            const isSingleInput = singleInputTypes.includes(methodType);

            const { name: inputPlaceholder, value: valuePlaceholder } = this.getMethodInputPlaceholders(methodType);

            const hasNameCustomSettings = (methodType !== 'dom' && (nameRegex || nameWholeWord || nameCaseSensitive)) ||
                                          (methodType === 'content' && checkScripts === true);
            const hasValueCustomSettings = valueRegex || valueWholeWord || valueCaseSensitive;

            const windowConditionDropdown = methodType === 'window'
              ? this.renderInlineConditionDropdown(value, methodType, index)
              : '';
            const showValueRow = !isSingleInput && (methodType === 'window' || value);
            const showNameSettings = true;
            const showValueActions = methodType !== 'window';

            methodsHtml += `
              <div class="method-item"
                data-method-order="${index}"
                data-pattern-id="${FormatUtils.escapeAttr(patternId)}"
                data-standalone="${standalone}"
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
                data-payload-url-pattern="${FormatUtils.escapeAttr(payloadUrlPattern)}"
                data-payload-url-regex="${payloadUrlRegex}"
                data-payload-url-case-sensitive="${payloadUrlCaseSensitive}"
                data-payload-methods="${FormatUtils.escapeAttr(payloadMethods)}">
                <div class="method-item-content">
                  <div class="method-item-inputs">
                    <div class="input-with-indicators">
                      <div class="input-row">
                        <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="${FormatUtils.escapeAttr(name)}" data-method-key="${methodType}" data-item-index="${index}">
                        ${methodType === 'window' ? `<button class="window-helper-btn" title="${FormatUtils.escapeHtml(RuleHelperKit.tr('rulesWindowPropertiesHelper', 'Window Properties Helper'))}" data-input-index="${index}">?</button>` : ''}
                        <div class="field-actions" data-field-type="name">
                          ${showNameSettings ? `
                          <button class="method-action-btn settings ${hasNameCustomSettings ? 'has-custom-settings' : ''}" title="${rowTexts.nameSettings}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                          </button>
                          ` : ''}
                          <button class="method-action-btn delete" title="${rowTexts.deleteMethod}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
                          : `<input type="text" class="method-input method-value" placeholder="${valuePlaceholder}" value="${FormatUtils.escapeAttr(value)}" data-method-key="${methodType}" data-item-index="${index}">`
                        }
                        ${showValueActions ? `
                        <div class="field-actions" data-field-type="value">
                          <button class="method-action-btn settings ${hasValueCustomSettings ? 'has-custom-settings' : ''}" title="${rowTexts.valueSettings}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                          </button>
                          <button class="method-action-btn delete" title="${rowTexts.clearValue}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                        ` : ''}
                      </div>
                      <div class="input-badges-row">
                        <div class="input-indicators" data-for="value-${methodType}-${index}"></div>
                      </div>
                    </div>
                    <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodType}" data-item-index="${index}">
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                      </svg>
                      ${rowTexts.addValue}
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
          <div class="method-pagination" data-method-pagination="${methodType}">
            <span class="method-pagination-info">${rowTexts.emptyPagination}</span>
            <div class="method-pagination-controls">
              <button type="button" class="method-pagination-btn prev" title="${rowTexts.previousPage}" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M15.41,7.41L14,6L8,12L14,18L15.41,16.59L10.83,12L15.41,7.41Z" fill="currentColor"/>
                </svg>
              </button>
              <span class="method-pagination-page">${rowTexts.firstPage}</span>
              <button type="button" class="method-pagination-btn next" title="${rowTexts.nextPage}" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M8.59,16.59L10,18L16,12L10,6L8.59,7.41L13.17,12L8.59,16.59Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
          <button class="add-method-btn" data-method-type="${methodType}">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
            </svg>
            ${(_t && _t.get('methodAddPattern')) || 'Add Pattern'}
          </button>
        </div>
      `;
    });

    container.innerHTML = methodsHtml;
    this.methodPaginationState = {};

    const methodSections = container.querySelectorAll('.method-section');
    methodSections.forEach(section => {
      this.updateMethodSectionPagination(section);
    });
    this.updateAllAddPatternButtonStates();

    const searchInputs = container.querySelectorAll('.method-search-input');
    searchInputs.forEach(input => {
      input.addEventListener('input', (event) => {
        const section = event.target.closest('.method-section');
        this.updateMethodSectionPagination(section, { searchQuery: event.target.value });
      });
    });

    const methodItems = container.querySelectorAll('.method-item');
    methodItems.forEach(item => {
      const hasSettings =
        item.dataset.nameRegex === 'true' ||
        item.dataset.nameWholeword === 'true' ||
        item.dataset.nameCase === 'true' ||
        item.dataset.valueRegex === 'true' ||
        item.dataset.valueWholeword === 'true' ||
        item.dataset.valueCase === 'true' ||
        item.dataset.standalone === 'false';

      if (hasSettings) {
        this.updateMethodIndicators(item);
      }

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

Rules.prototype.getMethodSectionType = function(section) {
    if (!section) return '';

    const datasetType = section.dataset.methodType;
    if (datasetType) {
      return datasetType === 'js hooks' ? 'js_hooks' : datasetType;
    }

    const buttonType = section.querySelector('.add-method-btn')?.dataset.methodType;
    if (buttonType) return buttonType;

    return '';
  };

Rules.prototype.updateMethodPatternCount = function(section) {
    if (!section) return 0;

    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const totalPatterns = section.querySelectorAll('.method-item').length;
    const patternCountEl = section.querySelector('.method-pattern-count');
    if (patternCountEl) {
      patternCountEl.textContent = totalPatterns === 1
        ? ((_t && _t.get('methodOnePattern')) || '1 pattern')
        : ((_t && _t.format('methodPatternsFmt', totalPatterns)) || `${totalPatterns} patterns`);
    }
    return totalPatterns;
  };

Rules.prototype.getMethodPaginationEntry = function(methodType) {
    if (!this.methodPaginationState || typeof this.methodPaginationState !== 'object') {
      this.methodPaginationState = {};
    }

    const existingState = this.methodPaginationState[methodType];
    if (existingState && typeof existingState === 'object') {
      if (typeof existingState.page !== 'number') existingState.page = 1;
      if (typeof existingState.searchQuery !== 'string') existingState.searchQuery = '';
      return existingState;
    }

    const entry = {
      page: typeof existingState === 'number' ? existingState : 1,
      searchQuery: ''
    };
    this.methodPaginationState[methodType] = entry;
    return entry;
  };

Rules.prototype.methodItemMatchesSearch = function(item, normalizedQuery) {
    if (!normalizedQuery) return true;
    if (!item) return false;

    const tokens = [];

    item.querySelectorAll('.method-input').forEach(input => {
      if (typeof input.value === 'string' && input.value.trim()) {
        tokens.push(input.value.trim());
      }
    });

    const selectedCondition = item.querySelector('.condition-selected-text')?.textContent?.trim();
    if (selectedCondition) {
      tokens.push(selectedCondition);
    }

    const methodKey = item.querySelector('.method-input')?.dataset.methodKey;
    if (methodKey) {
      tokens.push(methodKey.replace(/_/g, ' '));
    }

    return tokens.join(' ').toLowerCase().includes(normalizedQuery);
  };

Rules.prototype.updateMethodSectionPagination = function(section, options = {}) {
    if (!section) return;

    const methodType = this.getMethodSectionType(section);
    if (!methodType) return;
    const isCollapsed = section.classList.contains('collapsed');

    if (!this.methodPaginationState || typeof this.methodPaginationState !== 'object') {
      this.methodPaginationState = {};
    }

    const paginationEntry = this.getMethodPaginationEntry(methodType);
    if (typeof options.searchQuery === 'string') {
      paginationEntry.searchQuery = options.searchQuery.trim().toLowerCase();
      paginationEntry.page = 1;
    }

    const items = Array.from(section.querySelectorAll('.method-item'));
    const totalItems = this.updateMethodPatternCount(section);
    const searchRow = section.querySelector('.method-search-row');
    const searchInput = section.querySelector('.method-search-input');

    if (totalItems === 0) {
      paginationEntry.searchQuery = '';
      paginationEntry.page = 1;
      if (searchInput) {
        searchInput.value = '';
      }
    }

    if (searchRow) {
      searchRow.style.display = (isCollapsed || totalItems === 0) ? 'none' : '';
    }

    const filteredItems = paginationEntry.searchQuery
      ? items.filter(item => this.methodItemMatchesSearch(item, paginationEntry.searchQuery))
      : items;
    const filteredCount = filteredItems.length;
    const perPage = METHOD_PATTERNS_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(filteredCount / perPage));

    let currentPage = paginationEntry.page || 1;

    if (options.goToLastPage) {
      currentPage = totalPages;
    }
    if (typeof options.pageDelta === 'number' && options.pageDelta !== 0) {
      currentPage += options.pageDelta;
    }

    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    paginationEntry.page = currentPage;

    const startIndex = (currentPage - 1) * perPage;
    const endIndex = startIndex + perPage;

    items.forEach(item => {
      item.style.display = 'none';
    });

    filteredItems.forEach((item, index) => {
      if (index >= startIndex && index < endIndex) {
        item.style.display = '';
      }
    });

    const pagination = section.querySelector('.method-pagination');
    const infoEl = section.querySelector('.method-pagination-info');
    const pageEl = section.querySelector('.method-pagination-page');
    const prevBtn = section.querySelector('.method-pagination-btn.prev');
    const nextBtn = section.querySelector('.method-pagination-btn.next');

    if (infoEl) {
      const _t = (typeof I18n !== 'undefined') ? I18n : null;
      if (filteredCount === 0) {
        infoEl.textContent = paginationEntry.searchQuery
          ? ((_t && _t.get('methodNoMatchingPatterns')) || 'No matching patterns')
          : ((_t && _t.get('methodNoPatterns')) || 'No patterns');
      } else {
        const startItem = startIndex + 1;
        const endItem = Math.min(endIndex, filteredCount);
        const suffix = paginationEntry.searchQuery
          ? ((_t && _t.get('methodSuffixMatches')) || 'matches')
          : ((_t && _t.get('methodSuffixPatterns')) || 'patterns');
        infoEl.textContent = (_t && _t.format('paginationShowingItems', startItem, endItem, filteredCount, suffix))
          || `Showing ${startItem}-${endItem} of ${filteredCount} ${suffix}`;
      }
    }

    if (pageEl) {
      pageEl.textContent = (typeof I18n !== 'undefined' && I18n.format('rulesUiPageOfFmt', currentPage, totalPages))
        || `Page ${currentPage} / ${totalPages}`;
    }

    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages;
    }

    if (pagination) {
      if (isCollapsed) {
        pagination.style.display = 'none';
      } else {
        pagination.style.display = (filteredCount > perPage || !!paginationEntry.searchQuery) ? 'flex' : 'none';
      }
    }
  };

Rules.prototype.sectionHasEmptyRequiredPattern = function(section) {
    if (!section) return false;

    return Array.from(section.querySelectorAll('.method-item')).some(item => {
      const requiredInput = item.querySelector('.method-name');
      if (!requiredInput) return false;
      return !requiredInput.value.trim();
    });
  };

Rules.prototype.updateAddPatternButtonState = function(section) {
    if (!section) return;

    const addPatternBtn = section.querySelector('.add-method-btn');
    if (!addPatternBtn) return;

    const hasEmptyRequiredPattern = this.sectionHasEmptyRequiredPattern(section);
    addPatternBtn.disabled = hasEmptyRequiredPattern;
    addPatternBtn.setAttribute('aria-disabled', hasEmptyRequiredPattern ? 'true' : 'false');

    if (hasEmptyRequiredPattern) {
      addPatternBtn.title = (typeof I18n !== 'undefined' && I18n.get('rulesUiCompleteEmptyPattern'))
        || 'Complete the current empty pattern before adding another.';
    } else {
      addPatternBtn.removeAttribute('title');
    }
  };

Rules.prototype.updateAllAddPatternButtonStates = function() {
    const container = document.querySelector('#detectionMethodsContainer');
    if (!container) return;

    container.querySelectorAll('.method-section').forEach(section => {
      this.updateAddPatternButtonState(section);
    });
  };

Rules.prototype.validatePatternRows = function() {
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (!methodsContainer) {
      return {
        isValid: true,
        invalidRows: []
      };
    }

    const invalidRows = [];
    const methodSections = methodsContainer.querySelectorAll('.method-section');

    methodSections.forEach(section => {
      const methodType = this.getMethodSectionType(section);
      const methodItems = Array.from(section.querySelectorAll('.method-item'));

      methodItems.forEach((item, itemIndexInSection) => {
        const requiredInput = item.querySelector('.method-name');
        const requiredValue = requiredInput?.value?.trim() || '';

        if (!requiredValue) {
          invalidRows.push({
            section,
            item,
            input: requiredInput,
            methodType,
            itemIndexInSection
          });
        }
      });
    });

    return {
      isValid: invalidRows.length === 0,
      invalidRows
    };
  };

Rules.prototype.clearPatternValidationState = function() {
    const modal = document.querySelector('#editRuleModal');
    const scope = modal || document;

    scope.querySelectorAll('.method-item-invalid').forEach(item => {
      item.classList.remove('method-item-invalid');
    });

    scope.querySelectorAll('.method-input-invalid').forEach(input => {
      input.classList.remove('method-input-invalid');
      input.removeAttribute('aria-invalid');
    });
  };

Rules.prototype.markPatternValidationState = function(invalidRows = []) {
    if (!Array.isArray(invalidRows) || invalidRows.length === 0) return;

    invalidRows.forEach(({ item, input }) => {
      if (item) {
        item.classList.add('method-item-invalid');
      }
      if (input) {
        input.classList.add('method-input-invalid');
        input.setAttribute('aria-invalid', 'true');
      }
    });
  };

Rules.prototype.revealAndFocusInvalidRow = function(invalidRow) {
    if (!invalidRow) return;

    const { section, item, input, itemIndexInSection } = invalidRow;
    if (!section || !item) return;

    section.classList.remove('collapsed');

    const methodType = invalidRow.methodType || this.getMethodSectionType(section);
    const searchInput = section.querySelector('.method-search-input');
    if (searchInput) {
      searchInput.value = '';
    }

    if (methodType) {
      const paginationEntry = this.getMethodPaginationEntry(methodType);
      paginationEntry.searchQuery = '';

      const allItems = Array.from(section.querySelectorAll('.method-item'));
      const absoluteIndex = typeof itemIndexInSection === 'number'
        ? itemIndexInSection
        : allItems.indexOf(item);
      const normalizedIndex = absoluteIndex >= 0 ? absoluteIndex : 0;
      paginationEntry.page = Math.max(1, Math.floor(normalizedIndex / METHOD_PATTERNS_PER_PAGE) + 1);
    }

    this.updateMethodSectionPagination(section);

    const targetInput = input || item.querySelector('.method-name');
    requestAnimationFrame(() => {
      if (targetInput) {
        targetInput.focus();
        targetInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else {
        item.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    });
  };

Rules.prototype.addNewMethodItem = function(button) {
    const methodSection = button.closest('.method-section');
    const methodItems = methodSection.querySelector('.method-items');
    // The chip shows a translated label, so the key comes from the section's data attribute
    const methodKey = this.getMethodSectionType(methodSection);
    const rowTexts = this.getMethodRowTexts();

    const itemIndex = `new-${Date.now()}`;
    const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';
    const isWindow = methodKey === 'window';

    const { name: inputPlaceholder, value: valuePlaceholder } = this.getMethodInputPlaceholders(methodKey);

    const windowConditionDropdown = isWindow ? this.renderInlineConditionDropdown('exists', methodKey, itemIndex) : '';
    const showValueRow = isWindow;
    const showNameSettings = true;
    const showValueActions = !isWindow;
    const methodOrder = methodItems.querySelectorAll('.method-item').length;
    const patternId = this.nextPatternId(methodKey);

    const newMethodHtml = `
      <div class="method-item"
        data-method-order="${methodOrder}"
        data-pattern-id="${patternId}"
        data-standalone="true"
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
                ${isWindow ? `<button class="window-helper-btn" title="${FormatUtils.escapeHtml(RuleHelperKit.tr('rulesWindowPropertiesHelper', 'Window Properties Helper'))}" data-input-index="${itemIndex}">?</button>` : ''}
                <div class="field-actions" data-field-type="name">
                  ${showNameSettings ? `
                  <button class="method-action-btn settings" title="${rowTexts.nameSettings}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                  </button>
                  ` : ''}
                  <button class="method-action-btn delete" title="${rowTexts.deleteMethod}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
                    ${showValueActions ? `
                    <div class="field-actions" data-field-type="value">
                  <button class="method-action-btn settings" title="${rowTexts.valueSettings}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                  </button>
                  <button class="method-action-btn delete" title="${rowTexts.clearValue}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
                ` : ''}
              </div>
              <div class="input-badges-row">
                <div class="input-indicators" data-for="value-${methodKey}-${itemIndex}"></div>
              </div>
            </div>
            <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodKey}" data-item-index="${itemIndex}">
              <svg width="12" height="12" viewBox="0 0 24 24">
                <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
              </svg>
              ${rowTexts.addValue}
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    methodItems.insertAdjacentHTML('beforeend', newMethodHtml);
    const searchInput = methodSection.querySelector('.method-search-input');
    if (searchInput && searchInput.value.trim()) {
      searchInput.value = '';
      this.updateMethodSectionPagination(methodSection, { searchQuery: '' });
    }
    this.updateMethodSectionPagination(methodSection, { goToLastPage: true });
    this.updateAddPatternButtonState(methodSection);
  };

Rules.prototype.addNewMethodSection = function() {
    const container = document.querySelector('#detectionMethodsContainer');
    const addSectionBtn = container.querySelector('.add-section-btn');

    const methodType = prompt((typeof I18n !== 'undefined' && I18n.get('rulesUiEnterMethodTypePrompt')) || 'Enter detection method type (e.g., HEADERS, CONTENT, URLs):');
    if (!methodType) return;
    const rowTexts = this.getMethodRowTexts();

    const methodKey = methodType.toLowerCase();
    const singleInputTypes = ['url', 'content', 'dom', 'js_hooks', 'payload'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';
    const isWindow = methodKey === 'window';

    const { name: inputPlaceholder, value: valuePlaceholder } = this.getMethodInputPlaceholders(methodKey);

    const windowConditionDropdown = isWindow ? this.renderInlineConditionDropdown('exists', methodKey, 'new') : '';
    const showValueRow = isWindow;
    const showNameSettings = true;
    const showValueActions = !isWindow;

    const newSectionHtml = `
      <div class="method-section" data-method-type="${methodKey}">
        <div class="method-header">
          ${this.renderMethodChip(methodKey, 'method-title')}
        </div>
        <div class="method-search-row">
          <input
            type="text"
            class="method-search-input"
            data-method-search="${methodKey}"
            placeholder="${rowTexts.searchPatterns}"
          >
        </div>
        <div class="method-items">
          <div class="method-item"
            data-method-order="0"
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
                    ${isWindow ? `<button class="window-helper-btn" title="${FormatUtils.escapeHtml(RuleHelperKit.tr('rulesWindowPropertiesHelper', 'Window Properties Helper'))}" data-input-index="new">?</button>` : ''}
                    <div class="field-actions" data-field-type="name">
                      ${showNameSettings ? `
                      <button class="method-action-btn settings" title="${rowTexts.nameSettings}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                      </button>
                      ` : ''}
                      <button class="method-action-btn delete" title="${rowTexts.deleteMethod}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
                      : `<input type="text" class="method-input method-value" placeholder="${valuePlaceholder}" value="" data-method-key="${methodKey}" data-item-index="new">`
                    }
                    ${showValueActions ? `
                    <div class="field-actions" data-field-type="value">
                      <button class="method-action-btn settings" title="${rowTexts.valueSettings}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                      </button>
                      <button class="method-action-btn delete" title="${rowTexts.clearValue}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                    ` : ''}
                  </div>
                <div class="input-badges-row">
                  <div class="input-indicators" data-for="value-${methodKey}-new"></div>
                </div>
              </div>
                <button class="add-value-btn" style="display: ${showValueRow ? 'none' : 'flex'}" data-method-key="${methodKey}" data-item-index="new">
                  <svg width="12" height="12" viewBox="0 0 24 24">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                  </svg>
                  ${rowTexts.addValue}
                </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="method-pagination" data-method-pagination="${methodKey}">
          <span class="method-pagination-info">${rowTexts.emptyPagination}</span>
          <div class="method-pagination-controls">
            <button type="button" class="method-pagination-btn prev" title="${rowTexts.previousPage}" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24">
                <path d="M15.41,7.41L14,6L8,12L14,18L15.41,16.59L10.83,12L15.41,7.41Z" fill="currentColor"/>
              </svg>
            </button>
            <span class="method-pagination-page">${rowTexts.firstPage}</span>
            <button type="button" class="method-pagination-btn next" title="${rowTexts.nextPage}" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24">
                <path d="M8.59,16.59L10,18L16,12L10,6L8.59,7.41L13.17,12L8.59,16.59Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
        <button class="add-method-btn" data-method-type="${methodType.toLowerCase()}">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
          </svg>
          ${rowTexts.addPattern}
        </button>
      </div>
    `;

    addSectionBtn.insertAdjacentHTML('beforebegin', newSectionHtml);
    const insertedSection = addSectionBtn.previousElementSibling;
    const searchInput = insertedSection?.querySelector('.method-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        const section = event.target.closest('.method-section');
        this.updateMethodSectionPagination(section, { searchQuery: event.target.value });
      });
    }
    this.updateMethodSectionPagination(insertedSection);
    this.updateAddPatternButtonState(insertedSection);
  };

// ============================================
// Data Collection & Saving
// ============================================

// First unused `<method>-<n>` id among the rows of the editor
Rules.prototype.nextPatternId = function(methodType) {
    const used = new Set([...document.querySelectorAll('#detectionMethodsContainer .method-item[data-pattern-id]')]
      .map(item => item.dataset.patternId));
    let n = 1;
    while (used.has(`${methodType}-${n}`)) n++;
    return `${methodType}-${n}`;
  };

// Rule fields the editor form shows and writes, per method type. Anything
// else on a rule (descriptions of single-input rows, js_hooks optional and
// windowPath, a content textScope, fields added by newer versions) is not on
// the form, so saving keeps it from the stored rule instead of dropping it.
const RULE_FIELDS_FROM_FORM = {
  common: ['id', 'confidence', 'standalone', 'checkScripts'],
  header: ['name', 'value', 'nameRegex', 'nameWholeWord', 'nameCaseSensitive', 'valueRegex', 'valueWholeWord', 'valueCaseSensitive', 'nameScope', 'valueScope'],
  cookie: ['name', 'value', 'nameRegex', 'nameWholeWord', 'nameCaseSensitive', 'valueRegex', 'valueWholeWord', 'valueCaseSensitive', 'nameScope', 'valueScope'],
  url: ['text', 'textRegex', 'textWholeWord', 'textCaseSensitive', 'textScope'],
  content: ['text', 'textRegex', 'textWholeWord', 'textCaseSensitive'],
  payload: ['text', 'textRegex', 'textWholeWord', 'textCaseSensitive', 'urlPattern', 'urlRegex', 'urlCaseSensitive', 'methods'],
  dom: ['selector', 'selectorRegex', 'selectorWholeWord', 'selectorCaseSensitive'],
  js_hooks: ['target'],
  window: ['path', 'condition']
};

/**
 * The saved rule: the stored rule's own fields, overridden by what the form
 * manages. A field the form manages but left unset (an unticked option) is
 * removed; fields the form never shows are kept as they were.
 */
function mergeRuleWithForm(original, fromForm, methodType, formHasDescription) {
  if (!original) return fromForm;
  const managed = new Set([...RULE_FIELDS_FROM_FORM.common, ...(RULE_FIELDS_FROM_FORM[methodType] || [])]);
  if (formHasDescription) managed.add('description');
  const merged = {};
  for (const [key, val] of Object.entries(original)) {
    if (!managed.has(key)) merged[key] = val;
  }
  // "Only check scripts" is stored as scope: "scripts" in shipped rules and as
  // checkScripts by the editor: keep the scope while the option stays on
  if (methodType === 'content' && merged.scope === 'scripts' && fromForm.checkScripts !== true) delete merged.scope;
  return { ...merged, ...fromForm };
}

Rules.prototype._collectDetectionFromForm = function() {
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (!methodsContainer) return {};

    // Stored rules by the same id the rows carry (data-pattern-id)
    const storedDetector = this.currentEditDetector?.isNew ? null : this.currentEditDetector?.original;
    const storedRule = (methodType, patternId) => {
      const rules = storedDetector?.detection?.[methodType];
      if (!Array.isArray(rules) || !patternId) return null;
      return rules.find((rule, index) => {
        const id = ((typeof DetectionCombinations !== 'undefined') && DetectionCombinations.idOf(storedDetector, rule))
          || `${methodType}-${index + 1}`;
        return id === patternId;
      }) || null;
    };

    const detectionMethods = {};
    const methodSections = methodsContainer.querySelectorAll('.method-section');

    methodSections.forEach(section => {
      // The chip shows a translated label, so the key comes from the section's data attribute
      const methodType = this.getMethodSectionType(section);
      if (!methodType) return;

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

          if (item.dataset.checkScripts === 'true') {
            methodData.checkScripts = true;
          }

          if (methodType === 'header') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'response', 'response');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'response', 'response');
          } else if (methodType === 'cookie') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'request', 'request');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'request', 'request');
          } else if (methodType === 'url') {
            methodData.textScope = item.dataset.textScope || 'all';
          }

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

          if (item.dataset.patternId) methodData.id = item.dataset.patternId;
          if (item.dataset.standalone === 'false') methodData.standalone = false;

          const original = storedRule(methodType, item.dataset.patternId);
          methods.push(mergeRuleWithForm(original, methodData, methodType, Boolean(valueInput) && methodType !== 'header' && methodType !== 'cookie' && methodType !== 'window'));
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

    const categories = this.categoryManager.getCategories();

    Object.values(categories).forEach(category => {
      if (category.detectors && category.detectors[detectorName]) {
        category.detectors[detectorName].color = color;
      }
    });

    this.categoryManager.saveToStorage();
  };

Rules.prototype.saveRule = function() {
    if (!this.currentEditDetector) return;

    this.clearPatternValidationState();
    const patternValidation = this.validatePatternRows();
    if (!patternValidation.isValid) {
      this.markPatternValidationState(patternValidation.invalidRows);
      this.revealAndFocusInvalidRow(patternValidation.invalidRows[0]);

      const requiredMessage = (typeof I18n !== 'undefined' && I18n.get('rulesUiFillRequiredPatterns'))
        || 'Please fill all required pattern fields before saving.';
      if (typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.warning === 'function') {
        NotificationHelper.warning(requiredMessage);
      } else {
        alert(requiredMessage);
      }
      return;
    }

    // Combinations: each needs something that must be found; references to
    // patterns that are not saved (empty rows) and emptied groups are dropped
    const combinationResult = this.buildCombinationsForSave(this._collectDetectionFromForm());
    if (combinationResult.invalidIndex >= 0) {
      this.reportInvalidCombination(combinationResult.invalidIndex, combinationResult.invalidMessage);
      return;
    }

    // Anti-spoof: only the shipped detectors may be authored by "Scrapfly"
    this.clearAuthorError();
    const authorField = document.querySelector('#detectorAuthorInput');
    if (authorField && !this.currentEditDetector.isOfficial && DetectionUtils.isReservedAuthor(authorField.value)) {
      const _t = (typeof I18n !== 'undefined') ? I18n : null;
      const message = (_t && _t.get('authorReservedError')) ||
        '"Scrapfly" is reserved for official detectors. Use a different author name.';
      this.showAuthorError(message);
      if (typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.warning === 'function') {
        NotificationHelper.warning(message);
      }
      return;
    }

    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');
    const difficultySelect = document.querySelector('#detectorDifficultySelect');

    if (nameInput) {
      // Never stores the English default: an empty field becomes the default
      // name in the UI language, and an untouched legacy "New Detector" keeps
      // its stored name (see resolveDetectorNameForSave in rules-formatters.js)
      const detectorName = this.resolveDetectorNameForSave(nameInput.value, this.currentEditDetector.detector.name);
      this.currentEditDetector.detector.name = detectorName;
      this.currentEditDetector.detector.displayName = detectorName;
    }

    if (categorySelect) {
      this.currentEditDetector.detector.category = categorySelect.value;
      this.currentEditDetector.category = categorySelect.value;
    }

    if (difficultySelect) {
      const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
        ? DetectionUtils.normalizeDifficulty(difficultySelect.value)
        : null;
      const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
        ? DetectionUtils.defaultDifficultyForCategory(this.currentEditDetector.category || this.currentEditDetector.detector.category)
        : 'Medium';
      // A difficulty changed here is the user's and survives detector updates
      DetectorManager.applyDifficultyChoice(this.currentEditDetector.detector,
        this.currentEditDetector.original, normalizedDifficulty || defaultDifficulty);
    }

    // Every detector's author is editable; custom ones may not claim "Scrapfly"
    // (checked above). Renaming an official detector's author makes it a
    // regular, deletable rule, since official = shipped id + Scrapfly author.
    const authorInput = document.querySelector('#detectorAuthorInput');
    if (authorInput) {
      const author = authorInput.value.trim();
      if (author) {
        this.currentEditDetector.detector.author = author;
      } else {
        delete this.currentEditDetector.detector.author;
      }
    }

    if (this.currentEditDetector.customIcon) {
      this.currentEditDetector.detector.customIcon = this.currentEditDetector.customIcon;
    }

    const detectionMethods = this._collectDetectionFromForm();
    if (Object.keys(detectionMethods).length > 0) {
      this.currentEditDetector.detector.detection = detectionMethods;
      Logger.debug('UI', 'Updated detection methods:', detectionMethods);
    }

    const combinations = combinationResult.combinations;
    if (combinations.length > 0) {
      this.currentEditDetector.detector.combinations = combinations;
    } else {
      delete this.currentEditDetector.detector.combinations;
    }

    Logger.debug('UI', 'Saving rule for:', this.currentEditDetector.detector.displayName);

    const originalDetection = this.currentEditDetector.originalDetection || {};
    const currentDetection = this.currentEditDetector.detector.detection || {};
    const hasChanges = this.currentEditDetector.isNew ||
      JSON.stringify(originalDetection) !== JSON.stringify(currentDetection) ||
      JSON.stringify(this.currentEditDetector.originalCombinations || []) !== JSON.stringify(combinations);

    if (hasChanges) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      this.currentEditDetector.detector.lastUpdated = timestamp;

      if (this.currentEditDetector.isNew) {
        this.currentEditDetector.detector.version = '1.0';
      } else {
        const original = this.currentEditDetector.original || {};
        // The original object carries the user-edit fields cleanDetectorCopy
        // drops; read them from the stored detector
        const stored = this.detectorManager?.getDetector(this.currentEditDetector.category, this.currentEditDetector.detectorName) || {};
        if (DetectionUtils.isOfficialDetector({ ...original, id: original.id || this.currentEditDetector.detectorName })) {
          // Official rule: keep the official version so updates still compare
          // against what Scrapfly shipped, and remember the original so an
          // update asks first and "Reset to official" can restore it
          DetectorManager.markUserEdited(this.currentEditDetector.detector, {
            ...original,
            userModified: stored.userModified,
            officialSnapshot: stored.officialSnapshot,
            dismissedVersion: stored.dismissedVersion
          });
        } else {
          const currentVersion = this.currentEditDetector.detector.version || '1.0';
          const newVersion = DetectorManager.bumpVersion(currentVersion);
          this.currentEditDetector.detector.version = newVersion;
          Logger.debug('UI', `Version incremented: ${currentVersion} → ${newVersion}`);
        }
      }
    } else {
      Logger.debug('UI', 'No changes detected, version and timestamp unchanged');
    }

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
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.debug('UI', 'Detectors reloaded in background:', response);
          });
          this.displayRules();
        }
      });

      this.closeEditModal();
      return;
    }

    if (this.detectorManager) {
      const categoryDetectors = this.detectorManager.detectors[this.currentEditDetector.category];
      if (categoryDetectors && categoryDetectors[this.currentEditDetector.detectorName]) {
        const updatedDetector = {
          ...this.currentEditDetector.detector,
          customIcon: this.currentEditDetector.detector.customIcon
        };
        categoryDetectors[this.currentEditDetector.detectorName] = updatedDetector;

        Logger.debug('UI', 'Detector updated, lastUpdated:', updatedDetector.lastUpdated);

        this.detectorManager.saveDetectorsToStorage().then(() => {
          Logger.debug('UI', 'Detector saved to storage successfully');
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.debug('UI', 'Detectors reloaded in background:', response);
          });
        }).catch(error => {
          Logger.error('UI', 'Failed to save detector:', error);
        });
      }
    }

    if (this.categoryManager && this.colorManager) {
      const color = this.colorManager.getColor();
      this.updateDetectorBadgeColor(this.currentEditDetector.detectorName, color);
    }

    this.closeEditModal();
    this.displayRules();
  };
