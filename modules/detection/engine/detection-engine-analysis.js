// Detection analysis helpers for DetectionEngineManager

function demAnalyzeUsedMethods() {
    const now = Date.now();
    if (this.analyzedMethodsCache && (now - this.analyzedMethodsCacheTime) < this.ANALYSIS_CACHE_TTL) {
        return this.analyzedMethodsCache;
    }

    const usedMethods = {
        cookie: false,
        header: false,
        content: false,
        dom: false,
        url: false,
        window: false,
        js_hooks: false,
        payload: false
    };

    usedMethods.url = true;

    if (!this.detectors) {
        Logger.warn('DETECTION', '[C.1] No detectors loaded, will collect all data types');
        const fullMethods = {
            cookie: true, header: true, content: true, dom: true,
            url: true, window: true, js_hooks: true, payload: true
        };
        this.analyzedMethodsCache = fullMethods;
        this.analyzedMethodsCacheTime = now;
        return fullMethods;
    }

    for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
        for (const [detectorId, detector] of Object.entries(categoryDetectors)) {
            const detection = detector.detection || {};

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

    this.analyzedMethodsCache = usedMethods;
    this.analyzedMethodsCacheTime = now;

    Logger.detection('[C.1] Detection methods analysis:', usedMethods);
    return usedMethods;
}


function demNeedsExternalContent() {
    if (!this.detectors) return false;

    for (const categoryDetectors of Object.values(this.detectors)) {
        for (const detector of Object.values(categoryDetectors)) {
            if (detector.enabled === false) continue;

            const contentPatterns = detector.detection?.content;
            if (contentPatterns && Array.isArray(contentPatterns)) {
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
            // Skip disabled detectors
            if (detector.enabled === false) continue;

            // Priority: 3=fast (cookie/url/header), 2=medium (content), 1=slow (DOM)
            let priority = 0;
            const detection = detector.detection || {};

            if (detection.cookie?.length > 0) priority = Math.max(priority, 3);
            if (detection.url?.length > 0) priority = Math.max(priority, 3);
            if (detection.header?.length > 0) priority = Math.max(priority, 3);
            if (detection.content?.length > 0) priority = Math.max(priority, 2);
            if (detection.dom?.length > 0) priority = Math.max(priority, 1);

            priorities.push({
                category,
                detectorName,
                detector,
                priority
            });
        }
    }

    priorities.sort((a, b) => b.priority - a.priority);
    this.precomputedPriorities = priorities;

    Logger.detection(`[Phase 1 Optimization] Pre-computed priorities for ${priorities.length} detectors`);
}
