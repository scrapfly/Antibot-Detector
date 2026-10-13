/** Standalone code templates for this vendor. */
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

            console.log(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            console.error(\`✗ Failed: \${url}\`, error);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    console.log('=== AWS WAF Scripts Fetched ===');
    console.log(\`Total: \${results.length}\`);
    console.log(\`Success: \${results.filter(r => r.success).length}\`);
    console.log(\`Failed: \${results.filter(r => !r.success).length}\`);
    console.log('Results:', results);
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

            console.log(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            console.error(\`✗ Failed: \${url}\`, error.message);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    console.log('\\n=== AWS WAF Scripts Fetched ===');
    console.log(\`Total: \${results.length}\`);
    console.log(\`Success: \${results.filter(r => r.success).length}\`);
    console.log(\`Failed: \${results.filter(r => !r.success).length}\`);
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