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
                NotificationHelper.info('Analyzing FunCaptcha... Page will reload');

                setTimeout(async () => {
                    await AdvancedUtils.sendMessage({
                        type: 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
                        tabId: this.tabInfo.id
                    });

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            }
        } catch (error) {
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };
