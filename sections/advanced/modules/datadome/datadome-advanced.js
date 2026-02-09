/**
 * DataDomeAdvanced - DataDome Module
 *
 * Extends BaseAdvancedModule for DataDome detection and analysis.
 * Includes tools for checking cookies and capturing DataDome scripts.
 */

Logger.network('[DataDomeAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class DataDomeAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'datadome');
        // Analysis results are received via message only (no storage fallback)
    }

    /**
     * Override: Show capture start notification with Scrapfly branding
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('DataDome');
        }
    }

    /**
     * Render DataDome-specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="datadomeCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="datadomeAnalyzeScripts">
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
     * Setup tool-specific event listeners
     */
    setupToolListeners() {
        Logger.network('[DataDome] Setting up tool listeners...');

        const checkCookiesBtn = document.querySelector('#datadomeCheckCookies');
        const analyzeScriptsBtn = document.querySelector('#datadomeAnalyzeScripts');

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
            Logger.network('[DataDome] Added listener to Check Cookies button');
        }

        if (analyzeScriptsBtn) {
            analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
            Logger.network('[DataDome] Added listener to Analyze Scripts button');
        }
    }

    /**
     * Check DataDome cookies without reload
     */
    async checkCookies() {
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
    }

    /**
     * Display cookies in a modal
     */
    displayCookiesModal(dataDomeCookie) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const cookieFound = dataDomeCookie ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">DataDome Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${cookieFound}/1</span>
                    </div>
                </div>

                ${dataDomeCookie ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="datadome" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">datadome</div>
                            <div style="display: flex; gap: 6px;">
                                ${dataDomeCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                ${dataDomeCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(dataDomeCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${dataDomeCookie.value.substring(0, 60)}${dataDomeCookie.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Domain: ${dataDomeCookie.domain}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;"></div>
                        <div style="font-size: 14px;">No DataDome cookies found</div>
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(modal);

        // Add click listeners for copy functionality
        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'Cookie copied' });
            });
        });

        // Close button
        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Analyze DataDome scripts on the page
     * Deletes datadome cookie, reloads page, then analyzes scripts
     */
    async analyzeScripts() {
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
    }

    /**
     * Display script analysis results in modal
     */
    displayAnalysisModal(data) {
        Logger.network('[DataDome] Displaying analysis modal with data:', data);

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const scripts = data?.scripts || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">DataDome Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => {
                        const typeLabel = script.type === 'tags' ? 'tags.js' : 'DATADOME';
                        const typeColor = 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)';
                        return `
                            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="font-weight: 500;">Script ${idx + 1}</span>
                                    <span style="background: ${typeColor}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">${typeLabel}</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">URL</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${script.url}</div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>Export Code</span>
                    </button>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Add click listeners for copy functionality
        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'URL copied' });
            });
        });

        // Close button
        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Export Code button
        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (scripts.length === 0) {
                    Logger.error('NETWORK', '[DataDome] No scripts to export!');
                    NotificationHelper.warning('No scripts available to export');
                    return;
                }

                Logger.network('[DataDome] Calling displayExportCodeModal...');
                try {
                    this.displayExportCodeModal(scripts);
                    Logger.network('[DataDome] displayExportCodeModal called successfully');
                } catch (error) {
                    Logger.error('NETWORK', '[DataDome] Error calling displayExportCodeModal:', error);
                    NotificationHelper.error('Failed to open export modal: ' + error.message);
                }
            });
            Logger.network('[DataDome] Click listener added successfully');
        } else {
            Logger.error('NETWORK', '[DataDome] Export code button not found in modal!');
            Logger.error('NETWORK', '[DataDome] Modal HTML:', modal.innerHTML.substring(0, 500));
        }

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Display export code modal with multi-language support
     */
    displayExportCodeModal(scripts) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.2s;';

        const languages = ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Export Code</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                    ${languages.map(lang => `
                        <button class="lang-tab-btn" data-lang="${lang}" style="padding: 8px 12px; border: none; background: var(--bg-tertiary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; ${lang === 'JavaScript' ? 'background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: white;' : ''}">
                            ${lang}
                        </button>
                    `).join('')}
                </div>

                <div class="code-container" style="background: var(--bg-primary); border-radius: 6px; padding: 14px; overflow-x: auto; margin-bottom: 12px;">
                    <pre style="margin: 0; font-family: monospace; font-size: 12px; color: var(--text-primary); white-space: pre-wrap; word-wrap: break-word;"><code id="codeContent"></code></pre>
                </div>

                <button class="copy-code-btn" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Copy Code
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Language tab switching
        const tabs = modal.querySelectorAll('.lang-tab-btn');
        const codeContent = modal.querySelector('#codeContent');

        const updateCode = (language) => {
            const code = this.generateDataDomeParsingCode(scripts, language);
            codeContent.textContent = code;

            // Update tab styles
            tabs.forEach(tab => {
                if (tab.getAttribute('data-lang') === language) {
                    tab.style.background = 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)';
                    tab.style.color = 'white';
                } else {
                    tab.style.background = 'var(--bg-tertiary)';
                    tab.style.color = 'var(--text-primary)';
                }
            });
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                updateCode(tab.getAttribute('data-lang'));
            });
        });

        // Copy button
        const copyBtn = modal.querySelector('.copy-code-btn');
        copyBtn.addEventListener('click', () => {
            const code = codeContent.textContent;
            AdvancedUtils.copyToClipboard(code, copyBtn, { notificationMessage: 'Code copied' });
        });

        // Close button
        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        closeBtn.addEventListener('click', () => modal.remove());

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Load default code
        updateCode('JavaScript');
        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Generate parsing code for DataDome scripts in different languages
     */
    generateDataDomeParsingCode(scripts, language) {
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
    }
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataDomeAdvanced;
} else if (typeof window !== 'undefined') {
    window.DataDomeAdvanced = DataDomeAdvanced;
}

Logger.network('[DataDomeAdvanced] Loaded successfully');
