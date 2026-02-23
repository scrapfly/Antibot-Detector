class Advanced {
  static AVAILABLE_MODULES = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      file: 'ReCaptcha/ReCaptchaAdvanced.js',
      displayName: 'reCAPTCHA Detection Tools',
      icon: '🔴'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      file: 'Akamai/AkamaiAdvanced.js',
      displayName: 'Akamai Bot Manager Tools',
      icon: '🔷'
    },
    'shapesecurity': {
      name: 'ShapeSecurityAdvanced',
      file: 'shapesecurity/shapesecurity-advanced.js',
      displayName: 'Shape Security Tools',
      icon: '🔶'
    },
    'incapsula': {
      name: 'ImpervaAdvanced',
      file: 'imperva/imperva-advanced.js',
      displayName: 'Imperva/Incapsula Tools',
      icon: '🔷'
    },
    'aws-waf': {
      name: 'AwsWafAdvanced',
      file: 'awswaf/awswaf-advanced.js',
      displayName: 'AWS WAF Tools',
      icon: '🟠'
    },
    'geetest': {
      name: 'GeetestAdvanced',
      file: 'geetest/geetest-advanced.js',
      displayName: 'GeeTest Tools',
      icon: '🟣'
    },
    'datadome': {
      name: 'DataDomeAdvanced',
      file: 'datadome/datadome-advanced.js',
      displayName: 'DataDome Tools',
      icon: '🟢'
    },
    'cloudflare': {
      name: 'CloudflareAdvanced',
      file: 'cloudflare/cloudflare-advanced.js',
      displayName: 'Cloudflare Tools',
      icon: '🟠'
    },
    'turnstile': {
      name: 'TurnstileAdvanced',
      file: 'turnstile/turnstile-advanced.js',
      displayName: 'Turnstile Tools',
      icon: '🔵'
    },
    'hcaptcha': {
      name: 'HCaptchaAdvanced',
      file: 'hcaptcha/hcaptcha-advanced.js',
      displayName: 'hCaptcha Tools',
      icon: '🔷'
    },
    'funcaptcha': {
      name: 'FunCaptchaAdvanced',
      file: 'funcaptcha/funcaptcha-advanced.js',
      displayName: 'FunCaptcha Tools',
      icon: '🟣'
    },
  };

  constructor(detectorManager, detectionSection) {
    this.detectorManager = detectorManager;
    this.detectionSection = detectionSection;
    this.analysisResults = null;
    this.isRunningAnalysis = false;
    this.loadedModules = {};
    this.currentTab = null;
    this.selectedDetection = null;
    this.availableDetectionTools = [];
    this.captureHistoryPagination = null;
    this.cachedDetectionResults = []; // Cache detection results for reliable access
  }


  /**
   * Initialize advanced section
   */
  async initialize() {
    await this.loadHTML();
    Logger.ui('Advanced section initialized');
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
