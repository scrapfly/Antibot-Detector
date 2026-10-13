HCaptchaAdvanced.prototype.checkVersion = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            // Set up listener for version detection results BEFORE reloading
            let timeoutId = null;
            const versionListener = (message) => {
                if (message.type === 'HCAPTCHA_VERSION_RESULT') {
                    Logger.network('[hCaptcha] Version result received:', message.data);
                    // A result arrived: the timeout must not report a failure later
                    clearTimeout(timeoutId);
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
                // The popup says what happens; nothing is drawn on the page
                NotificationHelper.info(hcaptchaText('advHcaptchaCheckingVersionReload', 'Checking hCaptcha version... Page will reload'));

                // Reload the page to trigger hCaptcha loading
                await chrome.tabs.reload(this.tabInfo.id);

                // Timeout after 15 seconds
                timeoutId = setTimeout(() => {
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

            let analysisRequestId = null;
            const analysisListener = (message) => {
                if (message.type === 'HCAPTCHA_ANALYSIS_RESULT' && message.tabId === this.tabInfo.id && (!analysisRequestId || message.requestId === analysisRequestId)) {
                    if (message.status !== 'completed') {
                        AdvancedToolClient.unsubscribe(analysisListener);
                        NotificationHelper.error(message.error || BaseAdvancedModule._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
                        return;
                    }
                    message.data._advancedPersisted = true;
                    this.displayAnalysisModal(message.data);
                    AdvancedToolClient.unsubscribe(analysisListener);
                }
            };

            this._analysisDispose?.();
            this._analysisDispose = AdvancedToolClient.subscribe(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'HCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            analysisRequestId = response?.requestId;
            if (response && response.status === 'started') {
                NotificationHelper.info(hcaptchaText('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'hCaptcha'));

                await new Promise(resolve => setTimeout(resolve, 500));
                await chrome.tabs.reload(this.tabInfo.id);
            } else {
                this._analysisDispose?.();
            }
        } catch (error) {
            this._analysisDispose?.();
            NotificationHelper.error(hcaptchaText('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
