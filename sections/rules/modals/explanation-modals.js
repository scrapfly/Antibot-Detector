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
 * Dependencies: rules-modal-lifecycle.js, rules.js
 */

// ============================================
// Data-driven explanation modal setup
// ============================================

const EXPLANATION_MODAL_CONFIGS = [
  {
    modal: '#regexExplanationModal',
    btn: '#regexExplanationBtn',
    btnAlt: '#regexExplanationBtnValue',
    buttons: ['#payloadUrlRegexExplanationBtn'],
    close: '#closeRegexExplanation'
  },
  {
    modal: '#wholeWordExplanationModal',
    btn: '#wholeWordExplanationBtn',
    btnAlt: '#wholeWordExplanationBtnValue',
    close: '#closeWholeWordExplanation'
  },
  {
    modal: '#caseSensitiveExplanationModal',
    btn: '#caseSensitiveExplanationBtn',
    btnAlt: '#caseSensitiveExplanationBtnValue',
    buttons: ['#payloadUrlCaseExplanationBtn'],
    close: '#closeCaseSensitiveExplanation'
  }
];

/**
 * Setup all explanation modals (regex, wholeWord, caseSensitive)
 * Replaces setupRegexExplanationModal, setupWholeWordExplanationModal, setupCaseSensitiveExplanationModal
 */
Rules.prototype.setupExplanationModals = function() {
  this._explanationModals = {};

  for (const config of EXPLANATION_MODAL_CONFIGS) {
    const modal = new RulesModalLifecycle(config.modal);
    modal.setupCloseListeners(config.close);
    [config.btn, config.btnAlt, ...(config.buttons || [])]
      .filter(Boolean)
      .forEach((selector) => modal.setupOpenListener(selector));
    this._explanationModals[config.modal] = modal;
  }
};

// ============================================
// Method Help Modal
// ============================================

/**
 * Setup method help modal event listeners
 */
Rules.prototype.setupMethodHelpModal = function() {
  this._methodHelpModal = new RulesModalLifecycle('#methodHelpModal', {
    hideParentOnOpen: false
  });
  this._methodHelpModal.setupCloseListeners('#closeMethodHelp');
};

/**
 * Get help content for detection method types
 */
Rules.prototype.getMethodHelpContent = function(methodType) {
  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fb) => (_t && _t.get(key)) || fb;
  const helpContent = {
    'js_hooks': {
      title: _tr('helpJsHooksTitle', 'JavaScript Hooks Detection'),
      description: _tr('helpJsHooksDescription', 'Hooks intercept browser API calls like <code>canvas.toDataURL()</code>, <code>navigator.webdriver</code>, or <code>RTCPeerConnection.createOffer()</code>. When a page calls these APIs, the hook records which anti-bot or fingerprinting system is active.'),
      warning: _tr('helpJsHooksWarning', 'Hooks only fire when the APIs are actually called by page scripts. Some sites cache fingerprint results, so use a hard reload (Ctrl+F5) to trigger detection again.'),
      tip: _tr('helpJsHooksTip', 'Specify the full API path (e.g., <code>HTMLCanvasElement.prototype.toDataURL</code>).')
    },
    'window': {
      title: _tr('helpWindowTitle', 'Window Properties Detection'),
      description: _tr('helpWindowDescription', 'Detects JavaScript objects and properties added to the <code>window</code> object by anti-bot scripts. Checks for specific paths like <code>_cf_chl_opt</code> (Cloudflare), <code>grecaptcha</code> (reCAPTCHA), or <code>dataDomeOptions</code> (DataDome).'),
      warning: _tr('helpWindowWarning', 'Window properties must exist at page load time. If scripts create properties asynchronously, detection may fail.'),
      tip: _tr('helpWindowTip', 'Use dot notation for nested properties (e.g., <code>navigator.webdriver</code> or <code>window._pxAppId</code>).')
    },
    'url': {
      title: _tr('helpUrlTitle', 'URL Pattern Detection'),
      description: _tr('helpUrlDescription', 'Matches URLs of loaded resources (scripts, images, stylesheets, XHR requests). Detects CDN URLs, API endpoints, and third-party domains used by anti-bot services.'),
      warning: _tr('helpUrlWarning', 'URL detection triggers on any matching resource. Use specific patterns to avoid false positives.'),
      tip: _tr('helpUrlTip', 'Enable "Regex" for flexible pattern matching (e.g., <code>cdn\\.example\\.com/.*\\.js</code>). Use "Whole Word" to match exact domains.')
    },
    'header': {
      title: _tr('helpHeaderTitle', 'HTTP Header Detection'),
      description: _tr('helpHeaderDescription', 'Detects HTTP request and response headers set by anti-bot systems. Examples: <code>cf-ray</code> (Cloudflare), <code>x-datadome-headers</code> (DataDome), <code>x-akamai-*</code> (Akamai).'),
      warning: _tr('helpHeaderWarning', 'Only response headers are visible to the extension. Request headers sent by the browser cannot be detected.'),
      tip: _tr('helpHeaderTip', 'Use Name/Value pairs for precise matching. Enable "Regex" on name to match header families (e.g., <code>x-akamai-.*</code>).')
    },
    'cookie': {
      title: _tr('helpCookieTitle', 'Cookie Detection'),
      description: _tr('helpCookieDescription', 'Detects cookies set by anti-bot and fingerprinting systems. Examples: <code>__cf_bm</code> (Cloudflare), <code>_abck</code> (Akamai), <code>datadome</code> (DataDome).'),
      warning: _tr('helpCookieWarning', 'HttpOnly cookies are not accessible to JavaScript and cannot be detected. Secure cookies require HTTPS.'),
      tip: _tr('helpCookieTip', 'Use Name/Value pairs: leave Value empty to match any cookie with that name. Enable "Regex" on name to match cookie families (e.g., <code>_px.*</code>).')
    },
    'content': {
      title: _tr('helpContentTitle', 'Page Content Detection'),
      description: _tr('helpContentDescription', 'Searches for text patterns in page HTML, inline scripts, and loaded JavaScript files. Detects obfuscated code, specific function names, or unique strings used by anti-bot scripts.'),
      warning: _tr('helpContentWarning', 'Content detection can be slow on large pages. Use specific patterns and enable "Whole Word" to reduce false positives.'),
      tip: _tr('helpContentTip', 'Search in "Scripts Only" scope for better performance. Use "Regex" for complex patterns (e.g., <code>function\\s+botDetect</code>).')
    },
    'dom': {
      title: _tr('helpDomTitle', 'DOM Selector Detection'),
      description: _tr('helpDomDescription', 'Detects HTML elements using CSS selectors. Finds CAPTCHA containers, challenge pages, bot detection widgets, and invisible tracking elements.'),
      warning: _tr('helpDomWarning', 'DOM detection requires elements to exist in the page. Dynamically created elements may not be detected immediately.'),
      tip: _tr('helpDomTip', 'Use specific selectors like <code>#captcha-container</code> or <code>.g-recaptcha</code>. Attribute selectors work too: <code>[data-sitekey]</code>.')
    },
    'payload': {
      title: _tr('helpPayloadTitle', 'Request Payload Detection'),
      description: _tr('helpPayloadDescription', 'Monitors all HTTP POST/PUT/PATCH requests including main frame navigations, API calls (fetch/XHR), and background requests. Detects patterns in request payloads to identify anti-bot telemetry, form submissions, and sensor data.'),
      warning: _tr('helpPayloadWarning', 'Payload detection can generate many matches on data-heavy sites. Use specific patterns and enable "Case Sensitive" for accurate matching to reduce false positives.'),
      tip: _tr('helpPayloadTip', 'Look for unique parameter names or obfuscated payload structures (e.g., <code>sensor_data</code>, <code>challenge_token</code>). Enable "Regex" for flexible pattern matching of JSON structures.')
    }
  };

  const content = helpContent[methodType];
  if (!content) {
    return {
      title: _tr('detectionMethodTitle', 'Detection Method'),
      html: `<p>${_tr('noHelpContentAvailable', 'No help content available for this method type.')}</p>`
    };
  }

  const warningLabel = _tr('helpWarningLabel', 'Warning:');
  const tipLabel = _tr('helpTipLabel', 'Tip:');
  return {
    title: content.title,
    html: `
      <p>${content.description}</p>
      ${content.warning ? `<p style="color: var(--warning); margin-top: 12px;"><strong>${warningLabel}</strong> ${content.warning}</p>` : ''}
      ${content.tip ? `<p style="color: var(--accent-light); margin-top: 12px;"><strong>${tipLabel}</strong> ${content.tip}</p>` : ''}
    `
  };
};

/**
 * Open method help modal
 */
Rules.prototype.openMethodHelpModal = function(methodType) {
  const title = document.querySelector('#methodHelpTitle');
  const content = document.querySelector('#methodHelpContent');
  if (!title || !content) return;

  const helpData = this.getMethodHelpContent(methodType);
  title.textContent = helpData.title;
  content.innerHTML = helpData.html;

  this._methodHelpModal.open();
};
