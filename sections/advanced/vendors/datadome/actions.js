    /**
     * Check DataDome cookies without reload
     */
DataDomeAdvanced.prototype.checkCookies = async function() {
        Logger.network('[DataDome] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[DataDome] Total cookies found:', cookies.length);

            const dataDomeCookie = cookies.find(c => c.name === 'datadome');
            Logger.network('[DataDome] datadome cookie found:', !!dataDomeCookie);

            // Show notification
            if (dataDomeCookie) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('DataDome'));
            }

            // Display modal with cookie details
            this.showCookieResults({ vendor: 'DataDome', expected: ['datadome'], cookies: [dataDomeCookie].filter(Boolean) });
        } catch (error) {
            Logger.error('NETWORK', '[DataDome] Failed to check cookies:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };


    /**
     * Analyze DataDome scripts on the page
     * Deletes datadome cookie, reloads page, then analyzes scripts
     */
DataDomeAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[DataDome] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Setup listener for analysis results
            let analysisRequestId = null;
            const analysisListener = (message) => {
                if (message.type === 'DATADOME_ANALYSIS_RESULT' && message.tabId === this.tabInfo.id && (!analysisRequestId || message.requestId === analysisRequestId)) {
                    if (message.status !== 'completed') {
                        AdvancedToolClient.unsubscribe(analysisListener);
                        NotificationHelper.error(message.error || BaseAdvancedModule._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
                        return;
                    }
                    message.data._advancedPersisted = true;
                    Logger.network('[DataDome] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    AdvancedToolClient.unsubscribe(analysisListener);
                }
            };

            this._analysisDispose?.();
            this._analysisDispose = AdvancedToolClient.subscribe(analysisListener);

            // Send message to background to start analysis mode (sets up webNavigation listener)
            const response = await AdvancedUtils.sendMessage({
                type: 'DATADOME_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[DataDome] Analysis mode response:', response);

            analysisRequestId = response?.requestId;
            if (response && response.status === 'started') {
                // Show notification about reload
                NotificationHelper.info(this._txt('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'DataDome'));

                // Reload page to capture DataDome scripts (keep existing cookie)
                await new Promise(resolve => setTimeout(resolve, 500));
                Logger.network('[DataDome] Reloading page to capture scripts (keeping datadome cookie)');
                // Reload page - Background's webNavigation listener will capture scripts
                // DataDome cookie is preserved, no deletion occurs
                await chrome.tabs.reload(this.tabInfo.id);
            } else {
                AdvancedToolClient.unsubscribe(analysisListener);
                NotificationHelper.error(this._txt('advCommonFailedStartAnalysis', 'Failed to start analysis'));
            }
        } catch (error) {
            this._analysisDispose?.();
            Logger.error('NETWORK', '[DataDome] Failed to analyze scripts:', error);
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };


    /**
     * Generate parsing code for DataDome scripts in different languages
     */
