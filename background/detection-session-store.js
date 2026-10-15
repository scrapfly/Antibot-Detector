/** Owns scan identity and timers, so old asynchronous work cannot finish a newer scan. */
class DetectionSessionStore {
    static nextId = 0;

    static isCurrent(tabId, state) {
        return !!state && detectionStates.get(tabId) === state && !state.interrupted && !state.failed &&
            (!state.activeDetection || activeDetections.get(tabId) === state.activeDetection);
    }

    static clearTimers(tabId, state) {
        if (!state) return;
        for (const timer of (state.timers || new Map()).values()) {
            clearTimeout(timer);
            if (finalizationDebounce.get(tabId) === timer) finalizationDebounce.delete(tabId);
        }
        state.timers?.clear();
    }

    static schedule(tabId, state, kind, callback, delay) {
        if (!this.isCurrent(tabId, state)) return null;
        state.timers ||= new Map();
        const previous = state.timers.get(kind);
        if (previous !== undefined) clearTimeout(previous);
        const timer = setTimeout(async () => {
            if (!this.isCurrent(tabId, state) || state.timers.get(kind) !== timer) return;
            state.timers.delete(kind);
            if (finalizationDebounce.get(tabId) === timer) finalizationDebounce.delete(tabId);
            try { await callback(); } catch (error) { Logger.error('BACKGROUND', 'Scan timer failed', error); }
        }, delay);
        state.timers.set(kind, timer);
        if (kind === 'finalization') finalizationDebounce.set(tabId, timer);
        return timer;
    }

    static cancel(tabId, reason = 'cancelled', expected = detectionStates.get(tabId)) {
        if (expected && detectionStates.get(tabId) !== expected) return false;
        if (expected) {
            expected.interrupted = true;
            expected.error = reason;
            this.clearTimers(tabId, expected);
            if (workerKeepaliveManager && expected.keepaliveId) workerKeepaliveManager.endOperation(expected.keepaliveId);
        }
        const active = activeDetections.get(tabId);
        active?.abortController?.abort();
        activeDetections.delete(tabId);
        detectionStates.delete(tabId);
        batchProcessingFlags.delete(tabId);
        return true;
    }

    static fail(tabId, state, error) {
        if (!this.isCurrent(tabId, state)) return false;
        this.clearTimers(tabId, state);
        if (workerKeepaliveManager && state.keepaliveId) workerKeepaliveManager.endOperation(state.keepaliveId);
        state.failed = true;
        state.finalized = false;
        state.error = error?.message || String(error);
        state.activeDetection?.abortController?.abort();
        activeDetections.delete(tabId);
        batchProcessingFlags.delete(tabId);
        if (typeof stopBadgeSpinner === 'function') stopBadgeSpinner(tabId);
        chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
        return true;
    }

    static getOrCreate(tabId, url) {
        let state = detectionStates.get(tabId);
        if (state && (state.url !== url || state.interrupted)) {
            this.cancel(tabId, 'url_changed', state);
            state = null;
        }
        if (!state) {
            const startTime = Date.now();
            const sessionId = ++this.nextId;
            state = {
                sessionId, url, tabTitle: null, hooksData: new Map(), mainData: [], completedMethods: new Set(),
                methodOrder: ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'],
                hooksComplete: false, mainComplete: false, windowPropertiesComplete: false,
                lastHookBatchTime: 0, startTime, hooksDeadline: getHooksDeadline(startTime),
                hooksMaxMs: cachedHooksConfig.MAX_DETECTION_MS, hooksDeadlineSource: 'default',
                hooksTimedOut: false, hooksCompletionReason: null, hooksCompletionTime: null,
                hooksUninstallStats: null, timers: new Map(), keepaliveId: `detection-${tabId}-${sessionId}`
            };
            detectionStates.set(tabId, state);
            if (workerKeepaliveManager) workerKeepaliveManager.startOperation(state.keepaliveId, { tabId, reason: 'page_detection' });
        }
        return state;
    }

    static begin(tabId, url) {
        const previous = detectionStates.get(tabId);
        if (previous && (previous.mainStarted || previous.finalized)) this.cancel(tabId, 'superseded', previous);
        const state = this.getOrCreate(tabId, url);
        state.mainStarted = true;
        state.activeDetection = { url, startTime: state.startTime, sessionId: state.sessionId, abortController: new AbortController() };
        activeDetections.set(tabId, state.activeDetection);
        interruptedDetections.delete(tabId);
        return state;
    }

    static finish(tabId, state) {
        // Always release this operation, never all operations for the tab.
        this.clearTimers(tabId, state);
        if (workerKeepaliveManager && state.keepaliveId) workerKeepaliveManager.endOperation(state.keepaliveId);
        if (!this.isCurrent(tabId, state)) return false;
        activeDetections.delete(tabId);
        interruptedDetections.delete(tabId);
        detectionStates.delete(tabId);
        batchProcessingFlags.delete(tabId);
        for (const store of [payloadStore, networkUrlsStore, headersStore, requestHeadersStore, responseCookiesStore]) store.delete(tabId);
        if (typeof responseStore !== 'undefined') responseStore.delete(tabId);
        return true;
    }
}

function getOrCreateDetectionState(tabId, url) {
    return DetectionSessionStore.getOrCreate(tabId, url);
}

if (typeof globalThis !== 'undefined') globalThis.DetectionSessionStore = DetectionSessionStore;
