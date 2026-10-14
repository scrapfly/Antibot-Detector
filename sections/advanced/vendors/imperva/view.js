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
        const esc = FormatUtils.escapeHtml, attr = FormatUtils.escapeAttr;
        return items.map((item) => {
            const { captureData, timestamp } = item;
            const hostname = String(item.hostname || '');
            const id = attr(String(item.id || timestamp || ''));
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = attr(UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname));
            const incapSesCount = ((captureData && captureData.incapSesCookies) || []).length;

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${attr(hostname)}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${esc(hostname)}</span>
                                <span class="capture-time">${esc(timeAgo)}</span>
                            </div>
                            ${incapSesCount > 0 ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">${esc(tr('advImpervaSessionCookies', 'Session Cookies'))}</span>
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
        const K = BaseAdvancedModule;
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        if (!capture || !capture.captureData) {
            return K.kitNote(tr('advCommonNoCaptureData', 'No capture data available'));
        }
        const data = capture.captureData;
        const state = present => present
            ? K.kitChip(tr('advCommonFound', 'Found'), 'green') : K.kitChip(tr('advCommonNotFound', 'Not found'), 'neutral');
        const count = (label, list) => (list || []).length ? { label, value: fmt('advImpervaCookieCountFmt', 'Cookies: {0}', list.length) } : null;
        const total = (label, list) => (list || []).length ? { label, value: String(list.length) } : null;
        const components = K.kitFacts([
            { label: 'reese84', html: true, value: state(data.requiresReese84) },
            { label: 'utmvc', html: true, value: state(data.requiresUtmvc) },
            { label: tr('advCommonCaptured', 'Captured'), value: K.kitDateTime(capture.timestamp) }
        ]);
        const cookies = K.kitFacts([
            count('incap_ses', data.incapSesCookies), count('nlbi', data.nlbiCookies), count('visid_incap', data.visidCookies)
        ]);
        const resources = K.kitFacts([
            total(tr('advImpervaResourceUrls', 'Resource URLs'), data.incapResourceUrls),
            total(tr('advImpervaInterrogationUrls', 'Interrogation URLs'), data.interrogationUrls)
        ]);
        return K.kitSection(tr('advImpervaSecurityComponents', 'Security Components'), components)
            + K.kitSection(tr('advImpervaSessionCookies', 'Session Cookies'), cookies)
            + K.kitSection(tr('advImpervaResourceDetection', 'Resource Detection'), resources);
    };

    // ========================================================================
    // IMPERVA-SPECIFIC METHODS (using BaseInterceptorHelpers)
    // ========================================================================


    /**
     * Display extraction results in a modal (Akamai-style design)
     */
ImpervaAdvanced.prototype.displayExtractionResults = function(extractedData) {
        this.recordStructuredResult('displayExtractionResults', extractedData);
        const K = BaseAdvancedModule;
        const tr = ImpervaAdvanced.tr;
        const fmt = ImpervaAdvanced.fmt;
        const data = extractedData || {};
        const scriptPaths = this.parseScriptPaths(data);
        const hasScriptPaths = scriptPaths.utmvcScriptPath || scriptPaths.reeseScriptPath;
        const parsingCodes = hasScriptPaths ? this.generateParsingCode(data, scriptPaths) : null;
        const origin = data.hostname ? 'https://' + data.hostname : '';
        const scripts = [];
        if (scriptPaths.reeseScriptPath) scripts.push({ type: 'Reese84', url: origin + scriptPaths.reeseScriptPath });
        if (scriptPaths.utmvcScriptPath) scripts.push({ type: 'UTMVC', url: origin + scriptPaths.utmvcScriptPath });
        const label = text => String(text).replace(/:\s*$/, '');
        // One card per script: its URL, and for Reese84 the sensor URL it posts to
        const cards = scripts.map(script => K.kitCard(
            K.kitField(label(tr('advCommonScriptUrl', 'Script URL:')), script.url, { clamp: true })
            + (script.type === 'Reese84' && scriptPaths.reeseSensorPath
                ? K.kitField(label(tr('advImpervaSensorPath', 'Sensor Path:')), `${origin}${scriptPaths.reeseSensorPath}?d=${data.hostname || ''}`, { clamp: true })
                : ''),
            K.kitChip(fmt('advImpervaScriptTypeFmt', '{0} Script', script.type), 'blue')
        )).join('');
        const facts = K.kitFacts([
            { label: label(tr('advCommonScriptUrl', 'Script URL:')), value: String(scripts.length) },
            { label: label(tr('advImpervaSensorUrl', 'Sensor URL:')), value: String(scriptPaths.reeseSensorPath ? 1 : 0) }
        ]);
        const body = scripts.length
            ? facts + cards
            : K.kitNote(`${tr('advImpervaNoScripts', 'No scripts detected')}. ${tr('advImpervaMayNotBePresent', 'Imperva may not be present on this page')}`);
        this.openKitModal({
            title: tr('advImpervaAnalysisTitle', 'Imperva Analysis'),
            subtitle: data.hostname || '',
            iconSvg: K.toolIcon('scripts'),
            body,
            copiedMessage: tr('advValueCopied', 'Value copied'),
            actions: parsingCodes ? [{
                label: tr('advCommonExportCode', 'Export Code'),
                primary: true,
                onClick: () => this.displayExportCodeModal(parsingCodes, scriptPaths, data)
            }] : [],
            record: false
        });
        NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(scripts.length));
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
                return codes;
            },
            description: fmt('advCodeDescBrowserParseFmt', 'Browser console code for intercepting and parsing {0} scripts', 'Imperva')
        });
    };


