FunCaptchaAdvanced.prototype.analyzeScripts = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            let analysisRequestId = null;
            const analysisListener = (message) => {
                if (message.type === 'FUNCAPTCHA_ANALYSIS_RESULT' && message.tabId === this.tabInfo.id && (!analysisRequestId || message.requestId === analysisRequestId)) {
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
                type: 'FUNCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            analysisRequestId = response?.requestId;
            if (response && response.status === 'started') {
                NotificationHelper.info(this._txt('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'FunCaptcha'));

                await new Promise(resolve => setTimeout(resolve, 500));
                await chrome.tabs.reload(this.tabInfo.id);
            } else {
                this._analysisDispose?.();
            }
        } catch (error) {
            this._analysisDispose?.();
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
