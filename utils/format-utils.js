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
    if (!timestamp) return 'Unknown';

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 0) return 'Just now';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'Just now';
  }

  /**
   * Format time until expiry (e.g., "2h 30m", "45m", "expired")
   * @param {number} expiresAt - Expiry timestamp in milliseconds
   * @returns {string} Time remaining until expiry
   */
  static getTimeUntil(expiresAt) {
    if (!expiresAt) return '-';

    const diff = expiresAt - Date.now();

    if (diff <= 0) return 'Expired';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Format timestamp as localized date/time string
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @param {object} options - Intl.DateTimeFormat options
   * @returns {string} Formatted date/time string
   */
  static formatTimestamp(timestamp, options = {}) {
    if (!timestamp) return 'Unknown';

    const defaults = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };

    try {
      return new Date(timestamp).toLocaleString(undefined, { ...defaults, ...options });
    } catch (error) {
      return new Date(timestamp).toString();
    }
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
    notificationMessage = 'Copied',
    inlineMessage = '\u2713 Copied!',
    revertDelay = 1600,
    useMicroToast = true
  } = {}) {
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormatUtils;
} else if (typeof window !== 'undefined') {
  window.FormatUtils = FormatUtils;
} else if (typeof self !== 'undefined') {
  self.FormatUtils = FormatUtils;
}
