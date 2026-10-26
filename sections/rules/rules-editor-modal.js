/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.setCurrentDetectorIconSourceClass = function(sourceType = 'default') {
    const iconImg = document.querySelector('#currentDetectorIcon');
    if (!iconImg) return;

    iconImg.classList.remove(
      'fingerprint-icon-image',
      'fingerprint-icon-image--builtin',
      'fingerprint-icon-image--custom',
      'fingerprint-icon-image--default'
    );

    iconImg.classList.add('fingerprint-icon-image');
    if (sourceType === 'custom') {
      iconImg.classList.add('fingerprint-icon-image--custom');
      return;
    }
    if (sourceType === 'builtin') {
      iconImg.classList.add('fingerprint-icon-image--builtin');
      return;
    }
    iconImg.classList.add('fingerprint-icon-image--default');
  };

Rules.prototype.openEditModal = function(detector, category, detectorName, isNew = false) {
    const modal = document.querySelector('#editRuleModal');

    if (!modal) return;
    this.ruleEditorEdited = false;

    // Ensure detector has detection property before storing
    const detectorWithDetection = {
      ...JSON.parse(JSON.stringify(detector)),
      detection: JSON.parse(JSON.stringify(detector.detection || {}))
    };

    // Store current detector data BEFORE populating modal
    // Explicitly set isNew based on the parameter, not previous state
    this.currentEditDetector = {
      detector: detectorWithDetection,
      category,
      originalCategory: category,
      detectorName,
      isNew: isNew,
      // The rule as it was before this edit: becomes the official snapshot
      // when an official detector is edited
      original: isNew || typeof DetectorManager === 'undefined' ? null : DetectorManager.cleanDetectorCopy(detector)
    };

    // Set dynamic title based on whether it's a new detector
    // One format key per action ("Add {0}" / "Edit {0}") so every language can
    // order the words itself. A new detector has no stored name yet: it shows
    // the default name in the UI language, like the name field below.
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const shownName = this.getEditorDetectorName(detectorWithDetection) || detectorName;
    const titleKey = this.currentEditDetector.isNew ? 'rulesUiAddDetectorTitleFmt' : 'rulesUiEditDetectorTitleFmt';
    const titleFallback = this.currentEditDetector.isNew ? `Add ${shownName}` : `Edit ${shownName}`;
    const actionEl = document.querySelector('#editRuleModalAction');
    const nameEl = document.querySelector('#editRuleModalName');
    if (actionEl) actionEl.textContent = (_t && _t.format(titleKey, shownName)) || titleFallback;
    if (nameEl) {
      nameEl.textContent = (_t && typeof _t.tr === 'function')
        ? _t.tr('rulesModalDetectorLabel', 'Detection Rule')
        : 'Detection Rule';
    }

    // Populate modal with detector data (now currentEditDetector is available)
    this.populateModalData(detectorWithDetection);

    // Store snapshot of detection AFTER populating form (includes defaults from form)
    // This ensures comparison matches what save will produce
    this.currentEditDetector.originalDetection = this._collectDetectionFromForm();
    // The editor as it opened: closing asks before dropping anything that differs from it (isRuleEditorDirty)
    try {
      this.ruleEditorSnapshot = this.ruleEditorFingerprint();
    } catch (error) {
      this.ruleEditorSnapshot = null; // falls back to "anything typed"
      Logger.debug('UI', 'Rule editor snapshot failed', error);
    }

    // Detection methods and Combinations start folded, with their counts in the header; a rule with no pattern yet
    // opens on its patterns, since there is nothing to hide
    this.setupEditorCardToggles();
    const patternTotal = Object.values(detectorWithDetection.detection || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    this.setEditorCardOpen('detectionMethodsBody', patternTotal === 0);
    this.setEditorCardOpen('combinationsBody', false);
    this.setEditorCardOpen('ruleHistoryCheckBody', false);
    this.setEditorCardOpen('ruleLiveTestBody', false);

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    // Start every open at the top (the body kept the previous rule's scroll)
    const modalBody = modal.querySelector('.rule-modal-body');
    if (modalBody) modalBody.scrollTop = 0;
  };

/** The editor cards that fold, by the id of their body. */
Rules.EDITOR_FOLDING_CARDS = Object.freeze({
  detectionMethodsBody: { card: 'detectionMethodsCard', summary: 'detectionMethodsSummary' },
  combinationsBody: { card: 'combinationsCard', summary: 'combinationsSummary' },
  ruleHistoryCheckBody: { card: 'ruleHistoryCheckCard' },
  ruleLiveTestBody: { card: 'ruleLiveTestCard' }
});

/** A click on a folding card's header (or its arrow button) opens or closes it; bound once. */
Rules.prototype.setupEditorCardToggles = function() {
    if (this._editorCardTogglesBound || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    this._editorCardTogglesBound = true;
    document.querySelectorAll('.modal-card-header--toggle').forEach((header) => {
      header.addEventListener('click', () => {
        const bodyId = header.dataset.cardBody;
        const body = document.getElementById(bodyId);
        if (body) this.setEditorCardOpen(bodyId, body.hidden);
      });
    });
  };

/** Open or close a folding card; Detection methods and Combinations show in the header how much they hold. */
Rules.prototype.setEditorCardOpen = function(bodyId, open) {
    const parts = Rules.EDITOR_FOLDING_CARDS[bodyId];
    const body = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById(bodyId) : null;
    if (!parts || !body) return;
    body.hidden = !open;
    document.getElementById(parts.card)?.classList.toggle('is-open', !!open);
    const button = document.querySelector(`.card-toggle-btn[aria-controls="${bodyId}"]`);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.updateEditorCardSummaries();
  };

/** Open the folding card that holds an element (a field Save points at, a combination to fix). */
Rules.prototype.revealEditorCard = function(element) {
    const body = element && typeof element.closest === 'function' ? element.closest('#detectionMethodsBody, #combinationsBody, #ruleHistoryCheckBody, #ruleLiveTestBody') : null;
    if (body && body.hidden) this.setEditorCardOpen(body.id, true);
  };

/** The counts in the folded headers: the rule's patterns, and its combinations. */
Rules.prototype.updateEditorCardSummaries = function() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.querySelectorAll !== 'function') return;
    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const patterns = document.querySelectorAll('#detectionMethodsContainer .method-item').length;
    const methods = document.getElementById('detectionMethodsSummary');
    if (methods) {
      methods.textContent = patterns === 1
        ? ((_t && _t.tr('methodOnePattern', '1 pattern')) || '1 pattern')
        : ((_t && _t.format('methodPatternsFmt', patterns)) || `${patterns} patterns`);
    }
    const combos = document.getElementById('combinationsSummary');
    if (combos) {
      // "4 combinations", like the patterns card's "4 patterns", not a bare number
      const count = Array.isArray(this.combinationsModel) ? this.combinationsModel.length : 0;
      combos.textContent = count === 1
        ? ((_t && _t.tr('combinationOneCount', '1 combination')) || '1 combination')
        : ((_t && _t.format('combinationsCountFmt', count)) || `${count} combinations`);
    }
  };

/**
 * Name shown in the editor (title and name field): the stored name, with the
 * legacy English default and a new detector's missing name both shown as the
 * default name in the UI language.
 * @param {object} detector - Detector being edited
 * @returns {string}
 */
Rules.prototype.getEditorDetectorName = function(detector) {
    const stored = detector?.name || detector?.displayName || '';
    if (stored) return this.getDetectorDisplayName(stored);
    return this.currentEditDetector?.isNew ? this.getDefaultDetectorName() : '';
  };

Rules.prototype.closeEditModal = function() {
    if (this.savingRule) return;
    const modal = document.querySelector('#editRuleModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
      this.currentEditDetector = null;
      this.ruleEditorSnapshot = null;
    }
  };

/**
 * What Save would store from the editor as it stands: name, category, difficulty, author, icon, description and its
 * translations, the patterns with their settings, and the combinations. Taken on open and compared on close, so any
 * change counts (a pattern deleted, Method Settings saved, an icon chosen, Translate), and undoing it does not.
 * @returns {string}
 */
Rules.prototype.ruleEditorFingerprint = function() {
    const edit = this.currentEditDetector;
    if (!edit || typeof document === 'undefined') return '';
    const value = (selector) => {
      const field = document.querySelector(selector);
      return field ? field.value : null;
    };
    const description = typeof this.collectDetectorDescription === 'function' && document.querySelector('#detectorDescriptionInput')
      ? this.collectDetectorDescription() : null;
    const combinations = typeof this.buildCombinationsForSave === 'function'
      ? this.buildCombinationsForSave(null, { validate: false }).combinations : null;
    return JSON.stringify({
      name: value('#detectorNameInput'),
      category: value('#detectorCategorySelect'),
      difficulty: value('#detectorDifficultySelect'),
      author: value('#detectorAuthorInput'),
      icon: edit.detector?.icon ?? null,
      customIcon: edit.customIcon || edit.detector?.customIcon || null,
      description,
      detection: this._collectDetectionFromForm(),
      combinations
    });
  };

/** True when the open editor holds something its Save would store and that was not there when it opened. */
Rules.prototype.isRuleEditorDirty = function() {
    if (!this.currentEditDetector) return false;
    if (typeof this.ruleEditorSnapshot !== 'string' || !this.ruleEditorSnapshot) return this.ruleEditorEdited === true;
    try {
      return this.ruleEditorFingerprint() !== this.ruleEditorSnapshot;
    } catch (error) {
      Logger.debug('UI', 'Rule editor dirty check failed', error);
      return true;
    }
  };

/**
 * ✕, Escape and a click outside the editor: with changes, ask before dropping them.
 * @returns {Promise<boolean>} whether the editor closed
 */
Rules.prototype.requestCloseEditModal = async function() {
    if (this.savingRule || this._ruleEditorCloseAsking || !this.currentEditDetector) return false;
    if (this.isRuleEditorDirty() && typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.confirm === 'function') {
      const text = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
      this._ruleEditorCloseAsking = true;
      let discard = false;
      try {
        discard = await NotificationHelper.confirm({
          title: text('ruleEditorDiscardTitle', 'Discard your changes?'),
          message: text('ruleEditorDiscardMessage', 'This rule has changes that are not saved yet.'),
          type: 'warning', tone: 'danger',
          confirmText: text('ruleEditorDiscardConfirm', 'Discard'), cancelText: text('btnCancel', 'Cancel')
        });
      } finally {
        this._ruleEditorCloseAsking = false;
      }
      if (!discard) return false;
    }
    this.closeEditModal();
    return true;
  };

Rules.prototype.populateModalData = function(detector) {
    // Populate detector information fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');
    const difficultySelect = document.querySelector('#detectorDifficultySelect');
    const versionInput = document.querySelector('#detectorVersionInput');
    const iconImg = document.querySelector('#currentDetectorIcon');
    const category = this.currentEditDetector?.category || detector.category || 'antibot';

    if (nameInput) {
      nameInput.value = this.getEditorDetectorName(detector);
    }

    // The detector's own description and its translations
    if (typeof this.renderDetectorDescription === 'function') {
      this.renderDetectorDescription(detector);
    }

    if (categorySelect) {
      Logger.debug('UI', 'Setting category:', category); // Debug log
      categorySelect.value = category;
    }
    // Category-dependent hints in the editor (JS hooks: Fingerprint rules only)
    document.querySelector('#editRuleModal')?.setAttribute('data-category', String(category).toLowerCase());

    if (difficultySelect) {
      const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
        ? DetectionUtils.normalizeDifficulty(detector.difficulty)
        : null;
      const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
        ? DetectionUtils.defaultDifficultyForCategory(category)
        : 'Medium';
      difficultySelect.value = normalizedDifficulty || defaultDifficulty;
    }

    if (versionInput) {
      versionInput.value = detector.version || '1.0';
      versionInput.setAttribute('readonly', 'readonly');
      versionInput.classList.add('form-input-readonly');
    }

    if (iconImg) {
      iconImg.alt = (typeof I18n !== 'undefined' && I18n.get('ruleFieldIcon')) || 'Icon';

      // Default Scrapfly icon fallback
      const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
      const currentIconContainer = iconImg.parentElement;
      const isFingerprintCategory = (category || '').toLowerCase() === 'fingerprint';
      let iconSourceType = 'default';

      // Add fingerprint-icon class for fingerprint category
      if (currentIconContainer) {
        if (isFingerprintCategory) {
          currentIconContainer.classList.add('fingerprint-icon');
        } else {
          currentIconContainer.classList.remove('fingerprint-icon');
        }
      }

      // Set error handler to fallback to Scrapfly icon
      iconImg.onerror = () => {
        iconImg.onerror = null;
        iconImg.src = scrapflyIcon;
      };

      // Check for custom icon first
      if (typeof detector.customIcon === 'string' && detector.customIcon) {
        iconImg.src = detector.customIcon;
        iconSourceType = 'custom';
      } else if (typeof detector.icon !== 'string' || !detector.icon || detector.icon === 'default') {
        // Use Scrapfly icon for default or when no icon is set
        iconImg.src = scrapflyIcon;
        iconSourceType = 'default';
      } else if (detector.icon) {
        // Handle different icon types
        if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
          iconImg.src = detector.icon;
          iconSourceType = 'builtin';
        } else {
          const normalizedIcon = detector.icon.trim().toLowerCase();

          if (normalizedIcon.endsWith('.png') || normalizedIcon.endsWith('.jpg') || normalizedIcon.endsWith('.jpeg') || normalizedIcon.endsWith('.svg') || normalizedIcon.endsWith('.webp')) {
            iconImg.src = chrome.runtime.getURL(`detectors/icons/${detector.icon}`);
            iconSourceType = normalizedIcon.includes('_fingerprint.') ? 'builtin' : 'default';
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
            iconSourceType = 'default';
          }
        }
      } else {
        // No icon specified, use Scrapfly icon
        iconImg.src = scrapflyIcon;
        iconSourceType = 'default';
      }

      if (isFingerprintCategory) {
        this.setCurrentDetectorIconSourceClass(iconSourceType);
      } else {
        iconImg.classList.remove(
          'fingerprint-icon-image',
          'fingerprint-icon-image--builtin',
          'fingerprint-icon-image--custom',
          'fingerprint-icon-image--default'
        );
      }
    }

    // Populate author field (editable for every detector). Official (shipped)
    // detectors show their author; custom rules can't use the reserved name,
    // so a legacy "scrapfly" default starts empty.
    const authorInput = document.querySelector('#detectorAuthorInput');
    const isOfficial = !this.currentEditDetector?.isNew && DetectionUtils.isOfficialDetector(detector);
    if (this.currentEditDetector) this.currentEditDetector.isOfficial = isOfficial;
    this.clearAuthorError();

    if (authorInput) {
      const author = typeof detector.author === 'string' ? detector.author.trim() : '';
      authorInput.value = (!isOfficial && DetectionUtils.isReservedAuthor(author)) ? '' : author;
      authorInput.oninput = () => this.clearAuthorError();
    }

    // Set badge color using CategoryManager (colors come from Settings, not detector objects)
    if (this.colorManager && this.categoryManager) {
      const category = this.currentEditDetector?.category || 'antibot';
      const colorToSet = this.categoryManager.getCategoryColor(category) || '#3b82f6'; // Default to blue if no color
      Logger.debug('UI', 'Loading category color:', detector.name, 'Category:', category, 'Color:', colorToSet);
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

    // Populate detection methods, then the combinations that refer to them
    this.populateDetectionMethods(detector);
    this.initCombinationsEditor(detector);
    if (typeof this.resetHistoryCheck === 'function') this.resetHistoryCheck();
    if (typeof this.resetLiveTest === 'function') this.resetLiveTest();
    if (typeof this.resetTranslateBar === 'function') {
      this.resetTranslateBar();
      this.refreshTranslateBar();
    }
  };

Rules.prototype.clearAuthorError = function() {
    const authorInput = document.querySelector('#detectorAuthorInput');
    const authorError = document.querySelector('#detectorAuthorError');
    if (authorInput) {
      authorInput.classList.remove('form-input-invalid');
      authorInput.removeAttribute('aria-invalid');
    }
    if (authorError) {
      authorError.textContent = '';
      authorError.hidden = true;
    }
  };

Rules.prototype.showAuthorError = function(message) {
    const authorInput = document.querySelector('#detectorAuthorInput');
    const authorError = document.querySelector('#detectorAuthorError');
    if (authorInput) {
      authorInput.classList.add('form-input-invalid');
      authorInput.setAttribute('aria-invalid', 'true');
      authorInput.focus();
    }
    if (authorError) {
      authorError.textContent = message;
      authorError.hidden = false;
    }
  };
