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
        const currentIconContainer = document.querySelector('.current-icon');
        if (currentIconContainer) {
          if (e.target.value.toLowerCase() === 'fingerprint') {
            currentIconContainer.classList.add('fingerprint-icon');
          } else {
            currentIconContainer.classList.remove('fingerprint-icon');
          }
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

    // Change Icon button
    const changeIconBtn = document.querySelector('.change-icon-btn');
    if (changeIconBtn) {
      changeIconBtn.addEventListener('click', () => this.openIconPicker());
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
