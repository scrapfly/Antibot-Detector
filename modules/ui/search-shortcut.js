/**
 * "/" in the popup: the keyboard goes to the search box of the tab that is open (Detection, History, Rules, Captures).
 * Nothing happens while something is being typed (a field, an editable area), with Ctrl, Alt or ⌘ held, while a dialog is
 * open, or when the open tab shows no search box right now (a Detection tab with nothing found): the key then does what it
 * would do anyway.
 *
 *   BOXES            the search box of each tab, by the tab's name
 *   shouldHandle()   whether a keydown is the shortcut (pure: the event and the page's state)
 *   install()        listens on the document; activeTab() names the open tab
 */
(function(root) {
    'use strict';

    const BOXES = Object.freeze({
        detection: '#detectionSearch',
        history: '#historySearch',
        rules: '#rulesSearch',
        advanced: '#captureSearchInput'
    });

    // A dialog on screen owns the keys: Settings, the rule editor, a confirmation, a detail view
    const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal.show, .modal-overlay.show, .base-modal.is-open, .detection-modal.is-open';

    const shown = (el) => !!el && !el.hidden && typeof el.getClientRects === 'function' && el.getClientRects().length > 0;

    function typing(target) {
        if (!target) return false;
        if (target.isContentEditable) return true;
        return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '');
    }

    function dialogOpen(doc, target) {
        if (target && typeof target.closest === 'function' && target.closest(DIALOGS)) return true;
        return Array.from(doc.querySelectorAll(DIALOGS)).some(shown);
    }

    /**
     * @param {KeyboardEvent} event
     * @param {Document} doc
     * @param {string} tab the open tab's name
     * @returns {HTMLElement|null} the search box to focus, or null when the key is not the shortcut here
     */
    function shouldHandle(event, doc, tab) {
        if (!event || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.isComposing) return null;
        if (typing(event.target)) return null;
        const selector = BOXES[tab];
        if (!selector || dialogOpen(doc, event.target)) return null;
        const box = doc.querySelector(selector);
        if (!shown(box) || box.disabled) return null;
        return box;
    }

    function install(doc, activeTab) {
        if (!doc || doc.__searchShortcutInstalled) return;
        doc.__searchShortcutInstalled = true;
        doc.addEventListener('keydown', (event) => {
            const box = shouldHandle(event, doc, activeTab());
            if (!box) return;
            event.preventDefault();
            box.focus();
            if (typeof box.select === 'function') box.select();
        });
    }

    const api = Object.freeze({ BOXES, shouldHandle, install });
    root.SearchShortcut = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
