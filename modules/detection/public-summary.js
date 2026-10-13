/** The page API exposes conclusions; extension-only evidence stays private. */
(function(root) {
    'use strict';
    const methods = new Set(['cookie', 'cookies', 'header', 'headers', 'url', 'urls',
        'content', 'dom', 'window', 'windowProperties', 'js_hooks', 'jsHooks', 'payload', 'complete']);
    const text = value => typeof value === 'string' ? value : '';
    const number = value => Number.isFinite(value) ? value : 0;
    const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    const methodList = value => strings(value).filter(method => methods.has(method));

    function detection(value) {
        if (!value || typeof value !== 'object') return null;
        const detector = value.detector || {};
        return {
            detected: value.detected === true,
            detector: { id: text(detector.id || value.id), name: text(detector.name || value.name) },
            category: text(value.category),
            confidence: number(value.confidence),
            difficulty: typeof value.difficulty === 'string' ? value.difficulty : number(value.difficulty),
            detectionMethods: methodList(value.detectionMethods),
            // Never copy patterns, values, sources, or arbitrary vendor metadata.
            matches: (Array.isArray(value.matches) ? value.matches : []).filter(Boolean).map(match => ({
                type: methods.has(match.type) ? match.type : '',
                confidence: number(match.confidence),
                patternId: text(match.patternId),
                patternIds: strings(match.patternIds)
            })),
            combinations: (Array.isArray(value.combinations) ? value.combinations : []).filter(Boolean).map(item => ({
                id: text(item.id), confidence: number(item.confidence),
                found: strings(item.found), made: strings(item.made)
            }))
        };
    }

    function project(eventName, data = {}) {
        const result = { timestamp: typeof data.timestamp === 'number' ? data.timestamp : text(data.timestamp) };
        if (typeof data.url === 'string') result.url = data.url;
        if (eventName === 'onDetection') {
            result.detections = (Array.isArray(data.detections) ? data.detections : []).map(detection).filter(Boolean);
            result.detectionCount = result.detections.length;
            result.fromCache = data.fromCache === true;
            if (['domain', 'path', 'full', 'url', 'full_url'].includes(data.cacheScope)) result.cacheScope = data.cacheScope;
        } else if (eventName === 'ready') {
            result.enabled = data.enabled === true;
            result.version = text(data.version);
        } else if (eventName === 'onStart') {
            result.fromCache = data.fromCache === true;
            if (['cache_miss', 'manual'].includes(data.trigger)) result.trigger = data.trigger;
        } else if (eventName === 'onProgress') {
            result.method = methods.has(data.method) ? data.method : '';
            result.completedMethods = methodList(data.completedMethods);
            result.message = result.method ? `Checked ${result.method}` : '';
        } else if (eventName === 'onError') {
            result.error = 'Detection failed';
        } else if (eventName === 'onHooksComplete') {
            for (const key of ['totalDetections', 'uniqueHooks', 'completionTime']) result[key] = number(data[key]);
            const reasons = Object.values(root.ScrapflyBridgeProtocol?.COMPLETION_REASONS?.HOOKS || {});
            if (reasons.includes(data.completionReason)) result.completionReason = data.completionReason;
            if (data.uninstallStats) result.uninstallStats = {
                total: number(data.uninstallStats.total), successes: number(data.uninstallStats.successes),
                failures: number(data.uninstallStats.failures)
            };
        } else if (eventName === 'onWindowPropsComplete') {
            for (const key of ['detectedCount', 'totalChecked', 'elapsedMs']) result[key] = number(data[key]);
            const reasons = Object.values(root.ScrapflyBridgeProtocol?.COMPLETION_REASONS?.WINDOW || {});
            if (reasons.includes(data.reason)) result.reason = data.reason;
        }
        return result;
    }
    root.PublicDetectionSummary = Object.freeze({ project });
})(globalThis);
