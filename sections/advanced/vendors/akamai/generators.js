/** Standalone code templates for this vendor. */
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

        console.log(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

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

            console.log('[Pixel Challenge]', results.pixel);
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
                    console.log(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
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
        const sensorUrls = [${scriptCategories.sensorUrl.map(script => JSON.stringify(String(script.url))).join(', ')}];

        sensorUrls.forEach((url, index) => {
            console.log(\`[Sensor URL \${index + 1}]\`, url);

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
                            console.log(\`[Sensor URL \${index + 1} Response]\`, response.status, response.statusText);
                        })
                        .catch(err => console.log(\`[Sensor URL \${index + 1} Error]\`, err.message));
                }
            } catch (e) {
                console.log(\`[Sensor URL \${index + 1} Parse Error]\`, e.message);
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
                console.log('[SBSD URLs]', results.sbsd.urls);
            }

            // Extract SBSD version parameter
            const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
            if (versionMatch) {
                results.sbsd.version = versionMatch[1];
                console.log('[SBSD Version]', results.sbsd.version);
            }
        }` : ''}
    });

    return results;
}

// Run the parser
const akamaiData = parseAkamaiScripts();
console.log('=== Akamai Parsing Results ===', akamaiData);`,

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

            console.log(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

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

                console.log('[Pixel Challenge]', results.pixel);
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
                        console.log(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
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
                    console.log('[SBSD URLs]', results.sbsd.urls);
                }

                // Extract SBSD version
                const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
                if (versionMatch) {
                    results.sbsd.version = versionMatch[1];
                    console.log('[SBSD Version]', results.sbsd.version);
                }
            }` : ''}
        });

    } catch (error) {
        console.error('Error parsing scripts:', error);
    }

    return results;
}

// Usage
(async () => {
    const url = "https://example.com";
    const akamaiData = await parseAkamaiScripts(url);
    console.log('=== Akamai Parsing Results ===');
    console.log(JSON.stringify(akamaiData, null, 2));
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
