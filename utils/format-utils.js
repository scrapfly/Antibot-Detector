/**
 * FormatUtils - Pure formatting and display utility functions
 * Time formatting, HTML escaping, clipboard operations
 */
class FormatUtils {

  /**
   * Convert time duration to milliseconds
   * @param {number} duration - Duration value
   * @param {string} unit - Time unit ('minutes', 'hours', 'days')
   * @returns {number} Duration in milliseconds
   */
  static convertToMilliseconds(duration, unit) {
    const conversions = {
      minutes: duration * 60 * 1000,
      hours: duration * 60 * 60 * 1000,
      days: duration * 24 * 60 * 60 * 1000
    };
    return conversions[unit] || conversions.hours;
  }

  /**
   * Format timestamp as "X time ago" (e.g., "3h ago", "2d ago")
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Human-readable time ago string
   */
  static getTimeAgo(timestamp) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const fmt = (key, fallback, n) => (t && t.format(key, n)) || fallback;
    const get = (key, fallback) => (t && t.get(key)) || fallback;

    if (!timestamp) return get('timeUnknown', 'Unknown');

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 0) return get('timeJustNow', 'Just now');

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return fmt('timeDaysAgoFmt', `${days}d ago`, days);
    if (hours > 0) return fmt('timeHoursAgoFmt', `${hours}h ago`, hours);
    if (minutes > 0) return fmt('timeMinutesAgoFmt', `${minutes}m ago`, minutes);
    if (seconds > 0) return fmt('timeSecondsAgoFmt', `${seconds}s ago`, seconds);
    return get('timeJustNow', 'Just now');
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} HTML-escaped text
   */
  static escapeHtml(text) {
    if (!text) return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Escape a value for use inside an HTML attribute ("..."). escapeHtml alone
   * does NOT escape quotes, so it is unsafe for attribute context — a value
   * containing a double-quote could break out. Use this for src/alt/title/etc.
   * @param {*} text
   * @returns {string}
   */
  static escapeAttr(text) {
    return FormatUtils.escapeHtml(text)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Copy text to clipboard with optional visual feedback
   * @param {string} text - Text to copy
   * @param {object} options - Feedback options
   * @param {HTMLElement|null} options.element - Element to show inline feedback on
   * @param {boolean} [options.notify=true] - Display toast notification on success
   * @param {string} [options.notificationMessage='Copied'] - Success toast message
   * @param {string} [options.inlineMessage='Copied!'] - Temporary inline message
   * @param {number} [options.revertDelay=1600] - Delay before inline message reverts (ms)
   * @param {boolean} [options.useMicroToast=true] - Use compact micro toast vs full toast
   * @returns {Promise<boolean>} True if copy succeeded
   */
  static async copyToClipboard(text, {
    element = null,
    notify = true,
    notificationMessage = null,
    inlineMessage = null,
    revertDelay = 1600,
    useMicroToast = true
  } = {}) {
    const _i18n = (typeof I18n !== 'undefined') ? I18n : null;
    if (notificationMessage == null) {
      notificationMessage = (_i18n && _i18n.tr('copiedNotification', 'Copied')) || 'Copied';
    }
    if (inlineMessage == null) {
      inlineMessage = (_i18n && _i18n.tr('copiedInlineMsg', '\u2713 Copied!')) || '\u2713 Copied!';
    }
    let success = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      Logger.error('UTIL', 'Failed to copy to clipboard:', error);
      success = false;
    }

    if (!success) {
      if (notify && typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.error === 'function') {
        NotificationHelper.error('Failed to copy to clipboard');
      }
      return false;
    }

    // Only show toast if no inline feedback element is provided (avoid redundancy)
    if (notify && !element && typeof NotificationHelper !== 'undefined') {
      if (useMicroToast && typeof NotificationHelper.micro === 'function') {
        NotificationHelper.micro(notificationMessage);
      } else if (typeof NotificationHelper.success === 'function') {
        NotificationHelper.success(notificationMessage);
      }
    }

    if (element && typeof document !== 'undefined') {
      const isInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const originalValue = isInput ? element.value : element.textContent;
      const originalHtml = !isInput ? element.innerHTML : null;

      element.dataset.copyOriginal = originalValue ?? '';
      if (!isInput && originalHtml !== null && originalHtml !== undefined) {
        element.dataset.copyOriginalHtml = originalHtml;
      }

      if (isInput) {
        element.value = inlineMessage;
      } else {
        element.textContent = inlineMessage;
      }

      element.classList.add('copy-feedback-active');

      window.setTimeout(() => {
        if (!element.dataset) {
          return;
        }

        const original = element.dataset.copyOriginal;
        const originalInnerHtml = element.dataset.copyOriginalHtml;
        if (isInput) {
          if (original !== undefined) {
            element.value = original;
          }
        } else if (originalInnerHtml !== undefined) {
          element.innerHTML = originalInnerHtml;
        } else if (original !== undefined) {
          element.textContent = original;
        }

        element.classList.remove('copy-feedback-active');
        delete element.dataset.copyOriginal;
        if (element.dataset.copyOriginalHtml !== undefined) {
          delete element.dataset.copyOriginalHtml;
        }
      }, revertDelay);
    }

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.FormatUtils = FormatUtils;
} else if (typeof self !== 'undefined') {
  self.FormatUtils = FormatUtils;
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = FormatUtils; }
