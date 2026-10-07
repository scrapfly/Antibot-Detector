/**
 * Lightweight i18n helper. Scans the DOM for elements with these attributes
 * and replaces their content/attribute with the matching `chrome.i18n.getMessage(key)`:
 *
 *   data-i18n="messageKey"            → element.textContent
 *   data-i18n-aria-label="messageKey" → element.setAttribute('aria-label', …)
 *   data-i18n-title="messageKey"      → element.setAttribute('title', …)
 *   data-i18n-placeholder="messageKey"→ element.setAttribute('placeholder', …)
 *
 * The browser's UI locale (`chrome.i18n.getUILanguage()`) drives selection.
 * Missing translations fall back to `default_locale` ("en") automatically.
 *
 * Usage: include this script in popup.html before any other section script,
 * then call `I18n.apply()` once on DOMContentLoaded.
 */
class I18n {
    // Override loaded from `scrapfly_language_override` setting; null = use browser locale.
    static _overrideMessages = null;
    static _overrideLocale = null;
    static _syncPromise = null;

    /**
     * Load a locale's messages.json into memory as an override. Pass `null`
     * or `"auto"` to clear the override (the UI then follows the browser
     * locale via chrome.i18n). Quietly no-ops on fetch/parse failure.
     */
    static async loadOverride(locale) {
        if (!locale || locale === 'auto') {
            I18n._overrideMessages = null;
            I18n._overrideLocale = null;
            return;
        }
        // Defensive allowlist: only BCP-47-style locale codes (xx or xx_YY)
        // pass through. Prevents path traversal via a tampered
        // `scrapfly_language_override` storage key — `../foo`, absolute paths,
        // and URL schemes are all rejected before they reach getURL/fetch.
        if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(locale)) {
            I18n._overrideMessages = null;
            I18n._overrideLocale = null;
            return;
        }
        try {
            const url = chrome.runtime.getURL('_locales/' + locale + '/messages.json');
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            I18n._overrideMessages = await res.json();
            I18n._overrideLocale = locale;
        } catch (e) {
            I18n._overrideMessages = null;
            I18n._overrideLocale = null;
        }
    }

    /**
     * Load the stored language override and follow later changes to it, for
     * contexts without a page bootstrap (the service worker). Returns the
     * promise of the current load; ready() waits for the latest one.
     */
    static syncOverrideFromStorage() {
        if (I18n._syncPromise) return I18n._syncPromise;
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            I18n._syncPromise = Promise.resolve();
            return I18n._syncPromise;
        }
        const load = (value) => I18n.loadOverride(value || null).catch(() => undefined);
        I18n._syncPromise = chrome.storage.local.get(['scrapfly_language_override'])
            .then((r) => load(r && r.scrapfly_language_override))
            .catch(() => undefined);
        if (chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.scrapfly_language_override) {
                    I18n._syncPromise = load(changes.scrapfly_language_override.newValue);
                }
            });
        }
        return I18n._syncPromise;
    }

    /** Resolves once the language override (if any) is loaded. */
    static ready() {
        return I18n._syncPromise || Promise.resolve();
    }

    /**
     * Returns the translated string for `key`, or `null` if not found.
     * Checks the in-memory override first (if loaded via loadOverride),
     * then falls back to chrome.i18n.getMessage (which uses the browser
     * UI locale, with extension default_locale as the implicit fallback).
     */
    static get(key, substitutions) {
        if (I18n._overrideMessages && I18n._overrideMessages[key] && I18n._overrideMessages[key].message) {
            let msg = I18n._overrideMessages[key].message;
            // Chrome supports $name$ named placeholders + automatic positional
            // substitution. For overrides we only need the positional case used
            // by callers in this codebase, which all go through format().
            if (Array.isArray(substitutions)) {
                for (let i = 0; i < substitutions.length; i++) {
                    msg = msg.split('$' + (i + 1)).join(String(substitutions[i]));
                }
            }
            return msg || null;
        }
        if (typeof chrome === 'undefined' || !chrome.i18n) return null;
        const msg = chrome.i18n.getMessage(key, substitutions);
        return msg || null;
    }

    /**
     * Same as get() but the caller passes an explicit English fallback that
     * is returned instead of `null` when the key isn't found. Use this
     * everywhere a sensible English default exists — so users never see raw
     * camelCase keys leaking into the UI when the message cache is stale.
     */
    static tr(key, fallback) {
        const msg = I18n.get(key);
        return msg !== null ? msg : (fallback != null ? fallback : key);
    }

    /**
     * Get a translated string and substitute `{0}`, `{1}`, … placeholders
     * with the provided positional arguments. Cleaner than Chrome's
     * named-placeholder format for runtime-formatted strings ("5 minutes ago",
     * "Showing 1-20 of 51"). Returns `null` when the key isn't found.
     */
    static format(key, ...args) {
        let msg = I18n.get(key);
        if (msg === null) return null;
        for (let i = 0; i < args.length; i++) {
            msg = msg.split('{' + i + '}').join(String(args[i]));
        }
        return msg;
    }

    /**
     * BCP 47 tag of the language the UI is shown in ("es", "zh-CN"): the
     * override when one is loaded, otherwise the browser UI language.
     * Use it for Intl formatters and the document's lang attribute.
     */
    static locale() {
        let raw = I18n._overrideLocale;
        if (!raw) {
            try {
                raw = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || 'en';
            } catch (_) {
                raw = 'en';
            }
        }
        return String(raw).replace('_', '-');
    }

    /**
     * Tag the page with the UI language so CSS can pick script-specific
     * fonts (Han glyph forms differ between Chinese and Japanese).
     */
    static applyDocumentLang(doc = (typeof document !== 'undefined' ? document : null)) {
        if (!doc || !doc.documentElement) return;
        const tag = I18n.locale();
        if (doc.documentElement.getAttribute('lang') !== tag) doc.documentElement.setAttribute('lang', tag);
    }

    static apply(root = document) {
        if (!root || typeof chrome === 'undefined' || !chrome.i18n) return;
        if (root === document) I18n.applyDocumentLang(document);

        const scope = (typeof root.querySelectorAll === 'function') ? root : document;

        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const value = I18n.get(key);
            if (!value) return;
            // An option with an icon keeps it: the text goes into its label
            const label = el.querySelector?.(':scope > .opt-label');
            if (label) label.textContent = value;
            else el.textContent = value;
        });

        // data-i18n-fmt="key" data-i18n-args="a,b,c" → I18n.format(key, a, b, c)
        scope.querySelectorAll('[data-i18n-fmt]').forEach((el) => {
            const key = el.getAttribute('data-i18n-fmt');
            const argsAttr = el.getAttribute('data-i18n-args') || '';
            const args = argsAttr ? argsAttr.split(',') : [];
            const value = I18n.format(key, ...args);
            if (value) el.textContent = value;
        });

        const attrPairs = [
            ['data-i18n-aria-label', 'aria-label'],
            ['data-i18n-title', 'title'],
            ['data-i18n-placeholder', 'placeholder']
        ];
        for (const [src, dst] of attrPairs) {
            scope.querySelectorAll(`[${src}]`).forEach((el) => {
                const key = el.getAttribute(src);
                const value = I18n.get(key);
                if (value) el.setAttribute(dst, value);
            });
        }
    }

    /**
     * Watch the document for newly-added DOM and auto-apply translations.
     * Sections fetch their HTML async (sections/*\/*.js) and assign it into a
     * tab container; this observer translates them as soon as they appear,
     * so individual section files don't need to know about i18n.
     */
    static startAutoApply() {
        if (typeof MutationObserver === 'undefined' || I18n._observer) return;

        // Initial pass for whatever's already in the DOM.
        I18n.apply();

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (!m.addedNodes || m.addedNodes.length === 0) continue;
                for (const node of m.addedNodes) {
                    if (node.nodeType === 11) {
                        // DocumentFragment (common when assigning innerHTML)
                        for (const child of node.children) {
                            I18n.apply(child);
                        }
                        continue;
                    }
                    if (node.nodeType !== 1) continue; // ELEMENT_NODE
                    I18n.apply(node);
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        I18n._observer = observer;
    }

}

if (typeof window !== 'undefined') {
    window.I18n = I18n;
} else if (typeof self !== 'undefined') {
    self.I18n = I18n;
}
