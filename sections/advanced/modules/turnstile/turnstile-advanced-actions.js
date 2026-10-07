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


TurnstileAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[Turnstile] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const analysisListener = (message) => {
                if (message.type === 'TURNSTILE_ANALYSIS_RESULT') {
                    Logger.network('[Turnstile] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'TURNSTILE_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                // Turnstile sets no cookies: a plain reload is enough to see its scripts load
                NotificationHelper.info(this._txt('advTurnstileReloadingScripts', 'Reloading the page to collect the Turnstile scripts'));
                // Same short wait as the other vendors before the reload
                await new Promise(resolve => setTimeout(resolve, 500));
                try {
                    await AdvancedUtils.sendMessage({
                        type: 'TURNSTILE_SHOW_ANALYZING_NOTIFICATION',
                        tabId: this.tabInfo.id
                    });
                } catch (noticeError) {
                    Logger.debug('NETWORK', '[Turnstile] Page notice not shown:', noticeError);
                }
                await chrome.tabs.reload(this.tabInfo.id);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error(this._txt('advCommonFailedStartAnalysis', 'Failed to start analysis'));
            }
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to analyze scripts:', error);
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
