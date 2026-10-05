FunCaptchaAdvanced.prototype.analyzeScripts = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            const analysisListener = (message) => {
                if (message.type === 'FUNCAPTCHA_ANALYSIS_RESULT') {
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'FUNCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info(this._txt('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'FunCaptcha'));

                await new Promise(resolve => setTimeout(resolve, 500));
                {
                    await AdvancedUtils.sendMessage({
                        type: 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
                        tabId: this.tabInfo.id
                    });

                    await chrome.tabs.reload(this.tabInfo.id);
                }
            }
        } catch (error) {
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
