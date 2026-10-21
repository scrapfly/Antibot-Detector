/**
 * The toolbar icon's hover text for a tab, set with the badge (worker only):
 *   "Scrapfly: Cloudflare 95%, DataDome 90%, +2 more"
 *   "Scrapfly: No protections found" · "Scrapfly: This site is not scanned" · "Scrapfly: Detection is switched off"
 * Pure: the texts come from the `tr(key, fallback, ...args)` it is given.
 */
(function(root) {
    'use strict';

    const ToolbarTitle = {
        /** manifest.json action.default_title: shown before a scan and after a reset */
        DEFAULT: 'Scrapfly: anti-bot detector',
        PREFIX: 'Scrapfly',
        SHOWN: 3,

        _tr(tr) {
            return typeof tr === 'function'
                ? tr
                : (key, fallback, ...args) => String(fallback).replace(/\{(\d)\}/g, (_, i) => args[Number(i)]);
        },

        _name(detection) {
            if (root.FormatUtils && typeof root.FormatUtils.detectorName === 'function') {
                return root.FormatUtils.detectorName(detection);
            }
            const d = detection && detection.detector;
            return String((d && typeof d === 'object' ? d.name || d.id : d) || (detection && (detection.name || detection.id)) || '').trim();
        },

        /**
         * @param {'found'|'clean'|'skipped'|'off'} state
         * @param {Array} detections - the page's results (state 'found')
         * @param {Function} [tr]
         */
        text(state, detections, tr) {
            const t = this._tr(tr);
            let body;
            if (state === 'off') body = t('toolbarTitleOff', 'Detection is switched off');
            else if (state === 'skipped') body = t('toolbarTitleSkipped', 'This site is not scanned');
            else {
                const seen = new Map();
                for (const detection of Array.isArray(detections) ? detections : []) {
                    const name = this._name(detection);
                    if (!name) continue;
                    const confidence = Math.round(Number(detection.confidence) || 0);
                    if (!seen.has(name) || seen.get(name) < confidence) seen.set(name, confidence);
                }
                if (seen.size === 0) body = t('toolbarTitleClean', 'No protections found');
                else {
                    const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
                    const shown = ranked.slice(0, this.SHOWN).map(([name, confidence]) => (confidence > 0 ? `${name} ${confidence}%` : name));
                    if (ranked.length > this.SHOWN) shown.push(t('toolbarTitleMoreFmt', '+{0} more', ranked.length - this.SHOWN));
                    body = shown.join(', ');
                }
            }
            return `${this.PREFIX}: ${body}`;
        },

        /** The worker's translator: I18n when it is loaded, the English fallback otherwise. */
        workerTr() {
            const I18n = root.I18n;
            return (key, fallback, ...args) => {
                const value = I18n && typeof I18n.format === 'function' ? I18n.format(key, ...args) : '';
                return value || String(fallback).replace(/\{(\d)\}/g, (_, i) => args[Number(i)]);
            };
        },

        /** Sets the title of a tab; never throws (a closed tab or an old browser). */
        /** tabId -> number of the latest apply/reset: a call that waited for the texts and was overtaken sets nothing */
        _turns: new Map(),

        async apply(chromeApi, tabId, state, detections) {
            if (!chromeApi || !chromeApi.action || typeof chromeApi.action.setTitle !== 'function') return null;
            const turn = (this._turns.get(tabId) || 0) + 1;
            this._turns.set(tabId, turn);
            if (root.I18n && typeof root.I18n.ready === 'function') await root.I18n.ready().catch(() => {});
            if (this._turns.get(tabId) !== turn) return null;
            const title = this.text(state, detections, this.workerTr());
            try { await chromeApi.action.setTitle({ tabId, title }); } catch (_) { return null; }
            return title;
        },

        /** Back to the manifest's title, as before a scan. */
        async reset(chromeApi, tabId) {
            if (!chromeApi || !chromeApi.action || typeof chromeApi.action.setTitle !== 'function') return;
            this._turns.set(tabId, (this._turns.get(tabId) || 0) + 1);
            if (this._turns.size > 500) this._turns.clear();
            try { await chromeApi.action.setTitle({ tabId, title: this.DEFAULT }); } catch (_) { /* closed tab */ }
        }
    };

    root.ToolbarTitle = ToolbarTitle;
    if (typeof module !== 'undefined' && module.exports) module.exports = ToolbarTitle;
})(typeof self !== 'undefined' ? self : globalThis);
