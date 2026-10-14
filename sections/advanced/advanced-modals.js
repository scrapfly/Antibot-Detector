  /**
   * Open Advanced Info Modal
   */
Advanced.prototype.openAdvancedInfoModal = function() {
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      // Category icons as in the other views, in each category's colour (Settings)
      if (typeof FormatUtils !== 'undefined') {
        modal.querySelectorAll('[data-category-icon]').forEach((el) => {
          const key = el.dataset.categoryIcon;
          el.innerHTML = FormatUtils.categoryIconSvg(key);
          const manager = (typeof window !== 'undefined' && window.popupInstance?.detectorManager) || null;
          el.style.color = manager?.getCategoryInfo?.(key)?.colour || FormatUtils.DEFAULT_CATEGORY_COLORS[key] || '';
        });
      }
      modal.style.display = 'flex';
      // CSS fadeIn animation handles the fade-in effect automatically
    }
  };


  /**
   * Close Advanced Info Modal
   */
Advanced.prototype.closeAdvancedInfoModal = function() {
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      modal.style.display = 'none';
      // Reset opacity for next open (CSS fadeIn animation handles the fade in)
      modal.style.opacity = '1';
    }
  };


  /**
   * Setup Advanced Info Modal event listeners
   */
Advanced.prototype.setupAdvancedInfoModalListeners = function() {
    // Help icon (? button) in empty state - opens info modal
    const helpIcon = document.querySelector('.empty-state-help');
    if (helpIcon) {
      helpIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAdvancedInfoModal();
      });
    }

    // Close button
    const closeBtn = document.querySelector('#closeAdvancedInfoModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        e.preventDefault(); // Prevent default button behavior
        this.closeAdvancedInfoModal();
      });
    }

    // Overlay click to close (only when clicking overlay itself, not children)
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        // Only close if clicking the modal background, not the container
        if (e.target === modal || e.target.classList.contains('advanced-info-overlay')) {
          this.closeAdvancedInfoModal();
        }
      });
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.querySelector('#advancedInfoModal');
        if (modal && modal.style.display === 'flex') {
          this.closeAdvancedInfoModal();
        }
      }
    });
  };