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
      this.fillAdvancedInfoCaptchas(modal);
      modal.style.display = 'flex';
      // CSS fadeIn animation handles the fade-in effect automatically
    }
  };


  /**
   * The CAPTCHAs described as data (captcha-vendors.js) join the hand-written
   * entries in the Captcha group, sorted by name; both groups count their items.
   */
Advanced.prototype.fillAdvancedInfoCaptchas = function(modal) {
    const list = modal.querySelector('.advanced-info-group-head.is-captcha + .advanced-info-list');
    const vendors = (typeof AdvancedCaptchaVendors !== 'undefined' && AdvancedCaptchaVendors.list) || [];
    if (list && !list.dataset.generated) {
      list.dataset.generated = 'true';
      const esc = FormatUtils.escapeHtml;
      const tr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
      const html = vendors.map(vendor => `
          <div class="advanced-info-item">
            <div class="advanced-info-item-icon"><img src="detectors/icons/${esc(vendor.logo)}" alt="" width="32" height="32"></div>
            <div class="advanced-info-item-content">
              <div class="advanced-info-item-title">${esc(vendor.productName)}</div>
              <div class="advanced-info-item-desc">${esc(tr(vendor.infoKey, vendor.siteKey ? 'Extracts the site key and analyzes its scripts' : 'Analyzes its scripts'))}</div>
            </div>
          </div>`).join('');
      list.insertAdjacentHTML('beforeend', html);
      const items = Array.from(list.querySelectorAll(':scope > .advanced-info-item'));
      items.sort((a, b) => a.querySelector('.advanced-info-item-title').textContent.trim()
        .localeCompare(b.querySelector('.advanced-info-item-title').textContent.trim(), undefined, { sensitivity: 'base' }));
      items.forEach(item => list.appendChild(item));
    }
    modal.querySelectorAll('.advanced-info-group').forEach(group => {
      const count = group.querySelector('.advanced-info-group-count');
      if (count) count.textContent = String(group.querySelectorAll('.advanced-info-list > .advanced-info-item').length);
    });
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