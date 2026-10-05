/* Shared, literal-only presentation for Advanced script parsing generators. */
(function(global) {
    'use strict';
    let sequence = 0;
    const labels = { javascript: 'JavaScript', python: 'Python', nodejs: 'Node.js', php: 'PHP', csharp: 'C#', go: 'Go' };
    const tr = (key, fallback) => (typeof I18n !== 'undefined' && typeof I18n.tr === 'function') ? I18n.tr(key, fallback) : fallback;

    function open(owner, options) {
        const previousFocus = document.activeElement;
        const modal = owner.createToolModal({ zIndex: 10001 });
        modal.classList.add('advanced-code-dialog', 'export-code-modal');
        // Code dialogs do not need an entrance/exit animation, including reduced-motion users.
        modal.style.transition = 'none';
        modal.style.opacity = '1';
        const id = `advanced-code-dialog-${++sequence}`;
        const node = (tag, className, parent, text) => {
            const element = document.createElement(tag);
            element.className = className;
            if (text !== undefined) element.textContent = text;
            if (parent) parent.appendChild(element);
            return element;
        };
        const content = node('div', 'modal-content advanced-code-dialog__content', modal);
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('aria-labelledby', `${id}-title`);
        const header = node('div', 'advanced-code-dialog__header', content);
        const title = node('h3', 'advanced-code-dialog__title', header, options.title);
        title.id = `${id}-title`;
        const closeButton = typeof CloseButton !== 'undefined' && typeof CloseButton.create === 'function'
            ? CloseButton.create({ className: 'advanced-modal-close-btn' })
            : node('button', 'advanced-modal-close-btn', null, '×');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', tr('btnClose', 'Close'));
        header.appendChild(closeButton);
        const types = options.types || [];
        let type = options.initialType || (types[0] && types[0].id) || 'all';
        let codes = {};
        let generationError = false;
        try { if (options.getCodes) codes = options.getCodes(type); }
        catch (_) { generationError = true; }
        const languageKeys = Object.keys(codes);
        const languages = options.languages || (languageKeys.length ? languageKeys : Object.keys(labels)).map(key => ({ id: key, label: labels[key] || key }));
        let language = languages[0] && languages[0].id;
        let closed = false;
        let revision = 0;
        let currentCode = '';
        const typeButtons = [];
        if (types.length) {
            const typeGroup = node('div', 'advanced-code-dialog__types', content);
            typeGroup.setAttribute('role', 'group');
            typeGroup.setAttribute('aria-label', tr('advCommonExportOptions', 'Export Options'));
            types.forEach(item => {
                const button = node('button', 'advanced-code-dialog__type export-type-btn', typeGroup, item.label);
                button.type = 'button'; button.dataset.type = item.id;
                button.addEventListener('click', () => selectType(item.id));
                typeButtons.push(button);
            });
        }
        const tabs = node('div', 'advanced-code-dialog__languages', content);
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', tr('advCommonExportCode', 'Export Code'));
        const tabButtons = languages.map((item, index) => {
            const button = node('button', 'advanced-code-dialog__language lang-tab', tabs, item.label);
            button.type = 'button'; button.dataset.lang = item.id;
            button.id = `${id}-tab-${index}`;
            button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${id}-panel`);
            button.addEventListener('click', () => selectLanguage(item.id));
            button.addEventListener('keydown', event => {
                const directions = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: languages.length - 1 - index };
                if (!Object.prototype.hasOwnProperty.call(directions, event.key)) return;
                event.preventDefault();
                const next = (index + directions[event.key] + languages.length) % languages.length;
                selectLanguage(languages[next].id); tabButtons[next].focus();
            });
            return button;
        });
        const panel = node('div', 'advanced-code-dialog__panel', content);
        panel.id = `${id}-panel`; panel.setAttribute('role', 'tabpanel');
        const toolbar = node('div', 'advanced-code-dialog__toolbar', panel);
        const codeLabel = node('span', 'advanced-code-dialog__code-label', toolbar);
        const copy = node('button', 'advanced-code-dialog__copy advanced-modal-copy-btn copy-parsing-code', toolbar, tr('settingsApiCopyCode', 'Copy Code'));
        copy.type = 'button';
        const textarea = node('textarea', 'advanced-code-dialog__code parsing-code-area', panel);
        textarea.readOnly = true; textarea.spellcheck = false; textarea.wrap = 'off';
        textarea.setAttribute('aria-describedby', `${id}-description`);
        const description = node('p', 'advanced-code-dialog__description', content);
        description.id = `${id}-description`;
        const status = node('div', 'advanced-code-dialog__status', content);
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');

        function render() {
            revision++;
            status.textContent = '';
            try {
                if (generationError) throw new Error('Generation unavailable');
                currentCode = options.getCode ? options.getCode(type, language) : codes[language];
                if (typeof currentCode !== 'string') throw new Error('Generation unavailable');
                // Never interpolate generated code into HTML, even when it contains </textarea>.
                textarea.value = currentCode;
                copy.disabled = false;
            } catch (_) {
                currentCode = ''; textarea.value = ''; copy.disabled = true;
                status.textContent = tr('advCommonCodeGenUnavailable', 'Code generation not available');
            }
            typeButtons.forEach(button => {
                const selected = button.dataset.type === type;
                button.setAttribute('aria-pressed', selected); button.classList.toggle('active', selected);
            });
            tabButtons.forEach(button => {
                const selected = button.dataset.lang === language;
                button.setAttribute('aria-selected', selected); button.tabIndex = selected ? 0 : -1;
                button.classList.toggle('active', selected);
                if (selected) panel.setAttribute('aria-labelledby', button.id);
            });
            const item = languages.find(entry => entry.id === language);
            codeLabel.textContent = item ? item.label : '';
            textarea.setAttribute('aria-label', `${options.title}: ${codeLabel.textContent}`);
            description.textContent = typeof options.description === 'function' ? options.description(type, language) : (options.description || '');
        }
        function selectType(next) {
            if (closed || !types.some(item => item.id === next)) return;
            type = next;
            try { if (options.getCodes) codes = options.getCodes(type); generationError = false; }
            catch (_) { generationError = true; }
            render();
        }
        function selectLanguage(next) {
            if (closed || !languages.some(item => item.id === next)) return;
            language = next; render();
        }
        copy.addEventListener('click', async () => {
            if (closed || copy.disabled) return;
            const copyRevision = revision;
            copy.disabled = true;
            try {
                const success = await AdvancedUtils.copyToClipboard(currentCode, null, { notify: false });
                if (!closed && revision === copyRevision) status.textContent = success
                    ? tr('settingsApiCodeCopied', 'Code copied') : tr('clipboardCopyFailed', 'Failed to copy to clipboard');
            } catch (_) {
                if (!closed && revision === copyRevision) status.textContent = tr('clipboardCopyFailed', 'Failed to copy to clipboard');
            } finally {
                if (!closed && revision === copyRevision) copy.disabled = false;
            }
        });
        function close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKeydown);
            modal.remove();
            if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
        }
        function onKeydown(event) {
            const dialogs = document.querySelectorAll ? document.querySelectorAll('.tool-modal, .adv-kit-overlay, .advanced-modal-overlay') : [modal];
            if (dialogs.length && dialogs[dialogs.length - 1] !== modal) return;
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
                const focusable = Array.from(content.querySelectorAll('button, textarea')).filter(element => !element.disabled && element.tabIndex !== -1);
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && (document.activeElement === first || !content.contains(document.activeElement))) {
                    event.preventDefault(); last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !content.contains(document.activeElement))) {
                    event.preventDefault(); first.focus();
                }
            }
        }
        closeButton.addEventListener('click', close);
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        document.addEventListener('keydown', onKeydown);
        render();
        owner.showToolModal(modal);
        closeButton.focus();
        return { modal, close, selectType, selectLanguage };
    }
    global.AdvancedCodeDialog = Object.freeze({ open });
})(window);
