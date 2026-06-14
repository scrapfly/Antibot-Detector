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

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { demMatchPattern, demMatchPatternWithCapture, demMatchCookieName, demEscapeRegExp };
}
