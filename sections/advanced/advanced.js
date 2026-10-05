class Advanced {
  static AVAILABLE_MODULES = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      file: 'ReCaptcha/ReCaptchaAdvanced.js',
      productName: 'reCAPTCHA',
      icon: '🔴'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      file: 'Akamai/AkamaiAdvanced.js',
      productName: 'Akamai Bot Manager',
      icon: '🔷'
    },
    'shapesecurity': {
      name: 'ShapeSecurityAdvanced',
      file: 'shapesecurity/shapesecurity-advanced.js',
      productName: 'Shape Security',
      icon: '🔶'
    },
    'incapsula': {
      name: 'ImpervaAdvanced',
      file: 'imperva/imperva-advanced.js',
      productName: 'Imperva/Incapsula',
      icon: '🔷'
    },
    'aws-waf': {
      name: 'AwsWafAdvanced',
      file: 'awswaf/awswaf-advanced.js',
      productName: 'AWS WAF',
      icon: '🟠'
    },
    'geetest': {
      name: 'GeetestAdvanced',
      file: 'geetest/geetest-advanced.js',
      productName: 'GeeTest',
      icon: '🟣'
    },
    'datadome': {
      name: 'DataDomeAdvanced',
      file: 'datadome/datadome-advanced.js',
      productName: 'DataDome',
      icon: '🟢'
    },
    'cloudflare': {
      name: 'CloudflareAdvanced',
      file: 'cloudflare/cloudflare-advanced.js',
      productName: 'Cloudflare',
      icon: '🟠'
    },
    'turnstile': {
      name: 'TurnstileAdvanced',
      file: 'turnstile/turnstile-advanced.js',
      productName: 'Turnstile',
      icon: '🔵'
    },
    'hcaptcha': {
      name: 'HCaptchaAdvanced',
      file: 'hcaptcha/hcaptcha-advanced.js',
      productName: 'hCaptcha',
      icon: '🔷'
    },
    'funcaptcha': {
      name: 'FunCaptchaAdvanced',
      file: 'funcaptcha/funcaptcha-advanced.js',
      productName: 'FunCaptcha',
      icon: '🟣'
    },
  };

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
    this.analysisResults = null;
    this.isRunningAnalysis = false;
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
