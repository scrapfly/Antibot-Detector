function normalizeCookieHeaderScope(scope, fallback) {
  const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
  if (normalized === 'all_with_storage') return 'all';
  if (normalized === 'storage') return fallback;
  if (normalized === 'request' || normalized === 'response' || normalized === 'all') return normalized;
  return fallback;
}

class Rules {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.categoryManager = detectorManager.getCategoryManager();
    this.initialized = false;
    this.eventListenersSetup = false;
    this.paginationManager = null;
    this.colorManager = null;
    this.allDetectors = [];
    this.filteredDetectors = [];
  }

  /**
   * Initialize rules section
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      // Keep WINDOW condition dropdowns aligned with the shared condition language (no duplicated lists).
      this.refreshWindowConditionWizardDropdown();
      this.setupPagination();
      this.initializeColorManager();
      this.setupEventListeners();
      this.initialized = true;
    }
  }

  /**
   * Refresh the WINDOW helper modal condition dropdown menu content.
   * The base HTML provides a minimal fallback, but we prefer the shared condition language presets.
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/rules/rules.html'));
      const html = await response.text();

      const rulesTab = document.querySelector('#rulesTab');
      if (rulesTab) {
        rulesTab.innerHTML = html;
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load rules HTML:', error);
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('rulesPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectorsPage(items);
      }
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search functionality
    const searchInput = document.querySelector('#rulesSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Button event listeners
    this.setupButtonListeners();

    // Modal functionality
    this.setupModalEventListeners();

    // Toggle switches - handle enable/disable
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('detector-toggle')) {
        const toggle = e.target;
        const detectorName = toggle.dataset.detector;
        const category = toggle.dataset.category;
        const enabled = toggle.checked;

        if (detectorName && category) {
          this.updateDetectorEnabledState(category, detectorName, enabled);
        }
      }
    });
  }

  /**
   * Setup button event listeners
   */
  setupButtonListeners() {
    // Import button
    const importBtn = document.querySelector('#importRulesBtn');
    const importFile = document.querySelector('#importRulesFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }

    // Export button
    const exportBtn = document.querySelector('#exportRulesBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }

    // Clear button
    const clearBtn = document.querySelector('#clearRulesBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.handleClear());
    }

    // Add button
    const addBtn = document.querySelector('#addDetectorBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.handleAddDetector());
    }

    // Update button - checks for updates or applies pending ones
    const checkUpdatesBtn = document.querySelector('#checkUpdatesBtn');
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener('click', () => this.handleCheckUpdates());
    }

    // Check for pending updates on load (shows badge if any)
    this.checkPendingUpdates();
  }

  /**
   * Initialize color manager
   */
  initializeColorManager() {
    this.colorManager = new ColorManager();
    this.colorManager.initialize({
      onColorSelect: (color) => {
        Logger.ui('Color selected:', color);
        // Note: Colors are managed by CategoryManager in Settings, not stored per detector
      },
      onColorChange: (color) => {
        Logger.ui('Color changed:', color);
      }
    });
  }

  /**
   * Setup modal event listeners
   */
  getCategoryIcon(category) {
    return this.categoryManager.getCategoryIcon(category);
  }

  async updateDetectorEnabledState(category, detectorName, enabled) {
    try {
      // Get the detector
      const detector = this.detectorManager.getDetector(category, detectorName);
      if (detector) {
        // Update enabled state
        detector.enabled = enabled;

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        // CRITICAL: Notify background.js to reload detectors
        // This ensures JS hooks use the updated enabled state on next page load
        chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
          Logger.ui(`Detectors reloaded in background after ${enabled ? 'enabling' : 'disabling'} ${detectorName}:`, response);
        });

        Logger.ui(`Detector ${detectorName} ${enabled ? 'enabled' : 'disabled'}`);

        // Update the visual appearance immediately
        const detectorCard = document.querySelector(`[data-detector-id="${detectorName}"][data-category="${category}"]`);
        if (detectorCard) {
          if (enabled) {
            detectorCard.classList.remove('detector-disabled');
          } else {
            detectorCard.classList.add('detector-disabled');
          }
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to update detector enabled state:', error);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rules;
} else if (typeof window !== 'undefined') {
  window.Rules = Rules;
}
