/**
 * Method help - the "?" next to each detection method in the rule editor.
 *
 * A short cheat sheet per method: what it checks, real patterns taken live
 * from Scrapfly's own rules, how its text is matched (or what can be
 * written), and its limits. Every statement was checked against the
 * detection engine (detection-engine-manager.js runDetector and the
 * collectors it reads); keep them in step when the engine changes.
 *
 * Texts are locale keys (mh*). `code` is written between backticks in the
 * texts and rendered as <code>; nothing is inserted as HTML.
 *
 * Dependencies: rules.js, rules-modal-lifecycle.js, helpers/helper-kit.js
 */

const METHOD_HELP = {
  url: {
    intro: ['mhUrlIntro', 'Checks the page address and the URLs the page requests: scripts, XHR and fetch calls, images, frames and pings.'],
    how: [
      ['mhUrlHow1', 'Without Regex, the URL must contain the text, ignoring case. The whole URL counts, query string included.'],
      ['mhUrlHow2', 'With Regex, leave out the / at both ends and write dots as `\\.`, as in `^https://js\\.example\\.com/`.'],
      ['mhUrlHow3', 'URL scope: Page checks only the page address, Scripts adds script sources, All (default) adds every request.']
    ],
    limits: [
      ['mhUrlLimit1', 'Font, media and stylesheet requests are not recorded.'],
      ['mhUrlLimit2', 'Only requests made before the scan count; the scan runs once the page has loaded.']
    ],
    examples: [['detect-datadome', 'datadome-tag'], ['detect-hcaptcha', 'hcaptcha-api-resource'],
      ['detect-botguard', 'botguard-interpreter'], ['detect-recaptcha', 'google-sdk']]
  },
  header: {
    intro: ['mhHeaderIntro', 'Checks the headers of the page\'s own request and response, not those of scripts, XHR calls or frames.'],
    how: [
      ['mhHeaderHow1', 'Header names are compared in lower case, and plain text means “contains”: `server` also matches `server-timing`. For an exact name, use Regex `^server$`.'],
      ['mhHeaderHow2', 'The value is checked on the header with that name; leave it empty to accept any value.'],
      ['mhHeaderHow3', 'Response scope (default) means headers the site sent; Request means headers the browser sent.']
    ],
    limits: [
      ['mhHeaderLimit1', 'With Case sensitive on, write header names in lower case.'],
      ['mhHeaderLimit2', 'Pages that change address without reloading are scanned again without headers.']
    ],
    examples: [['detect-cloudflare', 'cf-mitigated-header'], ['detect-datadome', 'datadome-protected-header'],
      ['detect-aws-waf', 'waf-action-header'], ['detect-kasada', 'kpsdk-ct-header']]
  },
  cookie: {
    intro: ['mhCookieIntro', 'Checks the page\'s cookies by name and, optionally, value, HttpOnly and Secure ones included.'],
    how: [
      ['mhCookieHow1', 'A plain name matches as a prefix: `_abck` also matches `_abck_2`.'],
      ['mhCookieHow2', '`*` stands for any text: `bm_*` matches `bm_sz` and `bm_sv`.'],
      ['mhCookieHow3', 'For an exact name, turn on Regex and write `^name$`. The value matches when it contains the text.']
    ],
    limits: [
      ['mhCookieLimit1', 'Request scope (default) reads the browser\'s cookies for the page; Response reads the cookies the page\'s response sets.'],
      ['mhCookieLimit2', 'Cookies of other sites, such as a vendor\'s frame, are not seen. Long values are cut to 100 characters.']
    ],
    examples: [['detect-akamai', 'abck-sensor-cookie'], ['detect-datadome', 'datadome-cookie'],
      ['detect-cloudflare', 'cf-clearance-cookie'], ['detect-perimeterx', 'px3-cookie']]
  },
  content: {
    intro: ['mhContentIntro', 'Searches the page\'s text: the HTML of its body, its inline scripts and the script and stylesheet files it loads.'],
    how: [
      ['mhContentHow1', 'Plain text matches when the text contains it, ignoring case.'],
      ['mhContentHow2', 'Whole word skips matches inside a longer word; it needs a letter, digit or _ at both ends of the pattern.'],
      ['mhContentHow3', '“Only check scripts” searches inline scripts (head included) and JavaScript files only, without HTML or CSS.']
    ],
    limits: [
      ['mhContentLimit1', 'Files the site does not let other origins read (CORS), or over 5 MB, are skipped.'],
      ['mhContentLimit2', 'Code inside frames or workers, or loaded after the scan, is not searched.']
    ],
    examples: [['detect-cloudflare', 'chl-opt-reference'], ['detect-akamai', 'bmak-reference'],
      ['detect-datadome', 'ddjskey-reference'], ['detect-kasada', 'kpsdk-reference']]
  },
  dom: {
    intro: ['mhDomIntro', 'Looks for an element in the page body with a CSS selector, once the page has loaded.'],
    howTitle: ['mhWriteTitle', 'What you can write'],
    how: [
      ['mhDomHow1', 'A tag, `.class`, `#id` or `[attribute]`, alone or combined: `.g-recaptcha[data-sitekey]`.'],
      ['mhDomHow2', 'Attribute tests `=`, `^=`, `$=`, `*=`, `~=` and `|=`; add ` i` before `]` to ignore case.'],
      ['mhDomHow3', 'Several selectors separated by commas: any of them matches.']
    ],
    limits: [
      ['mhDomLimit1', 'Not supported, so the rule never matches: spaces or `>` between parts, `:pseudo-classes` and escapes.'],
      ['mhDomLimit2', 'The head, frames and shadow roots are not searched. The `value` attribute is not read; other attributes are compared on their first 100 characters.']
    ],
    examples: [['detect-recaptcha', 'configured-widget'], ['detect-hcaptcha', 'hcaptcha-configured-widget'],
      ['detect-turnstile', 'turnstile-response-field'], ['detect-aliyunwaf', 'block-traceid-tips']]
  },
  window: {
    intro: ['mhWindowIntro', 'Checks a JavaScript global the page defines, such as `grecaptcha.render`.'],
    howTitle: ['mhWriteTitle', 'What you can write'],
    how: [
      ['mhWindowHow1', 'The path from `window`, dot-separated: `KPSDK` or `grecaptcha.render`.'],
      ['mhWindowHow2', 'A condition such as `exists`, `typeof function`, `truthy`, `=== true`, `length > 0` or `has keys`. Empty means truthy.'],
      ['mhWindowHow3', 'A condition detection does not understand never matches, so pick one from the list.']
    ],
    limits: [
      ['mhWindowLimit1', 'Checked during the first seconds after the page loads; globals created later are missed.'],
      ['mhWindowLimit2', 'Properties named with a Symbol cannot be written as a path.']
    ],
    examples: [['detect-cloudflare', 'chl-opt-object'], ['detect-recaptcha', 'standard-render-api'],
      ['detect-kasada', 'kpsdk-object'], ['detect-perimeterx', 'px-appid-variable']]
  },
  js_hooks: {
    warning: ['mhJsHooksOnlyFingerprint', 'Only Fingerprint rules use hooks: anti-bot and CAPTCHA rules ignore them.'],
    intro: ['mhJsHooksIntro', 'Records when the page calls a browser API, such as `HTMLCanvasElement.prototype.toDataURL`, a sign of fingerprinting.'],
    howTitle: ['mhWriteTitle', 'What you can write'],
    how: [
      ['mhJsHooksHow1', 'The full path to a method or getter: `Navigator.prototype.webdriver`, not `navigator.webdriver`.'],
      ['mhJsHooksHow2', 'Any call counts; its arguments and result are not checked, so a hook shows that an API was used, not why.']
    ],
    limits: [
      ['mhJsHooksLimit1', 'Calls count during the first seconds after the page loads (8 seconds at most).'],
      ['mhJsHooksLimit2', 'Calls in workers or frames are not seen, except built-in targets in same-site frames.']
    ],
    examples: [['detect-canvas-fingerprint', 'canvas-export'], ['detect-webgl-fingerprint', 'webgl-parameters'],
      ['detect-audio-fingerprint', 'audio-offline-render'], ['detect-navigator-fingerprint', 'navigator-automation']]
  },
  payload: {
    intro: ['mhPayloadIntro', 'Searches the bodies of the POST, PUT, PATCH and DELETE requests the page sends, from any frame.'],
    how: [
      ['mhPayloadHow1', 'Plain text matches when the body contains it, ignoring case. Form data is read as `name=value&…`.'],
      ['mhPayloadHow2', 'The request URL (optional) and the HTTP method limit it to matching requests.']
    ],
    limits: [
      ['mhPayloadLimit1', 'Only requests sent before the scan count, up to 50 per page.'],
      ['mhPayloadLimit2', 'WebSocket messages are not read.']
    ],
    examples: [['detect-akamai', 'sensor-data-payload'], ['detect-akamai', 'pixel-payload'], ['detect-akamai', 'sbsd-payload']]
  }
};

/** A text with `code` between backticks as nodes (no HTML) */
function methodHelpText(tag, className, text) {
  const node = RuleHelperKit.el(tag, className);
  String(text).split('`').forEach((part, index) => {
    if (!part) return;
    if (index % 2) {
      const code = RuleHelperKit.el('code', '', part);
      code.dir = 'ltr';
      node.appendChild(code);
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
  return node;
}

function methodHelpSection(title) {
  const section = RuleHelperKit.el('div', 'rh-section');
  const head = RuleHelperKit.el('div', 'rh-section-head');
  head.appendChild(RuleHelperKit.el('span', 'rh-section-title', title));
  section.appendChild(head);
  return section;
}

function methodHelpBullets(title, items) {
  const section = methodHelpSection(title);
  const list = RuleHelperKit.el('ul', 'rh-card rh-bullets');
  items.forEach(([key, fallback]) => list.appendChild(methodHelpText('li', '', RuleHelperKit.tr(key, fallback))));
  section.appendChild(list);
  return section;
}

/** Find an official detector by id in any category */
Rules.prototype.findHelpDetector = function(detectorId) {
  const all = this.detectorManager?.getAllDetectors?.() || {};
  for (const category of Object.keys(all)) {
    if (all[category]?.[detectorId]) return all[category][detectorId];
  }
  return null;
};

/** The curated example patterns of a method that still exist in the loaded rules */
Rules.prototype.getMethodHelpExamples = function(methodType) {
  const spec = METHOD_HELP[methodType];
  if (!spec) return [];
  const rows = [];
  for (const [detectorId, patternId] of spec.examples || []) {
    const detector = this.findHelpDetector(detectorId);
    const pattern = (detector?.detection?.[methodType] || []).find((item) => item && item.id === patternId);
    if (!pattern) continue;
    const name = pattern.name || pattern.text || pattern.selector || pattern.path || pattern.target || '';
    if (!name) continue;
    // The chip is about the main pattern (a cookie or header value shows its own syntax after "=")
    const regex = pattern.nameRegex === true || pattern.textRegex === true;
    const value = (methodType === 'cookie' || methodType === 'header') && pattern.value ? `${name} = ${pattern.value}` : name;
    const chips = [];
    if (methodType === 'window' && pattern.condition) chips.push({ text: pattern.condition });
    if (regex) chips.push({ text: RuleHelperKit.tr('ptOptRegex', 'Regex'), tone: 'accent' });
    rows.push({
      value,
      desc: detector.displayName || detector.name || detectorId,
      chips,
      title: [value, pattern.description].filter(Boolean).join('\n')
    });
  }
  return rows;
};

/** Fill the help dialog body for one method */
Rules.prototype.renderMethodHelp = function(body, methodType) {
  const spec = METHOD_HELP[methodType];
  body.replaceChildren();
  if (!spec) return;
  const tr = RuleHelperKit.tr;

  if (spec.warning) {
    const warning = methodHelpText('p', 'rh-note tone-warning', tr(spec.warning[0], spec.warning[1]));
    warning.setAttribute('role', 'note');
    body.appendChild(warning);
  }
  body.appendChild(methodHelpText('p', 'mh-intro', tr(spec.intro[0], spec.intro[1])));

  const examples = this.getMethodHelpExamples(methodType);
  if (examples.length) {
    const section = methodHelpSection(tr('mhExamplesTitle', 'In Scrapfly\'s rules'));
    const listEl = RuleHelperKit.el('div', 'rh-list mh-examples');
    new RuleHelperKit.List({ listEl }).render(examples, { staticRows: true });
    listEl.querySelectorAll('.rh-row-value').forEach((value) => { value.dir = 'ltr'; });
    section.appendChild(listEl);
    body.appendChild(section);
  }

  const howTitle = spec.howTitle || ['mhHowTitle', 'How it matches'];
  body.appendChild(methodHelpBullets(tr(howTitle[0], howTitle[1]), spec.how));
  body.appendChild(methodHelpBullets(tr('mhLimitsTitle', 'Good to know'), spec.limits));
};

Rules.prototype.setupMethodHelpModal = function() {
  // Opened over the rule editor: its backdrop is hidden meanwhile (one blur, not two)
  this._methodHelpModal = new RulesModalLifecycle('#methodHelpModal', {
    parentBackdrop: '#editRuleModal .rule-modal-backdrop'
  });
  this._methodHelpModal.setupCloseListeners('#closeMethodHelp');
  RuleHelperKit.onEscape('#methodHelpModal', () => this._methodHelpModal.close());
};

Rules.prototype.openMethodHelpModal = function(methodType) {
  const title = document.querySelector('#methodHelpTitle');
  const body = document.querySelector('#methodHelpContent');
  if (!title || !body || !METHOD_HELP[methodType]) return;
  // The question the "?" button asks ("What is URL detection?"), answered below
  const question = (typeof RULES_EDITOR_HELP_TITLES !== 'undefined') && RULES_EDITOR_HELP_TITLES[methodType];
  title.textContent = question ? RuleHelperKit.tr(question[0], question[1]) : this.getMethodLabel(methodType);
  this.renderMethodHelp(body, methodType);
  this._methodHelpModal.open();
  body.scrollTop = 0;
  document.querySelector('#closeMethodHelp')?.focus();
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { METHOD_HELP };
}
