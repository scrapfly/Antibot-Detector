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
    // Rules changed elsewhere (an update in the background): show them
    detectorManager.onExternalChange = () => { if (this.initialized) this.displayRules(); };
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
    if (this.initialized) return;
    // A second call while the first is still loading the tab's markup (the tab clicked twice) waits for it: a second load
    // would replace the markup the first one set its listeners on
    if (!this._initializing) {
      this._initializing = (async () => {
        await this.loadHTML();
        // Keep WINDOW condition dropdowns aligned with the shared condition language (no duplicated lists).
        this.refreshWindowConditionWizardDropdown();
        this.setupPagination();
        this.initializeColorManager();
        this.setupEventListeners();
        this.initialized = true;
      })().finally(() => { this._initializing = null; });
    }
    return this._initializing;
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

    document.addEventListener('keydown', (e) => this.handleMenuKey(e));

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
    // The keyboard goes into the menu (arrow keys move, Escape comes back to the button), as in the Detection tab's Copy menu
    const first = this.menuItems(list)[0];
    if (first) first.focus({ preventScroll: true });
  }

  /** The entries of an open menu the keyboard can reach. */
  menuItems(list) {
    return Array.from(list.querySelectorAll('.rules-menu-item')).filter(el => !el.hidden && !el.disabled);
  }

  /**
   * Arrow keys, Home and End inside the open menu; Tab leaves it (the focus goes back to its button first, so the next Tab stop
   * is the one after the button); Escape closes it from anywhere.
   * @param {KeyboardEvent} event
   */
  handleMenuKey(event) {
    const open = document.querySelector('#rulesTab .rules-menu.open');
    if (!open) return;
    if (event.key === 'Escape') { this.closeMenus(true); return; }
    const list = open.querySelector('.rules-menu-list');
    if (!list || !list.contains(document.activeElement)) return;
    if (event.key === 'Tab') { this.closeMenus(true); return; }
    const items = this.menuItems(list);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1].focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }

  /**
   * Close every open rules menu. The focus returns to the button of the menu it was in (or of the one that was open, when asked),
   * so it is not left on an element that just disappeared.
   * @param {boolean} [returnFocus] - Move the focus to the button even if it was elsewhere
   */
  closeMenus(returnFocus = false) {
    let focusTarget = null;
    document.querySelectorAll('#rulesTab .rules-menu.open').forEach(menu => {
      const trigger = menu.querySelector('.rules-menu-trigger');
      if (returnFocus === true || menu.contains(document.activeElement)) focusTarget = trigger;
      menu.classList.remove('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    // preventScroll: a list that scrolled (which closes the menu) is not scrolled back to the button
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
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
    const detector = this.detectorManager.getDetector(category, detectorName);
    try {
      if (detector) {
        // Update enabled state
        detector.enabled = enabled;

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        // CRITICAL: Notify background.js to reload detectors
        // This ensures JS hooks use the updated enabled state on next page load
        chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, (response) => {
          Logger.debug('UI', `Detectors reloaded in background after ${enabled ? 'enabling' : 'disabling'} ${detectorName}:`, response);
        });

        Logger.ui(`Detector ${detectorName} ${enabled ? 'enabled' : 'disabled'}`);

        // Update the visual appearance immediately
        const detectorCard = document.querySelector(`[data-detector-id="${CSS.escape(detectorName)}"][data-category="${CSS.escape(category)}"]`);
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
      // Not saved: the switch and the rule go back, so what the card shows is what reopening it shows
      if (detector) detector.enabled = !enabled;
      const toggle = document.querySelector(`.detector-toggle[data-detector="${CSS.escape(detectorName)}"][data-category="${CSS.escape(category)}"]`);
      if (toggle) toggle.checked = !enabled;
      const message = (typeof I18n !== 'undefined' && I18n.get('rulesToggleSaveFailed')) || 'Could not save the change. Try again.';
      if (typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.error === 'function') NotificationHelper.error(message);
    }
  }
}

if (typeof window !== 'undefined') {
  window.Rules = Rules;
}
