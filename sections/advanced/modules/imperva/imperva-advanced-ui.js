/**
 * imperva-advanced-ui.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


    /**
     * Render Imperva-specific tools
     */
ImpervaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'impervaCheckCookies',
                label: 'Check Cookies',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'impervaStartCapture',
                label: 'Start Capturing',
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                    </svg>
                `
            },
            {
                id: 'impervaAnalyzeScripts',
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
     * Setup Imperva-specific tool listeners
     */
ImpervaAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'impervaCheckCookies', method: () => this.checkCookies() },
            { id: 'impervaStartCapture', method: () => this.startCapturing() },
            { id: 'impervaAnalyzeScripts', method: () => this.extractScripts() }
        ]);
    };


    /**
     * Override history item rendering for Imperva-specific display
     */
ImpervaAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        return items.map((item) => {
            const { hostname, captureData, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.getFaviconUrl(hostname);

            const incapSesCount = (captureData.incapSesCookies || []).length;

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            ${incapSesCount > 0 ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">Session Cookies</span>
                                <span class="capture-type-value" style="color: var(--info);">${incapSesCount}</span>
                            </div>
                            ` : ''}
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };


    /**
     * Override renderCaptureDetailsContent to show Imperva-specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
ImpervaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const incapSesCount = (data.incapSesCookies || []).length;
        const nlbiCount = (data.nlbiCookies || []).length;
        const visidCount = (data.visidCookies || []).length;
        const resourceUrlsCount = (data.incapResourceUrls || []).length;
        const interrogationUrlsCount = (data.interrogationUrls || []).length;

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Security Components</label>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">reese84</span>
                    <span class="advanced-modal-info-value">${data.requiresReese84 ? 'Found' : 'Not found'}</span>
                </div>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">utmvc</span>
                    <span class="advanced-modal-info-value">${data.requiresUtmvc ? 'Found' : 'Not found'}</span>
                </div>
            </div>

            ${incapSesCount > 0 || nlbiCount > 0 || visidCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Session Cookies</label>
                ${incapSesCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">incap_ses</span>
                    <span class="advanced-modal-info-value">${incapSesCount} cookie(s)</span>
                </div>
                ` : ''}
                ${nlbiCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">nlbi</span>
                    <span class="advanced-modal-info-value">${nlbiCount} cookie(s)</span>
                </div>
                ` : ''}
                ${visidCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">visid_incap</span>
                    <span class="advanced-modal-info-value">${visidCount} cookie(s)</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${resourceUrlsCount > 0 || interrogationUrlsCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Resource Detection</label>
                ${resourceUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Resource URLs</span>
                    <span class="advanced-modal-info-value">${resourceUrlsCount}</span>
                </div>
                ` : ''}
                ${interrogationUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Interrogation URLs</span>
                    <span class="advanced-modal-info-value">${interrogationUrlsCount}</span>
                </div>
                ` : ''}
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
    // IMPERVA-SPECIFIC METHODS (using BaseInterceptorHelpers)
    // ========================================================================


    /**
     * Display extraction results in a modal (Akamai-style design)
     */
ImpervaAdvanced.prototype.displayExtractionResults = function(extractedData) {
        Logger.network('[IMPERVA-EXTRACT] Displaying extraction results:', extractedData);

        const modal = this.createToolModal();

        const cookieData = extractedData.cookies || {};
        const hasCookies = cookieData.reese84 || cookieData.utmvc ||
                          (cookieData.incap_ses && cookieData.incap_ses.length > 0) ||
                          (cookieData.nlbi && cookieData.nlbi.length > 0) ||
                          (cookieData.visid && cookieData.visid.length > 0);

        // Parse script paths
        const scriptPaths = this.parseScriptPaths(extractedData);
        const hasScriptPaths = scriptPaths.utmvcScriptPath || scriptPaths.reeseScriptPath;

        // Generate parsing code if we have script paths
        const parsingCodes = hasScriptPaths ? this.generateParsingCode(extractedData, scriptPaths) : null;

        // Count relevant scripts
        const totalScripts = (extractedData.scriptUrls || []).length;
        const impervaScripts = [];
        const hostname = extractedData.hostname ? 'https://' + extractedData.hostname : '';
        if (scriptPaths.reeseScriptPath) impervaScripts.push({ type: 'Reese84', path: scriptPaths.reeseScriptPath, url: hostname + scriptPaths.reeseScriptPath });
        if (scriptPaths.utmvcScriptPath) impervaScripts.push({ type: 'UTMVC', path: scriptPaths.utmvcScriptPath, url: hostname + scriptPaths.utmvcScriptPath });

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Imperva Analysis</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Script URL:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${impervaScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Sensor URL:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${scriptPaths.reeseSensorPath ? 1 : 0}</span>
                    </div>
                </div>

                ${impervaScripts.length > 0 ? `
                    <!-- Imperva Scripts Section -->
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">IMPERVA SCRIPTS</h4>

                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">Script Analysis</span>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                            Found ${impervaScripts.length} relevant script(s)
                        </div>

                        ${impervaScripts.map((script, idx) => `
                            <div style="margin-bottom: ${idx < impervaScripts.length - 1 ? '16px' : '0'};">
                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">
                                    ${script.type} Script
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Script URL:</div>
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url || script.path)}" style="background: var(--bg-primary); border: 1px solid var(--primary); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="Click to copy">
                                        ${script.url || script.path}
                                    </div>
                                </div>
                                ${script.type === 'Reese84' && scriptPaths.reeseSensorPath ? `
                                    <div>
                                        <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Sensor Path:</div>
                                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml((extractedData.hostname ? 'https://' + extractedData.hostname : '') + scriptPaths.reeseSensorPath + '?d=' + extractedData.hostname)}" style="background: var(--bg-primary); border: 1px solid var(--border); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="Click to copy">
                                            ${extractedData.hostname ? 'https://' + extractedData.hostname : ''}${scriptPaths.reeseSensorPath}?d=${extractedData.hostname}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${hasScriptPaths ? `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <button class="export-code-btn modal-export-code-btn">
                            Export Code
                        </button>
                    </div>
                ` : ''}

                ${impervaScripts.length === 0 ? `
                    <div style="text-align: center; padding: 48px 16px; opacity: 0.7;">
                        <div style="font-size: 16px; color: var(--text-primary); margin-bottom: 8px;">No scripts detected</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">Imperva may not be present on this page</div>
                    </div>
                ` : ''}
            </div>
        `;

        this.showToolModal(modal);

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });

        this.bindModalClose(modal);

        // Export Code button
        if (parsingCodes) {
            const exportBtn = modal.querySelector('.export-code-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    this.displayExportCodeModal(parsingCodes, scriptPaths, extractedData);
                });
            }
        }

        // Show success notification
        const scriptCount = (scripts || []).length;
        NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(scriptCount));
    };


    /**
     * Display export code in a separate modal (Akamai-style)
     */
ImpervaAdvanced.prototype.displayExportCodeModal = function(parsingCodes, scriptPaths, extractedData) {
        const modal = this.createToolModal({ zIndex: 10001 });
        modal.classList.add('export-code-modal');

        const hostname = extractedData.hostname || 'example.com';
        const hasReese84 = !!scriptPaths.reeseScriptPath;
        const hasUtmvc = !!scriptPaths.utmvcScriptPath;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 85vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600;">Script Parsing Code Generator</h3>
                    </div>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Export Options -->
                <div style="margin-bottom: 16px;">
                    <div style="color: var(--text-primary); font-size: 13px; font-weight: 600; margin-bottom: 8px;">Export Options</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${(hasReese84 && hasUtmvc) ? `
                            <button class="export-option-btn" data-option="all" style="padding: 8px 16px; background: #1976D2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">All Types</button>
                        ` : ''}
                        ${hasReese84 ? `
                            <button class="export-option-btn" data-option="reese84" style="padding: 8px 16px; background: ${(hasReese84 && hasUtmvc) ? 'var(--bg-tertiary)' : '#1976D2'}; color: ${(hasReese84 && hasUtmvc) ? 'var(--text-secondary)' : 'white'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Reese84 Only</button>
                        ` : ''}
                        ${hasUtmvc ? `
                            <button class="export-option-btn" data-option="utmvc" style="padding: 8px 16px; background: ${(hasReese84 && hasUtmvc) ? 'var(--bg-tertiary)' : '#1976D2'}; color: ${(hasReese84 && hasUtmvc) ? 'var(--text-secondary)' : 'white'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">UTMVC Only</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
                    <button class="code-tab-btn" data-lang="javascript" style="padding: 8px 14px; background: #1976D2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">JavaScript</button>
                    <button class="code-tab-btn" data-lang="python" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Python</button>
                    <button class="code-tab-btn" data-lang="nodejs" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Node.js</button>
                    <button class="code-tab-btn" data-lang="php" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">PHP</button>
                    <button class="code-tab-btn" data-lang="csharp" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">C#</button>
                    <button class="code-tab-btn" data-lang="go" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Go</button>
                </div>

                <!-- Code Display -->
                <div style="position: relative; margin-bottom: 12px;">
                    <div class="code-content" data-lang="javascript" style="display: block;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.javascript)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="javascript" style="position: absolute; top: 10px; right: 10px; padding: 4px 10px; font-size: 11px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="python" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.python)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="python" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="nodejs" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.javascript)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="nodejs" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="php" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.php)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="php" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="csharp" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.csharp)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="csharp" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="go" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${AdvancedUtils.escapeHtml(parsingCodes.go)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="go" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                </div>

                <!-- Browser Console Note -->
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px;">
                    <span style="font-size: 14px;"></span>
                    <span style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">Browser console code for intercepting and parsing Imperva scripts</span>
                </div>
            </div>
        `;

        this.showToolModal(modal);

        this.bindModalClose(modal);

        // Export Options toggle (if present)
        modal.querySelectorAll('.export-option-btn').forEach(optionBtn => {
            optionBtn.addEventListener('click', () => {
                const option = optionBtn.getAttribute('data-option');

                // Update button styles
                modal.querySelectorAll('.export-option-btn').forEach(btn => {
                    if (btn.getAttribute('data-option') === option) {
                        btn.style.background = '#1976D2';
                        btn.style.color = 'white';
                    } else {
                        btn.style.background = 'var(--bg-tertiary)';
                        btn.style.color = 'var(--text-secondary)';
                    }
                });

                // Regenerate code with selected export type
                const filteredCodes = this.generateParsingCode(extractedData, scriptPaths, option);

                // Update all code displays
                Object.entries(filteredCodes).forEach(([lang, code]) => {
                    const codeContent = modal.querySelector(`.code-content[data-lang="${lang}"] pre code`);
                    if (codeContent) {
                        codeContent.textContent = code;
                    }
                });
            });
        });

        // Code tab switching
        modal.querySelectorAll('.code-tab-btn').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                const lang = tabBtn.getAttribute('data-lang');

                // Update tab styles
                modal.querySelectorAll('.code-tab-btn').forEach(btn => {
                    if (btn.getAttribute('data-lang') === lang) {
                        btn.style.background = '#1976D2';
                        btn.style.color = 'white';
                    } else {
                        btn.style.background = 'var(--bg-tertiary)';
                        btn.style.color = 'var(--text-secondary)';
                    }
                });

                // Show/hide code content
                modal.querySelectorAll('.code-content').forEach(content => {
                    content.style.display = content.getAttribute('data-lang') === lang ? 'block' : 'none';
                });
            });
        });

        // Copy code buttons
        modal.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');

                let code;
                if (lang === 'nodejs') {
                    code = parsingCodes.javascript;
                } else if (parsingCodes[lang]) {
                    code = parsingCodes[lang];
                } else {
                    code = parsingCodes.javascript;
                }

                AdvancedUtils.copyToClipboard(code, btn, {
                    notificationMessage: 'Code copied'
                });
            });
        });
    };


    /**
     * Display cookies modal (Imperva-specific UI)
     */
ImpervaAdvanced.prototype.displayCookiesModal = function(foundCookies, cookieStatus, protectionLevel) {
        const modal = this.createToolModal();

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Imperva Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Protection Level:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${protectionLevel}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCookies.length}</span>
                    </div>
                </div>

                ${foundCookies.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">No Imperva cookies found</div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${foundCookies.map(cookie => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${cookie.name}</div>
                                    <div style="display: flex; gap: 6px;">
                                        ${cookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                        ${cookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                    </div>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.value || 'N/A')}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${cookie.value ? cookie.value.substring(0, 60) : 'N/A'}${cookie.value && cookie.value.length > 60 ? '...' : ''}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cookie.domain}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });
        this.bindModalClose(modal);
        this.showToolModal(modal);
    };
