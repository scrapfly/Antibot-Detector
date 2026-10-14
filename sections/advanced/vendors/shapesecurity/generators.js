/** Standalone code templates for this vendor. */
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
            return ShapeSecurityAdvanced.codeTemplateCache.get(cacheKey);
        }

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
console.log('Extracted seed:', seed);
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
console.log('Found init.js scripts:', initScripts);
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
console.log('All Shape Security scripts:', allScripts);`,

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
console.log('Extracted seed:', seed);
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
// console.log('All Shape Security scripts:', allScripts);`,

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
