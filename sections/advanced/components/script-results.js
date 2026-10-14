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
     * @param {Function} [options.beforeReload] - e.g. delete a cookie first
     */
    async startScriptAnalysis({ notice, beforeReload } = {}) {
        const K = BaseAdvancedModule;
        const tabId = this.tabInfo && this.tabInfo.id;
        if (!tabId) throw new Error('Tab information not available');
        const prefix = String(this.moduleName || '').toUpperCase();
        let requestId = null;
        const listener = (message) => {
            if (!message || message.type !== `${prefix}_ANALYSIS_RESULT` || message.tabId !== tabId) return;
            if (requestId && message.requestId !== requestId) return;
            AdvancedToolClient.unsubscribe(listener);
            if (message.status !== 'completed') {
                NotificationHelper.error(message.error || K._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
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
        NotificationHelper.info(notice || K._fmt('advCommonAnalyzingReloadFmt', `Analyzing ${this.displayName} scripts... Page will reload`, this.displayName));
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (typeof beforeReload === 'function') {
                try { await beforeReload(); } catch (error) { Logger.error('NETWORK', `[${this.moduleName}] Before reload failed:`, error); }
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
        const cards = scripts.map(script => K.kitCard(
            // Long URLs show a few lines; copying gives the whole URL
            K.kitField(K._tr('advCommonUrl', 'URL'), script.url, { clamp: true }),
            K.kitChip(typeLabel(script.type), 'blue')
            + (RESOURCE_LABELS[script.resourceType] ? K.kitChip(RESOURCE_LABELS[script.resourceType], 'neutral') : '')
        )).join('');
        const body = scripts.length
            ? cards
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

    static hostOf(url) {
        try { return new URL(url).hostname; } catch (_) { return ''; }
    }
}
for (const name of ['startScriptAnalysis', 'showScriptResults']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedScriptResults.prototype, name));
}
BaseAdvancedModule.SCRIPT_RESOURCE_LABELS = RESOURCE_LABELS;
})();
