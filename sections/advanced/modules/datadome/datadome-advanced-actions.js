/**
 * datadome-advanced-actions.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


    /**
     * Check DataDome cookies without reload
     */
DataDomeAdvanced.prototype.checkCookies = async function() {
        Logger.network('[DataDome] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[DataDome] Total cookies found:', cookies.length);

            const dataDomeCookie = cookies.find(c => c.name === 'datadome');
            Logger.network('[DataDome] datadome cookie found:', !!dataDomeCookie);

            // Show notification
            if (dataDomeCookie) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('DataDome'));
            }

            // Display modal with cookie details
            this.displayCookiesModal(dataDomeCookie);
        } catch (error) {
            Logger.error('NETWORK', '[DataDome] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    };


    /**
     * Analyze DataDome scripts on the page
     * Deletes datadome cookie, reloads page, then analyzes scripts
     */
DataDomeAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[DataDome] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Setup listener for analysis results
            const analysisListener = (message) => {
                if (message.type === 'DATADOME_ANALYSIS_RESULT') {
                    Logger.network('[DataDome] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            // Send message to background to start analysis mode (sets up webNavigation listener)
            const response = await AdvancedUtils.sendMessage({
                type: 'DATADOME_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[DataDome] Analysis mode response:', response);

            if (response && response.status === 'started') {
                // Show notification about reload
                NotificationHelper.info('Analyzing DataDome scripts... Page will reload');

                // Reload page to capture DataDome scripts (keep existing cookie)
                setTimeout(async () => {
                    try {
                        Logger.network('[DataDome] Reloading page to capture scripts (keeping datadome cookie)...');

                        // Send message to show analyzing notification right before reload
                        await AdvancedUtils.sendMessage({
                            type: 'DATADOME_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });

                    } catch (error) {
                        Logger.error('NETWORK', '[DataDome] Error showing analyzing notification:', error);
                    }

                    // Reload page - Background's webNavigation listener will capture scripts
                    // DataDome cookie is preserved, no deletion occurs
                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[DataDome] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    };


    /**
     * Generate parsing code for DataDome scripts in different languages
     */
DataDomeAdvanced.prototype.generateDataDomeParsingCode = function(scripts, language) {
        const urls = scripts.map(s => s.url);

        const templates = {
            'JavaScript': () => `// DataDome Script URLs Parsing
const datadomeScripts = ${JSON.stringify(urls, null, 2)};

// Process each script URL
datadomeScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);

    // Parse the URL to extract script identifier
    const scriptId = url.split('/').pop();
    Logger.network(\`  Script ID: \${scriptId}\`);
});

// Make requests to each script
async function fetchDataDomeScripts() {
    for (const url of datadomeScripts) {
        try {
            const response = await fetch(url);
            const scriptContent = await response.text();
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error);
        }
    }
}

fetchDataDomeScripts();`,

            'Python': () => `import requests

# DataDome Script URLs
datadome_scripts = ${JSON.stringify(urls, null, 2)}

# Process each script URL
for index, url in enumerate(datadome_scripts, 1):
    print(f'Script {index}: {url}')

    # Parse the URL to extract script identifier
    script_id = url.split('/')[-1]
    print(f'  Script ID: {script_id}')

# Fetch each script
def fetch_datadome_scripts():
    for url in datadome_scripts:
        try:
            response = requests.get(url)
            print(f'Fetched: {url}')
            # Process script content
            # content = response.text
        except Exception as e:
            print(f'Failed to fetch: {url}', e)

fetch_datadome_scripts()`,

            'Node.js': () => `const axios = require('axios');

// DataDome Script URLs
const datadomeScripts = ${JSON.stringify(urls, null, 2)};

// Process each script URL
datadomeScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);

    // Parse the URL to extract script identifier
    const scriptId = url.split('/').pop();
    Logger.network(\`  Script ID: \${scriptId}\`);
});

// Fetch each script
async function fetchDataDomeScripts() {
    for (const url of datadomeScripts) {
        try {
            const response = await axios.get(url);
            Logger.network(\`Fetched: \${url}\`);
            // Process script content
            // const content = response.data;
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error.message);
        }
    }
}

fetchDataDomeScripts();`,

            'PHP': () => `<?php
// DataDome Script URLs
$datadomeScripts = ${JSON.stringify($urls, null, 2)};

// Process each script URL
foreach ($datadomeScripts as $index => $url) {
    echo "Script " . ($index + 1) . ": " . $url . PHP_EOL;

    // Parse the URL to extract script identifier
    $scriptId = basename($url);
    echo "  Script ID: " . $scriptId . PHP_EOL;
}

// Fetch each script
function fetchDataDomeScripts() {
    global $datadomeScripts;

    foreach ($datadomeScripts as $url) {
        try {
            $response = file_get_contents($url);
            if ($response !== false) {
                echo "Fetched: " . $url . PHP_EOL;
                // Process script content
                // $content = $response;
            }
        } catch (Exception $e) {
            echo "Failed to fetch: " . $url . PHP_EOL;
        }
    }
}

fetchDataDomeScripts();
?>`,

            'C#': () => `using System;
using System.Net.Http;
using System.Collections.Generic;
using System.Threading.Tasks;

class DataDomeScripts
{
    private static readonly string[] DatadomeScripts = new string[]
    {
${urls.map(u => `        "${u}"`).join(',\n')}
    };

    static void Main()
    {
        // Process each script URL
        for (int i = 0; i < DatadomeScripts.Length; i++)
        {
            string url = DatadomeScripts[i];
            Console.WriteLine($"Script {i + 1}: {url}");

            // Parse the URL to extract script identifier
            string scriptId = url.Split('/')[url.Split('/').Length - 1];
            Console.WriteLine($"  Script ID: {scriptId}");
        }

        // Fetch scripts
        FetchDataDomeScriptsAsync().Wait();
    }

    static async Task FetchDataDomeScriptsAsync()
    {
        using (HttpClient client = new HttpClient())
        {
            foreach (string url in DatadomeScripts)
            {
                try
                {
                    HttpResponseMessage response = await client.GetAsync(url);
                    Console.WriteLine($"Fetched: {url}");
                    // string content = await response.Content.ReadAsStringAsync();
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Failed to fetch: {url} - {e.Message}");
                }
            }
        }
    }
}`,

            'Go': () => `package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

var datadomeScripts = []string{
${urls.map(u => `	"${u}"`).join(',\n')}
}

func main() {
	// Process each script URL
	for i, url := range datadomeScripts {
		fmt.Printf("Script %d: %s\\n", i+1, url)

		// Parse the URL to extract script identifier
		parts := strings.Split(url, "/")
		scriptId := parts[len(parts)-1]
		fmt.Printf("  Script ID: %s\\n", scriptId)
	}

	// Fetch scripts
	fetchDataDomeScripts()
}

func fetchDataDomeScripts() {
	client := &http.Client{}

	for _, url := range datadomeScripts {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Printf("Failed to fetch: %s - %v\\n", url, err)
			continue
		}

		body, err := ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			fmt.Printf("Error reading response: %v\\n", err)
			continue
		}

		fmt.Printf("Fetched: %s\\n", url)
		// Process script content
		// content := string(body)
	}
}`
        };

        return templates[language] ? templates[language]() : 'Code generation not available';
    };