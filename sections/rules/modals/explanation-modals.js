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
 * Dependencies: rules-modal-lifecycle.js, rules.js, helpers/helper-kit.js,
 *               helpers/pattern-helpers.js (example renderers, used at open time)
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
    close: ['#closeRegexExplanation', '#closeRegexExplanationBtn'],
    body: '#regexExplanationBody',
    render: 'renderRegexExplanation'
  },
  {
    modal: '#wholeWordExplanationModal',
    btn: '#wholeWordExplanationBtn',
    btnAlt: '#wholeWordExplanationBtnValue',
    close: ['#closeWholeWordExplanation', '#closeWholeWordExplanationBtn'],
    body: '#wholeWordExplanationBody',
    render: 'renderWholeWordExplanation'
  },
  {
    modal: '#caseSensitiveExplanationModal',
    btn: '#caseSensitiveExplanationBtn',
    btnAlt: '#caseSensitiveExplanationBtnValue',
    buttons: ['#payloadUrlCaseExplanationBtn'],
    close: ['#closeCaseSensitiveExplanation', '#closeCaseSensitiveExplanationBtn'],
    body: '#caseSensitiveExplanationBody',
    render: 'renderCaseSensitiveExplanation'
  }
];

/**
 * Setup all explanation modals (regex, wholeWord, caseSensitive).
 * Their bodies are built from the same RuleHelperKit rows/cards as the
 * helper modals, so every string is localised and the look is shared.
 */
Rules.prototype.setupExplanationModals = function() {
  this._explanationModals = {};

  for (const config of EXPLANATION_MODAL_CONFIGS) {
    const modal = new RulesModalLifecycle(config.modal);
    modal.setupCloseListeners(...config.close);
    [config.btn, config.btnAlt, ...(config.buttons || [])]
      .filter(Boolean)
      .forEach((selector) => modal.setupOpenListener(selector));
    modal.onOpen = () => {
      const body = document.querySelector(config.body);
      if (body) {
        this[config.render](body);
        body.scrollTop = 0;
      }
    };
    RuleHelperKit.onEscape(config.modal, () => modal.close());
    this._explanationModals[config.modal] = modal;
  }
};

/** Shared explanation building blocks. */
function explanationNote(text) {
  return RuleHelperKit.el('p', 'rh-note', text);
}

function explanationSection(title, plain) {
  const el = RuleHelperKit.el;
  const section = el('div', 'rh-section');
  const head = el('div', 'rh-section-head' + (plain ? ' is-plain' : ''));
  head.appendChild(el('span', 'rh-section-title', title));
  section.appendChild(head);
  return section;
}

function explanationBullets(title, items) {
  const section = explanationSection(title);
  const list = RuleHelperKit.el('ul', 'rh-card rh-bullets');
  items.forEach(([key, fallback]) => list.appendChild(RuleHelperKit.el('li', '', RuleHelperKit.tr(key, fallback))));
  section.appendChild(list);
  return section;
}

Rules.prototype.renderRegexExplanation = function(body) {
  const tr = RuleHelperKit.tr;
  const fmt = RuleHelperKit.fmt;
  body.replaceChildren();
  body.appendChild(explanationNote(tr('rhRegexIntro', 'A regular expression (regex) matches text by pattern instead of exact characters.')));

  const examples = explanationSection(tr('rhExamples', 'Examples'));
  const listEl = RuleHelperKit.el('div', 'rh-list');
  examples.appendChild(listEl);
  new RuleHelperKit.List({ listEl }).render([
    { value: '^_ab', desc: fmt('rhRegexStartsFmt', 'Starts with “{0}”', '_ab') },
    { value: 'ck$', desc: fmt('rhRegexEndsFmt', 'Ends with “{0}”', 'ck') },
    { value: '.*token.*', desc: fmt('rhRegexContainsFmt', 'Contains “{0}” anywhere', 'token') },
    { value: '(akamai|datadome)', desc: fmt('rhRegexEitherFmt', '“{0}” or “{1}”', 'akamai', 'datadome') }
  ], { staticRows: true });
  body.appendChild(examples);

  body.appendChild(explanationBullets(tr('rhWhenToUse', 'When to use it'), [
    ['rhRegexUse1', 'Text that starts or ends with something specific'],
    ['rhRegexUse2', 'Several variations at once (with |)'],
    ['rhRegexUse3', 'Numbers or specific kinds of characters']
  ]));

  const ref = explanationSection(tr('rhQuickRef', 'Quick reference'));
  const refCard = RuleHelperKit.el('div', 'rh-card');
  this.renderRegexQuickReference(refCard);
  ref.appendChild(refCard);
  body.appendChild(ref);

  body.appendChild(explanationNote(tr('rhRegexTip', 'To match exact text you do not need regex: use “Whole word” instead.')));
};

Rules.prototype.renderWholeWordExplanation = function(body) {
  const tr = RuleHelperKit.tr;
  body.replaceChildren();
  body.appendChild(explanationNote(tr('rhWwIntro', 'Matches only when the text stands alone, not as part of a longer word.')));

  const examples = explanationSection(RuleHelperKit.fmt('rhHowMatchesFmt', 'How “{0}” matches', '_abck'), true);
  const listEl = RuleHelperKit.el('div', 'rh-list');
  examples.appendChild(listEl);
  body.appendChild(examples);
  this.renderWholeWordExamples(listEl, '_abck');

  body.appendChild(explanationBullets(tr('rhBestFor', 'Best for'), [
    ['rhWwUse1', 'Exact cookie names'],
    ['rhWwUse2', 'Specific header names'],
    ['rhWwUse3', 'Complete class or function names']
  ]));
};

Rules.prototype.renderCaseSensitiveExplanation = function(body) {
  const tr = RuleHelperKit.tr;
  body.replaceChildren();
  body.appendChild(explanationNote(tr('rhCsIntro', 'When on, uppercase and lowercase letters count as different.')));

  const examples = explanationSection(RuleHelperKit.fmt('rhHowMatchesFmt', 'How “{0}” matches', 'Akamai'), true);
  const groups = RuleHelperKit.el('div', 'rh-stack');
  examples.appendChild(groups);
  body.appendChild(examples);
  this.renderCaseSensitiveExamples(groups, 'Akamai');

  body.appendChild(explanationBullets(tr('rhBestFor', 'Best for'), [
    ['rhCsUse1', 'Headers and cookies with exact capitalization'],
    ['rhCsUse2', 'JavaScript property names']
  ]));
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
  this._methodHelpModal.setupCloseListeners('#closeMethodHelp', '#closeMethodHelpBtn');
  RuleHelperKit.onEscape('#methodHelpModal', () => this._methodHelpModal.close());
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
      warning: _tr('helpUrlWarning', 'Patterns ignore upper and lower case unless you turn on Case sensitive. A pattern that is too general also matches unrelated resources, so keep it specific.'),
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
      html: `<p class="rh-note">${_tr('noHelpContentAvailable', 'No help content available for this method type.')}</p>`
    };
  }

  const warningLabel = _tr('helpWarningLabel', 'Warning:');
  const tipLabel = _tr('helpTipLabel', 'Tip:');
  return {
    title: content.title,
    html: `
      <div class="rh-card rh-prose"><p>${content.description}</p></div>
      ${content.warning ? `<p class="rh-note tone-warning"><strong>${warningLabel}</strong> ${content.warning}</p>` : ''}
      ${content.tip ? `<p class="rh-note"><strong>${tipLabel}</strong> ${content.tip}</p>` : ''}
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
