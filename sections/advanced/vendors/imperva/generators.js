/** Standalone code templates for this vendor. */
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
console.log('Sensor Path:', result.sensorPath);
console.log('Script Path:', result.scriptPath);
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
console.log('UTMVC Script Path:', detectedPath);
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


