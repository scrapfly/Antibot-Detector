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



// Header icons of the Akamai result dialogs
AkamaiAdvanced.CODE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z"/></svg>';
AkamaiAdvanced.SENSOR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/></svg>';
AkamaiAdvanced.COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';

// "Script URL:" → "Script URL" for a field label
AkamaiAdvanced.label = (key, fallback) => AkamaiAdvanced.tr(key, fallback).replace(/:\s*$/, '');

    /**
     * Analyze Scripts result: counts and level, then each script or URL
     * Akamai uses, copyable; Export Code in the footer
     */
AkamaiAdvanced.prototype.displayAnalysisModal = function(analysis) {
        const K = BaseAdvancedModule;
        const tr = AkamaiAdvanced.tr;
        const fmt = AkamaiAdvanced.fmt;
        const label = AkamaiAdvanced.label;
        const scripts = Array.isArray(analysis.scripts) ? analysis.scripts : [];
        const sensorUrls = Array.isArray(analysis.sensorDataUrls) ? analysis.sensorDataUrls : [];
        const sbsdUrls = Array.isArray(analysis.sbsdUrls) ? analysis.sbsdUrls : [];
        const akamaiCount = scripts.length + sensorUrls.length + (analysis.akamaiScriptPath ? 1 : 0);
        const hasAkamaiCookies = analysis.cookies && (analysis.cookies._abck || analysis.cookies.ak_bmsc || analysis.cookies.bm_sz);

        // What the page asks a client to solve
        let level = '';
        if (analysis.isEasyMode) level = K.kitChip(tr('advAkamaiLevelEasy', 'Easy'), 'green');
        else if (analysis.requiresPixel) level = K.kitChip(tr('advAkamaiPixelChallenge', 'Pixel Challenge'), 'red');
        else if (analysis.requiresSecCpt) level = K.kitChip(tr('advAkamaiSecCptChallenge', 'sec_cpt Challenge'), 'red');
        else if (analysis.requiresSbsd) level = K.kitChip(tr('advAkamaiSbsdChallenge', 'SBSD Challenge'), 'red');
        else if (hasAkamaiCookies) level = K.kitChip(tr('advCommonStandard', 'Standard'), 'blue');

        const summary = K.kitFacts([
            { label: label('advCommonTotalScripts', 'Total Scripts:'), value: analysis.scriptCount },
            { label: label('advAkamaiScriptsLabel', 'Akamai Scripts:'), value: akamaiCount },
            { label: label('advCommonProtectionLevel', 'Protection Level:'), value: level, html: true }
        ]);
        const scriptUrl = label('advCommonScriptUrl', 'Script URL:');
        const sensorScript = K.kitSection(tr('advAkamaiSensorDataUrlScript', 'Sensor Data URL Script'),
            K.kitField(scriptUrl, analysis.akamaiScriptPath, { wrap: true }));
        const pixelFields = K.kitField(label('advAkamaiPixelHtmlVar', 'Pixel HTML Variable:'), analysis.pixelHtmlVar ? `bazadebezolkohpepadr="${analysis.pixelHtmlVar}"` : '', { wrap: true })
            + K.kitField(scriptUrl, analysis.pixelScriptUrls?.scriptUrl, { wrap: true })
            + K.kitField(label('advAkamaiPostUrl', 'POST URL:'), analysis.pixelScriptUrls?.postUrl, { wrap: true })
            + K.kitField(label('advAkamaiPixelScriptVar', 'Pixel Script Variable:'), analysis.pixelScriptVar, { wrap: true });
        const pixel = pixelFields ? K.kitSection(tr('advAkamaiPixelChallenge', 'Pixel Challenge'), K.kitCard(pixelFields)) : '';
        const sbsd = K.kitSection(tr('advAkamaiSbsdScriptUrl', 'SBSD Script URL'),
            sbsdUrls.map(url => K.kitField(scriptUrl, url, { wrap: true })).join(''), sbsdUrls.length > 1 ? sbsdUrls.length : '');
        const endpoints = K.kitSection(tr('advAkamaiSensorDataUrls', 'Sensor Data URLs'),
            sensorUrls.map((url, idx) => K.kitField(`${tr('advAkamaiEndpoint', 'Akamai Endpoint')} ${idx + 1}`, url, { wrap: true })).join(''), sensorUrls.length || '');

        this.openKitModal({
            title: tr('advAkamaiAnalysisTitle', 'Akamai Analysis'),
            subtitle: fmt('advCommonFoundScriptsFmt', 'Found {0} relevant script(s)', akamaiCount),
            iconSvg: AkamaiAdvanced.CODE_ICON,
            body: summary + sensorScript + pixel + sbsd + endpoints,
            copiedMessage: tr('advCommonUrlCopied', 'URL copied'),
            actions: [{
                label: tr('advCommonExportCode', 'Export Code'),
                primary: true,
                iconSvg: AkamaiAdvanced.CODE_ICON,
                onClick: () => {
                    // Include both sensorDataUrls and akamaiScriptPath
                    const allSensorUrls = [...sensorUrls];
                    if (analysis.akamaiScriptPath && !allSensorUrls.includes(analysis.akamaiScriptPath)) {
                        allSensorUrls.push(analysis.akamaiScriptPath);
                    }
                    this.showScriptParsingModal(scripts, allSensorUrls);
                }
            }]
        });
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
     * Extract Sensor Information result: the sensor (and SBSD) payloads as
     * code blocks with their own Copy, the script URLs as copyable rows, and
     * Copy all as JSON in the footer
     */
AkamaiAdvanced.prototype.displaySensorDataModal = function(data) {
        const K = BaseAdvancedModule;
        const tr = AkamaiAdvanced.tr;
        const fmt = AkamaiAdvanced.fmt;
        const sensorData = data?.sensorData || '';
        const sbsdData = data?.sbsdData || '';
        const sensorScriptUrl = data?.sensorScriptUrl || '';
        const sbsdScriptUrl = data?.sbsdScriptUrl || '';
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        const count = (n) => { try { return n.toLocaleString(uiLocale); } catch (_) { return String(n); } };

        const payloads = (sensorData
            ? K.kitCode(fmt('advAkamaiSensorDataCharsFmt', 'Sensor Data ({0} chars)', count(sensorData.length)), sensorData)
            : K.kitNote(tr('advAkamaiNoSensorData', 'No sensor data captured')))
            + K.kitCode(fmt('advAkamaiSbsdDataCharsFmt', 'SBSD Data ({0} chars)', count(sbsdData.length)), sbsdData);
        const urlFields = K.kitField(tr('advAkamaiSensorScriptUrl', 'Sensor Script URL'), sensorScriptUrl, { wrap: true })
            + K.kitField(tr('advAkamaiSbsdScriptUrl', 'SBSD Script URL'), sbsdScriptUrl, { wrap: true });
        let host = '';
        try { host = this.tabInfo?.url ? new URL(this.tabInfo.url).hostname : ''; } catch (_) { host = ''; }

        this.openKitModal({
            title: tr('advAkamaiExtractedSensorTitle', 'Extracted Sensor Information'),
            subtitle: host,
            iconSvg: AkamaiAdvanced.SENSOR_ICON,
            body: payloads + (urlFields ? K.kitCard(urlFields) : ''),
            copiedMessage: tr('copiedNotification', 'Copied'),
            actions: [{
                label: tr('advAkamaiCopyAllJson', 'Copy All Data as JSON'),
                primary: true,
                iconSvg: AkamaiAdvanced.COPY_ICON,
                onClick: (button) => {
                    const allData = { sensorData, sbsdData, sensorScriptUrl, sbsdScriptUrl, timestamp: Date.now() };
                    AdvancedUtils.copyToClipboard(JSON.stringify(allData, null, 2), button, {
                        notificationMessage: tr('copiedNotification', 'Copied')
                    });
                }
            }]
        });
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
        const K = BaseAdvancedModule;
        const tr = AkamaiAdvanced.tr;
        if (!capture || !capture.captureData) {
            return K.kitNote(tr('advCommonNoCaptureData', 'No capture data available'));
        }
        const data = capture.captureData;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let when = '';
        try { when = new Date(capture.timestamp).toLocaleString(uiLocale); } catch (_) { when = new Date(capture.timestamp).toLocaleString(); }
        const easy = data.abckCookieLevel === 'easy';
        const challenges = [
            data.requiresSbsd ? tr('advAkamaiSbsdChallenge', 'SBSD Challenge') : '',
            data.requiresSecCpt ? tr('advAkamaiSecCptChallenge', 'sec_cpt Challenge') : '',
            data.requiresPixel ? tr('advAkamaiPixelChallenge', 'Pixel Challenge') : ''
        ].filter(Boolean);

        const facts = K.kitFacts([
            { label: tr('advAkamaiAbckCookie', 'ABCK Cookie'), html: true,
                value: data.abckCookie ? K.kitChip(tr('advCommonFound', 'Found'), 'green') : K.kitChip(tr('advCommonNotFound', 'Not found'), 'neutral') },
            data.abckCookie ? { label: tr('advAkamaiAbckLevel', 'ABCK Level'), html: true,
                value: K.kitChip(easy ? tr('advAkamaiLevelEasy', 'Easy') : tr('advCommonStandard', 'Standard'), easy ? 'green' : 'blue') } : null,
            { label: tr('advCommonCaptured', 'Captured'), value: when }
        ]);
        const fields = K.kitField(tr('advAkamaiVersionLabel', 'Akamai Version'), data.akamaiVersion)
            + K.kitField(tr('advCommonPage', 'Page'), capture.url, { mono: false, wrap: true });
        const required = challenges.length
            ? K.kitSection(tr('advAkamaiChallengeRequirements', 'Challenge Requirements'),
                `<div class="adv-kit-chips">${challenges.map(name => K.kitChip(name, 'red')).join('')}</div>`)
            : '';
        return facts + (fields ? K.kitCard(fields) : '') + required;
    };
