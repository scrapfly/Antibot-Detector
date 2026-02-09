/**
 * TurnstileAdvanced - Cloudflare Turnstile CAPTCHA Module
 *
 * Extends BaseAdvancedModule for Cloudflare Turnstile detection and analysis.
 */

Logger.network('[TurnstileAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class TurnstileAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'turnstile');
    }

    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('Turnstile');
        }
    }

    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="turnstileCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="turnstileAnalyzeScripts">
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

    setupToolListeners() {
        Logger.network('[Turnstile] Setting up tool listeners...');

        const checkCookiesBtn = document.querySelector('#turnstileCheckCookies');
        const analyzeScriptsBtn = document.querySelector('#turnstileAnalyzeScripts');

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
        }

        if (analyzeScriptsBtn) {
            analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
        }
    }

    async checkCookies() {
        Logger.network('[Turnstile] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');

            const foundCount = cfClearanceCookie ? 1 : 0;

            if (foundCount > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCount, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Turnstile'));
            }

            this.displayCookiesModal(cfClearanceCookie);
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    displayCookiesModal(cfClearanceCookie) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const foundCount = cfClearanceCookie ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Turnstile Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCount}/1</span>
                    </div>
                </div>

                ${cfClearanceCookie ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="cf_clearance" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">cf_clearance</div>
                            <div style="display: flex; gap: 6px;">
                                ${cfClearanceCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                ${cfClearanceCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cfClearanceCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${cfClearanceCookie.value.substring(0, 60)}${cfClearanceCookie.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cfClearanceCookie.domain}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;"></div>
                        <div style="font-size: 14px;">No Turnstile cookies found</div>
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(modal);

        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'Copied' });
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    async analyzeScripts() {
        Logger.network('[Turnstile] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const analysisListener = (message) => {
                if (message.type === 'TURNSTILE_ANALYSIS_RESULT') {
                    Logger.network('[Turnstile] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'TURNSTILE_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info('Deleting cf_clearance cookie... Page will reload');

                setTimeout(async () => {
                    try {
                        const cookies = await chrome.cookies.getAll({
                            url: this.tabInfo.url,
                            name: 'cf_clearance'
                        });

                        for (const cookie of cookies) {
                            await chrome.cookies.remove({
                                url: this.tabInfo.url,
                                name: cookie.name
                            });
                        }

                        await AdvancedUtils.sendMessage({
                            type: 'TURNSTILE_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });

                    } catch (cookieError) {
                        Logger.error('NETWORK', '[Turnstile] Failed to delete cookies:', cookieError);
                    }

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Turnstile] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    displayAnalysisModal(data) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const scripts = data?.scripts || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Turnstile Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => {
                        const typeColor = 'linear-gradient(135deg, #0074BF 0%, #0061B3 100%)';
                        return `
                            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="font-weight: 500;">Script ${idx + 1}</span>
                                    <span style="background: ${typeColor}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">Turnstile</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">URL</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${script.url}</div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #0074BF 0%, #0061B3 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                        Export Code
                    </button>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'URL copied' });
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.displayExportCodeModal(scripts);
            });
        }

        setTimeout(() => modal.style.opacity = '1', 10);
    }

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
                        <button class="lang-tab-btn" data-lang="${lang}" style="padding: 8px 12px; border: none; background: var(--bg-tertiary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; ${lang === 'JavaScript' ? 'background: linear-gradient(135deg, #0074BF 0%, #0061B3 100%); color: white;' : ''}">
                            ${lang}
                        </button>
                    `).join('')}
                </div>

                <div class="code-container" style="background: var(--bg-primary); border-radius: 6px; padding: 14px; overflow-x: auto; margin-bottom: 12px;">
                    <pre style="margin: 0; font-family: monospace; font-size: 12px; color: var(--text-primary); white-space: pre-wrap; word-wrap: break-word;"><code id="codeContent"></code></pre>
                </div>

                <button class="copy-code-btn" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #0074BF 0%, #0061B3 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Copy Code
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        const tabs = modal.querySelectorAll('.lang-tab-btn');
        const codeContent = modal.querySelector('#codeContent');
        const urls = scripts.map(s => s.url);

        const generateCode = (language) => {
            const templates = {
                'JavaScript': `// Cloudflare Turnstile Scripts
const turnstileScripts = ${JSON.stringify(urls, null, 2)};

turnstileScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);
});

async function fetchTurnstileScripts() {
    for (const url of turnstileScripts) {
        try {
            const response = await fetch(url);
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed: \${url}\`, error);
        }
    }
}

fetchTurnstileScripts();`,
                'Python': `import requests

turnstile_scripts = ${JSON.stringify(urls, null, 2)}

for index, url in enumerate(turnstile_scripts, 1):
    print(f'Script {index}: {url}')

def fetch_turnstile():
    for url in turnstile_scripts:
        try:
            requests.get(url)
            print(f'Fetched: {url}')
        except Exception as e:
            print(f'Failed: {url}', e)

fetch_turnstile()`,
                'Node.js': `const axios = require('axios');

const turnstileScripts = ${JSON.stringify(urls, null, 2)};

async function fetchTurnstile() {
    for (const url of turnstileScripts) {
        try {
            await axios.get(url);
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed: \${url}\`, error.message);
        }
    }
}

fetchTurnstile();`,
                'PHP': `<?php
$turnstileScripts = ${JSON.stringify(urls, null, 2)};

foreach ($turnstileScripts as $url) {
    file_get_contents($url);
    echo "Fetched: $url\\n";
}
?>`,
                'C#': `using System;
using System.Net.Http;
using System.Threading.Tasks;

class Turnstile {
    static async Task Main() {
        var scripts = new[] {
${urls.map(u => `            "${u}"`).join(',\n')}
        };

        foreach (var url in scripts) {
            try {
                using (var client = new HttpClient())
                    await client.GetAsync(url);
                Console.WriteLine($"Fetched: {url}");
            } catch (Exception e) {
                Console.WriteLine($"Failed: {url}");
            }
        }
    }
}`,
                'Go': `package main
import ("fmt"; "net/http"; "io/ioutil")

func main() {
    scripts := []string{
${urls.map(u => `        "${u}"`).join(',\n')}
    }

    for _, url := range scripts {
        resp, _ := http.Get(url)
        ioutil.ReadAll(resp.Body)
        resp.Body.Close()
        fmt.Println("Fetched:", url)
    }
}`
            };
            return templates[language] || 'Not available';
        };

        const updateCode = (language) => {
            codeContent.textContent = generateCode(language);

            tabs.forEach(tab => {
                if (tab.getAttribute('data-lang') === language) {
                    tab.style.background = 'linear-gradient(135deg, #0074BF 0%, #0061B3 100%)';
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

        const copyBtn = modal.querySelector('.copy-code-btn');
        copyBtn.addEventListener('click', () => {
            AdvancedUtils.copyToClipboard(codeContent.textContent, copyBtn, { notificationMessage: 'Code copied' });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        closeBtn.addEventListener('click', () => modal.remove());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        updateCode('JavaScript');
        setTimeout(() => modal.style.opacity = '1', 10);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TurnstileAdvanced;
} else if (typeof window !== 'undefined') {
    window.TurnstileAdvanced = TurnstileAdvanced;
}

Logger.network('[TurnstileAdvanced] Loaded successfully');
