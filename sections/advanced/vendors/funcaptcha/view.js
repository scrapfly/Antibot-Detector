FunCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'funcaptchaExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractPublicKey')) || 'Extract Public Key')
            },
            {
                id: 'funcaptchaAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            },
            {
                id: 'funcaptchaStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="8"/>
                    </svg>
                `
            }
        ]);
    };


FunCaptchaAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'funcaptchaExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'funcaptchaAnalyzeScripts', handler: () => this.analyzeScripts() },
            { id: 'funcaptchaStartCapture', handler: () => this.startCapturing() }
        ]);
    };


FunCaptchaAdvanced.prototype.displayAnalysisModal = function(data) {
        const labels = { api: 'api.js', enforcement: 'enforcement', session: 'public_key', fc: '/fc/', script: 'script', arkose: 'Arkose Labs' };
        return this.showScriptResults(data, { vendor: 'FunCaptcha', label: type => labels[type] });
    };


FunCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const K = BaseAdvancedModule;
        const data = capture.captureData || {};
        const facts = K.kitFacts([
            data.isBlobRequired && !data.blob ? { label: this._txt('advFuncaptchaBlobData', 'Blob Data'), html: true,
                value: K.kitChip(this._txt('advFuncaptchaNotCaptured', 'Not captured'), 'neutral') } : null,
            { label: this._txt('advCommonCaptured', 'Captured'), value: K.kitDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(this._txt('advFuncaptchaPublicKey', 'Public Key'), data.publicKey, { wrap: true })
            + K.kitField(this._txt('advCommonApiDomain', 'API Domain'), data.apiDomain)
            + K.kitField(this._txt('advCommonWebsiteUrl', 'Website URL'), data.websiteUrl, { mono: false, wrap: true })
            + K.kitField(this._txt('advFuncaptchaUserAgent', 'User Agent'), data.userAgent, { mono: false, wrap: true })
            + K.kitField(this._txt('advFuncaptchaBdaLabel', 'BDA (Browser Data Array)'), data.bda, { clamp: true })
            + (data.isBlobRequired ? K.kitField(this._txt('advFuncaptchaBlobData', 'Blob Data'), data.blob, { clamp: true }) : '');
        return facts + (fields ? K.kitCard(fields) : '');
    };
