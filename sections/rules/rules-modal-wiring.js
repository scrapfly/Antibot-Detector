/**
 * Rules extension methods - Modal event listener wiring.
 * Dependencies: rules.js, rules-modal-lifecycle.js, all modal/helper files
 */

Rules.prototype.setupModalEventListeners = function() {
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
        const isFingerprint = e.target.value.toLowerCase() === 'fingerprint';
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
    this.setupRegexHelperModal();
    this.setupWholeWordHelperModal();
    this.setupCaseSensitiveHelperModal();
    this.setupExplanationModals();
    this.setupMethodHelpModal();

    // Setup HTTP method color for network request modal dropdown
    const networkMethod = document.querySelector('#networkMethod');
    if (networkMethod) {
      this.updateHttpMethodColor(networkMethod);
      networkMethod.addEventListener('change', () => this.updateHttpMethodColor(networkMethod));
    }
  };
