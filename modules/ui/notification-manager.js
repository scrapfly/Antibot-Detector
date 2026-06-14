/**
 * NotificationManager - Centralized notification system for Scrapfly extension
 * Handles toast notifications, confirmation dialogs, and badge notifications
 */
class NotificationManager {
  constructor() {
    this.toasts = [];
    this.initialized = false;
    this.container = null;
    this.maxToasts = 2;
  }

  normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  normalizeType(type) {
    const allowedTypes = new Set(['success', 'error', 'warning', 'info', 'danger']);
    return allowedTypes.has(type) ? type : 'info';
  }

  normalizePosition(position) {
    const allowedPositions = new Set(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
    return allowedPositions.has(position) ? position : 'top-right';
  }

  setIconContent(element, iconMarkup) {
    const markup = this.normalizeText(iconMarkup).trim();
    if (markup.startsWith('<svg ') || markup.startsWith('<svg>') || markup.startsWith('<div class="notification-spinner"')) {
      element.innerHTML = markup;
      return;
    }
    element.textContent = markup;
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
      duration: Constants.NOTIFICATION_DURATION,
      position: 'top-right',
      showProgress: true,
      closeable: true,
      micro: false,
      icon: this.getIcon(type)
    };

    const settings = { ...defaults, ...options };
    const safeType = this.normalizeType(type);
    const safePosition = this.normalizePosition(settings.position);
    const messageText = this.normalizeText(message);

    // Check for existing toast with same message and type - reset timer instead of creating new
    const existingToast = this.toasts.find(t => t.message === messageText && t.type === safeType);
    if (existingToast && existingToast.element && document.contains(existingToast.element)) {
      // Clear existing timeout
      if (existingToast.timeoutId) {
        clearTimeout(existingToast.timeoutId);
      }

      // Reset progress bar animation
      if (settings.showProgress) {
        const progressBar = existingToast.element.querySelector('.notification-progress-bar');
        if (progressBar) {
          progressBar.style.transition = 'none';
          progressBar.style.width = '100%';
          progressBar.offsetHeight; // Force reflow before re-animating
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
    toast.className = `notification-toast notification-${safeType} notification-${safePosition}${settings.micro ? ' notification-micro' : ''}`;
    toast.setAttribute('data-show', 'false');

    const content = document.createElement('div');
    content.className = 'notification-toast-content';

    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    this.setIconContent(icon, settings.icon);
    content.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'notification-body';
    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = messageText;
    body.appendChild(messageEl);
    content.appendChild(body);

    if (settings.closeable) {
      const closeButton = document.createElement('button');
      closeButton.className = 'notification-close';
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close notification');
      closeButton.textContent = '\u00d7';
      content.appendChild(closeButton);
    }

    toast.appendChild(content);

    if (settings.showProgress) {
      const progress = document.createElement('div');
      progress.className = 'notification-progress';
      const progressBar = document.createElement('div');
      progressBar.className = 'notification-progress-bar';
      progress.appendChild(progressBar);
      toast.appendChild(progress);
    }

    // Add to container
    this.container.appendChild(toast);

    toast.offsetHeight; // Trigger reflow to enable transition

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

    this.toasts.push({ id: toastId, element: toast, message: messageText, type: safeType, timeoutId });

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
    }, Constants.NOTIFICATION_FADE_MS);
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

    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const defaults = {
      title: (_t && _t.get('notifConfirmTitleDefault')) || 'Confirm',
      message: (_t && _t.get('notifConfirmMessageDefault')) || 'Are you sure?',
      confirmText: (_t && _t.get('notifConfirmTitleDefault')) || 'Confirm',
      cancelText: (_t && _t.get('btnCancel')) || 'Cancel',
      type: 'info',
      showIcon: true,
      icon: null,
      emphasizeAction: false
    };

    const settings = { ...defaults, ...options };
    settings.type = this.normalizeType(settings.type);
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
      const emphasisClass = settings.emphasizeAction ? ' notification-confirm-emphasis' : '';
      dialog.className = `notification-confirm notification-confirm-${settings.type}${emphasisClass}`;
      dialog.setAttribute('data-show', 'false');

      const content = document.createElement('div');
      content.className = 'notification-confirm-content';

      if (settings.showIcon) {
        const icon = document.createElement('div');
        icon.className = 'notification-confirm-icon';
        this.setIconContent(icon, settings.icon);
        content.appendChild(icon);
      }

      const title = document.createElement('h3');
      title.className = 'notification-confirm-title';
      title.textContent = this.normalizeText(settings.title);
      content.appendChild(title);

      const message = document.createElement('p');
      message.className = 'notification-confirm-message';
      message.textContent = this.normalizeText(settings.message);
      content.appendChild(message);

      const buttons = document.createElement('div');
      buttons.className = 'notification-confirm-buttons';

      const confirmButton = document.createElement('button');
      confirmButton.className = `notification-btn notification-btn-confirm notification-btn-${settings.type}`;
      confirmButton.type = 'button';
      confirmButton.textContent = this.normalizeText(settings.confirmText);
      buttons.appendChild(confirmButton);

      const cancelButton = document.createElement('button');
      cancelButton.className = 'notification-btn notification-btn-cancel';
      cancelButton.type = 'button';
      cancelButton.textContent = this.normalizeText(settings.cancelText);
      buttons.appendChild(cancelButton);

      content.appendChild(buttons);
      dialog.appendChild(content);

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
        }, Constants.NOTIFICATION_FADE_MS);
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
  loading(message) {
    if (!message) {
      const _tL = (typeof I18n !== 'undefined') ? I18n : null;
      message = (_tL && _tL.get('notifLoadingDefault')) || 'Loading...';
    }
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

const NotificationHelper = {
  _notificationCache: {
    value: null,
    timestamp: 0,
    ttl: 30000 // 30 seconds
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

      if (typeof Utils !== 'undefined' && typeof Utils.getSettings === 'function') {
        const settings = await Utils.getSettings();
        const enabled = settings.notificationsEnabled !== false;

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
   * Initialize notification manager if available
   */
  initialize() {
    if (notificationManager && typeof notificationManager.initialize === 'function') {
      return notificationManager.initialize();
    }
  }
};

if (typeof window !== 'undefined') {
  window.NotificationManager = notificationManager;
  window.NotificationHelper = NotificationHelper;
}
