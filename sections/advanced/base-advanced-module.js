/**
 * BaseAdvancedModule
 * Base class for Advanced Section detector modules
 *
 * Provides common functionality for:
 * Owns vendor identity, capture controls and lifecycle hooks.
 * Tool rows, dialogs, cookie results and history are composed by their
 * dedicated components immediately after this class is loaded.
 *
 * Child classes should override:
 * - renderTools() - Render module-specific tools UI
 * - setupToolListeners() - Setup tool event listeners
 * - renderCaptureHistoryItems() - Optional: custom history item rendering
 */

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
        this.captureRequestId = null;
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
                this.captureRequestId = response.isCapturing ? response.requestId || null : null;
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
                this.captureRequestId = response.requestId || null;
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
        if (confirmed) {
            this.captureStateRevision++;
            if (!isCapturing) this.captureRequestId = null;
        }
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

    /** Initialize this vendor's tools and history subscriptions. */
    setupEventListeners() {
        // Check capture state on init
        this.checkCaptureState();

        // Setup module-specific tool listeners
        this.setupToolListeners();

        // Setup capture history listeners
        this.setupCaptureHistoryListeners();
    }


}

BaseAdvancedModule.COOKIE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a4 4 0 0 0 5 5 4 4 0 0 0 4.5 4.5z"/><circle cx="8.5" cy="11.5" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="15.5" cy="13" r="1"/></svg>';

if (typeof window !== 'undefined') {
    window.BaseAdvancedModule = BaseAdvancedModule;
    Logger.debug('UI', '[BaseAdvancedModule] ✓ Loaded and exported to window.BaseAdvancedModule');
}
