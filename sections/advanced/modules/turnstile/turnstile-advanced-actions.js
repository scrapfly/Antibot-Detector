TurnstileAdvanced.prototype.checkCookies = async function() {
        Logger.network('[Turnstile] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');

            const foundCount = cfClearanceCookie ? 1 : 0;

            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Turnstile'));
            }

            this.displayCookiesModal(cfClearanceCookie);
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
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
                NotificationHelper.info('Deleting cf_clearance cookie... Page will reload');

                setTimeout(async () => {
                    try {
                        const cookies = await chrome.cookies.getAll({
                            url: this.tabInfo.url,
                            name: 'cf_clearance'
                        });

                        for (const cookie of cookies) {
                            await chrome.cookies.remove({
                                url: this.tabInfo.url,
                                name: cookie.name
                            });
                        }

                        await AdvancedUtils.sendMessage({
                            type: 'TURNSTILE_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });

                    } catch (cookieError) {
                        Logger.error('NETWORK', '[Turnstile] Failed to delete cookies:', cookieError);
                    }

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };
