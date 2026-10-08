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
    if (this.eventListenersSetup) {
      return;
    }

    this.eventListenersSetup = true;

    // Search functionality
    const searchInput = document.querySelector('#rulesSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Button event listeners
    this.setupButtonListeners();

    // "More" menus (toolbar and per-card)
    this.setupMenuListeners();

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

    // Restore deleted official detectors
    const restoreBtn = document.querySelector('#restoreOfficialRulesBtn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => this.handleRestoreOfficial());
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
   * Setup the "more" (…) menus: the toolbar menu holding Import/Export/Clear
   * and the per-card menu (Export, Reset, Delete). Listens in the capture phase because
   * card actions stop click propagation before it reaches the document.
   */
  setupMenuListeners() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('#rulesTab .rules-menu-trigger');
      if (trigger) {
        const menu = trigger.closest('.rules-menu');
        const wasOpen = menu.classList.contains('open');
        this.closeMenus();
        if (!wasOpen) this.openMenu(menu);
        return;
      }
      // Any other click (including picking an item) closes open menus
      this.closeMenus();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenus();
    });

    // A fixed-position menu would drift away from its trigger on scroll
    const rulesList = document.querySelector('#rulesList');
    if (rulesList) {
      rulesList.addEventListener('scroll', () => this.closeMenus());
    }
  }

  /**
   * Open a menu, anchored under its trigger (or above it near the bottom edge)
   * @param {HTMLElement} menu - The .rules-menu container
   */
  openMenu(menu) {
    const trigger = menu.querySelector('.rules-menu-trigger');
    const list = menu.querySelector('.rules-menu-list');
    if (!trigger || !list) return;

    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');

    const rect = trigger.getBoundingClientRect();
    const listHeight = list.offsetHeight;
    const gap = 4;
    const openUp = rect.bottom + gap + listHeight > window.innerHeight && rect.top - gap - listHeight > 0;

    list.style.top = `${openUp ? rect.top - gap - listHeight : rect.bottom + gap}px`;
    list.style.left = `${Math.max(8, rect.right - list.offsetWidth)}px`;
  }

  /**
   * Close every open rules menu
   */
  closeMenus() {
    document.querySelectorAll('#rulesTab .rules-menu.open').forEach(menu => {
      menu.classList.remove('open');
      const trigger = menu.querySelector('.rules-menu-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Initialize color manager
   */
  initializeColorManager() {
    this.colorManager = new ColorManager();
    this.colorManager.initialize({
      onColorSelect: (color) => {
        Logger.debug('UI', 'Color selected:', color);
        // Note: Colors are managed by CategoryManager in Settings, not stored per detector
      },
      onColorChange: (color) => {
        Logger.debug('UI', 'Color changed:', color);
      }
    });
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
          Logger.debug('UI', `Detectors reloaded in background after ${enabled ? 'enabling' : 'disabling'} ${detectorName}:`, response);
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

if (typeof window !== 'undefined') {
  window.Rules = Rules;
}
