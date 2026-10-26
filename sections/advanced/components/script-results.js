/** Shared Advanced ScriptResults capability: start an Analyze Scripts run and show its result. */
(function () {
// Request kinds from webRequest, shown as a small second chip
const RESOURCE_LABELS = { script: 'script', xmlhttprequest: 'xhr', sub_frame: 'frame', main_frame: 'page', ping: 'ping', fetch: 'fetch' };
const SCRIPTS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/></svg>';

class AdvancedScriptResults {
    /**
     * Analyze Scripts: ask the worker to watch the tab, reload it, and show the
     * scripts it saw when its result arrives. Returns { awaitingResult: true }
     * once the page is reloading, so the tool card stays busy until then.
     * @param {object} [options]
     * @param {string} [options.notice] - notification shown before the reload
     * @param {string[]} [options.clearCookies] - cookies deleted before the reload: once
     *   its clearance cookie is set, a protection stops sending its scripts
     */
    async startScriptAnalysis({ notice, clearCookies = [] } = {}) {
        const K = BaseAdvancedModule;
        const tabId = this.tabInfo && this.tabInfo.id;
        if (!tabId) throw new Error('Tab information not available');
        const prefix = String(this.moduleName || '').toUpperCase();
        // First what the page already loaded: no reload, so the popup stays open and shows the result at once. Only a
        // page where nothing of the vendor is found (it ran before the extension, or loads its scripts on demand) is
        // reloaded and watched, which closes the popup (the result then waits in History)
        try {
            const loaded = typeof AdvancedMessageTypes !== 'undefined' && AdvancedMessageTypes.ADVANCED_LOADED_SCRIPTS
                ? await AdvancedUtils.sendMessage({ type: AdvancedMessageTypes.ADVANCED_LOADED_SCRIPTS, tabId, vendorId: String(this.moduleName || '').toLowerCase() })
                : null;
            if (loaded && loaded.status === 'ok' && Array.isArray(loaded.data && loaded.data.scripts) && loaded.data.scripts.length) {
                this.displayAnalysisModal({ ...loaded.data, _advancedPersisted: true });
                return { awaitingResult: false };
            }
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Loaded scripts unavailable, reloading instead:`, error);
        }
        let requestId = null;
        const listener = (message) => {
            if (!message || message.type !== `${prefix}_ANALYSIS_RESULT` || message.tabId !== tabId) return;
            if (requestId && message.requestId !== requestId) return;
            AdvancedToolClient.unsubscribe(listener);
            if (message.status !== 'completed') {
                NotificationHelper.error(message.error || AdvancedScriptResults.endedMessage(message.status));
                return;
            }
            const data = message.data || { scripts: [] };
            data._advancedPersisted = true;
            this.displayAnalysisModal(data);
        };
        this._analysisDispose?.();
        this._analysisDispose = AdvancedToolClient.subscribe(listener);
        let response;
        try {
            response = await AdvancedUtils.sendMessage({ type: `${prefix}_START_ANALYSIS`, tabId, url: this.tabInfo.url });
        } catch (error) {
            this._analysisDispose?.();
            throw error;
        }
        requestId = response && response.requestId;
        if (!response || response.status !== 'started') {
            this._analysisDispose?.();
            NotificationHelper.error(K._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
            return { awaitingResult: false };
        }
        const cookieNames = clearCookies.join(', ');
        NotificationHelper.info(notice || (cookieNames
            ? K._fmt('advCommonDeletingCookieFmt', `Deleting ${cookieNames} cookie... Page will reload`, cookieNames)
            : K._fmt('advCommonAnalyzingReloadFmt', `Analyzing ${this.displayName} scripts... Page will reload`, this.displayName)));
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            for (const name of clearCookies) {
                try {
                    // Cloudflare's cf_clearance is a partitioned cookie
                    const cookies = await PageCookies.getAll({ url: this.tabInfo.url, name }, tabId);
                    for (const cookie of cookies) await PageCookies.remove(this.tabInfo.url, cookie);
                } catch (error) { Logger.error('NETWORK', `[${this.moduleName}] Could not delete ${name}:`, error); }
            }
            await chrome.tabs.reload(tabId);
        } catch (error) {
            // The tool card reports it; no late result window for a reload that never happened
            this._analysisDispose?.();
            throw error;
        }
        return { awaitingResult: true };
    }

    /**
     * What the page already loaded, in the vendor's own result shape (GeeTest, Imperva and Shape Security, whose
     * Analyze Scripts used to always reload): nothing is reloaded, so the popup stays open and can show it at once.
     * @returns {Promise<object|null>} the result data; null when nothing of the vendor is found or the worker cannot
     *   tell, and then the vendor's own reload flow runs (which closes the popup)
     */
    async loadedPageResult() {
        const tabId = this.tabInfo && this.tabInfo.id;
        if (!tabId || typeof AdvancedMessageTypes === 'undefined' || !AdvancedMessageTypes.ADVANCED_LOADED_SCRIPTS) return null;
        try {
            const loaded = await AdvancedUtils.sendMessage({ type: AdvancedMessageTypes.ADVANCED_LOADED_SCRIPTS, tabId,
                vendorId: String(this.moduleName || '').toLowerCase() });
            return loaded && loaded.status === 'ok' && loaded.found === true && loaded.data ? loaded.data : null;
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Loaded scripts unavailable, reloading instead:`, error);
            return null;
        }
    }

    /**
     * The Analyze Scripts result window: one card per captured URL with its
     * type, the empty note, and Export Code for the URLs.
     * @param {object} data - { scripts: [{ url, type, resourceType }] }
     * @param {object} [options]
     * @param {string} [options.vendor] - product name for the title
     * @param {Function} [options.label] - type -> display label
     */
    showScriptResults(data, { vendor, label } = {}) {
        const K = BaseAdvancedModule;
        const name = vendor || this.displayName || this.moduleName;
        const scripts = (Array.isArray(data && data.scripts) ? data.scripts : []).filter(script => script && script.url);
        this.recordStructuredResult('displayAnalysisModal', data);
        const typeLabel = (type) => {
            const shown = typeof label === 'function' ? label(type) : '';
            return shown || String(type || name);
        };
        // One list, one row per address: its type chips, then the address (the page's own host left out, the
        // subtitle names it) in two lines at most; the whole row copies the whole address
        const pageHost = this.tabInfo && this.tabInfo.url ? AdvancedScriptResults.hostOf(this.tabInfo.url) : '';
        const copyTitle = FormatUtils.escapeAttr(K._tr('advCommonClickToCopy', 'Click to copy'));
        const rows = scripts.map(script => {
            const place = AdvancedScriptResults.placeOf(script.url, pageHost);
            return `
            <button type="button" class="adv-script-row" data-copy="${FormatUtils.escapeAttr(script.url)}" title="${copyTitle}">
                <span class="adv-script-top">
                    ${K.kitChip(typeLabel(script.type), 'blue')}${RESOURCE_LABELS[script.resourceType] ? K.kitChip(RESOURCE_LABELS[script.resourceType], 'neutral') : ''}
                    ${place.host ? `<span class="adv-script-host">${FormatUtils.escapeHtml(place.host)}</span>` : ''}
                    <svg class="adv-script-copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                </span>
                <span class="adv-script-path" dir="ltr">${FormatUtils.escapeHtml(place.path)}</span>
            </button>`;
        }).join('');
        const body = scripts.length
            ? `<div class="adv-script-list">${rows}</div>`
            : K.kitNote(K._fmt('advPanelNoScriptsFmt', `No ${name} scripts found`, name));
        return this.openKitModal({
            title: K._fmt('advCommonScriptsTitleFmt', `${name} Scripts (${scripts.length})`, name, scripts.length),
            subtitle: this.tabInfo && this.tabInfo.url ? AdvancedScriptResults.hostOf(this.tabInfo.url) : '',
            iconSvg: SCRIPTS_ICON,
            body,
            copiedMessage: K._tr('advCommonUrlCopied', 'URL copied'),
            actions: scripts.length ? [{
                label: K._tr('advCommonExportCode', 'Export Code'),
                primary: true,
                onClick: () => AdvancedCodeDialog.openScriptUrls(this, name, scripts)
            }] : [],
            record: false
        });
    }

    /** What to say when an analysis ended without a result: it did start. */
    static endedMessage(status) {
        const K = BaseAdvancedModule;
        if (status === 'cancelled') {
            return K._tr('advCommonAnalysisCancelled', 'Analysis stopped: the tab moved to another page before it finished');
        }
        if (status === 'timeout') {
            return K._tr('advCommonAnalysisTimedOut', 'Analysis timed out: the page did not reload in time');
        }
        return K._tr('advCommonFailedStartAnalysis', 'Failed to start analysis');
    }

    /** Where an address points: its path (with the query) alone on the page's own host, else its host too. */
    static placeOf(url, pageHost = '') {
        try {
            const parsed = new URL(url);
            const path = `${parsed.pathname}${parsed.search}` || '/';
            return parsed.hostname === pageHost ? { host: '', path } : { host: parsed.hostname, path };
        } catch (_) {
            return { host: '', path: String(url) };
        }
    }

    static hostOf(url) {
        try { return new URL(url).hostname; } catch (_) { return ''; }
    }
}
for (const name of ['startScriptAnalysis', 'loadedPageResult', 'showScriptResults']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedScriptResults.prototype, name));
}
})();
