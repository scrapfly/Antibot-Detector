TurnstileAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'turnstileExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract Site Key')
            },
            {
                id: 'turnstileAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


TurnstileAdvanced.prototype.setupToolListeners = function() {
        Logger.debug('NETWORK', '[Turnstile] Setting up tool listeners');
        this.bindToolActions([
            { id: 'turnstileExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'turnstileAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
    };


// One card per key: the site key and the page it is on. Shared with
// Advanced → Cloudflare.
TurnstileAdvanced.KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>';

TurnstileAdvanced.prototype.displaySiteKeysModal = function(keys) {
    return CloudflareSiteKeyView.show(this, keys);
};

TurnstileAdvanced.prototype.displayAnalysisModal = function(data) {
        const labels = { api: 'api.js', frame: 'iframe', turnstile: 'Turnstile' };
        return this.showScriptResults(data, { vendor: 'Turnstile', label: type => labels[type] });
    };



