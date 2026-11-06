/** Popup history facade. Only the service worker may mutate Advanced history. */
(function (global) {
    /**
     * Why the worker gave no history, when it did not say: a worker that does not know the question (status "unknown") was
     * not reloaded after the extension was updated, which the person can fix; any other answer is named by its status.
     */
    function unavailable(response) {
        const status = response && typeof response.status === 'string' ? response.status : '';
        if (status === 'unknown' && typeof FormatUtils !== 'undefined' && typeof FormatUtils.t === 'function') {
            return FormatUtils.t('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again.");
        }
        return status ? `Advanced history unavailable (${status})` : 'Advanced history unavailable';
    }

    function call(method, args = []) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: AdvancedMessageTypes.ADVANCED_HISTORY, method, args }, response => {
                const error = chrome.runtime.lastError;
                if (error || !response || response.status !== 'ok') {
                    reject(new Error(error?.message || response?.error || unavailable(response)));
                    return;
                }
                resolve(response.data);
            });
        });
    }
    global.AdvancedHistoryStore = Object.freeze({
        STORAGE_KEY: 'scrapfly_advanced_history',
        load: (...args) => call('load', args),
        getModule: (...args) => call('getModule', args),
        appendCapture: (...args) => call('appendCapture', args),
        deleteCapture: (...args) => call('deleteCapture', args),
        clear: (...args) => call('clear', args),
        pruneExpired: () => call('pruneExpired')
    });
})(window);
