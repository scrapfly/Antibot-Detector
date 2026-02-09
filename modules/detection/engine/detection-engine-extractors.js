/**
 * detection-engine-extractors.js - extracted helpers for DetectionEngineManager.
 * Loaded before detection-engine-manager.js in classic script mode.
 */

function demExtractCookies() {
    const cookies = [];

    if (document.cookie) {
        const cookieStrings = document.cookie.split(';');

        cookieStrings.forEach(cookieString => {
            const trimmed = cookieString.trim();
            const eqIndex = trimmed.indexOf('=');

            if (eqIndex > 0) {
                const name = trimmed.substring(0, eqIndex);
                const value = trimmed.substring(eqIndex + 1);

                cookies.push({
                    name: name,
                    value: value.substring(0, 100), // Limit value length for performance
                    domain: window.location.hostname
                });
            }
        });
    }

    // Log all collected cookies - visible in Service Worker console
    if (typeof Logger !== 'undefined') {
        Logger.cache(`Collected ${cookies.length} cookies from page`, {
            cookies: cookies.map(c => c.name)
        });
    }

    return cookies;
}


function demExtractScriptElements() {
    const scripts = [];
    const scriptElements = document.querySelectorAll('script');

    scriptElements.forEach((script) => {
        // External scripts - store both URL and try to get content
        if (script.src) {
            const content = (script.textContent || script.innerHTML || '').trim();
            scripts.push({
                type: 'external',
                src: script.src,
                content: content || script.src
            });
        }
        // Inline scripts
        else if (script.textContent || script.innerHTML) {
            const content = (script.textContent || script.innerHTML || '').trim();
            if (content.length > 0) {
                scripts.push({
                    type: 'inline',
                    src: null,
                    content: content
                });
            }
        }
    });

    Logger.detection(`DetectionEngineManager: Found ${scripts.length} script elements`);
    return scripts;
}


function demExtractDOM() {
    const domData = [];
    let canvasCount = 0;

    // Use NodeFilter to skip irrelevant elements (20-30% faster)
    const relevantTags = new Set(['iframe', 'form', 'div', 'meta', 'script', 'noscript', 'canvas']);

    const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: function(node) {
                const tagName = node.tagName.toLowerCase();
                // Skip elements we don't care about
                if (!relevantTags.has(tagName)) {
                    // But check if element has data attributes we care about
                    if (node.hasAttribute('data-sitekey') ||
                        node.hasAttribute('data-captcha') ||
                        node.hasAttribute('data-callback')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const startTime = Date.now();
    let nodeCount = 0;

    while (walker.nextNode()) {
        const element = walker.currentNode;
        const tagName = element.tagName.toLowerCase();
        nodeCount++;

        // Check for elements with specific data attributes (for non-standard tags)
        if (!relevantTags.has(tagName)) {
            domData.push({
                selector: tagName,
                attributes: this.getElementAttributes(element)
            });
            continue; // Skip switch statement
        }

        // Process specific elements based on tag type
        switch (tagName) {
            case 'iframe': {
                const src = element.getAttribute('src') || '';
                if (src) {
                    domData.push({
                        selector: 'iframe',
                        src: src,
                        attributes: this.getElementAttributes(element)
                    });
                }
                break;
            }

            case 'form': {
                domData.push({
                    selector: 'form',
                    action: element.getAttribute('action') || '',
                    id: element.getAttribute('id') || '',
                    class: element.getAttribute('class') || '',
                    attributes: this.getElementAttributes(element)
                });
                break;
            }

            case 'div': {
                const id = element.getAttribute('id') || '';
                const className = element.getAttribute('class') || '';
                // Only include if it has meaningful ID or class
                if (id || className) {
                    domData.push({
                        selector: 'div',
                        id: id,
                        class: className
                    });
                }
                break;
            }

            case 'meta': {
                const name = element.getAttribute('name') || element.getAttribute('property') || '';
                const content = element.getAttribute('content') || '';
                if (name) {
                    domData.push({
                        selector: 'meta',
                        name: name,
                        content: content
                    });
                }
                break;
            }

            case 'script': {
                const src = element.getAttribute('src') || '';
                if (src) {
                    domData.push({
                        selector: 'script',
                        src: src
                    });
                }
                break;
            }

            case 'noscript': {
                domData.push({
                    selector: 'noscript',
                    id: element.getAttribute('id') || '',
                    content: element.textContent.substring(0, 200) // First 200 chars
                });
                break;
            }

            case 'canvas': {
                canvasCount++;
                break;
            }
        }
    }

    // Add canvas count if any found
    if (canvasCount > 0) {
        domData.push({
            selector: 'canvas',
            count: canvasCount
        });
    }

    const extractTime = Date.now() - startTime;
    Logger.detection(`[8C: DOM Batching] Walked ${nodeCount} nodes in ${extractTime}ms, collected ${domData.length} elements`);

    return domData;
}


function demGetElementAttributes(element) {
    if (!element) return {};

    const attributes = {};
    const relevantAttrs = ['id', 'class', 'src', 'href', 'action', 'data-sitekey', 'data-callback'];

    relevantAttrs.forEach(attr => {
        if (element.hasAttribute(attr)) {
            let value = element.getAttribute(attr);
            // Limit attribute value length
            if (value && value.length > 100) {
                value = value.substring(0, 100) + '...';
            }
            attributes[attr] = value;
        }
    });

    return attributes;
}
