    /**
     * Check Geetest version (V3 or V4) - simplified, notification only
     */
GeetestAdvanced.prototype.checkVersion = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const response = await this.sendMessage({
                type: 'GEETEST_CHECK_VERSION',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            if (response && response.version) {
                const versionName = response.version === 'v4' ? 'V4' : 'V3';
                NotificationHelper.success(`Detected: Geetest ${versionName}`);
            } else {
                NotificationHelper.warning('No Geetest version detected');
            }
        } catch (error) {
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    };


    /**
     * Analyze scripts containing Geetest code
     */
GeetestAdvanced.prototype.analyzeScripts = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Geetest'));

            const response = await this.sendMessage({
                type: 'GEETEST_ANALYZE_SCRIPTS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            if (response && response.scripts && response.scripts.length > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(response.scripts.length));
                this.displayScriptsModal(response.scripts);
            } else {
                NotificationHelper.warning(AdvancedUtils.notifications.analyzeScripts.none('Geetest'));
            }
        } catch (error) {
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };


    /**
     * Export parsing code for captchaId extraction
     */
GeetestAdvanced.prototype.exportParsingCode = function(scripts) {
        const isV4 = scripts.some(s => s.type === 'v4');

        const parsingCode = isV4 ? `// Geetest V4 - Extract captchaId from script
// Search for initGeetest4 call and extract captchaId parameter

const scriptContent = document.documentElement.outerHTML; // or fetch script content

// Match initGeetest4 config object
const initGeetest4Regex = /initGeetest4\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*,/;
const match = scriptContent.match(initGeetest4Regex);

if (match) {
    const configText = match[1];

    // Extract captchaId
    const captchaIdMatch = configText.match(/captchaId\\s*:\\s*["']([^"']+)["']/);
    const captchaId = captchaIdMatch ? captchaIdMatch[1] : null;

    // Extract product (optional)
    const productMatch = configText.match(/product\\s*:\\s*["']([^"']+)["']/);
    const product = productMatch ? productMatch[1] : null;

    Logger.network('Geetest V4 captchaId:', captchaId);
    Logger.network('Product:', product);
} else {
    Logger.network('No Geetest V4 found');
}` : `// Geetest V3 - Extract gt and challenge from script
// Search for initGeetest call and extract parameters

const scriptContent = document.documentElement.outerHTML; // or fetch script content

// Match initGeetest config object
const initGeetestRegex = /initGeetest\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*,/;
const match = scriptContent.match(initGeetestRegex);

if (match) {
    const configText = match[1];

    // Extract gt
    const gtMatch = configText.match(/gt\\s*:\\s*["']([^"']+)["']/);
    const gt = gtMatch ? gtMatch[1] : null;

    // Extract challenge
    const challengeMatch = configText.match(/challenge\\s*:\\s*["']([^"']+)["']/);
    const challenge = challengeMatch ? challengeMatch[1] : null;

    Logger.network('Geetest V3 gt:', gt);
    Logger.network('Geetest V3 challenge:', challenge);
} else {
    Logger.network('No Geetest V3 found');
}`;

        // Copy to clipboard
        AdvancedUtils.copyToClipboard(parsingCode);
        NotificationHelper.success('Parsing code copied to clipboard!');
    };