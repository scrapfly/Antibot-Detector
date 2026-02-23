/**
 * shapesecurity-advanced-ui.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


    /**
     * Render Shape Security specific tools
     */
ShapeSecurityAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'shapesecurityCheckVersion',
                label: 'Check Version',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.77,14.05 22,13.55 22,13C22,12.45 21.77,11.95 21.41,11.58Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityCheckCookies',
                label: 'Check Cookies',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityStartCapture',
                label: 'Start Capturing',
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityAnalyzeScripts',
                label: 'Analyze Scripts',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


    /**
     * Setup Shape Security specific tool listeners
     */
ShapeSecurityAdvanced.prototype.setupToolListeners = function() {
        // Prevent duplicate listener setup
        if (this.listenersSetup) {
            Logger.network('[ShapeSecurity] Listeners already setup, skipping...');
            return;
        }

        Logger.network('[ShapeSecurity] Setting up tool listeners...');
        this.listenersSetup = true;

        this.bindToolActions([
            { id: 'shapesecurityCheckVersion', method: () => this.checkVersion() },
            { id: 'shapesecurityCheckCookies', method: () => this.checkCookies() },
            { id: 'shapesecurityStartCapture', method: () => this.startCapturing() },
            { id: 'shapesecurityAnalyzeScripts', method: () => this.extractScripts() }
        ]);

        ['shapesecurityCheckVersion', 'shapesecurityCheckCookies', 'shapesecurityStartCapture', 'shapesecurityAnalyzeScripts']
            .forEach((id) => Logger.network(`[ShapeSecurity] Listener added for: ${id}`));
    };


    /**
     * Override history item rendering for Shape Security specific display
     */
ShapeSecurityAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        return items.map((item) => {
            const { hostname, captureData, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.getFaviconUrl(hostname);

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
    };


    /**
     * Override renderCaptureDetailsContent to show Shape Security specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
ShapeSecurityAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const headers = data.headers || [];
        const cookie = data.cookie || null;
        const version = data.version || 'v2';
        const timestamp = new Date(capture.timestamp).toLocaleString();

        // Extract unique header patterns (extract middle 8 characters)
        // e.g., "X-DQ7Hy5L1-z" -> "DQ7Hy5L1"
        const headerPatterns = [...new Set(headers.map(h => {
            const name = h.name;
            const match = name.match(/^X-([A-Za-z0-9]{8})-[a-z]$/i);
            if (match) {
                return match[1]; // Return the 8 character pattern
            }
            return name;
        }))];

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Shape Security Version</label>
                <div class="advanced-modal-code-block" data-copy="${version.toUpperCase()}" style="cursor: pointer;" title="Click to copy">${version.toUpperCase()}</div>
            </div>

            ${headerPatterns.length > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Header Pattern${headerPatterns.length > 1 ? 's' : ''}</label>
                ${headerPatterns.map(pattern => `
                    <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(pattern)}" style="cursor: pointer; margin-bottom: 8px;" title="Click to copy">${AdvancedUtils.escapeHtml(pattern)}</div>
                `).join('')}
            </div>
            ` : ''}

            ${cookie ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Shape Cookie</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="cursor: pointer;" title="Click to copy">${AdvancedUtils.escapeHtml(cookie.name)}</div>
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };

    // ========================================================================
    // CAPTURE HOOKS (Override base module behavior)
    // ========================================================================


    /**
     * Display headers analysis results
     */
ShapeSecurityAdvanced.prototype.displayHeadersResults = function(headers) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'analysis-results-modal';
        resultDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000;';

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
                <h3 style="margin: 0 0 16px 0;">Shape Security Headers</h3>
                <div class="details-grid">
                    ${headersList || '<div class="detail-empty">No dynamic headers found</div>'}
                </div>
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
    };


    /**
     * Display cookie check results (Akamai-style compact modal)
     */
ShapeSecurityAdvanced.prototype.displayCookieResults = function(cookieData) {
        const modal = this.createToolModal();

        const cookieFound = cookieData ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Shape Security Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                ${this.buildCookieStatusSummary(cookieFound, 1)}

                ${cookieData ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.name)}" data-copy-message="Value copied" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${AdvancedUtils.escapeHtml(cookieData.name)}</div>
                            <div style="display: flex; gap: 6px;">
                                <span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.value)}" data-copy-message="Value copied" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${AdvancedUtils.escapeHtml(cookieData.value.substring(0, 60))}${cookieData.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Max-Age: 1577847600 seconds (50 years)</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">No Shape Security cookies found</div>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Copy-value hover feedback
        modal.querySelectorAll('.copy-value').forEach(element => {
            // Hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });
    };


    /**
     * Display extracted script data in modal (matching Akamai Analysis style)
     */
ShapeSecurityAdvanced.prototype.displayScriptDataModal = function(data) {
        const modal = this.createToolModal();

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
                    <button class="advanced-modal-close-btn">×</button>
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
                    Export Code
                </button>
            </div>
        `;

        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Export code button
        const exportCodeBtn = modal.querySelector('#exportCodeBtn');
        Logger.network('[ShapeSecurity] Export button lookup result:', {
            found: !!exportCodeBtn,
            element: exportCodeBtn,
            modalAppended: document.body.contains(modal)
        });

        if (exportCodeBtn) {
            Logger.network('[ShapeSecurity] Adding click listener to Export Code button');
            exportCodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                Logger.network('[ShapeSecurity] ========== EXPORT CODE CLICKED ==========');
                Logger.network('[ShapeSecurity] Data available:');
                Logger.network('  - allScripts:', allScripts);
                Logger.network('  - initJsScripts:', initJsScripts);
                Logger.network('  - seedScripts:', seedScripts);

                // Build scripts array from URLs
                const scripts = (allScripts || []).map(url => ({
                    url: url,
                    isInitJs: url.includes('/init.js'),
                    hasSeed: url.includes('seed='),
                    seed: url.includes('seed=') ? url.match(/seed=([A-Za-z0-9_\-]+)/)?.[1] : null
                }));

                Logger.network('[ShapeSecurity] Built scripts array:', scripts);

                if (scripts.length === 0) {
                    Logger.error('NETWORK', '[ShapeSecurity] No scripts to export!');
                    NotificationHelper.warning('No scripts available to export');
                    return;
                }

                Logger.network('[ShapeSecurity] Calling displayExportCodeModal...');
                try {
                    this.displayExportCodeModal(scripts);
                    Logger.network('[ShapeSecurity] displayExportCodeModal called successfully');
                } catch (error) {
                    Logger.error('NETWORK', '[ShapeSecurity] Error calling displayExportCodeModal:', error);
                    NotificationHelper.error('Failed to open export modal: ' + error.message);
                }
            });
            Logger.network('[ShapeSecurity] Click listener added successfully');
        } else {
            Logger.error('NETWORK', '[ShapeSecurity] Export code button not found in modal!');
            Logger.error('NETWORK', '[ShapeSecurity] Modal HTML:', modal.innerHTML.substring(0, 500));
        }
    };


    /**
     * OLD: Display script analysis results in a detailed modal (KEPT FOR REFERENCE)
     */
ShapeSecurityAdvanced.prototype.displayScriptResultsOld = function(scripts) {
        const modal = this.createToolModal();

        // Count scripts with seeds
        const scriptsWithSeeds = scripts.filter(s => s.hasSeed);
        const scriptsWithoutSeeds = scripts.filter(s => !s.hasSeed);

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Shape Security Scripts Analysis</h3>
                    <button class="advanced-modal-close-btn">×</button>
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
                        <div style="font-size: 14px; color: var(--text-secondary);">No Shape Security scripts found</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Scripts with "seed=" parameters or "shape" in URL will appear here</div>
                    </div>
                ` : `
                    ${scriptsWithSeeds.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <div style="font-weight: 500; color: var(--success); margin-bottom: 12px; font-size: 14px;">
                                Scripts with Seed Parameters (${scriptsWithSeeds.length})
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                ${scriptsWithSeeds.map(script => `
                                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; border-left: 3px solid var(--success);">
                                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                            <div style="font-size: 12px; color: var(--text-secondary); word-break: break-all; flex: 1; font-family: monospace;">
                                                ${AdvancedUtils.escapeHtml(script.url)}
                                            </div>
                                            <button class="copy-script-url" data-url="${AdvancedUtils.escapeHtml(script.url)}" style="margin-left: 8px; flex-shrink: 0;">Copy</button>
                                        </div>
                                        ${script.seed ? `
                                            <div style="background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-top: 8px;">
                                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Seed Parameter:</div>
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <code style="font-size: 11px; color: var(--success); word-break: break-all; flex: 1;">${AdvancedUtils.truncate(script.seed, 100)}</code>
                                                    <button class="copy-seed" data-seed="${AdvancedUtils.escapeHtml(script.seed)}" style="margin-left: 8px; flex-shrink: 0;">Copy Seed</button>
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
                                Other Shape Security Scripts (${scriptsWithoutSeeds.length})
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${scriptsWithoutSeeds.map(script => `
                                    <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                        <div style="font-size: 12px; color: var(--text-secondary); word-break: break-all; flex: 1; font-family: monospace;">
                                            ${AdvancedUtils.escapeHtml(script.url)}
                                        </div>
                                        <button class="copy-script-url" data-url="${AdvancedUtils.escapeHtml(script.url)}" style="margin-left: 8px; flex-shrink: 0;">Copy</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                `}

                <div class="modal-button-group">
                    <button class="export-code-btn advanced-modal-action-btn" style="margin-bottom: 0; flex: 1;">Export Code</button>
                    <button class="copy-all-scripts advanced-modal-action-btn">Copy All URLs</button>
                </div>
            </div>
        `;

        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Copy individual script URL buttons
        modal.querySelectorAll('.copy-script-url').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-url');
                if (!url) {
                    return;
                }
                AdvancedUtils.copyToClipboard(url, btn, {
                    notificationMessage: 'URL copied'
                });
            });
        });

        // Copy seed buttons
        modal.querySelectorAll('.copy-seed').forEach(btn => {
            btn.addEventListener('click', () => {
                const seed = btn.getAttribute('data-seed');
                if (!seed) {
                    return;
                }
                AdvancedUtils.copyToClipboard(seed, btn, {
                    notificationMessage: 'Seed copied'
                });
            });
        });

        // Copy all URLs button
        const copyAllBtn = modal.querySelector('.copy-all-scripts');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const allUrls = scripts.map(s => s.url).join('\n');
                AdvancedUtils.copyToClipboard(allUrls, copyAllBtn, {
                    notificationMessage: 'All URLs copied'
                });
            });
        }

        // Export code button
        const exportCodeBtn = modal.querySelector('.export-code-btn');
        if (exportCodeBtn) {
            exportCodeBtn.addEventListener('click', () => {
                this.displayExportCodeModal(scripts);
            });
        }
    };


    /**
     * Display export code modal with script URL parsers
     */
ShapeSecurityAdvanced.prototype.displayExportCodeModal = function(scripts) {
        const exportModal = this.createToolModal({ zIndex: 10001 });
        exportModal.classList.add('export-code-modal');

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
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Script Parsing Code Generator</h3>
                    <button class="advanced-modal-close-btn">×</button>
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
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Browser console code for intercepting and parsing Shape Security scripts</div>
                    </div>

                    <div class="code-container" data-lang="python" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.python}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Python script with requests and BeautifulSoup</div>
                    </div>

                    <div class="code-container" data-lang="nodejs" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.nodejs}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Node.js script with axios and cheerio</div>
                    </div>

                    <div class="code-container" data-lang="php" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.php}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">PHP script with cURL and DOMDocument</div>
                    </div>

                    <div class="code-container" data-lang="go" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.go}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Go with net/http and goquery</div>
                    </div>

                    <!-- Copy Button -->
                    <button class="copy-parsing-code advanced-modal-copy-btn" style="position: absolute; top: 8px; right: 8px; z-index: 10; padding: 4px 10px; font-size: 11px;">Copy Code</button>
                </div>
            </div>
        `;

        this.bindModalClose(exportModal);
        this.showToolModal(exportModal);

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
                const visibleContainer = exportModal.querySelector('.code-container[style*="display: flex"]') ||
                                        exportModal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('textarea');

                if (textarea) {
                    AdvancedUtils.copyToClipboard(textarea.value, copyBtn, {
                        notificationMessage: 'Code copied'
                    });
                }
            });
        }
    };


    /**
     * Display extraction results
     */
ShapeSecurityAdvanced.prototype.displayExtractionResults = function(extractedData) {
        Logger.network('[ShapeSecurity] Displaying extraction results:', extractedData);
        NotificationHelper.success('Shape Security data extracted successfully!');

        // Refresh the capture history to show new data
        this.renderCapturedDataSection();
    };
