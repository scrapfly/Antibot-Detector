/**
 * Icon Picker Modal Module
 *
 * Contains methods for the icon picker modal:
 * - openIconPicker - Opens the icon selection dialog
 * - selectIcon - Handles icon selection
 * - uploadCustomIcon - Handles custom icon upload
 *
 * These methods are added to the Rules prototype.
 */

// ============================================
// Icon Picker Modal
// ============================================

/**
 * Open icon picker dialog
 */
Rules.prototype.openIconPicker = function() {
  // Remove any existing icon picker modal first (prevents stacking)
  const existingModal = document.querySelector('.icon-picker-modal');
  if (existingModal?.parentElement) {
    existingModal.parentElement.remove();
  }

  // List of available icons
  // Fingerprint SVG icons with blue styling
  const fingerprintSvgIcons = {
    'audio_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>',
    'battery_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2M14 11v2"/></svg>',
    'canvas_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h4l2-3 2 6 2-3h2"/></svg>',
    'clipboard_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    'crypto_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>',
    'css_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 3h16l-1.5 15L12 21l-6.5-3L4 3z"/><path d="M8 8h8M7 12h6"/></svg>',
    'font_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
    'gamepads_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4"/><circle cx="17" cy="10" r="1"/><circle cx="15" cy="14" r="1"/></svg>',
    'geolocation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    'hardware_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/></svg>',
    'indexeddb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    'media_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M10 9l5 3-5 3z"/></svg>',
    'navigator_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
    'orientation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
    'performance_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    'screen_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    'storage_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>',
    'timezone_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    'usb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M7 7l5 5 5-5"/><circle cx="12" cy="16" r="2"/><path d="M12 18v4"/><path d="M6 12v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3"/></svg>',
    'webgl_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    'webrtc_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14v-4z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>'
  };

  const availableIcons = [
    // Official brand icons
    'akamai_official.png',
    'aws_official.png',
    'cloudflare_official.png',
    'datadome_official.png',
    'f5_official.png',
    'funcaptcha_official.png',
    'geetest_official.png',
    'hcaptcha_official.png',
    'imperva_official.png',
    'perimeterx_official.png',
    'reblaze_official.png',
    'recaptcha_official.png',
    'shape_security_official.png',
    'sucuri_official.png',
    // Fingerprint icons
    'audio_fingerprint.png',
    'battery_fingerprint.png',
    'canvas_fingerprint.png',
    'clipboard_fingerprint.png',
    'crypto_fingerprint.png',
    'css_fingerprint.png',
    'font_fingerprint.png',
    'gamepads_fingerprint.png',
    'geolocation_fingerprint.png',
    'hardware_fingerprint.png',
    'indexeddb_fingerprint.png',
    'media_fingerprint.png',
    'navigator_fingerprint.png',
    'orientation_fingerprint.png',
    'performance_fingerprint.png',
    'screen_fingerprint.png',
    'storage_fingerprint.png',
    'timezone_fingerprint.png',
    'usb_fingerprint.png',
    'webgl_fingerprint.png',
    'webrtc_fingerprint.png'
  ];

  // Helper to check if icon is fingerprint type
  const isFingerprint = (icon) => icon.includes('_fingerprint.png');

  // Create modal HTML with Default option first, then Custom, then others
  const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
  const modalHtml = `
    <div class="icon-picker-modal rule-modal">
      <div class="icon-picker-backdrop rule-modal-backdrop"></div>
      <div class="icon-picker-content rule-modal-content">
        <div class="icon-picker-header rule-modal-header">
          <h2>Choose Icon</h2>
          <button class="icon-picker-close rule-modal-close" aria-label="Close icon picker" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div class="icon-picker-body rule-modal-body">
          <div class="icon-grid">
            ${[
              { icon: 'default', label: 'Default', image: scrapflyIcon, className: 'icon-option icon-option-default icon-option-special', isFingerprint: false },
              ...availableIcons.map(icon => ({ icon, label: icon.replace('_official.png', '').replace('_fingerprint.png', '').replace('.png', ''), image: chrome.runtime.getURL('detectors/icons/' + icon), className: 'icon-option', isFingerprint: isFingerprint(icon), svg: fingerprintSvgIcons[icon] }))
            ].map(({ icon, label, image, className, isFingerprint: isFp, svg }) => `
              <div class="${className}" data-icon="${icon}">
                ${isFp ? `<div class="icon-option-fingerprint-preview fingerprint-icon fingerprint-icon-shell">${svg}</div>` : `<img src="${image}" alt="${label}" class="icon-option-image ${icon === 'default' ? 'icon-option-image-default' : ''}">`}
                <div class="icon-option-label">${label}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="icon-picker-footer rule-modal-footer">
          <button id="uploadCustomIcon" class="icon-picker-upload-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Custom
          </button>
          <button id="cancelIconPicker" class="icon-picker-cancel-btn rule-btn rule-btn-cancel" type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;

  // Add modal to page
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);

  const editBackdrop = document.querySelector('#editRuleModal .rule-modal-backdrop');
  const previousEditBackdropVisibility = editBackdrop ? editBackdrop.style.visibility : '';
  if (editBackdrop) {
    editBackdrop.style.visibility = 'hidden';
  }

  let isClosed = false;
  const closeModal = () => {
    if (isClosed) return;
    isClosed = true;
    if (editBackdrop) {
      editBackdrop.style.visibility = previousEditBackdropVisibility;
    }
    modalContainer.remove();
  };

  // Add click handlers
  const iconOptions = modalContainer.querySelectorAll('.icon-option');
  iconOptions.forEach(option => {
    option.addEventListener('click', () => {
      const iconName = option.dataset.icon;

      if (iconName === 'default') {
        // Handle default icon - set to null or 'default'
        this.selectIcon('default');
      } else {
        // Handle regular icon selection
        this.selectIcon(iconName);
      }
      closeModal();
    });
  });

  // Upload custom icon button
  const uploadBtn = modalContainer.querySelector('#uploadCustomIcon');
  uploadBtn.addEventListener('click', () => {
    closeModal();
    this.uploadCustomIcon();
  });

  // Cancel button
  const cancelBtn = modalContainer.querySelector('#cancelIconPicker');
  cancelBtn.addEventListener('click', () => {
    closeModal();
  });

  // Close on backdrop click
  const backdrop = modalContainer.querySelector('.icon-picker-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => closeModal());
  }

  // Close button
  const closeBtn = modalContainer.querySelector('.icon-picker-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal());
  }
};

/**
 * Select an icon from the available icons
 */
Rules.prototype.selectIcon = function(iconName) {
  // Update current icon display in modal
  const currentIcon = document.querySelector('#currentDetectorIcon');
  if (currentIcon) {
    const isFingerprintCategory = (this.currentEditDetector?.category || '').toLowerCase() === 'fingerprint';
    let iconSourceType = 'default';

    if (iconName === 'default') {
      // Use Scrapfly icon for default
      currentIcon.src = chrome.runtime.getURL('icons/icon128.png');
      iconSourceType = 'default';
    } else {
      currentIcon.src = chrome.runtime.getURL('detectors/icons/' + iconName);
      iconSourceType = iconName.toLowerCase().includes('_fingerprint.') ? 'builtin' : 'default';
    }

    if (isFingerprintCategory) {
      this.setCurrentDetectorIconSourceClass?.(iconSourceType);
    } else {
      currentIcon.classList.remove(
        'fingerprint-icon-image',
        'fingerprint-icon-image--builtin',
        'fingerprint-icon-image--custom',
        'fingerprint-icon-image--default'
      );
    }
  }

  // Store the icon in the detector
  if (this.currentEditDetector) {
    if (iconName === 'default') {
      // Set icon to 'default' or remove it entirely
      this.currentEditDetector.detector.icon = 'default';
    } else {
      this.currentEditDetector.detector.icon = iconName;
    }
    // Remove custom icon if one was set
    delete this.currentEditDetector.detector.customIcon;
    delete this.currentEditDetector.customIcon;
  }
};

/**
 * Upload a custom icon file
 */
Rules.prototype.uploadCustomIcon = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (limit to 100KB)
      if (file.size > 100 * 1024) {
        NotificationHelper.error('Icon file size must be less than 100KB');
        return;
      }

      // Read file as data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;

        // Update current icon display in modal
        const currentIcon = document.querySelector('#currentDetectorIcon');
        if (currentIcon) {
          currentIcon.src = dataUrl;
          const isFingerprintCategory = (this.currentEditDetector?.category || '').toLowerCase() === 'fingerprint';
          if (isFingerprintCategory) {
            this.setCurrentDetectorIconSourceClass?.('custom');
          } else {
            currentIcon.classList.remove(
              'fingerprint-icon-image',
              'fingerprint-icon-image--builtin',
              'fingerprint-icon-image--custom',
              'fingerprint-icon-image--default'
            );
          }
        }

        // Store the new icon data URL in the detector
        if (this.currentEditDetector) {
          this.currentEditDetector.customIcon = dataUrl;
          this.currentEditDetector.detector.customIcon = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  input.click();
};
