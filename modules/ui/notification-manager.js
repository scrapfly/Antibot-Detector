/**
 * NotificationManager - Centralized notification system for Scrapfly extension
 * Handles toast notifications, confirmation dialogs, and badge notifications
 */
class NotificationManager {
  constructor() {
    this.toasts = [];
    this.confirmDialogs = [];
    this.initialized = false;
    this.container = null;
    this.maxToasts = 2;
  }

  /**
   * Initialize the notification system
   */
  initialize() {
    if (this.initialized) return;

    // Create main container for notifications
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.className = 'notification-container';
    document.body.appendChild(this.container);

    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
      const link = document.createElement('link');
      link.id = 'notification-styles';
      link.rel = 'stylesheet';
      // Check if chrome.runtime is available
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        link.href = chrome.runtime.getURL('modules/styles/notification-manager.css');
      } else {
        link.href = 'modules/styles/notification-manager.css';
      }
      document.head.appendChild(link);
    }

    this.initialized = true;
  }

  /**
   * Show a toast notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showToast(message, type = 'info', options = {}) {
    if (!this.initialized) this.initialize();

    const defaults = {
      duration: 3000,
      position: 'top-right',
      showProgress: true,
      closeable: true,
      micro: false,
      icon: this.getIcon(type)
    };

    const settings = { ...defaults, ...options };

    // Check for existing toast with same message and type - reset timer instead of creating new
    const existingToast = this.toasts.find(t => t.message === message && t.type === type);
    if (existingToast && existingToast.element && document.contains(existingToast.element)) {
      // Clear existing timeout
      if (existingToast.timeoutId) {
        clearTimeout(existingToast.timeoutId);
      }

      // Reset progress bar animation
      if (settings.showProgress) {
        const progressBar = existingToast.element.querySelector('.notification-progress-bar');
        if (progressBar) {
          // Reset to full width instantly, then animate to 0
          progressBar.style.transition = 'none';
          progressBar.style.width = '100%';
          progressBar.offsetHeight; // Force reflow
          progressBar.style.transition = `width ${settings.duration}ms linear`;
          requestAnimationFrame(() => {
            progressBar.style.width = '0%';
          });
        }
      }

      // Set new timeout
      if (settings.duration > 0) {
        existingToast.timeoutId = setTimeout(() => this.removeToast(existingToast.id), settings.duration);
      }

      return existingToast.id;
    }

    const toastId = `toast-${Date.now()}`;
    let timeoutId = null;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `notification-toast notification-${type} notification-${settings.position}${settings.micro ? ' notification-micro' : ''}`;
    toast.setAttribute('data-show', 'false');

    // Build toast HTML
    toast.innerHTML = `
      <div class="notification-toast-content">
        <span class="notification-icon">${settings.icon}</span>
        <div class="notification-body">
          <div class="notification-message">${message}</div>
        </div>
        ${settings.closeable ? '<button class="notification-close">&times;</button>' : ''}
      </div>
      ${settings.showProgress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
    `;

    // Add to container
    this.container.appendChild(toast);

    // Trigger reflow to enable transition
    toast.offsetHeight;

    // Show toast with animation
    requestAnimationFrame(() => {
      toast.setAttribute('data-show', 'true');
    });

    // Setup close button
    if (settings.closeable) {
      const closeBtn = toast.querySelector('.notification-close');
      closeBtn.addEventListener('click', () => this.removeToast(toastId));
    }

    // Setup auto-dismiss
    if (settings.duration > 0) {
      // Animate progress bar
      if (settings.showProgress) {
        const progressBar = toast.querySelector('.notification-progress-bar');
        progressBar.style.transition = `width ${settings.duration}ms linear`;
        requestAnimationFrame(() => {
          progressBar.style.width = '0%';
        });
      }

      // Remove after duration
      timeoutId = setTimeout(() => this.removeToast(toastId), settings.duration);
    }

    // Track toast with message, type, and timeoutId for deduplication
    this.toasts.push({ id: toastId, element: toast, message, type, timeoutId });

    // Remove oldest toast if exceeded max
    if (this.toasts.length > this.maxToasts) {
      const oldest = this.toasts.shift();
      this.removeToast(oldest.id);
    }

    return toastId;
  }

  /**
   * Remove a toast notification
   * @param {string} toastId - Toast ID to remove
   */
  removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    // Clear timeout if exists
    const toastData = this.toasts.find(t => t.id === toastId);
    if (toastData && toastData.timeoutId) {
      clearTimeout(toastData.timeoutId);
    }

    // Animate out
    toast.setAttribute('data-show', 'false');

    // Remove from DOM after animation
    setTimeout(() => {
      toast.remove();
      this.toasts = this.toasts.filter(t => t.id !== toastId);
    }, 300);
  }

  /**
   * Show success toast
   * @param {string} message - Success message
   * @param {Object} options - Additional options
   */
  success(message, options = {}) {
    return this.showToast(message, 'success', options);
  }

  /**
   * Show error toast
   * @param {string} message - Error message
   * @param {Object} options - Additional options
   */
  error(message, options = {}) {
    return this.showToast(message, 'error', { ...options, duration: 5000 });
  }

  /**
   * Show warning toast
   * @param {string} message - Warning message
   * @param {Object} options - Additional options
   */
  warning(message, options = {}) {
    return this.showToast(message, 'warning', options);
  }

  /**
   * Show info toast
   * @param {string} message - Info message
   * @param {Object} options - Additional options
   */
  info(message, options = {}) {
    return this.showToast(message, 'info', options);
  }

  /**
   * Show a micro toast notification (compact, fast)
   * Ideal for quick feedback like copy confirmations
   * @param {string} message - Short notification message
   * @param {string} type - Notification type (success, error, warning, info)
   * @returns {string} Toast ID
   */
  micro(message, type = 'success') {
    return this.showToast(message, type, {
      duration: 1500,
      showProgress: false,
      closeable: false,
      micro: true
    });
  }

  /**
   * Show confirmation dialog
   * @param {Object} options - Dialog options
   * @returns {Promise<boolean>} User's choice
   */
  confirm(options = {}) {
    if (!this.initialized) this.initialize();

    const defaults = {
      title: 'Confirm',
      message: 'Are you sure?',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      type: 'info', // info, warning, danger
      showIcon: true,
      icon: null
    };

    const settings = { ...defaults, ...options };
    if (!settings.icon) {
      settings.icon = this.getIcon(settings.type === 'danger' ? 'error' : settings.type);
    }

    return new Promise((resolve) => {
      const dialogId = `confirm-${Date.now()}`;

      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'notification-backdrop';
      backdrop.setAttribute('data-show', 'false');

      // Create dialog
      const dialog = document.createElement('div');
      dialog.id = dialogId;
      dialog.className = `notification-confirm notification-confirm-${settings.type}`;
      dialog.setAttribute('data-show', 'false');

      // Build dialog HTML
      dialog.innerHTML = `
        <div class="notification-confirm-content">
          ${settings.showIcon ? `<div class="notification-confirm-icon">${settings.icon}</div>` : ''}
          <h3 class="notification-confirm-title">${settings.title}</h3>
          <p class="notification-confirm-message">${settings.message}</p>
          <div class="notification-confirm-buttons">
            <button class="notification-btn notification-btn-cancel">${settings.cancelText}</button>
            <button class="notification-btn notification-btn-confirm notification-btn-${settings.type}">${settings.confirmText}</button>
          </div>
        </div>
      `;

      // Add to body
      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      // Trigger reflow
      backdrop.offsetHeight;
      dialog.offsetHeight;

      // Show with animation
      requestAnimationFrame(() => {
        backdrop.setAttribute('data-show', 'true');
        dialog.setAttribute('data-show', 'true');
      });

      // Setup event handlers
      const confirmBtn = dialog.querySelector('.notification-btn-confirm');
      const cancelBtn = dialog.querySelector('.notification-btn-cancel');

      const cleanup = () => {
        backdrop.setAttribute('data-show', 'false');
        dialog.setAttribute('data-show', 'false');

        setTimeout(() => {
          backdrop.remove();
          dialog.remove();
        }, 300);
      };

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      backdrop.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  /**
   * Set badge on extension icon
   * @param {string} text - Badge text
   * @param {string} color - Badge color type (success, error, warning, info)
   */
  async setBadge(text, color = 'info') {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      danger: '#ef4444'
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.action) {
        await chrome.action.setBadgeText({ text: String(text) });
        await chrome.action.setBadgeBackgroundColor({ color: colors[color] || colors.info });
      }
    } catch (error) {
      Logger.error('BADGE', 'Failed to set badge', error);
    }
  }

  /**
   * Clear badge from extension icon
   */
  async clearBadge() {
    try {
      if (typeof chrome !== 'undefined' && chrome.action) {
        await chrome.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      Logger.error('BADGE', 'Failed to clear badge', error);
    }
  }

  /**
   * Get icon for notification type
   * @param {string} type - Notification type
   * @returns {string} Icon HTML or emoji
   */
  getIcon(type) {
    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>`
    };

    return icons[type] || icons.info;
  }

  /**
   * Show a loading notification
   * @param {string} message - Loading message
   * @returns {Object} Loading controller with update and close methods
   */
  loading(message = 'Loading...') {
    const toastId = this.showToast(message, 'info', {
      duration: 0,
      closeable: false,
      icon: `<div class="notification-spinner"></div>`
    });

    return {
      update: (newMessage) => {
        const toast = document.getElementById(toastId);
        if (toast) {
          const messageEl = toast.querySelector('.notification-message');
          if (messageEl) messageEl.textContent = newMessage;
        }
      },
      close: () => this.removeToast(toastId)
    };
  }

}

// Create singleton instance
const notificationManager = new NotificationManager();

// Create NotificationHelper as a safe wrapper with fallback methods
const NotificationHelper = {
  // Cache notification settings with 30s TTL for faster checks
  _notificationCache: {
    value: null,
    timestamp: 0,
    ttl: 30000 // 30 seconds
  },

  /**
   * Invalidate the notification settings cache
   * Should be called when notification settings are updated
   */
  invalidateCache() {
    this._notificationCache.value = null;
    this._notificationCache.timestamp = 0;
  },

  /**
   * Check if notifications are enabled in settings
   * Returns cached result if within TTL (30s), reducing storage I/O
   * @returns {Promise<boolean>}
   */
  async areNotificationsEnabled() {
    try {
      // Check cache first
      const now = Date.now();
      const cacheAge = now - this._notificationCache.timestamp;

      if (this._notificationCache.value !== null && cacheAge < this._notificationCache.ttl) {
        return this._notificationCache.value;
      }

      const result = await chrome.storage.local.get(['scrapfly_settings']);

      if (result.scrapfly_settings) {
        const settings = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        const actualSettings = settings.settings || settings;
        const enabled = actualSettings.notificationsEnabled !== false;

        // Cache the result
        this._notificationCache.value = enabled;
        this._notificationCache.timestamp = now;

        return enabled;
      }

      // Cache the default result
      this._notificationCache.value = true;
      this._notificationCache.timestamp = now;

      return true; // Default to enabled
    } catch (error) {
      Logger.error('STORAGE', 'Failed to check notification settings', error);
      return true; // Default to enabled on error
    }
  },

  /**
   * Safe confirm dialog (always shown, regardless of notification settings)
   */
  async confirm(options) {
    if (notificationManager && typeof notificationManager.confirm === 'function') {
      return await notificationManager.confirm(options);
    }
    // Fallback to native confirm
    return confirm(options.message || 'Are you sure?');
  },

  /**
   * Safe success notification (respects notification settings)
   */
  async success(message, options) {
    const enabled = await this.areNotificationsEnabled();
    if (!enabled) return;

    if (notificationManager && typeof notificationManager.success === 'function') {
      return notificationManager.success(message, options);
    }
  },

  /**
   * Safe error notification (always shown, even if notifications disabled)
   */
  error(message, options) {
    // Errors are always shown for user safety
    if (notificationManager && typeof notificationManager.error === 'function') {
      return notificationManager.error(message, options);
    }
    alert('Error: ' + message);
  },

  /**
   * Safe info notification (respects notification settings)
   */
  async info(message, options) {
    const enabled = await this.areNotificationsEnabled();
    if (!enabled) return;

    if (notificationManager && typeof notificationManager.info === 'function') {
      return notificationManager.info(message, options);
    }
  },

  /**
   * Safe warning notification (respects notification settings)
   */
  async warning(message, options) {
    const enabled = await this.areNotificationsEnabled();
    if (!enabled) return;

    if (notificationManager && typeof notificationManager.warning === 'function') {
      return notificationManager.warning(message, options);
    }
  },

  /**
   * Safe micro notification (respects notification settings)
   * Compact, fast toast for quick feedback like copy confirmations
   */
  async micro(message, type = 'success') {
    const enabled = await this.areNotificationsEnabled();
    if (!enabled) return;

    if (notificationManager && typeof notificationManager.micro === 'function') {
      return notificationManager.micro(message, type);
    }
  },

  /**
   * Safe loading indicator
   */
  loading(message) {
    if (notificationManager && typeof notificationManager.loading === 'function') {
      return notificationManager.loading(message);
    }
    return { close: () => {}, update: () => {} };
  },

  /**
   * Safe badge setter
   */
  async setBadge(text, color) {
    if (notificationManager && typeof notificationManager.setBadge === 'function') {
      return await notificationManager.setBadge(text, color);
    }
  },

  /**
   * Safe badge clearer
   */
  async clearBadge() {
    if (notificationManager && typeof notificationManager.clearBadge === 'function') {
      return await notificationManager.clearBadge();
    }
  },

  /**
   * Initialize notification manager if available
   */
  initialize() {
    if (notificationManager && typeof notificationManager.initialize === 'function') {
      return notificationManager.initialize();
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = notificationManager;
} else if (typeof window !== 'undefined') {
  window.NotificationManager = notificationManager;
  window.NotificationHelper = NotificationHelper;
}