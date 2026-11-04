/**
 * Rules extension methods - keyboard focus in the rule dialogs.
 * Dependencies: rules.js, modules/ui/modal-focus.js
 *
 * While a rule dialog is open, Tab and Shift+Tab stay inside it, focus starts in it, and closing it returns the focus to what opened it
 * (ModalFocus, as for the popup's other dialogs). The dialogs open and close in many places (the editor, Method Settings, the
 * helpers, the pattern tester, the colour dialog, the icon picker): this follows them from the page, when one is shown or hidden or
 * added or removed, so none of those paths has to know. Escape stays with each dialog's own handler (no onClose is passed), and a
 * dialog opened above another takes the keys while it is the top one (ModalFocus keeps the order).
 *
 * A dialog may move the focus itself as it opens (the icon picker focuses its search box): the focus goes back to the element that
 * had it before, which is followed here.
 */
Rules.prototype.setupDialogFocus = function() {
  if (this._dialogFocus || typeof ModalFocus === 'undefined' || typeof MutationObserver === 'undefined') return;
  const releases = new Map(); // .rule-modal element -> the release function of its focus scope
  let current = document.activeElement;
  let before = null; // the element that had the focus before the one that has it now
  document.addEventListener('focusin', (event) => {
    if (event.target !== current) { before = current; current = event.target; }
  }, true);
  const isOpen = (modal) => modal.isConnected && modal.getClientRects().length > 0;
  const sync = (modal) => {
    const held = releases.get(modal);
    if (isOpen(modal)) {
      if (held) return;
      const dialog = modal.querySelector('.rule-modal-content');
      // Focus already inside the dialog means it moved the focus itself: the opener is what had it before
      const returnFocus = dialog && dialog.contains(document.activeElement) ? before : null;
      if (dialog) releases.set(modal, ModalFocus.activate(dialog, { returnFocus }));
    } else if (held) {
      releases.delete(modal);
      held();
    }
  };
  const modalsIn = (node) => (node && node.nodeType === 1
    ? [...(node.matches('.rule-modal') ? [node] : []), ...node.querySelectorAll('.rule-modal')]
    : []);

  // The dialogs of rules.html are shown and hidden by their style
  const tab = document.querySelector('#rulesTab');
  const onStyle = new MutationObserver((records) => {
    for (const record of records) if (record.target.classList && record.target.classList.contains('rule-modal')) sync(record.target);
  });
  if (tab) onStyle.observe(tab, { attributes: true, attributeFilter: ['style'], subtree: true });

  // The icon picker is built on demand and added to, and removed from, the page itself
  const onPage = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(node => modalsIn(node).forEach(sync));
      record.removedNodes.forEach(node => modalsIn(node).forEach(sync));
    }
  });
  onPage.observe(document.body, { childList: true });
  this._dialogFocus = { releases, observers: [onStyle, onPage] };
};
