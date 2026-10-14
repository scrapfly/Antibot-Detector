HCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'hcaptchaExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract Site Key')
            },
            {
                id: 'hcaptchaCheckVersion',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckVersion')) || 'Check Version'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12.5,7H11V13L16.25,16.15L17.02,14.92L12.5,11.58V7Z"/>
                    </svg>
                `
            },
            {
                id: 'hcaptchaStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M9.5,9.5A1.5,1.5 0 0,1 11,11A1.5,1.5 0 0,1 9.5,12.5A1.5,1.5 0 0,1 8,11A1.5,1.5 0 0,1 9.5,9.5M15,11A1.5,1.5 0 0,0 13.5,9.5A1.5,1.5 0 0,0 12,11A1.5,1.5 0 0,0 13.5,12.5A1.5,1.5 0 0,0 15,11M11,15H13V17H11V15M9,15H10V17H9V15M14,15H15V17H14V15Z"/>
                    </svg>
                `
            },
            {
                id: 'hcaptchaAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


HCaptchaAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'hcaptchaExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'hcaptchaCheckVersion', handler: () => this.checkVersion() },
            { id: 'hcaptchaStartCapture', handler: () => this.startCapturing() },
            { id: 'hcaptchaAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
    };


// Header icon of the Check Version dialog (a version tag)
HCaptchaAdvanced.VERSION_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';

/**
 * Check Version result: the mode as a chip, then the version, site key and
 * page as rows that copy on click. Nothing found: one clear note.
 */
HCaptchaAdvanced.prototype.displayVersionModal = function(data) {
        this.recordStructuredResult('displayVersionModal', data);
        const K = BaseAdvancedModule;
        const { version, isEnterprise, websiteKey, websiteURL } = data || {};
        let host = '';
        try { host = this.tabInfo?.url ? new URL(this.tabInfo.url).hostname : ''; } catch (_) { host = ''; }

        if (!version && !websiteKey) {
            this.openKitModal({
                title: hcaptchaText('advHcaptchaDetectionTitle', 'hCaptcha Detection'),
                subtitle: host,
                iconSvg: HCaptchaAdvanced.VERSION_ICON,
                body: K.kitNote(hcaptchaText('advHcaptchaNotDetected', 'hCaptcha not detected. Please reload the page with hCaptcha loaded.'))
            });
            return;
        }

        const mode = isEnterprise
            ? K.kitChip(hcaptchaText('advCommonYes', 'Yes'), 'purple')
            : K.kitChip(hcaptchaText('advHcaptchaNo', 'No'), 'neutral');
        const facts = K.kitFacts([
            { label: hcaptchaText('advHcaptchaEnterpriseMode', 'Enterprise Mode'), value: mode, html: true }
        ]);
        const fields = K.kitField(hcaptchaText('ruleFieldVersion', 'Version'), version)
            + K.kitField(hcaptchaText('advCommonSiteKey', 'Site Key'), websiteKey)
            + K.kitField(hcaptchaText('advCommonPage', 'Page'), websiteURL, { mono: false, wrap: true });

        this.openKitModal({
            title: hcaptchaText('advHcaptchaVersionTitle', 'hCaptcha Version'),
            subtitle: host,
            iconSvg: HCaptchaAdvanced.VERSION_ICON,
            body: facts + (fields ? K.kitCard(fields) : ''),
            copiedMessage: hcaptchaText('copiedNotification', 'Copied')
        });
    };


    /**
     * Override: Render hCaptcha capture history items
     * Shows: Timestamp, Version, Enterprise, Site Key, Website URL
     */
HCaptchaAdvanced.prototype.renderCaptureHistoryItems = function(historyItems) {
        if (!historyItems || historyItems.length === 0) {
            return `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${FormatUtils.escapeHtml(hcaptchaText('advHcaptchaNoHistory', 'No capture history yet'))}</div>`;
        }
        const esc = FormatUtils.escapeHtml, attr = FormatUtils.escapeAttr;
        // Same card as the other vendors: site, time, version (+ Enterprise), site key
        return historyItems.map(item => {
            const data = item.captureData || item;
            const hostname = String(item.hostname || data.websiteURL || '');
            const id = attr(String(item.id || item.timestamp || ''));
            const faviconUrl = attr(UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname));
            const version = [data.version, data.isEnterprise ? hcaptchaText('advCommonEnterprise', 'Enterprise') : ''].filter(Boolean).join(' · ')
                || hcaptchaText('advHcaptchaNotAvailable', 'N/A');
            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${attr(hostname)}" data-fallback="${attr(UrlUtils.getDefaultFaviconUrl())}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${esc(hostname || hcaptchaText('timeUnknown', 'Unknown'))}</span>
                                <span class="capture-time">${esc(this.getTimeAgo(item.timestamp))}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">${esc(hcaptchaText('ruleFieldVersion', 'Version'))}</span>
                                <span class="capture-type-value">${esc(version)}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    ${data.websiteKey ? `<div class="capture-sitekey-container"><code class="capture-sitekey-code">${esc(data.websiteKey)}</code></div>` : ''}
                </div>
            `;
        }).join('');
    };


    /**
     * Override: Render hCaptcha capture details for modal
     * Shows all hCaptcha-specific information when user clicks on a capture
     */
HCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const K = BaseAdvancedModule;
        const data = capture.captureData || capture.data || {};
        const facts = K.kitFacts([
            { label: hcaptchaText('advHcaptchaEnterpriseMode', 'Enterprise Mode'), html: true, value: data.isEnterprise
                ? K.kitChip(hcaptchaText('advCommonYes', 'Yes'), 'green') : K.kitChip(hcaptchaText('advHcaptchaNo', 'No'), 'neutral') },
            { label: hcaptchaText('advCommonCaptured', 'Captured'), value: hcaptchaDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(hcaptchaText('advCommonUrl', 'URL'), capture.url, { mono: false, wrap: true })
            + K.kitField(hcaptchaText('ruleFieldVersion', 'Version'), data.version)
            + K.kitField(hcaptchaText('advCommonSiteKey', 'Site Key'), data.websiteKey, { wrap: true })
            + K.kitField(hcaptchaText('advCommonWebsiteUrl', 'Website URL'), data.websiteURL, { mono: false, wrap: true });
        return facts + (fields ? K.kitCard(fields) : '');
    };


HCaptchaAdvanced.prototype.displayAnalysisModal = function(data) {
        const labels = { api: 'api.js', config: 'checksiteconfig', challenge: 'getcaptcha', hsw: 'hsw.js', frame: 'iframe', hcaptcha: 'hCaptcha' };
        return this.showScriptResults(data, { vendor: 'hCaptcha', label: type => labels[type] });
    };
