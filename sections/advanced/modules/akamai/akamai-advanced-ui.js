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
            Logger.debug('NETWORK', '[Akamai Debug] ========== CHECK COOKIES ==========');
            Logger.debug('NETWORK', '[Akamai Debug] URL:', this.tabInfo.url);
            Logger.debug('NETWORK', '[Akamai Debug] Cookies Found:', foundCookies.length + '/7');

            Logger.debug('NETWORK', '[Akamai Debug] Cookie Details:');
            if (akamaiCookies._abck) {
                const isEasyMode = akamaiCookies._abck.value.includes('~0~');
                Logger.debug('NETWORK', '[Akamai Debug]   _abck:', {
                    value: akamaiCookies._abck.value.substring(0, 100) + '...',
                    length: akamaiCookies._abck.value.length,
                    domain: akamaiCookies._abck.domain,
                    easyMode: isEasyMode
                });
            } else {
                Logger.debug('NETWORK', '[Akamai Debug]   _abck: NOT FOUND');
            }

            if (akamaiCookies.sbsd) {
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd:', akamaiCookies.sbsd.value.substring(0, 50) + '...');
            } else {
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd: NOT FOUND');
            }

            if (akamaiCookies.sbsd_o) {
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd_o:', akamaiCookies.sbsd_o.value.substring(0, 50) + '...');
            } else {
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd_o: NOT FOUND');
            }

            Logger.debug('NETWORK', '[Akamai Debug]   ak_bmsc:', akamaiCookies.ak_bmsc ? 'FOUND' : 'NOT FOUND');
            Logger.debug('NETWORK', '[Akamai Debug]   bm_sz:', akamaiCookies.bm_sz ? 'FOUND' : 'NOT FOUND');
            Logger.debug('NETWORK', '[Akamai Debug]   bm_sv:', akamaiCookies.bm_sv ? 'FOUND' : 'NOT FOUND');
            Logger.debug('NETWORK', '[Akamai Debug]   bm_mi:', akamaiCookies.bm_mi ? 'FOUND' : 'NOT FOUND');

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

            Logger.debug('NETWORK', '[Akamai Debug] Protection Level:', protectionLevel);
            Logger.debug('NETWORK', '[Akamai Debug] ========================================');

            // Show notification
            const foundCount = foundCookies.length;
            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, 7));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Akamai'));
            }

            const tr = AkamaiAdvanced.tr;
            const levelText = {
                'Advanced (SBSD)': tr('advAkamaiLevelAdvancedSbsd', 'Advanced (SBSD)'),
                'Standard': tr('advCommonStandard', 'Standard'),
                'Basic': tr('advAkamaiLevelBasic', 'Basic'),
                'None': tr('advCommonNone', 'None')
            }[protectionLevel] || protectionLevel;
            const facts = [{ label: tr('advCommonProtectionLevel', 'Protection Level:'), value: levelText }];
            if (akamaiCookies._abck) {
                facts.push({ label: tr('advAkamaiAbckLevelLabel', '_abck level:'),
                    value: akamaiCookies._abck.value.includes('~0~') ? tr('advAkamaiLevelEasy', 'Easy') : tr('advCommonStandard', 'Standard') });
            }
            this.showCookieResults({ vendor: 'Akamai', expected: Object.keys(akamaiCookies), cookies: Object.values(akamaiCookies).filter(Boolean), facts });
        } catch (error) {
            Logger.error('NETWORK', 'Failed to check Akamai cookies:', error);
            NotificationHelper.error(AkamaiAdvanced.fmt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };



    /**
     * Display content analysis in a modal
     */
AkamaiAdvanced.prototype.displayAnalysisModal = function(analysis) {
        const modal = this.createToolModal();
        const tr = AkamaiAdvanced.tr;
        const fmt = AkamaiAdvanced.fmt;

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
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${tr('advAkamaiAnalysisTitle', 'Akamai Analysis')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advCommonTotalScripts', 'Total Scripts:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scriptCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">${tr('advAkamaiScriptsLabel', 'Akamai Scripts:')}</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0)}</span>
                    </div>
                </div>



                ${(analysis.scripts.length > 0 || (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) || detectedPatterns.length > 0 || hasAkamaiCookies) ? `
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">${tr('advAkamaiScriptsHeading', 'Akamai Scripts')}</h4>
                    <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <!-- Header Section -->
                        <div style="display: flex; align-items: center; justify-content: flex-start; margin-bottom: 16px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;"></span>
                                <div>
                                    <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">${tr('advCommonScriptAnalysis', 'Script Analysis')}</div>
                                    <div style="color: var(--text-muted); font-size: 11px;">${fmt('advCommonFoundScriptsFmt', 'Found {0} relevant script(s)', analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0))}</div>
                                </div>
                            </div>
                        </div>


                        <!-- Challenge Details -->
                        ${(analysis.akamaiScriptPath || analysis.pixelHtmlVar || analysis.pixelScriptUrls || analysis.pixelScriptVar || (analysis.sbsdUrls && analysis.sbsdUrls.length > 0)) ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">${tr('advAkamaiSensorDataUrlScript', 'Sensor Data URL Script')}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.akamaiScriptPath ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">${tr('advCommonScriptUrl', 'Script URL:')}</div>
                                            <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${analysis.akamaiScriptPath}
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelHtmlVar ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">${tr('advAkamaiPixelHtmlVar', 'Pixel HTML Variable:')}</span>
                                            </div>
                                            <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px;">
                                                bazadebezolkohpepadr="${analysis.pixelHtmlVar}"
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelScriptUrls ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">${tr('advAkamaiPixelChallengeUrls', 'Pixel Challenge URLs:')}</span>
                                            </div>
                                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">${tr('advCommonScriptUrl', 'Script URL:')}</div>
                                                    <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
                                                        ${analysis.pixelScriptUrls.scriptUrl}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">${tr('advAkamaiPostUrl', 'POST URL:')}</div>
                                                    <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
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
                                                <span style="color: var(--text-secondary); font-size: 10px;">${tr('advAkamaiPixelScriptVar', 'Pixel Script Variable:')}</span>
                                            </div>
                                            <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
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
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">${tr('advAkamaiSbsdScriptUrl', 'SBSD Script URL')}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.sbsdUrls.map(url => `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">${tr('advCommonScriptUrl', 'Script URL:')}</div>
                                            <div style="font-family: var(--font-mono); color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
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
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">🔗 ${tr('advAkamaiSensorDataUrls', 'Sensor Data URLs')}</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                        ${analysis.sensorDataUrls.map((url, idx) => `
                            <div style="background: var(--bg-tertiary); padding: 10px 12px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                    <span style="color: var(--text-secondary); font-size: 11px; margin-right: 8px;">${idx + 1}.</span>
                                    <span style="color: var(--text-primary); font-size: 12px; font-weight: 500;">${tr('advAkamaiEndpoint', 'Akamai Endpoint')}</span>
                                </div>
                                <div style="font-family: var(--font-mono); color: var(--text-muted); font-size: 11px; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${url}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}


                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="export-scripts-btn modal-export-code-btn">
                        <span>📤</span>
                        ${tr('advCommonExportCode', 'Export Code')}
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
                    copyBtn.textContent = AkamaiAdvanced.tr('copiedInlineMsg', '✓ Copied!');
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
        const tr = AkamaiAdvanced.tr;
        const fmt = AkamaiAdvanced.fmt;
        const scriptCategories = {
            pixel: scripts.filter(s => s.categories.includes('pixel')),
            sensor: scripts.filter(s => s.categories.includes('sensor')),
            sbsd: scripts.filter(s => s.categories.includes('sbsd')),
            sensorUrl: sensorDataUrls.map(url => ({ type: 'sensor-url', src: url, url, categories: ['sensor-url'] }))
        };
        const types = [{ id: 'all', label: tr('advCommonAllTypes', 'All Types') }];
        if (scriptCategories.pixel.length) types.push({ id: 'pixel', label: 'Pixel' });
        if (scriptCategories.sensor.length || scriptCategories.sensorUrl.length) types.push({ id: 'sensor', label: tr('advAkamaiTypeSensor', 'Sensor') });
        if (scriptCategories.sbsd.length) types.push({ id: 'sbsd', label: 'SBSD' });
        const descriptions = {
            javascript: fmt('advCodeDescBrowserParseFmt', 'Browser console code for intercepting and parsing {0} scripts', 'Akamai'),
            python: tr('advCodeDescPythonBs', 'Python script with requests and BeautifulSoup'),
            nodejs: tr('advCodeDescNodeCheerio', 'Node.js script with axios and cheerio'),
            php: tr('advCodeDescPhpDom', 'PHP script with cURL and DOMDocument'),
            csharp: tr('advCodeDescCsharpHap', 'C# with HttpClient and HtmlAgilityPack'),
            go: tr('advCodeDescGoQuery', 'Go with net/http and goquery')
        };
        return AdvancedCodeDialog.open(this, {
            title: tr('advCommonCodeGenTitle', 'Script Parsing Code Generator'), types,
            getCodes: type => this.generateScriptParsingCode(type === 'all' ? scriptCategories : {
                pixel: type === 'pixel' ? scriptCategories.pixel : [],
                sensor: type === 'sensor' ? scriptCategories.sensor : [],
                sensorUrl: type === 'sensor' ? scriptCategories.sensorUrl : [],
                sbsd: type === 'sbsd' ? scriptCategories.sbsd : []
            }),
            description: (type, language) => descriptions[language]
        });
    };



    /**
     * Display extracted sensor data in a modal
     */
AkamaiAdvanced.prototype.displaySensorDataModal = function(data) {
        const modal = this.createToolModal();
        const tr = AkamaiAdvanced.tr;
        const fmt = AkamaiAdvanced.fmt;
        const copyLabel = tr('advCommonCopy', 'Copy');

        // Extract data values
        const sensorData = data?.sensorData || '';
        const sbsdData = data?.sbsdData || '';
        const sensorScriptUrl = data?.sensorScriptUrl || '';
        const sbsdScriptUrl = data?.sbsdScriptUrl || '';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 18px; color: var(--text-primary);">${tr('advAkamaiExtractedSensorTitle', 'Extracted Sensor Information')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <!-- Sensor Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        ${sensorData ? fmt('advAkamaiSensorDataCharsFmt', 'Sensor Data ({0} chars)', sensorData.length) : tr('advAkamaiSensorDataNotCaptured', 'Sensor Data (Not captured)')}
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sensorDataInput"
                            readonly
                            style="width: 100%; min-height: 120px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; resize: vertical; cursor: text;"
                            placeholder="${tr('advAkamaiNoSensorData', 'No sensor data captured')}"
                        >${AdvancedUtils.escapeHtml(sensorData || '')}</textarea>
                        ${sensorData ? `
                        <button
                            class="copy-sensor-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorDataInput"
                        >${copyLabel}</button>` : ''}
                    </div>
                </div>

                ${sbsdData ? `
                <!-- SBSD Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        ${fmt('advAkamaiSbsdDataCharsFmt', 'SBSD Data ({0} chars)', sbsdData.length)}
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sbsdDataInput"
                            readonly
                            style="width: 100%; min-height: 80px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; resize: vertical; cursor: text;"
                        >${AdvancedUtils.escapeHtml(sbsdData)}</textarea>
                        <button
                            class="copy-sbsd-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdDataInput"
                        >${copyLabel}</button>
                    </div>
                </div>
                ` : ''}

                ${sensorScriptUrl ? `
                <!-- Sensor Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        ${tr('advAkamaiSensorScriptUrl', 'Sensor Script URL')}
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sensorScriptUrlInput"
                            type="text"
                            readonly
                            value="${sensorScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sensor-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorScriptUrlInput"
                        >${copyLabel}</button>
                    </div>
                </div>
                ` : ''}

                ${sbsdScriptUrl ? `
                <!-- SBSD Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        ${tr('advAkamaiSbsdScriptUrl', 'SBSD Script URL')}
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sbsdScriptUrlInput"
                            type="text"
                            readonly
                            value="${sbsdScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sbsd-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdScriptUrlInput"
                        >${copyLabel}</button>
                    </div>
                </div>
                ` : ''}

                <!-- Copy All Button -->
                <div style="text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button
                        id="copyAllDataBtn"
                        class="advanced-modal-action-btn"
                    >
                        ${tr('advAkamaiCopyAllJson', 'Copy All Data as JSON')}
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
            button.textContent = tr('copiedInlineMsg', '✓ Copied!');
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
        return this.renderToolGrid([
            {
                id: 'akamaiCheckCookies', tone: 'green',
                label: AkamaiAdvanced.tr('btnCheckCookies', 'Check Cookies'),
                iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/></svg>'
            },
            {
                id: 'akamaiAnalyzeContent', tone: 'blue',
                label: AkamaiAdvanced.tr('btnAnalyzeScripts', 'Analyze Scripts'),
                iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z"/></svg>'
            },
            {
                id: 'akamaiStartCapture', tone: 'red', kind: 'capture',
                label: AkamaiAdvanced.tr('btnStartCapturing', 'Start Capturing'),
                iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/></svg>'
            },
            {
                id: 'akamaiExtractSensor', tone: 'purple',
                label: AkamaiAdvanced.tr('advAkamaiExtractSensorBtn', 'Extract Sensor Information'),
                iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/></svg>'
            }
        ]);
    };



    /**
     * Setup Akamai-specific tool listeners
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'akamaiCheckCookies', method: () => this.checkCookies() },
            { id: 'akamaiAnalyzeContent', method: () => this.analyzeContent() },
            { id: 'akamaiStartCapture', method: () => this.startCapturing() },
            { id: 'akamaiExtractSensor', method: () => this.extractSensorInformation() }
        ]);
    };

    // ===== AKAMAI-SPECIFIC METHODS =====



    /**
     * Render Akamai-specific history items
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        const tr = AkamaiAdvanced.tr;
        return items.map((item) => {
            const { captureData, timestamp, hostname } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);

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
                                <span class="capture-type-label">${tr('advAkamaiAbckLevel', 'ABCK Level')}</span>
                                <span class="capture-type-value" style="color: ${captureData.abckCookieLevel === 'easy' ? 'var(--success)' : 'var(--text-primary)'};">${captureData.abckCookieLevel === 'easy' ? tr('advAkamaiLevelEasy', 'Easy') : tr('advCommonStandard', 'Standard')}</span>
                            </div>
                            ${captureData.akamaiVersion ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">${tr('ruleFieldVersion', 'Version')}</span>
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
        const tr = AkamaiAdvanced.tr;
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">' + tr('advCommonNoCaptureData', 'No capture data available') + '</span></div>';
        }
        const clickToCopy = tr('advCommonClickToCopy', 'Click to copy');
        const requiredText = tr('advCommonRequired', 'Required');

        const data = capture.captureData;
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const abckLevel = data.abckCookieLevel === 'easy' ? tr('advAkamaiLevelEasy', 'Easy') : tr('advCommonStandard', 'Standard');
        const abckLevelClass = data.abckCookieLevel === 'easy' ? 'advanced-modal-success' : '';

        return `
            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${tr('advAkamaiAbckCookie', 'ABCK Cookie')}</span>
                    <span class="advanced-modal-info-value">${data.abckCookie ? tr('advCommonFound', 'Found') : tr('advCommonNotFound', 'Not found')}</span>
                </div>
                ${data.abckCookie ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${tr('advAkamaiAbckLevel', 'ABCK Level')}</span>
                    <span class="advanced-modal-info-value ${abckLevelClass} advanced-modal-code-block" data-copy="${abckLevel}" style="cursor: pointer;" title="${clickToCopy}">${abckLevel}</span>
                </div>
                ` : ''}
            </div>

            ${data.akamaiVersion ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${tr('advAkamaiVersionLabel', 'Akamai Version')}</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.akamaiVersion)}" style="cursor: pointer;" title="${clickToCopy}">${AdvancedUtils.escapeHtml(data.akamaiVersion)}</div>
            </div>
            ` : ''}

            ${data.requiresSbsd || data.requiresSecCpt || data.requiresPixel ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${tr('advAkamaiChallengeRequirements', 'Challenge Requirements')}</label>
                ${data.requiresSbsd ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">' + tr('advAkamaiSbsdChallenge', 'SBSD Challenge') + '</span><span class="advanced-modal-info-value">' + requiredText + '</span></div>' : ''}
                ${data.requiresSecCpt ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">' + tr('advAkamaiSecCptChallenge', 'sec_cpt Challenge') + '</span><span class="advanced-modal-info-value">' + requiredText + '</span></div>' : ''}
                ${data.requiresPixel ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">' + tr('advAkamaiPixelChallenge', 'Pixel Challenge') + '</span><span class="advanced-modal-info-value">' + requiredText + '</span></div>' : ''}
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


