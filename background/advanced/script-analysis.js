/** Common bounded network observation for vendor script analyzers. */
(function (global) {
    function start({ tabId, url, vendorId, requestId, classify }) {
        const captured = new Map();
        const { job, reused } = AdvancedJobManager.begin({ tabId, url, vendorId, requestId,
            operation: 'analysis', timeoutMs: 30000,
            async onFinish(result) {
                const scripts = Array.from(captured.values());
                const data = { scripts, scriptCount: scripts.length };
                const message = { ...result, type: `${vendorId.toUpperCase()}_ANALYSIS_RESULT`, data };
                if (result.status === 'completed') {
                    try { await saveToHistory(tabId, AdvancedResultModel.create({ vendorId,
                        operation: 'analysis', data, id: result.requestId }), {
                        type: vendorId, id: result.requestId, expiryMinutes: 30
                    }); } catch (error) {
                        message.status = 'error';
                        message.error = error.message;
                    }
                }
                try { await chrome.runtime.sendMessage(message); } catch (_) { /* Reopening reads worker history. */ }
            }
        });
        if (reused) return { ...AdvancedJobManager.snapshot(job), status: 'started', reused: true };
        const requestListener = details => {
            if (job.finished || details.tabId !== tabId) return;
            const type = classify(details.url);
            if (type) captured.set(details.url, { url: details.url, type, source: 'network' });
        };
        let observationStarted = false;
        const navigationListener = details => {
            if (job.finished || observationStarted || details.tabId !== tabId || details.frameId !== 0) return;
            observationStarted = true;
            job.setTimer(() => job.finish('completed'), 5000);
        };
        try {
            chrome.webRequest.onBeforeRequest.addListener(requestListener, { urls: ['<all_urls>'], tabId }, []);
            job.addCleanup(() => chrome.webRequest.onBeforeRequest.removeListener(requestListener));
            chrome.webNavigation.onCompleted.addListener(navigationListener);
            job.addCleanup(() => chrome.webNavigation.onCompleted.removeListener(navigationListener));
        } catch (error) {
            job.finish('failed');
            return { ...AdvancedJobManager.snapshot(job), status: 'error', error: error.message };
        }
        return { ...AdvancedJobManager.snapshot(job), status: 'started' };
    }
    global.AdvancedScriptAnalysis = Object.freeze({ start });
})(globalThis);
