class Advanced {
  static AVAILABLE_MODULES = AdvancedVendorRegistry.modules;
  static REQUEST_TTL_MS = 60000;
  static requestedTools = null;

  /**
   * Localised "<product> Tools" label for a module entry. The product name
   * itself is never translated.
   * @param {{productName:string}} moduleInfo - Entry from AVAILABLE_MODULES
   * @returns {string}
   */
  static toolsDisplayName(moduleInfo) {
    const name = (moduleInfo && moduleInfo.productName) || '';
    return (typeof I18n !== 'undefined' && I18n.format('advPanelToolsNameFmt', name)) || `${name} Tools`;
  }

  /**
   * Detection details → Open tools: the protection whose tools the Advanced tab opens on next, for a minute at most (the tab is
   * drawn after the popup switches to it, so the request waits here until then).
   * @param {string} detectorId
   * @param {number} [now]
   */
  static requestTools(detectorId, now = Date.now()) {
    Advanced.requestedTools = typeof detectorId === 'string' && detectorId ? { detectorId, at: now } : null;
  }

  /** The protection asked for, once, or null when none was or the request is older than a minute. */
  static takeRequestedTools(now = Date.now()) {
    const request = Advanced.requestedTools;
    Advanced.requestedTools = null;
    return request && now - request.at >= 0 && now - request.at < Advanced.REQUEST_TTL_MS ? request.detectorId : null;
  }

  constructor(detectorManager, detectionSection) {
    this.detectorManager = detectorManager;
    this.detectionSection = detectionSection;
    this.loadedModules = {};
    this.currentTab = null;
    this.selectedDetection = null;
    this.availableDetectionTools = [];
    this.cachedDetectionResults = []; // Cache detection results for reliable access
  }


  /**
   * Initialize advanced section
   */
  async initialize() {
    if (this.initialized) return;
    // The tab clicked twice while the template loads must not set the watcher up twice
    if (!this._initializing) {
      this._initializing = (async () => {
        await this.loadHTML();
        // The History badge follows every change to the saved captures
        if (typeof this.setupCaptureHistoryWatcher === 'function') this.setupCaptureHistoryWatcher();
        // Once: the template and the document-level listeners are set up here, the tab's content is drawn per open
        this.initialized = true;
        Logger.debug('UI', 'Advanced section initialized');
      })().finally(() => { this._initializing = null; });
    }
    return this._initializing;
  }


  /**
   * Load HTML template into advanced tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/advanced/advanced.html'));
      const html = await response.text();

      const advancedTab = document.querySelector('#advancedTab');
      if (advancedTab) {
        advancedTab.innerHTML = html;
        // Setup modal listeners after HTML is loaded
        this.setupAdvancedInfoModalListeners();
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load advanced HTML:', error);
    }
  }
}

if (typeof window !== 'undefined') {
  window.Advanced = Advanced;
}
