TurnstileAdvanced.prototype.extractSiteKey = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }
            const keys = await TurnstileSiteKeys.extract(this.tabInfo.id);
            if (keys.length === 0) {
                NotificationHelper.error(this._txt('advTurnstileNoSiteKey', 'No Turnstile site key on this page'));
                return;
            }
            this.displaySiteKeysModal(keys);
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to extract the site key:', error);
            NotificationHelper.error(this._txt('advCommonFailedExtractFmt', 'Failed to extract: {0}', error.message));
        }
    };


TurnstileAdvanced.prototype.analyzeScripts = function() {
        return this.startScriptAnalysis();
    };
