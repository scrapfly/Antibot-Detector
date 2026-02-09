/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

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

          if (normalizedIcon.endsWith('.png') || normalizedIcon.endsWith('.jpg') || normalizedIcon.endsWith('.jpeg') || normalizedIcon.endsWith('.svg') || normalizedIcon.endsWith('.webp')) {
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
  };
