/**
 * RulesModalLifecycle - Base class for rule modal open/close patterns.
 * Eliminates repeated open/close/backdrop logic across all rule modals.
 *
 * Dependencies: None (standalone class, load before rules.js)
 */
class RulesModalLifecycle {
  constructor(modalSelector, options = {}) {
    this.modalSelector = modalSelector;
    this.parentBackdropSelector = options.parentBackdrop || '#methodSettingsModal .rule-modal-backdrop';
    this.hideParentOnOpen = options.hideParentOnOpen !== false;
  }

  getModal() {
    return document.querySelector(this.modalSelector);
  }

  open() {
    const modal = this.getModal();
    if (!modal) return;

    if (this.hideParentOnOpen) {
      const parent = document.querySelector(this.parentBackdropSelector);
      if (parent) parent.style.display = 'none';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this.onOpen?.();
  }

  close() {
    const modal = this.getModal();
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = '';

    if (this.hideParentOnOpen) {
      const parent = document.querySelector(this.parentBackdropSelector);
      if (parent) parent.style.display = '';
    }

    this.onClose?.();
  }

  setupCloseListeners(...selectors) {
    const backdrop = this.getModal()?.querySelector('.rule-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => this.close());

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) el.addEventListener('click', () => this.close());
    }
  }

  setupOpenListener(btnSelector) {
    const btn = document.querySelector(btnSelector);
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); this.open(); });
  }
}
