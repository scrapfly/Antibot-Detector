/**
 * detection-engine-matching.js - extracted helpers for DetectionEngineManager.
 * Loaded before detection-engine-manager.js in classic script mode.
 */

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

function demMatchPattern(text, pattern, options = {}) {
    const {
        regex = false,
        wholeWord = false,
        caseSensitive = false
    } = options;

    if (!text || !pattern) {
        return false;
    }

    // Check result cache first (5-minute TTL)
    const cached = DetectionEngineManager.patternCache.getCachedMatch(text, pattern, options);
    if (cached.found) {
        return cached.result;
    }

    // Apply case sensitivity once
    const textToSearch = caseSensitive ? text : text.toLowerCase();
    const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

    let result = false;

    // Regex matching - use cached compiled pattern
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
    // Whole word matching - use cached compiled pattern
    else if (wholeWord) {
        const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { wholeWord: true, caseSensitive });
        if (compiledRegex) {
            result = compiledRegex.test(textToSearch);
        } else {
            // Fallback to direct matching if compilation failed
            const escapedPattern = this.escapeRegExp(patternToMatch);
            const wordBoundaryRegex = new RegExp(`\\b${escapedPattern}\\b`, caseSensitive ? 'g' : 'gi');
            result = wordBoundaryRegex.test(textToSearch);
        }
    }
    // Simple includes matching (fastest - no regex needed)
    else {
        result = textToSearch.includes(patternToMatch);
    }

    // Cache the result for 5 minutes
    DetectionEngineManager.patternCache.cacheMatch(text, pattern, options, result);
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
            // Regex matching - find the actual matched substring
            const flags = caseSensitive ? 'g' : 'gi';
            const compiledRegex = new RegExp(patternToMatch, flags);
            const match = compiledRegex.exec(text);
            return match ? match[0] : null;
        }
        else if (wholeWord) {
            // Whole word matching
            const escapedPattern = this.escapeRegExp(patternToMatch);
            const wordBoundaryRegex = new RegExp(`\\b${escapedPattern}\\b`, caseSensitive ? 'g' : 'gi');
            const match = wordBoundaryRegex.exec(text);
            return match ? match[0] : null;
        }
        else {
            // Simple substring matching - return the actual substring from original text
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
