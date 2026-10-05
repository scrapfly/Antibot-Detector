    /**
     * Render Imperva-specific tools
     */
ImpervaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'impervaCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'impervaStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                    </svg>
                `
            },
            {
                id: 'impervaAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
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
        const tr = ImpervaAdvanced.tr;
        return items.map((item) => {
            const { hostname, captureData, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);

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
                                <span class="capture-type-label">${tr('advImpervaSessionCookies', 'Session Cookies')}</span>
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
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">' + tr('advCommonNoCaptureData', 'No capture data available') + '</span></div>';
        }
        const foundText = tr('advCommonFound', 'Found');
        const notFoundText = tr('advCommonNotFound', 'Not found');

        const data = capture.captureData;
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const incapSesCount = (data.incapSesCookies || []).length;
        const nlbiCount = (data.nlbiCookies || []).length;
        const visidCount = (data.visidCookies || []).length;
        const resourceUrlsCount = (data.incapResourceUrls || []).length;
        const interrogationUrlsCount = (data.interrogationUrls || []).length;

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${tr('advImpervaSecurityComponents', 'Security Components')}</label>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">reese84</span>
                    <span class="advanced-modal-info-value">${data.requiresReese84 ? foundText : notFoundText}</span>
                </div>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">utmvc</span>
                    <span class="advanced-modal-info-value">${data.requiresUtmvc ? foundText : notFoundText}</span>
                </div>
            </div>

            ${incapSesCount > 0 || nlbiCount > 0 || visidCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${tr('advImpervaSessionCookies', 'Session Cookies')}</label>
                ${incapSesCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">incap_ses</span>
                    <span class="advanced-modal-info-value">${fmt('advImpervaCookieCountFmt', 'Cookies: {0}', incapSesCount)}</span>
                </div>
                ` : ''}
                ${nlbiCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">nlbi</span>
                    <span class="advanced-modal-info-value">${fmt('advImpervaCookieCountFmt', 'Cookies: {0}', nlbiCount)}</span>
                </div>
                ` : ''}
                ${visidCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">visid_incap</span>
                    <span class="advanced-modal-info-value">${fmt('advImpervaCookieCountFmt', 'Cookies: {0}', visidCount)}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${resourceUrlsCount > 0 || interrogationUrlsCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${tr('advImpervaResourceDetection', 'Resource Detection')}</label>
                ${resourceUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${tr('advImpervaResourceUrls', 'Resource URLs')}</span>
                    <span class="advanced-modal-info-value">${resourceUrlsCount}</span>
                </div>
                ` : ''}
                ${interrogationUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${tr('advImpervaInterrogationUrls', 'Interrogation URLs')}</span>
                    <span class="advanced-modal-info-value">${interrogationUrlsCount}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${tr('advCommonCaptured', 'Captured')}</span>
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
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        const clickToCopy = tr('advCommonClickToCopy', 'Click to copy');

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
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${tr('advImpervaAnalysisTitle', 'Imperva Analysis')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advCommonScriptUrl', 'Script URL:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${impervaScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advImpervaSensorUrl', 'Sensor URL:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${scriptPaths.reeseSensorPath ? 1 : 0}</span>
                    </div>
                </div>

                ${impervaScripts.length > 0 ? `
                    <!-- Imperva Scripts Section -->
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">${tr('advImpervaScriptsHeading', 'Imperva Scripts')}</h4>

                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${tr('advCommonScriptAnalysis', 'Script Analysis')}</span>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                            ${fmt('advCommonFoundScriptsFmt', 'Found {0} relevant script(s)', impervaScripts.length)}
                        </div>

                        ${impervaScripts.map((script, idx) => `
                            <div style="margin-bottom: ${idx < impervaScripts.length - 1 ? '16px' : '0'};">
                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">
                                    ${fmt('advImpervaScriptTypeFmt', '{0} Script', script.type)}
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">${tr('advCommonScriptUrl', 'Script URL:')}</div>
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url || script.path)}" style="background: var(--bg-primary); border: 1px solid var(--primary); padding: 10px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="${clickToCopy}">
                                        ${script.url || script.path}
                                    </div>
                                </div>
                                ${script.type === 'Reese84' && scriptPaths.reeseSensorPath ? `
                                    <div>
                                        <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">${tr('advImpervaSensorPath', 'Sensor Path:')}</div>
                                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml((extractedData.hostname ? 'https://' + extractedData.hostname : '') + scriptPaths.reeseSensorPath + '?d=' + extractedData.hostname)}" style="background: var(--bg-primary); border: 1px solid var(--border); padding: 10px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="${clickToCopy}">
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
                            ${tr('advCommonExportCode', 'Export Code')}
                        </button>
                    </div>
                ` : ''}

                ${impervaScripts.length === 0 ? `
                    <div style="text-align: center; padding: 48px 16px; opacity: 0.7;">
                        <div style="font-size: 16px; color: var(--text-primary); margin-bottom: 8px;">${tr('advImpervaNoScripts', 'No scripts detected')}</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">${tr('advImpervaMayNotBePresent', 'Imperva may not be present on this page')}</div>
                    </div>
                ` : ''}
            </div>
        `;

        this.showToolModal(modal);

        this.bindCopyValueHandlers(modal, { defaultMessage: tr('advValueCopied', 'Value copied') });
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
        const scriptCount = impervaScripts.length;
        NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(scriptCount));
    };


    /**
     * Display export code in a separate modal (Akamai-style)
     */
ImpervaAdvanced.prototype.displayExportCodeModal = function(parsingCodes, scriptPaths, extractedData) {
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        const hasReese84 = !!scriptPaths.reeseScriptPath;
        const hasUtmvc = !!scriptPaths.utmvcScriptPath;
        const types = [];
        if (hasReese84 && hasUtmvc) types.push({ id: 'all', label: tr('advCommonAllTypes', 'All Types') });
        if (hasReese84) types.push({ id: 'reese84', label: fmt('advImpervaTypeOnlyFmt', '{0} Only', 'Reese84') });
        if (hasUtmvc) types.push({ id: 'utmvc', label: fmt('advImpervaTypeOnlyFmt', '{0} Only', 'UTMVC') });
        let initial = true;
        return AdvancedCodeDialog.open(this, {
            title: tr('advCommonCodeGenTitle', 'Script Parsing Code Generator'), types,
            languages: ['javascript', 'python', 'nodejs', 'php', 'csharp', 'go'].map((id, index) => ({ id, label: ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'][index] })),
            getCodes: type => {
                const codes = initial ? parsingCodes : this.generateParsingCode(extractedData, scriptPaths, type);
                initial = false;
                return { ...codes, nodejs: codes.javascript };
            },
            description: fmt('advCodeDescBrowserParseFmt', 'Browser console code for intercepting and parsing {0} scripts', 'Imperva')
        });
    };


    /**
     * Display cookies modal (Imperva-specific UI)
     */
ImpervaAdvanced.prototype.displayCookiesModal = function(foundCookies, cookieStatus, protectionLevel) {
        const modal = this.createToolModal();
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        // protectionLevel arrives in English (it is also logged); translate for display only
        const levelKeys = {
            'None': ['advCommonNone', 'None'],
            'Advanced (reese84 + utmvc)': ['advImpervaLevelAdvanced', 'Advanced (reese84 + utmvc)'],
            'Standard': ['advCommonStandard', 'Standard'],
            'Basic (Session)': ['advImpervaLevelBasicSession', 'Basic (Session)']
        };
        const levelText = levelKeys[protectionLevel] ? tr(...levelKeys[protectionLevel]) : protectionLevel;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${fmt('advCommonCookiesTitleFmt', '{0} Cookies', 'Imperva')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advCommonProtectionLevel', 'Protection Level:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${levelText}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advCommonCookiesFound', 'Cookies Found:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCookies.length}</span>
                    </div>
                </div>

                ${foundCookies.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">${fmt('advCommonNoCookiesFmt', 'No {0} cookies found', 'Imperva')}</div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${foundCookies.map(cookie => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="font-weight: 500; color: var(--text-primary); font-family: var(--font-mono); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="${tr('advCommonClickToCopy', 'Click to copy')}">${cookie.name}</div>
                                    <div style="display: flex; gap: 6px;">
                                        ${cookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                        ${cookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                    </div>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.value || 'N/A')}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="${tr('advCommonClickToCopyFull', 'Click to copy full value')}">${cookie.value ? cookie.value.substring(0, 60) : 'N/A'}${cookie.value && cookie.value.length > 60 ? '...' : ''}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">${tr('advCommonDomainLabel', 'Domain:')} ${cookie.domain}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: tr('advValueCopied', 'Value copied') });
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
