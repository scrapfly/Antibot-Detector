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
        let releaseFocus = null;
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
            if (releaseFocus) releaseFocus();
            else if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
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
        render();
        owner.showToolModal(modal);
        if (typeof ModalFocus !== 'undefined') {
            releaseFocus = ModalFocus.activate(content, { onClose: close, initialFocus: closeButton });
        } else {
            document.addEventListener('keydown', onKeydown);
            closeButton.focus();
        }
        return { modal, close, selectType, selectLanguage };
    }
    const SCRIPT_URL_LANGUAGES = ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'];
    /** Code that downloads a list of script URLs, in one of SCRIPT_URL_LANGUAGES. */
    function scriptUrlsCode(name, urls, language) {
        const list = (Array.isArray(urls) ? urls : []).map(String);
        const ident = String(name || 'scripts').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'scripts';
        const json = JSON.stringify(list, null, 2);
        const php = list.map(url => `    '${url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',\n');
        const indented = (pad) => list.map(url => `${pad}${JSON.stringify(url)}`).join(',\n');
        const templates = {
            'JavaScript': () => `// ${name} script URLs
const ${ident}Scripts = ${json};

for (const [index, url] of ${ident}Scripts.entries()) {
    try {
        const response = await fetch(url);
        const body = await response.text();
        console.log(\`Script \${index + 1}: \${url} (\${response.status}, \${body.length} chars)\`);
    } catch (error) {
        console.error(\`Failed: \${url}\`, error);
    }
}`,
            'Python': () => `import requests

# ${name} script URLs
${ident}_scripts = ${json}

for index, url in enumerate(${ident}_scripts, 1):
    try:
        response = requests.get(url, timeout=30)
        print(f'Script {index}: {url} ({response.status_code}, {len(response.text)} chars)')
    except Exception as error:
        print(f'Failed: {url}', error)`,
            'Node.js': () => `const axios = require('axios');

// ${name} script URLs
const ${ident}Scripts = ${json};

(async () => {
    for (const [index, url] of ${ident}Scripts.entries()) {
        try {
            const response = await axios.get(url, { responseType: 'text' });
            console.log(\`Script \${index + 1}: \${url} (\${response.status}, \${response.data.length} chars)\`);
        } catch (error) {
            console.error(\`Failed: \${url}\`, error.message);
        }
    }
})();`,
            'PHP': () => `<?php
// ${name} script URLs
$scripts = [
${php}
];

foreach ($scripts as $index => $url) {
    $body = @file_get_contents($url);
    if ($body === false) {
        echo "Failed: $url\\n";
        continue;
    }
    echo 'Script ' . ($index + 1) . ": $url (" . strlen($body) . " chars)\\n";
}`,
            'C#': () => `using System;
using System.Net.Http;

// ${name} script URLs
var scripts = new[]
{
${indented('    ')}
};

using var client = new HttpClient();
for (var i = 0; i < scripts.Length; i++)
{
    try
    {
        var body = await client.GetStringAsync(scripts[i]);
        Console.WriteLine($"Script {i + 1}: {scripts[i]} ({body.Length} chars)");
    }
    catch (Exception error)
    {
        Console.WriteLine($"Failed: {scripts[i]} {error.Message}");
    }
}`,
            'Go': () => `package main

import (
\t"fmt"
\t"io"
\t"net/http"
)

// ${name} script URLs
var scripts = []string{
${indented('\t')},
}

func main() {
\tfor i, url := range scripts {
\t\tresp, err := http.Get(url)
\t\tif err != nil {
\t\t\tfmt.Println("Failed:", url, err)
\t\t\tcontinue
\t\t}
\t\tbody, _ := io.ReadAll(resp.Body)
\t\tresp.Body.Close()
\t\tfmt.Printf("Script %d: %s (%d, %d bytes)\\n", i+1, url, resp.StatusCode, len(body))
\t}
}`
        };
        const template = templates[language];
        if (!template) throw new Error(`Unsupported language: ${language}`);
        return template();
    }
    /** Export Code for a list of captured scripts ({ url }). */
    function openScriptUrls(owner, name, scripts) {
        const urls = (Array.isArray(scripts) ? scripts : []).map(script => script && script.url).filter(Boolean);
        return open(owner, {
            title: tr('advCommonExportCode', 'Export Code'),
            languages: SCRIPT_URL_LANGUAGES.map(label => ({ id: label, label })),
            getCode: (_type, language) => scriptUrlsCode(name, urls, language)
        });
    }
    global.AdvancedCodeDialog = Object.freeze({ open, openScriptUrls, scriptUrlsCode, SCRIPT_URL_LANGUAGES });
})(window);
