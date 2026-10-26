/** Focus ownership for nested popup dialogs. Call the returned release on close. */
(function(root) {
    const stack = [];
    function activate(dialog, { onClose, initialFocus } = {}) {
        const previous = document.activeElement;
        const entry = { dialog };
        stack.push(entry);
        const focusables = () => Array.from(dialog.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.hidden && el.getClientRects().length > 0);
        const first = () => {
            const target = initialFocus || focusables()[0] || dialog;
            if (target === dialog && !dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
            target.focus({ preventScroll: true });
        };
        // A dialog opened above this one without this helper (a confirmation, the colour picker) owns the keys and
        // the focus while focus is in it
        const inOtherDialog = el => {
            const other = el && el.closest ? el.closest('[role="dialog"], [role="alertdialog"]') : null;
            return !!other && other !== dialog && !dialog.contains(other);
        };
        const onKey = event => {
            if (stack.at(-1) !== entry || inOtherDialog(document.activeElement)) return;
            if (event.key === 'Escape' && onClose) {
                event.preventDefault();
                event.stopImmediatePropagation();
                onClose();
            } else if (event.key === 'Tab') {
                const items = focusables();
                const current = items.indexOf(document.activeElement);
                const next = event.shiftKey ? current - 1 : current + 1;
                event.preventDefault();
                if (!items.length) first();
                else items[(next + items.length) % items.length].focus();
            }
        };
        const onFocus = event => {
            if (stack.at(-1) === entry && !dialog.contains(event.target) && !inOtherDialog(event.target)) first();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('focusin', onFocus, true);
        first();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const top = stack.at(-1) === entry;
            stack.splice(stack.indexOf(entry), 1);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('focusin', onFocus, true);
            if (top && previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }
    root.ModalFocus = Object.freeze({ activate });
})(globalThis);
