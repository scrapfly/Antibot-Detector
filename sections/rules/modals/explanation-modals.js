/**
 * Explanation Modals Module
 *
 * Contains methods for explanation/help modals:
 * - Regex explanation modal
 * - Whole Word explanation modal
 * - Case Sensitive explanation modal
 * - Method Help modal (detection method descriptions)
 *
 * These methods are added to the Rules prototype.
 */

// ============================================
// Regex Explanation Modal
// ============================================

/**
 * Setup Regex explanation modal event listeners
 */
Rules.prototype.setupRegexExplanationModal = function() {
  const modal = document.querySelector('#regexExplanationModal');
  const explanationBtn = document.querySelector('#regexExplanationBtn');
  const explanationBtnValue = document.querySelector('#regexExplanationBtnValue');
  const closeBtn = document.querySelector('#closeRegexExplanation');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');

  // Open modal when explanation button is clicked (Name field)
  if (explanationBtn) {
    explanationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openRegexExplanationModal();
    });
  }

  // Open modal when explanation button is clicked (Value field)
  if (explanationBtnValue) {
    explanationBtnValue.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openRegexExplanationModal();
    });
  }

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeRegexExplanationModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeRegexExplanationModal());
  }
};

/**
 * Open Regex explanation modal
 */
Rules.prototype.openRegexExplanationModal = function() {
  const modal = document.querySelector('#regexExplanationModal');
  if (!modal) return;

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

/**
 * Close Regex explanation modal
 */
Rules.prototype.closeRegexExplanationModal = function() {
  const modal = document.querySelector('#regexExplanationModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';

    // Restore parent modal backdrop
    const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
    if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
  }
};

// ============================================
// Whole Word Explanation Modal
// ============================================

/**
 * Setup Whole Word explanation modal event listeners
 */
Rules.prototype.setupWholeWordExplanationModal = function() {
  const modal = document.querySelector('#wholeWordExplanationModal');
  const explanationBtn = document.querySelector('#wholeWordExplanationBtn');
  const explanationBtnValue = document.querySelector('#wholeWordExplanationBtnValue');
  const closeBtn = document.querySelector('#closeWholeWordExplanation');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');

  // Open modal when explanation button is clicked (Name field)
  if (explanationBtn) {
    explanationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWholeWordExplanationModal();
    });
  }

  // Open modal when explanation button is clicked (Value field)
  if (explanationBtnValue) {
    explanationBtnValue.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWholeWordExplanationModal();
    });
  }

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeWholeWordExplanationModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeWholeWordExplanationModal());
  }
};

/**
 * Open Whole Word explanation modal
 */
Rules.prototype.openWholeWordExplanationModal = function() {
  const modal = document.querySelector('#wholeWordExplanationModal');
  if (!modal) return;

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

/**
 * Close Whole Word explanation modal
 */
Rules.prototype.closeWholeWordExplanationModal = function() {
  const modal = document.querySelector('#wholeWordExplanationModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';

    // Restore parent modal backdrop
    const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
    if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
  }
};

// ============================================
// Case Sensitive Explanation Modal
// ============================================

/**
 * Setup Case Sensitive explanation modal event listeners
 */
Rules.prototype.setupCaseSensitiveExplanationModal = function() {
  const modal = document.querySelector('#caseSensitiveExplanationModal');
  const explanationBtn = document.querySelector('#caseSensitiveExplanationBtn');
  const explanationBtnValue = document.querySelector('#caseSensitiveExplanationBtnValue');
  const closeBtn = document.querySelector('#closeCaseSensitiveExplanation');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');

  // Open modal when explanation button is clicked (Name field)
  if (explanationBtn) {
    explanationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCaseSensitiveExplanationModal();
    });
  }

  // Open modal when explanation button is clicked (Value field)
  if (explanationBtnValue) {
    explanationBtnValue.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCaseSensitiveExplanationModal();
    });
  }

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeCaseSensitiveExplanationModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeCaseSensitiveExplanationModal());
  }
};

/**
 * Open Case Sensitive explanation modal
 */
Rules.prototype.openCaseSensitiveExplanationModal = function() {
  const modal = document.querySelector('#caseSensitiveExplanationModal');
  if (!modal) return;

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

/**
 * Close Case Sensitive explanation modal
 */
Rules.prototype.closeCaseSensitiveExplanationModal = function() {
  const modal = document.querySelector('#caseSensitiveExplanationModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';

    // Restore parent modal backdrop
    const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
    if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
  }
};

// ============================================
// Method Help Modal
// ============================================

/**
 * Setup method help modal event listeners
 */
Rules.prototype.setupMethodHelpModal = function() {
  const modal = document.querySelector('#methodHelpModal');
  const closeBtn = document.querySelector('#closeMethodHelp');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeMethodHelpModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeMethodHelpModal());
  }
};

/**
 * Get help content for detection method types
 */
Rules.prototype.getMethodHelpContent = function(methodType) {
  const helpContent = {
    'js_hooks': {
      title: 'JavaScript Hooks Detection',
      description: 'Hooks intercept browser API calls like <code>canvas.toDataURL()</code>, <code>navigator.webdriver</code>, or <code>RTCPeerConnection.createOffer()</code>. When a page calls these APIs, the hook records which anti-bot or fingerprinting system is active.',
      warning: 'Hooks only fire when the APIs are actually called by page scripts. Some sites cache fingerprint results, so use a hard reload (Ctrl+F5) to trigger detection again.',
      tip: 'Specify the full API path (e.g., <code>HTMLCanvasElement.prototype.toDataURL</code>).'
    },
    'window': {
      title: 'Window Properties Detection',
      description: 'Detects JavaScript objects and properties added to the <code>window</code> object by anti-bot scripts. Checks for specific paths like <code>_cf_chl_opt</code> (Cloudflare), <code>grecaptcha</code> (reCAPTCHA), or <code>dataDomeOptions</code> (DataDome).',
      warning: 'Window properties must exist at page load time. If scripts create properties asynchronously, detection may fail.',
      tip: 'Use dot notation for nested properties (e.g., <code>navigator.webdriver</code> or <code>window._pxAppId</code>).'
    },
    'url': {
      title: 'URL Pattern Detection',
      description: 'Matches URLs of loaded resources (scripts, images, stylesheets, XHR requests). Detects CDN URLs, API endpoints, and third-party domains used by anti-bot services.',
      warning: 'URL detection triggers on any matching resource. Use specific patterns to avoid false positives.',
      tip: 'Enable "Regex" for flexible pattern matching (e.g., <code>cdn\\.example\\.com/.*\\.js</code>). Use "Whole Word" to match exact domains.'
    },
    'header': {
      title: 'HTTP Header Detection',
      description: 'Detects HTTP request and response headers set by anti-bot systems. Examples: <code>cf-ray</code> (Cloudflare), <code>x-datadome-headers</code> (DataDome), <code>x-akamai-*</code> (Akamai).',
      warning: 'Only response headers are visible to the extension. Request headers sent by the browser cannot be detected.',
      tip: 'Use Name/Value pairs for precise matching. Enable "Regex" on name to match header families (e.g., <code>x-akamai-.*</code>).'
    },
    'cookie': {
      title: 'Cookie Detection',
      description: 'Detects cookies set by anti-bot and fingerprinting systems. Examples: <code>__cf_bm</code> (Cloudflare), <code>_abck</code> (Akamai), <code>datadome</code> (DataDome).',
      warning: 'HttpOnly cookies are not accessible to JavaScript and cannot be detected. Secure cookies require HTTPS.',
      tip: 'Use Name/Value pairs: leave Value empty to match any cookie with that name. Enable "Regex" on name to match cookie families (e.g., <code>_px.*</code>).'
    },
    'content': {
      title: 'Page Content Detection',
      description: 'Searches for text patterns in page HTML, inline scripts, and loaded JavaScript files. Detects obfuscated code, specific function names, or unique strings used by anti-bot scripts.',
      warning: 'Content detection can be slow on large pages. Use specific patterns and enable "Whole Word" to reduce false positives.',
      tip: 'Search in "Scripts Only" scope for better performance. Use "Regex" for complex patterns (e.g., <code>function\\s+botDetect</code>).'
    },
    'dom': {
      title: 'DOM Selector Detection',
      description: 'Detects HTML elements using CSS selectors. Finds CAPTCHA containers, challenge pages, bot detection widgets, and invisible tracking elements.',
      warning: 'DOM detection requires elements to exist in the page. Dynamically created elements may not be detected immediately.',
      tip: 'Use specific selectors like <code>#captcha-container</code> or <code>.g-recaptcha</code>. Attribute selectors work too: <code>[data-sitekey]</code>.'
    },
    'payload': {
      title: 'Request Payload Detection',
      description: 'Monitors all HTTP POST/PUT/PATCH requests including main frame navigations, API calls (fetch/XHR), and background requests. Detects patterns in request payloads to identify anti-bot telemetry, form submissions, and sensor data.',
      warning: 'Payload detection can generate many matches on data-heavy sites. Use specific patterns and enable "Case Sensitive" for accurate matching to reduce false positives.',
      tip: 'Look for unique parameter names or obfuscated payload structures (e.g., <code>sensor_data</code>, <code>challenge_token</code>). Enable "Regex" for flexible pattern matching of JSON structures.'
    }
  };

  const content = helpContent[methodType];
  if (!content) {
    return {
      title: 'Detection Method',
      html: `<p>No help content available for this method type.</p>`
    };
  }

  return {
    title: content.title,
    html: `
      <p>${content.description}</p>
      ${content.warning ? `<p style="color: #fbbf24; margin-top: 12px;"><strong>Warning:</strong> ${content.warning}</p>` : ''}
      ${content.tip ? `<p style="color: #60a5fa; margin-top: 12px;"><strong>Tip:</strong> ${content.tip}</p>` : ''}
    `
  };
};

/**
 * Open method help modal
 */
Rules.prototype.openMethodHelpModal = function(methodType) {
  const modal = document.querySelector('#methodHelpModal');
  const title = document.querySelector('#methodHelpTitle');
  const content = document.querySelector('#methodHelpContent');

  if (!modal || !title || !content) return;

  // Get help content
  const helpData = this.getMethodHelpContent(methodType);

  // Update modal title and content
  title.textContent = helpData.title;
  content.innerHTML = helpData.html;

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

/**
 * Close method help modal
 */
Rules.prototype.closeMethodHelpModal = function() {
  const modal = document.querySelector('#methodHelpModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
};
