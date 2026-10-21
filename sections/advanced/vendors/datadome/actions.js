    /**
     * Check DataDome cookies without reload
     */
DataDomeAdvanced.prototype.checkCookies = async function() {
        Logger.network('[DataDome] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await PageCookies.getAll({ url: this.tabInfo.url }, this.tabInfo.id);
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
DataDomeAdvanced.prototype.analyzeScripts = function() {
        return this.startScriptAnalysis();
    };
