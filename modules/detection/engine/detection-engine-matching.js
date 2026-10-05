// Pattern matching helpers for DetectionEngineManager

function demMatchCookieName(name, pattern, options = {}) {
    const {
        regex = false,
        wholeWord = false,
        caseSensitive = false
    } = options;

    if (!name || !pattern) {
        return false;
    }

    if (regex || wholeWord) {
        return this.matchPattern(name, pattern, options);
    }

    const nameToCompare = caseSensitive ? name : name.toLowerCase();
    const patternToCompare = caseSensitive ? pattern : pattern.toLowerCase();

    // Support simple wildcard patterns (e.g., "awswaf*")
    if (patternToCompare.includes('*')) {
        const escaped = patternToCompare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = `^${escaped.replace(/\\\*/g, '.*')}$`;
        try {
            return new RegExp(regexPattern).test(nameToCompare);
        } catch (e) {
            return false;
        }
    }

    // Default to prefix match (safer than substring for cookie names)
    return nameToCompare.startsWith(patternToCompare);
}

function demMatchPattern(text, pattern, options = {}, preparedLower) {
    const {
        regex = false,
        wholeWord = false,
        caseSensitive = false
    } = options;

    if (!text || !pattern) {
        return false;
    }

    // Check result cache first (5-minute TTL). Hash the text once and reuse the
    // key for both the lookup and the store (previously hashed twice per call).
    const pc = DetectionEngineManager.patternCache;
    const textKey = pc.textKeyFor(text);
    const cached = pc.getCachedMatch(text, pattern, options, textKey);
    if (cached.found) {
        return cached.result;
    }

    // Apply case sensitivity once. Reuse a precomputed lowercased copy when the
    // caller passes one (runDetector lowercases pageHTML once for all patterns).
    const textToSearch = caseSensitive ? text : (preparedLower !== undefined ? preparedLower : text.toLowerCase());
    const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

    let result = false;

    // Regex matching
    if (regex) {
        const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { regex: true, caseSensitive });
        if (compiledRegex) {
            try {
                result = compiledRegex.test(textToSearch);
            } catch (e) {
                Logger.warn('DETECTION', 'Invalid regex pattern:', patternToMatch, e);
                result = false;
            }
        }
    }
    // Whole word matching
    else if (wholeWord) {
        const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { wholeWord: true, caseSensitive });
        if (compiledRegex) {
            result = compiledRegex.test(textToSearch);
        } else {
            // Fallback to direct matching if compilation failed
            const escapedPattern = this.escapeRegExp(patternToMatch);
            const wordBoundaryRegex = new RegExp(`\\b${escapedPattern}\\b`, caseSensitive ? '' : 'i');
            result = wordBoundaryRegex.test(textToSearch);
        }
    }
    // Simple includes matching (fastest - no regex needed)
    else {
        result = textToSearch.includes(patternToMatch);
    }

    // Cache result (5min TTL)
    pc.cacheMatch(text, pattern, options, result, textKey);
    return result;
}

function demMatchPatternWithCapture(text, pattern, options = {}) {
    const {
        regex = false,
        wholeWord = false,
        caseSensitive = false
    } = options;

    if (!text || !pattern) return null;

    try {
        const textToSearch = caseSensitive ? text : text.toLowerCase();
        const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

        if (regex) {
            const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { regex: true, caseSensitive });
            if (!compiledRegex) return null;
            const result = text.match(compiledRegex);
            return (result && result.length) ? result[0] : null;
        }
        else if (wholeWord) {
            const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { wholeWord: true, caseSensitive });
            if (!compiledRegex) return null;
            const result = text.match(compiledRegex);
            return (result && result.length) ? result[0] : null;
        }
        else {
            // Substring matching
            const index = textToSearch.indexOf(patternToMatch);
            if (index !== -1) {
                return text.substring(index, index + pattern.length);
            }
        }
    } catch (error) {
        Logger.warn('DETECTION', '[matchPatternWithCapture] Error matching pattern:', error);
    }

    return null;
}

function demEscapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The background has flat element records, not a document. Match the simple
// compound selectors used by detector definitions without pretending to support
// ancestry, pseudo-classes or escaped CSS identifiers. Unsupported syntax fails
// closed, including when it occurs in another branch of a selector list.
function demParseDOMSelector(selector) {
    if (typeof selector !== 'string' || !selector.trim() || selector.includes('\\')) return null;
    const groups = [];
    let start = 0;
    let bracket = false;
    let quote = '';
    for (let index = 0; index < selector.length; index++) {
        const character = selector[index];
        if (quote) {
            if (character === quote) quote = '';
        } else if (bracket && (character === '"' || character === "'")) {
            quote = character;
        } else if (character === '[') {
            if (bracket) return null;
            bracket = true;
        } else if (character === ']') {
            if (!bracket) return null;
            bracket = false;
        } else if (character === ',' && !bracket) {
            groups.push(selector.slice(start, index).trim());
            start = index + 1;
        }
    }
    if (bracket || quote) return null;
    groups.push(selector.slice(start).trim());

    const parsed = [];
    for (const group of groups) {
        if (!group) return null;
        const tag = group.match(/^(\*|[a-zA-Z][\w-]*)/);
        let remaining = tag ? group.slice(tag[0].length) : group;
        const tokens = [];
        while (remaining) {
            const identity = remaining.match(/^([.#])([a-zA-Z_-][\w-]*)/);
            if (identity) {
                tokens.push({ attribute: identity[1] === '#' ? 'id' : 'class',
                    operator: identity[1] === '#' ? '=' : '~=', value: identity[2] });
                remaining = remaining.slice(identity[0].length);
                continue;
            }
            const attribute = remaining.match(/^\[\s*([a-zA-Z_][\w-]*)\s*(?:(~=|\|=|\^=|\$=|\*=|=)\s*(?:"([^"\n\r\f]*)"|'([^'\n\r\f]*)'|([a-zA-Z_-][\w-]*))\s*(?:([isIS])\s*)?)?\]/);
            if (!attribute) return null;
            tokens.push({ attribute: attribute[1].toLowerCase(), operator: attribute[2] || '',
                value: attribute[3] ?? attribute[4] ?? attribute[5] ?? '',
                insensitive: attribute[6] ? attribute[6].toLowerCase() === 'i' : undefined });
            remaining = remaining.slice(attribute[0].length);
        }
        if (!tag && !tokens.length) return null;
        parsed.push({ tag: tag && tag[0].toLowerCase(), tokens });
    }
    return parsed;
}

function demMatchDOMSelector(selector, element) {
    return demMatchDOMGroups(demParseDOMSelector(selector), element);
}

function demMatchDOMGroups(groups, element) {
    if (!groups || !element || typeof element !== 'object') return false;
    const tag = String(element.tagName || element.selector || '').toLowerCase();
    if (!/^[a-z][\w-]*$/.test(tag)) return false;

    // src/class/id may have complete top-level values while the serialized
    // attribute copy is truncated. Never treat an absent value as an attribute.
    const attributeValue = name => {
        const present = element.attributes && Object.hasOwn(element.attributes, name);
        if (Object.hasOwn(element, name) && element[name] !== null && element[name] !== undefined &&
            (present || String(element[name]) !== '')) return String(element[name]);
        if (present) return String(element.attributes[name]);
        return null;
    };
    return groups.some(group => (!group.tag || group.tag === '*' || group.tag === tag) && group.tokens.every(token => {
        let actual = attributeValue(token.attribute);
        if (actual === null) return false;
        if (!token.operator) return true;
        let expected = token.value;
        // HTML type values, including input's hidden state, are ASCII-insensitive
        // unless a selector explicitly asks for sensitive matching.
        if (token.insensitive === true || (token.insensitive !== false && token.attribute === 'type')) {
            actual = actual.replace(/[A-Z]/g, character => character.toLowerCase());
            expected = expected.replace(/[A-Z]/g, character => character.toLowerCase());
        }
        switch (token.operator) {
            case '=': return actual === expected;
            case '~=': return !!expected && !/[\t\n\f\r ]/.test(expected) && actual.split(/[\t\n\f\r ]+/).includes(expected);
            case '|=': return actual === expected || actual.startsWith(expected + '-');
            case '^=': return !!expected && actual.startsWith(expected);
            case '$=': return !!expected && actual.endsWith(expected);
            case '*=': return !!expected && actual.includes(expected);
            default: return false;
        }
    }));
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { demMatchPattern, demMatchPatternWithCapture, demMatchCookieName, demEscapeRegExp,
        demParseDOMSelector, demMatchDOMSelector, demMatchDOMGroups };
}
