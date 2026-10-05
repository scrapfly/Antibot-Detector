HCaptchaAdvanced.prototype.checkVersion = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            // Set up listener for version detection results BEFORE reloading
            const versionListener = (message) => {
                if (message.type === 'HCAPTCHA_VERSION_RESULT') {
                    Logger.network('[hCaptcha] Version result received:', message.data);
                    this.displayVersionModal(message.data);
                    chrome.runtime.onMessage.removeListener(versionListener);
                }
            };

            chrome.runtime.onMessage.addListener(versionListener);

            // Start version check monitoring
            const response = await AdvancedUtils.sendMessage({
                type: 'HCAPTCHA_CHECK_VERSION',
                tabId: this.tabInfo.id
            });

            Logger.network('[hCaptcha] Check version initiated:', response);

            if (response && response.status === 'started') {
                NotificationHelper.info(hcaptchaText('advHcaptchaCheckingVersionReload', 'Checking hCaptcha version... Page will reload'));

                // Send page notification before reload
                await AdvancedUtils.sendMessage({
                    type: 'HCAPTCHA_SHOW_VERSION_NOTIFICATION',
                    tabId: this.tabInfo.id
                });

                // Wait briefly then reload the page to trigger hCaptcha loading
                await chrome.tabs.reload(this.tabInfo.id);

                // Timeout after 15 seconds
                setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(versionListener);
                    NotificationHelper.error(hcaptchaText('advHcaptchaVersionTimeout', 'hCaptcha version detection timeout'));
                }, 15000);
            } else {
                NotificationHelper.error(hcaptchaText('advHcaptchaFailedStartVersionCheck', 'Failed to start version check'));
                chrome.runtime.onMessage.removeListener(versionListener);
            }
        } catch (error) {
            Logger.error('NETWORK', '[hCaptcha] Failed to check version:', error);
            NotificationHelper.error(hcaptchaText('advCommonFailedCheckVersionFmt', 'Failed to check version: {0}', error.message));
        }
    };


HCaptchaAdvanced.prototype.analyzeScripts = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            const analysisListener = (message) => {
                if (message.type === 'HCAPTCHA_ANALYSIS_RESULT') {
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'HCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info(hcaptchaText('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'hCaptcha'));

                await new Promise(resolve => setTimeout(resolve, 500));
                {
                    await AdvancedUtils.sendMessage({
                        type: 'HCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
                        tabId: this.tabInfo.id
                    });

                    await chrome.tabs.reload(this.tabInfo.id);
                }
            }
        } catch (error) {
            NotificationHelper.error(hcaptchaText('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
