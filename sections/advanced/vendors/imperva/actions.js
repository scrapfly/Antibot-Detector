    /**
     * Check Imperva cookies (read through the worker)
     */
ImpervaAdvanced.prototype.checkCookies = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const patterns = [/^reese84$/, /^_*utmvc$/, /^incap_ses_\d+_\d+$/, /^nlbi_\d+/, /^visid_incap_\d+$/];
            const cookies = (await PageCookies.getAll({ url: this.tabInfo.url }, this.tabInfo.id))
                .filter(cookie => patterns.some(pattern => pattern.test(cookie.name)));

            Logger.network('[IMPERVA] Cookies found:', cookies.length);

            // Determine protection level
            const hasReese84 = cookies.some(c => c.name === 'reese84');
            const hasUtmvc = cookies.some(c => /^_*utmvc$/.test(c.name));
            const incapSes = cookies.filter(c => /^incap_ses_/.test(c.name));
            const nlbi = cookies.filter(c => /^nlbi_/.test(c.name));
            const visid = cookies.filter(c => /^visid_incap_/.test(c.name));

            let protectionLevel = 'None';
            if (hasReese84 && hasUtmvc) {
                protectionLevel = 'Advanced (reese84 + utmvc)';
            } else if (hasReese84 || hasUtmvc) {
                protectionLevel = 'Standard';
            } else if (incapSes.length > 0) {
                protectionLevel = 'Basic (Session)';
            }

            Logger.network('[IMPERVA] Protection Level:', protectionLevel);

            // Show notification
            // Same count as the window: a site can set two nlbi_ or incap_ses_ cookies
            const foundCount = cookies.length;
            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, Math.max(patterns.length, foundCount)));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Imperva'));
            }

            const tr = ImpervaAdvanced.tr;
            const levelText = {
                'None': tr('advCommonNone', 'None'),
                'Advanced (reese84 + utmvc)': tr('advImpervaLevelAdvanced', 'Advanced (reese84 + utmvc)'),
                'Standard': tr('advCommonStandard', 'Standard'),
                'Basic (Session)': tr('advImpervaLevelBasicSession', 'Basic (Session)')
            }[protectionLevel] || protectionLevel;
            this.showCookieResults({ vendor: 'Imperva', expected: ['reese84', '___utmvc', 'incap_ses_*', 'nlbi_*', 'visid_incap_*'], cookies,
                facts: [{ label: tr('advCommonProtectionLevel', 'Protection Level:'), value: levelText }] });
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA] Failed to check cookies:', error);
            NotificationHelper.error(ImpervaAdvanced.fmt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };


    /**
     * Extract Scripts - Delete cookies and capture challenge/solution data
     */
ImpervaAdvanced.prototype.extractScripts = async function() {
        Logger.network('[IMPERVA-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {

            // The tab these tools were opened for, not whichever tab is active now
            const tab = this.tabInfo;
            if (!tab || !tab.id || !tab.url) {
                throw new Error('Tab information not available');
            }

            Logger.network('[IMPERVA-EXTRACT] Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Delete Imperva-related cookies to force regeneration
            const cookiesToDelete = ['reese84', '___utmvc', 'incap_ses', 'nlbi', 'visid_incap'];
            let deletedCount = 0;

            for (const cookieName of cookiesToDelete) {
                try {
                    // For pattern-based cookies, get all and delete
                    const cookies = await PageCookies.getAll({ url: tab.url }, tab.id);
                    const matchingCookies = cookies.filter(c =>
                        c.name === cookieName ||
                        c.name.startsWith(cookieName + '_')
                    );

                    for (const cookie of matchingCookies) {
                        await PageCookies.remove(tab.url, cookie);
                        Logger.network(`[IMPERVA-EXTRACT] Deleted cookie: ${cookie.name}`);
                        deletedCount++;
                    }
                } catch (err) {
                    Logger.network(`[IMPERVA-EXTRACT] Could not delete cookie ${cookieName}:`, err.message);
                }
            }

            Logger.network(`[IMPERVA-EXTRACT] Deleted ${deletedCount} cookies total`);

            // Send message to start extraction mode
            const response = await chrome.runtime.sendMessage({
                type: 'IMPERVA_EXTRACT_SCRIPTS',
                tabId: tab.id
            });
            Logger.network('[IMPERVA-EXTRACT] Background response received:', response);
            Logger.network('[IMPERVA-EXTRACT] Response type:', typeof response);
            Logger.network('[IMPERVA-EXTRACT] Response status:', response?.status);
            Logger.network('[IMPERVA-EXTRACT] Response error:', response?.error);

            if (response && response.status === 'success') {
                Logger.network('[IMPERVA-EXTRACT] Extraction mode enabled successfully');

                // Reload the page to trigger Imperva scripts
                await chrome.tabs.reload(tab.id);
                Logger.network('[IMPERVA-EXTRACT] Page reload initiated');

                // Show success notification
                NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Imperva'));
                // The result arrives as IMPERVA_EXTRACTION_COMPLETED: keep the card busy until then
                return { awaitingResult: true };
            } else {
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Invalid response from background');
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Expected: { status: "success" }');
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Received:', JSON.stringify(response));
                throw new Error(response?.error || ImpervaAdvanced.tr('advImpervaEnableExtractionFailed', 'Failed to enable extraction mode. Check background console for details.'));
            }

            Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION STARTED ==========');
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Failed to start extraction:', error);
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error stack:', error.stack);
            NotificationHelper.error(ImpervaAdvanced.fmt('advCommonFailedStartExtractionFmt', 'Failed to start extraction: {0}', error.message));
        }
    };


    /**
     * Parse script paths from captured data
     */
ImpervaAdvanced.prototype.parseScriptPaths = function(extractedData) {
        const scriptUrls = extractedData.scriptUrls || [];
        let utmvcScriptPath = null;
        let reeseScriptPath = null;
        let reeseSensorPath = null;

        Logger.network('[IMPERVA-EXTRACT] Parsing script paths from', scriptUrls.length, 'URLs');

        // Parse utmvc script path: /_Incapsula_Resource?SWKMTFSR=1&e=...
        const utmvcPattern = /\/_Incapsula_Resource\?SWKMTFSR=1&e=[^"'\s&]*/i;
        for (const url of scriptUrls) {
            const match = url.match(utmvcPattern);
            if (match) {
                utmvcScriptPath = match[0];
                Logger.network('[IMPERVA-EXTRACT] Found UTMVC script path:', utmvcScriptPath);
                break;
            }
        }

        // Parse reese84 script path: /[^/]+/\d+ pattern (e.g., /abc123/456)
        // This pattern matches paths like /abc123/456 or https://example.com/abc123/456
        const reesePattern = /(?:https?:\/\/[^\/]+)?(\/[^/\s]+\/\d+)([?#][^\s]*)?/;
        for (const url of scriptUrls) {
            const match = url.match(reesePattern);
            if (match && match[1]) {
                reeseSensorPath = match[1]; // Base path: /abc123/456
                reeseScriptPath = match[1] + (match[2] || ''); // Full path with query/hash
                Logger.network('[IMPERVA-EXTRACT] Found Reese84 script path:', reeseScriptPath);
                Logger.network('[IMPERVA-EXTRACT] Found Reese84 sensor path:', reeseSensorPath);
                break;
            }
        }

        // If nothing found, log for debugging
        if (!utmvcScriptPath && !reeseScriptPath) {
            Logger.network('[IMPERVA-EXTRACT] No script paths matched. Sample URLs:');
            scriptUrls.slice(0, 5).forEach(url => {
                Logger.network('[IMPERVA-EXTRACT]   -', url);
            });
        }

        return {
            utmvcScriptPath,
            reeseScriptPath,
            reeseSensorPath
        };
    };
