/** Shared Advanced Dialogs capability. */
(function () {
class AdvancedDialogs {
    openKitModal({ title, subtitle = '', iconSvg = '', body = '', copiedMessage, actions = [] } = {}) {
        const esc = FormatUtils.escapeHtml;
        const overlay = document.createElement('div');
        overlay.className = 'adv-kit-overlay';
        overlay.innerHTML = `
            <div class="adv-kit-modal" role="dialog" aria-modal="true" aria-label="${FormatUtils.escapeAttr(title)}">
                <div class="adv-kit-header">
                    ${iconSvg ? `<span class="adv-kit-header-icon" aria-hidden="true">${iconSvg}</span>` : ''}
                    <div class="adv-kit-header-text">
                        <h3 class="adv-kit-title">${esc(title)}</h3>
                        ${subtitle ? `<p class="adv-kit-subtitle">${esc(subtitle)}</p>` : ''}
                    </div>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>
                <div class="adv-kit-body">${body}</div>
                ${actions.length ? `<div class="adv-kit-footer">${actions.map((action, i) => `
                    <button type="button" class="adv-kit-btn${action.primary ? ' adv-kit-btn--primary' : ''}" data-kit-action="${i}">
                        ${action.iconSvg ? `<span class="adv-kit-btn-icon" aria-hidden="true">${action.iconSvg}</span>` : ''}
                        <span>${esc(action.label)}</span>
                    </button>`).join('')}</div>` : ''}
            </div>`;
        let releaseFocus;
        const close = () => {
            releaseFocus?.();
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 180);
        };
        const onKey = (e) => {
            const overlays = document.querySelectorAll('.tool-modal, .adv-kit-overlay, .advanced-modal-overlay');
            if (e.key === 'Escape' && overlays[overlays.length - 1] === overlay) {
                e.stopPropagation();
                close();
            }
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.advanced-modal-close-btn').addEventListener('click', close);
        overlay.querySelectorAll('[data-kit-action]').forEach((button) => {
            const action = actions[Number(button.dataset.kitAction)];
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (action && typeof action.onClick === 'function') action.onClick(button, close);
            });
        });
        document.addEventListener('keydown', onKey, true);
        this.bindCopyValueHandlers(overlay, {
            defaultMessage: copiedMessage || BaseAdvancedModule._tr('advPanelCopiedToClipboard', 'Copied to clipboard'),
            selector: '[data-copy]'
        });
        document.body.appendChild(overlay);
        releaseFocus = ModalFocus.activate(overlay.querySelector('[role=dialog]'), { onClose: close });
        requestAnimationFrame(() => overlay.classList.add('show'));
        return overlay;
    }

    static kitSection(title, inner, meta = '') {
        if (!inner) return '';
        return `
            <section class="adv-kit-section">
                <div class="adv-kit-section-head">
                    <h4>${FormatUtils.escapeHtml(title)}</h4>
                    ${meta !== '' ? `<span class="adv-kit-count">${FormatUtils.escapeHtml(String(meta))}</span>` : ''}
                </div>
                ${inner}
            </section>`;
    }

    static kitCard(inner, head = '') {
        return `<div class="adv-kit-card">${head ? `<div class="adv-kit-card-head">${head}</div>` : ''}${inner}</div>`;
    }

    static kitChip(text, tone = 'neutral') {
        return `<span class="adv-kit-chip adv-kit-chip--${tone}">${FormatUtils.escapeHtml(String(text))}</span>`;
    }

    static kitField(label, value, { mono = true, wrap = false, clamp = false } = {}) {
        if (value === undefined || value === null || value === '') return '';
        const text = String(value);
        const copy = BaseAdvancedModule._tr('advCommonClickToCopy', 'Click to copy');
        return `
            <div class="adv-kit-field">
                <span class="adv-kit-label">${FormatUtils.escapeHtml(label)}</span>
                <button type="button" class="adv-kit-value${mono ? ' is-mono' : ''}${wrap || clamp ? ' is-wrap' : ''}${clamp ? ' is-clamp' : ''}" data-copy="${FormatUtils.escapeAttr(text)}" title="${FormatUtils.escapeAttr(copy)}">
                    <span class="adv-kit-value-text">${FormatUtils.escapeHtml(text)}</span>
                    <svg class="adv-kit-copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                </button>
            </div>`;
    }

    static kitCode(label, code) {
        if (!code) return '';
        const copyLabel = BaseAdvancedModule._tr('advCommonCopy', 'Copy');
        return `
            <div class="adv-kit-code">
                <div class="adv-kit-code-head">
                    <span class="adv-kit-label">${FormatUtils.escapeHtml(label)}</span>
                    <button type="button" class="adv-kit-code-copy" data-copy="${FormatUtils.escapeAttr(code)}">${FormatUtils.escapeHtml(copyLabel)}</button>
                </div>
                <pre><code>${FormatUtils.escapeHtml(code)}</code></pre>
            </div>`;
    }

    static kitFacts(rows) {
        const items = (rows || []).filter(row => row && row.value !== undefined && row.value !== null && row.value !== '');
        if (!items.length) return '';
        return `<dl class="adv-kit-facts">${items.map(row => `
            <div class="adv-kit-fact">
                <dt>${FormatUtils.escapeHtml(row.label)}</dt>
                <dd>${row.html ? row.value : FormatUtils.escapeHtml(String(row.value))}</dd>
            </div>`).join('')}</dl>`;
    }

    /** A timestamp in the UI language (the browser's when that fails). */
    static kitDateTime(value) {
        if (value === undefined || value === null || value === '') return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        try { return date.toLocaleString(uiLocale); } catch (_) { return date.toLocaleString(); }
    }

    static kitNote(text, tone = 'muted') {
        return `<p class="adv-kit-note adv-kit-note--${tone}">${FormatUtils.escapeHtml(text)}</p>`;
    }

    createToolModal(options = {}) {
        const {
            zIndex = 10000,
            maxWidth = '600px',
            width = '90%',
            maxHeight = '80vh'
        } = options;

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'right: 0',
            'bottom: 0',
            'background: rgba(0,0,0,0.5)',
            'backdrop-filter: blur(2px)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            `z-index: ${zIndex}`,
            'opacity: 0',
            'transition: opacity 0.2s'
        ].join('; ');

        modal.dataset.modalMaxWidth = maxWidth;
        modal.dataset.modalWidth = width;
        modal.dataset.modalMaxHeight = maxHeight;

        return modal;
    }

    showToolModal(modal) {
        if (!modal) return;
        if (!modal.parentNode) {
            document.body.appendChild(modal);
        }
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }

    closeToolModal(modal) {
        if (!modal) return;
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 200);
    }

    bindModalClose(modal, options = {}) {
        if (!modal) return;

        const {
            closeSelector = '.advanced-modal-close-btn',
            closeOnOverlay = true
        } = options;

        const close = () => this.closeToolModal(modal);

        modal.querySelectorAll(closeSelector).forEach((btn) => {
            btn.addEventListener('click', close);
        });

        if (closeOnOverlay) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    close();
                }
            });
        }
    }

    bindCopyValueHandlers(container, options = {}) {
        if (!container) return;

        const {
            defaultMessage = BaseAdvancedModule._tr('advValueCopied', 'Value copied'),
            selector = '.copy-value[data-copy], .clickable-copy-value[data-copy]'
        } = options;

        container.querySelectorAll(selector).forEach((element) => {
            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) return;

                const notificationMessage = element.getAttribute('data-copy-message') || defaultMessage;
                AdvancedUtils.copyToClipboard(textToCopy, element, { notificationMessage });
            });
        });
    }
}
for (const name of ['openKitModal', 'createToolModal', 'showToolModal', 'closeToolModal', 'bindModalClose', 'bindCopyValueHandlers']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedDialogs.prototype, name));
}
for (const name of ['kitSection', 'kitCard', 'kitChip', 'kitField', 'kitCode', 'kitFacts', 'kitNote', 'kitDateTime']) {
    Object.defineProperty(BaseAdvancedModule, name, Object.getOwnPropertyDescriptor(AdvancedDialogs, name));
}
})();
