CloudflareAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'cloudflareCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'cloudflareExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract Site Key'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3M12,17A2,2 0 0,0 10,19A2,2 0 0,0 12,21A2,2 0 0,0 14,19A2,2 0 0,0 12,17Z"/>
                    </svg>
                `
            },
            {
                id: 'cloudflareAnalyzeScripts',
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
 * Display label for a Cloudflare type (stored English values stay unchanged in history).
 */
CloudflareAdvanced.prototype.cloudflareTypeLabel = function(type) {
        const labels = {
            'Challenge': () => this._txt('advCloudflareTypeChallenge', 'Challenge'),
            'Turnstile + Challenge': () => 'Turnstile + ' + this._txt('advCloudflareTypeChallenge', 'Challenge'),
            'Analytics': () => this._txt('advCloudflareTypeAnalytics', 'Analytics'),
            'Bot Management': () => this._txt('advCloudflareTypeBotManagement', 'Bot Management'),
            'Unknown': () => this._txt('timeUnknown', 'Unknown')
        };
        return labels[type] ? labels[type]() : type;
    };


CloudflareAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'cloudflareCheckCookies', handler: () => this.checkCookies() },
            { id: 'cloudflareExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'cloudflareAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[Cloudflare] Added listener to Check Cookies button');
        Logger.network('[Cloudflare] Added listener to Extract Site Key button');
        Logger.network('[Cloudflare] Added listener to Analyze Scripts button');
    };



CloudflareAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const K = BaseAdvancedModule;
        const data = capture.captureData || capture.data || {};
        const type = data.type || 'Unknown';
        const turnstile = type.includes('Turnstile');
        const facts = K.kitFacts([
            { label: this._txt('advCloudflareTypeLabel', 'Type'), value: this.cloudflareTypeLabel(type) },
            { label: this._txt('advCommonCaptured', 'Captured'), value: K.kitDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(this._txt('advCommonUrl', 'URL'), capture.url, { mono: false, wrap: true })
            + (turnstile ? K.kitField(this._txt('advCommonSiteKey', 'Site Key'), data.sitekey, { wrap: true })
                + K.kitField('cdata', data.cdata, { clamp: true })
                + K.kitField('cAction', data.cAction, { wrap: true }) : '')
            + K.kitField(this._txt('advCommonSiteUrl', 'Site URL'), data.siteURL, { mono: false, wrap: true });
        return facts + (fields ? K.kitCard(fields) : '');
    };


CloudflareAdvanced.prototype.displayAnalysisModal = function(data) {
        return this.showScriptResults(data, { vendor: 'Cloudflare', label: type => this.cloudflareTypeLabel(type) });
    };



