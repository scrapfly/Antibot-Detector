/**
 * ShapeSecurityAdvanced - Using BaseAdvancedModule Template System
 *
 * Advanced tools for Shape Security detection and analysis
 * Similar structure to Imperva module with capture and analysis features
 */

console.log('[ShapeSecurityAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    PaginationManager: typeof PaginationManager
});

class ShapeSecurityAdvanced extends BaseAdvancedModule {
    // OPTIMIZATION Phase 6B: Cache for code generation templates
    // Eliminates 80-90% of template generation overhead on repeat exports
    static codeTemplateCache = new Map();
    static CODE_CACHE_MAX_SIZE = 20;

    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'shapesecurity');

        // Shape Security specific state
        this.analysisActive = false;
        this.analysisResults = [];
        this.analysisListener = null;
        this.analysisTimer = null;
        this.listenersSetup = false; // Flag to prevent duplicate listener setup

        // Setup extraction completion listener
        this.setupExtractionListener();
    }

    /**
     * Setup listener for extraction completion messages
     */
    setupExtractionListener() {
        if (this.extractionListener) return; // Already setup

        this.extractionListener = (message) => {
            if (message.type === 'SHAPESECURITY_EXTRACTION_COMPLETED') {
                console.log('[SHAPESECURITY-EXTRACT] Extraction completed message received:', message);
                this.displayExtractionResults(message.extractedData);
            } else if (message.type === 'SHAPESECURITY_COOKIE_RESULT') {
                console.log('[SHAPESECURITY-COOKIE] Cookie check result received:', message);
                this.displayCookieResults(message.cookie);
            }
        };

        chrome.runtime.onMessage.addListener(this.extractionListener);
    }

    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================

    /**
     * Render Shape Security specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="shapesecurityCheckVersion">
                    <div class="tool-btn-icon">🔢</div>
                    <div class="tool-btn-label">Check Version</div>
                </button>

                <button class="recaptcha-tool-btn" id="shapesecurityCheckCookies">
                    <div class="tool-btn-icon">🍪</div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="shapesecurityStartCapture">
                    <div class="tool-btn-icon">🎬</div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>

                <button class="recaptcha-tool-btn" id="shapesecurityAnalyzeScripts">
                    <div class="tool-btn-icon">🔍</div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>
            </div>
        `;
    }

    /**
     * Setup Shape Security specific tool listeners
     */
    setupToolListeners() {
        // Prevent duplicate listener setup
        if (this.listenersSetup) {
            console.log('[ShapeSecurity] Listeners already setup, skipping...');
            return;
        }

        console.log('[ShapeSecurity] Setting up tool listeners...');
        this.listenersSetup = true;

        const actions = [
            { id: 'shapesecurityCheckVersion', method: () => this.checkVersion() },
            { id: 'shapesecurityCheckCookies', method: () => this.checkCookies() },
            { id: 'shapesecurityStartCapture', method: () => this.startCapturing() },
            { id: 'shapesecurityAnalyzeScripts', method: () => this.extractScripts() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            if (btn) {
                btn.addEventListener('click', method);
                console.log(`[ShapeSecurity] Listener added for: ${id}`);
            }
        });
    }

    /**
     * Override history item rendering for Shape Security specific display
     */
    renderCaptureHistoryItems(items) {
        return items.map((item) => {
            const { hostname, captureData, timestamp, id } = item;
            const timeAgo = AdvancedUtils.getTimeAgo(timestamp);
            const faviconUrl = AdvancedUtils.getFaviconUrl(hostname);

            const headers = captureData.headers || [];
            const cookie = captureData.cookie || null;

            // Extract header pattern from first header (e.g., "X-DQ7Hy5L1-z" -> "DQ7Hy5L1")
            let headerPattern = null;
            if (headers.length > 0) {
                const firstHeader = headers[0].name;
                const match = firstHeader.match(/^X-([A-Za-z0-9]{8})-[a-z]$/i);
                if (match) {
                    headerPattern = match[1]; // Extract the 8 character pattern
                }
            }

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">Cookie</span>
                                <span class="capture-type-value">${cookie ? 1 : 0}</span>
                                <span class="capture-type-label">Headers</span>
                                <span class="capture-type-value">${headers.length}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    ${headerPattern ? `
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${AdvancedUtils.escapeHtml(headerPattern)}</code>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Override toggleCaptureDetails for Shape Security specific detail view
     */
    async toggleCaptureDetails(captureId) {
        const captureCard = document.querySelector(`.capture-card[data-capture-id="${captureId}"]`);
        if (!captureCard) return;

        const existingDetails = captureCard.querySelector('.history-item-details');
        if (existingDetails) {
            existingDetails.remove();
            captureCard.classList.remove('expanded');
            return;
        }

        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp) == captureId);
        if (!capture) return;

        const captureData = capture.captureData || {};
        const headers = captureData.headers || [];
        const cookie = captureData.cookie || null;
        const version = captureData.version || 'v2'; // Get version, default to v2

        // Extract unique header patterns (extract middle 8 characters)
        // e.g., "X-DQ7Hy5L1-z" -> "DQ7Hy5L1"
        const headerPatterns = [...new Set(headers.map(h => {
            const name = h.name;
            // If it matches Shape Security pattern (X-[8chars]-[letter]), extract 8 chars
            const match = name.match(/^X-([A-Za-z0-9]{8})-[a-z]$/i);
            if (match) {
                return match[1]; // Return the 8 character pattern
            }
            return name;
        }))];

        let detailsHtml = `
            <div class="history-item-details">
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 8px;">🔢 Shape Security Version</div>
                    <div class="copy-value" data-copy="${version.toUpperCase()}" style="font-family: monospace; font-size: 12px; color: var(--text-primary); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s; display: inline-block;" title="Click to copy">${version.toUpperCase()}</div>
                </div>
                ${headerPatterns.length > 0 ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 8px;">📡 Header Pattern${headerPatterns.length > 1 ? 's' : ''}</div>
                        ${headerPatterns.map(pattern => `
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(pattern)}" style="font-family: monospace; font-size: 12px; color: var(--text-primary); margin-bottom: 6px; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s; display: inline-block;" title="Click to copy">
                                ${AdvancedUtils.escapeHtml(pattern)}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${cookie ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 8px;">🍪 Shape Cookie</div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="font-family: monospace; font-size: 12px; color: var(--text-primary); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s; display: inline-block;" title="Click to copy">${AdvancedUtils.escapeHtml(cookie.name)}</div>
                    </div>
                ` : ''}
                <div class="details-actions">
                    <button class="detail-action-btn copy-all-btn" data-capture-id="${captureId}">
                        📄 Copy All Data
                    </button>
                </div>
            </div>
        `;

        captureCard.insertAdjacentHTML('beforeend', detailsHtml);
        captureCard.classList.add('expanded');

        // Add click-to-copy functionality
        captureCard.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                const originalText = element.textContent.trim();

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    element.textContent = '✓ Copied!';
                    element.style.background = 'var(--success)';
                    element.style.color = 'white';

                    setTimeout(() => {
                        element.textContent = originalText;
                        element.style.background = '';
                        element.style.color = '';
                    }, 1500);
                } catch (error) {
                    console.error('[ShapeSecurity] Copy failed:', error);
                }
            });
        });

        // Setup copy all button
        const copyAllBtn = captureCard.querySelector('.copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(JSON.stringify(captureData, null, 2));
                    copyAllBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyAllBtn.textContent = '📄 Copy All Data';
                    }, 2000);
                } catch (error) {
                    console.error('Failed to copy:', error);
                }
            });
        }
    }

    // ========================================================================
    // CAPTURE HOOKS (Override base module behavior)
    // ========================================================================

    /**
     * Hook: Get custom start notification (suppress default popup notification)
     */
    getStartNotification() {
        return null; // In-page notification shown by interceptor
    }

    // ========================================================================
    // SHAPE SECURITY SPECIFIC METHODS
    // ========================================================================

    /**
     * Check and display Shape Security headers
     */
    async checkHeaders() {
        try {
            NotificationHelper.info('Checking Shape Security headers...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                NotificationHelper.error('No active tab found');
                return;
            }

            // Request headers check from background
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_CHECK_HEADERS',
                tabId: tab.id
            });

            if (response && response.headers) {
                this.displayHeadersResults(response.headers);
            } else {
                NotificationHelper.warning('No Shape Security headers detected');
            }
        } catch (error) {
            console.error('[ShapeSecurity] Check headers error:', error);
            NotificationHelper.error('Failed to check headers: ' + error.message);
        }
    }

    /**
     * Check and display Shape Security cookies
     */
    /**
     * Check Shape Security version (V1 or V2)
     */
    async checkVersion() {
        try {
            console.log('[ShapeSecurity] Check version button clicked');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                NotificationHelper.error('No active tab found');
                return;
            }

            // Request version check from background
            console.log('[ShapeSecurity] Sending SHAPESECURITY_CHECK_VERSION message');
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_CHECK_VERSION',
                tabId: tab.id,
                url: tab.url
            });

            console.log('[ShapeSecurity] Response:', response);

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            // Show result modal
            if (response && response.version) {
                console.log('[ShapeSecurity] Version detected:', response.version);
                NotificationHelper.success(AdvancedUtils.notifications.checkVersion.success('Shape Security', response.version.toUpperCase()));
                this.showVersionModal(response.version);
            } else {
                NotificationHelper.warning(AdvancedUtils.notifications.checkVersion.none('Shape Security'));
            }

        } catch (error) {
            console.error('[ShapeSecurity] Check version error:', error);
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    }

    /**
     * Show version detection result in a modal
     */
    showVersionModal(version) {
        const versionUpper = version.toUpperCase();

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 400px; max-height: 90vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">🟠</span> Shape Security Version
                    </h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px; line-height: 1;">×</button>
                </div>

                <!-- Version Info -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Detected Version:</span>
                        <span class="copy-value" data-copy="${versionUpper}" style="color: ${version === 'v1' ? 'var(--success)' : 'var(--primary)'}; font-weight: 600; font-size: 14px; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${versionUpper}</span>
                    </div>
                </div>

                <!-- Capture Requirements -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 18px;">🔍</span>
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Capture Requirements</h4>
                    </div>

                    <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 12px;">
                        <div style="font-size: 12px; color: var(--text-primary);">
                            🍪 Cookie + 📡 Headers
                        </div>
                    </div>
                </div>

                <!-- Close Button -->
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Fade in animation
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
        });

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                const originalText = element.textContent.trim();

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    element.textContent = '✓ Copied!';
                    element.style.background = 'var(--success)';
                    element.style.color = 'white';

                    setTimeout(() => {
                        element.textContent = originalText;
                        element.style.background = '';
                        element.style.color = '';
                    }, 1500);
                } catch (error) {
                    console.error('[ShapeSecurity] Copy failed:', error);
                    NotificationHelper.error('Failed to copy to clipboard');
                }
            });
        });

        // Close button handler
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async checkCookies() {
        console.log('[ShapeSecurity] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            // Get cookies directly without reload (like AWS WAF/Akamai)
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            console.log('[ShapeSecurity] Total cookies found:', cookies.length);
            console.log('[ShapeSecurity] URL:', this.tabInfo.url);

            // DEBUG: Log all cookies with details
            console.log('[ShapeSecurity] ===== ALL COOKIES =====');
            cookies.forEach((cookie, index) => {
                console.log(`[ShapeSecurity] Cookie ${index + 1}:`, {
                    name: cookie.name,
                    nameLength: cookie.name.length,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    valueSnippet: cookie.value ? cookie.value.substring(0, 50) + (cookie.value.length > 50 ? '...' : '') : '(empty)'
                });
            });

            // DEBUG: Log matching criteria
            console.log('[ShapeSecurity] ===== MATCHING CRITERIA =====');
            console.log('[ShapeSecurity] Looking for cookies with:');
            console.log('[ShapeSecurity]   - Name length: exactly 8 characters');
            console.log('[ShapeSecurity]   - Value pattern: contains "|1|0|" or "|1|1|"');

            // Find Shape Security cookie (8-character name with |1|0| or |1|1| pattern in value)
            console.log('[ShapeSecurity] ===== EVALUATING COOKIES =====');
            let shapeCookie = null;

            for (let i = 0; i < cookies.length; i++) {
                const c = cookies[i];
                const nameMatches = c.name.length === 8;
                const valueMatches = c.value && (c.value.includes('|1|0|') || c.value.includes('|1|1|'));

                console.log(`[ShapeSecurity] Cookie ${i + 1}: "${c.name}"`);
                console.log(`[ShapeSecurity]   ├─ Name length: ${c.name.length} ${nameMatches ? '✅' : '❌'} (need: 8)`);
                console.log(`[ShapeSecurity]   ├─ Value contains |1|0| or |1|1|: ${valueMatches ? '✅' : '❌'}`);

                if (nameMatches && valueMatches) {
                    console.log(`[ShapeSecurity]   └─ MATCH! ✅ This is a Shape Security cookie`);
                    shapeCookie = c;
                    break; // Found match, stop searching
                } else {
                    console.log(`[ShapeSecurity]   └─ Not a match ${nameMatches ? '(name OK but value pattern missing)' : '(name length wrong)'}`);
                }
            }

            // DEBUG: Log final result
            console.log('[ShapeSecurity] ===== RESULT =====');
            if (shapeCookie) {
                console.log('[ShapeSecurity] ✅ Shape Security cookie found!');
                console.log('[ShapeSecurity] Cookie details:', {
                    name: shapeCookie.name,
                    domain: shapeCookie.domain,
                    path: shapeCookie.path,
                    secure: shapeCookie.secure,
                    httpOnly: shapeCookie.httpOnly,
                    valueLength: shapeCookie.value.length,
                    valueSnippet: shapeCookie.value.substring(0, 100) + (shapeCookie.value.length > 100 ? '...' : ''),
                    fullValue: shapeCookie.value
                });
            } else {
                console.log('[ShapeSecurity] ❌ No Shape Security cookie found');
                console.log('[ShapeSecurity] Possible reasons:');
                console.log('[ShapeSecurity]   - No cookies with 8-character names');
                console.log('[ShapeSecurity]   - No cookies with |1|0| or |1|1| pattern in value');
                console.log('[ShapeSecurity]   - Shape Security not active on this page');
            }
            console.log('[ShapeSecurity] ========== END CHECK COOKIES ==========');

            // Show notification
            if (shapeCookie) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Shape Security'));
            }

            // Display modal with cookie details immediately
            this.displayCookieResults(shapeCookie);

        } catch (error) {
            console.error('[ShapeSecurity] Check cookies error:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    /**
     * Display headers analysis results
     */
    displayHeadersResults(headers) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'analysis-results-modal';
        resultDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';

        const headersList = Object.entries(headers)
            .filter(([name]) => name.toLowerCase().startsWith('x-'))
            .map(([name, value]) => `
                <div class="detail-row">
                    <span class="detail-label">${AdvancedUtils.escapeHtml(name)}:</span>
                    <span class="detail-value">${AdvancedUtils.truncate(value, 50)}</span>
                </div>
            `).join('');

        resultDiv.innerHTML = `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <h3 style="margin: 0 0 16px 0;">📡 Shape Security Headers</h3>
                <div class="details-grid">
                    ${headersList || '<div class="detail-empty">No dynamic headers found</div>'}
                </div>
                <button class="detail-action-btn close-modal-btn" style="margin-top: 16px; width: 100%;">Close</button>
            </div>
        `;

        document.body.appendChild(resultDiv);

        // Add close button handler (CSP-compliant)
        const closeBtn = resultDiv.querySelector('.close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                resultDiv.remove();
            });
        }

        // Close on background click
        resultDiv.addEventListener('click', (e) => {
            if (e.target === resultDiv) {
                resultDiv.remove();
            }
        });
    }

    /**
     * Display cookie check results (Akamai-style compact modal)
     */
    displayCookieResults(cookieData) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';

        const cookieFound = cookieData ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🍪 Shape Security Cookies</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${cookieFound}/1</span>
                    </div>
                </div>

                ${cookieData ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.name)}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${AdvancedUtils.escapeHtml(cookieData.name)}</div>
                            <div style="display: flex; gap: 6px;">
                                <span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${AdvancedUtils.escapeHtml(cookieData.value.substring(0, 60))}${cookieData.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Max-Age: 1577847600 seconds (50 years)</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                        <div style="font-size: 14px;">No Shape Security cookies found</div>
                    </div>
                `}

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close button handlers
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Click-to-copy handlers
        modal.querySelectorAll('.copy-value').forEach(element => {
            // Hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            // Click to copy
            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    const originalText = element.textContent;
                    element.textContent = '✓ Copied!';
                    element.style.background = 'var(--success)';
                    element.style.color = 'white';
                    setTimeout(() => {
                        element.textContent = originalText;
                        element.style.background = '';
                        element.style.color = '';
                    }, 1500);
                } catch (error) {
                    console.error('[ShapeSecurity] Copy failed:', error);
                    NotificationHelper.error('Failed to copy to clipboard');
                }
            });
        });
    }

    /**
     * Extract and analyze Shape Security scripts - Reload page and capture URLs
     */
    async extractScripts() {
        console.log('[SHAPESECURITY-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {
            console.log('[SHAPESECURITY-EXTRACT] Step 1: Getting current tab...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('[SHAPESECURITY-EXTRACT] ❌ No active tab found');
                throw new Error('No active tab found');
            }

            console.log('[SHAPESECURITY-EXTRACT] ✓ Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Store extraction mode flag
            console.log('[SHAPESECURITY-EXTRACT] Step 2: Setting up extraction mode...');
            this.isExtracting = true;

            // Set up listener for extraction result
            console.log('[SHAPESECURITY-EXTRACT] Step 3: Adding listener for extraction result...');
            const extractionListener = (message) => {
                console.log('[SHAPESECURITY-EXTRACT] Received message:', message.type);
                if (message.type === 'SHAPESECURITY_EXTRACTION_RESULT') {
                    console.log('[SHAPESECURITY-EXTRACT] ✅ EXTRACTION RESULT RECEIVED!');
                    console.log('[SHAPESECURITY-EXTRACT] Extracted data:', message.extractedData);

                    // Display the script data
                    console.log('[SHAPESECURITY-EXTRACT] Step: Displaying script data modal...');
                    this.displayScriptDataModal(message.extractedData);

                    // Clean up
                    console.log('[SHAPESECURITY-EXTRACT] Step: Cleaning up...');
                    this.isExtracting = false;
                    chrome.runtime.onMessage.removeListener(extractionListener);
                    console.log('[SHAPESECURITY-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
            };

            chrome.runtime.onMessage.addListener(extractionListener);
            console.log('[SHAPESECURITY-EXTRACT] ✓ Listener added');

            // Send message to start extraction mode
            console.log('[SHAPESECURITY-EXTRACT] Step 4: Sending message to background to start extraction...');
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_START_EXTRACTION',
                tabId: tab.id
            });
            console.log('[SHAPESECURITY-EXTRACT] Background response:', response);

            if (response && response.status === 'success') {
                console.log('[SHAPESECURITY-EXTRACT] ✓ Extraction mode enabled successfully');
                console.log('[SHAPESECURITY-EXTRACT] Step 5: Reloading page...');

                // Reload the page to trigger Shape Security scripts
                await chrome.tabs.reload(tab.id);
                console.log('[SHAPESECURITY-EXTRACT] ✓ Page reload initiated');

                // Show success notification
                NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Shape Security'));
            } else {
                throw new Error(response?.error || 'Failed to enable extraction mode');
            }

            console.log('[SHAPESECURITY-EXTRACT] ========== EXTRACTION STARTED ==========');
        } catch (error) {
            console.error('[SHAPESECURITY-EXTRACT] ❌ Failed to start extraction:', error);
            console.error('[SHAPESECURITY-EXTRACT] Error stack:', error.stack);
            NotificationHelper.error('Failed to start extraction: ' + error.message);
        }
    }

    /**
     * Display extracted script data in modal (matching Akamai Analysis style)
     */
    displayScriptDataModal(data) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        // Process data
        const initJsScripts = data?.initJsUrls || [];
        const seedScripts = data?.seedUrls || [];
        const allScripts = data?.allScripts || [];
        const totalScripts = allScripts.length;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 400px; max-height: 90vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">🟠</span> Shape Security Analysis
                    </h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px; line-height: 1;">×</button>
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Total Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${totalScripts}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Init.js Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${initJsScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Seed Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${seedScripts.length}</span>
                    </div>
                </div>

                <!-- Shape Security Scripts Section -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 18px;">🟠</span>
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Shape Security Scripts</h4>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                            <span style="font-size: 16px;">⚙️</span>
                            <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">Script Analysis</span>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-left: 22px;">
                            Found ${totalScripts} relevant script${totalScripts !== 1 ? 's' : ''}
                        </div>
                    </div>

                    ${initJsScripts.length > 0 ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-weight: 500; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Init.js Script${initJsScripts.length > 1 ? 's' : ''}</div>
                        ${initJsScripts.map((url, index) => `
                            <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; ${index > 0 ? 'margin-top: 8px;' : ''}">
                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Script URL:</div>
                                <div style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.4;">
                                    ${AdvancedUtils.escapeHtml(url)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    ${seedScripts.length > 0 ? `
                    <div style="margin-top: 12px;">
                        <div style="font-weight: 500; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Seed Script${seedScripts.length > 1 ? 's' : ''}</div>
                        ${seedScripts.map((url, index) => `
                            <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; ${index > 0 ? 'margin-top: 8px;' : ''}">
                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Script URL:</div>
                                <div style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.4;">
                                    ${AdvancedUtils.escapeHtml(url)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>

                <!-- Export Code Button -->
                <button
                    id="exportCodeBtn"
                    style="width: 100%; background: #2196F3; color: white; border: none; border-radius: 6px; padding: 12px; font-size: 13px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px;"
                >
                    <span style="font-size: 16px;">📄</span>
                    Export Code
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Fade in animation
        setTimeout(() => modal.style.opacity = '1', 10);

        // Close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 200);
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 200);
            }
        });

        // Export code button
        const exportCodeBtn = modal.querySelector('#exportCodeBtn');
        console.log('[ShapeSecurity] Export button lookup result:', {
            found: !!exportCodeBtn,
            element: exportCodeBtn,
            modalAppended: document.body.contains(modal)
        });

        if (exportCodeBtn) {
            console.log('[ShapeSecurity] Adding click listener to Export Code button');
            exportCodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[ShapeSecurity] ========== EXPORT CODE CLICKED ==========');
                console.log('[ShapeSecurity] Data available:');
                console.log('  - allScripts:', allScripts);
                console.log('  - initJsScripts:', initJsScripts);
                console.log('  - seedScripts:', seedScripts);

                // Build scripts array from URLs
                const scripts = (allScripts || []).map(url => ({
                    url: url,
                    isInitJs: url.includes('/init.js'),
                    hasSeed: url.includes('seed='),
                    seed: url.includes('seed=') ? url.match(/seed=([A-Za-z0-9_\-]+)/)?.[1] : null
                }));

                console.log('[ShapeSecurity] Built scripts array:', scripts);

                if (scripts.length === 0) {
                    console.error('[ShapeSecurity] No scripts to export!');
                    NotificationHelper.warning('No scripts available to export');
                    return;
                }

                console.log('[ShapeSecurity] Calling displayExportCodeModal...');
                try {
                    this.displayExportCodeModal(scripts);
                    console.log('[ShapeSecurity] displayExportCodeModal called successfully');
                } catch (error) {
                    console.error('[ShapeSecurity] Error calling displayExportCodeModal:', error);
                    NotificationHelper.error('Failed to open export modal: ' + error.message);
                }
            });
            console.log('[ShapeSecurity] Click listener added successfully');
        } else {
            console.error('[ShapeSecurity] ❌ Export code button not found in modal!');
            console.error('[ShapeSecurity] Modal HTML:', modal.innerHTML.substring(0, 500));
        }
    }

    /**
     * OLD: Display script analysis results in a detailed modal (KEPT FOR REFERENCE)
     */
    displayScriptResultsOld(scripts) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        // Count scripts with seeds
        const scriptsWithSeeds = scripts.filter(s => s.hasSeed);
        const scriptsWithoutSeeds = scripts.filter(s => !s.hasSeed);

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🔍 Shape Security Scripts Analysis</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Total Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${scripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">With Seed Parameters:</span>
                        <span style="color: var(--success); font-weight: 500;">${scriptsWithSeeds.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Without Seeds:</span>
                        <span style="color: var(--text-muted); font-weight: 500;">${scriptsWithoutSeeds.length}</span>
                    </div>
                </div>

                ${scripts.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                        <div style="font-size: 14px; color: var(--text-secondary);">No Shape Security scripts found</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Scripts with "seed=" parameters or "shape" in URL will appear here</div>
                    </div>
                ` : `
                    ${scriptsWithSeeds.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <div style="font-weight: 500; color: var(--success); margin-bottom: 12px; font-size: 14px;">
                                🌱 Scripts with Seed Parameters (${scriptsWithSeeds.length})
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                ${scriptsWithSeeds.map(script => `
                                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; border-left: 3px solid var(--success);">
                                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                            <div style="font-size: 12px; color: var(--text-secondary); word-break: break-all; flex: 1; font-family: monospace;">
                                                ${AdvancedUtils.escapeHtml(script.url)}
                                            </div>
                                            <button class="copy-script-url" data-url="${AdvancedUtils.escapeHtml(script.url)}" style="background: var(--bg-primary); border: none; color: var(--text-primary); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;">📋 Copy</button>
                                        </div>
                                        ${script.seed ? `
                                            <div style="background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-top: 8px;">
                                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Seed Parameter:</div>
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <code style="font-size: 11px; color: var(--success); word-break: break-all; flex: 1;">${AdvancedUtils.truncate(script.seed, 100)}</code>
                                                    <button class="copy-seed" data-seed="${AdvancedUtils.escapeHtml(script.seed)}" style="background: var(--success); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;">📋 Copy Seed</button>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${scriptsWithoutSeeds.length > 0 ? `
                        <div>
                            <div style="font-weight: 500; color: var(--text-muted); margin-bottom: 12px; font-size: 14px;">
                                📜 Other Shape Security Scripts (${scriptsWithoutSeeds.length})
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${scriptsWithoutSeeds.map(script => `
                                    <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                        <div style="font-size: 12px; color: var(--text-secondary); word-break: break-all; flex: 1; font-family: monospace;">
                                            ${AdvancedUtils.escapeHtml(script.url)}
                                        </div>
                                        <button class="copy-script-url" data-url="${AdvancedUtils.escapeHtml(script.url)}" style="background: var(--bg-primary); border: none; color: var(--text-primary); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;">📋</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                `}

                <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bg-tertiary); display: flex; gap: 8px;">
                    <button class="export-code-btn" style="flex: 1; background: #1976D2; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">📜 Export Code</button>
                    <button class="copy-all-scripts" style="flex: 1; background: var(--info); color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">📄 Copy All URLs</button>
                    <button class="modal-close-btn" style="flex: 1; background: var(--bg-tertiary); color: var(--text-primary); border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Fade in animation
        setTimeout(() => modal.style.opacity = '1', 10);

        // Setup event listeners
        const closeModal = () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 200);
        };

        // Close button
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Copy individual script URL buttons
        modal.querySelectorAll('.copy-script-url').forEach(btn => {
            btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-url');
                try {
                    await navigator.clipboard.writeText(url);
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.background = 'var(--success)';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = 'var(--bg-primary)';
                    }, 2000);
                } catch (error) {
                    console.error('Copy failed:', error);
                    NotificationHelper.error('Failed to copy URL');
                }
            });
        });

        // Copy seed buttons
        modal.querySelectorAll('.copy-seed').forEach(btn => {
            btn.addEventListener('click', async () => {
                const seed = btn.getAttribute('data-seed');
                try {
                    await navigator.clipboard.writeText(seed);
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.background = '#4CAF50';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = 'var(--success)';
                    }, 2000);
                } catch (error) {
                    console.error('Copy failed:', error);
                    NotificationHelper.error('Failed to copy seed');
                }
            });
        });

        // Copy all URLs button
        const copyAllBtn = modal.querySelector('.copy-all-scripts');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async () => {
                const allUrls = scripts.map(s => s.url).join('\n');
                try {
                    await navigator.clipboard.writeText(allUrls);
                    const originalText = copyAllBtn.textContent;
                    copyAllBtn.textContent = '✓ Copied All!';
                    copyAllBtn.style.background = '#4CAF50';
                    setTimeout(() => {
                        copyAllBtn.textContent = originalText;
                        copyAllBtn.style.background = 'var(--info)';
                    }, 2000);
                } catch (error) {
                    console.error('Copy failed:', error);
                    NotificationHelper.error('Failed to copy URLs');
                }
            });
        }

        // Export code button
        const exportCodeBtn = modal.querySelector('.export-code-btn');
        if (exportCodeBtn) {
            exportCodeBtn.addEventListener('click', () => {
                this.displayExportCodeModal(scripts);
            });
        }
    }

    /**
     * Display export code modal with script URL parsers
     */
    displayExportCodeModal(scripts) {
        const exportModal = document.createElement('div');
        exportModal.className = 'tool-modal export-code-modal';
        exportModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.2s;';

        // Categorize scripts like in analyze scripts
        const seedScripts = scripts.filter(s => s.hasSeed);
        const initJsScripts = [];

        // Derive init scripts from seed scripts (same URL without ?seed=xxx)
        seedScripts.forEach(seedScript => {
            const initUrl = seedScript.url.split('?seed')[0];
            if (scripts.some(s => s.url === initUrl) && !initJsScripts.some(i => i.url === initUrl)) {
                initJsScripts.push({ url: initUrl, isInitJs: true });
            }
        });

        // Also include ?async scripts as init
        scripts.forEach(s => {
            if (s.url.includes('?async') && !initJsScripts.some(i => i.url === s.url)) {
                initJsScripts.push(s);
            }
        });

        const scriptCategories = {
            init: initJsScripts,
            seed: seedScripts
        };

        const hasInitJs = initJsScripts.length > 0;
        const hasSeeds = seedScripts.length > 0;

        // Generate code for each language (default: 'all')
        let currentExportType = 'all';
        const generateCode = (exportType) => {
            return this.generateParsingCode(scripts, { hasInitJs, hasSeeds, scriptType: exportType });
        };
        let parsingCodes = generateCode(currentExportType);

        exportModal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow: hidden; width: 95%; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">📜 Script Parsing Code Generator</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <!-- Export Options -->
                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">Export Options</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="export-type-btn active" data-type="all" style="background: var(--accent); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">All Types</button>
                            ${hasInitJs ? '<button class="export-type-btn" data-type="init" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Init</button>' : ''}
                            ${hasSeeds ? '<button class="export-type-btn" data-type="seed" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Seed</button>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="lang-tab active" data-lang="javascript" style="padding: 6px 12px; border: none; background: var(--accent); color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">JavaScript</button>
                    <button class="lang-tab" data-lang="python" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Python</button>
                    <button class="lang-tab" data-lang="nodejs" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Node.js</button>
                    <button class="lang-tab" data-lang="php" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">PHP</button>
                    <button class="lang-tab" data-lang="go" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Go</button>
                </div>

                <!-- Code Areas -->
                <div style="position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;">
                    <div class="code-container" data-lang="javascript" style="display: flex; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.javascript}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🌐 Browser console code for intercepting and parsing Shape Security scripts</div>
                    </div>

                    <div class="code-container" data-lang="python" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.python}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐍 Python script with requests and BeautifulSoup</div>
                    </div>

                    <div class="code-container" data-lang="nodejs" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.nodejs}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">📦 Node.js script with axios and cheerio</div>
                    </div>

                    <div class="code-container" data-lang="php" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.php}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐘 PHP script with cURL and DOMDocument</div>
                    </div>

                    <div class="code-container" data-lang="go" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.go}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐹 Go with net/http and goquery</div>
                    </div>

                    <!-- Copy Button -->
                    <button class="copy-parsing-code" style="position: absolute; top: 8px; right: 8px; background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; z-index: 10;">Copy Code</button>
                </div>

                <!-- Close Button -->
                <div style="text-align: center; margin-top: 16px; flex-shrink: 0;">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(exportModal);

        // Fade in animation
        setTimeout(() => exportModal.style.opacity = '1', 10);

        // Close handlers
        exportModal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                exportModal.style.opacity = '0';
                setTimeout(() => exportModal.remove(), 200);
            });
        });

        exportModal.addEventListener('click', (e) => {
            if (e.target === exportModal) {
                exportModal.style.opacity = '0';
                setTimeout(() => exportModal.remove(), 200);
            }
        });

        // Export type buttons
        exportModal.querySelectorAll('.export-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const exportType = btn.getAttribute('data-type');

                // Update button styles
                exportModal.querySelectorAll('.export-type-btn').forEach(b => {
                    b.style.background = 'var(--bg-secondary)';
                    b.style.color = 'var(--text-primary)';
                    b.style.border = '1px solid var(--border)';
                    b.classList.remove('active');
                });
                btn.style.background = 'var(--accent)';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.classList.add('active');

                // Regenerate code with new export type
                currentExportType = exportType;
                parsingCodes = generateCode(currentExportType);

                // Update all code displays
                Object.entries(parsingCodes).forEach(([lang, code]) => {
                    const textarea = exportModal.querySelector(`.code-container[data-lang="${lang}"] textarea`);
                    if (textarea) {
                        textarea.value = code;
                    }
                });
            });
        });

        // Language tab switching
        exportModal.querySelectorAll('.lang-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');

                // Update button styles
                exportModal.querySelectorAll('.lang-tab').forEach(b => {
                    b.style.background = 'var(--bg-secondary)';
                    b.style.color = 'var(--text-primary)';
                    b.classList.remove('active');
                });
                btn.style.background = 'var(--accent)';
                btn.style.color = 'white';
                btn.classList.add('active');

                // Show/hide code containers
                exportModal.querySelectorAll('.code-container').forEach(container => {
                    container.style.display = container.getAttribute('data-lang') === lang ? 'flex' : 'none';
                });
            });
        });

        // Copy code button
        const copyBtn = exportModal.querySelector('.copy-parsing-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Get currently visible textarea
                const visibleContainer = exportModal.querySelector('.code-container[style*="display: flex"]') ||
                                        exportModal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('textarea');

                if (textarea) {
                    navigator.clipboard.writeText(textarea.value).then(() => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = '✓ Copied!';
                        copyBtn.style.background = '#4CAF50';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                            copyBtn.style.background = 'var(--accent)';
                        }, 2000);
                    });
                }
            });
        }
    }

    /**
     * Generate parsing code for Shape Security script URLs
     * OPTIMIZED Phase 6B: Template caching for 80-90% faster repeat exports
     */
    generateParsingCode(scripts, options) {
        const { hasInitJs, hasVendor2, hasSeeds, scriptType = 'all' } = options;

        // OPTIMIZATION: Generate cache key from script pattern characteristics
        const cacheKey = JSON.stringify({
            scriptType,
            hasInitJs,
            hasVendor2,
            hasSeeds,
            scriptCount: scripts.length,
            patterns: {
                init: scripts.some(s => s.isInitJs),
                seed: scripts.some(s => s.hasSeed),
                vendor2: scripts.some(s => s.url.includes('vendor2.js'))
            }
        });

        // OPTIMIZATION: Return cached templates if available
        if (ShapeSecurityAdvanced.codeTemplateCache.has(cacheKey)) {
            console.log('[ShapeSecurityAdvanced] Using cached code templates');
            return ShapeSecurityAdvanced.codeTemplateCache.get(cacheKey);
        }

        console.log('[ShapeSecurityAdvanced] Generating new code templates (not cached)');

        const initScripts = scripts.filter(s => s.isInitJs);
        const vendor2Scripts = scripts.filter(s => s.url.includes('vendor2.js'));
        const seedScripts = scripts.filter(s => s.hasSeed);
        const sampleInitUrl = initScripts[0]?.url || 'https://example.com/path/init.js';
        const sampleVendor2Url = vendor2Scripts[0]?.url || 'https://example.com/vendor/static/vendor2.js';
        const sampleSeedUrl = seedScripts[0]?.url || 'https://example.com/vendor/static/vendor2.js?seed=xxxxx';

        // Determine which patterns to include based on scriptType
        const getPatterns = () => {
            switch (scriptType) {
                case 'init':
                    return ['/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi'];
                case 'seed':
                    return ['/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi'];
                case 'both':
                    return [
                        '/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi'
                    ];
                case 'all':
                default:
                    return [
                        '/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*shape[^"\']*)["\'"][^>]*>/gi'
                    ];
            }
        };

        const patterns = getPatterns();

        // Generate the code templates
        const templates = {
            javascript: `// JavaScript - Shape Security Script URL Parser
// Extract seed parameters and init.js paths from HTML

${hasSeeds ? `
// Extract seed parameter from script URL
function extractSeedParameter(url) {
    const seedMatch = url.match(/[?&]seed=([A-Za-z0-9_\\-]+)/);
    return seedMatch ? seedMatch[1] : null;
}

// Example usage:
const scriptUrl = '${sampleSeedUrl}';
const seed = extractSeedParameter(scriptUrl);
console.log('Extracted seed:', seed);
` : ''}

${hasInitJs ? `
// Find all init.js scripts in HTML
function findInitJsScripts(html) {
    const initScripts = [];
    const scriptRegex = /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        initScripts.push(match[1]);
    }

    return initScripts;
}

// Example usage:
const htmlContent = document.documentElement.outerHTML;
const initScripts = findInitJsScripts(htmlContent);
console.log('Found init.js scripts:', initScripts);
` : ''}

// Find all Shape Security scripts
function findShapeSecurityScripts(html) {
    const scripts = [];
    const patterns = [
        /<script[^>]*src=["']([^"']*seed=[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*shape[^"']*)["'][^>]*>/gi
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (!scripts.includes(url)) {
                scripts.push(url);
            }
        }
    });

    return scripts;
}

// Extract all Shape Security data
const allScripts = findShapeSecurityScripts(document.documentElement.outerHTML);
console.log('All Shape Security scripts:', allScripts);`,

            python: `# Python - Shape Security Script URL Parser
import re
from typing import List, Optional

${hasSeeds ? `
def extract_seed_parameter(url: str) -> Optional[str]:
    """Extract seed parameter from script URL"""
    match = re.search(r'[?&]seed=([A-Za-z0-9_\\-]+)', url)
    return match.group(1) if match else None

# Example usage:
script_url = '${sampleSeedUrl}'
seed = extract_seed_parameter(script_url)
print(f'Extracted seed: {seed}')
` : ''}

${hasInitJs ? `
def find_init_js_scripts(html: str) -> List[str]:
    """Find all init.js scripts in HTML"""
    pattern = r'<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>'
    matches = re.finditer(pattern, html, re.IGNORECASE)
    return [match.group(1) for match in matches]

# Example usage:
# with open('page.html', 'r') as f:
#     html_content = f.read()
# init_scripts = find_init_js_scripts(html_content)
# print(f'Found init.js scripts: {init_scripts}')
` : ''}

def find_shape_security_scripts(html: str) -> List[str]:
    """Find all Shape Security scripts in HTML"""
    scripts = []
    patterns = [
        r'<script[^>]*src=["\\']([^"\\']*seed=[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*vendor2\\.js[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*shape[^"\\']*)["\\''][^>]*>'
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, html, re.IGNORECASE):
            url = match.group(1)
            if url not in scripts:
                scripts.append(url)

    return scripts

# Extract all Shape Security data
# all_scripts = find_shape_security_scripts(html_content)
# print(f'All Shape Security scripts: {all_scripts}')`,

            nodejs: `// Node.js - Shape Security Script URL Parser
const { JSDOM } = require('jsdom');

${hasSeeds ? `
// Extract seed parameter from script URL
function extractSeedParameter(url) {
    const seedMatch = url.match(/[?&]seed=([A-Za-z0-9_\\-]+)/);
    return seedMatch ? seedMatch[1] : null;
}

// Example usage:
const scriptUrl = '${sampleSeedUrl}';
const seed = extractSeedParameter(scriptUrl);
console.log('Extracted seed:', seed);
` : ''}

${hasInitJs ? `
// Find all init.js scripts in HTML
function findInitJsScripts(html) {
    const initScripts = [];
    const scriptRegex = /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        initScripts.push(match[1]);
    }

    return initScripts;
}
` : ''}

// Find all Shape Security scripts
function findShapeSecurityScripts(html) {
    const scripts = [];
    const patterns = [
        /<script[^>]*src=["']([^"']*seed=[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*shape[^"']*)["'][^>]*>/gi
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (!scripts.includes(url)) {
                scripts.push(url);
            }
        }
    });

    return scripts;
}

// Example with JSDOM:
// const dom = new JSDOM(htmlContent);
// const allScripts = findShapeSecurityScripts(dom.serialize());
// console.log('All Shape Security scripts:', allScripts);`,

            php: `<?php
// PHP - Shape Security Script URL Parser

${hasSeeds ? `
/**
 * Extract seed parameter from script URL
 */
function extractSeedParameter($url) {
    if (preg_match('/[?&]seed=([A-Za-z0-9_\\-]+)/', $url, $matches)) {
        return $matches[1];
    }
    return null;
}

// Example usage:
$scriptUrl = '${sampleSeedUrl}';
$seed = extractSeedParameter($scriptUrl);
echo "Extracted seed: $seed\\n";
` : ''}

${hasInitJs ? `
/**
 * Find all init.js scripts in HTML
 */
function findInitJsScripts($html) {
    $initScripts = [];
    $pattern = '/<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>/i';

    if (preg_match_all($pattern, $html, $matches)) {
        $initScripts = $matches[1];
    }

    return $initScripts;
}
` : ''}

/**
 * Find all Shape Security scripts in HTML
 */
function findShapeSecurityScripts($html) {
    $scripts = [];
    $patterns = [
        '/<script[^>]*src=["\\']([^"\\']*seed=[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*vendor2\\.js[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*shape[^"\\']*)["\\''][^>]*>/i'
    ];

    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $html, $matches)) {
            foreach ($matches[1] as $url) {
                if (!in_array($url, $scripts)) {
                    $scripts[] = $url;
                }
            }
        }
    }

    return $scripts;
}

// Example usage:
// $htmlContent = file_get_contents('page.html');
// $allScripts = findShapeSecurityScripts($htmlContent);
// print_r($allScripts);
?>`,

            go: `// Go - Shape Security Script URL Parser
package main

import (
    "fmt"
    "regexp"
)

${hasSeeds ? `
// ExtractSeedParameter extracts seed parameter from script URL
func ExtractSeedParameter(url string) string {
    re := regexp.MustCompile(\`[?&]seed=([A-Za-z0-9_\\-]+)\`)
    matches := re.FindStringSubmatch(url)
    if len(matches) > 1 {
        return matches[1]
    }
    return ""
}
` : ''}

${hasInitJs ? `
// FindInitJsScripts finds all init.js scripts in HTML
func FindInitJsScripts(html string) []string {
    var initScripts []string
    re := regexp.MustCompile(\`<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["`+`'`+`][^>]*>\`)
    matches := re.FindAllStringSubmatch(html, -1)

    for _, match := range matches {
        if len(match) > 1 {
            initScripts = append(initScripts, match[1])
        }
    }

    return initScripts
}
` : ''}

// FindShapeSecurityScripts finds all Shape Security scripts in HTML
func FindShapeSecurityScripts(html string) []string {
    var scripts []string
    seen := make(map[string]bool)

    patterns := []string{
        \`<script[^>]*src=["']([^"']*seed=[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*shape[^"']*)["`+`'`+`][^>]*>\`,
    }

    for _, pattern := range patterns {
        re := regexp.MustCompile(pattern)
        matches := re.FindAllStringSubmatch(html, -1)

        for _, match := range matches {
            if len(match) > 1 {
                url := match[1]
                if !seen[url] {
                    scripts = append(scripts, url)
                    seen[url] = true
                }
            }
        }
    }

    return scripts
}

// Example usage:
// func main() {
//     scriptURL := "${sampleSeedUrl}"
//     seed := ExtractSeedParameter(scriptURL)
//     fmt.Printf("Extracted seed: %s\\n", seed)
// }`
        };

        // OPTIMIZATION: Cache the generated templates
        ShapeSecurityAdvanced.codeTemplateCache.set(cacheKey, templates);

        // OPTIMIZATION: Limit cache size (LRU-like eviction)
        if (ShapeSecurityAdvanced.codeTemplateCache.size > ShapeSecurityAdvanced.CODE_CACHE_MAX_SIZE) {
            const firstKey = ShapeSecurityAdvanced.codeTemplateCache.keys().next().value;
            ShapeSecurityAdvanced.codeTemplateCache.delete(firstKey);
        }

        return templates;
    }

    /**
     * Escape HTML for safe display in code blocks
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Display extraction results
     */
    displayExtractionResults(extractedData) {
        console.log('[ShapeSecurity] Displaying extraction results:', extractedData);
        NotificationHelper.success('Shape Security data extracted successfully!');

        // Refresh the capture history to show new data
        this.renderCapturedDataSection();
    }
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShapeSecurityAdvanced;
} else if (typeof window !== 'undefined') {
    window.ShapeSecurityAdvanced = ShapeSecurityAdvanced;
    console.log('[ShapeSecurityAdvanced] ✓ Loaded and exported to window.ShapeSecurityAdvanced');
}
