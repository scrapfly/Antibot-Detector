/**
 * What a click on one of the extension's notifications opens.
 *
 * - "Protections changed on <site>" opens that page in a new tab.
 * - "History backup failed" and "History is almost full" open Settings → History
 *   (the popup page in a tab, `popup.html?settings=history`).
 *
 * The page a change notification belongs to is kept in chrome.storage.session
 * (memory only, gone when the browser closes), because the service worker can
 * be stopped between the notification and the click. At most MAX are kept.
 */
(function(root) {
    'use strict';

    const NotificationClicks = {
        // storage.session, not storage.local: it is not part of Settings → Data → Storage
        STORAGE_KEY: 'session_notification_targets',
        MAX: 20,
        CHANGE_PREFIX: 'scrapfly-history-change-',
        SETTINGS_IDS: { 'scrapfly-history-backup-failed': 'history', 'scrapfly-history-storage': 'history' },

        /** The popup page opened on a Settings tab. */
        settingsUrl(chromeApi, tab) {
            return chromeApi.runtime.getURL(`popup.html?settings=${encodeURIComponent(tab)}`);
        },

        /** Only web pages are opened from a notification. */
        isOpenable(url) {
            try {
                const parsed = new URL(String(url || ''));
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch (_) {
                return false;
            }
        },

        async _area(chromeApi) {
            return (chromeApi.storage && chromeApi.storage.session) || null;
        },

        /** Remember the page a change notification is about. */
        async remember(id, url, chromeApi = root.chrome) {
            if (!id || !this.isOpenable(url)) return;
            const area = await this._area(chromeApi);
            if (!area) return;
            const stored = (await area.get(this.STORAGE_KEY))[this.STORAGE_KEY];
            const targets = Array.isArray(stored) ? stored.filter(t => t && t.id !== id) : [];
            targets.unshift({ id, url: String(url) });
            await area.set({ [this.STORAGE_KEY]: targets.slice(0, this.MAX) });
        },

        /** What a click on notification `id` opens: { url } or null. */
        async targetFor(id, chromeApi = root.chrome) {
            if (typeof id !== 'string') return null;
            if (Object.prototype.hasOwnProperty.call(this.SETTINGS_IDS, id)) {
                return { url: this.settingsUrl(chromeApi, this.SETTINGS_IDS[id]) };
            }
            if (!id.startsWith(this.CHANGE_PREFIX)) return null;
            const area = await this._area(chromeApi);
            if (!area) return null;
            const stored = (await area.get(this.STORAGE_KEY))[this.STORAGE_KEY];
            const hit = Array.isArray(stored) ? stored.find(t => t && t.id === id) : null;
            return hit && this.isOpenable(hit.url) ? { url: hit.url } : null;
        },

        async handleClick(id, chromeApi = root.chrome) {
            const target = await this.targetFor(id, chromeApi).catch(() => null);
            if (target) {
                await chromeApi.tabs.create({ url: target.url, active: true }).catch(() => {});
            }
            if (chromeApi.notifications && chromeApi.notifications.clear) {
                await Promise.resolve(chromeApi.notifications.clear(id)).catch(() => {});
            }
            return target;
        },

        /** Registered in the worker's first turn (initializeServices). */
        register(chromeApi = root.chrome) {
            if (!chromeApi || !chromeApi.notifications || !chromeApi.notifications.onClicked) return false;
            chromeApi.notifications.onClicked.addListener((id) => {
                // Advanced tools' page notices have ids of their own and stay as they are
                if (typeof id !== 'string' || !id.startsWith('scrapfly-history-')) return;
                this.handleClick(id, chromeApi);
            });
            return true;
        }
    };

    root.NotificationClicks = NotificationClicks;
    if (typeof module !== 'undefined' && module.exports) module.exports = NotificationClicks;
})(typeof self !== 'undefined' ? self : globalThis);
