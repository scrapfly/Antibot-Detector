    /**
     * Check Imperva cookies using BaseInterceptorHelpers
     */
ImpervaAdvanced.prototype.checkCookies = async function() {
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
    };


    /**
     * Extract Scripts - Delete cookies and capture challenge/solution data
     */
ImpervaAdvanced.prototype.extractScripts = async function() {
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


    /**
     * Generate parsing code for extracted data
     * @param {Object} extractedData - Extracted page data
     * @param {Object} scriptPaths - Script paths (utmvcScriptPath, reeseScriptPath, reeseSensorPath)
     * @param {String} exportType - Export type: 'all', 'reese84', or 'utmvc'
     */
ImpervaAdvanced.prototype.generateParsingCode = function(extractedData, scriptPaths, exportType = 'all') {
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
    };


