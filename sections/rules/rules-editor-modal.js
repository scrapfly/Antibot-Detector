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

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    // Start every open at the top (the body kept the previous rule's scroll)
    const modalBody = modal.querySelector('.rule-modal-body');
    if (modalBody) modalBody.scrollTop = 0;
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
    const modal = document.querySelector('#editRuleModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
      this.currentEditDetector = null;
    }
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

    if (categorySelect) {
      Logger.debug('UI', 'Setting category:', category); // Debug log
      categorySelect.value = category;
    }

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
      if (detector.customIcon) {
        iconImg.src = detector.customIcon;
        iconSourceType = 'custom';
      } else if (!detector.icon || detector.icon === 'default') {
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
