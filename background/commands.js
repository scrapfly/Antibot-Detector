/**
 * Keyboard shortcuts (manifest.json "commands"; the person can change them at
 * chrome://extensions/shortcuts).
 *
 * - rescan-tab (Alt+Shift+S by default): scan the current page again. Its saved
 *   result is cleared, as Detection → Clear Cache does, and the page reloads,
 *   so cookies, headers and the JS hooks are collected from the start.
 *   Nothing happens while the extension is off, on a page it cannot scan, or
 *   on a site that is not scanned (skipped, or not among the chosen sites).
 * - WorkerMessages.RESCAN_TAB is the Detection tab's Scan again button: the same rescan, for the tab the popup shows.
 * - _execute_action opens the popup; Chrome handles it.
 */
(function(root) {
    'use strict';

    const Commands = {
        RESCAN: 'rescan-tab',

        /** @returns {Promise<'reloaded'|'no_tab'|'unsupported'|'off'|'skipped'|'failed'>} */
        async rescan(tab, deps = {}) {
            const chromeApi = deps.chrome || root.chrome;
            const utils = deps.Utils || root.Utils;
            const enabled = deps.isEnabled || root.isExtensionEnabled;
            const clear = deps.clear || root.clearTabDetectionCache;
            let target = tab;
            if (!target || typeof target.id !== 'number') {
                const [active] = await chromeApi.tabs.query({ active: true, currentWindow: true }).catch(() => []);
                target = active;
            }
            if (!target || typeof target.id !== 'number') return 'no_tab';
            if (!utils.isValidContentScriptTab(target)) return 'unsupported';
            if (typeof enabled === 'function' && !(await enabled())) return 'off';
            if (await utils.isUrlBlacklisted(target.url)) return 'skipped';
            try {
                await clear({ url: target.url, tabId: target.id });
                await chromeApi.tabs.reload(target.id);
                return 'reloaded';
            } catch (error) {
                if (root.Logger && root.Logger.warn) root.Logger.warn('BACKGROUND', '[Commands] Rescan failed:', error && error.message);
                return 'failed';
            }
        },

        /**
         * The Detection tab's Scan again button (WorkerMessages.RESCAN_TAB, { tabId }): the shortcut's rescan, for the tab the
         * popup shows. The popup names the tab (the active one of its own window): a worker has no window, so "the active tab"
         * is never asked here, and a tab that is gone, or no tab id at all, is 'no_tab' and not another tab in its place.
         * For the extension's own pages only. Answers { status: 'ok', outcome }, outcome being one of rescan()'s.
         * @param {object} registry - the worker's message handlers (router-registry.js)
         */
        registerHandlers(registry, deps = {}) {
            const chromeApi = deps.chrome || root.chrome;
            const messages = deps.WorkerMessages || root.WorkerMessages;
            const sender = deps.MessageSender || root.MessageSender;
            const handle = ({ request, sendResponse }) => {
                (async () => {
                    let outcome = 'no_tab';
                    try {
                        const id = request && request.tabId;
                        const tab = Number.isInteger(id) && id >= 0 ? await chromeApi.tabs.get(id).catch(() => null) : null;
                        if (tab) outcome = await this.rescan(tab, deps);
                    } catch (error) {
                        if (root.Logger && root.Logger.warn) root.Logger.warn('BACKGROUND', '[Commands] Scan again failed:', error && error.message);
                        outcome = 'failed';
                    }
                    sendResponse({ status: 'ok', outcome });
                })();
                return true; // answers asynchronously
            };
            registry[messages.RESCAN_TAB] = sender.extensionPagesOnly(handle, chromeApi && chromeApi.runtime);
        },

        /** Registered in the worker's first turn (initializeServices). */
        register(chromeApi = root.chrome) {
            if (!chromeApi || !chromeApi.commands || !chromeApi.commands.onCommand) return false;
            chromeApi.commands.onCommand.addListener((command, tab) => {
                if (command !== this.RESCAN) return;
                Promise.resolve(this.rescan(tab)).catch((error) => {
                    if (root.Logger && root.Logger.warn) root.Logger.warn('BACKGROUND', '[Commands] Rescan failed:', error && error.message);
                });
            });
            return true;
        }
    };

    root.Commands = Commands;
    if (typeof module !== 'undefined' && module.exports) module.exports = Commands;
})(typeof self !== 'undefined' ? self : globalThis);
