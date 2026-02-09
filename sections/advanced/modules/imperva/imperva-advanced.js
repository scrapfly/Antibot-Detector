/**
 * ImpervaAdvanced - Using BaseAdvancedModule Template System
 *
 * This module uses the new base template system for cleaner, more maintainable code.
 *
 * The base class handles:
 * - Message sending
 * - Capture state management (start/stop/check)
 * - History loading, rendering, pagination
 * - Event listener setup
 * - Utility methods (getTimeAgo, etc.)
 */

Logger.network('[ImpervaAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    PaginationManager: typeof PaginationManager
});

class ImpervaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'imperva');

        // Imperva-specific state
        this.analysisActive = false;
        this.analysisResults = [];
        this.analysisListener = null;
        this.analysisTimer = null;

        // Setup extraction completion listener
        this.setupExtractionListener();
    }

    /**
     * Setup listener for extraction completion messages
     */
    setupExtractionListener() {
        if (this.extractionListener) return; // Already setup

        this.extractionListener = (message) => {
            if (message.type === 'IMPERVA_EXTRACTION_COMPLETED') {
                Logger.network('[IMPERVA-EXTRACT] Extraction completed message received:', message);
                this.displayExtractionResults(message.extractedData);
            }
        };

        chrome.runtime.onMessage.addListener(this.extractionListener);
    }

    /**
     * Cleanup method - removes event listeners to prevent memory leaks
     * Called when the module is unloaded or popup closes
     */
    destroy() {
        // Remove extraction listener to prevent memory leak
        if (this.extractionListener) {
            chrome.runtime.onMessage.removeListener(this.extractionListener);
            this.extractionListener = null;
        }

        // Clear any pending analysis timer
        if (this.analysisTimer) {
            clearTimeout(this.analysisTimer);
            this.analysisTimer = null;
        }

        // Clear analysis state
        this.analysisActive = false;
        this.analysisResults = [];
    }

    /**
     * Override: Show capture start notification with Scrapfly branding
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('Imperva');
        }
    }

    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================

    /**
     * Render Imperva-specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="impervaCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="impervaStartCapture">
                    <div class="tool-icon-container tool-icon-red">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>

                <button class="recaptcha-tool-btn" id="impervaAnalyzeScripts">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>
            </div>
        `;
    }

    /**
     * Setup Imperva-specific tool listeners
     */
    setupToolListeners() {
        const actions = [
            { id: 'impervaCheckCookies', method: () => this.checkCookies() },
            { id: 'impervaStartCapture', method: () => this.startCapturing() },
            { id: 'impervaAnalyzeScripts', method: () => this.extractScripts() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            if (btn) {
                btn.addEventListener('click', method);
            }
        });
    }

    /**
     * Override history item rendering for Imperva-specific display
     */
    renderCaptureHistoryItems(items) {
        return items.map((item) => {
            const { hostname, captureData, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

            const incapSesCount = (captureData.incapSesCookies || []).length;

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            ${incapSesCount > 0 ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">Session Cookies</span>
                                <span class="capture-type-value" style="color: var(--info);">${incapSesCount}</span>
                            </div>
                            ` : ''}
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Override renderCaptureDetailsContent to show Imperva-specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
    renderCaptureDetailsContent(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const incapSesCount = (data.incapSesCookies || []).length;
        const nlbiCount = (data.nlbiCookies || []).length;
        const visidCount = (data.visidCookies || []).length;
        const resourceUrlsCount = (data.incapResourceUrls || []).length;
        const interrogationUrlsCount = (data.interrogationUrls || []).length;

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Security Components</label>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">reese84</span>
                    <span class="advanced-modal-info-value">${data.requiresReese84 ? 'Found' : 'Not found'}</span>
                </div>
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">utmvc</span>
                    <span class="advanced-modal-info-value">${data.requiresUtmvc ? 'Found' : 'Not found'}</span>
                </div>
            </div>

            ${incapSesCount > 0 || nlbiCount > 0 || visidCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Session Cookies</label>
                ${incapSesCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">incap_ses</span>
                    <span class="advanced-modal-info-value">${incapSesCount} cookie(s)</span>
                </div>
                ` : ''}
                ${nlbiCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">nlbi</span>
                    <span class="advanced-modal-info-value">${nlbiCount} cookie(s)</span>
                </div>
                ` : ''}
                ${visidCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">visid_incap</span>
                    <span class="advanced-modal-info-value">${visidCount} cookie(s)</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${resourceUrlsCount > 0 || interrogationUrlsCount > 0 ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Resource Detection</label>
                ${resourceUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Resource URLs</span>
                    <span class="advanced-modal-info-value">${resourceUrlsCount}</span>
                </div>
                ` : ''}
                ${interrogationUrlsCount > 0 ? `
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Interrogation URLs</span>
                    <span class="advanced-modal-info-value">${interrogationUrlsCount}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    }

    // ========================================================================
    // IMPERVA-SPECIFIC METHODS (using BaseInterceptorHelpers)
    // ========================================================================

    /**
     * Check Imperva cookies using BaseInterceptorHelpers
     */
    async checkCookies() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            // Use helper to check cookies - MUCH simpler!
            const cookies = await BaseInterceptorHelpers.checkCookies(
                this.tabInfo.url,
                [
                    { name: { pattern: 'reese84' }, returnValue: true },
                    { name: { pattern: 'utmvc' }, returnValue: true },
                    { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: true },
                    { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: true },
                    { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: true }
                ]
            );

            Logger.network('[IMPERVA] Cookies found:', cookies.length);

            // Determine protection level
            const hasReese84 = cookies.some(c => c.name === 'reese84');
            const hasUtmvc = cookies.some(c => c.name === 'utmvc');
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
            const foundCount = cookies.length;
            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, 7));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Imperva'));
            }

            this.displayCookiesModal(cookies, { hasReese84, hasUtmvc, incapSes, nlbi, visid }, protectionLevel);
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    /**
     * Extract Scripts - Delete cookies and capture challenge/solution data
     */
    async extractScripts() {
        Logger.network('[IMPERVA-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {
            Logger.network('[IMPERVA-EXTRACT] Step 1: Getting current tab...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] No active tab found');
                throw new Error('No active tab found');
            }

            Logger.network('[IMPERVA-EXTRACT] Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Delete Imperva-related cookies to force regeneration
            Logger.network('[IMPERVA-EXTRACT] Step 2: Deleting Imperva cookies...');
            const cookiesToDelete = ['reese84', 'utmvc', 'incap_ses', 'nlbi', 'visid_incap'];
            let deletedCount = 0;

            for (const cookieName of cookiesToDelete) {
                try {
                    // For pattern-based cookies, get all and delete
                    const cookies = await chrome.cookies.getAll({ url: tab.url });
                    const matchingCookies = cookies.filter(c =>
                        c.name === cookieName ||
                        c.name.startsWith(cookieName + '_')
                    );

                    for (const cookie of matchingCookies) {
                        await chrome.cookies.remove({
                            url: tab.url,
                            name: cookie.name
                        });
                        Logger.network(`[IMPERVA-EXTRACT] Deleted cookie: ${cookie.name}`);
                        deletedCount++;
                    }
                } catch (err) {
                    Logger.network(`[IMPERVA-EXTRACT] Could not delete cookie ${cookieName}:`, err.message);
                }
            }

            Logger.network(`[IMPERVA-EXTRACT] Deleted ${deletedCount} cookies total`);

            // Send message to start extraction mode
            Logger.network('[IMPERVA-EXTRACT] Step 3: Sending message to background to start extraction...');
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
                Logger.network('[IMPERVA-EXTRACT] Step 4: Showing analyzing notification...');

                // Send message to background to show analyzing notification BEFORE reload
                await this.sendMessage({
                    type: 'IMPERVA_SHOW_ANALYZING_NOTIFICATION',
                    tabId: tab.id
                });

                Logger.network('[IMPERVA-EXTRACT] Step 5: Reloading page...');

                // Reload the page to trigger Imperva scripts
                await chrome.tabs.reload(tab.id);
                Logger.network('[IMPERVA-EXTRACT] Page reload initiated');

                // Show success notification
                NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Imperva'));
            } else {
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Invalid response from background');
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Expected: { status: "success" }');
                Logger.error('NETWORK', '[IMPERVA-EXTRACT] Received:', JSON.stringify(response));
                throw new Error(response?.error || 'Failed to enable extraction mode. Check background console for details.');
            }

            Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION STARTED ==========');
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Failed to start extraction:', error);
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error stack:', error.stack);
            NotificationHelper.error('Failed to start extraction: ' + error.message);
        }
    }

    /**
     * Parse script paths from captured data
     */
    parseScriptPaths(extractedData) {
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
    }

    /**
     * Generate parsing code for extracted data
     * @param {Object} extractedData - Extracted page data
     * @param {Object} scriptPaths - Script paths (utmvcScriptPath, reeseScriptPath, reeseSensorPath)
     * @param {String} exportType - Export type: 'all', 'reese84', or 'utmvc'
     */
    generateParsingCode(extractedData, scriptPaths, exportType = 'all') {
        const { utmvcScriptPath, reeseScriptPath, reeseSensorPath } = scriptPaths;
        const hostname = extractedData.hostname || 'example.com';

        // Filter based on export type
        const includeReese = exportType === 'all' || exportType === 'reese84';
        const includeUtmvc = exportType === 'all' || exportType === 'utmvc';

        const codes = {
            javascript: `// JavaScript - Imperva Script Path Parser
// This code extracts Imperva script paths from HTML

${includeReese && reeseScriptPath ? `
// Reese84 Script Detection
const reeseScriptRegex = /src\\s*=\\s*"((\\/[^\\/]+\\/\\d+)(?:\\?.*)?)"\\s/i;

function parseDynamicReeseScript(html, urlStr) {
    // Parse the URL to extract hostname
    let hostname;
    try {
        const parsedUrl = new URL(urlStr);
        hostname = parsedUrl.hostname;
    } catch (err) {
        throw new Error("Invalid URL");
    }

    // Verify this is an interruption page
    if (!html.includes("Pardon Our Interruption")) {
        throw new Error("Not an interruption page");
    }

    // Find the Reese script
    const matches = reeseScriptRegex.exec(html);
    if (!matches || matches.length < 3) {
        throw new Error("Reese script not found");
    }

    const scriptPath = matches[1];    // Full path: ${reeseScriptPath}
    const sensorPath = matches[2];    // Base path: ${reeseSensorPath}

    // Append the hostname to the sensor path
    return {
        sensorPath: \`\${sensorPath}?d=\${hostname}\`,
        scriptPath: scriptPath
    };
}

// Example usage:
const result = parseDynamicReeseScript(htmlContent, '${extractedData.url || 'https://example.com'}');
Logger.network('Sensor Path:', result.sensorPath);
Logger.network('Script Path:', result.scriptPath);
` : ''}

${includeUtmvc && utmvcScriptPath ? `
// UTMVC Script Detection
const utmvcScriptRegex = /(\\/_Incapsula_Resource\\?SWKMTFSR=1&e=[^"'\\s]*)/i;

function parseUtmvcScriptPath(input) {
    const result = utmvcScriptRegex.exec(input);
    if (result == null || result.length < 2) {
        return null;
    }
    return result[1];
}

// Generates a script path to post the generated ___utmvc cookie to
function generateUtmvcScriptPath() {
    return '/_Incapsula_Resource?SWKMTFSR=1&e=${Date.now()}';
}

// Example detected path:
const detectedPath = '${utmvcScriptPath}';
Logger.network('UTMVC Script Path:', detectedPath);
` : ''}

// Detected on: ${hostname}
// Captured at: ${new Date(extractedData.timestamp).toISOString()}`,

            python: `# Python - Imperva Script Path Parser
import re
from urllib.parse import urlparse
from datetime import datetime

${includeReese && reeseScriptPath ? `
# Reese84 Script Detection
reese_script_regex = re.compile(r'src\\s*=\\s*"((/[^/]+/\\d+)(?:\\?.*)?)"', re.IGNORECASE)

def parse_dynamic_reese_script(html: str, url_str: str) -> dict:
    """
    Parses the dynamic Reese script paths from the given HTML content.

    Args:
        html: The HTML content to parse
        url_str: The URL string to extract the hostname from

    Returns:
        dict: Contains 'sensor_path' and 'script_path'

    Raises:
        ValueError: If URL is invalid, page is not interruption page, or Reese script not found
    """
    # Parse the URL to extract hostname
    try:
        parsed_url = urlparse(url_str)
        hostname = parsed_url.hostname
    except Exception:
        raise ValueError("hyper: invalid URL")

    # Verify this is an interruption page
    if "Pardon Our Interruption" not in html:
        raise ValueError("hyper: not an interruption page")

    # Find the Reese script
    matches = reese_script_regex.search(html)
    if not matches:
        raise ValueError("hyper: reese script not found")

    script_path = matches.group(1)    # Full path: ${reeseScriptPath}
    sensor_path = matches.group(2)    # Base path: ${reeseSensorPath}

    # Append the hostname to the sensor path
    return {
        'sensor_path': f"{sensor_path}?d={hostname}",
        'script_path': script_path
    }

# Example usage:
result = parse_dynamic_reese_script(html_content, '${extractedData.url || 'https://example.com'}')
print(f"Sensor Path: {result['sensor_path']}")
print(f"Script Path: {result['script_path']}")
` : ''}

${includeUtmvc && utmvcScriptPath ? `
# UTMVC Script Detection
utmvc_script_regex = re.compile(r'(/_Incapsula_Resource\\?SWKMTFSR=1&e=[^"\'\\s]*)', re.IGNORECASE)

def parse_utmvc_script_path(input_str: str) -> str:
    """Parse UTMVC script path from HTML"""
    result = utmvc_script_regex.search(input_str)
    if result is None:
        return None
    return result.group(1)

def generate_utmvc_script_path() -> str:
    """Generates a script path to post the generated ___utmvc cookie to"""
    import time
    return f'/_Incapsula_Resource?SWKMTFSR=1&e={int(time.time() * 1000)}'

# Example detected path:
detected_path = '${utmvcScriptPath}'
print(f'UTMVC Script Path: {detected_path}')
` : ''}

# Detected on: ${hostname}
# Captured at: ${new Date(extractedData.timestamp).toISOString()}`,

            go: `package main

import (
    "errors"
    "fmt"
    "net/url"
    "regexp"
    "strings"
    "time"
)

${includeReese && reeseScriptPath ? `
// Reese84 Script Detection
var reeseScriptRegex = regexp.MustCompile(\`src\\s*=\\s*"((/[^/]+/\\d+)(?:\\?.*))"\`)

type ReeseScript struct {
    SensorPath string
    ScriptPath string
}

func parseDynamicReeseScript(html string, urlStr string) (*ReeseScript, error) {
    // Parse the URL to extract hostname
    parsedURL, err := url.Parse(urlStr)
    if err != nil {
        return nil, errors.New("hyper: invalid URL")
    }
    hostname := parsedURL.Hostname()

    // Verify this is an interruption page
    if !strings.Contains(html, "Pardon Our Interruption") {
        return nil, errors.New("hyper: not an interruption page")
    }

    // Find the Reese script
    matches := reeseScriptRegex.FindStringSubmatch(html)
    if len(matches) < 3 {
        return nil, errors.New("hyper: reese script not found")
    }

    scriptPath := matches[1] // Full path: ${reeseScriptPath}
    sensorPath := matches[2] // Base path: ${reeseSensorPath}

    // Append the hostname to the sensor path
    return &ReeseScript{
        SensorPath: fmt.Sprintf("%s?d=%s", sensorPath, hostname),
        ScriptPath: scriptPath,
    }, nil
}

// Example usage:
// result, err := parseDynamicReeseScript(htmlContent, "${extractedData.url || 'https://example.com'}")
// if err == nil {
//     fmt.Printf("Sensor Path: %s\\n", result.SensorPath)
//     fmt.Printf("Script Path: %s\\n", result.ScriptPath)
// }
` : ''}

${includeUtmvc && utmvcScriptPath ? `
// UTMVC Script Detection
var utmvcScriptRegex = regexp.MustCompile(\`(/_Incapsula_Resource\\?SWKMTFSR=1&e=[^"'\\s]*)\`)

func parseUtmvcScriptPath(input string) string {
    matches := utmvcScriptRegex.FindStringSubmatch(input)
    if len(matches) < 2 {
        return ""
    }
    return matches[1]
}

func generateUtmvcScriptPath() string {
    timestamp := time.Now().UnixMilli()
    return fmt.Sprintf("/_Incapsula_Resource?SWKMTFSR=1&e=%d", timestamp)
}

// Example detected path:
// const detectedPath = "${utmvcScriptPath}"
` : ''}

// Detected on: ${hostname}
// Captured at: ${new Date(extractedData.timestamp).toISOString()}`,

            php: `<?php
// PHP - Imperva Script Path Parser

${includeReese && reeseScriptPath ? `
// Reese84 Script Detection
function parseDynamicReeseScript($html, $urlStr) {
    /**
     * Parses the dynamic Reese script paths from the given HTML content.
     *
     * @param string $html The HTML content to parse
     * @param string $urlStr The URL string to extract the hostname from
     * @return array Contains 'sensor_path' and 'script_path'
     * @throws Exception If URL is invalid, page is not interruption page, or Reese script not found
     */

    // Parse the URL to extract hostname
    $parsedUrl = parse_url($urlStr);
    if (!$parsedUrl || !isset($parsedUrl['host'])) {
        throw new Exception("hyper: invalid URL");
    }
    $hostname = $parsedUrl['host'];

    // Verify this is an interruption page
    if (strpos($html, "Pardon Our Interruption") === false) {
        throw new Exception("hyper: not an interruption page");
    }

    // Find the Reese script using regex
    $pattern = '/src\\s*=\\s*"((\\/[^\\/]+\\/\\d+)(?:\\?.*)?)"/i';
    if (!preg_match($pattern, $html, $matches)) {
        throw new Exception("hyper: reese script not found");
    }

    $scriptPath = $matches[1];  // Full path: ${reeseScriptPath}
    $sensorPath = $matches[2];  // Base path: ${reeseSensorPath}

    // Append the hostname to the sensor path
    return [
        'sensor_path' => $sensorPath . '?d=' . $hostname,
        'script_path' => $scriptPath
    ];
}

// Example usage:
// $result = parseDynamicReeseScript($htmlContent, '${extractedData.url || 'https://example.com'}');
// echo "Sensor Path: " . $result['sensor_path'] . "\\n";
// echo "Script Path: " . $result['script_path'] . "\\n";
` : ''}

${includeUtmvc && utmvcScriptPath ? `
// UTMVC Script Detection
function parseUtmvcScriptPath($input) {
    /**
     * Parse UTMVC script path from HTML
     *
     * @param string $input The HTML content to parse
     * @return string|null The parsed UTMVC script path or null
     */
    $pattern = '/(\\/_Incapsula_Resource\\?SWKMTFSR=1&e=[^"\\'\\s]*)/i';
    if (preg_match($pattern, $input, $matches)) {
        return $matches[1];
    }
    return null;
}

function generateUtmvcScriptPath() {
    /**
     * Generates a script path to post the generated ___utmvc cookie to
     *
     * @return string The generated UTMVC script path
     */
    $timestamp = round(microtime(true) * 1000);
    return '/_Incapsula_Resource?SWKMTFSR=1&e=' . $timestamp;
}

// Example detected path:
// $detectedPath = '${utmvcScriptPath}';
// echo 'UTMVC Script Path: ' . $detectedPath . "\\n";
` : ''}

// Detected on: ${hostname}
// Captured at: ${new Date(extractedData.timestamp).toISOString()}
?>`,

            csharp: `// C# - Imperva Script Path Parser
using System;
using System.Text.RegularExpressions;

${includeReese && reeseScriptPath ? `
// Reese84 Script Detection
public class ReeseScript
{
    public string SensorPath { get; set; }
    public string ScriptPath { get; set; }
}

public static ReeseScript ParseDynamicReeseScript(string html, string urlStr)
{
    /**
     * Parses the dynamic Reese script paths from the given HTML content.
     *
     * @param html The HTML content to parse
     * @param urlStr The URL string to extract the hostname from
     * @return ReeseScript object containing sensor and script paths
     * @throws ArgumentException If URL is invalid, page is not interruption page, or Reese script not found
     */

    // Parse the URL to extract hostname
    Uri uri;
    try
    {
        uri = new Uri(urlStr);
    }
    catch (UriFormatException)
    {
        throw new ArgumentException("hyper: invalid URL");
    }
    string hostname = uri.Host;

    // Verify this is an interruption page
    if (!html.Contains("Pardon Our Interruption"))
    {
        throw new ArgumentException("hyper: not an interruption page");
    }

    // Find the Reese script using regex
    var regex = new Regex(@"src\\s*=\\s*""((\\/[^\\/]+\\/\\d+)(?:\\?.*))""", RegexOptions.IgnoreCase);
    var match = regex.Match(html);

    if (!match.Success || match.Groups.Count < 3)
    {
        throw new ArgumentException("hyper: reese script not found");
    }

    string scriptPath = match.Groups[1].Value;  // Full path: ${reeseScriptPath}
    string sensorPath = match.Groups[2].Value;  // Base path: ${reeseSensorPath}

    // Append the hostname to the sensor path
    return new ReeseScript
    {
        SensorPath = $"{sensorPath}?d={hostname}",
        ScriptPath = scriptPath
    };
}

// Example usage:
// var result = ParseDynamicReeseScript(htmlContent, "${extractedData.url || 'https://example.com'}");
// Console.WriteLine($"Sensor Path: {result.SensorPath}");
// Console.WriteLine($"Script Path: {result.ScriptPath}");
` : ''}

${includeUtmvc && utmvcScriptPath ? `
// UTMVC Script Detection
public static string ParseUtmvcScriptPath(string input)
{
    /**
     * Parse UTMVC script path from HTML
     *
     * @param input The HTML content to parse
     * @return The parsed UTMVC script path or null
     */
    var regex = new Regex(@"(\\/_Incapsula_Resource\\?SWKMTFSR=1&e=[^""'\\s]*)", RegexOptions.IgnoreCase);
    var match = regex.Match(input);

    if (match.Success)
    {
        return match.Groups[1].Value;
    }
    return null;
}

public static string GenerateUtmvcScriptPath()
{
    /**
     * Generates a script path to post the generated ___utmvc cookie to
     *
     * @return The generated UTMVC script path
     */
    long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    return $"/_Incapsula_Resource?SWKMTFSR=1&e={timestamp}";
}

// Example detected path:
// string detectedPath = "${utmvcScriptPath}";
// Console.WriteLine($"UTMVC Script Path: {detectedPath}");
` : ''}

// Detected on: ${hostname}
// Captured at: ${new Date(extractedData.timestamp).toISOString()}`
        };

        return codes;
    }

    /**
     * Display extraction results in a modal (Akamai-style design)
     */
    displayExtractionResults(extractedData) {
        Logger.network('[IMPERVA-EXTRACT] Displaying extraction results:', extractedData);

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const cookieData = extractedData.cookies || {};
        const hasCookies = cookieData.reese84 || cookieData.utmvc ||
                          (cookieData.incap_ses && cookieData.incap_ses.length > 0) ||
                          (cookieData.nlbi && cookieData.nlbi.length > 0) ||
                          (cookieData.visid && cookieData.visid.length > 0);

        // Parse script paths
        const scriptPaths = this.parseScriptPaths(extractedData);
        const hasScriptPaths = scriptPaths.utmvcScriptPath || scriptPaths.reeseScriptPath;

        // Generate parsing code if we have script paths
        const parsingCodes = hasScriptPaths ? this.generateParsingCode(extractedData, scriptPaths) : null;

        // Count relevant scripts
        const totalScripts = (extractedData.scriptUrls || []).length;
        const impervaScripts = [];
        const hostname = extractedData.hostname ? 'https://' + extractedData.hostname : '';
        if (scriptPaths.reeseScriptPath) impervaScripts.push({ type: 'Reese84', path: scriptPaths.reeseScriptPath, url: hostname + scriptPaths.reeseScriptPath });
        if (scriptPaths.utmvcScriptPath) impervaScripts.push({ type: 'UTMVC', path: scriptPaths.utmvcScriptPath, url: hostname + scriptPaths.utmvcScriptPath });

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Imperva Analysis</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Script URL:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${impervaScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Sensor URL:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${scriptPaths.reeseSensorPath ? 1 : 0}</span>
                    </div>
                </div>

                ${impervaScripts.length > 0 ? `
                    <!-- Imperva Scripts Section -->
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">IMPERVA SCRIPTS</h4>

                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">Script Analysis</span>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                            Found ${impervaScripts.length} relevant script(s)
                        </div>

                        ${impervaScripts.map((script, idx) => `
                            <div style="margin-bottom: ${idx < impervaScripts.length - 1 ? '16px' : '0'};">
                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">
                                    ${script.type} Script
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Script URL:</div>
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url || script.path)}" style="background: var(--bg-primary); border: 1px solid var(--primary); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="Click to copy">
                                        ${script.url || script.path}
                                    </div>
                                </div>
                                ${script.type === 'Reese84' && scriptPaths.reeseSensorPath ? `
                                    <div>
                                        <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Sensor Path:</div>
                                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml((extractedData.hostname ? 'https://' + extractedData.hostname : '') + scriptPaths.reeseSensorPath + '?d=' + extractedData.hostname)}" style="background: var(--bg-primary); border: 1px solid var(--border); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; line-height: 1.6; cursor: pointer; transition: background 0.2s;" title="Click to copy">
                                            ${extractedData.hostname ? 'https://' + extractedData.hostname : ''}${scriptPaths.reeseSensorPath}?d=${extractedData.hostname}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${hasScriptPaths ? `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <button class="export-code-btn modal-export-code-btn">
                            Export Code
                        </button>
                    </div>
                ` : ''}

                ${impervaScripts.length === 0 ? `
                    <div style="text-align: center; padding: 48px 16px; opacity: 0.7;">
                        <div style="font-size: 16px; color: var(--text-primary); margin-bottom: 8px;">No scripts detected</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">Imperva may not be present on this page</div>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Fade in animation
        setTimeout(() => modal.style.opacity = '1', 10);

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) {
                    return;
                }
                AdvancedUtils.copyToClipboard(textToCopy, element, {
                    notificationMessage: 'Value copied'
                });
            });
        });

        // Event listeners
        modal.querySelectorAll('.advanced-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Export Code button
        if (parsingCodes) {
            const exportBtn = modal.querySelector('.export-code-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    this.displayExportCodeModal(parsingCodes, scriptPaths, extractedData);
                });
            }
        }

        // Show success notification
        const scriptCount = (scripts || []).length;
        NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(scriptCount));
    }

    /**
     * Display export code in a separate modal (Akamai-style)
     */
    displayExportCodeModal(parsingCodes, scriptPaths, extractedData) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal export-code-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.2s;';

        const hostname = extractedData.hostname || 'example.com';
        const hasReese84 = !!scriptPaths.reeseScriptPath;
        const hasUtmvc = !!scriptPaths.utmvcScriptPath;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 85vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600;">Script Parsing Code Generator</h3>
                    </div>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Export Options -->
                <div style="margin-bottom: 16px;">
                    <div style="color: var(--text-primary); font-size: 13px; font-weight: 600; margin-bottom: 8px;">Export Options</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${(hasReese84 && hasUtmvc) ? `
                            <button class="export-option-btn" data-option="all" style="padding: 8px 16px; background: #1976D2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">All Types</button>
                        ` : ''}
                        ${hasReese84 ? `
                            <button class="export-option-btn" data-option="reese84" style="padding: 8px 16px; background: ${(hasReese84 && hasUtmvc) ? 'var(--bg-tertiary)' : '#1976D2'}; color: ${(hasReese84 && hasUtmvc) ? 'var(--text-secondary)' : 'white'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Reese84 Only</button>
                        ` : ''}
                        ${hasUtmvc ? `
                            <button class="export-option-btn" data-option="utmvc" style="padding: 8px 16px; background: ${(hasReese84 && hasUtmvc) ? 'var(--bg-tertiary)' : '#1976D2'}; color: ${(hasReese84 && hasUtmvc) ? 'var(--text-secondary)' : 'white'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">UTMVC Only</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
                    <button class="code-tab-btn" data-lang="javascript" style="padding: 8px 14px; background: #1976D2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">JavaScript</button>
                    <button class="code-tab-btn" data-lang="python" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Python</button>
                    <button class="code-tab-btn" data-lang="nodejs" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Node.js</button>
                    <button class="code-tab-btn" data-lang="php" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">PHP</button>
                    <button class="code-tab-btn" data-lang="csharp" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">C#</button>
                    <button class="code-tab-btn" data-lang="go" style="padding: 8px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Go</button>
                </div>

                <!-- Code Display -->
                <div style="position: relative; margin-bottom: 12px;">
                    <div class="code-content" data-lang="javascript" style="display: block;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.javascript)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="javascript" style="position: absolute; top: 10px; right: 10px; padding: 4px 10px; font-size: 11px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="python" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.python)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="python" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="nodejs" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.javascript)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="nodejs" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="php" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.php)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="php" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="csharp" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.csharp)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="csharp" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                    <div class="code-content" data-lang="go" style="display: none;">
                        <div style="position: relative;">
                            <pre style="background: #1E1E1E; padding: 16px; border-radius: 4px; overflow-x: auto; margin: 0; max-height: 400px;"><code style="color: #D4D4D4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 11px; line-height: 1.5;">${this.escapeHtml(parsingCodes.go)}</code></pre>
                            <button class="copy-code-btn advanced-modal-copy-btn" data-lang="go" style="position: absolute; top: 10px; right: 10px;">Copy Code</button>
                        </div>
                    </div>
                </div>

                <!-- Browser Console Note -->
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px;">
                    <span style="font-size: 14px;"></span>
                    <span style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">Browser console code for intercepting and parsing Imperva scripts</span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Fade in animation
        setTimeout(() => modal.style.opacity = '1', 10);

        // Event listeners
        modal.querySelectorAll('.advanced-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Export Options toggle (if present)
        modal.querySelectorAll('.export-option-btn').forEach(optionBtn => {
            optionBtn.addEventListener('click', () => {
                const option = optionBtn.getAttribute('data-option');

                // Update button styles
                modal.querySelectorAll('.export-option-btn').forEach(btn => {
                    if (btn.getAttribute('data-option') === option) {
                        btn.style.background = '#1976D2';
                        btn.style.color = 'white';
                    } else {
                        btn.style.background = 'var(--bg-tertiary)';
                        btn.style.color = 'var(--text-secondary)';
                    }
                });

                // Regenerate code with selected export type
                const filteredCodes = this.generateParsingCode(extractedData, scriptPaths, option);

                // Update all code displays
                Object.entries(filteredCodes).forEach(([lang, code]) => {
                    const codeContent = modal.querySelector(`.code-content[data-lang="${lang}"] pre code`);
                    if (codeContent) {
                        codeContent.textContent = code;
                    }
                });
            });
        });

        // Code tab switching
        modal.querySelectorAll('.code-tab-btn').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                const lang = tabBtn.getAttribute('data-lang');

                // Update tab styles
                modal.querySelectorAll('.code-tab-btn').forEach(btn => {
                    if (btn.getAttribute('data-lang') === lang) {
                        btn.style.background = '#1976D2';
                        btn.style.color = 'white';
                    } else {
                        btn.style.background = 'var(--bg-tertiary)';
                        btn.style.color = 'var(--text-secondary)';
                    }
                });

                // Show/hide code content
                modal.querySelectorAll('.code-content').forEach(content => {
                    content.style.display = content.getAttribute('data-lang') === lang ? 'block' : 'none';
                });
            });
        });

        // Copy code buttons
        modal.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');

                let code;
                if (lang === 'nodejs') {
                    code = parsingCodes.javascript;
                } else if (parsingCodes[lang]) {
                    code = parsingCodes[lang];
                } else {
                    code = parsingCodes.javascript;
                }

                AdvancedUtils.copyToClipboard(code, btn, {
                    notificationMessage: 'Code copied'
                });
            });
        });
    }

    /**
     * Escape HTML for safe display in code blocks
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Display cookies modal (Imperva-specific UI)
     */
    displayCookiesModal(foundCookies, cookieStatus, protectionLevel) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Imperva Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Protection Level:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${protectionLevel}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCookies.length}</span>
                    </div>
                </div>

                ${foundCookies.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">No Imperva cookies found</div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${foundCookies.map(cookie => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.name)}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${cookie.name}</div>
                                    <div style="display: flex; gap: 6px;">
                                        ${cookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                        ${cookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                    </div>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.value || 'N/A')}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${cookie.value ? cookie.value.substring(0, 60) : 'N/A'}${cookie.value && cookie.value.length > 60 ? '...' : ''}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cookie.domain}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(modal);

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) {
                    return;
                }
                AdvancedUtils.copyToClipboard(textToCopy, element, {
                    notificationMessage: 'Value copied'
                });
            });
        });

        modal.querySelectorAll('.advanced-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImpervaAdvanced;
} else if (typeof window !== 'undefined') {
    window.ImpervaAdvanced = ImpervaAdvanced;
}
