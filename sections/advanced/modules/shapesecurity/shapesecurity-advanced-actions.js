    /**
     * Check and display Shape Security headers
     */
ShapeSecurityAdvanced.prototype.checkHeaders = async function() {
        try {
            NotificationHelper.info('Checking Shape Security headers...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                NotificationHelper.error('No active tab found');
                return;
            }

            // Request headers check from background
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_CHECK_HEADERS',
                tabId: tab.id
            });

            if (response && response.headers) {
                this.displayHeadersResults(response.headers);
            } else {
                NotificationHelper.warning('No Shape Security headers detected');
            }
        } catch (error) {
            Logger.error('NETWORK', '[ShapeSecurity] Check headers error:', error);
            NotificationHelper.error('Failed to check headers: ' + error.message);
        }
    };

    /**
     * Check and display Shape Security cookies
     */

    /**
     * Check Shape Security version (V1 or V2)
     */
ShapeSecurityAdvanced.prototype.checkVersion = async function() {
        try {
            Logger.network('[ShapeSecurity] Check version button clicked');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                NotificationHelper.error('No active tab found');
                return;
            }

            // Request version check from background
            Logger.network('[ShapeSecurity] Sending SHAPESECURITY_CHECK_VERSION message');
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_CHECK_VERSION',
                tabId: tab.id,
                url: tab.url
            });

            Logger.network('[ShapeSecurity] Response:', response);

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            // Show result modal
            if (response && response.version) {
                Logger.network('[ShapeSecurity] Version detected:', response.version);
                NotificationHelper.success(AdvancedUtils.notifications.checkVersion.success('Shape Security', response.version.toUpperCase()));
                this.showVersionModal(response.version);
            } else {
                NotificationHelper.warning(AdvancedUtils.notifications.checkVersion.none('Shape Security'));
            }

        } catch (error) {
            Logger.error('NETWORK', '[ShapeSecurity] Check version error:', error);
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    };


    /**
     * Show version detection result in a modal
     */
ShapeSecurityAdvanced.prototype.showVersionModal = function(version) {
        const versionUpper = version.toUpperCase();

        const modal = this.createToolModal();

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 400px; max-height: 90vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">🟠</span> Shape Security Version
                    </h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Version Info -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Detected Version:</span>
                        <span class="copy-value" data-copy="${versionUpper}" data-copy-message="Value copied" style="color: ${version === 'v1' ? 'var(--success)' : 'var(--primary)'}; font-weight: 600; font-size: 14px; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${versionUpper}</span>
                    </div>
                </div>

                <!-- Capture Requirements -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Capture Requirements</h4>
                    </div>

                    <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; padding: 12px;">
                        <div style="font-size: 12px; color: var(--text-primary);">
                            Cookie + Headers
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

        });
    };


ShapeSecurityAdvanced.prototype.checkCookies = async function() {
        Logger.network('[ShapeSecurity] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            // Get cookies directly without reload (like AWS WAF/Akamai)
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[ShapeSecurity] Total cookies found:', cookies.length);
            Logger.network('[ShapeSecurity] URL:', this.tabInfo.url);

            // DEBUG: Log all cookies with details
            Logger.network('[ShapeSecurity] ===== ALL COOKIES =====');
            cookies.forEach((cookie, index) => {
                Logger.network(`[ShapeSecurity] Cookie ${index + 1}:`, {
                    name: cookie.name,
                    nameLength: cookie.name.length,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    valueSnippet: cookie.value ? cookie.value.substring(0, 50) + (cookie.value.length > 50 ? '...' : '') : '(empty)'
                });
            });

            // DEBUG: Log matching criteria
            Logger.network('[ShapeSecurity] ===== MATCHING CRITERIA =====');
            Logger.network('[ShapeSecurity] Looking for cookies with:');
            Logger.network('[ShapeSecurity]   - Name length: exactly 8 characters');
            Logger.network('[ShapeSecurity]   - Value pattern: contains "|1|0|" or "|1|1|"');

            // Find Shape Security cookie (8-character name with |1|0| or |1|1| pattern in value)
            Logger.network('[ShapeSecurity] ===== EVALUATING COOKIES =====');
            let shapeCookie = null;

            for (let i = 0; i < cookies.length; i++) {
                const c = cookies[i];
                const nameMatches = c.name.length === 8;
                const valueMatches = c.value && (c.value.includes('|1|0|') || c.value.includes('|1|1|'));

                Logger.network(`[ShapeSecurity] Cookie ${i + 1}: "${c.name}"`);
                Logger.network(`[ShapeSecurity]   ├─ Name length: ${c.name.length} ${nameMatches ? 'YES' : 'NO'} (need: 8)`);
                Logger.network(`[ShapeSecurity]   ├─ Value contains |1|0| or |1|1|: ${valueMatches ? 'YES' : 'NO'}`);

                if (nameMatches && valueMatches) {
                    Logger.network(`[ShapeSecurity]   └─ MATCH! This is a Shape Security cookie`);
                    shapeCookie = c;
                    break; // Found match, stop searching
                } else {
                    Logger.network(`[ShapeSecurity]   └─ Not a match ${nameMatches ? '(name OK but value pattern missing)' : '(name length wrong)'}`);
                }
            }

            // DEBUG: Log final result
            Logger.network('[ShapeSecurity] ===== RESULT =====');
            if (shapeCookie) {
                Logger.network('[ShapeSecurity] Shape Security cookie found!');
                Logger.network('[ShapeSecurity] Cookie details:', {
                    name: shapeCookie.name,
                    domain: shapeCookie.domain,
                    path: shapeCookie.path,
                    secure: shapeCookie.secure,
                    httpOnly: shapeCookie.httpOnly,
                    valueLength: shapeCookie.value.length,
                    valueSnippet: shapeCookie.value.substring(0, 100) + (shapeCookie.value.length > 100 ? '...' : ''),
                    fullValue: shapeCookie.value
                });
            } else {
                Logger.network('[ShapeSecurity] No Shape Security cookie found');
                Logger.network('[ShapeSecurity] Possible reasons:');
                Logger.network('[ShapeSecurity]   - No cookies with 8-character names');
                Logger.network('[ShapeSecurity]   - No cookies with |1|0| or |1|1| pattern in value');
                Logger.network('[ShapeSecurity]   - Shape Security not active on this page');
            }
            Logger.network('[ShapeSecurity] ========== END CHECK COOKIES ==========');

            // Show notification
            if (shapeCookie) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Shape Security'));
            }

            // Display modal with cookie details immediately
            this.displayCookieResults(shapeCookie);

        } catch (error) {
            Logger.error('NETWORK', '[ShapeSecurity] Check cookies error:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    };


    /**
     * Extract and analyze Shape Security scripts - Reload page and capture URLs
     */
ShapeSecurityAdvanced.prototype.extractScripts = async function() {
        Logger.network('[SHAPESECURITY-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {
            Logger.network('[SHAPESECURITY-EXTRACT] Step 1: Getting current tab...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] No active tab found');
                throw new Error('No active tab found');
            }

            Logger.network('[SHAPESECURITY-EXTRACT] Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Store extraction mode flag
            Logger.network('[SHAPESECURITY-EXTRACT] Step 2: Setting up extraction mode...');
            this.isExtracting = true;

            // Set up listener for extraction result
            Logger.network('[SHAPESECURITY-EXTRACT] Step 3: Adding listener for extraction result...');
            const extractionListener = (message) => {
                Logger.network('[SHAPESECURITY-EXTRACT] Received message:', message.type);
                if (message.type === 'SHAPESECURITY_EXTRACTION_RESULT') {
                    Logger.network('[SHAPESECURITY-EXTRACT] EXTRACTION RESULT RECEIVED!');
                    Logger.network('[SHAPESECURITY-EXTRACT] Extracted data:', message.extractedData);

                    // Display the script data
                    Logger.network('[SHAPESECURITY-EXTRACT] Step: Displaying script data modal...');
                    this.displayScriptDataModal(message.extractedData);

                    // Clean up
                    Logger.network('[SHAPESECURITY-EXTRACT] Step: Cleaning up...');
                    this.isExtracting = false;
                    chrome.runtime.onMessage.removeListener(extractionListener);
                    Logger.network('[SHAPESECURITY-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
            };

            chrome.runtime.onMessage.addListener(extractionListener);
            Logger.network('[SHAPESECURITY-EXTRACT] Listener added');

            // Send message to start extraction mode
            Logger.network('[SHAPESECURITY-EXTRACT] Step 4: Sending message to background to start extraction...');
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_START_EXTRACTION',
                tabId: tab.id
            });
            Logger.network('[SHAPESECURITY-EXTRACT] Background response:', response);

            if (response && response.status === 'success') {
                Logger.network('[SHAPESECURITY-EXTRACT] Extraction mode enabled successfully');
                Logger.network('[SHAPESECURITY-EXTRACT] Step 5: Showing analyzing notification...');

                // Show analyzing notification before reload
                await AdvancedUtils.sendMessage({
                    type: 'SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION',
                    tabId: tab.id
                });

                Logger.network('[SHAPESECURITY-EXTRACT] Step 6: Reloading page...');

                // Reload the page to trigger Shape Security scripts
                await chrome.tabs.reload(tab.id);
                Logger.network('[SHAPESECURITY-EXTRACT] Page reload initiated');

                // Show success notification
                NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Shape Security'));
            } else {
                throw new Error(response?.error || 'Failed to enable extraction mode');
            }

            Logger.network('[SHAPESECURITY-EXTRACT] ========== EXTRACTION STARTED ==========');
        } catch (error) {
            Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] Failed to start extraction:', error);
            Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] Error stack:', error.stack);
            NotificationHelper.error('Failed to start extraction: ' + error.message);
        }
    };


    /**
     * Generate parsing code for Shape Security script URLs
     * Template caching for faster repeat exports
     */
ShapeSecurityAdvanced.prototype.generateParsingCode = function(scripts, options) {
        const { hasInitJs, hasVendor2, hasSeeds, scriptType = 'all' } = options;

        // Generate cache key from script pattern characteristics
        const cacheKey = JSON.stringify({
            scriptType,
            hasInitJs,
            hasVendor2,
            hasSeeds,
            scriptCount: scripts.length,
            patterns: {
                init: scripts.some(s => s.isInitJs),
                seed: scripts.some(s => s.hasSeed),
                vendor2: scripts.some(s => s.url.includes('vendor2.js'))
            }
        });

        // Return cached templates if available
        if (ShapeSecurityAdvanced.codeTemplateCache.has(cacheKey)) {
            Logger.network('[ShapeSecurityAdvanced] Using cached code templates');
            return ShapeSecurityAdvanced.codeTemplateCache.get(cacheKey);
        }

        Logger.network('[ShapeSecurityAdvanced] Generating new code templates (not cached)');

        const initScripts = scripts.filter(s => s.isInitJs);
        const vendor2Scripts = scripts.filter(s => s.url.includes('vendor2.js'));
        const seedScripts = scripts.filter(s => s.hasSeed);
        const sampleInitUrl = initScripts[0]?.url || 'https://example.com/path/init.js';
        const sampleVendor2Url = vendor2Scripts[0]?.url || 'https://example.com/vendor/static/vendor2.js';
        const sampleSeedUrl = seedScripts[0]?.url || 'https://example.com/vendor/static/vendor2.js?seed=xxxxx';

        // Determine which patterns to include based on scriptType
        const getPatterns = () => {
            switch (scriptType) {
                case 'init':
                    return ['/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi'];
                case 'seed':
                    return ['/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi'];
                case 'both':
                    return [
                        '/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi'
                    ];
                case 'all':
                default:
                    return [
                        '/<script[^>]*src=["\']([ ^"\']*\\\\/init\\\\.js[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*[?&]seed=[^"\']*)["\'"][^>]*>/gi',
                        '/<script[^>]*src=["\']([ ^"\']*shape[^"\']*)["\'"][^>]*>/gi'
                    ];
            }
        };

        const patterns = getPatterns();

        // Generate the code templates
        const templates = {
            javascript: `// JavaScript - Shape Security Script URL Parser
// Extract seed parameters and init.js paths from HTML

${hasSeeds ? `
// Extract seed parameter from script URL
function extractSeedParameter(url) {
    const seedMatch = url.match(/[?&]seed=([A-Za-z0-9_\\-]+)/);
    return seedMatch ? seedMatch[1] : null;
}

// Example usage:
const scriptUrl = '${sampleSeedUrl}';
const seed = extractSeedParameter(scriptUrl);
Logger.network('Extracted seed:', seed);
` : ''}

${hasInitJs ? `
// Find all init.js scripts in HTML
function findInitJsScripts(html) {
    const initScripts = [];
    const scriptRegex = /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        initScripts.push(match[1]);
    }

    return initScripts;
}

// Example usage:
const htmlContent = document.documentElement.outerHTML;
const initScripts = findInitJsScripts(htmlContent);
Logger.network('Found init.js scripts:', initScripts);
` : ''}

// Find all Shape Security scripts
function findShapeSecurityScripts(html) {
    const scripts = [];
    const patterns = [
        /<script[^>]*src=["']([^"']*seed=[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*shape[^"']*)["'][^>]*>/gi
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (!scripts.includes(url)) {
                scripts.push(url);
            }
        }
    });

    return scripts;
}

// Extract all Shape Security data
const allScripts = findShapeSecurityScripts(document.documentElement.outerHTML);
Logger.network('All Shape Security scripts:', allScripts);`,

            python: `# Python - Shape Security Script URL Parser
import re
from typing import List, Optional

${hasSeeds ? `
def extract_seed_parameter(url: str) -> Optional[str]:
    """Extract seed parameter from script URL"""
    match = re.search(r'[?&]seed=([A-Za-z0-9_\\-]+)', url)
    return match.group(1) if match else None

# Example usage:
script_url = '${sampleSeedUrl}'
seed = extract_seed_parameter(script_url)
print(f'Extracted seed: {seed}')
` : ''}

${hasInitJs ? `
def find_init_js_scripts(html: str) -> List[str]:
    """Find all init.js scripts in HTML"""
    pattern = r'<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>'
    matches = re.finditer(pattern, html, re.IGNORECASE)
    return [match.group(1) for match in matches]

# Example usage:
# with open('page.html', 'r') as f:
#     html_content = f.read()
# init_scripts = find_init_js_scripts(html_content)
# print(f'Found init.js scripts: {init_scripts}')
` : ''}

def find_shape_security_scripts(html: str) -> List[str]:
    """Find all Shape Security scripts in HTML"""
    scripts = []
    patterns = [
        r'<script[^>]*src=["\\']([^"\\']*seed=[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*vendor2\\.js[^"\\']*)["\\''][^>]*>',
        r'<script[^>]*src=["\\']([^"\\']*shape[^"\\']*)["\\''][^>]*>'
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, html, re.IGNORECASE):
            url = match.group(1)
            if url not in scripts:
                scripts.append(url)

    return scripts

# Extract all Shape Security data
# all_scripts = find_shape_security_scripts(html_content)
# print(f'All Shape Security scripts: {all_scripts}')`,

            nodejs: `// Node.js - Shape Security Script URL Parser
const { JSDOM } = require('jsdom');

${hasSeeds ? `
// Extract seed parameter from script URL
function extractSeedParameter(url) {
    const seedMatch = url.match(/[?&]seed=([A-Za-z0-9_\\-]+)/);
    return seedMatch ? seedMatch[1] : null;
}

// Example usage:
const scriptUrl = '${sampleSeedUrl}';
const seed = extractSeedParameter(scriptUrl);
Logger.network('Extracted seed:', seed);
` : ''}

${hasInitJs ? `
// Find all init.js scripts in HTML
function findInitJsScripts(html) {
    const initScripts = [];
    const scriptRegex = /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        initScripts.push(match[1]);
    }

    return initScripts;
}
` : ''}

// Find all Shape Security scripts
function findShapeSecurityScripts(html) {
    const scripts = [];
    const patterns = [
        /<script[^>]*src=["']([^"']*seed=[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["'][^>]*>/gi,
        /<script[^>]*src=["']([^"']*shape[^"']*)["'][^>]*>/gi
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (!scripts.includes(url)) {
                scripts.push(url);
            }
        }
    });

    return scripts;
}

// Example with JSDOM:
// const dom = new JSDOM(htmlContent);
// const allScripts = findShapeSecurityScripts(dom.serialize());
// Logger.network('All Shape Security scripts:', allScripts);`,

            php: `<?php
// PHP - Shape Security Script URL Parser

${hasSeeds ? `
/**
 * Extract seed parameter from script URL
 */
function extractSeedParameter($url) {
    if (preg_match('/[?&]seed=([A-Za-z0-9_\\-]+)/', $url, $matches)) {
        return $matches[1];
    }
    return null;
}

// Example usage:
$scriptUrl = '${sampleSeedUrl}';
$seed = extractSeedParameter($scriptUrl);
echo "Extracted seed: $seed\\n";
` : ''}

${hasInitJs ? `
/**
 * Find all init.js scripts in HTML
 */
function findInitJsScripts($html) {
    $initScripts = [];
    $pattern = '/<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>/i';

    if (preg_match_all($pattern, $html, $matches)) {
        $initScripts = $matches[1];
    }

    return $initScripts;
}
` : ''}

/**
 * Find all Shape Security scripts in HTML
 */
function findShapeSecurityScripts($html) {
    $scripts = [];
    $patterns = [
        '/<script[^>]*src=["\\']([^"\\']*seed=[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*\\/init\\.js[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*vendor2\\.js[^"\\']*)["\\''][^>]*>/i',
        '/<script[^>]*src=["\\']([^"\\']*shape[^"\\']*)["\\''][^>]*>/i'
    ];

    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $html, $matches)) {
            foreach ($matches[1] as $url) {
                if (!in_array($url, $scripts)) {
                    $scripts[] = $url;
                }
            }
        }
    }

    return $scripts;
}

// Example usage:
// $htmlContent = file_get_contents('page.html');
// $allScripts = findShapeSecurityScripts($htmlContent);
// print_r($allScripts);
?>`,

            go: `// Go - Shape Security Script URL Parser
package main

import (
    "fmt"
    "regexp"
)

${hasSeeds ? `
// ExtractSeedParameter extracts seed parameter from script URL
func ExtractSeedParameter(url string) string {
    re := regexp.MustCompile(\`[?&]seed=([A-Za-z0-9_\\-]+)\`)
    matches := re.FindStringSubmatch(url)
    if len(matches) > 1 {
        return matches[1]
    }
    return ""
}
` : ''}

${hasInitJs ? `
// FindInitJsScripts finds all init.js scripts in HTML
func FindInitJsScripts(html string) []string {
    var initScripts []string
    re := regexp.MustCompile(\`<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["`+`'`+`][^>]*>\`)
    matches := re.FindAllStringSubmatch(html, -1)

    for _, match := range matches {
        if len(match) > 1 {
            initScripts = append(initScripts, match[1])
        }
    }

    return initScripts
}
` : ''}

// FindShapeSecurityScripts finds all Shape Security scripts in HTML
func FindShapeSecurityScripts(html string) []string {
    var scripts []string
    seen := make(map[string]bool)

    patterns := []string{
        \`<script[^>]*src=["']([^"']*seed=[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*\\/init\\.js[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*vendor2\\.js[^"']*)["`+`'`+`][^>]*>\`,
        \`<script[^>]*src=["']([^"']*shape[^"']*)["`+`'`+`][^>]*>\`,
    }

    for _, pattern := range patterns {
        re := regexp.MustCompile(pattern)
        matches := re.FindAllStringSubmatch(html, -1)

        for _, match := range matches {
            if len(match) > 1 {
                url := match[1]
                if !seen[url] {
                    scripts = append(scripts, url)
                    seen[url] = true
                }
            }
        }
    }

    return scripts
}

// Example usage:
// func main() {
//     scriptURL := "${sampleSeedUrl}"
//     seed := ExtractSeedParameter(scriptURL)
//     fmt.Printf("Extracted seed: %s\\n", seed)
// }`
        };

        // Cache the generated templates
        ShapeSecurityAdvanced.codeTemplateCache.set(cacheKey, templates);

        // Limit cache size (LRU-like eviction)
        if (ShapeSecurityAdvanced.codeTemplateCache.size > ShapeSecurityAdvanced.CODE_CACHE_MAX_SIZE) {
            const firstKey = ShapeSecurityAdvanced.codeTemplateCache.keys().next().value;
            ShapeSecurityAdvanced.codeTemplateCache.delete(firstKey);
        }

        return templates;
    };


