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
      // Toasts are text only (2.8); callers may still pass an icon (e.g. the loading spinner)
      icon: null
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

    // Unique even for toasts shown in the same millisecond (ids drive removal)
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let timeoutId = null;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `notification-toast notification-${safeType} notification-${safePosition}${settings.micro ? ' notification-micro' : ''}`;
    toast.setAttribute('data-show', 'false');

    const content = document.createElement('div');
    content.className = 'notification-toast-content';

    if (settings.icon) {
      const icon = document.createElement('span');
      icon.className = 'notification-icon';
      this.setIconContent(icon, settings.icon);
      content.appendChild(icon);
    }

    const body = document.createElement('div');
    body.className = 'notification-body';
    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = messageText;
    body.appendChild(messageEl);
    content.appendChild(body);

    if (settings.closeable) {
      const closeButton = CloseButton.create({ className: 'notification-close', small: true });
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
   * Map a dialog's options to its tone: 'warning' (amber), 'danger' (red) or
   * 'info' (blue). An explicit `tone` wins; otherwise it follows `type`.
   * @param {Object} settings - Normalised confirm options
   * @returns {'warning'|'danger'|'info'}
   */
  confirmTone(settings) {
    const tones = new Set(['warning', 'danger', 'info']);
    if (tones.has(settings.tone)) return settings.tone;
    if (settings.type === 'danger' || settings.type === 'error') return 'danger';
    if (settings.type === 'warning') return 'warning';
    return 'info';
  }

  /**
   * Show confirmation dialog — the 2.8 modal look: header with a tone-tinted
   * icon tile, left-aligned title and the shared .btn-close; body text;
   * footer with Cancel + primary right-aligned side by side.
   *
   * Keyboard: Escape cancels; Enter activates the focused button, and
   * confirms when focus is anywhere else in the dialog. Tab is trapped in
   * the dialog. Focus starts on the primary button, or on Cancel for
   * danger dialogs so a stray Enter never destroys anything.
   *
   * A yes/no dialog cannot offer two different actions: its Cancel is also
   * what ✕, Escape and the backdrop return. Use choose() when the dialog
   * needs more than one action besides Cancel (e.g. merge vs replace).
   *
   * @param {Object} options - Dialog options
   * @param {string} [options.title]
   * @param {string} [options.message] - Plain text; `<br>` becomes a line break
   * @param {string} [options.confirmText]
   * @param {string} [options.cancelText]
   * @param {string} [options.type] - info | warning | danger (legacy; drives the tone)
   * @param {string} [options.tone] - warning | danger | info (overrides type)
   * @param {boolean} [options.showIcon]
   * @param {string} [options.icon] - SVG markup replacing the tone icon
   * @param {boolean} [options.emphasizeAction] - accepted for compatibility;
   *   the primary colour now always follows the tone
   * @returns {Promise<boolean>} User's choice
   */
  confirm(options = {}) {
    const settings = this.dialogSettings(options);
    const tone = this.confirmTone(settings);
    return this.openDialog(settings, tone, {
      buttons: [
        { value: false, text: settings.cancelText, className: 'notification-btn-cancel' },
        { value: true, text: settings.confirmText, className: `notification-btn-confirm notification-btn-${tone}` }
      ],
      cancelValue: false,
      enterValue: true,
      focusValue: tone === 'danger' ? false : true
    });
  }

  /**
   * Show a dialog offering several actions plus Cancel — same look as
   * confirm(). Resolves to the clicked action's `value`; Cancel, ✕, Escape
   * and a backdrop click all resolve to `cancelValue` ('cancel'), so a
   * dismissal can never pick an action.
   *
   * Enter activates the focused button. With focus anywhere else it picks
   * `defaultValue` when one is given, otherwise it does nothing. Focus starts
   * on the `defaultValue` action, or on Cancel.
   *
   * @param {Object} options - Same fields as confirm(), plus:
   * @param {Array<{value: string, text: string, tone?: string, primary?: boolean}>} options.actions
   *   Buttons after Cancel, in footer order. `primary` fills the button with
   *   its tone; a non-primary 'danger' action gets the outlined danger style.
   * @param {string} [options.defaultValue] - Action Enter picks; never a danger one
   * @param {string} [options.cancelValue='cancel']
   * @returns {Promise<string>} The chosen action value, or cancelValue
   */
  choose(options = {}) {
    const settings = this.dialogSettings(options);
    const tone = this.confirmTone(settings);
    const cancelValue = options.cancelValue !== undefined ? options.cancelValue : 'cancel';
    const actions = Array.isArray(options.actions) ? options.actions : [];
    const buttons = [{ value: cancelValue, text: settings.cancelText, className: 'notification-btn-cancel' }];
    for (const action of actions) {
      const actionTone = this.confirmTone({ tone: action.tone, type: action.tone || settings.type });
      let className = 'notification-btn-cancel';
      if (action.primary) className = `notification-btn-confirm notification-btn-${actionTone}`;
      else if (actionTone === 'danger') className = 'notification-btn-destructive';
      buttons.push({ value: action.value, text: action.text, className });
    }
    const safeDefault = actions.some(a => a.value === options.defaultValue && a.tone !== 'danger')
      ? options.defaultValue
      : undefined;
    return this.openDialog(settings, tone, {
      buttons,
      cancelValue,
      enterValue: safeDefault,
      focusValue: safeDefault !== undefined ? safeDefault : cancelValue
    });
  }

  /**
   * Fill confirm()/choose() options with the localised defaults.
   * @param {Object} options
   * @returns {Object}
   */
  dialogSettings(options) {
    if (!this.initialized) this.initialize();

    const _t = (typeof I18n !== 'undefined') ? I18n : null;
    const defaults = {
      title: (_t && _t.get('notifConfirmTitleDefault')) || 'Confirm',
      message: (_t && _t.get('notifConfirmMessageDefault')) || 'Are you sure?',
      confirmText: (_t && _t.get('notifConfirmTitleDefault')) || 'Confirm',
      cancelText: (_t && _t.get('btnCancel')) || 'Cancel',
      type: 'info',
      tone: null,
      showIcon: true,
      icon: null,
      emphasizeAction: false
    };

    const settings = { ...defaults, ...options };
    settings.type = this.normalizeType(settings.type);
    return settings;
  }

  /**
   * Build, show and wire a modal dialog. Resolves with the value of the
   * button the user activated, or `cancelValue` for ✕, Escape and the
   * backdrop.
   * @param {Object} settings - From dialogSettings()
   * @param {'warning'|'danger'|'info'} tone
   * @param {Object} spec
   * @param {Array<{value: *, text: string, className: string}>} spec.buttons - Footer order
   * @param {*} spec.cancelValue
   * @param {*} [spec.enterValue] - Enter with focus off the buttons; undefined = ignore
   * @param {*} spec.focusValue - Button focused on open
   * @returns {Promise<*>}
   */
  openDialog(settings, tone, spec) {
    if (!settings.icon) {
      settings.icon = this.getIcon(tone === 'danger' ? 'error' : tone);
    }

    return new Promise((resolve) => {
      const dialogId = `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const previousFocus = document.activeElement;

      const backdrop = document.createElement('div');
      backdrop.className = 'notification-backdrop';
      backdrop.setAttribute('data-show', 'false');

      const dialog = document.createElement('div');
      dialog.id = dialogId;
      dialog.className = `notification-confirm notification-confirm-${settings.type} notification-confirm--${tone}`;
      dialog.setAttribute('data-show', 'false');
      dialog.setAttribute('role', tone === 'info' ? 'dialog' : 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
      dialog.setAttribute('aria-describedby', `${dialogId}-message`);

      // Header: icon tile + title + close
      const header = document.createElement('div');
      header.className = 'notification-confirm-header';

      if (settings.showIcon) {
        const icon = document.createElement('span');
        icon.className = 'notification-confirm-icon';
        icon.setAttribute('aria-hidden', 'true');
        this.setIconContent(icon, settings.icon);
        header.appendChild(icon);
      }

      const title = document.createElement('h3');
      title.className = 'notification-confirm-title';
      title.id = `${dialogId}-title`;
      title.textContent = this.normalizeText(settings.title);
      header.appendChild(title);

      const closeButton = (typeof CloseButton !== 'undefined' && CloseButton.create)
        ? CloseButton.create({ className: 'notification-confirm-close' })
        : null;
      if (closeButton) header.appendChild(closeButton);

      // Body: plain text; translated messages use <br> for line breaks
      const body = document.createElement('div');
      body.className = 'notification-confirm-body';
      const message = document.createElement('p');
      message.className = 'notification-confirm-message';
      message.id = `${dialogId}-message`;
      message.textContent = this.normalizeText(settings.message).replace(/<br\s*\/?>/gi, '\n');
      body.appendChild(message);

      // Footer: secondary Cancel first, actions right-aligned after it
      const footer = document.createElement('div');
      footer.className = 'notification-confirm-footer notification-confirm-buttons';

      const buttons = spec.buttons.map(({ value, text, className }) => {
        const button = document.createElement('button');
        button.className = `notification-btn ${className}`;
        button.type = 'button';
        button.textContent = this.normalizeText(text);
        footer.appendChild(button);
        return { value, button };
      });
      const buttonFor = (value) => {
        const match = buttons.find(entry => entry.value === value);
        return (match || buttons[0]).button;
      };
      const focusStart = () => buttonFor(spec.focusValue).focus({ preventScroll: true });

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);

      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      // Trigger reflow so the entry transition runs
      backdrop.offsetHeight;
      dialog.offsetHeight;

      requestAnimationFrame(() => {
        backdrop.setAttribute('data-show', 'true');
        dialog.setAttribute('data-show', 'true');
      });

      // Safe default: destructive dialogs start on Cancel
      focusStart();

      let settled = false;
      const focusables = () => Array.from(dialog.querySelectorAll('button:not([disabled])'));

      const onKeyDown = (event) => {
        // Only the top-most dialog reacts
        const open = document.querySelectorAll('.notification-confirm[data-open="true"]');
        if (open[open.length - 1] !== dialog) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(spec.cancelValue);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.stopImmediatePropagation();
          const active = document.activeElement;
          const focused = buttons.find(entry => entry.button === active);
          if (focused) finish(focused.value);
          else if (active === closeButton) finish(spec.cancelValue);
          else if (spec.enterValue !== undefined) finish(spec.enterValue);
        } else if (event.key === 'Tab') {
          const items = focusables();
          if (!items.length) return;
          const index = items.indexOf(document.activeElement);
          let next;
          if (index === -1) next = event.shiftKey ? items[items.length - 1] : items[0];
          else next = items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length];
          event.preventDefault();
          event.stopImmediatePropagation();
          next.focus();
        }
      };

      // Keep focus inside the dialog if something outside grabs it
      const onFocusIn = (event) => {
        if (!dialog.contains(event.target)) focusStart();
      };

      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('focusin', onFocusIn, true);
        dialog.removeAttribute('data-open');
        backdrop.setAttribute('data-show', 'false');
        dialog.setAttribute('data-show', 'false');

        setTimeout(() => {
          backdrop.remove();
          dialog.remove();
        }, Constants.NOTIFICATION_FADE_MS);

        if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
          previousFocus.focus({ preventScroll: true });
        }
        resolve(value);
      };

      dialog.setAttribute('data-open', 'true');
      window.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('focusin', onFocusIn, true);

      for (const { value, button } of buttons) {
        button.addEventListener('click', () => finish(value));
      }
      if (closeButton) closeButton.addEventListener('click', () => finish(spec.cancelValue));
      backdrop.addEventListener('click', () => finish(spec.cancelValue));
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
    return confirm(options.message || ((typeof I18n !== 'undefined' && I18n.get('notifConfirmMessageDefault')) || 'Are you sure?'));
  },

  /**
   * Several-action dialog (always shown). Without the dialog UI there is no
   * safe way to offer more than yes/no, so it resolves to the cancel value.
   */
  async choose(options = {}) {
    if (notificationManager && typeof notificationManager.choose === 'function') {
      return await notificationManager.choose(options);
    }
    return options.cancelValue !== undefined ? options.cancelValue : 'cancel';
  },

  /**
   * Ask how to import data that would change what is already stored.
   * Buttons: Cancel · Replace (danger, explicit click only) · Merge.
   * Cancel, ✕, Escape and the backdrop all resolve to 'cancel' — a
   * dismissal never replaces anything.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.replaceText] - Replace label (default: localised "Replace")
   * @returns {Promise<'merge'|'replace'|'cancel'>}
   */
  async chooseImportMode(options = {}) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const tr = (key, fallback) => (t && t.get(key)) || fallback;
    const choice = await this.choose({
      title: options.title,
      message: options.message,
      type: 'info',
      cancelText: tr('btnCancel', 'Cancel'),
      actions: [
        { value: 'replace', text: options.replaceText || tr('replaceOption', 'Replace'), tone: 'danger' },
        { value: 'merge', text: tr('mergeOption', 'Merge'), tone: 'info', primary: true }
      ],
      defaultValue: 'merge',
      cancelValue: 'cancel'
    });
    return choice === 'merge' || choice === 'replace' ? choice : 'cancel';
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
    alert((typeof I18n !== 'undefined' && I18n.format('popupUiNativeErrorFmt', message)) || ('Error: ' + message));
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
