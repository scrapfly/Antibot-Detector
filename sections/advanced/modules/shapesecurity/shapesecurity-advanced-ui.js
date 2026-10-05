    /**
     * Render Shape Security specific tools
     */
ShapeSecurityAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'shapesecurityCheckVersion',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckVersion')) || 'Check Version'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.77,14.05 22,13.55 22,13C22,12.45 21.77,11.95 21.41,11.58Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                    </svg>
                `
            },
            {
                id: 'shapesecurityAnalyzeScripts',
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
     * Setup Shape Security specific tool listeners
     */
ShapeSecurityAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[ShapeSecurity] Setting up tool listeners...');

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
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);

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
                                <span class="capture-type-label">${shapeSecurityText('advShapeCookieLabel', 'Cookie')}</span>
                                <span class="capture-type-value">${cookie ? 1 : 0}</span>
                                <span class="capture-type-label">${shapeSecurityText('advShapeHeadersLabel', 'Headers')}</span>
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
            return `<div class="advanced-modal-section"><span class="advanced-modal-error">${shapeSecurityText('advCommonNoCaptureData', 'No capture data available')}</span></div>`;
        }

        const data = capture.captureData;
        const headers = data.headers || [];
        const cookie = data.cookie || null;
        const version = data.version || 'v2';
        const timestamp = shapeSecurityDateTime(capture.timestamp);
        const clickToCopy = AdvancedUtils.escapeHtml(shapeSecurityText('advCommonClickToCopy', 'Click to copy'));

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
                <label class="advanced-modal-label">${shapeSecurityText('advShapeVersionTitle', 'Shape Security Version')}</label>
                <div class="advanced-modal-code-block" data-copy="${version.toUpperCase()}" style="cursor: pointer;" title="${clickToCopy}">${version.toUpperCase()}</div>
            </div>

            ${headerPatterns.length > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${headerPatterns.length > 1 ? shapeSecurityText('advShapeHeaderPatterns', 'Header Patterns') : shapeSecurityText('advShapeHeaderPattern', 'Header Pattern')}</label>
                ${headerPatterns.map(pattern => `
                    <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(pattern)}" style="cursor: pointer; margin-bottom: 8px;" title="${clickToCopy}">${AdvancedUtils.escapeHtml(pattern)}</div>
                `).join('')}
            </div>
            ` : ''}

            ${cookie ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${shapeSecurityText('advShapeCookieTitle', 'Shape Cookie')}</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="cursor: pointer;" title="${clickToCopy}">${AdvancedUtils.escapeHtml(cookie.name)}</div>
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${shapeSecurityText('advCommonCaptured', 'Captured')}</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };

    // ========================================================================
    // CAPTURE HOOKS (Override base module behavior)
    // ========================================================================


    /**
     * Display cookie check results (Akamai-style compact modal)
     */
ShapeSecurityAdvanced.prototype.displayCookieResults = function(cookieData) {
        const modal = this.createToolModal();

        const cookieFound = cookieData ? 1 : 0;
        const valueCopied = shapeSecurityText('advValueCopied', 'Value copied');
        const valueCopiedAttr = AdvancedUtils.escapeHtml(valueCopied);

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${shapeSecurityText('advCommonCookiesTitleFmt', '{0} Cookies', 'Shape Security')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                ${this.buildCookieStatusSummary(cookieFound, 1)}

                ${cookieData ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.name)}" data-copy-message="${valueCopiedAttr}" style="font-weight: 500; color: var(--text-primary); font-family: var(--font-mono); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="${AdvancedUtils.escapeHtml(shapeSecurityText('advCommonClickToCopy', 'Click to copy'))}">${AdvancedUtils.escapeHtml(cookieData.name)}</div>
                            <div style="display: flex; gap: 6px;">
                                <span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookieData.value)}" data-copy-message="${valueCopiedAttr}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="${AdvancedUtils.escapeHtml(shapeSecurityText('advCommonClickToCopyFull', 'Click to copy full value'))}">${AdvancedUtils.escapeHtml(cookieData.value.substring(0, 60))}${cookieData.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${shapeSecurityText('advShapeMaxAgeInfoFmt', 'Max-Age: {0} seconds (50 years)', 1577847600)}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">${shapeSecurityText('advCommonNoCookiesFmt', 'No {0} cookies found', 'Shape Security')}</div>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: valueCopied });
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
                        <span style="font-size: 20px;">🟠</span> ${shapeSecurityText('advShapeAnalysisTitle', 'Shape Security Analysis')}
                    </h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${shapeSecurityText('advCommonTotalScripts', 'Total Scripts:')}</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${totalScripts}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${shapeSecurityText('advShapeInitJsScriptsLabel', 'Init.js Scripts:')}</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${initJsScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${shapeSecurityText('advShapeSeedScriptsLabel', 'Seed Scripts:')}</span>
                        <span style="color: var(--text-primary); font-weight: 600; font-size: 14px;">${seedScripts.length}</span>
                    </div>
                </div>

                <!-- Shape Security Scripts Section -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 18px;">🟠</span>
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${shapeSecurityText('advShapeScriptsHeading', 'Shape Security Scripts')}</h4>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                                <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${shapeSecurityText('advCommonScriptAnalysis', 'Script Analysis')}</span>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-left: 22px;">
                            ${shapeSecurityText('advCommonFoundScriptsFmt', 'Found {0} relevant script(s)', totalScripts)}
                        </div>
                    </div>

                    ${initJsScripts.length > 0 ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-weight: 500; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${initJsScripts.length > 1 ? shapeSecurityText('advShapeInitJsScripts', 'Init.js Scripts') : shapeSecurityText('advShapeInitJsScript', 'Init.js Script')}</div>
                        ${initJsScripts.map((url, index) => `
                            <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; ${index > 0 ? 'margin-top: 8px;' : ''}">
                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${shapeSecurityText('advCommonScriptUrl', 'Script URL:')}</div>
                                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.4;">
                                    ${AdvancedUtils.escapeHtml(url)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    ${seedScripts.length > 0 ? `
                    <div style="margin-top: 12px;">
                        <div style="font-weight: 500; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${seedScripts.length > 1 ? shapeSecurityText('advShapeSeedScripts', 'Seed Scripts') : shapeSecurityText('advShapeSeedScript', 'Seed Script')}</div>
                        ${seedScripts.map((url, index) => `
                            <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; ${index > 0 ? 'margin-top: 8px;' : ''}">
                                <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${shapeSecurityText('advCommonScriptUrl', 'Script URL:')}</div>
                                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.4;">
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
                    ${shapeSecurityText('advCommonExportCode', 'Export Code')}
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
                    NotificationHelper.warning(shapeSecurityText('advCommonNoScriptsToExport', 'No scripts available to export'));
                    return;
                }

                Logger.network('[ShapeSecurity] Calling displayExportCodeModal...');
                try {
                    this.displayExportCodeModal(scripts);
                    Logger.network('[ShapeSecurity] displayExportCodeModal called successfully');
                } catch (error) {
                    Logger.error('NETWORK', '[ShapeSecurity] Error calling displayExportCodeModal:', error);
                    NotificationHelper.error(shapeSecurityText('advCommonFailedOpenExportFmt', 'Failed to open export modal: {0}', error.message));
                }
            });
            Logger.network('[ShapeSecurity] Click listener added successfully');
        } else {
            Logger.error('NETWORK', '[ShapeSecurity] Export code button not found in modal!');
            Logger.error('NETWORK', '[ShapeSecurity] Modal HTML:', modal.innerHTML.substring(0, 500));
        }
    };


    /**
     * Display export code modal with script URL parsers
     */
ShapeSecurityAdvanced.prototype.displayExportCodeModal = function(scripts) {
        const seedScripts = scripts.filter(s => s.hasSeed);
        const initJsScripts = [];
        seedScripts.forEach(seedScript => {
            const initUrl = seedScript.url.split('?seed')[0];
            if (scripts.some(s => s.url === initUrl) && !initJsScripts.some(i => i.url === initUrl)) {
                initJsScripts.push({ url: initUrl, isInitJs: true });
            }
        });
        scripts.forEach(s => {
            if (s.url.includes('?async') && !initJsScripts.some(i => i.url === s.url)) initJsScripts.push(s);
        });
        const hasInitJs = initJsScripts.length > 0;
        const hasSeeds = seedScripts.length > 0;
        const types = [{ id: 'all', label: shapeSecurityText('advCommonAllTypes', 'All Types') }];
        if (hasInitJs) types.push({ id: 'init', label: 'Init' });
        if (hasSeeds) types.push({ id: 'seed', label: 'Seed' });
        const descriptions = {
            javascript: shapeSecurityText('advCodeDescBrowserParseFmt', 'Browser console code for intercepting and parsing {0} scripts', 'Shape Security'),
            python: shapeSecurityText('advCodeDescPythonBs', 'Python script with requests and BeautifulSoup'),
            nodejs: shapeSecurityText('advCodeDescNodeCheerio', 'Node.js script with axios and cheerio'),
            php: shapeSecurityText('advCodeDescPhpDom', 'PHP script with cURL and DOMDocument'),
            go: shapeSecurityText('advCodeDescGoQuery', 'Go with net/http and goquery')
        };
        return AdvancedCodeDialog.open(this, {
            title: shapeSecurityText('advCommonCodeGenTitle', 'Script Parsing Code Generator'), types,
            languages: [{ id: 'javascript', label: 'JavaScript' }, { id: 'python', label: 'Python' }, { id: 'nodejs', label: 'Node.js' }, { id: 'php', label: 'PHP' }, { id: 'go', label: 'Go' }],
            getCodes: type => this.generateParsingCode(scripts, { hasInitJs, hasSeeds, scriptType: type }),
            description: (type, language) => descriptions[language]
        });
    };


