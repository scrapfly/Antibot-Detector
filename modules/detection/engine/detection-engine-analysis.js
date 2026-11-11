// Detection analysis helpers for DetectionEngineManager

/**
 * The rules of one method that are on. A rule's own `enabled: false` leaves it out (JS hooks and response capture honour it,
 * and so do matching and collection).
 * @param {object} detection - a detector's `detection`
 * @param {string} method - 'cookie', 'content', 'dom', ...
 * @returns {object[]}
 */
function demEnabledRules(detection, method) {
    const rules = detection && detection[method];
    return Array.isArray(rules) ? rules.filter(rule => rule && rule.enabled !== false) : [];
}

/** A content rule limited to scripts reads script source only; any other also reads the page text and the stylesheets (runDetector tests it the same way). */
function demContentRuleIsScripts(rule) {
    return rule.scope === 'scripts' || rule.checkScripts === true;
}

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
            // A detector that is off uses nothing (demNeedsExternalContent and demPrecomputePriorities skip it too)
            if (detector.enabled === false) continue;
            const detection = detector.detection || {};
            const used = (method) => demEnabledRules(detection, method).length > 0;

            if (used('cookie')) usedMethods.cookie = true;
            if (used('header')) usedMethods.header = true;
            if (used('content')) usedMethods.content = true;
            if (used('dom')) usedMethods.dom = true;
            if (used('url')) usedMethods.url = true;
            if (used('window')) usedMethods.window = true;
            if (used('js_hooks')) usedMethods.js_hooks = true;
            if (used('payload')) usedMethods.payload = true;
            // A URL rule that reads the addresses of the page's scripts (page and scripts, or all) reads them from the list the
            // content collection builds
            if (demEnabledRules(detection, 'url').some(rule => ['page_and_scripts', 'all'].includes(rule.textScope || 'all'))) usedMethods.content = true;
        }
    }

    this.analyzedMethodsCache = usedMethods;
    this.analyzedMethodsCacheTime = now;

    Logger.debug('DETECTION', 'Methods in use:', Object.keys(usedMethods).filter(k => usedMethods[k]));
    return usedMethods;
}


/** Whether the page's external scripts are fetched: any content rule that is on reads their source, scoped to scripts or not. */
function demNeedsExternalContent() {
    if (!this.detectors) return false;

    for (const categoryDetectors of Object.values(this.detectors)) {
        for (const detector of Object.values(categoryDetectors)) {
            if (detector.enabled === false) continue;
            if (demEnabledRules(detector.detection, 'content').length > 0) return true;
        }
    }

    return false;
}

/**
 * Whether any content rule that is on reads the page text and the stylesheets' text: one that is not limited to scripts (a
 * "Page content" rule, the editor's default). All 144 bundled content rules are limited to scripts and read neither, so a scan
 * does not fetch the stylesheets' text or serialise the page's HTML for them. With no detectors loaded everything is collected,
 * as demAnalyzeUsedMethods does.
 */
function demNeedsPageBodies() {
    if (!this.detectors) return true;

    for (const categoryDetectors of Object.values(this.detectors)) {
        for (const detector of Object.values(categoryDetectors)) {
            if (detector.enabled === false) continue;
            if (demEnabledRules(detector.detection, 'content').some(rule => !demContentRuleIsScripts(rule))) return true;
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
            // A rule that is off is no fast rule (demAnalyzeUsedMethods and the other readers leave it out the same way)
            const on = (method) => demEnabledRules(detection, method).length > 0;

            if (on('cookie')) priority = Math.max(priority, 3);
            if (on('url')) priority = Math.max(priority, 3);
            if (on('header')) priority = Math.max(priority, 3);
            if (on('content')) priority = Math.max(priority, 2);
            if (on('dom')) priority = Math.max(priority, 1);

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

    Logger.debug('DETECTION', `Ordered ${priorities.length} detectors`);
}
