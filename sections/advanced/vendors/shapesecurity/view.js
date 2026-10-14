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
        const esc = FormatUtils.escapeHtml, attr = FormatUtils.escapeAttr;
        return items.map((item) => {
            const { captureData, timestamp } = item;
            const hostname = String(item.hostname || '');
            const id = attr(String(item.id || timestamp || ''));
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = attr(UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname));
            const headers = (captureData && captureData.headers) || [];
            const cookie = (captureData && captureData.cookie) || null;
            // Header pattern from the first header ("X-DQ7Hy5L1-z" -> "DQ7Hy5L1")
            const match = headers.length ? String(headers[0].name || '').match(/^X-([A-Za-z0-9]{8})-[a-z]$/i) : null;
            const headerPattern = match ? match[1] : null;

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${attr(hostname)}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${esc(hostname)}</span>
                                <span class="capture-time">${esc(timeAgo)}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">${esc(shapeSecurityText('advShapeCookieLabel', 'Cookie'))}</span>
                                <span class="capture-type-value">${cookie ? 1 : 0}</span>
                                <span class="capture-type-label">${esc(shapeSecurityText('advShapeHeadersLabel', 'Headers'))}</span>
                                <span class="capture-type-value">${headers.length}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    ${headerPattern ? `
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${esc(headerPattern)}</code>
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
        const K = BaseAdvancedModule;
        if (!capture || !capture.captureData) {
            return K.kitNote(shapeSecurityText('advCommonNoCaptureData', 'No capture data available'));
        }
        const data = capture.captureData;
        const headers = data.headers || [];
        // Unique header patterns: the middle 8 characters ("X-DQ7Hy5L1-z" -> "DQ7Hy5L1")
        const headerPatterns = [...new Set(headers.map(h => {
            const match = String(h.name || '').match(/^X-([A-Za-z0-9]{8})-[a-z]$/i);
            return match ? match[1] : h.name;
        }))].filter(Boolean);
        const patternLabel = headerPatterns.length > 1
            ? shapeSecurityText('advShapeHeaderPatterns', 'Header Patterns') : shapeSecurityText('advShapeHeaderPattern', 'Header Pattern');
        const facts = K.kitFacts([
            { label: shapeSecurityText('advCommonCaptured', 'Captured'), value: shapeSecurityDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(shapeSecurityText('advShapeVersionTitle', 'Shape Security Version'), String(data.version || 'v2').toUpperCase())
            + headerPatterns.map(pattern => K.kitField(patternLabel, pattern)).join('')
            + K.kitField(shapeSecurityText('advShapeCookieTitle', 'Shape Cookie'), data.cookie && data.cookie.name);
        return facts + (fields ? K.kitCard(fields) : '');
    };

    // ========================================================================
    // CAPTURE HOOKS (Override base module behavior)
    // ========================================================================


    /**
     * Display extracted script data in modal (matching Akamai Analysis style)
     */
ShapeSecurityAdvanced.prototype.displayScriptDataModal = function(data) {
        this.recordStructuredResult('displayScriptDataModal', data);
        const K = BaseAdvancedModule;
        const initJsScripts = (data && data.initJsUrls) || [];
        const seedScripts = (data && data.seedUrls) || [];
        const allScripts = (data && data.allScripts) || [];
        const urlLabel = shapeSecurityText('advCommonScriptUrl', 'Script URL:').replace(/:\s*$/, '');
        const section = (title, urls) => urls.length
            ? K.kitSection(title, urls.map(url => K.kitCard(K.kitField(urlLabel, url, { clamp: true }))).join(''), urls.length)
            : '';
        const facts = K.kitFacts([
            { label: shapeSecurityText('advCommonTotalScripts', 'Total Scripts:').replace(/:\s*$/, ''), value: String(allScripts.length) },
            { label: shapeSecurityText('advShapeInitJsScriptsLabel', 'Init.js Scripts:').replace(/:\s*$/, ''), value: String(initJsScripts.length) },
            { label: shapeSecurityText('advShapeSeedScriptsLabel', 'Seed Scripts:').replace(/:\s*$/, ''), value: String(seedScripts.length) }
        ]);
        const body = allScripts.length
            ? facts + section(shapeSecurityText('advShapeInitJsScripts', 'Init.js Scripts'), initJsScripts)
                + section(shapeSecurityText('advShapeSeedScripts', 'Seed Scripts'), seedScripts)
            : K.kitNote(shapeSecurityText('advCommonNoScriptsToExport', 'No scripts available to export'));
        // Export Code gets each URL with what the generator needs to know about it
        const scripts = allScripts.map(url => ({
            url,
            isInitJs: url.includes('/init.js'),
            hasSeed: url.includes('seed='),
            seed: url.includes('seed=') ? url.match(/seed=([A-Za-z0-9_\-]+)/)?.[1] : null
        }));
        return this.openKitModal({
            title: shapeSecurityText('advShapeAnalysisTitle', 'Shape Security Analysis'),
            subtitle: (() => { try { return new URL(this.tabInfo.url).hostname; } catch (_) { return ''; } })(),
            iconSvg: K.toolIcon('scripts'),
            body,
            copiedMessage: shapeSecurityText('advValueCopied', 'Value copied'),
            actions: scripts.length ? [{
                label: shapeSecurityText('advCommonExportCode', 'Export Code'),
                primary: true,
                onClick: () => this.displayExportCodeModal(scripts)
            }] : [],
            record: false
        });
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



ShapeSecurityAdvanced.prototype.showVersionModal = function(version) {
        this.recordStructuredResult('version', { version });
        const K = BaseAdvancedModule;
        const versionUpper = String(version || '').toUpperCase();
        // v1 is cookie only; v2 also signs requests with its X-xxxxxxxx-* headers
        const requirements = version === 'v1'
            ? shapeSecurityText('advShapeCookieLabel', 'Cookie')
            : shapeSecurityText('advShapeCookieAndHeaders', 'Cookie + Headers');
        return this.openKitModal({
            title: shapeSecurityText('advShapeVersionTitle', 'Shape Security Version'),
            subtitle: (() => { try { return new URL(this.tabInfo.url).hostname; } catch (_) { return ''; } })(),
            iconSvg: K.toolIcon('version'),
            body: K.kitFacts([
                { label: shapeSecurityText('advShapeDetectedVersion', 'Detected Version:').replace(/:\s*$/, ''), html: true,
                    value: K.kitChip(versionUpper, version === 'v1' ? 'green' : 'blue') },
                { label: shapeSecurityText('advShapeCaptureRequirements', 'Capture Requirements'), value: requirements }
            ]),
            copiedMessage: shapeSecurityText('advValueCopied', 'Value copied'),
            record: false
        });
    };


