/**
 * awswaf-advanced-actions.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


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
            this.displayCookiesModal(awsWafToken);
        } catch (error) {
            Logger.error('NETWORK', '[AwsWaf] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
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
            const analysisListener = (message) => {
                if (message.type === 'AWSWAF_ANALYSIS_RESULT') {
                    Logger.network('[AwsWaf] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            // Send message to background to start analysis mode (sets up webNavigation listener)
            const response = await AdvancedUtils.sendMessage({
                type: 'AWSWAF_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[AwsWaf] Analysis mode response:', response);

            if (response && response.status === 'started') {
                // Show notification about cookie deletion and reload
                NotificationHelper.info('Deleting aws-waf-token cookie... Page will reload');

                // Delete aws-waf-token cookie before reload to trigger challenge/captcha scripts (like Akamai)
                setTimeout(async () => {
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

                        Logger.network('[AwsWaf] Cookie deletion complete, reloading page...');

                        // Send message to show analyzing notification right before reload
                        await AdvancedUtils.sendMessage({
                            type: 'AWSWAF_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });

                    } catch (cookieError) {
                        Logger.error('NETWORK', '[AwsWaf] Failed to delete cookies:', cookieError);
                    }

                    // Reload page to trigger challenge.js or captcha.js
                    // Background's webNavigation listener will capture scripts after reload
                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[AwsWaf] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };


    /**
     * Generate AWS WAF script fetching code for multiple languages
     * @param {Array} scripts - Array of script objects with url and type
     * @returns {Object} Code snippets for each language
     */
AwsWafAdvanced.prototype.generateAwsWafParsingCode = function(scripts) {
        // Organize scripts by type
        const challengeScripts = scripts.filter(s => s.type === 'challenge').map(s => s.url);
        const captchaScripts = scripts.filter(s => s.type === 'captcha').map(s => s.url);
        const awswafScripts = scripts.filter(s => s.type === 'awswaf').map(s => s.url);

        const allUrls = scripts.map(s => s.url);

        return {
            javascript: `// AWS WAF Script Fetcher - JavaScript
// Fetch all AWS WAF scripts: ${scripts.length} total

async function fetchAwsWafScripts() {
    const urls = ${JSON.stringify(allUrls, null, 4)};

    const results = [];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            const content = await response.text();

            results.push({
                url: url,
                success: true,
                content: content,
                size: content.length
            });

            Logger.network(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            Logger.error('NETWORK', \`✗ Failed: \${url}\`, error);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    Logger.network('=== AWS WAF Scripts Fetched ===');
    Logger.network(\`Total: \${results.length}\`);
    Logger.network(\`Success: \${results.filter(r => r.success).length}\`);
    Logger.network(\`Failed: \${results.filter(r => !r.success).length}\`);
    Logger.network('Results:', results);
});`,

            python: `# AWS WAF Script Fetcher - Python
# Fetch all AWS WAF scripts: ${scripts.length} total

import requests

def fetch_awswaf_scripts():
    urls = ${JSON.stringify(allUrls, null, 4)}

    results = []

    for url in urls:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            results.append({
                'url': url,
                'success': True,
                'content': response.text,
                'size': len(response.text),
                'status_code': response.status_code
            })

            print(f"✓ Fetched: {url}")
        except Exception as error:
            results.append({
                'url': url,
                'success': False,
                'error': str(error)
            })

            print(f"✗ Failed: {url} - {error}")

    return results

if __name__ == '__main__':
    results = fetch_awswaf_scripts()

    print('\\n=== AWS WAF Scripts Fetched ===')
    print(f'Total: {len(results)}')
    print(f'Success: {len([r for r in results if r["success"]])}')
    print(f'Failed: {len([r for r in results if not r["success"]])}')`,

            nodejs: `// AWS WAF Script Fetcher - Node.js
// Fetch all AWS WAF scripts: ${scripts.length} total

const axios = require('axios');

async function fetchAwsWafScripts() {
    const urls = ${JSON.stringify(allUrls, null, 4)};

    const results = [];

    for (const url of urls) {
        try {
            const response = await axios.get(url, { timeout: 10000 });

            results.push({
                url: url,
                success: true,
                content: response.data,
                size: response.data.length,
                statusCode: response.status
            });

            Logger.network(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            Logger.error('NETWORK', \`✗ Failed: \${url}\`, error.message);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    Logger.network('\\n=== AWS WAF Scripts Fetched ===');
    Logger.network(\`Total: \${results.length}\`);
    Logger.network(\`Success: \${results.filter(r => r.success).length}\`);
    Logger.network(\`Failed: \${results.filter(r => !r.success).length}\`);
}).catch(console.error);`,

            php: `<?php
// AWS WAF Script Fetcher - PHP
// Fetch all AWS WAF scripts: ${scripts.length} total

function fetch_awswaf_scripts() {
    $urls = ${JSON.stringify(allUrls, null, 4)};

    $results = [];

    foreach ($urls as $url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

        $content = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        curl_close($ch);

        if ($content !== false && $httpCode === 200) {
            $results[] = [
                'url' => $url,
                'success' => true,
                'content' => $content,
                'size' => strlen($content),
                'status_code' => $httpCode
            ];

            echo "✓ Fetched: $url\\n";
        } else {
            $results[] = [
                'url' => $url,
                'success' => false,
                'error' => $error ?: "HTTP $httpCode"
            ];

            echo "✗ Failed: $url - " . ($error ?: "HTTP $httpCode") . "\\n";
        }
    }

    return $results;
}

$results = fetch_awswaf_scripts();

echo "\\n=== AWS WAF Scripts Fetched ===\\n";
echo "Total: " . count($results) . "\\n";
echo "Success: " . count(array_filter($results, fn($r) => $r['success'])) . "\\n";
echo "Failed: " . count(array_filter($results, fn($r) => !$r['success'])) . "\\n";
?>`,

            csharp: `// AWS WAF Script Fetcher - C#
// Fetch all AWS WAF scripts: ${scripts.length} total

using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;

class AwsWafScriptFetcher
{
    private static readonly HttpClient client = new HttpClient();

    static async Task Main(string[] args)
    {
        var urls = new List<string> ${JSON.stringify(allUrls, null, 12).replace(/"/g, '"')};

        var results = await FetchAwsWafScripts(urls);

        Console.WriteLine("\\n=== AWS WAF Scripts Fetched ===");
        Console.WriteLine($"Total: {results.Count}");
        Console.WriteLine($"Success: {results.Count(r => r.Success)}");
        Console.WriteLine($"Failed: {results.Count(r => !r.Success)}");
    }

    static async Task<List<ScriptResult>> FetchAwsWafScripts(List<string> urls)
    {
        var results = new List<ScriptResult>();

        foreach (var url in urls)
        {
            try
            {
                var response = await client.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                results.Add(new ScriptResult
                {
                    Url = url,
                    Success = true,
                    Content = content,
                    Size = content.Length,
                    StatusCode = (int)response.StatusCode
                });

                Console.WriteLine($"✓ Fetched: {url}");
            }
            catch (Exception ex)
            {
                results.Add(new ScriptResult
                {
                    Url = url,
                    Success = false,
                    Error = ex.Message
                });

                Console.WriteLine($"✗ Failed: {url} - {ex.Message}");
            }
        }

        return results;
    }
}

class ScriptResult
{
    public string Url { get; set; }
    public bool Success { get; set; }
    public string Content { get; set; }
    public int Size { get; set; }
    public int StatusCode { get; set; }
    public string Error { get; set; }
}`,

            go: `// AWS WAF Script Fetcher - Go
// Fetch all AWS WAF scripts: ${scripts.length} total

package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "time"
)

type ScriptResult struct {
    URL        string
    Success    bool
    Content    string
    Size       int
    StatusCode int
    Error      string
}

func fetchAwsWafScripts() []ScriptResult {
    urls := []string${JSON.stringify(allUrls, null, 8)}

    client := &http.Client{
        Timeout: 10 * time.Second,
    }

    var results []ScriptResult

    for _, url := range urls {
        resp, err := client.Get(url)

        if err != nil {
            results = append(results, ScriptResult{
                URL:     url,
                Success: false,
                Error:   err.Error(),
            })
            fmt.Printf("✗ Failed: %s - %s\\n", url, err.Error())
            continue
        }

        defer resp.Body.Close()
        body, err := ioutil.ReadAll(resp.Body)

        if err != nil {
            results = append(results, ScriptResult{
                URL:     url,
                Success: false,
                Error:   err.Error(),
            })
            fmt.Printf("✗ Failed: %s - %s\\n", url, err.Error())
            continue
        }

        results = append(results, ScriptResult{
            URL:        url,
            Success:    true,
            Content:    string(body),
            Size:       len(body),
            StatusCode: resp.StatusCode,
        })

        fmt.Printf("✓ Fetched: %s\\n", url)
    }

    return results
}

func main() {
    results := fetchAwsWafScripts()

    successCount := 0
    for _, r := range results {
        if r.Success {
            successCount++
        }
    }

    fmt.Println("\\n=== AWS WAF Scripts Fetched ===")
    fmt.Printf("Total: %d\\n", len(results))
    fmt.Printf("Success: %d\\n", successCount)
    fmt.Printf("Failed: %d\\n", len(results)-successCount)
}`
        };
    };