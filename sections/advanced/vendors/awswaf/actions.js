    /**
     * Check AWS WAF cookies without reload
     */
AwsWafAdvanced.prototype.checkCookies = async function() {
        Logger.network('[AwsWaf] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await PageCookies.getAll({ url: this.tabInfo.url }, this.tabInfo.id);
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
AwsWafAdvanced.prototype.analyzeScripts = function() {
        // Without the token the reload serves the challenge or CAPTCHA scripts again
        return this.startScriptAnalysis({ clearCookies: ['aws-waf-token'] });
    };


    /**
     * Generate AWS WAF script fetching code for multiple languages
     * @param {Array} scripts - Array of script objects with url and type
     * @returns {Object} Code snippets for each language
     */
