    /**
     * Render DataDome-specific tools
     */
DataDomeAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'datadomeCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'datadomeAnalyzeScripts',
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
DataDomeAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'datadomeCheckCookies', handler: () => this.checkCookies() },
            { id: 'datadomeAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[DataDome] Added listener to Check Cookies button');
        Logger.network('[DataDome] Added listener to Analyze Scripts button');
    };


    /**
     * Display script analysis results in modal
     */
DataDomeAdvanced.prototype.displayAnalysisModal = function(data) {
        // File names stay literal; words are translated
        const labels = {
            tags: () => 'tags.js', captchaScript: () => 'c.js', interstitialScript: () => 'i.js',
            collector: () => this._txt('advScriptTypeCollector', 'Collector'),
            challengeScript: () => 'captcha-delivery', captcha: () => 'CAPTCHA',
            captchaCheck: () => this._txt('advScriptTypeCaptchaCheck', 'CAPTCHA check'),
            interstitial: () => this._txt('advScriptTypeInterstitial', 'Interstitial')
        };
        return this.showScriptResults(data, { vendor: 'DataDome', label: type => labels[type]?.() });
    };


