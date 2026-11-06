/**
 * NotificationManager - Centralized notification system for Scrapfly extension
 * Handles toast notifications, confirmation dialogs, and badge notifications
 */
class NotificationManager {
  /** How long an error stays when its caller does not say (the others use Constants.NOTIFICATION_DURATION) */
  static ERROR_DURATION_MS = 5000;

  constructor() {
    // On the screen, oldest first. One that is fading out stays here until it is gone, and keeps its place until then
    this.toasts = [];
    // Toasts that go away by themselves and wait for a place, oldest first
    this.waiting = [];
    this.initialized = false;
    this.container = null;
    // Toasts that go away by themselves on the screen at once. A spinner, which stays until it is closed, is not counted
    this.maxToasts = 2;
    // A longer waiting line (a loop that toasts every item) gives up its oldest notes, so nothing shows minutes late
    this.maxWaiting = 8;
  }

  /** A time in milliseconds that a caller asked for: a number from 0 up (0 = until it is closed). Anything else is "not given". */
  static durationOf(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
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
    // A screen reader says what appears here: a copy, a save or an error is otherwise a box that fades after a few seconds
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
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
   * Show a toast notification. It stays for `options.duration` (0 = until it is closed), but the time stands still while the
   * pointer is over it or the keyboard is in it. With two toasts on the screen already, a new one waits for a place instead of
   * pushing an older one out before it could be read.
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showToast(message, type = 'info', options = {}) {
    if (!this.initialized) this.initialize();
    // Places that are free go to the toasts that waited, before this one asks for one
    this.showWaiting();

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
    // A duration that is not a number (undefined, a text) is "not given": the default, never "stays until it is closed"
    settings.duration = NotificationManager.durationOf(settings.duration, defaults.duration);
    const safeType = this.normalizeType(type);
    const messageText = this.normalizeText(message);

    // The same message and type again starts its time over instead of stacking a copy. One that is already leaving is not
    // reused: it would be gone a moment later, and take the new message with it
    const showing = this.toasts.find(t => !t.leaving && t.message === messageText && t.type === safeType);
    if (showing) {
      if (settings.duration > 0) {
        showing.persistent = false;
        this.startCountdown(showing, settings.duration);
      }
      return showing.id;
    }
    const waiting = this.waiting.find(w => w.message === messageText && w.type === safeType);
    if (waiting) return waiting.id;

    const entry = {
      // Unique even for toasts shown in the same millisecond (ids drive removal)
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: messageText,
      type: safeType,
      position: this.normalizePosition(settings.position),
      settings
    };
    if (settings.duration > 0 && this.timedOnScreen() >= this.maxToasts) {
      this.waiting.push(entry);
      this.trimWaiting();
      return entry.id;
    }
    this.mountToast(entry);
    return entry.id;
  }

  /**
   * Build a toast, put it on the screen and start its countdown (a toast that stays until it is closed has none).
   * @param {Object} entry - From showToast()
   */
  mountToast(entry) {
    const { id: toastId, message: messageText, type: safeType, position: safePosition, settings } = entry;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `notification-toast notification-${safeType} notification-${safePosition}${settings.micro ? ' notification-micro' : ''}`;
    toast.setAttribute('data-show', 'false');
    // An error interrupts; the rest wait for the reader to finish
    if (safeType === 'error') toast.setAttribute('role', 'alert');

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

    const record = {
      id: toastId, element: toast, message: messageText, type: safeType,
      persistent: !(settings.duration > 0), duration: settings.duration, remaining: settings.duration,
      startedAt: 0, timeoutId: null, hovered: false, focused: false, leaving: false
    };
    this.toasts.push(record);

    // Setup close button
    if (settings.closeable) {
      const closeBtn = toast.querySelector('.notification-close');
      closeBtn.addEventListener('click', () => this.removeToast(toastId));
    }

    // The time stands still while the pointer is over the toast or the keyboard is in it (its close button)
    toast.addEventListener('mouseenter', () => { record.hovered = true; this.pauseCountdown(record); });
    toast.addEventListener('mouseleave', () => { record.hovered = false; this.resumeCountdown(record); });
    toast.addEventListener('focusin', () => { record.focused = true; this.pauseCountdown(record); });
    toast.addEventListener('focusout', () => { record.focused = false; this.resumeCountdown(record); });

    // Setup auto-dismiss
    if (!record.persistent) this.startCountdown(record, settings.duration);
  }

  /** How many toasts that go away by themselves are on the screen (one fading out still holds its place until it is gone). */
  timedOnScreen() {
    return this.toasts.filter(toast => !toast.persistent).length;
  }

  /** The pointer is over the toast or the keyboard is in it: its time waits. */
  isHeld(record) {
    return record.hovered || record.focused;
  }

  /** (Re)start a toast's countdown with a whole `ms`. */
  startCountdown(record, ms) {
    clearTimeout(record.timeoutId);
    record.timeoutId = null;
    record.duration = ms;
    record.remaining = ms;
    // Starting over while it is held: the line fills up again and waits
    if (this.isHeld(record)) this.setProgress(record, 100, 0);
    else this.runCountdown(record);
  }

  /** Let what is left of the time run; the line runs down in step with it. */
  runCountdown(record) {
    if (record.persistent || record.leaving || record.timeoutId) return;
    record.startedAt = Date.now();
    record.timeoutId = setTimeout(() => this.removeToast(record.id), record.remaining);
    this.setProgress(record, record.duration > 0 ? (record.remaining / record.duration) * 100 : 0, record.remaining);
  }

  /** Stop the clock and keep what is left (the line stops where it is). */
  pauseCountdown(record) {
    if (!record.timeoutId) return;
    clearTimeout(record.timeoutId);
    record.timeoutId = null;
    record.remaining = Math.max(0, record.remaining - (Date.now() - record.startedAt));
    this.setProgress(record, record.duration > 0 ? (record.remaining / record.duration) * 100 : 0, 0);
  }

  /** The pointer and the keyboard have both left: the rest of the time runs again. */
  resumeCountdown(record) {
    if (!this.isHeld(record)) this.runCountdown(record);
  }

  /**
   * Put a toast's countdown line at `percent` and, with `ms`, let it run down to nothing in that time.
   * @param {Object} record
   * @param {number} percent
   * @param {number} ms
   */
  setProgress(record, percent, ms) {
    const bar = record.element.querySelector('.notification-progress-bar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = `${percent}%`;
    if (!(ms > 0)) return;
    bar.offsetHeight; // Force reflow so the transition starts from the width just set
    bar.style.transition = `width ${ms}ms linear`;
    requestAnimationFrame(() => {
      bar.style.width = '0%';
    });
  }

  /** A toast that other code took out of the page (a test clearing the screen) must not keep a place. */
  forgetRemoved() {
    const gone = this.toasts.filter(toast => !document.contains(toast.element));
    if (!gone.length) return;
    for (const toast of gone) clearTimeout(toast.timeoutId);
    this.toasts = this.toasts.filter(toast => !gone.includes(toast));
  }

  /** Give the places that are free to the toasts that waited, oldest first. */
  showWaiting() {
    this.forgetRemoved();
    while (this.waiting.length && this.timedOnScreen() < this.maxToasts) {
      this.mountToast(this.waiting.shift());
    }
  }

  /** Keep the waiting line short: the oldest note that is not an error is given up first. */
  trimWaiting() {
    while (this.waiting.length > this.maxWaiting) {
      const index = this.waiting.findIndex(entry => entry.type !== 'error');
      this.waiting.splice(index === -1 ? 0 : index, 1);
    }
  }

  /**
   * Remove a toast notification (one that still waits for a place never shows)
   * @param {string} toastId - Toast ID to remove
   */
  removeToast(toastId) {
    const queued = this.waiting.findIndex(entry => entry.id === toastId);
    if (queued !== -1) {
      this.waiting.splice(queued, 1);
      return;
    }
    const record = this.toasts.find(toast => toast.id === toastId);
    if (!record || record.leaving) return;
    record.leaving = true;
    clearTimeout(record.timeoutId);
    record.timeoutId = null;

    // Animate out
    record.element.setAttribute('data-show', 'false');

    // Remove from DOM after animation; the place it held goes to the toast that waited longest
    setTimeout(() => {
      record.element.remove();
      this.toasts = this.toasts.filter(toast => toast !== record);
      this.showWaiting();
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
   * Show error toast. It stays 5 seconds unless the caller asks for another time (the update check asks for 8).
   * @param {string} message - Error message
   * @param {Object} options - Additional options
   */
  error(message, options = {}) {
    const duration = NotificationManager.durationOf(options.duration, NotificationManager.ERROR_DURATION_MS);
    return this.showToast(message, 'error', { ...options, duration });
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
   * Show a dialog with form fields in its body — same look as confirm().
   * Resolves to true for the confirm button (or Enter inside a text field)
   * and to false for Cancel, ✕, Escape and the backdrop. The caller keeps
   * the field elements it passed as `content` and reads them after it
   * resolves.
   *
   * @param {Object} options - Same fields as confirm(), plus:
   * @param {HTMLElement} options.content - Replaces the message in the body
   * @param {HTMLElement} [options.focus] - Field focused on open
   * @returns {Promise<boolean>}
   */
  form(options = {}) {
    const settings = this.dialogSettings({ tone: 'info', ...options });
    return this.openDialog(settings, 'info', {
      buttons: [
        { value: false, text: settings.cancelText, className: 'notification-btn-cancel' },
        { value: true, text: settings.confirmText, className: 'notification-btn-confirm notification-btn-info' }
      ],
      cancelValue: false,
      enterValue: true,
      focusValue: true,
      content: options.content,
      focusElement: options.focus
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
      if (spec.content) {
        // A form: the caller's fields instead of a message
        dialog.removeAttribute('aria-describedby');
        body.appendChild(spec.content);
      } else {
        const message = document.createElement('p');
        message.className = 'notification-confirm-message';
        message.id = `${dialogId}-message`;
        message.textContent = this.normalizeText(settings.message).replace(/<br\s*\/?>/gi, '\n');
        body.appendChild(message);
      }

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
      const focusStart = () => (spec.focusElement || buttonFor(spec.focusValue)).focus({ preventScroll: true });

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
      const focusables = () => Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));

      const onKeyDown = (event) => {
        // Only the top-most dialog reacts
        const open = document.querySelectorAll('.notification-confirm[data-open="true"]');
        if (open[open.length - 1] !== dialog) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(spec.cancelValue);
        } else if (event.key === 'Enter') {
          const active = document.activeElement;
          // A list or a multi-line field uses Enter itself
          if (active && (active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
          event.preventDefault();
          event.stopImmediatePropagation();
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

/**
 * A toast is feedback: when one cannot be drawn, the problem is logged and the action it reports carries on (the caller's own
 * error handling must not take a toast for the failure of the copy, the save or the export).
 */
function showToastSafely(kind, ...args) {
  try {
    return notificationManager[kind](...args);
  } catch (error) {
    Logger.error('UI', `A ${kind} notification could not be shown`, error);
    return undefined;
  }
}

/**
 * What the pages call. A toast answers something the person just did: a copy, a save, a delete, an export, a choice, an
 * error. It always shows. Settings → Notifications switches off the alerts about detections (the browser's own
 * notifications, which the service worker sends and checks the setting for), not the answer to a click.
 */
const NotificationHelper = {
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
   * Form dialog (always shown). Resolves to true when confirmed and to false
   * for every dismissal; without the dialog UI nothing can be asked, so false.
   * @param {Object} options - See NotificationManager.form()
   * @returns {Promise<boolean>}
   */
  async form(options = {}) {
    if (notificationManager && typeof notificationManager.form === 'function') {
      return await notificationManager.form(options);
    }
    return false;
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
   * Safe success notification
   */
  success(message, options) {
    return showToastSafely('success', message, options);
  },

  /**
   * Safe error notification (an error is shown for 5 seconds unless `options.duration` says otherwise)
   */
  error(message, options) {
    if (notificationManager && typeof notificationManager.error === 'function') {
      return notificationManager.error(message, options);
    }
    alert((typeof I18n !== 'undefined' && I18n.format('popupUiNativeErrorFmt', message)) || ('Error: ' + message));
  },

  /**
   * Safe info notification
   */
  info(message, options) {
    return showToastSafely('info', message, options);
  },

  /**
   * Safe warning notification
   */
  warning(message, options) {
    return showToastSafely('warning', message, options);
  },

  /**
   * Safe micro notification
   * Compact, fast toast for quick feedback like copy confirmations
   */
  micro(message, type = 'success') {
    return showToastSafely('micro', message, type);
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
