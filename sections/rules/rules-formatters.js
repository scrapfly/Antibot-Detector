/**
 * Rules Formatters Module
 *
 * Contains formatting and display utility methods:
 * - Date formatting (getRelativeTime, formatLastUpdated, etc.)
 * - Detection methods display
 * - Category/badge helpers
 * - Icon rendering
 *
 * These methods are added to the Rules prototype.
 */

// ============================================
// Date Formatting Methods
// ============================================

/**
 * BCP 47 tag of the UI language (I18n.locale()), for the Intl formatters.
 * Undefined when unknown, which lets Intl use the browser default.
 * @returns {string|undefined}
 */
Rules.prototype.getUiLocale = function() {
  try {
    if (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') {
      const locale = I18n.locale();
      if (typeof locale === 'string' && locale) return locale;
    }
  } catch (e) {
    // Fall through to the browser default
  }
  return undefined;
};

/**
 * Split an elapsed time into the largest whole unit that fits
 * ("3 hours", "1 week"), the same buckets the cards have always used.
 * @param {number} diffMs - Elapsed milliseconds (negative is treated as 0)
 * @returns {{unit: string, value: number}}
 */
Rules.prototype.getRelativeTimeParts = function(diffMs) {
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return { unit: 'second', value: diffSeconds };
  if (diffMinutes < 60) return { unit: 'minute', value: diffMinutes };
  if (diffHours < 24) return { unit: 'hour', value: diffHours };
  if (diffDays < 7) return { unit: 'day', value: diffDays };
  if (diffWeeks < 4) return { unit: 'week', value: diffWeeks };
  // 28-29 days is past the week bucket but not a full 30-day month yet
  const diffMonths = Math.max(1, Math.floor(diffDays / 30));
  if (diffMonths < 12) return { unit: 'month', value: diffMonths };
  return { unit: 'year', value: Math.max(1, Math.floor(diffDays / 365)) };
};

/**
 * Get relative time string from a date, in the UI language
 * (Intl.RelativeTimeFormat with numeric: 'auto', so it reads "now",
 * "yesterday", "last week" ...). English when Intl is unavailable.
 * @param {Date} date - Date object
 * @param {Date} [now] - Reference time (defaults to the current time)
 * @returns {string} Relative time string
 */
Rules.prototype.getRelativeTime = function(date, now = new Date()) {
  const { unit, value } = this.getRelativeTimeParts(now - date);

  if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
    const locale = this.getUiLocale();
    for (const candidate of (locale ? [locale, undefined] : [undefined])) {
      try {
        return new Intl.RelativeTimeFormat(candidate, { numeric: 'auto' }).format(-value, unit);
      } catch (e) {
        // Unsupported tag: retry with the browser default, then English
      }
    }
  }

  if (unit === 'second') return 'just now';
  return value === 1 ? `1 ${unit} ago` : `${value} ${unit}s ago`;
};

/**
 * Format date in compact style ("30 Sept 2026, 14:05"), in the UI language
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
Rules.prototype.formatCompactDate = function(date) {
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    const locale = this.getUiLocale();
    const options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    for (const candidate of (locale ? [locale, undefined] : [undefined])) {
      try {
        return new Intl.DateTimeFormat(candidate, options).format(date);
      } catch (e) {
        // Unsupported tag: retry with the browser default, then the manual format
      }
    }
  }

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
};

/**
 * Format last updated timestamp into friendly text
 * @param {string|number} rawTimestamp - Raw timestamp value
 * @returns {string} Formatted timestamp string
 */
Rules.prototype.formatLastUpdated = function(rawTimestamp) {
  if (!rawTimestamp) {
    return (typeof I18n !== 'undefined' && I18n.get('timeUnknown')) || 'Unknown';
  }

  let parsedDate = null;

  // Handle numeric timestamps directly
  if (typeof rawTimestamp === 'number') {
    const numericDate = new Date(rawTimestamp);
    if (!Number.isNaN(numericDate.getTime())) {
      parsedDate = numericDate;
    }
  }

  if (typeof rawTimestamp === 'string') {
    let normalized = rawTimestamp.trim();

    // Support legacy format "YYYY-MM-DD" by adding midnight time
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      normalized = `${normalized}T00:00:00`;
    }

    // Replace space separator with T for ISO compatibility
    if (normalized.includes(' ') && !normalized.includes('T')) {
      normalized = normalized.replace(' ', 'T');
    }

    const dateObj = new Date(normalized);
    if (!Number.isNaN(dateObj.getTime())) {
      parsedDate = dateObj;
    }
  }

  if (!parsedDate) {
    return String(rawTimestamp);
  }

  // Format: "relative time (absolute time)"
  const relativeTime = this.getRelativeTime(parsedDate);
  const compactDate = this.formatCompactDate(parsedDate);

  return `${relativeTime} (${compactDate})`;
};

/**
 * Get timestamp for sorting
 * @param {string|number} rawTimestamp - Raw timestamp value
 * @returns {number} Timestamp in milliseconds
 */
Rules.prototype.getSortTimestamp = function(rawTimestamp) {
  if (!rawTimestamp) {
    return 0;
  }

  if (typeof rawTimestamp === 'number') {
    return rawTimestamp;
  }

  if (typeof rawTimestamp === 'string') {
    let normalized = rawTimestamp.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      normalized = `${normalized}T00:00:00`;
    }

    if (normalized.includes(' ') && !normalized.includes('T')) {
      normalized = normalized.replace(' ', 'T');
    }

    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return 0;
};

// ============================================
// Detector Names
// ============================================

/**
 * English name that older versions stored for a new detector the user never
 * renamed. Kept only to recognise it: it is displayed in the UI language and
 * never written again.
 */
Rules.LEGACY_DEFAULT_DETECTOR_NAME = 'New Detector';

/**
 * Default name of a new detector, in the UI language ("New detector").
 * @returns {string}
 */
Rules.prototype.getDefaultDetectorName = function() {
  return (typeof I18n !== 'undefined' && I18n.get('rulesUiNewDetectorName')) || 'New detector';
};

/**
 * Name to show for a stored detector name. The legacy English default
 * ("New Detector") shows as the localised default; storage is not rewritten.
 * @param {string} name - Stored name
 * @returns {string} Name to display ('' when there is none)
 */
Rules.prototype.getDetectorDisplayName = function(name) {
  if (typeof name !== 'string') return '';
  if (name.trim() === Rules.LEGACY_DEFAULT_DETECTOR_NAME) return this.getDefaultDetectorName();
  return name;
};

/**
 * Name to store when the editor is saved.
 * - An empty name becomes the localised default (never the English one), so a
 *   saved detector always has a name and the id slug keeps working.
 * - A detector still stored as the legacy "New Detector" whose name field
 *   still shows the localised default the editor put there keeps its stored
 *   name (display-time mapping only; saving does not rewrite it).
 * @param {string} inputValue - Value of the name field
 * @param {string} storedName - Name the detector had when the editor opened
 * @returns {string}
 */
Rules.prototype.resolveDetectorNameForSave = function(inputValue, storedName) {
  const value = typeof inputValue === 'string' ? inputValue : '';
  const trimmed = value.trim();
  const defaultName = this.getDefaultDetectorName();
  const storedTrimmed = typeof storedName === 'string' ? storedName.trim() : '';

  if (storedTrimmed === Rules.LEGACY_DEFAULT_DETECTOR_NAME && (!trimmed || trimmed === defaultName)) {
    return storedName;
  }
  if (!trimmed) return defaultName;
  return value;
};

// ============================================
// Detection Methods Display
// ============================================

/**
 * Get detection methods HTML from detector data
 * @param {object} detector - Detector object
 * @returns {string} HTML for detection method tags
 */
Rules.prototype.getDetectionMethods = function(detector) {
  let methodsHtml = '';

  // Get detection methods from the detection object keys
  let detectionMethods = null;
  if (detector.detection && typeof detector.detection === 'object') {
    detectionMethods = Object.keys(detector.detection).filter(key =>
      detector.detection[key] &&
      (Array.isArray(detector.detection[key]) ? detector.detection[key].length > 0 : true)
    );
  }

  // Add detection methods from detector data
  if (detectionMethods && Array.isArray(detectionMethods)) {
    detectionMethods.forEach((method) => {
      const methodStr = typeof method === 'string' ? method : method.name || method.type || 'Unknown';
      // Hover: what the method checks, how many patterns it has, and how many are combination-only
      const rules = Array.isArray(detector.detection?.[methodStr]) ? detector.detection[methodStr] : [];
      const comboOnly = rules.filter(rule => rule && rule.standalone === false).length;
      const count = rules.length === 1
        ? FormatUtils.t('methodOnePattern', '1 pattern')
        : FormatUtils.t('methodPatternsFmt', '{0} patterns', rules.length);
      const tipRows = comboOnly > 0
        ? [{ label: FormatUtils.t('patternCombinationsOnlyBadge', 'Combinations only'), value: String(comboOnly) }]
        : [];
      methodsHtml += this.renderMethodChip(methodStr, '', {
        title: `${this.getMethodLabel(methodStr)} · ${count}`,
        detail: FormatUtils.methodHint(methodStr),
        rows: tipRows
      });
    });
  } else {
    // Fallback: create detection methods based on category and add detector name
    const categoryMethod = this.getCategoryMethod(detector.category);
    const categoryClass = this.getCategoryClass(detector.category);

    if (categoryMethod) {
      methodsHtml += `<span class="method-tag ${categoryClass}">${categoryMethod}</span>`;
    }

    // Add detector name as secondary method if different from category
    if (detector.displayName && detector.displayName !== categoryMethod) {
      methodsHtml += `<span class="method-tag secondary">${detector.displayName}</span>`;
    }
  }

  return methodsHtml;
};

// ============================================
// Category & Badge Helpers
// ============================================

/**
 * Get category-based detection method
 * @param {string} category - Category name
 * @returns {string} Detection method name
 */
Rules.prototype.getCategoryMethod = function(category) {
  return this.categoryManager.getCategoryDisplayName(category) ||
    ((typeof I18n !== 'undefined' && I18n.get('tabDetection')) || 'Detection');
};

/**
 * Get the sentence-case category label shown on detector cards
 * ("Fingerprint" for fingerprint), falling back to the category display name
 * @param {string} category - Category name
 * @returns {string} Category label
 */
Rules.prototype.getCategoryLabel = function(category) {
  const labelKey = {
    antibot: 'categoryAntibot',
    captcha: 'categoryCaptcha',
    fingerprint: 'categoryFingerprint'
  };
  const labelFallback = { antibot: 'Anti-bot', captcha: 'Captcha', fingerprint: 'Fingerprint' };
  const name = category?.toLowerCase();
  const translated = (labelKey[name] && typeof I18n !== 'undefined') ? I18n.get(labelKey[name]) : null;
  return translated || labelFallback[name] || this.getCategoryMethod(category);
};

/**
 * Get the human-readable label of a detection method shown on detector cards
 * @param {string} method - Method key (url, header, cookie, content, dom, js_hooks, window, payload)
 * @returns {string} Method label
 */
Rules.prototype.getMethodLabel = function(method) {
  const labelKey = {
    url: 'detectionMethodUrl', header: 'detectionMethodHeaders', cookie: 'detectionMethodCookies',
    content: 'detectionMethodContent', dom: 'detectionMethodDom', js_hooks: 'detectionMethodJsHooks',
    window: 'detectionMethodWindow', payload: 'detectionMethodPayload'
  };
  const labelFallback = {
    url: 'Url', header: 'Headers', cookie: 'Cookies', content: 'Content', dom: 'Dom',
    js_hooks: 'JavaScript hooks', window: 'Window properties', payload: 'Payload'
  };
  const name = method?.toLowerCase();
  const translated = (labelKey[name] && typeof I18n !== 'undefined') ? I18n.get(labelKey[name]) : null;
  if (translated) return translated;
  if (labelFallback[name]) return labelFallback[name];
  // Unknown method: "some_method" -> "Some method"
  const words = String(method || '').replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Render a detection-method chip: the readable, translated label (e.g.
 * "JavaScript hooks") in the method's tag colour, styled like the Detection
 * list card chips. Shared by the Rules cards and the rule editor so both look
 * identical.
 * @param {string} method - Method key (url, header, cookie, content, dom, js_hooks, window, payload)
 * @param {string} [extraClass] - Additional class names for the chip
 * @param {{title:string, detail?:string, rows?:Array}} [tip] - Optional hover tip
 * @returns {string} HTML for the chip
 */
Rules.prototype.renderMethodChip = function(method, extraClass = '', tip = null) {
  const label = FormatUtils.escapeHtml(this.getMethodLabel(method));
  const classes = extraClass ? ` ${extraClass}` : '';
  const tipAttrs = tip && tip.title ? ` ${FormatUtils.tipAttrs(tip.title, tip.detail, tip.rows)}` : '';
  const categoryManager = this.categoryManager || this.detectorManager?.categoryManager;
  const tagColor = categoryManager?.getTagColor(method);

  // Only interpolate a validated #rrggbb colour into the style attribute
  if (tagColor && tagColor !== '#666666' && /^#[0-9a-f]{6}$/i.test(tagColor)) {
    const r = parseInt(tagColor.substring(1, 3), 16);
    const g = parseInt(tagColor.substring(3, 5), 16);
    const b = parseInt(tagColor.substring(5, 7), 16);
    // Same muted fill/border as the Detection list card chips
    return `<span class="method-tag${classes}" style="background: rgba(${r}, ${g}, ${b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);"${tipAttrs}>${label}</span>`;
  }

  // Fallback to CSS class
  return `<span class="method-tag ${this.getMethodBadgeClass(method)}${classes}"${tipAttrs}>${label}</span>`;
};

/**
 * Get category-based CSS class for method tags
 * @param {string} category - Category name
 * @returns {string} CSS class name
 */
Rules.prototype.getCategoryClass = function(category) {
  return this.categoryManager.getCategoryBadgeClass(category);
};

/**
 * Get method-specific badge class for detection method types
 * @param {string} method - Method name (cookies, headers, urls, scripts, etc.)
 * @returns {string} CSS class name
 */
Rules.prototype.getMethodBadgeClass = function(method) {
  switch (method?.toLowerCase()) {
    case 'cookies':
      return 'primary'; // Orange
    case 'headers':
      return 'secondary'; // Purple
    case 'urls':
    case 'url':
      return 'fingerprint'; // Purple
    case 'content':
    case 'script':
      return 'waf'; // Red
    default:
      return 'primary';
  }
};

// ============================================
// Icon Rendering
// ============================================

/**
 * Get detector icon HTML from detector data
 * @param {object} detector - Detector object
 * @param {string} [category] - Detector category
 * @returns {string} HTML for detector icon
 */
Rules.prototype.getDetectorIcon = function(detector, category = '') {
  // Default Scrapfly icon fallback
  const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
  const normalizedCategory = String(category || detector?.category || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const isFingerprintCategory = normalizedCategory === 'fingerprint' || normalizedCategory.includes('fingerprint');

  // Fingerprint SVG icons mapping
  const fingerprintIcons = {
    'audio_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>',
    'battery_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2M14 11v2"/></svg>',
    'canvas_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h4l2-3 2 6 2-3h2"/></svg>',
    'clipboard_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    'crypto_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>',
    'css_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 3h16l-1.5 15L12 21l-6.5-3L4 3z"/><path d="M8 8h8M7 12h6"/></svg>',
    'font_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
    'gamepads_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="2"/><path d="M15 10v4M13 12h4"/></svg>',
    'geolocation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    'hardware_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
    'indexeddb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
    'media_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><polygon points="10,8 16,11 10,14" fill="currentColor"/></svg>',
    'navigator_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="none"/></svg>',
    'orientation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M9 6h6"/></svg>',
    'performance_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>',
    'screen_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    'storage_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M4 20v-3h16v3M4 7v10h16V7"/><path d="M4 11h16M4 15h16"/><circle cx="7" cy="9" r="1" fill="currentColor"/></svg>',
    'timezone_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg>',
    'usb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M7 7l5 5 5-5"/><circle cx="12" cy="16" r="2"/><path d="M6 12v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>',
    'webgl_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    'webrtc_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 10l5-5M20 10V5h-5"/><path d="M9 14l-5 5M4 14v5h5"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  // Image alt texts in the UI language (attribute-escaped: the detector name is user input)
  const escAttr = (value) => (typeof FormatUtils !== 'undefined' && typeof FormatUtils.escapeAttr === 'function')
    ? FormatUtils.escapeAttr(value)
    : String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const i18n = (typeof I18n !== 'undefined') ? I18n : null;
  const iconAlt = escAttr((i18n && i18n.get('ruleFieldIcon')) || 'Icon');
  const scrapflyAlt = escAttr((i18n && i18n.get('rulesUiScrapflyIconAlt')) || 'Scrapfly Icon');
  const iconOwnerName = this.getDetectorDisplayName ? this.getDetectorDisplayName(detector.displayName || detector.name) : (detector.displayName || detector.name);
  const namedIconAlt = escAttr((i18n && i18n.format('rulesUiDetectorIconAltFmt', iconOwnerName)) || `${iconOwnerName} Icon`);

  const wrapFingerprintImage = (src, alt, sourceType, fallback) => {
    const fallbackAttr = fallback ? ` data-fallback="${fallback}"` : '';
    return `
      <div class="detector-icon-svg fingerprint-icon fingerprint-icon-shell">
        <img src="${src}" alt="${alt}" class="detector-icon-img fingerprint-icon-image fingerprint-icon-image--${sourceType}"${fallbackAttr}>
      </div>
    `;
  };

  // Check for custom uploaded icon first
  if (detector.customIcon) {
    if (isFingerprintCategory) {
      return wrapFingerprintImage(detector.customIcon, iconAlt, 'custom', scrapflyIcon);
    }
    return `<img src="${detector.customIcon}" alt="${iconAlt}" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
  }

  // Try to get real icon from detector data
  if (detector.icon) {
    const lowerIcon = detector.icon.toLowerCase ? detector.icon.toLowerCase() : detector.icon;

    if (lowerIcon === 'default') {
      if (isFingerprintCategory) {
        return wrapFingerprintImage(scrapflyIcon, scrapflyAlt, 'default', '');
      }
      return `<img src="${scrapflyIcon}" alt="${scrapflyAlt}" class="detector-icon-img">`;
    }
    // If icon is "custom.png" or "custom", use scrapfly icon directly
    if (detector.icon === 'custom.png' || detector.icon === 'custom') {
      if (isFingerprintCategory) {
        return wrapFingerprintImage(scrapflyIcon, scrapflyAlt, 'default', '');
      }
      return `<img src="${scrapflyIcon}" alt="${scrapflyAlt}" class="detector-icon-img">`;
    }

    // Check for fingerprint SVG icons
    if (fingerprintIcons[lowerIcon]) {
      return `<div class="detector-icon-svg fingerprint-icon fingerprint-icon-shell">${fingerprintIcons[lowerIcon]}</div>`;
    }

    // If it's a URL, return as image
    if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
      if (isFingerprintCategory) {
        return wrapFingerprintImage(detector.icon, iconAlt, 'builtin', scrapflyIcon);
      }
      return `<img src="${detector.icon}" alt="${iconAlt}" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
    }
    // If it's a filename, construct the path to the detectors/icons folder
    if (detector.icon.includes('.png') || detector.icon.includes('.jpg') || detector.icon.includes('.svg') || detector.icon.includes('.webp')) {
      if (isFingerprintCategory) {
        return wrapFingerprintImage(`detectors/icons/${detector.icon}`, namedIconAlt, 'builtin', scrapflyIcon);
      }
      return `<img src="detectors/icons/${detector.icon}" alt="${namedIconAlt}" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
    }
    // Otherwise return as emoji or text
    return detector.icon;
  }

  // Fallback to Scrapfly default icon
  if (isFingerprintCategory) {
    return wrapFingerprintImage(scrapflyIcon, scrapflyAlt, 'default', '');
  }
  return `<img src="${scrapflyIcon}" alt="${scrapflyAlt}" class="detector-icon-img">`;
};
