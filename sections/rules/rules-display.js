/**
 * Rules Display Module
 *
 * Contains display/rendering methods for the Rules class:
 * - displayRules - Main entry point for displaying detector list
 * - renderDetectorsPage - Renders detector cards for current page
 * - setupDetectorCardListeners - Sets up click event listeners
 *
 * These methods are added to the Rules prototype and use `this` to access
 * the Rules instance properties (detectorManager, paginationManager, etc.)
 */

// ============================================
// Main Display Method
// ============================================

/**
 * Display rules (main entry point)
 * @param {{keepPage?: boolean}} [options] - keepPage: the same list drawn again after something changed in it (a rule deleted or
 *   reset): stay on the page that was shown (the last one if it is gone) instead of going back to page 1
 */
Rules.prototype.displayRules = async function({ keepPage = false } = {}) {
  Logger.debug('UI', 'displayRules called');

  if (!this.initialized) {
    await this.initialize();
  }

  const rulesList = document.querySelector('#rulesList');
  const detectorsEmpty = document.querySelector('#detectorsEmpty');

  if (!rulesList) {
    Logger.error('UI', 'Rules list element not found - HTML may not be loaded yet');
    return;
  }

  Logger.debug('UI', 'Rules list found:', rulesList);

  const detectors = this.detectorManager.getAllDetectors();

  if (!detectors || Object.keys(detectors).length === 0) {
    if (detectorsEmpty) {
      detectorsEmpty.style.display = 'block';
    }
    if (rulesList) {
      rulesList.innerHTML = '';
    }
    this.allDetectors = [];
    this.filteredDetectors = [];
    this.syncFilterUi(0);
    return;
  }

  if (detectorsEmpty) {
    detectorsEmpty.style.display = 'none';
  }

  this.allDetectors = [];
  for (const [category, categoryDetectors] of Object.entries(detectors)) {
    if (!categoryDetectors || Object.keys(categoryDetectors).length === 0) continue;

    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
      const detectorWithDefaults = {
        ...detector,
        // The legacy English default name shows in the UI language
        displayName: this.getDetectorDisplayName(detector.name) || detectorName,
        detection: detector.detection || {}
      };

      this.allDetectors.push({
        category,
        detectorName,
        detector: detectorWithDefaults
      });
    }
  }

  // Sort by: enabled status, then the category order chosen in Settings →
  // Detection order (the one the Detection list and History use), then date
  // (newest first), then name
  let categoryOrder = [...Categories.KEYS];
  try {
    const settings = await Utils.getSettings();
    categoryOrder = DetectionUtils.detectionSortOf(settings && settings.detection).categoryOrder;
  } catch (_) { /* keep the default order */ }
  const categoryRank = (category) => {
    const index = categoryOrder.indexOf(DetectionUtils.categoryKey(category));
    return index === -1 ? categoryOrder.length : index;
  };

  this.allDetectors.sort((a, b) => {
    const aEnabled = a.detector.enabled !== false;
    const bEnabled = b.detector.enabled !== false;
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;

    const aPriority = categoryRank(a.category);
    const bPriority = categoryRank(b.category);
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aTimestamp = this.getSortTimestamp(a.detector.lastUpdated);
    const bTimestamp = this.getSortTimestamp(b.detector.lastUpdated);
    if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp;

    const aName = (a.detector.displayName || a.detectorName || '').toLowerCase();
    const bName = (b.detector.displayName || b.detectorName || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  // Keep the text in the search box and the chips applied after a delete / restore / clear
  const query = document.querySelector('#rulesSearch')?.value || '';
  if ((query.trim() || RulesFilter.isActive(this.activeChips)) && typeof this.handleSearch === 'function') {
    this.handleSearch(query, { keepPage });
    return;
  }

  this.filteredDetectors = [...this.allDetectors];

  if (this.paginationManager) {
    this.paginationManager.setItems(this.filteredDetectors, { keepPage });
  }
  this.syncFilterUi();
};

/**
 * Where a rule comes from, decided once for the card (its tip and its Edited tag) and for the Custom and Edited chips, so
 * a chip keeps exactly the cards that show the mark.
 *   an official rule: one Scrapfly ships (a bundled id with the reserved author); anything else is custom
 *   an edited rule: an official rule the person changed, not only translated
 */
Rules.prototype.isOfficialRule = function(detectorName, detector) {
  const author = typeof detector.author === 'string' ? detector.author.trim() : '';
  return typeof DetectionUtils !== 'undefined' && !!DetectionUtils.isOfficialDetector
    && DetectionUtils.isOfficialDetector({ id: detector.id || detectorName, author });
};

Rules.prototype.isEditedRule = function(detector) {
  return typeof DetectorManager !== 'undefined' && typeof DetectorManager.isUserEdited === 'function'
    ? DetectorManager.isUserEdited(detector) : !!(detector.userModified && detector.officialSnapshot);
};

/**
 * The chip row and the no-matches message follow the list: the row hides while there are no rules, each chip shows whether it
 * is on, a category chip carries its category icon in the colour chosen in Settings, and the message with Clear filters
 * shows when the search and the chips leave nothing of rules that exist.
 * @param {number} [total] - how many rules there are (default: the ones the list holds)
 */
Rules.prototype.syncFilterUi = function(total = Array.isArray(this.allDetectors) ? this.allDetectors.length : 0) {
  const row = document.querySelector('#rulesFilters');
  if (row) {
    row.hidden = total === 0;
    const chips = RulesFilter.normalizeChips(this.activeChips);
    row.querySelectorAll('.history-filter-chip').forEach((chip) => {
      const key = chip.dataset.filter;
      const on = RulesFilter.FLAGS.includes(key) ? chips[key] === true : chips.categories.includes(key);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!chip.dataset.category) return;
      const holder = chip.querySelector('.category-icon');
      if (holder && !holder.firstChild) holder.innerHTML = FormatUtils.categoryIconSvg(key);
      const colour = this.categoryManager?.getCategoryInfo?.(key)?.colour || FormatUtils.DEFAULT_CATEGORY_COLORS[key];
      if (colour) chip.style.setProperty('--chip-color', colour);
    });
  }
  const none = document.querySelector('#rulesNoResults');
  if (none) none.hidden = !(total > 0 && Array.isArray(this.filteredDetectors) && this.filteredDetectors.length === 0);
  this.syncResultsStatus();
};

/**
 * Say, to a screen reader, what the search, the chips and the pager leave: the pager's own line ("Showing 1-2 of 5") while there are
 * rules to list, the no-results line when there are rules and none match, nothing when there are no rules (the empty state speaks for
 * itself). A list drawn again is silent to a screen reader, and a block that is shown with its text (the no-results one) is not
 * announced, so the words go to a status region that is always in the page. Written only when they change, so the same list drawn
 * again says nothing again.
 */
Rules.prototype.syncResultsStatus = function() {
  const status = document.querySelector('#rulesResultsStatus');
  if (!status) return;
  const total = Array.isArray(this.allDetectors) ? this.allDetectors.length : 0;
  const nothing = total > 0 && Array.isArray(this.filteredDetectors) && this.filteredDetectors.length === 0;
  const words = (selector) => {
    const element = document.querySelector(selector);
    return element && typeof element.textContent === 'string' ? element.textContent.trim() : '';
  };
  const text = total === 0 ? '' : words(nothing ? '#rulesNoResults p' : '#rulesPagination .pagination-info');
  if (status.textContent !== text) status.textContent = text;
};

/**
 * Where a card is in the list as drawn now, read before the list is drawn again (delete, reset to official), for restoreListFocus.
 * @param {string} category
 * @param {string} detectorName - the rule's id
 * @returns {{category: string, detectorName: string, index: number, page: number}}
 */
Rules.prototype.listPlaceOf = function(category, detectorName) {
  const cards = Array.from(document.querySelectorAll('#rulesList .detector-card'));
  const index = cards.findIndex(card => card.dataset.category === category && card.dataset.detectorId === detectorName);
  return { category, detectorName, index: Math.max(index, 0), page: this.paginationManager ? this.paginationManager.currentPage : 1 };
};

/**
 * Put the focus back after the list was drawn again: the button that had it went with the old cards, and the next Tab would start at
 * the top of the popup. It goes to the "More actions" button of the same rule if it is still listed (reset to official), else of the
 * card that took its place (the one before it when it was the last of the page), else, with no card left, to the way out of an empty
 * list: Clear filters when the search or the chips emptied it, Add when there are no rules at all. Nothing moves if the person
 * already put the focus somewhere else.
 * @param {{category: string, detectorName: string, index: number, page: number}} place - from listPlaceOf
 */
Rules.prototype.restoreListFocus = function(place) {
  const active = document.activeElement;
  const list = document.querySelector('#rulesList');
  if (active && active !== document.body && !(list && list.contains(active))) return;
  const cards = Array.from(document.querySelectorAll('#rulesList .detector-card'));
  const same = place && cards.find(card => card.dataset.category === place.category && card.dataset.detectorId === place.detectorName);
  // The only card of the last page was deleted: the page went with it, and the card before it is the last of the page shown now
  const pageGone = !!(place && this.paginationManager && this.paginationManager.currentPage < place.page);
  const card = same || cards[pageGone ? cards.length - 1 : Math.min(place ? place.index : 0, cards.length - 1)];
  const noResults = document.querySelector('#rulesNoResults');
  const target = card
    ? card.querySelector('.rules-menu-trigger')
    : (noResults && !noResults.hidden && document.querySelector('#rulesClearFilters')) || document.querySelector('#addDetectorBtn');
  if (target && typeof target.focus === 'function') target.focus();
};

// ============================================
// Page Rendering Methods
// ============================================

/**
 * Render detectors for current page
 * @param {Array} detectors - Detectors to render for current page
 */
Rules.prototype.renderDetectorsPage = function(detectors) {
  const rulesList = document.querySelector('#rulesList');
  if (!rulesList) return;

  let rulesHtml = '';

  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (_t && _t.get(key)) || fallback;
  const editTitle = FormatUtils.escapeAttr(_tr('ruleModalActionEdit', 'Edit'));
  const moreTitle = FormatUtils.escapeAttr(_tr('rulesMoreActions', 'More actions'));
  const deleteLabel = FormatUtils.escapeHtml(_tr('btnDelete', 'Delete'));
  const deleteTitle = FormatUtils.escapeAttr(_tr('deleteDetectorTitle', 'Delete detector'));
  const exportLabel = FormatUtils.escapeHtml(_tr('btnExport', 'Export'));
  const duplicateLabel = FormatUtils.escapeHtml(_tr('rulesDuplicate', 'Duplicate'));

  detectors.forEach(({ category, detectorName, detector }) => {
    const detectorIcon = this.getDetectorIcon(detector, category);
    const categoryInfo = this.categoryManager.getCategoryInfo(category);
    const categoryColor = categoryInfo?.colour || '#3b82f6';

    const detectionMethods = this.getDetectionMethods(detector);
    const formattedLastUpdated = this.formatLastUpdated(detector.lastUpdated);
    const categoryLabel = this.getCategoryLabel(category);

    // A colour from an imported settings file may be #abc, #abcd or #rrggbbaa: the badge's tint reads the red, green and blue of any
    const catHex = String(categoryColor).replace('#', '').replace(/^([a-f\d])([a-f\d])([a-f\d])[a-f\d]?$/i, '$1$1$2$2$3$3').slice(0, 6);
    const catRgb = FormatUtils.hexToRgb(catHex) || { r: 59, g: 130, b: 246 };
    const catR = catRgb.r;
    const catG = catRgb.g;
    const catB = catRgb.b;

    const categoryBadge = `<span class="method-tag category-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.48);">${FormatUtils.escapeHtml(categoryLabel)}</span>`;

    const isDisabled = detector.enabled === false;
    const authorText = typeof detector.author === 'string' ? detector.author.trim() : '';
    const versionAuthor = FormatUtils.escapeHtml(detector.version || '1.0') +
      (authorText ? ` | ${FormatUtils.escapeHtml(authorText)}` : '');
    // Hover tips on the footer: version/author with official or custom, and the full update date
    const official = this.isOfficialRule(detectorName, detector);
    const methodLists = Object.values(detector.detection || {}).filter(rules => Array.isArray(rules) && rules.length > 0);
    const patternCount = methodLists.reduce((sum, rules) => sum + rules.length, 0);
    const comboCount = Array.isArray(detector.combinations) ? detector.combinations.length : 0;
    const versionTip = FormatUtils.tipAttrs(
      `${_tr('ruleFieldVersion', 'Version')} ${detector.version || '1.0'}${authorText ? ` \u00b7 ${authorText}` : ''}`,
      official ? _tr('tipOfficialDetector', 'Official Scrapfly detector') : _tr('tipCustomDetector', 'Custom detector'),
      [
        { label: _tr('ruleSectionDetectionMethods', 'Detection Methods'), value: String(methodLists.length) },
        { label: _tr('tipPatterns', 'Patterns'), value: String(patternCount) },
        ...(comboCount ? [{ label: _tr('ruleSectionCombinations', 'Combinations'), value: String(comboCount) }] : [])
      ]);
    const updatedTip = FormatUtils.tipAttrs(_tr('tipLastUpdated', 'Updated'),
      detector.lastUpdated ? String(detector.lastUpdated).slice(0, 10) : '');
    // An official rule the user changed (not only translated): marked on the
    // card, and the menu can put the official version back
    const edited = this.isEditedRule(detector);
    const editedBadge = edited
      ? `<span class="method-tag rule-edited-tag" ${FormatUtils.tipAttrs(_tr('ruleEditedTag', 'Edited'), _tr('tipRuleEdited', 'You edited this official rule. Updates ask before replacing your changes.'))}>${FormatUtils.escapeHtml(_tr('ruleEditedTag', 'Edited'))}</span>`
      : '';
    const resetItem = edited
      ? `<button class="rules-menu-item reset-official-btn" role="menuitem" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                      <span>${FormatUtils.escapeHtml(_tr('resetToOfficial', 'Reset to official'))}</span>
                    </button>`
      : '';
    const fileItems = `<button class="rules-menu-item duplicate-detector-btn" role="menuitem" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                      <span>${duplicateLabel}</span>
                    </button>
                    <button class="rules-menu-item export-detector-btn" role="menuitem" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                      <span>${exportLabel}</span>
                    </button>`;
    const deleteItem = `<button class="rules-menu-item rules-menu-item-danger delete-btn" role="menuitem" title="${deleteTitle}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      <span>${deleteLabel}</span>
                    </button>`;
    rulesHtml += `
      <div class="detector-card ${isDisabled ? 'detector-disabled' : ''}" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
        <div class="detector-header">
          <div class="detector-icon">${detectorIcon}</div>
          <div class="detector-info">
            <div class="detector-name-row">
              <div class="detector-name">${FormatUtils.escapeHtml(detector.displayName)}</div>
              <div class="detector-actions" data-stop-propagation="true">
                <button type="button" class="edit-btn" title="${editTitle}" aria-label="${editTitle}" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M16.25 4.25a2.47 2.47 0 0 1 3.5 3.5L8 19.5l-4.5 1 1-4.5Z"/>
                    <path d="m14.75 5.75 3.5 3.5"/>
                  </svg>
                </button>
                <div class="rules-menu">
                  <button class="rules-menu-trigger detector-more-btn" aria-haspopup="menu" aria-expanded="false" title="${moreTitle}" aria-label="${moreTitle}">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6,10.25A1.75,1.75 0 1,1 6,13.75A1.75,1.75 0 1,1 6,10.25M12,10.25A1.75,1.75 0 1,1 12,13.75A1.75,1.75 0 1,1 12,10.25M18,10.25A1.75,1.75 0 1,1 18,13.75A1.75,1.75 0 1,1 18,10.25Z" fill="currentColor"/>
                    </svg>
                  </button>
                  <div class="rules-menu-list" role="menu">
                    ${fileItems}
                    ${resetItem}
                    ${deleteItem}
                  </div>
                </div>
              </div>
            </div>
            <div class="detection-methods">
              ${categoryBadge}
              ${editedBadge}
            </div>
          </div>
        </div>
        <div class="detector-scripts">
          <div class="detection-methods">
            ${detectionMethods}
          </div>
          <div class="scripts-info">
            <div class="scripts-info-left">
              <span class="last-updated-value" ${updatedTip}>${formattedLastUpdated}</span>
              <span class="scripts-info-sep" aria-hidden="true">&bull;</span>
              <span class="version-author" ${versionTip}>${versionAuthor}</span>
            </div>
            <label class="toggle-switch-small" data-stop-propagation="true">
              <input type="checkbox" class="detector-toggle"
                     aria-label="${FormatUtils.escapeAttr(detectorName)}"
                     data-detector="${FormatUtils.escapeAttr(detectorName)}"
                     data-category="${FormatUtils.escapeAttr(category)}"
                     ${detector.enabled !== false ? 'checked' : ''}>
              <span class="toggle-slider-small"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  });

  rulesList.innerHTML = rulesHtml;

  // CSP-compliant: event delegation for stopPropagation and image fallback
  rulesList.querySelectorAll('[data-stop-propagation]').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  rulesList.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', function() {
      this.src = this.dataset.fallback;
    }, { once: true });
  });

  this.setupDetectorCardListeners(detectors);
};

// ============================================
// Event Listener Setup
// ============================================

/**
 * Setup event listeners for detector cards
 * @param {Array} detectors - Array of detectors for current page
 */
Rules.prototype.setupDetectorCardListeners = function(detectors) {
  const rulesList = document.querySelector('#rulesList');
  if (!rulesList) return;

  const detectorCards = rulesList.querySelectorAll('.detector-card');
  detectorCards.forEach((card, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.detector-actions') && !e.target.closest('.method-tag') && !e.target.closest('.toggle-switch-small')) {
          const detectorToEdit = {
            ...detector,
            detection: detector.detection || {}
          };
          this.openEditModal(detectorToEdit, category, detectorName, false);
        }
      });

      card.style.cursor = 'pointer';
    }
  });

  const editButtons = rulesList.querySelectorAll('.edit-btn');
  editButtons.forEach((btn, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const detectorToEdit = {
          ...detector,
          detection: detector.detection || {}
        };
        this.openEditModal(detectorToEdit, category, detectorName, false);
      });
    }
  });

  rulesList.querySelectorAll('.reset-official-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      const detectorName = btn.dataset.detectorId;
      const entry = detectors.find(d => d.category === category && d.detectorName === detectorName);
      await this.handleResetToOfficial(category, detectorName, entry?.detector?.displayName || detectorName);
    });
  });

  rulesList.querySelectorAll('.duplicate-detector-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleDuplicateDetector(btn.dataset.category, btn.dataset.detectorId);
    });
  });

  rulesList.querySelectorAll('.export-detector-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      const detectorName = btn.dataset.detectorId;
      const entry = detectors.find(d => d.category === category && d.detectorName === detectorName);
      this.handleExportDetector(category, detectorName, entry?.detector?.displayName || detectorName);
    });
  });

  const deleteButtons = rulesList.querySelectorAll('.delete-btn');
  deleteButtons.forEach((btn, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.getAttribute('aria-disabled') === 'true') return;
        await this.handleDeleteDetector(category, detectorName, detector.displayName || detectorName);
      });
    }
  });
};
