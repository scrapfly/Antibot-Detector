/**
 * akamai-advanced-actions.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */



    /**
     * Analyze page content for Akamai scripts and patterns
     */
AkamaiAdvanced.prototype.analyzeContent = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            NotificationHelper.info('Reloading page to analyze Akamai data...');

            // Send message to background to show analyzing notification BEFORE reload
            await this.sendMessage({
                type: 'AKAMAI_SHOW_ANALYZING_NOTIFICATION',
                tabId: this.tabInfo.id
            });

            // Reload the page
            await chrome.tabs.reload(this.tabInfo.id);

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get cookies
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');
            const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');
            const bmSzCookie = cookies.find(c => c.name === 'bm_sz');

            // Analyze page content and parse scripts
            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const htmlContent = document.documentElement.outerHTML;
                    const analysis = {
                        scripts: [],
                        sensorElements: [],
                        sensorDataUrls: [],
                        sbsdUrls: [],
                        patterns: {
                            bmak: false,
                            sensorData: false,
                            pixelChallenge: false,
                            abckVariable: false,
                            secCpt: false
                        },
                        scriptCount: 0,
                        requiresSecCpt: false,
                        requiresPixel: false,
                        akamaiScriptPath: null,
                        pixelHtmlVar: null,
                        pixelScriptUrls: null,
                        pixelScriptVar: null,
                        parsingCode: null
                    };

                    // Detect sec_cpt challenge
                    analysis.requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');
                    if (analysis.requiresSecCpt) {
                        analysis.patterns.secCpt = true;
                    }

                    // Parse Akamai script path
                    const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
                    if (scriptMatch && scriptMatch[1]) {
                        // Convert relative path to full URL
                        const scriptPath = scriptMatch[1];
                        const pageUrl = window.location.origin;
                        analysis.akamaiScriptPath = pageUrl + scriptPath;
                    }

                    // Parse pixel HTML variable
                    const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
                    if (pixelVarMatch && pixelVarMatch[1]) {
                        analysis.requiresPixel = true;
                        analysis.patterns.pixelChallenge = true;
                        analysis.pixelHtmlVar = parseInt(pixelVarMatch[1]);
                    }

                    // Parse pixel script URL
                    const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
                    if (pixelUrlMatch && pixelUrlMatch[1]) {
                        const scriptUrl = pixelUrlMatch[1];
                        const parts = scriptUrl.split("/");
                        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                        const postUrl = parts.join("/");
                        analysis.pixelScriptUrls = { scriptUrl, postUrl };
                    }

                    // Check all script tags
                    const scripts = Array.from(document.querySelectorAll('script'));
                    analysis.scriptCount = scripts.length;

                    scripts.forEach(script => {
                        const content = script.textContent;
                        const src = script.src;

                        // Check for Akamai patterns in script content
                        if (content) {
                            if (content.includes('bmak.')) {
                                analysis.patterns.bmak = true;
                            }
                            if (content.includes('sensor_data')) {
                                analysis.patterns.sensorData = true;
                            }
                            if (content.includes('bazadebezolkohpepadr')) {
                                analysis.patterns.pixelChallenge = true;
                            }
                            if (content.includes('_abck')) {
                                analysis.patterns.abckVariable = true;
                            }

                            // Parse pixel script variable
                            if (!analysis.pixelScriptVar) {
                                const indexMatch = /g=_\[(\d+)]/.exec(content);
                                if (indexMatch && indexMatch[1]) {
                                    const index = parseInt(indexMatch[1]);
                                    const arrayMatch = /var _=\[(.+?)];/.exec(content);
                                    if (arrayMatch && arrayMatch[1]) {
                                        const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                                        if (rawStrings && index < rawStrings.length) {
                                            analysis.pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                                        }
                                    }
                                }
                            }

                            // Store script info if it contains specific Akamai patterns (pixel, sensor, sbsd only)
                            const hasPixelPattern = content.includes('bazadebezolkohpepadr') || content.includes('pixel_') || /g=_\[\d+\]/.test(content);
                            const hasSensorPattern = content.includes('sensor_data') || content.includes('bmak.');
                            const hasSbsdPattern = content.includes('.well-known/sbsd') || content.includes('sbsd');

                            if (hasPixelPattern || hasSensorPattern || hasSbsdPattern) {
                                const scriptInfo = {
                                    type: 'inline',
                                    length: content.length,
                                    categories: []
                                };

                                if (hasPixelPattern) scriptInfo.categories.push('pixel');
                                if (hasSensorPattern) scriptInfo.categories.push('sensor');
                                if (hasSbsdPattern) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Check script sources for specific patterns only
                        if (src) {
                            const hasPixelUrl = src.includes('pixel_') || /\/akam\/\d+\/\w+/.test(src);
                            const hasSensorUrl = src.includes('sensor_data') || src.includes('/akam/');
                            const hasSbsdUrl = src.includes('.well-known/sbsd');

                            if (hasPixelUrl || hasSensorUrl || hasSbsdUrl) {
                                const scriptInfo = {
                                    type: 'external',
                                    src: src,
                                    categories: []
                                };

                                if (hasPixelUrl) scriptInfo.categories.push('pixel');
                                if (hasSensorUrl) scriptInfo.categories.push('sensor');
                                if (hasSbsdUrl) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Detect sensor_data URLs in script content
                        if (content) {
                            // Look for common Akamai endpoint patterns
                            const urlPatterns = [
                                /(?:https?:)?\/\/[^"'\s]+\/akam\/[^"'\s]+/g,
                                /(?:https?:)?\/\/[^"'\s]+akamai[^"'\s]+/g,
                                /['"]([^'"]*sensor_data[^'"]*)['"]/g,
                                /['"]([^'"]*\/pixel_[^'"]*)['"]/g
                            ];

                            urlPatterns.forEach(pattern => {
                                const matches = content.match(pattern);
                                if (matches) {
                                    matches.forEach(match => {
                                        const cleanUrl = match.replace(/['"]/g, '');
                                        if (!analysis.sensorDataUrls.includes(cleanUrl)) {
                                            analysis.sensorDataUrls.push(cleanUrl);
                                        }
                                    });
                                }
                            });
                        }
                    });

                    // Extract SBSD URLs from scripts with 'sbsd' category
                    analysis.scripts.forEach(script => {
                        if (script.categories && script.categories.includes('sbsd') && script.src) {
                            if (!analysis.sbsdUrls.includes(script.src)) {
                                analysis.sbsdUrls.push(script.src);
                            }
                        }
                    });

                    // Generate parsing code if sensor_data URLs found
                    if (analysis.sensorDataUrls.length > 0 || analysis.patterns.sensorData || analysis.akamaiScriptPath) {
                        const scriptPath = analysis.akamaiScriptPath || '/akam/example/path';
                        const sampleUrls = analysis.sensorDataUrls.length > 0 ? analysis.sensorDataUrls : ['https://example.com/akam/endpoint'];

                        analysis.parsingCodes = {
                            javascript: `// JavaScript - Browser Interceptor
// This code intercepts Akamai requests in the browser

// Method 1: Intercept Fetch API
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && (url.includes('/akam/') || url.includes('sensor_data'))) {
        Logger.network('[Akamai] Intercepted fetch to:', url);

        return originalFetch.apply(this, args).then(response => {
            const clonedResponse = response.clone();
            clonedResponse.text().then(body => {
                Logger.network('[Akamai] Response body:', body);
                // Parse sensor_data from response
                if (body.includes('sensor_data')) {
                    const match = body.match(/sensor_data[=:]\\s*([a-zA-Z0-9+/=]+)/);
                    if (match) Logger.network('[Akamai] sensor_data:', match[1]);
                }
            });
            return response;
        });
    }
    return originalFetch.apply(this, args);
};

// Method 2: Extract Script Path from HTML
const scriptPath = '${scriptPath}';
Logger.network('[Akamai] Script path detected:', scriptPath);

// Method 3: Monitor XHR requests
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url.includes('/akam/') || url.includes('sensor_data')) {
        Logger.network('[Akamai] XHR to:', url);
    }
    return originalOpen.apply(this, [method, url, ...args]);
};`,

                            python: `# Python - Web Scraping & HTTP Requests
import requests
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

def extract_akamai_data(url):
    """Extract Akamai script paths and sensor_data from a website"""

    # Get the page
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    response = session.get(url)
    html = response.text

    # Parse with BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')

    # Method 1: Extract Akamai script path
    script_pattern = r'<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>'
    script_match = re.search(script_pattern, html, re.IGNORECASE)
    if script_match:
        script_path = script_match.group(1)
        print(f'[Akamai] Script path: {script_path}')

    # Method 2: Find sensor_data URLs in scripts
    script_tags = soup.find_all('script')
    for script in script_tags:
        if script.string:
            # Look for Akamai endpoints
            url_patterns = [
                r'(?:https?:)?//[^"\'\\s]+/akam/[^"\'\\s]+',
                r'["\']([^"\']*sensor_data[^"\']*)["\']',
                r'["\']([^"\']*pixel_[^"\']*)["\']'
            ]

            for pattern in url_patterns:
                matches = re.findall(pattern, script.string)
                for match in matches:
                    print(f'[Akamai] Found URL: {match}')

    # Method 3: Monitor network requests (requires additional setup)
    # Use mitmproxy, selenium, or requests-html for dynamic content

    return {
        'script_path': script_match.group(1) if script_match else None,
        'found_urls': [${sampleUrls.map(url => `'${url}'`).join(', ')}]
    }

# Usage example
if __name__ == "__main__":
    url = "https://example.com"
    data = extract_akamai_data(url)
    print("Extracted data:", data)`,

                            nodejs: `// Node.js - Server-side parsing
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function extractAkamaiData(url) {
    try {
        // Fetch the page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        // Method 1: Extract Akamai script path
        const scriptRegex = /<script type="text\\/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d\\/\\-_]+)"><\\/script>/i;
        const scriptMatch = html.match(scriptRegex);

        if (scriptMatch) {
            Logger.network('[Akamai] Script path:', scriptMatch[1]);
        }

        // Method 2: Find URLs in script content
        const foundUrls = [];
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content) {
                // Look for Akamai patterns
                const patterns = [
                    /(?:https?:)?\\/\\/[^"'\\s]+\\/akam\\/[^"'\\s]+/g,
                    /["']([^"']*sensor_data[^"']*)["']/g,
                    /["']([^"']*pixel_[^"']*)["']/g
                ];

                patterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const cleanUrl = match.replace(/["']/g, '');
                            if (!foundUrls.includes(cleanUrl)) {
                                foundUrls.push(cleanUrl);
                                Logger.network('[Akamai] Found URL:', cleanUrl);
                            }
                        });
                    }
                });
            }
        });

        return {
            scriptPath: scriptMatch ? scriptMatch[1] : null,
            foundUrls: foundUrls,
            detectedPath: '${scriptPath}'
        };

    } catch (error) {
        Logger.error('NETWORK', 'Error:', error);
        return null;
    }
}

// Usage
extractAkamaiData('https://example.com')
    .then(data => Logger.network('Result:', data));`,

                            php: `<?php
// PHP - Server-side Akamai detection

function extractAkamaiData($url) {
    // Initialize cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo "HTTP Error: $httpCode\\n";
        return null;
    }

    // Method 1: Extract Akamai script path
    $scriptPattern = '/<script type="text\\/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d\\/\\-_]+)"><\\/script>/i';
    if (preg_match($scriptPattern, $html, $matches)) {
        echo "[Akamai] Script path: " . $matches[1] . "\\n";
        $scriptPath = $matches[1];
    } else {
        $scriptPath = null;
    }

    // Method 2: Find sensor_data URLs
    $foundUrls = [];
    $patterns = [
        '/(?:https?:)?\\/\\/[^"\'\\s]+\\/akam\\/[^"\'\\s]+/',
        '/["\']([^"\']*sensor_data[^"\']*)["\']/',
        '/["\']([^"\']*pixel_[^"\']*)["\']/'
    ];

    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $html, $matches)) {
            foreach ($matches[0] as $match) {
                $cleanUrl = trim($match, '"\\'');
                if (!in_array($cleanUrl, $foundUrls)) {
                    $foundUrls[] = $cleanUrl;
                    echo "[Akamai] Found URL: $cleanUrl\\n";
                }
            }
        }
    }

    // Method 3: Parse with DOMDocument for more complex extraction
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // Find script tags
    $scripts = $xpath->query('//script');
    foreach ($scripts as $script) {
        $content = $script->textContent;
        if (strpos($content, 'sensor_data') !== false || strpos($content, 'akam') !== false) {
            echo "[Akamai] Found Akamai content in script\\n";
        }
    }

    return [
        'script_path' => $scriptPath,
        'found_urls' => $foundUrls,
        'detected_path' => '${scriptPath}'
    ];
}

// Usage
$url = 'https://example.com';
$data = extractAkamaiData($url);
print_r($data);
?>`,

                            go: `package main

import (
    "fmt"
    "io"
    "net/http"
    "regexp"
    "strings"
)

func extractAkamaiData(url string) (map[string]interface{}, error) {
    // Create HTTP client
    client := &http.Client{}

    // Create request
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    // Set User-Agent
    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    // Make request
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    // Read response
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    html := string(body)

    // Method 1: Extract Akamai script path
    scriptRegex := regexp.MustCompile(\`<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>\`)
    scriptMatch := scriptRegex.FindStringSubmatch(html)

    var scriptPath string
    if len(scriptMatch) > 1 {
        scriptPath = scriptMatch[1]
        fmt.Printf("[Akamai] Script path: %s\\n", scriptPath)
    }

    // Method 2: Find sensor_data URLs
    var foundUrls []string
    patterns := []string{
        \`(?:https?:)?//[^"'\\s]+/akam/[^"'\\s]+\`,
        \`["']([^"']*sensor_data[^"']*)['"]\`,
        \`["']([^"']*pixel_[^"']*)['"]\`,
    }

    for _, pattern := range patterns {
        regex := regexp.MustCompile(pattern)
        matches := regex.FindAllString(html, -1)

        for _, match := range matches {
            cleanUrl := strings.Trim(match, "\\"'")
            // Check if URL already exists
            exists := false
            for _, existing := range foundUrls {
                if existing == cleanUrl {
                    exists = true
                    break
                }
            }
            if !exists {
                foundUrls = append(foundUrls, cleanUrl)
                fmt.Printf("[Akamai] Found URL: %s\\n", cleanUrl)
            }
        }
    }

    return map[string]interface{}{
        "script_path":   scriptPath,
        "found_urls":    foundUrls,
        "detected_path": "${scriptPath}",
    }, nil
}

func main() {
    url := "https://example.com"
    data, err := extractAkamaiData(url)
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
        return
    }

    fmt.Printf("Result: %+v\\n", data)
}`,

                            csharp: `// C# - Akamai Script Parser
using System;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

public class AkamaiParser
{
    private static readonly HttpClient client = new HttpClient();

    public static async Task ParseAkamaiScripts(string url)
    {
        client.DefaultRequestHeaders.Clear();
        client.DefaultRequestHeaders.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

        var content = await client.GetStringAsync(url);

        // Extract Akamai script path
        var scriptMatch = Regex.Match(content,
            @"<script type=""text/javascript""(?:\\s*nonce=""[^""]*"")?\\s*src=""([a-z\\d/\\-_]+)""></script>");
        if (scriptMatch.Success)
        {
            Console.WriteLine($"[Akamai] Script path: {scriptMatch.Groups[1].Value}");
        }

        // Extract Akamai URLs
        var urlMatches = Regex.Matches(content, @"(?:https?:)?//[^""'\\s]+/akam/[^""'\\s]+");
        foreach (Match match in urlMatches)
        {
            Console.WriteLine($"[Akamai] URL: {match.Value}");
        }

        // Find sensor_data patterns
        var sensorMatches = Regex.Matches(content, @"sensor_data[^""'\\s]*");
        foreach (Match match in sensorMatches)
        {
            Console.WriteLine($"[Akamai] Sensor: {match.Value}");
        }
    }

    public static async Task Main(string[] args)
    {
        await ParseAkamaiScripts("https://example.com");
    }
}`,

                            go: `// Go - Akamai Script Parser
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "regexp"
)

func parseAkamaiScripts(url string) error {
    client := &http.Client{}
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return err
    }

    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return err
    }

    content := string(body)

    // Extract Akamai script path
    scriptRegex := regexp.MustCompile(\`<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>\`)
    if match := scriptRegex.FindStringSubmatch(content); len(match) > 1 {
        fmt.Printf("[Akamai] Script path: %s\\n", match[1])
    }

    // Extract Akamai URLs
    urlRegex := regexp.MustCompile(\`(?:https?:)?//[^"'\\s]+/akam/[^"'\\s]+\`)
    urlMatches := urlRegex.FindAllString(content, -1)
    for _, match := range urlMatches {
        fmt.Printf("[Akamai] URL: %s\\n", match)
    }

    // Find sensor_data patterns
    sensorRegex := regexp.MustCompile(\`sensor_data[^"'\\s]*\`)
    sensorMatches := sensorRegex.FindAllString(content, -1)
    for _, match := range sensorMatches {
        fmt.Printf("[Akamai] Sensor: %s\\n", match)
    }

    return nil
}

func main() {
    if err := parseAkamaiScripts("https://example.com"); err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
}`
                        };
                    }

                    // Check for sensor elements
                    const sensorSelectors = ['#akam-sensor', '.bm-sensor-container', '[data-akamai]'];
                    sensorSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            analysis.sensorElements.push({
                                selector: selector,
                                count: elements.length
                            });
                        }
                    });

                    return analysis;
                }
            });

            if (results && results[0] && results[0].result) {
                const analysis = results[0].result;

                // Add cookie data to analysis
                analysis.cookies = {
                    _abck: abckCookie,
                    sbsd: sbsdCookie,
                    sbsd_o: sbsdOCookie,
                    ak_bmsc: akBmscCookie,
                    bm_sz: bmSzCookie
                };

                // Check Easy Mode
                analysis.isEasyMode = abckCookie && abckCookie.value.includes('~0~');
                analysis.requiresSbsd = !!(sbsdCookie || sbsdOCookie);

                // Console log all captured data
                Logger.network('[Akamai Debug] ========== ANALYZE CONTENT - FULL DATA ==========');
                Logger.network('[Akamai Debug] COOKIES:');
                Logger.network('[Akamai Debug]   _abck:', abckCookie ? {
                    value: abckCookie.value,
                    length: abckCookie.value.length,
                    domain: abckCookie.domain
                } : 'NOT FOUND');
                Logger.network('[Akamai Debug]   sbsd:', sbsdCookie ? sbsdCookie.value : 'NOT FOUND');
                Logger.network('[Akamai Debug]   sbsd_o:', sbsdOCookie ? sbsdOCookie.value : 'NOT FOUND');
                Logger.network('[Akamai Debug]   ak_bmsc:', akBmscCookie ? 'FOUND' : 'NOT FOUND');
                Logger.network('[Akamai Debug]   bm_sz:', bmSzCookie ? 'FOUND' : 'NOT FOUND');

                Logger.network('[Akamai Debug] MODE DETECTION:');
                Logger.network('[Akamai Debug]   Easy Mode:', analysis.isEasyMode);
                Logger.network('[Akamai Debug]   SBSD Required:', analysis.requiresSbsd);
                Logger.network('[Akamai Debug]   sec_cpt Required:', analysis.requiresSecCpt);
                Logger.network('[Akamai Debug]   Pixel Challenge:', analysis.requiresPixel);

                Logger.network('[Akamai Debug] PIXEL CHALLENGE DATA:');
                Logger.network('[Akamai Debug]   HTML Var (bazadebezolkohpepadr):', analysis.pixelHtmlVar || 'NOT FOUND');
                Logger.network('[Akamai Debug]   Script URL:', analysis.pixelScriptUrls?.scriptUrl || 'NOT FOUND');
                Logger.network('[Akamai Debug]   Post URL:', analysis.pixelScriptUrls?.postUrl || 'NOT FOUND');
                Logger.network('[Akamai Debug]   Script Var:', analysis.pixelScriptVar || 'NOT FOUND');

                Logger.network('[Akamai Debug] SCRIPTS:');
                Logger.network('[Akamai Debug]   Total Scripts:', analysis.scriptCount);
                Logger.network('[Akamai Debug]   Akamai Scripts:', analysis.scripts.length);
                Logger.network('[Akamai Debug]   Script Path:', analysis.akamaiScriptPath || 'NOT FOUND');

                Logger.network('[Akamai Debug] DETECTED PATTERNS:');
                Logger.network('[Akamai Debug]   bmak API:', analysis.patterns.bmak);
                Logger.network('[Akamai Debug]   sensor_data:', analysis.patterns.sensorData);
                Logger.network('[Akamai Debug]   _abck variable:', analysis.patterns.abckVariable);
                Logger.network('[Akamai Debug]   Pixel in content:', analysis.patterns.pixelChallenge);
                Logger.network('[Akamai Debug]   sec_cpt in content:', analysis.patterns.secCpt);

                Logger.network('[Akamai Debug] SENSOR ELEMENTS:', analysis.sensorElements.length > 0 ? analysis.sensorElements : 'NONE FOUND');

                Logger.network('[Akamai Debug] SENSOR DATA URLS:');
                if (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) {
                    analysis.sensorDataUrls.forEach((url, idx) => {
                        Logger.network(`[Akamai Debug]   ${idx + 1}. ${url}`);
                    });
                } else {
                    Logger.network('[Akamai Debug]   NONE FOUND');
                }

                if (analysis.parsingCodes) {
                    Logger.network('[Akamai Debug] MULTI-LANGUAGE PARSING CODE GENERATED');
                    Logger.network('[Akamai Debug] Available languages: JavaScript, Python, Node.js, PHP, C#, Go');
                    Logger.network('[Akamai Debug] JavaScript (Browser):');
                    Logger.network(analysis.parsingCodes.javascript);
                    Logger.network('[Akamai Debug] Python (Requests + BeautifulSoup):');
                    Logger.network(analysis.parsingCodes.python);
                }

                Logger.network('[Akamai Debug] ========================================');

                this.displayAnalysisModal(analysis);
            }
        } catch (error) {
            Logger.error('NETWORK', 'Failed to analyze content:', error);
            NotificationHelper.error('Failed to analyze content: ' + error.message);
        }
    };



    /**
     * Generate parsing code for specific script types
     */
AkamaiAdvanced.prototype.generateScriptParsingCode = function(scriptCategories) {
        const hasPixel = scriptCategories.pixel.length > 0;
        const hasSensor = scriptCategories.sensor.length > 0;
        const hasSensorUrl = scriptCategories.sensorUrl.length > 0;
        const hasSbsd = scriptCategories.sbsd.length > 0;

        return {
            javascript: `// Akamai Script Parser - JavaScript
// Parse ${hasPixel ? 'Pixel Challenge, ' : ''}${hasSensor ? 'Sensor Data, ' : ''}${hasSensorUrl ? 'Sensor URLs, ' : ''}${hasSbsd ? 'SBSD Challenge' : ''} scripts

function parseAkamaiScripts() {
    const results = {
        pixel: {},
        sensor: {},
        sensorUrl: {},
        sbsd: {}
    };

    // Get all script elements
    const scripts = document.querySelectorAll('script');

    scripts.forEach((script, index) => {
        const content = script.textContent || script.innerHTML;
        const src = script.src;

        Logger.network(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if (content.includes('bazadebezolkohpepadr') || content.includes('pixel_')) {
            // Extract pixel HTML variable
            const pixelVar = content.match(/bazadebezolkohpepadr="(\\d+)"/);
            if (pixelVar) results.pixel.htmlVar = parseInt(pixelVar[1]);

            // Extract pixel script variable using provided TypeScript parsers
            const indexMatch = content.match(/g=_\\[(\\d+)\\]/);
            if (indexMatch) {
                const index = parseInt(indexMatch[1]);
                const arrayMatch = content.match(/var _=\\[([^\\]]+)\\]/);
                if (arrayMatch) {
                    const strings = arrayMatch[1].match(/"[^"]*"/g);
                    if (strings && index < strings.length) {
                        results.pixel.scriptVar = strings[index].replace(/^"|"$/g, "");
                    }
                }
            }

            // Extract pixel script URL
            const urlMatch = content.match(/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/);
            if (urlMatch) {
                results.pixel.scriptUrl = urlMatch[1];
                const parts = urlMatch[1].split("/");
                parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                results.pixel.postUrl = parts.join("/");
            }

            Logger.network('[Pixel Challenge]', results.pixel);
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if (content.includes('sensor_data') || content.includes('bmak.')) {
            // Extract sensor_data from various patterns
            const patterns = [
                /"sensor_data"\\s*:\\s*"([^"]+)"/,
                /sensor_data\\s*=\\s*["']([^"']+)["']/,
                /sensor_data["'\\s:=]+["']?([a-zA-Z0-9+/=]+)["']?/
            ];

            patterns.forEach((pattern, i) => {
                const match = content.match(pattern);
                if (match && match[1]) {
                    results.sensor[\`pattern_\${i + 1}\`] = match[1];
                    Logger.network(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
                }
            });

            // Extract bmak API calls
            if (content.includes('bmak.')) {
                const bmakCalls = content.match(/bmak\\.[a-zA-Z_]+/g);
                if (bmakCalls) results.sensor.bmakCalls = [...new Set(bmakCalls)];
            }
        }` : ''}

        ${hasSensorUrl ? `
        // Parse Sensor Data URLs
        const sensorUrls = [${scriptCategories.sensorUrl.map(script => `'${script.url}'`).join(', ')}];

        sensorUrls.forEach((url, index) => {
            Logger.network(\`[Sensor URL \${index + 1}]\`, url);

            // Extract domain and path information
            try {
                const urlObj = new URL(url);
                results.sensorUrl[\`url_\${index + 1}\`] = {
                    full: url,
                    domain: urlObj.hostname,
                    path: urlObj.pathname,
                    searchParams: urlObj.searchParams.toString()
                };

                // Try to fetch endpoint info (if same origin)
                if (urlObj.hostname === window.location.hostname) {
                    fetch(url, { method: 'HEAD' })
                        .then(response => {
                            Logger.network(\`[Sensor URL \${index + 1} Response]\`, response.status, response.statusText);
                        })
                        .catch(err => Logger.network(\`[Sensor URL \${index + 1} Error]\`, err.message));
                }
            } catch (e) {
                Logger.network(\`[Sensor URL \${index + 1} Parse Error]\`, e.message);
                results.sensorUrl[\`url_\${index + 1}\`] = { full: url, error: e.message };
            }
        });` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if (content.includes('.well-known/sbsd') || content.includes('sbsd')) {
            // Extract SBSD URLs
            const sbsdUrls = content.match(/\\.well-known\\/sbsd[^"'\\s]*/g);
            if (sbsdUrls) {
                results.sbsd.urls = [...new Set(sbsdUrls)];
                Logger.network('[SBSD URLs]', results.sbsd.urls);
            }

            // Extract SBSD version parameter
            const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
            if (versionMatch) {
                results.sbsd.version = versionMatch[1];
                Logger.network('[SBSD Version]', results.sbsd.version);
            }
        }` : ''}
    });

    return results;
}

// Run the parser
const akamaiData = parseAkamaiScripts();
Logger.network('=== Akamai Parsing Results ===', akamaiData);`,

            python: `# Akamai Script Parser - Python
import requests
import re
from bs4 import BeautifulSoup
import json

def parse_akamai_scripts(url):
    """Parse ${hasPixel ? 'Pixel Challenge, ' : ''}${hasSensor ? 'Sensor Data, ' : ''}${hasSbsd ? 'SBSD Challenge' : ''} from Akamai scripts"""

    results = {
        'pixel': {},
        'sensor': {},
        'sbsd': {}
    }

    # Fetch the page
    response = requests.get(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    soup = BeautifulSoup(response.text, 'html.parser')
    scripts = soup.find_all('script')

    for i, script in enumerate(scripts):
        content = script.string or ''
        src = script.get('src', '')

        print(f"[Script {i + 1}] Source: {src or 'inline'}")

        ${hasPixel ? `
        # Parse Pixel Challenge data
        if 'bazadebezolkohpepadr' in content or 'pixel_' in content:
            # Extract pixel HTML variable
            pixel_var = re.search(r'bazadebezolkohpepadr="(\\d+)"', content)
            if pixel_var:
                results['pixel']['html_var'] = int(pixel_var.group(1))

            # Extract pixel script variable
            index_match = re.search(r'g=_\\[(\\d+)\\]', content)
            if index_match:
                index = int(index_match.group(1))
                array_match = re.search(r'var _=\\[([^\\]]+)\\]', content)
                if array_match:
                    strings = re.findall(r'"[^"]*"', array_match.group(1))
                    if index < len(strings):
                        results['pixel']['script_var'] = strings[index].strip('"')

            # Extract pixel script URL
            url_match = re.search(r'src="(https?://.+/akam/\\d+/\\w+)"', content)
            if url_match:
                script_url = url_match.group(1)
                results['pixel']['script_url'] = script_url
                parts = script_url.split("/")
                parts[-1] = "pixel_" + parts[-1]
                results['pixel']['post_url'] = "/".join(parts)

            print(f"[Pixel Challenge] {results['pixel']}")` : ''}

        ${hasSensor ? `
        # Parse Sensor Data
        if 'sensor_data' in content or 'bmak.' in content:
            # Extract sensor_data patterns
            patterns = [
                r'"sensor_data"\\s*:\\s*"([^"]+)"',
                r'sensor_data\\s*=\\s*["\']([^"\']+)["\']',
                r'sensor_data["\\'\\s:=]+["\']?([a-zA-Z0-9+/=]+)["\']?'
            ]

            for j, pattern in enumerate(patterns):
                match = re.search(pattern, content)
                if match:
                    results['sensor'][f'pattern_{j + 1}'] = match.group(1)
                    print(f"[Sensor Data Pattern {j + 1}] {match.group(1)[:50]}...")

            # Extract bmak API calls
            if 'bmak.' in content:
                bmak_calls = re.findall(r'bmak\\.[a-zA-Z_]+', content)
                if bmak_calls:
                    results['sensor']['bmak_calls'] = list(set(bmak_calls))` : ''}

        ${hasSbsd ? `
        # Parse SBSD Challenge
        if '.well-known/sbsd' in content or 'sbsd' in content:
            # Extract SBSD URLs
            sbsd_urls = re.findall(r'\\.well-known/sbsd[^"\'\\s]*', content)
            if sbsd_urls:
                results['sbsd']['urls'] = list(set(sbsd_urls))
                print(f"[SBSD URLs] {results['sbsd']['urls']}")

            # Extract SBSD version
            version_match = re.search(r'\\.well-known/sbsd\\?v=([^"\'&\\s]+)', content)
            if version_match:
                results['sbsd']['version'] = version_match.group(1)
                print(f"[SBSD Version] {results['sbsd']['version']}")` : ''}

    return results

# Usage
url = "https://example.com"
akamai_data = parse_akamai_scripts(url)
print("=== Akamai Parsing Results ===")
print(json.dumps(akamai_data, indent=2))`,

            nodejs: `// Akamai Script Parser - Node.js
const axios = require('axios');
const cheerio = require('cheerio');

async function parseAkamaiScripts(url) {
    const results = {
        pixel: {},
        sensor: {},
        sbsd: {}
    };

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const scripts = $('script');

        scripts.each((index, element) => {
            const content = $(element).html() || '';
            const src = $(element).attr('src') || '';

            Logger.network(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

            ${hasPixel ? `
            // Parse Pixel Challenge data
            if (content.includes('bazadebezolkohpepadr') || content.includes('pixel_')) {
                // Extract pixel HTML variable
                const pixelVar = content.match(/bazadebezolkohpepadr="(\\d+)"/);
                if (pixelVar) results.pixel.htmlVar = parseInt(pixelVar[1]);

                // Extract pixel script variable
                const indexMatch = content.match(/g=_\\[(\\d+)\\]/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
                    const arrayMatch = content.match(/var _=\\[([^\\]]+)\\]/);
                    if (arrayMatch) {
                        const strings = arrayMatch[1].match(/"[^"]*"/g);
                        if (strings && index < strings.length) {
                            results.pixel.scriptVar = strings[index].replace(/^"|"$/g, "");
                        }
                    }
                }

                // Extract pixel script URL
                const urlMatch = content.match(/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/);
                if (urlMatch) {
                    results.pixel.scriptUrl = urlMatch[1];
                    const parts = urlMatch[1].split("/");
                    parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                    results.pixel.postUrl = parts.join("/");
                }

                Logger.network('[Pixel Challenge]', results.pixel);
            }` : ''}

            ${hasSensor ? `
            // Parse Sensor Data
            if (content.includes('sensor_data') || content.includes('bmak.')) {
                // Extract sensor_data patterns
                const patterns = [
                    /"sensor_data"\\s*:\\s*"([^"]+)"/,
                    /sensor_data\\s*=\\s*["']([^"']+)["']/,
                    /sensor_data["'\\s:=]+["']?([a-zA-Z0-9+/=]+)["']?/
                ];

                patterns.forEach((pattern, i) => {
                    const match = content.match(pattern);
                    if (match && match[1]) {
                        results.sensor[\`pattern_\${i + 1}\`] = match[1];
                        Logger.network(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
                    }
                });

                // Extract bmak API calls
                if (content.includes('bmak.')) {
                    const bmakCalls = content.match(/bmak\\.[a-zA-Z_]+/g);
                    if (bmakCalls) results.sensor.bmakCalls = [...new Set(bmakCalls)];
                }
            }` : ''}

            ${hasSbsd ? `
            // Parse SBSD Challenge
            if (content.includes('.well-known/sbsd') || content.includes('sbsd')) {
                // Extract SBSD URLs
                const sbsdUrls = content.match(/\\.well-known\\/sbsd[^"'\\s]*/g);
                if (sbsdUrls) {
                    results.sbsd.urls = [...new Set(sbsdUrls)];
                    Logger.network('[SBSD URLs]', results.sbsd.urls);
                }

                // Extract SBSD version
                const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
                if (versionMatch) {
                    results.sbsd.version = versionMatch[1];
                    Logger.network('[SBSD Version]', results.sbsd.version);
                }
            }` : ''}
        });

    } catch (error) {
        Logger.error('NETWORK', 'Error parsing scripts:', error);
    }

    return results;
}

// Usage
(async () => {
    const url = "https://example.com";
    const akamaiData = await parseAkamaiScripts(url);
    Logger.network('=== Akamai Parsing Results ===');
    Logger.network(JSON.stringify(akamaiData, null, 2));
})();`,

            php: `<?php
// Akamai Script Parser - PHP

function parseAkamaiScripts($url) {
    $results = [
        'pixel' => [],
        'sensor' => [],
        'sbsd' => []
    ];

    // Fetch the page
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo "HTTP Error: $httpCode\\n";
        return $results;
    }

    // Parse HTML
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML($html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);
    $scripts = $xpath->query('//script');

    foreach ($scripts as $index => $script) {
        $content = $script->textContent;
        $src = $script->getAttribute('src');

        echo "[Script " . ($index + 1) . "] Source: " . ($src ?: 'inline') . "\\n";

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if (strpos($content, 'bazadebezolkohpepadr') !== false || strpos($content, 'pixel_') !== false) {
            // Extract pixel HTML variable
            if (preg_match('/bazadebezolkohpepadr="(\\d+)"/', $content, $matches)) {
                $results['pixel']['html_var'] = intval($matches[1]);
            }

            // Extract pixel script variable
            if (preg_match('/g=_\\[(\\d+)\\]/', $content, $indexMatch)) {
                $index = intval($indexMatch[1]);
                if (preg_match('/var _=\\[([^\\]]+)\\]/', $content, $arrayMatch)) {
                    preg_match_all('/"[^"]*"/', $arrayMatch[1], $strings);
                    if (isset($strings[0][$index])) {
                        $results['pixel']['script_var'] = trim($strings[0][$index], '"');
                    }
                }
            }

            // Extract pixel script URL
            if (preg_match('/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/', $content, $urlMatch)) {
                $scriptUrl = $urlMatch[1];
                $results['pixel']['script_url'] = $scriptUrl;
                $parts = explode("/", $scriptUrl);
                $parts[count($parts) - 1] = "pixel_" . $parts[count($parts) - 1];
                $results['pixel']['post_url'] = implode("/", $parts);
            }

            echo "[Pixel Challenge] " . json_encode($results['pixel']) . "\\n";
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if (strpos($content, 'sensor_data') !== false || strpos($content, 'bmak.') !== false) {
            // Extract sensor_data patterns
            $patterns = [
                '/"sensor_data"\\s*:\\s*"([^"]+)"/',
                '/sensor_data\\s*=\\s*["\']([^"\']+)["\']/',
                '/sensor_data["\\'\\s:=]+["\']?([a-zA-Z0-9+\/=]+)["\']?/'
            ];

            foreach ($patterns as $i => $pattern) {
                if (preg_match($pattern, $content, $match)) {
                    $results['sensor']["pattern_" . ($i + 1)] = $match[1];
                    echo "[Sensor Data Pattern " . ($i + 1) . "] " . substr($match[1], 0, 50) . "...\\n";
                }
            }

            // Extract bmak API calls
            if (strpos($content, 'bmak.') !== false) {
                preg_match_all('/bmak\\.[a-zA-Z_]+/', $content, $bmakCalls);
                if (!empty($bmakCalls[0])) {
                    $results['sensor']['bmak_calls'] = array_unique($bmakCalls[0]);
                }
            }
        }` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if (strpos($content, '.well-known/sbsd') !== false || strpos($content, 'sbsd') !== false) {
            // Extract SBSD URLs
            preg_match_all('/\\.well-known\\/sbsd[^"\'\\s]*/', $content, $sbsdUrls);
            if (!empty($sbsdUrls[0])) {
                $results['sbsd']['urls'] = array_unique($sbsdUrls[0]);
                echo "[SBSD URLs] " . json_encode($results['sbsd']['urls']) . "\\n";
            }

            // Extract SBSD version
            if (preg_match('/\\.well-known\\/sbsd\\?v=([^"\'&\\s]+)/', $content, $versionMatch)) {
                $results['sbsd']['version'] = $versionMatch[1];
                echo "[SBSD Version] " . $results['sbsd']['version'] . "\\n";
            }
        }` : ''}
    }

    return $results;
}

// Usage
$url = "https://example.com";
$akamaiData = parseAkamaiScripts($url);
echo "=== Akamai Parsing Results ===\\n";
echo json_encode($akamaiData, JSON_PRETTY_PRINT) . "\\n";
?>`,

            csharp: `// C# - Akamai Script Parser
using System;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;

public class AkamaiParser
{
    private static readonly HttpClient client = new HttpClient();

    static AkamaiParser()
    {
        client.DefaultRequestHeaders.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    }

    public static async Task ParseAkamaiScripts(string url)
    {
        try
        {
            var response = await client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(response);

            var scripts = doc.DocumentNode.SelectNodes("//script");
            if (scripts == null) return;

            var results = new {
                pixel = new { },
                sensor = new { },
                sbsd = new { }
            };

            for (int i = 0; i < scripts.Count; i++)
            {
                var script = scripts[i];
                var content = script.InnerText ?? "";
                var src = script.GetAttributeValue("src", "");

                Console.WriteLine($"[Script {i + 1}] Source: {(string.IsNullOrEmpty(src) ? "inline" : src)}");

                ${hasPixel ? `
                // Parse Pixel Challenge data
                if (content.Contains("bazadebezolkohpepadr") || content.Contains("pixel_"))
                {
                    var pixelVar = Regex.Match(content, @"bazadebezolkohpepadr=""(\\d+)""");
                    if (pixelVar.Success)
                    {
                        Console.WriteLine($"[Pixel HTML Var] {pixelVar.Groups[1].Value}");
                    }
                }` : ''}

                ${hasSensor ? `
                // Parse Sensor Data
                if (content.Contains("sensor_data") || content.Contains("bmak."))
                {
                    var patterns = new[] {
                        @"""sensor_data""\\s*:\\s*""([^""]+)""",
                        @"sensor_data\\s*=\\s*[""']([^""']+)[""']"
                    };

                    foreach (var pattern in patterns)
                    {
                        var match = Regex.Match(content, pattern);
                        if (match.Success)
                        {
                            Console.WriteLine($"[Sensor Data] {match.Groups[1].Value.Substring(0, Math.Min(50, match.Groups[1].Value.Length))}...");
                        }
                    }
                }` : ''}

                ${hasSbsd ? `
                // Parse SBSD Challenge
                if (content.Contains(".well-known/sbsd") || content.Contains("sbsd"))
                {
                    var sbsdUrls = Regex.Matches(content, @"\\.well-known/sbsd[^""'\\s]*");
                    foreach (Match match in sbsdUrls)
                    {
                        Console.WriteLine($"[SBSD URL] {match.Value}");
                    }
                }` : ''}
            }

            Console.WriteLine("=== C# Parsing Complete ===");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }

    static async Task Main(string[] args)
    {
        await ParseAkamaiScripts("https://example.com");
    }
}`,

            go: `// Go - Akamai Script Parser
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "regexp"
    "strings"

    "github.com/PuerkitoBio/goquery"
)

func parseAkamaiScripts(url string) error {
    client := &http.Client{}
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return err
    }

    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    doc, err := goquery.NewDocumentFromReader(resp.Body)
    if err != nil {
        return err
    }

    results := map[string]interface{}{
        "pixel": map[string]interface{}{},
        "sensor": map[string]interface{}{},
        "sbsd": map[string]interface{}{},
    }

    doc.Find("script").Each(func(i int, s *goquery.Selection) {
        content := s.Text()
        src, _ := s.Attr("src")

        if src == "" {
            src = "inline"
        }

        fmt.Printf("[Script %d] Source: %s\\n", i+1, src)

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if strings.Contains(content, "bazadebezolkohpepadr") || strings.Contains(content, "pixel_") {
            re := regexp.MustCompile(\`bazadebezolkohpepadr="(\\d+)"\`)
            matches := re.FindStringSubmatch(content)
            if len(matches) > 1 {
                fmt.Printf("[Pixel HTML Var] %s\\n", matches[1])
            }
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if strings.Contains(content, "sensor_data") || strings.Contains(content, "bmak.") {
            patterns := []string{
                \`"sensor_data"\\s*:\\s*"([^"]+)"\`,
                \`sensor_data\\s*=\\s*["']([^"']+)["']\`,
            }

            for _, pattern := range patterns {
                re := regexp.MustCompile(pattern)
                matches := re.FindStringSubmatch(content)
                if len(matches) > 1 {
                    preview := matches[1]
                    if len(preview) > 50 {
                        preview = preview[:50] + "..."
                    }
                    fmt.Printf("[Sensor Data] %s\\n", preview)
                }
            }
        }` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if strings.Contains(content, ".well-known/sbsd") || strings.Contains(content, "sbsd") {
            re := regexp.MustCompile(\`\\.well-known/sbsd[^"'\\s]*\`)
            matches := re.FindAllString(content, -1)
            for _, match := range matches {
                fmt.Printf("[SBSD URL] %s\\n", match)
            }
        }` : ''}
    })

    fmt.Println("=== Go Parsing Complete ===")
    _ = results // Use results to avoid unused variable warning
    return nil
}

func main() {
    if err := parseAkamaiScripts("https://example.com"); err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
}`,

        };
    };



    /**
     * Parse pixel HTML variable
     */
AkamaiAdvanced.prototype.parsePixelHtmlVar = function(src) {
        const result = /bazadebezolkohpepadr="(\d+)"/.exec(src);
        if (result == null || result.length < 2) {
            return null;
        }
        return parseInt(result[1]);
    };



    /**
     * Parse pixel script URL
     */
AkamaiAdvanced.prototype.parsePixelScriptUrl = function(src) {
        const result = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(src);
        if (result == null || result.length < 2) {
            return null;
        }

        const scriptUrl = result[1];

        // Create post URL
        const parts = scriptUrl.split("/");
        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
        const postUrl = parts.join("/");

        return {
            scriptUrl: scriptUrl,
            postUrl: postUrl
        };
    };



    /**
     * Parse pixel script variable
     */
AkamaiAdvanced.prototype.parsePixelScriptVar = function(src) {
        const indexResult = /g=_\[(\d+)]/.exec(src);
        if (indexResult == null || indexResult.length < 2) {
            return null;
        }
        const index = parseInt(indexResult[1]);

        const arrayDeclaration = /var _=\[(.+?)];/.exec(src);
        if (arrayDeclaration == null || arrayDeclaration.length < 2) {
            return null;
        }

        const rawStrings = arrayDeclaration[1].match(/"[^"]*"/g);
        if (rawStrings == null || index >= rawStrings.length) {
            return null;
        }

        // Remove leading and trailing quotes
        return rawStrings[index].replace(/^"|"$/g, "");
    };



    /**
     * Process captured data and save to history
     */
AkamaiAdvanced.prototype.processCapturedData = async function(interceptedData) {
        try {
            // Get cookies and page info
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

            if (!abckCookie) {
                NotificationHelper.error('No _abck cookie found');
                return;
            }

            // Check modes
            const isEasyMode = abckCookie.value.includes('~0~');
            const requiresSbsd = !!(sbsdCookie || sbsdOCookie);

            // Get page info and pixel challenge data
            const pageInfo = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const htmlContent = document.documentElement.outerHTML;
                    const requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');

                    // Parse Akamai script path
                    let akamaiScriptPath = null;
                    const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
                    if (scriptMatch && scriptMatch[1]) {
                        akamaiScriptPath = scriptMatch[1];
                    }

                    // Check for Pixel challenge
                    let requiresPixel = false;
                    let pixelHtmlVar = null;
                    let pixelScriptUrls = null;
                    let pixelScriptVar = null;

                    // Check for pixel HTML variable
                    const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
                    if (pixelVarMatch && pixelVarMatch[1]) {
                        requiresPixel = true;
                        pixelHtmlVar = parseInt(pixelVarMatch[1]);
                    }

                    // Parse pixel script URL
                    const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
                    if (pixelUrlMatch && pixelUrlMatch[1]) {
                        const scriptUrl = pixelUrlMatch[1];
                        const parts = scriptUrl.split("/");
                        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                        const postUrl = parts.join("/");
                        pixelScriptUrls = { scriptUrl, postUrl };
                    }

                    // Parse pixel script variable from script content
                    const scripts = Array.from(document.querySelectorAll('script'));
                    for (const script of scripts) {
                        const content = script.textContent;
                        if (!content) continue;

                        // Look for pixel script pattern
                        const indexMatch = /g=_\[(\d+)]/.exec(content);
                        if (indexMatch && indexMatch[1]) {
                            const index = parseInt(indexMatch[1]);
                            const arrayMatch = /var _=\[(.+?)];/.exec(content);
                            if (arrayMatch && arrayMatch[1]) {
                                const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                                if (rawStrings && index < rawStrings.length) {
                                    pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                                    break;
                                }
                            }
                        }
                    }

                    return {
                        requiresSecCpt,
                        akamaiScriptPath,
                        requiresPixel,
                        pixelHtmlVar,
                        pixelScriptUrls,
                        pixelScriptVar
                    };
                }
            });

            const pageData = pageInfo?.[0]?.result || {
                requiresSecCpt: false,
                akamaiScriptPath: null,
                requiresPixel: false,
                pixelHtmlVar: null,
                pixelScriptUrls: null,
                pixelScriptVar: null
            };

            // Determine version/mode
            let version = 'Standard';
            if (isEasyMode) {
                version = 'Easy Mode';
            } else if (pageData.requiresPixel) {
                version = 'Pixel Challenge';
            } else if (pageData.requiresSecCpt) {
                version = 'sec_cpt';
            } else if (requiresSbsd) {
                version = 'SBSD';
            }

            // Create capture data in reCAPTCHA-like format
            const captureData = {
                type: 'akamai',
                siteKey: abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : ''),
                abckFullLength: abckCookie.value.length,
                version: version,
                isEasyMode: isEasyMode,
                requiresSbsd: requiresSbsd,
                requiresSecCpt: pageData.requiresSecCpt,
                requiresPixel: pageData.requiresPixel,
                akamaiScriptPath: pageData.akamaiScriptPath,
                sensorData: interceptedData.sensorData,
                sensorEndpoint: interceptedData.endpoint,
                sbsdCookie: sbsdCookie ? sbsdCookie.value.substring(0, 50) : null,
                sbsdOCookie: sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : null,
                pixelHtmlVar: pageData.pixelHtmlVar,
                pixelScriptUrl: pageData.pixelScriptUrls?.scriptUrl || null,
                pixelPostUrl: pageData.pixelScriptUrls?.postUrl || null,
                pixelScriptVar: pageData.pixelScriptVar,
                siteUrl: this.tabInfo.url
            };

            // Save to unified history (same storage as reCAPTCHA)
            await this.saveCaptureToHistory(captureData);

            // Refresh display
            if (this.renderCapturedDataSection) {
                await this.renderCapturedDataSection();
            }
        } catch (error) {
            Logger.error('NETWORK', 'Failed to process captured data:', error);
            NotificationHelper.error('Failed to process data: ' + error.message);
        }
    };




    /**
     * Save capture to history (unified storage with reCAPTCHA)
     */
AkamaiAdvanced.prototype.saveCaptureToHistory = async function(captureData) {
        // Note: History saving is handled by the background.js AKAMAI_CAPTURE_COMPLETED handler
        // We don't save here to avoid duplicates
        Logger.network('[Akamai] Capture data processed, history will be saved by background handler');
    };



    /**
     * Extract Sensor Information - Delete cookies and capture raw sensor data
     */
AkamaiAdvanced.prototype.extractSensorInformation = async function() {
        Logger.network('[AKAMAI-EXTRACT] ========== STARTING EXTRACTION ==========');
        NotificationHelper.info('Extracting sensor information...');
        try {
            Logger.network('[AKAMAI-EXTRACT] Step 1: Getting current tab...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                Logger.error('NETWORK', '[AKAMAI-EXTRACT] No active tab found');
                throw new Error('No active tab found');
            }

            Logger.network('[AKAMAI-EXTRACT] Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Delete Akamai-related cookies to force regeneration
            Logger.network('[AKAMAI-EXTRACT] Step 2: Deleting Akamai cookies...');
            const cookiesToDelete = ['_abck', 'sbsd', 'sbsd_o', 'ak_bmsc', 'bm_sz', 'bm_sv', 'bm_mi'];
            let deletedCount = 0;

            for (const cookieName of cookiesToDelete) {
                try {
                    await chrome.cookies.remove({
                        url: tab.url,
                        name: cookieName
                    });
                    Logger.network(`[AKAMAI-EXTRACT] Deleted cookie: ${cookieName}`);
                    deletedCount++;
                } catch (err) {
                    Logger.network(`[AKAMAI-EXTRACT] Could not delete cookie ${cookieName}:`, err.message);
                }
            }
            Logger.network(`[AKAMAI-EXTRACT] Deleted ${deletedCount}/${cookiesToDelete.length} cookies`);

            // Store extraction mode flag
            Logger.network('[AKAMAI-EXTRACT] Step 3: Setting up extraction mode...');
            this.isExtracting = true;

            // Set up listener for extraction result
            Logger.network('[AKAMAI-EXTRACT] Step 4: Adding listener for extraction result...');
            const extractionListener = (message) => {
                Logger.network('[AKAMAI-EXTRACT] Received message:', message.type);
                if (message.type === 'AKAMAI_EXTRACTION_RESULT') {
                    Logger.network('[AKAMAI-EXTRACT] EXTRACTION RESULT RECEIVED!');
                    Logger.network('[AKAMAI-EXTRACT] Extracted data:', message.extractedData);

                    // Display the sensor data
                    Logger.network('[AKAMAI-EXTRACT] Step: Displaying sensor data modal...');
                    this.displaySensorDataModal(message.extractedData);

                    // Clean up
                    Logger.network('[AKAMAI-EXTRACT] Step: Cleaning up...');
                    this.isExtracting = false;
                    chrome.runtime.onMessage.removeListener(extractionListener);
                    Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
            };

            chrome.runtime.onMessage.addListener(extractionListener);
            Logger.network('[AKAMAI-EXTRACT] Listener added');

            // Send message to start extraction mode
            Logger.network('[AKAMAI-EXTRACT] Step 5: Sending message to background to start extraction...');
            const response = await chrome.runtime.sendMessage({
                type: 'AKAMAI_EXTRACT_SENSOR',
                tabId: tab.id
            });
            Logger.network('[AKAMAI-EXTRACT] Background response:', response);

            if (response && response.status === 'success') {
                Logger.network('[AKAMAI-EXTRACT] Extraction mode enabled successfully');
                Logger.network('[AKAMAI-EXTRACT] Step 6: Showing extracting notification...');

                // Show extracting notification before reload
                await AdvancedUtils.sendMessage({
                    type: 'AKAMAI_SHOW_EXTRACTING_NOTIFICATION',
                    tabId: tab.id
                });

                Logger.network('[AKAMAI-EXTRACT] Step 7: Reloading tab to capture sensor data...');
                await chrome.tabs.reload(tab.id);
                Logger.network('[AKAMAI-EXTRACT] Tab reload initiated');
                Logger.network('[AKAMAI-EXTRACT] Waiting for sensor data capture...');
            } else {
                Logger.error('NETWORK', '[AKAMAI-EXTRACT] Failed response from background:', response);
                throw new Error('Failed to start extraction mode');
            }
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] ERROR:', error);
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Stack trace:', error.stack);
            NotificationHelper.error('Failed to extract sensor information: ' + error.message);
            this.isExtracting = false;
            Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION FAILED ==========');
        }
    };



    /**
     * Process Akamai capture completion (called from background.js)
     * @param {number} tabId - Tab ID
     * @param {Object} interceptorData - Data from AkamaiInterceptor
     * @param {Object} chrome - Chrome API object
     * @returns {Promise<Object>} Processing result
     */
AkamaiAdvanced.processCaptureCompletion = async function(tabId, interceptorData, chrome) {
        try {
            Logger.network('[Akamai] Capture completed, processing data...');

            // Get tab info
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                Logger.error('NETWORK', '[Akamai] Tab not found or no URL');
                return { success: false, error: 'Tab not found or no URL' };
            }

            // Get cookies
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

            // _abck cookie is optional - sensor_data is still valuable without it
            if (!abckCookie) {
                Logger.network('[Akamai] No _abck cookie found yet, but continuing with sensor_data capture');
            }

            // Analyze page content
            const pageInfo = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: AkamaiAdvanced.analyzePage
            });

            const pageData = pageInfo?.[0]?.result || {
                requiresSecCpt: false,
                akamaiScriptPath: null,
                requiresPixel: false,
                pixelHtmlVar: null,
                pixelScriptUrls: null,
                pixelScriptVar: null
            };

            // Check modes - _abck cookie is optional
            const isEasyMode = abckCookie ? abckCookie.value.includes('~0~') : false;
            const requiresSbsd = !!(sbsdCookie || sbsdOCookie);

            // Determine version
            let version = 'Standard';
            if (isEasyMode) {
                version = 'Easy Mode';
            } else if (pageData.requiresPixel) {
                version = 'Pixel Challenge';
            } else if (pageData.requiresSecCpt) {
                version = 'sec_cpt';
            } else if (requiresSbsd) {
                version = 'SBSD';
            }

            // Create capture data - handle missing _abck cookie
            const captureData = {
                type: 'akamai',
                siteKey: abckCookie ? (abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : '')) : null,
                abckCookie: abckCookie ? (abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : '')) : null,
                abckFullLength: abckCookie ? abckCookie.value.length : 0,
                version: version,
                isEasyMode: isEasyMode,
                requiresSbsd: requiresSbsd,
                requiresSecCpt: pageData.requiresSecCpt,
                requiresPixel: pageData.requiresPixel,
                akamaiScriptPath: pageData.akamaiScriptPath,
                sensorData: interceptorData.sensorData,
                sensorEndpoint: interceptorData.endpoint,
                sensorLocation: 'Network Request',
                sbsdCookie: sbsdCookie ? sbsdCookie.value.substring(0, 50) : null,
                sbsdOCookie: sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : null,
                pixelHtmlVar: pageData.pixelHtmlVar,
                pixelScriptUrl: pageData.pixelScriptUrls?.scriptUrl || null,
                pixelPostUrl: pageData.pixelScriptUrls?.postUrl || null,
                pixelScriptVar: pageData.pixelScriptVar,
                siteUrl: tab.url
            };

            // Debug logs
            AkamaiAdvanced.logCaptureDebugInfo(interceptorData, abckCookie, sbsdCookie, sbsdOCookie, pageData, version, captureData);

            // Save to unified history
            const hostname = new URL(tab.url).hostname;
            let historyLimit = 100;
            try {
                const settings = await Utils.getHistorySettings();
                historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
                    ? parseInt(settings.historyLimit, 10)
                    : 100;
            } catch (error) {
                Logger.error('NETWORK', '[Akamai] Failed to load history settings; using default limit', error);
            }

            const newCapture = await AdvancedHistoryStore.appendCapture('akamai', {
                id: 'akamai_' + Date.now(),
                type: 'akamai',
                captureData: captureData,
                data: captureData,
                timestamp: Date.now(),
                hostname: hostname,
                url: tab.url,
                title: tab.title || hostname
            }, {
                expiryMinutes: 30,
                limit: historyLimit
            });
            Logger.network('[Akamai] Capture saved to unified history:', newCapture.id);

            // Notify popup to refresh UI
            chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {});

            // Show success notification
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Clear existing notifications
                    const allNotifs = document.querySelectorAll('[id^="akamai-capture-notification"]');
                    allNotifs.forEach(notif => notif.remove());

                    // Create Akamai success notification
                    const notif = document.createElement('div');
                    notif.id = 'akamai-capture-notification-success';
                    notif.style.cssText = `
                        position: fixed !important;
                        top: 20px !important;
                        right: 20px !important;
                        background: linear-gradient(135deg, #00D9A0 0%, #00A67E 100%) !important;
                        color: white !important;
                        padding: 20px 24px !important;
                        border-radius: 12px !important;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
                        z-index: 2147483647 !important;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                        min-width: 320px !important;
                    `;
                    notif.innerHTML = `
                        <style>
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                        </style>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="font-size: 32px;"></div>
                            <div>
                                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Akamai Data Captured!</div>
                                <div style="font-size: 13px; opacity: 0.9;">Check the Advanced tab for details</div>
                            </div>
                        </div>
                    `;
                    notif.style.animation = 'slideIn 0.3s ease-out';
                    document.body.appendChild(notif);

                    setTimeout(() => {
                        if (notif && notif.parentNode) {
                            notif.remove();
                        }
                    }, 5000);
                }
            }).catch(err => {
                Logger.network('[Akamai] Could not show notification:', err);
            });

            return { success: true, captureData: captureData, captureId: newCapture.id };

        } catch (error) {
            Logger.error('NETWORK', '[Akamai] Error processing capture:', error);
            return { success: false, error: error.message };
        }
    };



    /**
     * Analyze page content for Akamai detection (injected into page context)
     * @returns {Object} Page analysis results
     */
AkamaiAdvanced.analyzePage = function() {
        const htmlContent = document.documentElement.outerHTML;
        const requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');

        // Parse Akamai script path
        let akamaiScriptPath = null;
        const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
        if (scriptMatch && scriptMatch[1]) {
            akamaiScriptPath = scriptMatch[1];
        }

        // Pixel challenge detection
        let requiresPixel = false;
        let pixelHtmlVar = null;
        let pixelScriptUrls = null;
        let pixelScriptVar = null;

        // Parse pixel HTML variable
        const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
        if (pixelVarMatch && pixelVarMatch[1]) {
            requiresPixel = true;
            pixelHtmlVar = parseInt(pixelVarMatch[1]);
        }

        // Parse pixel script URL
        const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
        if (pixelUrlMatch && pixelUrlMatch[1]) {
            const scriptUrl = pixelUrlMatch[1];
            const parts = scriptUrl.split("/");
            parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
            const postUrl = parts.join("/");
            pixelScriptUrls = { scriptUrl, postUrl };
        }

        // Parse pixel script variable
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const content = script.textContent;
            if (!content) continue;

            const indexMatch = /g=_\[(\d+)]/.exec(content);
            if (indexMatch && indexMatch[1]) {
                const index = parseInt(indexMatch[1]);
                const arrayMatch = /var _=\[(.+?)];/.exec(content);
                if (arrayMatch && arrayMatch[1]) {
                    const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                    if (rawStrings && index < rawStrings.length) {
                        pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                        break;
                    }
                }
            }
        }

        return {
            requiresSecCpt,
            akamaiScriptPath,
            requiresPixel,
            pixelHtmlVar,
            pixelScriptUrls,
            pixelScriptVar
        };
    };



    /**
     * Log debug information for capture
     */
AkamaiAdvanced.logCaptureDebugInfo = function(interceptorData, abckCookie, sbsdCookie, sbsdOCookie, pageData, version, captureData) {
        Logger.network('[Akamai Debug] ========== CAPTURE COMPLETED - FULL DATA ==========');
        Logger.network('[Akamai Debug] INTERCEPTED DATA:');
        Logger.network('[Akamai Debug]   sensor_data:', interceptorData.sensorData ? interceptorData.sensorData.substring(0, 100) + '...' : 'NOT CAPTURED');
        Logger.network('[Akamai Debug]   sensor_data length:', interceptorData.sensorData ? interceptorData.sensorData.length : 0);
        Logger.network('[Akamai Debug]   endpoint:', interceptorData.endpoint);
        Logger.network('[Akamai Debug]   timestamp:', new Date(interceptorData.timestamp).toISOString());

        Logger.network('[Akamai Debug] COOKIES:');
        Logger.network('[Akamai Debug]   _abck:', {
            value: abckCookie.value.substring(0, 100) + '...',
            fullLength: abckCookie.value.length,
            domain: abckCookie.domain
        });
        Logger.network('[Akamai Debug]   sbsd:', sbsdCookie ? sbsdCookie.value.substring(0, 50) : 'NOT FOUND');
        Logger.network('[Akamai Debug]   sbsd_o:', sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : 'NOT FOUND');

        Logger.network('[Akamai Debug] MODE DETECTION:');
        Logger.network('[Akamai Debug]   Version:', version);
        Logger.network('[Akamai Debug]   Easy Mode:', captureData.isEasyMode);
        Logger.network('[Akamai Debug]   SBSD Required:', captureData.requiresSbsd);
        Logger.network('[Akamai Debug]   sec_cpt Required:', pageData.requiresSecCpt);
        Logger.network('[Akamai Debug]   Pixel Challenge:', pageData.requiresPixel);

        Logger.network('[Akamai Debug] PIXEL CHALLENGE DATA:');
        Logger.network('[Akamai Debug]   HTML Var:', pageData.pixelHtmlVar || 'NOT FOUND');
        Logger.network('[Akamai Debug]   Script URL:', pageData.pixelScriptUrls?.scriptUrl || 'NOT FOUND');
        Logger.network('[Akamai Debug]   Post URL:', pageData.pixelScriptUrls?.postUrl || 'NOT FOUND');
        Logger.network('[Akamai Debug]   Script Var:', pageData.pixelScriptVar || 'NOT FOUND');

        Logger.network('[Akamai Debug] SCRIPTS:');
        Logger.network('[Akamai Debug]   Script Path:', pageData.akamaiScriptPath || 'NOT FOUND');

        Logger.network('[Akamai Debug] FINAL CAPTURE DATA:');
        Logger.network('[Akamai Debug]', captureData);
        Logger.network('[Akamai Debug] ========================================');
    };



    /**
     * Extract path from URL
     * @param {string} url - Full URL
     * @returns {string} Path portion of URL
     */
AkamaiAdvanced.extractPath = function(url) {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            // If not a valid URL, might already be a path
            return url;
        }
    };



    /**
     * Handle AKAMAI_STOP_CAPTURE message from background
     * @param {number} tabId - Tab ID
     * @param {object} captureResults - Capture results from akamaiStopCapture
     */
AkamaiAdvanced.handleStopCapture = async function(tabId, captureResults) {
        try {
            // If we have captured data that wasn't already saved, save it now
            if (captureResults && captureResults.results && captureResults.results.sensorData) {
                // Check if this data was already saved by checking history
                const history = await AdvancedHistoryStore.getModule('akamai', { includeExpired: true });

                // Check if we already have a recent capture (within last 5 seconds)
                const recentCapture = history.find(item =>
                    (Date.now() - item.timestamp) < 5000
                );

                if (!recentCapture) {
                    // This is a manual stop with data that wasn't auto-saved
                    // Save it now using the same logic as AKAMAI_CAPTURE_COMPLETED
                    const tab = await chrome.tabs.get(tabId);
                    if (tab && tab.url) {
                        // Call the capture completed handler
                        await AkamaiAdvanced.handleCaptureCompleted(tabId, captureResults.results);
                    }
                }
            }

            // Always send stop notification to popup regardless of data
            await chrome.runtime.sendMessage({
                type: 'AKAMAI_CAPTURE_STOPPED',
                tabId: tabId,
                results: captureResults
            });
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error in handleStopCapture:', error);
        }
    };



    /**
     * Handle AKAMAI_CAPTURE_COMPLETED message from background
     * @param {number} tabId - Tab ID
     * @param {object} interceptorData - Data from the interceptor
     */
AkamaiAdvanced.handleCaptureCompleted = async function(tabId, interceptorData) {
        Logger.network('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED START ==========');
        Logger.network('[AKAMAI-CAPTURE] Processing capture completion for tab:', tabId);
        Logger.network('[AKAMAI-CAPTURE] Interceptor data received:', {
            hasSensorData: !!interceptorData?.sensorData,
            sensorDataLength: interceptorData?.sensorData?.length,
            endpoint: interceptorData?.endpoint
        });

        try {
            // Get tab info
            Logger.network('[AKAMAI-CAPTURE] Step 1: Getting tab info...');
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                Logger.error('NETWORK', '[AKAMAI-CAPTURE] Tab not found or no URL');
                return;
            }
            Logger.network('[AKAMAI-CAPTURE] Tab info retrieved:', { url: tab.url, title: tab.title });

            // Get cookies
            Logger.network('[AKAMAI-CAPTURE] Step 2: Getting cookies for URL:', tab.url);
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            Logger.network('[AKAMAI-CAPTURE] Total cookies found:', cookies.length);

            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

            Logger.network('[AKAMAI-CAPTURE] Cookie status:', {
                hasAbck: !!abckCookie,
                abckLength: abckCookie?.value?.length || 0,
                hasSbsd: !!sbsdCookie,
                hasSbsdO: !!sbsdOCookie
            });

            // Create capture data with URL monitoring results
            Logger.network('[AKAMAI-CAPTURE] Step 3: Creating capture data object...');
            const captureData = {
                type: 'akamai',
                // ABCK info - just true/false and level, NO cookie values
                abckCookie: !!abckCookie,
                abckCookieLevel: abckCookie ? (abckCookie.value.includes('~0~') ? 'easy' : 'standard') : null,
                // Akamai version if detected
                akamaiVersion: interceptorData.akamaiVersion || null,
                // Challenge requirements from URL monitoring
                requiresSbsd: interceptorData.requiresSbsd || !!(sbsdCookie || sbsdOCookie),
                requiresSecCpt: interceptorData.requiresSecCpt || false,
                // Basic site info
                siteUrl: tab.url,
                // Store timestamp for "captured X ago" display
                timestamp: Date.now()
                // NO sensor_data, NO cookie values, NO URLs stored
            };
            Logger.network('[AKAMAI-CAPTURE] Capture data created successfully');
            Logger.network('[AKAMAI-CAPTURE] URL Monitoring Results:', {
                requiresSbsd: captureData.requiresSbsd,
                requiresSecCpt: captureData.requiresSecCpt
            });

            // Save to history
            const hostname = new URL(tab.url).hostname;
            let historyLimit = 100;
            try {
                const settings = await Utils.getHistorySettings();
                historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
                    ? parseInt(settings.historyLimit, 10)
                    : 100;
            } catch (settingsError) {
                Logger.error('NETWORK', '[AKAMAI-CAPTURE] Failed to load history settings; using default limit', settingsError);
            }

            Logger.network('[AKAMAI-CAPTURE] Step 4: Saving capture via AdvancedHistoryStore...');
            const newCapture = await AdvancedHistoryStore.appendCapture('akamai', {
                id: 'akamai_' + Date.now(),
                type: 'akamai',
                captureData: captureData,
                data: captureData,
                timestamp: Date.now(),
                hostname: hostname,
                url: tab.url,
                title: tab.title || hostname
            }, {
                expiryMinutes: 30,
                limit: historyLimit
            });
            Logger.network('[AKAMAI-CAPTURE] Capture saved with ID:', newCapture.id);

            // Send capture complete message to popup
            Logger.network('[AKAMAI-CAPTURE] Step 7: Sending AKAMAI_CAPTURE_SAVED to popup...');
            try {
                await chrome.runtime.sendMessage({
                    type: 'AKAMAI_CAPTURE_SAVED',
                    captureData: newCapture
                });
                Logger.network('[AKAMAI-CAPTURE] Message sent to popup');
            } catch (msgError) {
                Logger.network('[AKAMAI-CAPTURE] Popup not available (expected if closed):', msgError.message);
            }

            Logger.network('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED END ==========');
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error in capture process:', error);
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error stack:', error.stack);
        }
    };



    /**
     * Handle AKAMAI_EXTRACT_SENSOR message from background
     * @param {number} tabId - Tab ID
     */
AkamaiAdvanced.handleExtractSensor = async function(tabId) {
        Logger.network('[AKAMAI-EXTRACT] ========== EXTRACT SENSOR START ==========');
        try {
            Logger.network('[AKAMAI-EXTRACT] Tab ID:', tabId);

            // Get current tab URL
            Logger.network('[AKAMAI-EXTRACT] Step 1: Getting tab info...');
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                Logger.error('NETWORK', '[AKAMAI-EXTRACT] Unable to get tab URL');
                throw new Error('Unable to get tab URL');
            }
            Logger.network('[AKAMAI-EXTRACT] Tab info:', { id: tab.id, url: tab.url });

            // Delete _abck cookies for the current site
            Logger.network('[AKAMAI-EXTRACT] Step 2: Getting cookies for:', tab.url);
            const cookies = await chrome.cookies.getAll({ url: tab.url, name: '_abck' });
            Logger.network('[AKAMAI-EXTRACT] Found', cookies.length, '_abck cookies');

            for (const cookie of cookies) {
                await chrome.cookies.remove({
                    url: tab.url,
                    name: cookie.name
                });
                Logger.network('[AKAMAI-EXTRACT] Deleted cookie:', cookie.name);
            }
            Logger.network('[AKAMAI-EXTRACT] All _abck cookies deleted');

            // Enable extraction mode in interceptor
            Logger.network('[AKAMAI-EXTRACT] Step 3: Enabling extraction mode...');

            // First, ensure the interceptor is set up
            if (typeof setupAkamaiInterceptor === 'function') {
                Logger.network('[AKAMAI-EXTRACT] Setting up Akamai interceptor...');
                setupAkamaiInterceptor();
            }

            // Set up extraction mode in the capture state
            if (typeof akamaiCaptureState !== 'undefined' && akamaiCaptureState) {
                Logger.network('[AKAMAI-EXTRACT] Setting extraction mode in capture state...');
                akamaiCaptureState.set(tabId, {
                    active: true,
                    extractMode: true,
                    startTime: Date.now(),
                    tabUrl: tab.url,
                    results: null,
                    waitingForReload: false,  // Don't wait for reload in extraction mode
                    extractedData: null,
                    timeout: setTimeout(() => {
                        // Auto-stop after 30 seconds
                        const state = akamaiCaptureState.get(tabId);
                        if (state && state.extractMode) {
                            akamaiCaptureState.delete(tabId);
                            Logger.network('[AKAMAI-EXTRACT] Auto-stopped after 30s timeout');
                        }
                    }, 30000)
                });
                Logger.network('[AKAMAI-EXTRACT] Extraction mode enabled for tab:', tabId);
            } else {
                Logger.error('NETWORK', '[AKAMAI-EXTRACT] akamaiCaptureState is not available!');
                throw new Error('Capture state not initialized');
            }

            // Reload the page
            Logger.network('[AKAMAI-EXTRACT] Step 4: Reloading page...');
            await chrome.tabs.reload(tabId);
            Logger.network('[AKAMAI-EXTRACT] Page reload initiated');

            Logger.network('[AKAMAI-EXTRACT] ========== WAITING FOR SENSOR DATA ==========');

        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error:', error);
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Stack:', error.stack);
            throw error;
        }
    };



    /**
     * Handle AKAMAI_EXTRACTION_COMPLETED message from background
     * @param {number} tabId - Tab ID
     * @param {object} extractedData - Extracted sensor data
     */
AkamaiAdvanced.handleExtractionCompleted = async function(tabId, extractedData) {
        Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED ==========');
        try {
            Logger.network('[AKAMAI-EXTRACT] Tab ID:', tabId);
            Logger.network('[AKAMAI-EXTRACT] Extracted data:', {
                hasSensorData: !!extractedData?.sensorData,
                hasSbsdData: !!extractedData?.sbsdData,
                hasSecData: !!extractedData?.secData,
                scriptUrl: extractedData?.scriptUrl,
                endpointsCount: extractedData?.endpoints?.length || 0
            });

            // Stop capture
            Logger.network('[AKAMAI-EXTRACT] Step 1: Stopping capture state...');
            if (typeof akamaiCaptureState !== 'undefined' && akamaiCaptureState) {
                const state = akamaiCaptureState.get(tabId);
                Logger.network('[AKAMAI-EXTRACT] Current state:', state);
                if (state && state.timeout) {
                    clearTimeout(state.timeout);
                    Logger.network('[AKAMAI-EXTRACT] Timeout cleared');
                }
                akamaiCaptureState.delete(tabId);
                Logger.network('[AKAMAI-EXTRACT] State deleted for tab:', tabId);
            }

            // Send data to popup
            Logger.network('[AKAMAI-EXTRACT] Step 2: Sending data to popup...');
            try {
                await chrome.runtime.sendMessage({
                    type: 'AKAMAI_EXTRACTION_RESULT',
                    extractedData: extractedData
                });
                Logger.network('[AKAMAI-EXTRACT] Data sent to popup');
            } catch (msgError) {
                Logger.network('[AKAMAI-EXTRACT] Popup not available (expected if closed):', msgError.message);
            }

            Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED END ==========');
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error:', error);
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Stack:', error.stack);
        }
    };
