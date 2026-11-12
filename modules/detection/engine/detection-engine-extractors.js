// Data extraction helpers for DetectionEngineManager

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
        Logger.debug('DETECTION', `Read ${cookies.length} page cookies`, {
            cookies: cookies.map(c => c.name)
        });
    }

    return cookies;
}


// JavaScript MIME essences from the MIME Sniffing standard, including legacy
// aliases still accepted by classic script elements. Data blocks are not code.
function demIsJavaScriptMimeType(value) {
    const essence = String(value || '').split(';', 1)[0].trim().toLowerCase();
    return /^(?:application\/(?:x-)?(?:ecmascript|javascript)|text\/(?:ecmascript|javascript(?:1\.[0-5])?|jscript|livescript|x-(?:ecmascript|javascript)))$/.test(essence);
}

function demIsJavaScriptElement(script) {
    const type = String(script.type || '').trim().toLowerCase();
    return !type || type === 'module' || demIsJavaScriptMimeType(type);
}

// Inline scripts that carry the page's own data, not code: the Next.js App Router's flight data (self.__next_f.push),
// Remix and React Router's loader data and its stream, Nuxt 2's state, Redux, Apollo and React Router stores. An article
// that mentions window.bmak or turnstile.render ships its text in one of these; read as code, it reads as the vendor's.
// Anchored at the start: a script that only uses one of these names later on is still read.
const DEM_PAGE_DATA_SCRIPT = /^\s*(?:(?:\(\s*self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\s*\]\s*\)|self\.__next_f)\.push\(|window\.(?:(?:__remixContext|__reactRouterContext)(?:\s*=|\.streamController\.enqueue\()|(?:__NUXT__|__INITIAL_STATE__|__APOLLO_STATE__|__PRELOADED_STATE__|__staticRouterHydrationData)\s*=(?!=)))/;

function demIsPageDataScript(content) {
    return DEM_PAGE_DATA_SCRIPT.test(content);
}

function demExtractScriptElements() {
    const scripts = [];
    const scriptElements = document.querySelectorAll('script');

    scriptElements.forEach((script) => {
        if (!demIsJavaScriptElement(script)) return;
        // External scripts
        if (script.src) {
            const content = (script.textContent || script.innerHTML || '').trim();
            scripts.push({
                type: 'external',
                src: script.src,
                content: content || script.src
            });
        }
        else if (script.textContent || script.innerHTML) {
            const content = (script.textContent || script.innerHTML || '').trim();
            if (content.length > 0 && !demIsPageDataScript(content)) {
                scripts.push({
                    type: 'inline',
                    src: null,
                    content: content
                });
            }
        }
    });

    Logger.debug('DETECTION', `Read ${scripts.length} script elements`);
    return scripts;
}


function demExtractDOM() {
    const domData = [];
    let canvasCount = 0;

    // Use NodeFilter to skip irrelevant elements (20-30% faster)
    const relevantTags = new Set(['iframe', 'form', 'div', 'meta', 'script', 'noscript', 'canvas']);
    // A rule that is off (its own `enabled: false`) records nothing: matching skips it, so its nodes would only be carried along
    const configuredSelectors = Object.values(this.detectors || {}).flatMap(category =>
        Object.values(category).filter(detector => detector.enabled !== false).flatMap(detector =>
            (detector.detection?.dom || []).filter(rule => rule && rule.enabled !== false).map(rule => demParseDOMSelector(rule.selector)).filter(Boolean)));
    const configuredGroups = configuredSelectors.flat();
    const groupsByTag = new Map();
    const extraAttributes = new Set(configuredGroups.flatMap(group =>
        group.tokens.map(token => token.attribute)));
    // Capture selector metadata, never input values or generated response tokens.
    extraAttributes.delete('value');
    const attributesFor = element => this.getElementAttributes(element, extraAttributes);

    // From the document element, not the body: the <head> holds scripts that DOM rules name (the Queue-it connector tag, CHEQ's
    // ClickTrue and JSONP tags, the Anubis challenge module, the Ruishu marker), and a walk that starts at the body never sees them
    const walker = document.createTreeWalker(
        document.documentElement || document.body,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: function(node) {
                const tagName = node.tagName.toLowerCase();
                if (!relevantTags.has(tagName)) {
                    if (node.hasAttribute('data-sitekey') ||
                        node.hasAttribute('data-captcha') ||
                        node.hasAttribute('data-callback')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    // Most nodes cannot match a configured widget. Check cheap
                    // tag/identity/presence requirements before allocating records.
                    let classTokens;
                    let nodeId;
                    let groups = groupsByTag.get(tagName);
                    if (!groups) {
                        groups = configuredGroups.filter(group => !group.tag || group.tag === '*' || group.tag === tagName);
                        groupsByTag.set(tagName, groups);
                    }
                    const possibleMatch = groups.some(group => group.tokens.every(token => {
                        if (token.attribute === 'class' && token.operator === '~=' && !token.insensitive) {
                            classTokens ??= (node.getAttribute('class') || '').split(/[\t\n\f\r ]+/);
                            return classTokens.includes(token.value);
                        }
                        if (token.attribute === 'id' && token.operator === '=' && !token.insensitive) {
                            nodeId ??= node.getAttribute('id');
                            return nodeId === token.value;
                        }
                        return node.hasAttribute(token.attribute);
                    }));
                    if (possibleMatch) {
                        const candidate = { selector: tagName, id: node.getAttribute('id') || '',
                            class: node.getAttribute('class') || '', attributes: attributesFor(node) };
                        if (demMatchDOMGroups(groups, candidate)) return NodeFilter.FILTER_ACCEPT;
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

        if (!relevantTags.has(tagName)) {
            domData.push({
                selector: tagName,
                id: element.getAttribute('id') || '',
                class: element.getAttribute('class') || '',
                attributes: attributesFor(element)
            });
            continue; // Skip switch statement
        }

        switch (tagName) {
            case 'iframe': {
                const src = element.getAttribute('src') || '';
                if (src) {
                    domData.push({
                        selector: 'iframe',
                        src: src,
                        attributes: attributesFor(element)
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
                    attributes: attributesFor(element)
                });
                break;
            }

            case 'div': {
                const id = element.getAttribute('id') || '';
                const className = element.getAttribute('class') || '';
                // Keep its attributes too: [data-sitekey] / [data-callback] usually sit on a div
                const attributes = attributesFor(element);
                if (id || className || Object.keys(attributes).length > 0) {
                    domData.push({
                        selector: 'div',
                        id: id,
                        class: className,
                        attributes
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
                        src: src,
                        attributes: attributesFor(element)
                    });
                } else {
                    // An inline script: its attributes (script[r="m"]) but never its text
                    const attributes = attributesFor(element);
                    if (Object.keys(attributes).length > 0) {
                        domData.push({
                            selector: 'script',
                            attributes
                        });
                    }
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

    if (canvasCount > 0) {
        domData.push({
            selector: 'canvas',
            count: canvasCount
        });
    }

    const extractTime = Date.now() - startTime;
    Logger.debug('DETECTION', `Walked ${nodeCount} DOM nodes in ${extractTime}ms, kept ${domData.length}`);

    return domData;
}


function demGetElementAttributes(element, extraAttributes = []) {
    if (!element) return {};

    const attributes = {};
    const relevantAttrs = new Set(['id', 'class', 'src', 'href', 'action', 'type', 'name',
        'data-sitekey', 'data-callback', ...extraAttributes]);
    relevantAttrs.delete('value');

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
