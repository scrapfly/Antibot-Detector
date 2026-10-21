/**
 * Keyboard shortcuts (manifest.json "commands"; the person can change them at
 * chrome://extensions/shortcuts).
 *
 * - rescan-tab (Alt+Shift+S by default): scan the current page again. Its saved
 *   result is cleared, as Detection → Clear Cache does, and the page reloads,
 *   so cookies, headers and the JS hooks are collected from the start.
 *   Nothing happens while the extension is off, on a page it cannot scan, or
 *   on a site that is not scanned (skipped, or not among the chosen sites).
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

        /** Registered in the worker's first turn (initializeServices). */
        register(chromeApi = root.chrome) {
            if (!chromeApi || !chromeApi.commands || !chromeApi.commands.onCommand) return false;
            chromeApi.commands.onCommand.addListener((command, tab) => {
                if (command === this.RESCAN) this.rescan(tab);
            });
            return true;
        }
    };

    root.Commands = Commands;
    if (typeof module !== 'undefined' && module.exports) module.exports = Commands;
})(typeof self !== 'undefined' ? self : globalThis);
