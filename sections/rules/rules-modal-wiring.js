/**
 * Rules extension methods - Modal event listener wiring.
 * Dependencies: rules.js, rules-modal-lifecycle.js, all modal/helper files
 */

/**
 * Escape closes the top-most rule dialog: Method Settings over the editor, else the editor (through the same
 * dirty check as ✕). The helpers, the icon picker, the colour dialog and confirmations above them handle their own.
 */
Rules.prototype.onRuleEditorEscape = function(event) {
  if (!event || event.key !== 'Escape' || event.defaultPrevented) return false;
  const shown = (element) => !!element && !!element.style && element.style.display !== 'none' && element.style.display !== '';
  if (document.querySelector('.notification-confirm[data-open="true"], .icon-picker-modal')) return false;
  if ([...document.querySelectorAll('.rh-modal, #advancedColorModal')].some(shown)) return false;
  if (shown(document.querySelector('#methodSettingsModal'))) {
    event.preventDefault();
    this.closeMethodSettingsModal();
    return true;
  }
  if (shown(document.querySelector('#editRuleModal')) && this.currentEditDetector) {
    event.preventDefault();
    this.requestCloseEditModal();
    return true;
  }
  return false;
};

Rules.prototype.setupModalEventListeners = function() {
    // Close modal events
    const closeBtn = document.querySelector('#closeRuleModal');
    const cancelBtn = document.querySelector('#cancelRuleEdit');
    const backdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');

    // ✕, Escape and a click outside the editor are easy to make by accident: with changes they ask before dropping
    // them (requestCloseEditModal compares the editor with how it opened). Cancel says it already.
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.requestCloseEditModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeEditModal());
    }
    const editModal = document.querySelector('#editRuleModal');
    if (editModal) {
      // Only the fallback when the editor's snapshot could not be taken
      const markEdited = () => { this.ruleEditorEdited = true; };
      editModal.addEventListener('input', markEdited);
      editModal.addEventListener('change', markEdited);
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.requestCloseEditModal());
    }
    if (!this._ruleEditorEscapeBound) {
      this._ruleEditorEscapeBound = true;
      document.addEventListener('keydown', (event) => this.onRuleEditorEscape(event));
    }

    // Check against History
    const checkBtn = document.querySelector('#ruleHistoryCheckBtn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => this.runHistoryCheck());
    }

    // Test on this page
    const liveTestBtn = document.querySelector('#ruleLiveTestBtn');
    if (liveTestBtn) {
      liveTestBtn.addEventListener('click', () => this.runLiveTest());
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
        const isFingerprint = e.target.value.toLowerCase() === 'fingerprint';
        document.querySelector('#editRuleModal')?.setAttribute('data-category', e.target.value.toLowerCase());
        document.querySelectorAll('.current-icon, .icon-preview').forEach(currentIconContainer => {
          if (isFingerprint) {
            currentIconContainer.classList.add('fingerprint-icon');
          } else {
            currentIconContainer.classList.remove('fingerprint-icon');
          }
        });

        const iconImg = document.querySelector('#currentDetectorIcon');
        if (!iconImg) return;

        if (isFingerprint) {
          if (
            !iconImg.classList.contains('fingerprint-icon-image--builtin') &&
            !iconImg.classList.contains('fingerprint-icon-image--custom') &&
            !iconImg.classList.contains('fingerprint-icon-image--default')
          ) {
            this.setCurrentDetectorIconSourceClass?.('default');
          }
        } else {
          iconImg.classList.remove(
            'fingerprint-icon-image',
            'fingerprint-icon-image--builtin',
            'fingerprint-icon-image--custom',
            'fingerprint-icon-image--default'
          );
        }
      });
    }

    // Description typed on a new pattern row: the same value Settings → Description edits
    document.addEventListener('input', (event) => {
      const input = event.target.closest?.('.method-description-inline');
      const item = input?.closest('.method-item');
      if (item) item.dataset.description = input.value.replace(/\s+/g, ' ').trim();
    });

    // Method helper modal for all detection types (event delegation)
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.method-help-btn[data-method-help]');
      if (button) {
        event.stopPropagation();
        this.openMethodHelpModal(button.dataset.methodHelp);
      }
    });

    // Icon picker trigger (icon preview button)
    const iconPickerTrigger = document.querySelector('#openIconPickerBtn');
    if (iconPickerTrigger) {
      iconPickerTrigger.addEventListener('click', () => this.openIconPicker());
    }

    // Setup all modals
    this.setupMethodSettingsModal();
    this.setupDomHelperModal();
    this.setupWindowHelperModal();
    this.setupPatternTesterModal();
    this.setupMethodHelpModal();
  };
