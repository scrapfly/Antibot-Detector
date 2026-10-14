    /**
     * Render AWS WAF-specific tools
     */
AwsWafAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'awswafCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'awswafAnalyzeScripts',
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
     * Setup tool-specific event listeners
     */
AwsWafAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'awswafCheckCookies', handler: () => this.checkCookies() },
            { id: 'awswafAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[AwsWaf] Added listener to Check Cookies button');
        Logger.network('[AwsWaf] Added listener to Analyze Scripts button');
    };


    /**
     * Display script analysis results in modal (simplified - only challenge.js and captcha.js)
     */
AwsWafAdvanced.prototype.displayAnalysisModal = function(data) {
        const labels = {
            challenge: () => this._txt('advAwswafTypeChallenge', 'Challenge'),
            captcha: () => this._txt('categoryCaptcha', 'Captcha'),
            jsapi: () => 'jsapi.js',
            awswaf: () => 'AWS WAF'
        };
        return this.showScriptResults(data, { vendor: 'AWS WAF', label: type => labels[type]?.() });
    };



    /**
     * Render capture details content for modal
     * @param {object} capture - Capture history item
     * @returns {string} HTML content for modal
     */
AwsWafAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const K = BaseAdvancedModule;
        if (!capture || !capture.captureData) {
            return K.kitNote(this._txt('advCommonNoCaptureData', 'No capture data available'));
        }
        const captureData = capture.captureData;
        const data = captureData.data || captureData;
        const facts = K.kitFacts([
            { label: this._txt('advCommonCaptured', 'Captured'), value: K.kitDateTime(captureData.timestamp || capture.timestamp) }
        ]);
        const fields = K.kitField(this._txt('advCommonWebsiteUrl', 'Website URL'), data.websiteURL || capture.url, { mono: false, wrap: true });
        return facts + (fields ? K.kitCard(fields) : '');
    };
