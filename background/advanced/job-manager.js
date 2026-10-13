/** Worker-owned jobs. Resource cleanup belongs to one request, never an entire tab. */
(function (global) {
    const active = new Map();
    const recent = new Map();
    const captureJobs = new WeakMap();
    const keyFor = ({ tabId, vendorId, operation }) => `${tabId}:${vendorId}:${operation}`;
    function snapshot(job) {
        return { requestId: job.requestId, tabId: job.tabId, vendorId: job.vendorId,
            operation: job.operation, status: job.status, startedAt: job.startedAt,
            ...(job.data === undefined ? {} : { data: job.data }) };
    }
    function current(tabId, vendorId, operation = 'capture') {
        return active.get(keyFor({ tabId, vendorId, operation }));
    }
    function begin(options) {
        if (!Number.isInteger(options.tabId) || options.tabId < 0) throw new Error('Invalid Advanced tab');
        const vendorId = AdvancedVendorRegistry.canonical(options.vendorId);
        if (!AdvancedVendorRegistry.vendors[vendorId]) throw new Error('Unknown Advanced vendor');
        const key = keyFor({ ...options, vendorId });
        const existing = active.get(key);
        if (existing) return { job: existing, reused: true };
        const cleanups = new Set();
        const job = { ...options, vendorId, requestId: options.requestId || AdvancedResultModel.requestId(),
            startedAt: Date.now(), status: 'running', finished: false, cleanups };
        job.addCleanup = fn => {
            if (job.finished) { fn(); return; }
            cleanups.add(fn);
        };
        job.setTimer = (fn, delay) => {
            const timer = setTimeout(() => { cleanups.delete(dispose); if (!job.finished) fn(); }, delay);
            const dispose = () => clearTimeout(timer);
            job.addCleanup(dispose);
            return timer;
        };
        job.finish = (status = 'completed', data) => {
            if (job.finished || active.get(key) !== job) return false;
            job.finished = true;
            job.status = status;
            job.data = data;
            active.delete(key);
            for (const dispose of cleanups) {
                try { dispose(); } catch (error) { Logger.error('NETWORK', '[AdvancedJob] Cleanup failed:', error); }
            }
            cleanups.clear();
            recent.set(key, snapshot(job));
            while (recent.size > 100) recent.delete(recent.keys().next().value);
            if (options.onFinish) {
                Promise.resolve().then(() => options.onFinish(snapshot(job)))
                    .catch(error => Logger.error('NETWORK', '[AdvancedJob] Completion failed:', error));
            }
            return true;
        };
        active.set(key, job);
        if (options.timeoutMs > 0) job.setTimer(() => job.finish('timeout'), options.timeoutMs);
        return { job, reused: false };
    }
    function cancelTab(tabId, reason = 'cancelled') {
        for (const job of Array.from(active.values())) if (job.tabId === tabId) job.finish(reason);
    }
    function handleNavigation(tabId, changeInfo) {
        if (!changeInfo?.url) return;
        for (const job of Array.from(active.values())) {
            // The requested reload keeps the exact URL. Moving to another page cancels it.
            if (job.tabId === tabId && job.url && changeInfo.url !== job.url) job.finish('cancelled');
        }
    }
    function state(tabId, vendorId, operation) {
        const key = keyFor({ tabId, vendorId: AdvancedVendorRegistry.canonical(vendorId), operation });
        return active.has(key) ? snapshot(active.get(key)) : recent.get(key) || null;
    }
    chrome.tabs.onRemoved?.addListener(tabId => cancelTab(tabId));
    chrome.tabs.onUpdated?.addListener(handleNavigation);
    function message(vendorId, tabId, payload, operation = 'capture') {
        const identity = state(tabId, vendorId, operation);
        return { ...payload, tabId, vendorId, operation,
            ...(identity ? { requestId: identity.requestId } : {}) };
    }
    // Snapshot the owner before persistence or other async completion work.
    // Never relabel a late result using the next capture on the same tab.
    function captureIdentity(captureState, tabId, vendorId) {
        const job = captureState && captureJobs.get(captureState);
        return Object.freeze(job ? snapshot(job) : { tabId, vendorId, operation: 'capture' });
    }
    function completionMessage(identity, payload) {
        return { ...payload, tabId: identity.tabId, vendorId: identity.vendorId,
            operation: identity.operation, ...(identity.requestId ? { requestId: identity.requestId } : {}) };
    }
    function bindCaptureState(state, job) { captureJobs.set(state, job); }
    function finishCaptureState(state) { captureJobs.get(state)?.finish('completed'); }
    global.AdvancedJobManager = Object.freeze({ begin, current, state, snapshot, cancelTab, handleNavigation,
        bindCaptureState, finishCaptureState, captureIdentity, completionMessage, message });
})(globalThis);
