class Advanced {
  static AVAILABLE_MODULES = AdvancedVendorRegistry.modules;

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
    await this.loadHTML();
    // The History badge follows every change to the saved captures
    if (typeof this.setupCaptureHistoryWatcher === 'function') this.setupCaptureHistoryWatcher();
    // Once: the template and the document-level listeners are set up here, the tab's content is drawn per open
    this.initialized = true;
    Logger.debug('UI', 'Advanced section initialized');
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
