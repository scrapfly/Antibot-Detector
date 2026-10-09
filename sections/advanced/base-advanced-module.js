/**
 * BaseAdvancedModule
 * Base class for Advanced Section detector modules
 *
 * Provides common functionality for:
 * - Capture history management
 * - Event listeners
 * - Message handling
 * - UI rendering
 *
 * Child classes should override:
 * - renderTools() - Render module-specific tools UI
 * - setupToolListeners() - Setup tool event listeners
 * - renderCaptureHistoryItems() - Optional: custom history item rendering
 */

Logger.debug('UI', '[BaseAdvancedModule] Loading...');

class BaseAdvancedModule {
    /** Display name map: moduleName → human-readable name for notifications */
    static DISPLAY_NAMES = {
        'akamai': 'Akamai',
        'awswaf': 'AWS WAF',
        'cloudflare': 'Cloudflare',
        'datadome': 'DataDome',
        'funcaptcha': 'FunCaptcha',
        'geetest': 'Geetest',
        'hcaptcha': 'hCaptcha',
        'imperva': 'Imperva',
        'recaptcha': 'reCAPTCHA',
        'shapesecurity': 'Shape Security',
        'turnstile': 'Turnstile'
    };

    /** Modules whose protection is a CAPTCHA (Scrape with Scrapfly adds a note) */
    static CAPTCHA_MODULES = ['funcaptcha', 'geetest', 'hcaptcha', 'recaptcha', 'turnstile'];

    /** Tool id suffix of the "Scrape with Scrapfly" card every protection gets */
    static SCRAPFLY_TOOL_SUFFIX = 'ScrapeWithScrapfly';

    /**
     * i18n lookup with an inline English fallback.
     * @param {string} key
     * @param {string} fallback
     * @returns {string}
     */
    static _tr(key, fallback) {
        return (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
    }

    /**
     * i18n format ({0}, {1}…) with an inline English fallback.
     * @param {string} key
     * @param {string} fallback
     * @param {...*} args
     * @returns {string}
     */
    static _fmt(key, fallback, ...args) {
        return (typeof I18n !== 'undefined' && I18n.format(key, ...args)) || fallback;
    }

    /**
     * Constructor
     * @param {object} detection - Detection result for current page
     * @param {object} tabInfo - Tab information
     * @param {string} moduleName - Module name (e.g., 'akamai', 'recaptcha')
     */
    constructor(detection, tabInfo, moduleName) {
        if (!moduleName) {
            throw new Error('BaseAdvancedModule requires moduleName parameter');
        }

        this.detection = detection;
        this.tabInfo = tabInfo;
        this.moduleName = moduleName;
        this.displayName = BaseAdvancedModule.DISPLAY_NAMES[moduleName] || moduleName;
        this.captureHistoryPagination = null;
        this.currentCaptureHistory = [];
        this.isCapturing = false;
        this.captureStateRevision = 0;
    }

    // ========================================================================
    // ABSTRACT METHODS (Must override in child class)
    // ========================================================================

    /**
     * Render module-specific tools UI
     * @returns {string} HTML for tools section
     */
    renderTools() {
        throw new Error(`${this.moduleName}: renderTools() must be implemented`);
    }

    /**
     * Setup module-specific tool event listeners
     * Called after tools are rendered
     */
    setupToolListeners() {
        throw new Error(`${this.moduleName}: setupToolListeners() must be implemented`);
    }

    // ========================================================================
    // MESSAGING
    // ========================================================================

    /**
     * Send message to background script
     * Delegates to AdvancedUtils.sendMessage()
     * @param {object} message - Message object
     * @returns {Promise<object>} Response from background
     */
    async sendMessage(message) {
        return AdvancedUtils.sendMessage(message);
    }

    // ========================================================================
    // CAPTURE STATE MANAGEMENT
    // ========================================================================

    /**
     * Check current capture state
     * @returns {Promise<object>} Capture state
     */
    async checkCaptureState() {
        const revision = this.captureStateRevision;
        try {
            const messageType = `${this.moduleName.toUpperCase()}_GET_CAPTURE_STATE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id
            });

            // An initial state query must not overwrite a newer confirmed start/stop.
            if (revision === this.captureStateRevision && response && typeof response.isCapturing === 'boolean') {
                this.updateCaptureButtonState(response.isCapturing);
            }

            return response;
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Error checking capture state:`, error);
            return { isCapturing: false };
        }
    }

    // ========================================================================
    // CAPTURE HOOKS (Override in child classes for custom behavior)
    // ========================================================================

    /**
     * Hook: Called before starting capture
     * Override to add validation, cookie management, etc.
     * @returns {Promise<boolean>} Return false to cancel capture start
     */
    async beforeCapture() {
        // Default: no pre-capture logic, always proceed
        return true;
    }

    /**
     * Hook: Called after capture successfully started
     * Override to show custom notifications, UI updates, etc.
     * @param {object} response - Response from START_CAPTURE message
     * @returns {Promise<void>}
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            // The page shows a Scrapfly notice with the next steps; close the popup
            // so the user can reload and act on the page right away.
            BaseAdvancedModule.closePopupSoon();
        }
    }

    /**
     * Close the extension popup after a short beat (so a click feels
     * acknowledged). No-op where there is no popup window (tests, side panel).
     * @param {number} [delayMs]
     */
    static closePopupSoon(delayMs = 250) {
        if (typeof window === 'undefined' || typeof window.close !== 'function') return;
        setTimeout(() => window.close(), delayMs);
    }

    /**
     * Start capturing (toggles between start/stop)
     * Uses hooks for customization: beforeCapture(), afterCaptureStart()
     */
    async startCapturing() {
        // If already capturing, stop instead
        if (this.isCapturing) {
            Logger.debug('UI', `[${this.moduleName}] Already capturing, calling stopCapturing()`);
            await this.stopCapturing();
            return;
        }

        try {
            // Hook: beforeCapture - allows validation and preparation
            const shouldProceed = await this.beforeCapture();
            if (shouldProceed === false) {
                Logger.debug('UI', `[${this.moduleName}] Capture cancelled by beforeCapture hook`);
                return;
            }

            // Send START_CAPTURE message to background
            const messageType = `${this.moduleName.toUpperCase()}_START_CAPTURE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && (response.status === 'started' || response.status === 'already_capturing')) {
                this.isCapturing = true;
                this.updateCaptureButtonState(true);

                // Hook: afterCaptureStart - allows custom notifications and UI updates
                await this.afterCaptureStart(response);
            } else if (response && response.status === 'error') {
                const reason = response.error || BaseAdvancedModule._tr('advPanelUnknownError', 'Unknown error');
                NotificationHelper.error(BaseAdvancedModule._fmt('advPanelFailedStartCaptureFmt', `Failed to start capture: ${reason}`, reason));
            }
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Failed to start capturing:`, error);
            NotificationHelper.error(BaseAdvancedModule._fmt('advPanelFailedStartCaptureFmt', 'Failed to start capture: ' + error.message, error.message));
        }
    }

    /**
     * Stop capturing
     */
    async stopCapturing() {
        try {
            const messageType = `${this.moduleName.toUpperCase()}_STOP_CAPTURE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id
            });

            if (!response || !['stopped', 'not_capturing'].includes(response.status)) {
                throw new Error((response && response.error) || BaseAdvancedModule._tr('advPanelNotAvailable', 'No confirmed response'));
            }
            this.updateCaptureButtonState(false);

            // Reload capture history after stopping
            await this.renderCapturedDataSection();

        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Failed to stop capturing:`, error);
            NotificationHelper.error(BaseAdvancedModule._fmt('advPanelFailedStopCaptureFmt', 'Failed to stop capture: ' + error.message, error.message));
        }
    }

    /**
     * Update capture button state
     * @param {boolean} isCapturing - Whether currently capturing
     * @param {boolean} confirmed - False only for presentation-only redraws
     */
    updateCaptureButtonState(isCapturing, confirmed = true) {
        if (confirmed) this.captureStateRevision++;
        this.isCapturing = Boolean(isCapturing);
        const btn = document.querySelector(`#${this.moduleName}StartCapture`);
        if (!btn) return;
        const label = btn.querySelector('.advanced-tool-label, .tool-btn-label');
        const hint = btn.querySelector('.advanced-tool-hint');
        const icon = btn.querySelector('.advanced-tool-icon');
        btn.classList.toggle('capturing', this.isCapturing);
        btn.setAttribute('aria-pressed', String(this.isCapturing));
        if (label) label.textContent = this.isCapturing
            ? BaseAdvancedModule._tr('btnStopCapturing', 'Stop Capturing')
            : BaseAdvancedModule._tr('btnStartCapturing', 'Start Capturing');
        if (hint) hint.textContent = this.getToolHint('capture', this.isCapturing);
        if (icon) icon.innerHTML = BaseAdvancedModule.toolIcon(this.isCapturing ? 'stop' : 'capture');
    }

    /** Stable action IDs, not translated labels, determine presentation. */
    resolveToolAction(tool = {}) {
        const id = typeof tool.id === 'string' ? tool.id.toLowerCase() : '';
        if (id.endsWith(BaseAdvancedModule.SCRAPFLY_TOOL_SUFFIX.toLowerCase())) return 'scrapfly';
        if (tool.kind === 'capture' || id.endsWith('startcapture')) return 'capture';
        if (id.endsWith('checkcookies')) return 'cookies';
        if (id.endsWith('extractsensor')) return 'sensor';
        if (id.endsWith('version')) return 'version';
        if (id === 'recaptchaclick') return 'selector';
        if (id === 'recaptchaextract' || id.endsWith('extractsitekey')) return 'sitekey';
        if (id.endsWith('callback')) return 'callback';
        if (id.includes('analyze')) return 'scripts';
        return 'inspect';
    }

    resolveToolTone(tool = {}) {
        const action = this.resolveToolAction(tool);
        if (action === 'cookies') return 'green';
        if (action === 'sensor' || action === 'sitekey') return 'purple';
        return 'blue';
    }

    getToolHint(action, stopping = false) {
        const hints = {
            cookies: ['advToolCookiesHint', 'Inspect cookies used by this protection'],
            scripts: ['advToolReloadScriptsHint', 'Reload the page to analyze protection scripts'],
            version: ['advToolVersionHint', 'Read available version information'],
            sitekey: ['advToolSiteKeyHint', 'Find the CAPTCHA site key on this page'],
            selector: ['advToolSelectorHint', 'Find a selector for the CAPTCHA widget'],
            callback: ['advToolCallbackHint', 'Inspect CAPTCHA callbacks'],
            sensor: ['advToolSensorHint', 'Reset protection cookies and reload to record sensor data'],
            scrapfly: ['scrapflyExportHint', 'Code to scrape this page with the Unblocker'],
            capture: stopping
                ? ['advToolStopCaptureHint', 'Stop recording data from this page']
                : ['advToolCaptureHint', 'Record data from this page']
        };
        if (action === 'scripts' && ['awswaf', 'imperva'].includes(this.moduleName)) {
            hints.scripts = ['advToolResetScriptsHint', 'Reset protection cookies and reload to analyze scripts'];
        }
        if (action === 'version' && ['cloudflare', 'hcaptcha', 'geetest'].includes(this.moduleName)) {
            hints.version = ['advToolReloadVersionHint', 'Reload the page to detect the protection version'];
        }
        if (action === 'capture' && !stopping && this.moduleName === 'akamai') {
            hints.capture = ['advToolCaptureResetHint', 'Reset the protection cookie and start recording'];
        }
        const hint = hints[action];
        return hint ? BaseAdvancedModule._tr(...hint) : '';
    }

    /** All action glyphs share an outline vocabulary and are decorative. */
    static toolIcon(action) {
        // Scrape with Scrapfly carries the Scrapfly logo instead of a glyph
        if (action === 'scrapfly') return ScrapflyExport.logoHtml('advanced-tool-logo');
        const shapes = {
            cookies: '<path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z"/><circle cx="8" cy="9" r=".8"/><circle cx="8" cy="15" r=".8"/><circle cx="14" cy="14" r=".8"/>',
            scripts: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
            version: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
            sitekey: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-2 2 3 3m-6 0 3 3"/>',
            selector: '<path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4m5-7 7 3-3 1-1 3-3-7Z"/>',
            callback: '<path d="M7 7h10v5m-3-3 3 3 3-3M17 17H7v-5m3 3-3-3-3 3"/>',
            sensor: '<path d="M4 4v16h16M8 16v-5m5 5V7m5 9v-3"/>',
            capture: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
            stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
            inspect: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
            next: '<path d="m9 5 7 7-7 7"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[action] || shapes.inspect}</svg>`;
    }

    /**
     * Same tools, with capture actions moved to the end (stable for the rest).
     * @param {Array<object>} tools
     * @param {function(object): string} actionOf
     */
    static captureLast(tools, actionOf) {
        const list = Array.isArray(tools) ? tools : [];
        return [...list.filter(tool => actionOf(tool) !== 'capture'), ...list.filter(tool => actionOf(tool) === 'capture')];
    }

    /** Render full-width rows without changing vendor action identifiers. */
    renderToolGrid(tools = [], options = {}) {
        const esc = FormatUtils.escapeHtml;
        const extraClass = options.className ? ` ${FormatUtils.escapeAttr(options.className)}` : '';
        // Every protection also gets "Scrape with Scrapfly"; the capture
        // action is always the last row, for every vendor
        const withScrapfly = [...(Array.isArray(tools) ? tools : []), this.scrapflyTool()];
        const ordered = BaseAdvancedModule.captureLast(withScrapfly, tool => this.resolveToolAction(tool));
        const items = ordered.map(tool => {
            const action = this.resolveToolAction(tool);
            const capture = action === 'capture';
            const stopping = capture && this.isCapturing;
            const kind = capture ? 'capture' : 'default';
            const label = stopping ? BaseAdvancedModule._tr('btnStopCapturing', 'Stop Capturing') : tool.label;
            const hint = tool.hint || this.getToolHint(action, stopping);
            return `
                <button type="button" class="advanced-tool-card${stopping ? ' capturing' : ''}" id="${FormatUtils.escapeAttr(tool.id)}" data-tool-kind="${kind}" data-tool-action="${action}"${capture ? ` aria-pressed="${Boolean(stopping)}"` : ''}>
                    <span class="advanced-tool-icon advanced-tool-icon--${this.resolveToolTone(tool)}" data-icon-style="outline" aria-hidden="true">${BaseAdvancedModule.toolIcon(stopping ? 'stop' : action)}</span>
                    <span class="advanced-tool-copy">
                        <span class="advanced-tool-label">${esc(label)}</span>
                        <span class="advanced-tool-hint" aria-live="polite">${esc(hint)}</span>
                    </span>
                    <span class="advanced-tool-indicator" aria-hidden="true">${BaseAdvancedModule.toolIcon('next')}</span>
                </button>
            `;
        }).join('');
        return `<div class="advanced-tool-grid${extraClass}">${items}</div>`;
    }

    /** The shared "Scrape with Scrapfly" card (dialog: ScrapflyExport) */
    scrapflyTool() {
        return {
            id: `${this.moduleName}${BaseAdvancedModule.SCRAPFLY_TOOL_SUFFIX}`,
            label: BaseAdvancedModule._tr('scrapflyExportTitle', 'Scrape with Scrapfly')
        };
    }

    /** This page as Scrapfly code with the Unblocker on, for this protection */
    openScrapflyExport() {
        const detection = this.detection || {};
        const isCaptcha = BaseAdvancedModule.CAPTCHA_MODULES.includes(this.moduleName);
        ScrapflyExport.open({
            url: this.tabInfo?.url || '',
            detections: [{
                ...detection,
                name: detection.name || detection.detector?.name || this.displayName,
                category: detection.category || detection.detector?.category || (isCaptcha ? 'CAPTCHA' : 'Anti-Bot')
            }]
        });
    }

    /** Bind each node once and wait for the actual vendor action to finish. */
    bindToolActions(actions = []) {
        if (!this.toolActionBindings) this.toolActionBindings = new WeakMap();
        if (!this.pendingToolActions) this.pendingToolActions = new Set();
        const scrapfly = this.scrapflyTool();
        const all = actions.some(action => action && action.id === scrapfly.id)
            ? actions
            : [...actions, { id: scrapfly.id, method: () => this.openScrapflyExport() }];
        all.forEach(({ id, handler, method }) => {
            const fn = typeof handler === 'function' ? handler : method;
            if (!id || typeof fn !== 'function') return;
            const btn = document.querySelector(`#${id}`);
            if (!btn) return;
            const previous = this.toolActionBindings.get(btn);
            if (previous) btn.removeEventListener('click', previous);
            const listener = async event => {
                if (btn.disabled || this.pendingToolActions.has(id)) return;
                this.pendingToolActions.add(id);
                // The result dialog this click opens (now or after a reload) goes to History
                this._lastTool = {
                    id,
                    label: (btn.querySelector('.advanced-tool-label')?.textContent || id).trim(),
                    action: btn.dataset?.toolAction || ''
                };
                const hint = btn.querySelector('.advanced-tool-hint');
                const originalHint = hint ? hint.textContent : '';
                btn.disabled = true;
                btn.classList.add('is-working');
                btn.setAttribute('aria-busy', 'true');
                if (hint) hint.textContent = BaseAdvancedModule._tr('advToolWorking', 'Working…');
                try {
                    await fn.call(this, event);
                } catch (error) {
                    Logger.error('UI', `[${this.moduleName}] Tool action failed:`, error);
                    const reason = error && error.message ? error.message : String(error);
                    NotificationHelper.error(BaseAdvancedModule._fmt('advToolActionFailedFmt', `Could not complete this action: ${reason}`, reason));
                } finally {
                    this.pendingToolActions.delete(id);
                    btn.disabled = false;
                    btn.classList.remove('is-working');
                    btn.removeAttribute('aria-busy');
                    if (hint) hint.textContent = originalHint;
                    if (id === `${this.moduleName}StartCapture`) this.updateCaptureButtonState(this.isCapturing, false);
                }
            };
            this.toolActionBindings.set(btn, listener);
            btn.addEventListener('click', listener);
        });
    }

    // ========================================================================
    // MODAL KIT (shared by every module's result dialogs)
    // ========================================================================

    /**
     * Open a result dialog in the shared 2.8 look: header with an icon tile,
     * title and subtitle, a scrolling body, and the shared close button.
     * Escape, the close button and a click outside close it. Copy rows inside
     * (data-copy) copy with inline feedback.
     * @param {object} opts
     * @param {string} opts.title
     * @param {string} [opts.subtitle]
     * @param {string} [opts.iconSvg] - SVG markup for the header tile
     * @param {string} opts.body - HTML from the kit helpers below
     * @param {string} [opts.copiedMessage]
     * @returns {HTMLElement} the overlay
     */
    openKitModal({ title, subtitle = '', iconSvg = '', body = '', copiedMessage, record = true, actions = [] } = {}) {
        const esc = FormatUtils.escapeHtml;
        const overlay = document.createElement('div');
        overlay.className = 'adv-kit-overlay';
        overlay.innerHTML = `
            <div class="adv-kit-modal" role="dialog" aria-modal="true" aria-label="${FormatUtils.escapeAttr(title)}">
                <div class="adv-kit-header">
                    ${iconSvg ? `<span class="adv-kit-header-icon" aria-hidden="true">${iconSvg}</span>` : ''}
                    <div class="adv-kit-header-text">
                        <h3 class="adv-kit-title">${esc(title)}</h3>
                        ${subtitle ? `<p class="adv-kit-subtitle">${esc(subtitle)}</p>` : ''}
                    </div>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>
                <div class="adv-kit-body">${body}</div>
                ${actions.length ? `<div class="adv-kit-footer">${actions.map((action, i) => `
                    <button type="button" class="adv-kit-btn${action.primary ? ' adv-kit-btn--primary' : ''}" data-kit-action="${i}">
                        ${action.iconSvg ? `<span class="adv-kit-btn-icon" aria-hidden="true">${action.iconSvg}</span>` : ''}
                        <span>${esc(action.label)}</span>
                    </button>`).join('')}</div>` : ''}
            </div>`;
        const close = () => {
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 180);
        };
        const onKey = (e) => {
            const overlays = document.querySelectorAll('.tool-modal, .adv-kit-overlay, .advanced-modal-overlay');
            if (e.key === 'Escape' && overlays[overlays.length - 1] === overlay) {
                e.stopPropagation();
                close();
            }
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.advanced-modal-close-btn').addEventListener('click', close);
        overlay.querySelectorAll('[data-kit-action]').forEach((button) => {
            const action = actions[Number(button.dataset.kitAction)];
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (action && typeof action.onClick === 'function') action.onClick(button, close);
            });
        });
        document.addEventListener('keydown', onKey, true);
        this.bindCopyValueHandlers(overlay, {
            defaultMessage: copiedMessage || BaseAdvancedModule._tr('advPanelCopiedToClipboard', 'Copied to clipboard'),
            selector: '[data-copy]'
        });
        document.body.appendChild(overlay);
        if (record) this.recordToolDialog(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));
        return overlay;
    }

    /** A titled group inside a kit modal; `meta` shows on the right (e.g. a count). */
    static kitSection(title, inner, meta = '') {
        if (!inner) return '';
        return `
            <section class="adv-kit-section">
                <div class="adv-kit-section-head">
                    <h4>${FormatUtils.escapeHtml(title)}</h4>
                    ${meta !== '' ? `<span class="adv-kit-count">${FormatUtils.escapeHtml(String(meta))}</span>` : ''}
                </div>
                ${inner}
            </section>`;
    }

    /** A card grouping several fields (one client, one capture…), with an optional chip row on top. */
    static kitCard(inner, head = '') {
        return `<div class="adv-kit-card">${head ? `<div class="adv-kit-card-head">${head}</div>` : ''}${inner}</div>`;
    }

    /** A small label chip; tone: blue | purple | green | amber | red | neutral. */
    static kitChip(text, tone = 'neutral') {
        return `<span class="adv-kit-chip adv-kit-chip--${tone}">${FormatUtils.escapeHtml(String(text))}</span>`;
    }

    /**
     * Label + one-line value that copies on click (the whole row is the button).
     * @param {string} label
     * @param {string} value
     * @param {object} [opts] - { mono: true, wrap: false, clamp: false }
     *   clamp: wrap to at most three lines and cut with "…" (long cookie
     *   values); the click still copies the whole value
     */
    static kitField(label, value, { mono = true, wrap = false, clamp = false } = {}) {
        if (value === undefined || value === null || value === '') return '';
        const text = String(value);
        const copy = BaseAdvancedModule._tr('advCommonClickToCopy', 'Click to copy');
        return `
            <div class="adv-kit-field">
                <span class="adv-kit-label">${FormatUtils.escapeHtml(label)}</span>
                <button type="button" class="adv-kit-value${mono ? ' is-mono' : ''}${wrap || clamp ? ' is-wrap' : ''}${clamp ? ' is-clamp' : ''}" data-copy="${FormatUtils.escapeAttr(text)}" title="${FormatUtils.escapeAttr(copy)}">
                    <span class="adv-kit-value-text">${FormatUtils.escapeHtml(text)}</span>
                    <svg class="adv-kit-copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                </button>
            </div>`;
    }

    /** Multi-line code with a Copy button in its header. */
    static kitCode(label, code) {
        if (!code) return '';
        const copyLabel = BaseAdvancedModule._tr('advCommonCopy', 'Copy');
        return `
            <div class="adv-kit-code">
                <div class="adv-kit-code-head">
                    <span class="adv-kit-label">${FormatUtils.escapeHtml(label)}</span>
                    <button type="button" class="adv-kit-code-copy" data-copy="${FormatUtils.escapeAttr(code)}">${FormatUtils.escapeHtml(copyLabel)}</button>
                </div>
                <pre><code>${FormatUtils.escapeHtml(code)}</code></pre>
            </div>`;
    }

    /**
     * Read-only label / value rows (counts, levels): not copyable. `html`
     * values (kitChip output) are inserted as given; text is escaped.
     * @param {Array<{label: string, value: (string|number), html?: boolean}>} rows
     */
    static kitFacts(rows) {
        const items = (rows || []).filter(row => row && row.value !== undefined && row.value !== null && row.value !== '');
        if (!items.length) return '';
        return `<dl class="adv-kit-facts">${items.map(row => `
            <div class="adv-kit-fact">
                <dt>${FormatUtils.escapeHtml(row.label)}</dt>
                <dd>${row.html ? row.value : FormatUtils.escapeHtml(String(row.value))}</dd>
            </div>`).join('')}</dl>`;
    }

    /** Muted line for "nothing here" / errors inside a section. */
    static kitNote(text, tone = 'muted') {
        return `<p class="adv-kit-note adv-kit-note--${tone}">${FormatUtils.escapeHtml(text)}</p>`;
    }

    /**
     * Create a standardized tool modal overlay.
     * @param {object} options
     * @param {number} options.zIndex
     * @param {string} options.maxWidth
     * @param {string} options.width
     * @param {string} options.maxHeight
     * @returns {HTMLDivElement}
     */
    createToolModal(options = {}) {
        const {
            zIndex = 10000,
            maxWidth = '600px',
            width = '90%',
            maxHeight = '80vh'
        } = options;

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'right: 0',
            'bottom: 0',
            'background: rgba(0,0,0,0.5)',
            'backdrop-filter: blur(2px)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            `z-index: ${zIndex}`,
            'opacity: 0',
            'transition: opacity 0.2s'
        ].join('; ');

        modal.dataset.modalMaxWidth = maxWidth;
        modal.dataset.modalWidth = width;
        modal.dataset.modalMaxHeight = maxHeight;

        return modal;
    }

    /**
     * Attach and fade in a tool modal.
     * @param {HTMLElement} modal
     */
    showToolModal(modal) {
        if (!modal) return;
        if (!modal.parentNode) {
            document.body.appendChild(modal);
        }
        this.recordToolDialog(modal);
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }

    /**
     * Fade out and remove a tool modal.
     * @param {HTMLElement} modal
     */
    closeToolModal(modal) {
        if (!modal) return;
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 200);
    }

    /**
     * Bind close button and overlay-close behavior for a tool modal.
     * @param {HTMLElement} modal
     * @param {object} options
     * @param {string} options.closeSelector
     * @param {boolean} options.closeOnOverlay
     */
    bindModalClose(modal, options = {}) {
        if (!modal) return;

        const {
            closeSelector = '.advanced-modal-close-btn',
            closeOnOverlay = true
        } = options;

        const close = () => this.closeToolModal(modal);

        modal.querySelectorAll(closeSelector).forEach((btn) => {
            btn.addEventListener('click', close);
        });

        if (closeOnOverlay) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    close();
                }
            });
        }
    }

    /**
     * Bind copy handlers for elements marked with data-copy.
     * @param {HTMLElement} container
     * @param {object} options
     * @param {string} options.defaultMessage
     * @param {string} options.selector
     */
    bindCopyValueHandlers(container, options = {}) {
        if (!container) return;

        const {
            defaultMessage = BaseAdvancedModule._tr('advValueCopied', 'Value copied'),
            selector = '.copy-value[data-copy], .clickable-copy-value[data-copy]'
        } = options;

        container.querySelectorAll(selector).forEach((element) => {
            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) return;

                const notificationMessage = element.getAttribute('data-copy-message') || defaultMessage;
                AdvancedUtils.copyToClipboard(textToCopy, element, { notificationMessage });
            });
        });
    }

    // ========================================================================
    // COOKIE RESULTS (every vendor's "Check cookies")
    // ========================================================================

    /** A chrome.cookies cookie as kept in history: everything the dialog shows */
    static cookieRecord(cookie) {
        return {
            name: String(cookie.name || ''),
            value: String(cookie.value || ''),
            domain: cookie.domain || '',
            path: cookie.path || '',
            expires: Number.isFinite(cookie.expirationDate) ? Math.round(cookie.expirationDate * 1000) : null,
            secure: cookie.secure === true,
            httpOnly: cookie.httpOnly === true,
            sameSite: cookie.sameSite && cookie.sameSite !== 'unspecified' ? String(cookie.sameSite) : ''
        };
    }

    /** "Value", or "Value · 1,024 chars" when the value is long enough to be cut */
    static cookieValueLabel(value) {
        const label = BaseAdvancedModule._tr('advCommonValue', 'Value');
        const length = String(value || '').length;
        if (length <= 120) return label;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let count = String(length);
        try { count = length.toLocaleString(uiLocale); } catch (_) { /* plain digits */ }
        return `${label} · ${BaseAdvancedModule._fmt('advCommonCharsFmt', `${count} chars`, count)}`;
    }

    /** Dialog body for a cookie check: count, level, one card per cookie, the missing ones */
    static cookieResultsBody(result) {
        const K = BaseAdvancedModule;
        const tr = K._tr;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        const when = (ms) => {
            try { return new Date(ms).toLocaleString(uiLocale); } catch (_) { return new Date(ms).toLocaleString(); }
        };
        const cookies = Array.isArray(result.cookies) ? result.cookies : [];
        const missing = Array.isArray(result.missing) ? result.missing : [];
        const summary = K.kitCard(
            K.kitField(tr('advCommonCookiesFound', 'Cookies Found:').replace(/:\s*$/, ''), `${cookies.length}/${result.total || cookies.length}`, { mono: false })
            + (Array.isArray(result.facts) ? result.facts : []).map(fact => K.kitField(String(fact.label || '').replace(/:\s*$/, ''), fact.value, { mono: false })).join('')
        );
        const cards = cookies.map(cookie => K.kitCard(
            K.kitField(K.cookieValueLabel(cookie.value), cookie.value, { clamp: true })
            + K.kitField(tr('advCommonDomainLabel', 'Domain:').replace(/:\s*$/, ''), cookie.domain)
            + K.kitField(tr('advCookiePath', 'Path'), cookie.path)
            + K.kitField(tr('advCookieExpires', 'Expires'), cookie.expires ? when(cookie.expires) : tr('advCookieSession', 'Session (deleted when the browser closes)'), { mono: false }),
            K.kitChip(cookie.name, 'blue')
            + (cookie.secure ? K.kitChip('Secure', 'green') : '')
            + (cookie.httpOnly ? K.kitChip('HttpOnly', 'purple') : '')
            + (cookie.sameSite ? K.kitChip(`SameSite=${cookie.sameSite}`, 'neutral') : '')
        )).join('');
        const absent = missing.length
            ? K.kitSection(tr('advCookieNotFound', 'Not found'), `<div class="adv-kit-chips">${missing.map(name => K.kitChip(name, 'neutral')).join('')}</div>`, missing.length)
            : '';
        const none = cookies.length ? '' : K.kitNote(BaseAdvancedModule._fmt('advCommonNoCookiesFmt', `No ${result.vendor} cookies found`, result.vendor));
        return summary + cards + none + absent;
    }

    /**
     * Show a vendor's cookie check and keep it in Advanced → History as data
     * (full values), so the history entry opens this same dialog.
     * @param {object} opts
     * @param {string} opts.vendor - product name for the title
     * @param {string[]} opts.expected - cookie names (or patterns such as incap_ses_*) the vendor sets
     * @param {chrome.cookies.Cookie[]} opts.cookies - the ones found
     * @param {Array<{label: string, value: string}>} [opts.facts] - vendor readings such as the protection level, translated
     */
    showCookieResults({ vendor, expected = [], cookies = [], facts = [], total = null }) {
        const records = cookies.map(cookie => BaseAdvancedModule.cookieRecord(cookie));
        const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
        const missing = expected.filter(pattern => !records.some(cookie => matches(pattern, cookie.name)));
        const result = { kind: 'cookies', vendor, total: Number.isInteger(total) ? total : Math.max(expected.length, records.length), facts, cookies: records, missing };
        const title = BaseAdvancedModule._fmt('advCommonCookiesTitleFmt', `${vendor} Cookies`, vendor);
        this.openKitModal({
            title,
            subtitle: `${records.length}/${result.total}`,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: BaseAdvancedModule.cookieResultsBody(result),
            copiedMessage: BaseAdvancedModule._tr('copiedNotification', 'Copied'),
            record: false
        });
        const tool = this._lastTool;
        void this.saveToolResult({ ...result, tool: tool?.id || `${this.moduleName}CheckCookies`, label: tool?.label || title, title });
    }

    /** Advanced → History: reopen a saved cookie check with its page and time */
    showSavedCookieResults(capture) {
        const data = capture?.data || capture?.captureData || {};
        const K = BaseAdvancedModule;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let when = '';
        try { when = new Date(capture.timestamp).toLocaleString(uiLocale); } catch (_) { when = new Date(capture.timestamp).toLocaleString(); }
        this.openKitModal({
            title: data.title || K._fmt('advCommonCookiesTitleFmt', `${data.vendor} Cookies`, data.vendor),
            subtitle: when,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: K.kitCard(K.kitField(K._tr('advCommonPage', 'Page'), capture.url, { mono: false, wrap: true }))
                + BaseAdvancedModule.cookieResultsBody(data),
            copiedMessage: K._tr('copiedNotification', 'Copied'),
            record: false
        });
    }

    // ========================================================================
    // CAPTURE HISTORY
    // ========================================================================

    /**
     * Load capture history from storage
     * Delegates to AdvancedUtils.loadCaptureHistory()
     * @param {string} hostname - Optional hostname filter
     * @returns {Promise<Array>} Array of capture history items
     */
    async loadCaptureHistory(hostname = null) {
        const filterHostname = hostname || (this.tabInfo ? new URL(this.tabInfo.url).hostname : null);
        return AdvancedUtils.loadCaptureHistory(this.moduleName, filterHostname);
    }

    /**
     * Render capture history HTML
     * @returns {Promise<string>} HTML for capture history section
     */
    async renderCaptureHistoryHTML() {
        if (!this.tabInfo || !this.tabInfo.url) {
            return '';
        }

        const currentHostname = new URL(this.tabInfo.url).hostname;
        const history = await this.loadCaptureHistory(currentHostname);

        Logger.debug('UI', `[${this.moduleName}] renderCaptureHistoryHTML - Total items: ${history.length}`);

        // Store filtered history for pagination
        this.currentCaptureHistory = history;

        let historyItems;
        if (history.length === 0) {
            historyItems = this.renderEmptyCaptureState();
        } else {
            // Show first 3 items (pagination will handle the rest)
            const itemsToRender = history.slice(0, 3);
            Logger.debug('UI', `[${this.moduleName}] Rendering first ${itemsToRender.length} items of ${history.length} total`);
            historyItems = this.renderCaptureHistoryItems(itemsToRender);
        }

        return `
            <div class="capture-history-section">
                <div class="section-header">
                    <div class="header-left">
                        <div class="tool-icon-container tool-icon-purple" style="width: 32px; height: 32px; border-radius: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3Z"/>
                            </svg>
                        </div>
                        <h3>${((typeof I18n !== 'undefined' && I18n.get('advCapturedDataSection')) || 'Captured Data')}</h3>
                    </div>
                    <div class="header-right">
                        <span class="history-count">${BaseAdvancedModule._fmt('advPanelCaptureCountFmt', `Captures: ${history.length}`, history.length)}</span>
                        ${history.length > 0 ? `
                            <button class="clear-history-btn" id="clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History" title="${FormatUtils.escapeHtml(BaseAdvancedModule._tr('advPanelClearCapturedDataTitle', 'Clear all captured data'))}" aria-label="${FormatUtils.escapeHtml(BaseAdvancedModule._tr('advPanelClearCapturedDataTitle', 'Clear all captured data'))}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="history-list" id="${this.moduleName}HistoryList">
                    ${historyItems}
                </div>
                ${history.length > 3 ? `
                    <div id="${this.moduleName}HistoryPagination" class="pagination">
                        <div class="pagination-info">${BaseAdvancedModule._fmt('paginationShowingFmt', `Showing 1-3 of ${history.length}`, 1, 3, history.length)}</div>
                        <div class="pagination-controls">
                            <button class="pagination-btn pagination-btn-prev" disabled>
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                            <div class="page-numbers"></div>
                            <button class="pagination-btn pagination-btn-next">
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render empty capture state
     * Can be overridden by child classes for custom empty states
     * @returns {string} HTML for empty state
     */
    renderEmptyCaptureState() {
        return `
            <div class="empty-capture-state">
                <div class="empty-capture-card">
                    <div class="empty-capture-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6H4C2.89 6 2 6.89 2 8V16C2 17.11 2.89 18 4 18H9V20H7V22H17V20H15V18H20C21.11 18 22 17.11 22 16V8C22 6.89 21.11 6 20 6M20 16H4V8H20V16Z"
                                  stroke="url(#emptyGradient)" stroke-width="1.5" fill="rgba(59,130,246,0.15)"/>
                            <defs>
                                <linearGradient id="emptyGradient" x1="4" y1="6" x2="20" y2="18" gradientUnits="userSpaceOnUse">
                                    <stop offset="0" stop-color="#3b82f6"/>
                                    <stop offset="1" stop-color="#60a5fa"/>
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h4 class="empty-capture-title">${((typeof I18n !== 'undefined' && I18n.get('advNoCapturesYet')) || 'No captures yet')}</h4>
                    <p class="empty-capture-text">${((typeof I18n !== 'undefined' && I18n.format('advNoCapturesHintFmt', this.displayName)) || `Click "Start Capturing" above to begin capturing ${this.displayName} data`)}</p>
                </div>
            </div>
        `;
    }

    /**
     * Render capture history items
     * Should be overridden by child classes for module-specific rendering
     * @param {Array} items - Array of capture history items to render
     * @returns {string} HTML for history items
     */
    renderCaptureHistoryItems(items) {
        // Default simple rendering - override in child classes
        return items.map((item) => {
            const { hostname, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Setup capture history event listeners
     */
    setupCaptureHistoryListeners() {
        Logger.debug('UI', `[${this.moduleName}] setupCaptureHistoryListeners - Items: ${this.currentCaptureHistory?.length || 0}`);

        // Clear history button
        const clearBtnId = `clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History`;
        const clearBtn = document.querySelector(`#${clearBtnId}`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

        // Setup pagination if we have history items
        if (this.currentCaptureHistory && this.currentCaptureHistory.length > 3) {
            Logger.debug('UI', `[${this.moduleName}] Setting up pagination for ${this.currentCaptureHistory.length} items`);
            this.setupCaptureHistoryPagination();
            return; // Pagination will handle expand listeners
        }

        // Otherwise setup expand listeners directly
        Logger.debug('UI', `[${this.moduleName}] No pagination needed, setting up expand listeners directly`);
        this.setupExpandListeners();
    }

    /**
     * Setup expand button listeners for capture cards
     */
    setupExpandListeners() {
        // CSP-compliant image error fallback
        document.querySelectorAll('img[data-fallback]').forEach(img => {
            img.addEventListener('error', function() {
                this.src = this.dataset.fallback;
            }, { once: true });
        });

        const expandBtns = document.querySelectorAll('.capture-expand');
        expandBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const captureId = btn.getAttribute('data-capture-id');
                this.toggleCaptureDetails(captureId);
            });
        });

        const captureCards = document.querySelectorAll('.capture-card');
        captureCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.capture-expand')) {
                    const captureId = card.getAttribute('data-capture-id');
                    this.toggleCaptureDetails(captureId);
                }
            });
        });
    }

    /**
     * Setup pagination for capture history
     */
    setupCaptureHistoryPagination() {
        if (!this.currentCaptureHistory || this.currentCaptureHistory.length === 0) {
            Logger.debug('UI', `[${this.moduleName}] Cannot setup pagination - no history items`);
            return;
        }

        const paginationId = `${this.moduleName}HistoryPagination`;
        const paginationDiv = document.querySelector(`#${paginationId}`);

        if (!paginationDiv) {
            Logger.error('UI', `[${this.moduleName}] Pagination div #${paginationId} not found in DOM!`);
            return;
        }

        Logger.debug('UI', `[${this.moduleName}] Creating PaginationManager for #${paginationId} with ${this.currentCaptureHistory.length} items`);

        this.captureHistoryPagination = new PaginationManager(paginationId, {
            itemsPerPage: 3,
            onPageChange: (page, items) => {
                Logger.debug('UI', `[${this.moduleName}] Page changed to ${page}, showing ${items.length} items`);
                this.renderCaptureHistoryPage(items);
            }
        });

        this.captureHistoryPagination.setItems(this.currentCaptureHistory);
        Logger.debug('UI', `[${this.moduleName}] Pagination setup complete`);
    }

    /**
     * Render a page of capture history items
     * @param {Array} items - Items for current page
     */
    renderCaptureHistoryPage(items) {
        const listContainer = document.querySelector(`#${this.moduleName}HistoryList`);
        if (!listContainer) {
            Logger.debug('UI', `[${this.moduleName}] History list container not found`);
            return;
        }

        listContainer.innerHTML = this.renderCaptureHistoryItems(items);

        // Re-setup event listeners for the new page
        this.setupExpandListeners();
    }

    /**
     * Keep a tool's result in Advanced → History, the same way a capture is
     * kept (30 minutes). The module's renderCaptureDetailsContent shows it.
     * @param {object} data - what the tool found, with a `tool` name
     * @returns {Promise<object|null>} the stored entry, or null on failure
     */
    /**
     * Save a tool's result dialog to Advanced → History: its title and text,
     * without its buttons. Captures save their own data, so a dialog opened by
     * Start capture is skipped; each dialog is saved once.
     * @param {HTMLElement} root - the dialog, already in the document
     */
    recordToolDialog(root) {
        const tool = this._lastTool;
        if (!tool || tool.action === 'capture' || !root || typeof root.querySelector !== 'function') return;
        if (!this._recordedDialogs) this._recordedDialogs = new WeakSet();
        if (this._recordedDialogs.has(root)) return;
        this._recordedDialogs.add(root);
        try {
            const title = (root.querySelector('.adv-kit-title, h3')?.textContent || '').trim();
            const buttonText = new Set(Array.from(root.querySelectorAll('button'))
                .filter(button => !button.classList.contains('adv-kit-value'))
                .map(button => (button.innerText || button.textContent || '').trim())
                .filter(Boolean));
            const lines = String(root.innerText || root.textContent || '').split('\n')
                .map(line => line.trim())
                .filter(line => line && line !== title && !buttonText.has(line));
            if (lines.length === 0) return;
            void this.saveToolResult({ tool: tool.id, label: tool.label, title, lines: lines.slice(0, 400) });
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Could not read the tool result for history:`, error);
        }
    }

    /**
     * History details for a saved tool result (recordToolDialog): the tool,
     * what its dialog showed, then the page and time
     */
    renderToolResultContent(capture) {
        const data = capture?.data || capture?.captureData || {};
        const esc = AdvancedUtils.escapeHtml;
        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${esc(data.label || data.tool || '')}</label>
                ${data.title ? `<div class="advanced-modal-info-value" style="margin-bottom: 6px;">${esc(data.title)}</div>` : ''}
                <pre class="advanced-modal-code-block" style="white-space: pre-wrap; word-break: break-word; margin: 0;">${esc((data.lines || []).join('\n'))}</pre>
            </div>
        ` + BaseAdvancedModule.prototype.renderCaptureDetailsContent.call(this, capture);
    }

    async saveToolResult(data) {
        try {
            const url = this.tabInfo?.url || '';
            const hostname = url ? new URL(url).hostname : '';
            const favicon = UrlUtils.normalizeFaviconForStorage(this.tabInfo?.favIconUrl, url || hostname);
            const timestamp = Date.now();
            return await AdvancedHistoryStore.appendCapture(this.moduleName, {
                id: `${this.moduleName}_${data?.tool || 'tool'}_${timestamp}`,
                timestamp,
                url,
                hostname,
                favicon,
                data,
                captureData: data
            }, { expiryMinutes: 30 });
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Could not save the tool result to history:`, error);
            return null;
        }
    }

    /**
     * Render capture details content for modal
     * Override in child classes for module-specific content
     * IMPORTANT: Child classes must properly escape user data to prevent XSS
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
    renderCaptureDetailsContent(capture) {
        // Default implementation - shows basic capture info
        const url = AdvancedUtils.escapeHtml(capture.url || BaseAdvancedModule._tr('advPanelNotAvailable', 'N/A'));
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let timestamp;
        try {
            timestamp = new Date(capture.timestamp).toLocaleString(uiLocale);
        } catch (_) {
            timestamp = new Date(capture.timestamp).toLocaleString();
        }

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${BaseAdvancedModule._tr('advCommonUrl', 'URL')}</label>
                <div class="advanced-modal-code-block">${url}</div>
            </div>
            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${BaseAdvancedModule._tr('advCommonCaptured', 'Captured')}</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    }

    /**
     * Display capture details in a modal
     * @param {string} captureId - Capture ID
     * @param {string} detailsContent - HTML content for modal body (must be pre-sanitized)
     */
    displayCaptureDetailsModal(captureId, detailsContent) {
        const _tCD = (typeof I18n !== 'undefined') ? I18n : null;
        // detailsContent is pre-sanitized by renderCaptureDetailsContent(); its
        // data-copy values copy on click (kit binding)
        return this.openKitModal({
            title: (_tCD && _tCD.get('advCaptureDetails')) || 'Capture Details',
            iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3Z"/></svg>',
            body: detailsContent,
            copiedMessage: (_tCD && _tCD.get('advValueCopied')) || 'Value copied',
            record: false
        });
    }

    /**
     * Toggle capture details display - now shows modal instead of inline expansion
     * @param {string} captureId - Capture ID
     */
    async toggleCaptureDetails(captureId) {
        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp.toString()) === captureId);
        if (!capture) return;

        // Render modal content (child classes can override renderCaptureDetailsContent)
        let modalContent = this.renderCaptureDetailsContent(capture);

        // Add "Copy All Data" button
        modalContent += `
            <div class="advanced-modal-section" style="margin-top: 16px;">
                <button class="advanced-modal-btn-primary" id="copyAllCaptureData" style="width: 100%;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                    </svg>
                    ${((typeof I18n !== 'undefined' && I18n.get('btnCopyAllData')) || 'Copy All Data')}
                </button>
            </div>
        `;

        // Display modal
        this.displayCaptureDetailsModal(captureId, modalContent);

        // Setup copy button listener
        setTimeout(() => {
            const copyBtn = document.querySelector('#copyAllCaptureData');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const payload = JSON.stringify(capture.captureData, null, 2);
                    AdvancedUtils.copyToClipboard(payload, copyBtn, {
                        notificationMessage: ((typeof I18n !== 'undefined') && I18n.get('captureDataCopied')) || 'Capture data copied'
                    });
                });
            }
        }, 100);
    }

    /**
     * Show confirmation modal
     * Delegates to AdvancedUtils.showConfirmationModal()
     * @returns {Promise<boolean>} True if confirmed, false if cancelled
     */
    showConfirmationModal(title, message, confirmText, cancelText) {
        const _tSC = (typeof I18n !== 'undefined') ? I18n : null;
        return AdvancedUtils.showConfirmationModal({
            title,
            message,
            confirmText: confirmText || ((_tSC && _tSC.get('btnDelete')) || 'Delete'),
            cancelText: cancelText || ((_tSC && _tSC.get('btnCancel')) || 'Cancel'),
            confirmClass: 'danger'
        });
    }

    /**
     * Clear all capture history
     */
    async clearCaptureHistory() {
        const _tCH = (typeof I18n !== 'undefined') ? I18n : null;
        const confirmed = await this.showConfirmationModal(
            (_tCH && _tCH.get('advConfirmClearAllTitle')) || 'Clear All Captured Data?',
            (_tCH && _tCH.get('advConfirmClearAllMsg')) || 'This will permanently delete all captured data for this module. This action cannot be undone.',
            (_tCH && _tCH.get('btnClearData')) || 'Clear Data',
            (_tCH && _tCH.get('btnCancel')) || 'Cancel'
        );

        if (!confirmed) {
            return;
        }

        try {
            await AdvancedHistoryStore.clear(this.moduleName);

            await this.renderCapturedDataSection();
            NotificationHelper.success(BaseAdvancedModule._fmt('advPanelHistoryClearedFmt', `${this.displayName} capture history cleared`, this.displayName));
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Failed to clear history:`, error);
            NotificationHelper.error(BaseAdvancedModule._tr('advPanelFailedClearHistory', 'Failed to clear history'));
        }
    }

    /**
     * Re-render just the capture history section
     */
    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#detectionToolsPanel');
        if (!advancedContent) {
            Logger.debug('UI', `[${this.moduleName}] #detectionToolsPanel not found`);
            return;
        }

        const existingHistory = advancedContent.querySelector('.capture-history-section');
        const captureHistoryHtml = await this.renderCaptureHistoryHTML();

        if (existingHistory) {
            if (captureHistoryHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = captureHistoryHtml;
                const newSection = tempDiv.firstElementChild;
                existingHistory.replaceWith(newSection);
                this.setupCaptureHistoryListeners();
            } else {
                existingHistory.remove();
            }
        } else {
            if (captureHistoryHtml) {
                advancedContent.insertAdjacentHTML('beforeend', captureHistoryHtml);
                this.setupCaptureHistoryListeners();
            }
        }
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    /**
     * Setup all event listeners
     * Calls setupToolListeners() which should be overridden by child class
     */
    setupEventListeners() {
        // Check capture state on init
        this.checkCaptureState();

        // Setup module-specific tool listeners
        this.setupToolListeners();

        // Setup capture history listeners
        this.setupCaptureHistoryListeners();
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get relative time string
     * Delegates to AdvancedUtils.getTimeAgo()
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Relative time string (e.g., "5m ago")
     */
    getTimeAgo(timestamp) {
        return AdvancedUtils.getTimeAgo(timestamp);
    }

}

BaseAdvancedModule.COOKIE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a4 4 0 0 0 5 5 4 4 0 0 0 4.5 4.5z"/><circle cx="8.5" cy="11.5" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="15.5" cy="13" r="1"/></svg>';

if (typeof window !== 'undefined') {
    window.BaseAdvancedModule = BaseAdvancedModule;
    Logger.debug('UI', '[BaseAdvancedModule] ✓ Loaded and exported to window.BaseAdvancedModule');
}
