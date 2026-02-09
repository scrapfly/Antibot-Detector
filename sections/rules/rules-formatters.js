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
 * Get relative time string from a date
 * @param {Date} date - Date object
 * @returns {string} Relative time string
 */
Rules.prototype.getRelativeTime = function(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1h ago' : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  } else {
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
  }
};

/**
 * Format date in compact style
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
Rules.prototype.formatCompactDate = function(date) {
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
    return 'Unknown';
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
 * Format date for display
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
Rules.prototype.formatDateForDisplay = function(date) {
  const options = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  };
  return date.toLocaleString(undefined, options);
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

      // Get dynamic color from CategoryManager tags using original methodStr (preserve underscores)
      const tagColor = this.categoryManager.getTagColor(methodStr);

      // Format the name for display only (replace underscores and uppercase)
      const methodName = methodStr.replace(/_/g, ' ').toUpperCase();

      if (tagColor && tagColor !== '#666666') {
        // Parse hex color to RGB for semi-transparent background
        const hex = tagColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // Use muted/subtle style: semi-transparent background with colored text
        methodsHtml += `<span class="method-tag" style="background: rgba(${r}, ${g}, ${b}, 0.25); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.4);">${methodName}</span>`;
      } else {
        // Fallback to CSS class
        const badgeClass = this.getMethodBadgeClass(methodStr);
        methodsHtml += `<span class="method-tag ${badgeClass}">${methodName}</span>`;
      }
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
  return this.categoryManager.getCategoryDisplayName(category) || 'Detection';
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
 * @returns {string} HTML for detector icon
 */
Rules.prototype.getDetectorIcon = function(detector) {
  // Default Scrapfly icon fallback
  const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');

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

  // Check for custom uploaded icon first
  if (detector.customIcon) {
    return `<img src="${detector.customIcon}" alt="Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
  }

  // Try to get real icon from detector data
  if (detector.icon) {
    const lowerIcon = detector.icon.toLowerCase ? detector.icon.toLowerCase() : detector.icon;

    if (lowerIcon === 'default') {
      return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
    }
    // If icon is "custom.png" or "custom", use scrapfly icon directly
    if (detector.icon === 'custom.png' || detector.icon === 'custom') {
      return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
    }

    // Check for fingerprint SVG icons
    if (fingerprintIcons[lowerIcon]) {
      return `<div class="detector-icon-svg fingerprint-icon">${fingerprintIcons[lowerIcon]}</div>`;
    }

    // If it's a URL, return as image
    if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
      return `<img src="${detector.icon}" alt="Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
    }
    // If it's a filename, construct the path to the detectors/icons folder
    if (detector.icon.includes('.png') || detector.icon.includes('.jpg') || detector.icon.includes('.svg') || detector.icon.includes('.webp')) {
      return `<img src="detectors/icons/${detector.icon}" alt="${detector.displayName || detector.name} Icon" class="detector-icon-img" data-fallback="${scrapflyIcon}">`;
    }
    // Otherwise return as emoji or text
    return detector.icon;
  }

  // Fallback to Scrapfly default icon
  return `<img src="${scrapflyIcon}" alt="Scrapfly Icon" class="detector-icon-img">`;
};
