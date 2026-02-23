/**
 * akamai-advanced-ui.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */



    /**
     * Check for Akamai cookies on the current page
     */
AkamaiAdvanced.prototype.checkCookies = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });

            const akamaiCookies = {
                _abck: cookies.find(c => c.name === '_abck'),
                ak_bmsc: cookies.find(c => c.name === 'ak_bmsc'),
                bm_sz: cookies.find(c => c.name === 'bm_sz'),
                bm_sv: cookies.find(c => c.name === 'bm_sv'),
                bm_mi: cookies.find(c => c.name === 'bm_mi'),
                sbsd: cookies.find(c => c.name === 'sbsd'),
                sbsd_o: cookies.find(c => c.name === 'sbsd_o')
            };

            const foundCookies = Object.entries(akamaiCookies)
                .filter(([name, cookie]) => cookie)
                .map(([name, cookie]) => ({
                    name: name,
                    value: cookie.value,
                    domain: cookie.domain,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly
                }));

            // Debug logs - show all cookies found
            Logger.network('[Akamai Debug] ========== CHECK COOKIES ==========');
            Logger.network('[Akamai Debug] URL:', this.tabInfo.url);
            Logger.network('[Akamai Debug] Cookies Found:', foundCookies.length + '/7');

            Logger.network('[Akamai Debug] Cookie Details:');
            if (akamaiCookies._abck) {
                const isEasyMode = akamaiCookies._abck.value.includes('~0~');
                Logger.network('[Akamai Debug]   _abck:', {
                    value: akamaiCookies._abck.value.substring(0, 100) + '...',
                    length: akamaiCookies._abck.value.length,
                    domain: akamaiCookies._abck.domain,
                    easyMode: isEasyMode
                });
            } else {
                Logger.network('[Akamai Debug]   _abck: NOT FOUND');
            }

            if (akamaiCookies.sbsd) {
                Logger.network('[Akamai Debug]   sbsd:', akamaiCookies.sbsd.value.substring(0, 50) + '...');
            } else {
                Logger.network('[Akamai Debug]   sbsd: NOT FOUND');
            }

            if (akamaiCookies.sbsd_o) {
                Logger.network('[Akamai Debug]   sbsd_o:', akamaiCookies.sbsd_o.value.substring(0, 50) + '...');
            } else {
                Logger.network('[Akamai Debug]   sbsd_o: NOT FOUND');
            }

            Logger.network('[Akamai Debug]   ak_bmsc:', akamaiCookies.ak_bmsc ? 'FOUND' : 'NOT FOUND');
            Logger.network('[Akamai Debug]   bm_sz:', akamaiCookies.bm_sz ? 'FOUND' : 'NOT FOUND');
            Logger.network('[Akamai Debug]   bm_sv:', akamaiCookies.bm_sv ? 'FOUND' : 'NOT FOUND');
            Logger.network('[Akamai Debug]   bm_mi:', akamaiCookies.bm_mi ? 'FOUND' : 'NOT FOUND');

            // Determine protection level
            const hasAbck = akamaiCookies._abck;
            const hasBmSz = akamaiCookies.bm_sz;
            const hasSbsd = akamaiCookies.sbsd || akamaiCookies.sbsd_o;
            let protectionLevel = 'None';
            if (hasAbck && hasBmSz && hasSbsd) {
                protectionLevel = 'Advanced (SBSD)';
            } else if (hasAbck && hasBmSz) {
                protectionLevel = 'Standard';
            } else if (hasAbck) {
                protectionLevel = 'Basic';
            }

            Logger.network('[Akamai Debug] Protection Level:', protectionLevel);
            Logger.network('[Akamai Debug] ========================================');

            // Show notification
            const foundCount = foundCookies.length;
            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, 7));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Akamai'));
            }

            this.displayCookiesModal(foundCookies, akamaiCookies);
        } catch (error) {
            Logger.error('NETWORK', 'Failed to check Akamai cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    };



    /**
     * Display cookies in a modal
     */
AkamaiAdvanced.prototype.displayCookiesModal = function(foundCookies, allCookies) {
        const modal = this.createToolModal();

        const hasAbck = allCookies._abck;
        const hasBmSz = allCookies.bm_sz;
        const hasSbsd = allCookies.sbsd || allCookies.sbsd_o;

        // Check _abck level
        const isEasyMode = hasAbck && allCookies._abck.value.includes('~0~');

        let protectionLevel = 'None';
        if (hasAbck && hasBmSz && hasSbsd) {
            protectionLevel = 'Advanced (SBSD)';
        } else if (hasAbck && hasBmSz) {
            protectionLevel = 'Standard';
        } else if (hasAbck) {
            protectionLevel = 'Basic';
        }

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Akamai Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Protection Level:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${protectionLevel}</span>
                    </div>
                    ${hasAbck ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-secondary); font-size: 13px;">_abck level:</span>
                            <span style="color: ${isEasyMode ? 'var(--success)' : 'var(--text-primary)'}; font-weight: 500;">${isEasyMode ? 'Easy' : 'Standard'}</span>
                        </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCookies.length}/7</span>
                    </div>
                </div>

                ${foundCookies.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;"></div>
                        <div style="font-size: 14px;">No Akamai cookies found</div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${foundCookies.map(cookie => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div class="copy-value" data-copy="${cookie.name}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${cookie.name}</div>
                                    <div style="display: flex; gap: 6px;">
                                        ${cookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                        ${cookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                    </div>
                                </div>
                                <div class="copy-value" data-copy="${cookie.value}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${cookie.value.substring(0, 60)}${cookie.value.length > 60 ? '...' : ''}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cookie.domain}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        this.bindModalClose(modal);
        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });
        this.showToolModal(modal);
    };



    /**
     * Display content analysis in a modal
     */
AkamaiAdvanced.prototype.displayAnalysisModal = function(analysis) {
        const modal = this.createToolModal();

        const detectedPatterns = Object.entries(analysis.patterns).filter(([key, value]) => value);
        const hasAkamaiCookies = analysis.cookies && (analysis.cookies._abck || analysis.cookies.ak_bmsc || analysis.cookies.bm_sz);

        // Determine mode/version
        let mode = 'Not Detected';
        let modeColor = 'var(--text-muted)';
        if (analysis.isEasyMode) {
            mode = 'Easy Mode (~0~)';
            modeColor = 'var(--success)';
        } else if (analysis.requiresPixel) {
            mode = 'Pixel Challenge';
            modeColor = 'var(--danger)';
        } else if (analysis.requiresSecCpt) {
            mode = 'sec_cpt Challenge';
            modeColor = 'var(--danger)';
        } else if (analysis.requiresSbsd) {
            mode = 'SBSD Challenge';
            modeColor = 'var(--danger)';
        } else if (hasAkamaiCookies) {
            mode = 'Standard';
            modeColor = 'var(--text-primary)';
        }

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Akamai Analysis</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Total Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scriptCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Akamai Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0)}</span>
                    </div>
                </div>



                ${(analysis.scripts.length > 0 || (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) || detectedPatterns.length > 0 || hasAkamaiCookies) ? `
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">Akamai Scripts</h4>
                    <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <!-- Header Section -->
                        <div style="display: flex; align-items: center; justify-content: flex-start; margin-bottom: 16px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;"></span>
                                <div>
                                    <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">Script Analysis</div>
                                    <div style="color: var(--text-muted); font-size: 11px;">Found ${analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0)} relevant script(s)</div>
                                </div>
                            </div>
                        </div>


                        <!-- Challenge Details -->
                        ${(analysis.akamaiScriptPath || analysis.pixelHtmlVar || analysis.pixelScriptUrls || analysis.pixelScriptVar || (analysis.sbsdUrls && analysis.sbsdUrls.length > 0)) ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">Sensor Data URL Script</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.akamaiScriptPath ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Script URL:</div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${analysis.akamaiScriptPath}
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelHtmlVar ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel HTML Variable:</span>
                                            </div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px;">
                                                bazadebezolkohpepadr="${analysis.pixelHtmlVar}"
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelScriptUrls ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel Challenge URLs:</span>
                                            </div>
                                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">Script URL:</div>
                                                    <div style="font-family: monospace; color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
                                                        ${analysis.pixelScriptUrls.scriptUrl}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">POST URL:</div>
                                                    <div style="font-family: monospace; color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
                                                        ${analysis.pixelScriptUrls.postUrl}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelScriptVar ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel Script Variable:</span>
                                            </div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${analysis.pixelScriptVar}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}

                        <!-- SBSD Script URLs -->
                        ${(analysis.sbsdUrls && analysis.sbsdUrls.length > 0) ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">SBSD Script URL</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.sbsdUrls.map(url => `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Script URL:</div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${url}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                    </div>
                ` : ''}


                ${analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0 ? `
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">🔗 Sensor Data URLs</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                        ${analysis.sensorDataUrls.map((url, idx) => `
                            <div style="background: var(--bg-tertiary); padding: 10px 12px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                    <span style="color: var(--text-secondary); font-size: 11px; margin-right: 8px;">${idx + 1}.</span>
                                    <span style="color: var(--text-primary); font-size: 12px; font-weight: 500;">Akamai Endpoint</span>
                                </div>
                                <div style="font-family: monospace; color: var(--text-muted); font-size: 11px; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${url}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}


                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="export-scripts-btn modal-export-code-btn">
                        <span>📤</span>
                        Export Code
                    </button>
                </div>
            </div>
        `;

        this.showToolModal(modal);
        this.bindModalClose(modal);

        // Add language tab handlers
        const langTabs = modal.querySelectorAll('.lang-tab');
        const codeContainers = modal.querySelectorAll('.code-container');

        langTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetLang = tab.getAttribute('data-lang');

                // Update tab styles
                langTabs.forEach(t => {
                    t.style.background = 'var(--bg-secondary)';
                    t.style.color = 'var(--text-primary)';
                    t.classList.remove('active');
                });
                tab.style.background = 'var(--accent)';
                tab.style.color = 'white';
                tab.classList.add('active');

                // Show/hide code containers
                codeContainers.forEach(container => {
                    const containerLang = container.getAttribute('data-lang');
                    container.style.display = containerLang === targetLang ? 'block' : 'none';
                });
            });
        });

        // Add export scripts button handler
        const exportScriptsBtn = modal.querySelector('.export-scripts-btn');
        if (exportScriptsBtn) {
            exportScriptsBtn.addEventListener('click', () => {
                // Include both sensorDataUrls and akamaiScriptPath
                const allSensorUrls = [...(analysis.sensorDataUrls || [])];
                if (analysis.akamaiScriptPath && !allSensorUrls.includes(analysis.akamaiScriptPath)) {
                    allSensorUrls.push(analysis.akamaiScriptPath);
                }
                this.showScriptParsingModal(analysis.scripts, allSensorUrls);
            });
        }

        // Add copy code button handler
        const copyBtn = modal.querySelector('.copy-parsing-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Find the currently visible textarea
                const visibleContainer = modal.querySelector('.code-container[style*="display: block"]') || modal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('.parsing-code-area');

                if (textarea) {
                    textarea.select();
                    document.execCommand('copy');

                    // Show feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.background = 'var(--success)';

                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--accent)';
                    }, 2000);
                }
            });
        }

    };



    /**
     * Show script parsing code modal
     */
AkamaiAdvanced.prototype.showScriptParsingModal = function(scripts, sensorDataUrls = []) {
        const modal = this.createToolModal();

        // Convert sensor data URLs to script-like objects for export
        const sensorUrlScripts = sensorDataUrls.map((url, index) => ({
            type: 'sensor-url',
            src: url,
            url: url,
            categories: ['sensor-url']
        }));

        const scriptCategories = {
            pixel: scripts.filter(s => s.categories.includes('pixel')),
            sensor: scripts.filter(s => s.categories.includes('sensor')),
            sbsd: scripts.filter(s => s.categories.includes('sbsd')),
            sensorUrl: sensorUrlScripts
        };

        const parsingCodes = this.generateScriptParsingCode(scriptCategories);

        modal.innerHTML = `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow: hidden; width: 95%; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Script Parsing Code Generator</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">Export Options</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="export-type-btn active" data-type="all" style="background: var(--accent); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">All Types</button>
                            ${scriptCategories.pixel.length > 0 ? '<button class="export-type-btn" data-type="pixel" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Pixel</button>' : ''}
                            ${(scriptCategories.sensor.length > 0 || scriptCategories.sensorUrl.length > 0) ? '<button class="export-type-btn" data-type="sensor" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Sensor</button>' : ''}
                            ${scriptCategories.sbsd.length > 0 ? '<button class="export-type-btn" data-type="sbsd" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">SBSD</button>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="lang-tab active" data-lang="javascript" style="padding: 6px 12px; border: none; background: var(--accent); color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">JavaScript</button>
                    <button class="lang-tab" data-lang="python" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Python</button>
                    <button class="lang-tab" data-lang="nodejs" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Node.js</button>
                    <button class="lang-tab" data-lang="php" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">PHP</button>
                    <button class="lang-tab" data-lang="csharp" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">C#</button>
                    <button class="lang-tab" data-lang="go" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Go</button>
                </div>

                <!-- Code Areas -->
                <div style="position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;">
                    <div class="code-container" data-lang="javascript" style="display: flex; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.javascript}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Browser console code for intercepting and parsing Akamai scripts</div>
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
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐘 PHP script with cURL and DOMDocument</div>
                    </div>

                    <div class="code-container" data-lang="csharp" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.csharp}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🔷 C# with HttpClient and HtmlAgilityPack</div>
                    </div>

                    <div class="code-container" data-lang="go" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.go}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐹 Go with net/http and goquery</div>
                    </div>

                    <!-- Copy Button -->
                    <button class="copy-parsing-code" style="position: absolute; top: 8px; right: 8px; z-index: 10;">Copy Code</button>
                </div>
            </div>
        `;

        this.showToolModal(modal);
        this.bindModalClose(modal);

        // Export type button handlers
        const exportTypeBtns = modal.querySelectorAll('.export-type-btn');
        let currentExportType = 'all';

        const updateCodeForExportType = (exportType) => {
            let filteredCategories = {};

            if (exportType === 'all') {
                filteredCategories = scriptCategories;
            } else {
                filteredCategories = {
                    pixel: exportType === 'pixel' ? scriptCategories.pixel : [],
                    sensor: exportType === 'sensor' ? scriptCategories.sensor : [],
                    sensorUrl: exportType === 'sensor' ? scriptCategories.sensorUrl : [],
                    sbsd: exportType === 'sbsd' ? scriptCategories.sbsd : []
                };
            }

            const newParsingCodes = this.generateScriptParsingCode(filteredCategories);

            // Update all textareas
            const textareas = modal.querySelectorAll('.parsing-code-area');
            textareas.forEach(textarea => {
                const container = textarea.closest('.code-container');
                const lang = container.dataset.lang;
                if (newParsingCodes[lang]) {
                    textarea.value = newParsingCodes[lang];
                }
            });
        };

        exportTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const exportType = btn.dataset.type;
                currentExportType = exportType;

                // Update active export type button
                exportTypeBtns.forEach(b => {
                    b.style.background = 'var(--bg-secondary)';
                    b.style.color = 'var(--text-primary)';
                    b.style.border = '1px solid var(--border)';
                    b.classList.remove('active');
                });
                btn.style.background = 'var(--accent)';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.classList.add('active');

                // Update code based on export type
                updateCodeForExportType(exportType);
            });
        });

        // Language tab handlers
        const langTabs = modal.querySelectorAll('.lang-tab');
        const codeContainers = modal.querySelectorAll('.code-container');

        langTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const lang = tab.dataset.lang;

                // Update active tab
                langTabs.forEach(t => {
                    t.style.background = 'var(--bg-secondary)';
                    t.style.color = 'var(--text-primary)';
                    t.classList.remove('active');
                });
                tab.style.background = 'var(--accent)';
                tab.style.color = 'white';
                tab.classList.add('active');

                // Show corresponding code container
                codeContainers.forEach(container => {
                    container.style.display = container.dataset.lang === lang ? 'flex' : 'none';
                });
            });
        });

        // Copy button handler
        const copyBtn = modal.querySelector('.copy-parsing-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const visibleContainer = modal.querySelector('.code-container[style*="display: block"]') || modal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('.parsing-code-area');

                if (textarea) {
                    textarea.select();
                    document.execCommand('copy');

                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.background = 'var(--success)';

                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--accent)';
                    }, 2000);
                }
            });
        }

    };



    /**
     * Display extracted sensor data in a modal
     */
AkamaiAdvanced.prototype.displaySensorDataModal = function(data) {
        const modal = this.createToolModal();

        // Extract data values
        const sensorData = data?.sensorData || '';
        const sbsdData = data?.sbsdData || '';
        const sensorScriptUrl = data?.sensorScriptUrl || '';
        const sbsdScriptUrl = data?.sbsdScriptUrl || '';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 18px; color: var(--text-primary);">Extracted Sensor Information</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Sensor Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        Sensor Data ${sensorData ? `(${sensorData.length} chars)` : '(Not captured)'}
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sensorDataInput"
                            readonly
                            style="width: 100%; min-height: 120px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; resize: vertical; cursor: text;"
                            placeholder="No sensor data captured"
                        >${sensorData}</textarea>
                        ${sensorData ? `
                        <button
                            class="copy-sensor-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorDataInput"
                        >Copy</button>` : ''}
                    </div>
                </div>

                ${sbsdData ? `
                <!-- SBSD Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        SBSD Data (${sbsdData.length} chars)
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sbsdDataInput"
                            readonly
                            style="width: 100%; min-height: 80px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; resize: vertical; cursor: text;"
                        >${sbsdData}</textarea>
                        <button
                            class="copy-sbsd-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdDataInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                ${sensorScriptUrl ? `
                <!-- Sensor Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        Sensor Script URL
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sensorScriptUrlInput"
                            type="text"
                            readonly
                            value="${sensorScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sensor-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorScriptUrlInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                ${sbsdScriptUrl ? `
                <!-- SBSD Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        SBSD Script URL
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sbsdScriptUrlInput"
                            type="text"
                            readonly
                            value="${sbsdScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sbsd-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdScriptUrlInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                <!-- Copy All Button -->
                <div style="text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button
                        id="copyAllDataBtn"
                        class="advanced-modal-action-btn"
                    >
                        Copy All Data as JSON
                    </button>
                </div>
            </div>
        `;

        this.showToolModal(modal);

        // Helper function to copy text
        const copyToClipboard = (text, button) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            // Show feedback
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.background = 'var(--success)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'var(--primary)';
            }, 2000);
        };

        // Individual copy button handlers
        modal.querySelectorAll('button[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-copy');
                const targetElement = modal.querySelector(`#${targetId}`);
                if (targetElement) {
                    copyToClipboard(targetElement.value, btn);
                }
            });
        });

        // Copy all data as JSON
        const copyAllBtn = modal.querySelector('#copyAllDataBtn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const allData = {
                    sensorData: sensorData,
                    sbsdData: sbsdData,
                    sensorScriptUrl: sensorScriptUrl,
                    sbsdScriptUrl: sbsdScriptUrl,
                    timestamp: Date.now()
                };
                copyToClipboard(JSON.stringify(allData, null, 2), copyAllBtn);
            });
        }

        this.bindModalClose(modal);

    };













    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================



    /**
     * Render Akamai-specific tools
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.renderTools = function() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="akamaiCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiAnalyzeContent">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiStartCapture">
                    <div class="tool-icon-container tool-icon-red">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiExtractSensor">
                    <div class="tool-icon-container tool-icon-purple">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Extract Sensor Information</div>
                </button>
            </div>
        `;
    };



    /**
     * Setup Akamai-specific tool listeners
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.setupToolListeners = function() {
        const actions = [
            { id: 'akamaiCheckCookies', method: () => this.checkCookies() },
            { id: 'akamaiAnalyzeContent', method: () => this.analyzeContent() },
            { id: 'akamaiStartCapture', method: () => this.startCapturing() },
            { id: 'akamaiExtractSensor', method: () => this.extractSensorInformation() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            if (btn) {
                btn.addEventListener('click', method);
            }
        });
    };

    // ===== AKAMAI-SPECIFIC METHODS =====



    /**
     * Render Akamai-specific history items
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        return items.map((item) => {
            const { captureData, timestamp, hostname } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.getFaviconUrl(hostname);

            // Determine display mode and color based on new field names
            let modeDisplay = '';
            let modeColor = 'var(--text-primary)';

            if (captureData.abckCookieLevel === 'easy') {
                modeDisplay = 'Easy Mode';
                modeColor = 'var(--success)';
            } else if (captureData.requiresPixel) {
                modeDisplay = 'Pixel';
                modeColor = 'var(--danger)';
            } else if (captureData.requiresSecCpt) {
                modeDisplay = 'sec_cpt';
                modeColor = 'var(--danger)';
            } else if (captureData.requiresSbsd) {
                modeDisplay = 'SBSD';
                modeColor = 'var(--danger)';
            } else {
                modeDisplay = 'Standard';
            }

            // Add badges for challenges
            const badges = [];
            if (captureData.requiresPixel) badges.push('Pixel');
            if (captureData.requiresSbsd) badges.push('SBSD');
            if (captureData.requiresSecCpt) badges.push('sec_cpt');
            const badgesHtml = badges.length > 0 ?
                `<div style="display: flex; gap: 4px; margin-top: 4px;">
                    ${badges.map(badge => `<span style="font-size: 10px; background: var(--danger); color: white; padding: 2px 6px; border-radius: 3px;">${badge}</span>`).join('')}
                </div>` : '';

            return `
                <div class="capture-card" data-capture-id="${item.id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">ABCK Level</span>
                                <span class="capture-type-value" style="color: ${captureData.abckCookieLevel === 'easy' ? 'var(--success)' : 'var(--text-primary)'};">${captureData.abckCookieLevel === 'easy' ? 'Easy' : 'Standard'}</span>
                            </div>
                            ${captureData.akamaiVersion ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">Version</span>
                                <span class="capture-type-value" style="color: var(--info);">${captureData.akamaiVersion}</span>
                            </div>
                            ` : ''}
                            ${badgesHtml}
                        </div>
                        <button class="capture-expand" data-capture-id="${item.id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    /**
     * Toggle Akamai-specific capture details
     * Override from BaseAdvancedModule
     */


    /**
     * Override renderCaptureDetailsContent to show Akamai-specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
AkamaiAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const abckLevel = data.abckCookieLevel === 'easy' ? 'Easy' : 'Standard';
        const abckLevelClass = data.abckCookieLevel === 'easy' ? 'advanced-modal-success' : '';

        return `
            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">ABCK Cookie</span>
                    <span class="advanced-modal-info-value">${data.abckCookie ? 'Found' : 'Not found'}</span>
                </div>
                ${data.abckCookie ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">ABCK Level</span>
                    <span class="advanced-modal-info-value ${abckLevelClass} advanced-modal-code-block" data-copy="${abckLevel}" style="cursor: pointer;" title="Click to copy">${abckLevel}</span>
                </div>
                ` : ''}
            </div>

            ${data.akamaiVersion ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Akamai Version</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.akamaiVersion)}" style="cursor: pointer;" title="Click to copy">${AdvancedUtils.escapeHtml(data.akamaiVersion)}</div>
            </div>
            ` : ''}

            ${data.requiresSbsd || data.requiresSecCpt || data.requiresPixel ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Challenge Requirements</label>
                ${data.requiresSbsd ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">SBSD Challenge</span><span class="advanced-modal-info-value">Required</span></div>' : ''}
                ${data.requiresSecCpt ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">sec_cpt Challenge</span><span class="advanced-modal-info-value">Required</span></div>' : ''}
                ${data.requiresPixel ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Pixel Challenge</span><span class="advanced-modal-info-value">Required</span></div>' : ''}
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



    /**
     * Render Akamai capture data in a clean format
     * @param {Object} captureData - The captured Akamai data
     * @returns {string} HTML string
     */
AkamaiAdvanced.renderCaptureDisplay = function(captureData) {
        if (!captureData) {
            return `
                <div style="padding: 16px; text-align: center; color: var(--text-secondary);">
                    No Akamai data captured yet
                </div>
            `;
        }

        // Determine protection level based on cookie length and mode
        let protectionLevel = 'Standard';
        let protectionColor = 'var(--text-primary)';

        if (captureData.isEasyMode || captureData.abckFullLength === 0) {
            protectionLevel = 'Easy';
            protectionColor = 'var(--success)';
        } else if (captureData.requiresPixel) {
            protectionLevel = 'Pixel Challenge';
            protectionColor = 'var(--danger)';
        } else if (captureData.requiresSbsd) {
            protectionLevel = 'SBSD Challenge';
            protectionColor = 'var(--warning)';
        } else if (captureData.requiresSecCpt) {
            protectionLevel = 'SEC_CPT';
            protectionColor = 'var(--warning)';
        }

        // Parse script URLs from the path if available
        const scriptUrl = captureData.akamaiScriptPath || captureData.sensorEndpoint || '';
        const sensorUrl = captureData.sensorEndpoint || '';
        const pixelUrl = captureData.pixelScriptUrl || '';
        const sbsdUrl = captureData.sbsdEndpoint || '';

        return `
            <div style="padding: 16px;">
                <!-- Header Section -->
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <span style="font-size: 24px;">🤖</span>
                        <div>
                            <div style="color: var(--text-primary); font-weight: 600; font-size: 14px;">Akamai Bot Manager</div>
                            <div style="color: var(--text-secondary); font-size: 11px;">Captured ${this.getTimeAgo(captureData.timestamp)}</div>
                            ${captureData.akamaiVersion ? `<div style="color: var(--info); font-size: 11px;">${captureData.akamaiVersion}</div>` : ''}
                        </div>
                    </div>

                    <!-- Protection Level -->
                    <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--text-secondary); font-size: 12px;">Cookie Protection Level:</span>
                            <span style="color: ${protectionColor}; font-weight: 600; font-size: 12px;">${protectionLevel}</span>
                        </div>
                    </div>
                </div>

                <!-- Cookies Section -->
                <div style="margin-bottom: 16px;">
                    <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">Cookies</div>

                    <!-- _abck Cookie -->
                    ${captureData.abckCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">_abck</span>
                                <span style="color: var(--success); font-size: 16px;">✓</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- sbsd Cookie -->
                    ${captureData.requiresSbsd ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">sbsd challenge</span>
                                <span style="color: ${captureData.sbsdCookie ? 'var(--success)' : 'var(--text-muted)'}; font-size: 16px;">${captureData.sbsdCookie ? '✓' : '○'}</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- sec_cpt Cookie -->
                    ${captureData.requiresSecCpt ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">sec_cpt challenge</span>
                                <span style="color: var(--warning); font-size: 16px;">✓</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- URL Paths Section -->
                ${(sensorUrl || pixelUrl || sbsdUrl) ? `
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">URL Paths</div>

                        ${sensorUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Sensor URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(sensorUrl)}
                                </div>
                            </div>
                        ` : ''}

                        ${captureData.requiresSbsd && sbsdUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">SBSD URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(sbsdUrl)}
                                </div>
                            </div>
                        ` : ''}

                        ${captureData.requiresPixel && pixelUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Pixel URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(pixelUrl)}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}

                <!-- Sensor Data Section -->
                ${captureData.sensorData ? `
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">Sensor Data</div>
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px;">
                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Captured sensor_data (${captureData.sensorData.length} chars):</div>
                            <div style="color: var(--text-primary); font-size: 10px; font-family: monospace; word-break: break-all; max-height: 60px; overflow-y: auto; background: var(--bg-primary); padding: 6px; border-radius: 4px;">
                                ${captureData.sensorData.substring(0, 200)}${captureData.sensorData.length > 200 ? '...' : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Action Buttons -->
                <div style="display: flex; gap: 8px;">
                    <button class="copy-akamai-data advanced-modal-action-btn" style="flex: 1;" data-copy="${AdvancedUtils.escapeHtml(JSON.stringify(captureData))}">
                        Copy All Data
                    </button>
                    ${captureData.sensorData ? `
                        <button class="copy-sensor-data advanced-modal-action-btn" style="flex: 1;" data-copy="${AdvancedUtils.escapeHtml(captureData.sensorData)}">
                            Copy Sensor Data
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    };
