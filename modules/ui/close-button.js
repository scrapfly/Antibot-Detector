/**
 * CloseButton — the one close (✕) control used by every modal, overlay and
 * toast in the extension. Styling lives in common.css (.btn-close, with the
 * .btn-close--sm modifier for toasts); this helper only produces the markup
 * so JS-built modals get exactly the same element as the static HTML ones.
 *
 * Static HTML templates inline the same markup (see CloseButton.ICON).
 */
(function () {
  'use strict';

  // 14px ✕ drawn on a 14-unit grid; vector-effect keeps the stroke at a
  // crisp 1.75px whatever size CSS renders the icon at.
  const ICON = '<svg class="btn-close-icon" viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true" focusable="false">'
    + '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
    + '</svg>';

  function label() {
    if (typeof I18n !== 'undefined' && I18n && typeof I18n.tr === 'function') {
      return I18n.tr('btnClose', 'Close');
    }
    return 'Close';
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function classList(options) {
    const classes = ['btn-close'];
    if (options.small) classes.push('btn-close--sm');
    if (options.className) classes.push(options.className);
    return classes.join(' ');
  }

  /**
   * Markup string for template literals.
   * @param {object} [options]
   * @param {string} [options.className] extra classes (e.g. a JS hook class)
   * @param {string} [options.id]
   * @param {boolean} [options.small] toast-sized variant
   * @returns {string}
   */
  function html(options = {}) {
    const text = escapeAttr(label());
    const id = options.id ? ` id="${escapeAttr(options.id)}"` : '';
    return `<button type="button"${id} class="${escapeAttr(classList(options))}" title="${text}" aria-label="${text}" data-i18n-title="btnClose" data-i18n-aria-label="btnClose">${ICON}</button>`;
  }

  /**
   * Button element for DOM-built UIs. Same options as html().
   * @returns {HTMLButtonElement}
   */
  function create(options = {}) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html(options);
    return tpl.content.firstElementChild;
  }

  const api = { ICON, html, create };
  if (typeof window !== 'undefined') window.CloseButton = api;
  if (typeof globalThis !== 'undefined') globalThis.CloseButton = api;
})();
