TurnstileAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'turnstileExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract Site Key')
            },
            {
                id: 'turnstileAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


TurnstileAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[Turnstile] Setting up tool listeners...');
        this.bindToolActions([
            { id: 'turnstileExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'turnstileAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
    };


// One card per key: the site key and the page it is on. Shared with
// Advanced → Cloudflare.
TurnstileAdvanced.KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>';

TurnstileAdvanced.prototype.displaySiteKeysModal = function(keys) {
        const K = BaseAdvancedModule;
        const cards = keys.map(key => K.kitCard(
            K.kitField(this._txt('advCommonSiteKey', 'Site Key'), key.sitekey, { wrap: true })
            + K.kitField(this._txt('advCommonPage', 'Page'), key.pageUrl, { mono: false, wrap: true })
        )).join('');
        this.openKitModal({
            title: this._txt('advTurnstileSiteKeysTitle', 'Turnstile site keys'),
            subtitle: keys.length === 1 ? keys[0].sitekey : String(keys.length),
            iconSvg: TurnstileAdvanced.KEY_ICON,
            body: cards,
            copiedMessage: this._txt('advCloudflareSiteKeyCopied', 'Site Key copied')
        });
    };


TurnstileAdvanced.prototype.displayAnalysisModal = function(data) {
        const modal = this.createToolModal();

        const scripts = data?.scripts || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'Turnstile', scripts.length)}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => {
                        const typeColor = 'linear-gradient(135deg, #0074BF 0%, #0061B3 100%)';
                        return `
                            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="font-weight: 500;">${this._txt('advCommonScript', 'Script')} ${idx + 1}</span>
                                    <span style="background: ${typeColor}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">Turnstile</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${this._txt('advCommonUrl', 'URL')}</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${script.url}</div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #0074BF 0%, #0061B3 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                        ${this._txt('advCommonExportCode', 'Export Code')}
                    </button>
                ` : ''}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advCommonUrlCopied', 'URL copied') });
        this.bindModalClose(modal);

        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.displayExportCodeModal(scripts);
            });
        }

        this.showToolModal(modal);
    };


TurnstileAdvanced.prototype.displayExportCodeModal = function(scripts) {
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
            return templates[language] || this._txt('advCommonCodeGenUnavailable', 'Code generation not available');
        };

        return AdvancedCodeDialog.open(this, {
            title: this._txt('advCommonExportCode', 'Export Code'),
            languages: ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'].map(label => ({ id: label, label })),
            getCode: (type, language) => generateCode(language)
        });
    };
