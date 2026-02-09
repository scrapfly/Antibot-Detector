/**
 * detection-engine-analysis.js - extracted helpers for DetectionEngineManager.
 * Loaded before detection-engine-manager.js in classic script mode.
 */

function demAnalyzeUsedMethods() {
    // Cache analyzeUsedMethods results
    // Check if cache is still valid (TTL: 5 minutes, invalidated when detectors change)
    const now = Date.now();
    if (this.analyzedMethodsCache && (now - this.analyzedMethodsCacheTime) < this.ANALYSIS_CACHE_TTL) {
        return this.analyzedMethodsCache;
    }

    const usedMethods = {
        cookie: false,
        header: false,
        content: false,
        dom: false,
        url: false, // Always true - URLs are cheap to check
        window: false,
        js_hooks: false,
        payload: false
    };

    // Always check URLs (cheap and universal)
    usedMethods.url = true;

    // Scan all detectors to see which methods they use
    if (!this.detectors) {
        Logger.warn('DETECTION', '[C.1] No detectors loaded, will collect all data types');
        const fullMethods = {
            cookie: true, header: true, content: true, dom: true,
            url: true, window: true, js_hooks: true, payload: true
        };
        // Cache even the fallback case
        this.analyzedMethodsCache = fullMethods;
        this.analyzedMethodsCacheTime = now;
        return fullMethods;
    }

    for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
        for (const [detectorId, detector] of Object.entries(categoryDetectors)) {
            const detection = detector.detection || {};

            // Check each detection method
            if (detection.cookie && detection.cookie.length > 0) usedMethods.cookie = true;
            if (detection.header && detection.header.length > 0) usedMethods.header = true;
            if (detection.content && detection.content.length > 0) usedMethods.content = true;
            if (detection.dom && detection.dom.length > 0) usedMethods.dom = true;
            if (detection.url && detection.url.length > 0) usedMethods.url = true;
            if (detection.window && detection.window.length > 0) usedMethods.window = true;
            if (detection.js_hooks && detection.js_hooks.length > 0) usedMethods.js_hooks = true;
            if (detection.payload && detection.payload.length > 0) usedMethods.payload = true;
        }
    }

    // Cache the result for 5 minutes (automatically invalidated when detectors change)
    this.analyzedMethodsCache = usedMethods;
    this.analyzedMethodsCacheTime = now;

    Logger.detection('[C.1] Detection methods analysis:', usedMethods);
    return usedMethods;
}


function demNeedsExternalContent() {
    if (!this.detectors) return false;

    // Check if any detector has content patterns with checkScripts enabled
    for (const categoryDetectors of Object.values(this.detectors)) {
        for (const detector of Object.values(categoryDetectors)) {
            if (detector.enabled === false) continue;

            const contentPatterns = detector.detection?.content;
            if (contentPatterns && Array.isArray(contentPatterns)) {
                // If any pattern has checkScripts or no restrictions (searches all content)
                for (const pattern of contentPatterns) {
                    if (pattern.checkScripts === true || !pattern.checkScripts) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}


function demPrecomputePriorities() {
    if (!this.detectors) {
        this.precomputedPriorities = [];
        return;
    }

    const priorities = [];

    for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
        for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
            // Skip disabled detectors at pre-compute time
            if (detector.enabled === false) continue;

            // Calculate priority based on detection methods
            let priority = 0;
            const detection = detector.detection || {};

            // Fast checks (priority 3): cookies, URLs, headers (1-2ms each)
            if (detection.cookie?.length > 0) priority = Math.max(priority, 3);
            if (detection.url?.length > 0) priority = Math.max(priority, 3);
            if (detection.header?.length > 0) priority = Math.max(priority, 3);

            // Medium checks (priority 2): content patterns (10-50ms)
            if (detection.content?.length > 0) priority = Math.max(priority, 2);

            // Slow checks (priority 1): DOM selectors (20-100ms)
            if (detection.dom?.length > 0) priority = Math.max(priority, 1);

            priorities.push({
                category,
                detectorName,
                detector,
                priority
            });
        }
    }

    // Sort once by priority (high to low)
    priorities.sort((a, b) => b.priority - a.priority);

    // Store for reuse
    this.precomputedPriorities = priorities;

    Logger.detection(`[Phase 1 Optimization] Pre-computed priorities for ${priorities.length} detectors`);
}
