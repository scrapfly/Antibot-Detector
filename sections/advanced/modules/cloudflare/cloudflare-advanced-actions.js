CloudflareAdvanced.prototype.checkCookies = async function() {
        Logger.network('[Cloudflare] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const cfUnderscoreBmCookie = cookies.find(c => c.name === '__cf_bm');
            const cfBmCookie = cookies.find(c => c.name === 'cf_bm');
            const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');
            const cfuvIdCookie = cookies.find(c => c.name === '_cfuvid');

            const foundCookies = [cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie].filter(Boolean).length;
            const totalCookies = 4;

            if (foundCookies > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCookies, totalCookies));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Cloudflare'));
            }

            this.displayCookiesModal(cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie);
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    };


CloudflareAdvanced.prototype.checkVersion = async function() {
        Logger.network('[Cloudflare] ========== CHECK VERSION ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Show popup notification
            NotificationHelper.info('Checking Cloudflare version... Page will reload');

            // Send page notification before reload
            await AdvancedUtils.sendMessage({
                type: 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION',
                tabId: this.tabInfo.id
            });

            // Reload page to trigger fresh Cloudflare analysis
            await chrome.tabs.reload(this.tabInfo.id);

        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check version:', error);
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    };


CloudflareAdvanced.prototype.extractSiteKey = async function() {
        Logger.network('[Cloudflare] ========== EXTRACT SITE KEY ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN',
                func: () => {
                    const extractors = [
                        // Check window.turnstile for Turnstile sitekey
                        () => {
                            if (window.turnstile && typeof window.turnstile.render === 'function') {
                                // Try to get sitekey from data attributes
                                const elem = document.querySelector('[data-sitekey]');
                                if (elem) {
                                    return { sitekey: elem.getAttribute('data-sitekey'), type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check for data-sitekey attribute
                        () => {
                            const elem = document.querySelector('[data-sitekey]');
                            if (elem) {
                                const sitekey = elem.getAttribute('data-sitekey');
                                if (sitekey) {
                                    return { sitekey: sitekey, type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check iframe src for sitekey parameter
                        () => {
                            const iframe = document.querySelector('iframe[src*="turnstile"]');
                            if (iframe) {
                                const match = iframe.src.match(/[?&]sitekey=([^&]+)/);
                                if (match) {
                                    return { sitekey: match[1], type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check script content for sitekey pattern
                        () => {
                            const scripts = Array.from(document.querySelectorAll('script'));
                            for (const script of scripts) {
                                const content = script.textContent;
                                // Look for sitekey patterns in script content
                                const matches = [
                                    content.match(/sitekey[':"\s]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/),
                                    content.match(/["']sitekey["']\s*:\s*["']([a-zA-Z0-9_\-]{20,})["']/),
                                    content.match(/data-sitekey=["']([a-zA-Z0-9_\-]{20,})["']/),
                                ];
                                for (const match of matches) {
                                    if (match && match[1]) {
                                        return { sitekey: match[1], type: 'Turnstile' };
                                    }
                                }
                            }
                            return null;
                        }
                    ];

                    for (const extractor of extractors) {
                        const result = extractor();
                        if (result) {
                            return { success: true, ...result };
                        }
                    }

                    return { success: false, error: 'No sitekey found on page' };
                }
            });

            Logger.network('[Cloudflare] Extract script results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    this.displaySiteKeyModal(result.sitekey, result.type);
                    NotificationHelper.success('Site Key extracted successfully');
                } else {
                    NotificationHelper.error(result.error);
                }
            } else {
                NotificationHelper.error('Failed to extract sitekey');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to extract sitekey:', error);
            NotificationHelper.error('Failed to extract: ' + error.message);
        }
    };


CloudflareAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[Cloudflare] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const analysisListener = (message) => {
                if (message.type === 'CLOUDFLARE_ANALYSIS_RESULT') {
                    Logger.network('[Cloudflare] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'CLOUDFLARE_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[Cloudflare] Analysis mode response:', response);

            if (response && response.status === 'started') {
                NotificationHelper.info('Analyzing Cloudflare scripts... Page will reload');

                setTimeout(async () => {
                    try {
                        await AdvancedUtils.sendMessage({
                            type: 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });
                    } catch (error) {
                        Logger.error('NETWORK', '[Cloudflare] Failed to show analyzing notification:', error);
                    }

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };


CloudflareAdvanced.prototype.generateCloudflareParsingCode = function(urls, language) {
        const templates = {
            'JavaScript': () => `// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);
});

// Fetch challenge scripts
async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await fetch(url);
            const script = await response.text();
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error);
        }
    }
}

fetchCloudflareScripts();`,

            'Python': () => `import requests

# Cloudflare Challenge Scripts
cloudflare_scripts = ${JSON.stringify(urls, null, 2)}

for index, url in enumerate(cloudflare_scripts, 1):
    print(f'Script {index}: {url}')

def fetch_cloudflare_scripts():
    for url in cloudflare_scripts:
        try:
            response = requests.get(url)
            print(f'Fetched: {url}')
        except Exception as e:
            print(f'Failed to fetch: {url}', e)

fetch_cloudflare_scripts()`,

            'Node.js': () => `const axios = require('axios');

// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);
});

async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await axios.get(url);
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error.message);
        }
    }
}

fetchCloudflareScripts();`,

            'PHP': () => `<?php
// Cloudflare Challenge Scripts
$cloudflareScripts = ${JSON.stringify(urls, null, 2)};

foreach ($cloudflareScripts as $index => $url) {
    echo "Script " . ($index + 1) . ": " . $url . PHP_EOL;
}

function fetchCloudflareScripts() {
    global $cloudflareScripts;

    foreach ($cloudflareScripts as $url) {
        try {
            $response = file_get_contents($url);
            echo "Fetched: " . $url . PHP_EOL;
        } catch (Exception $e) {
            echo "Failed to fetch: " . $url . PHP_EOL;
        }
    }
}

fetchCloudflareScripts();
?>`,

            'C#': () => {
                const scriptLines = urls.map(u => `        "${u}"`).join(',\n');
                return `using System;
using System.Net.Http;
using System.Collections.Generic;
using System.Threading.Tasks;

class CloudflareScripts
{
    private static readonly string[] Scripts = new string[]
    {
${scriptLines}
    };

    static void Main()
    {
        FetchCloudflareScriptsAsync().Wait();
    }

    static async Task FetchCloudflareScriptsAsync()
    {
        using (HttpClient client = new HttpClient())
        {
            for (int i = 0; i < Scripts.Length; i++)
            {
                try
                {
                    HttpResponseMessage response = await client.GetAsync(Scripts[i]);
                    Console.WriteLine($"Fetched: {Scripts[i]}");
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Failed to fetch: {Scripts[i]} - {e.Message}");
                }
            }
        }
    }
}`;
            },

            'Go': () => {
                const scriptLines = urls.map(u => `	"${u}"`).join(',\n');
                return `package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

var cloudflareScripts = []string{
${scriptLines}
}

func main() {
	fetchCloudflareScripts()
}

func fetchCloudflareScripts() {
	client := &http.Client{}

	for _, url := range cloudflareScripts {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Printf("Failed to fetch: %s - %v\\n", url, err)
			continue
		}

		body, _ := ioutil.ReadAll(resp.Body)
		resp.Body.Close()

		fmt.Printf("Fetched: %s\\n", url)
		_ = body
	}
}`;
            }
        };

        return templates[language] ? templates[language]() : 'Code generation not available';
    };