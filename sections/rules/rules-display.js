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
  Logger.ui('displayRules called');

  // Ensure HTML is loaded
  if (!this.initialized) {
    await this.initialize();
  }

  const rulesList = document.querySelector('#rulesList');
  const detectorsEmpty = document.querySelector('#detectorsEmpty');

  if (!rulesList) {
    Logger.error('UI', 'Rules list element not found - HTML may not be loaded yet');
    return;
  }

  Logger.ui('Rules list found:', rulesList);

  const detectors = this.detectorManager.getAllDetectors();

  if (!detectors || Object.keys(detectors).length === 0) {
    // Show empty state
    if (detectorsEmpty) {
      detectorsEmpty.style.display = 'block';
    }
    if (rulesList) {
      rulesList.innerHTML = '';
    }
    return;
  }

  // Hide empty state
  if (detectorsEmpty) {
    detectorsEmpty.style.display = 'none';
  }

  // Flatten detectors from all categories into a single array
  this.allDetectors = [];
  for (const [category, categoryDetectors] of Object.entries(detectors)) {
    if (!categoryDetectors || Object.keys(categoryDetectors).length === 0) continue;

    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
      // Ensure detector has detection property
      const detectorWithDefaults = {
        ...detector,
        displayName: detector.name || detectorName,
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

  // Sort detectors:
  // 1. Enabled detectors first, disabled last
  // 2. Within each group, sort by lastUpdated (newest first)
  const categoryPriority = {
    antibot: 0,
    captcha: 1,
    fingerprint: 2
  };

  this.allDetectors.sort((a, b) => {
    // First, sort by enabled status (enabled first)
    const aEnabled = a.detector.enabled !== false;
    const bEnabled = b.detector.enabled !== false;
    if (aEnabled !== bEnabled) {
      return aEnabled ? -1 : 1;
    }

    // Then sort by lastUpdated (newest first)
    const aTimestamp = this.getSortTimestamp(a.detector.lastUpdated);
    const bTimestamp = this.getSortTimestamp(b.detector.lastUpdated);

    if (aTimestamp !== bTimestamp) {
      return bTimestamp - aTimestamp;
    }

    // When dates are equal, prioritize by category order: antibot → captcha → fingerprint
    const aPriority = categoryPriority[a.category] ?? 99;
    const bPriority = categoryPriority[b.category] ?? 99;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Final fallback: alphabetical by display name
    const aName = (a.detector.displayName || a.detectorName || '').toLowerCase();
    const bName = (b.detector.displayName || b.detectorName || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  this.filteredDetectors = [...this.allDetectors];

  // Setup pagination with all detectors
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

  detectors.forEach(({ category, detectorName, detector }) => {
    const detectorIcon = this.getDetectorIcon(detector);
    const categoryInfo = this.categoryManager.getCategoryInfo(category);
    const categoryColor = categoryInfo?.colour || '#3b82f6';

    // Get detection methods from detector data
    const detectionMethods = this.getDetectionMethods(detector);

    const formattedLastUpdated = this.formatLastUpdated(detector.lastUpdated);

    // Get category method badges with dynamic colors
    const categoryMethod = this.getCategoryMethod(category);

    // Parse category color to RGB for muted style
    const catHex = categoryColor.replace('#', '');
    const catR = parseInt(catHex.substring(0, 2), 16);
    const catG = parseInt(catHex.substring(2, 4), 16);
    const catB = parseInt(catHex.substring(4, 6), 16);

    // Create category badge with muted style
    const categoryBadge = `<span class="method-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.35);">${categoryMethod}</span>`;

    // Create the detector badge with muted style
    const detectorBadge = `<span class="method-tag" style="background: rgba(${catR}, ${catG}, ${catB}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${catR}, ${catG}, ${catB}, 0.35);">${detector.displayName}</span>`;

    const topBadges = `${categoryBadge}${detectorBadge}`;

    // Add disabled class if detector is disabled
    const isDisabled = detector.enabled === false;
    rulesHtml += `
      <div class="detector-card ${isDisabled ? 'detector-disabled' : ''}" data-detector-id="${detectorName}" data-category="${category}">
        <div class="detector-header">
          <div class="detector-icon">${detectorIcon}</div>
          <div class="detector-info">
            <div class="detector-name-row">
              <div class="detector-name">${detector.displayName}</div>
              <div class="detector-actions" data-stop-propagation="true">
                <button class="edit-btn" title="Edit Detector" data-detector-id="${detectorName}" data-category="${category}">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25zM20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="delete-btn" title="Delete Detector">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="detection-methods">
              ${topBadges}
            </div>
          </div>
        </div>
        <div class="detector-scripts">
          <div class="detection-methods">
            ${detectionMethods}
          </div>
          <div class="scripts-info">
            <div class="scripts-info-left">
              <div class="last-updated">
                <span class="last-updated-value">${formattedLastUpdated}</span>
              </div>
              <div class="detector-author">
                <span class="version-author">${detector.version || '1.0'} | ${detector.author || 'scrapfly'}</span>
                ${(detector.author || 'scrapfly').toLowerCase() === 'scrapfly' ? '<i class="fas fa-check-circle verified-badge" title="Official Scrapfly detector"></i>' : ''}
              </div>
            </div>
            <label class="toggle-switch-small" data-stop-propagation="true">
              <input type="checkbox" class="detector-toggle"
                     data-detector="${detectorName}"
                     data-category="${category}"
                     ${detector.enabled !== false ? 'checked' : ''}>
              <span class="toggle-slider-small"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  });

  rulesList.innerHTML = rulesHtml;

  // CSP-compliant stopPropagation handling
  rulesList.querySelectorAll('[data-stop-propagation]').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  // CSP-compliant image error fallback
  rulesList.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', function() {
      this.src = this.dataset.fallback;
    }, { once: true });
  });

  // Add click event listeners to detector cards and edit buttons
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
  // Add click listeners to detector cards
  const detectorCards = document.querySelectorAll('.detector-card');
  detectorCards.forEach((card, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];

      // Click on card to edit
      card.addEventListener('click', (e) => {
        // Don't open modal if clicking on action buttons, method badges, or toggle switch
        if (!e.target.closest('.detector-actions') && !e.target.closest('.method-tag') && !e.target.closest('.toggle-switch-small')) {
          // Pass the detector ensuring it has detection property
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

      // Add hover effect
      card.style.cursor = 'pointer';
    }
  });

  // Add click listeners to edit buttons
  const editButtons = document.querySelectorAll('.edit-btn');
  editButtons.forEach((btn, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Pass the detector ensuring it has detection property
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

  // Add click listeners to delete buttons
  const deleteButtons = document.querySelectorAll('.delete-btn');
  deleteButtons.forEach((btn, index) => {
    if (detectors[index]) {
      const { category, detectorName, detector } = detectors[index];
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.handleDeleteDetector(category, detectorName, detector.displayName || detectorName);
      });
    }
  });
};
