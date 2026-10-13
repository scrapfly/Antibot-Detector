    /**
     * Check AWS WAF cookies without reload
     */
AwsWafAdvanced.prototype.checkCookies = async function() {
        Logger.network('[AwsWaf] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[AwsWaf] Total cookies found:', cookies.length);

            const awsWafToken = cookies.find(c => c.name === 'aws-waf-token');
            Logger.network('[AwsWaf] aws-waf-token found:', !!awsWafToken);

            // Show notification
            if (awsWafToken) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('AWS WAF'));
            }

            // Display modal with cookie details
            this.showCookieResults({ vendor: 'AWS WAF', expected: ['aws-waf-token'], cookies: [awsWafToken].filter(Boolean) });
        } catch (error) {
            Logger.error('NETWORK', '[AwsWaf] Failed to check cookies:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };


    /**
     * Analyze AWS WAF scripts on the page (Shape Security + Akamai pattern)
     * Deletes aws-waf-token cookie, reloads page, then analyzes scripts
     */
AwsWafAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[AwsWaf] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Setup listener for analysis results (like Shape Security)
            let analysisRequestId = null;
            const analysisListener = (message) => {
                if (message.type === 'AWSWAF_ANALYSIS_RESULT' && message.tabId === this.tabInfo.id && (!analysisRequestId || message.requestId === analysisRequestId)) {
                    if (message.status !== 'completed') {
                        AdvancedToolClient.unsubscribe(analysisListener);
                        NotificationHelper.error(message.error || BaseAdvancedModule._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
                        return;
                    }
                    message.data._advancedPersisted = true;
                    Logger.network('[AwsWaf] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    AdvancedToolClient.unsubscribe(analysisListener);
                }
            };

            this._analysisDispose?.();
            this._analysisDispose = AdvancedToolClient.subscribe(analysisListener);

            // Send message to background to start analysis mode (sets up webNavigation listener)
            const response = await AdvancedUtils.sendMessage({
                type: 'AWSWAF_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[AwsWaf] Analysis mode response:', response);

            analysisRequestId = response?.requestId;
            if (response && response.status === 'started') {
                // Show notification about cookie deletion and reload
                NotificationHelper.info(this._txt('advAwswafDeletingCookieFmt', 'Deleting {0} cookie... Page will reload', 'aws-waf-token'));

                // Delete aws-waf-token cookie before reload to trigger challenge/captcha scripts (like Akamai)
                await new Promise(resolve => setTimeout(resolve, 500));
                {
                    try {
                        // Get all aws-waf-token cookies for this URL
                        const cookies = await chrome.cookies.getAll({
                            url: this.tabInfo.url,
                            name: 'aws-waf-token'
                        });

                        Logger.network('[AwsWaf] Found aws-waf-token cookies to delete:', cookies.length);

                        // Delete each cookie (may have multiple for different domains/paths)
                        for (const cookie of cookies) {
                            await chrome.cookies.remove({
                                url: this.tabInfo.url,
                                name: cookie.name
                            });
                            Logger.network('[AwsWaf] Deleted cookie:', cookie.name, 'domain:', cookie.domain);
                        }

                        Logger.network('[AwsWaf] Cookie deletion complete, reloading page');
                    } catch (cookieError) {
                        Logger.error('NETWORK', '[AwsWaf] Failed to delete cookies:', cookieError);
                    }

                    // Reload page to trigger challenge.js or captcha.js
                    // Background's webNavigation listener will capture scripts after reload
                    await chrome.tabs.reload(this.tabInfo.id);
                }
            } else {
                AdvancedToolClient.unsubscribe(analysisListener);
                NotificationHelper.error(this._txt('advCommonFailedStartAnalysis', 'Failed to start analysis'));
            }
        } catch (error) {
            this._analysisDispose?.();
            Logger.error('NETWORK', '[AwsWaf] Failed to analyze scripts:', error);
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };


    /**
     * Generate AWS WAF script fetching code for multiple languages
     * @param {Array} scripts - Array of script objects with url and type
     * @returns {Object} Code snippets for each language
     */
