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
 */
Rules.prototype.displayRules = async function() {
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

  // Sort by: enabled status, then date (newest first), then category priority
  const categoryPriority = { antibot: 0, captcha: 1, fingerprint: 2 };

  this.allDetectors.sort((a, b) => {
    const aEnabled = a.detector.enabled !== false;
    const bEnabled = b.detector.enabled !== false;
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;

    const aTimestamp = this.getSortTimestamp(a.detector.lastUpdated);
    const bTimestamp = this.getSortTimestamp(b.detector.lastUpdated);
    if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp;

    const aPriority = categoryPriority[a.category] ?? 99;
    const bPriority = categoryPriority[b.category] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aName = (a.detector.displayName || a.detectorName || '').toLowerCase();
    const bName = (b.detector.displayName || b.detectorName || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  // Keep the text in the search box applied after a delete / restore / clear
  const query = document.querySelector('#rulesSearch')?.value || '';
  if (query.trim() && typeof this.handleSearch === 'function') {
    this.handleSearch(query);
    return;
  }

  this.filteredDetectors = [...this.allDetectors];

  if (this.paginationManager) {
    this.paginationManager.setItems(this.filteredDetectors);
  }
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

  detectors.forEach(({ category, detectorName, detector }) => {
    const detectorIcon = this.getDetectorIcon(detector, category);
    const categoryInfo = this.categoryManager.getCategoryInfo(category);
    const categoryColor = categoryInfo?.colour || '#3b82f6';

    const detectionMethods = this.getDetectionMethods(detector);
    const formattedLastUpdated = this.formatLastUpdated(detector.lastUpdated);
    const categoryLabel = this.getCategoryLabel(category);

    const catHex = categoryColor.replace('#', '');
    const catR = parseInt(catHex.substring(0, 2), 16);
    const catG = parseInt(catHex.substring(2, 4), 16);
    const catB = parseInt(catHex.substring(4, 6), 16);

    const categoryBadge = `<span class="method-tag category-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.48);">${FormatUtils.escapeHtml(categoryLabel)}</span>`;

    const isDisabled = detector.enabled === false;
    const authorText = typeof detector.author === 'string' ? detector.author.trim() : '';
    const versionAuthor = FormatUtils.escapeHtml(detector.version || '1.0') +
      (authorText ? ` | ${FormatUtils.escapeHtml(authorText)}` : '');
    // Hover tips on the footer: version/author with official or custom, and the full update date
    const official = typeof DetectionUtils !== 'undefined' && DetectionUtils.isOfficialDetector
      && DetectionUtils.isOfficialDetector({ id: detector.id || detectorName, author: authorText });
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
    // An official rule the user changed: marked on the card, and the menu
    // can put the official version back
    const edited = !!(detector.userModified && detector.officialSnapshot);
    const editedBadge = edited
      ? `<span class="method-tag rule-edited-tag" ${FormatUtils.tipAttrs(_tr('ruleEditedTag', 'Edited'), _tr('tipRuleEdited', 'You edited this official rule. Updates ask before replacing your changes.'))}>${FormatUtils.escapeHtml(_tr('ruleEditedTag', 'Edited'))}</span>`
      : '';
    const resetItem = edited
      ? `<button class="rules-menu-item reset-official-btn" role="menuitem" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                      <span>${FormatUtils.escapeHtml(_tr('resetToOfficial', 'Reset to official'))}</span>
                    </button>`
      : '';
    const fileItems = `<button class="rules-menu-item export-detector-btn" role="menuitem" data-detector-id="${FormatUtils.escapeAttr(detectorName)}" data-category="${FormatUtils.escapeAttr(category)}">
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

  rulesList.querySelectorAll('.reset-official-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      const detectorName = btn.dataset.detectorId;
      const entry = detectors.find(d => d.category === category && d.detectorName === detectorName);
      await this.handleResetToOfficial(category, detectorName, entry?.detector?.displayName || detectorName);
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
