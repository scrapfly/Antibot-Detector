/** Shared Advanced CookieResults capability. */
(function () {
class AdvancedCookieResults {
    static cookieRecord(cookie) {
        return {
            name: String(cookie.name || ''),
            value: String(cookie.value || ''),
            domain: cookie.domain || '',
            path: cookie.path || '',
            expires: Number.isFinite(cookie.expirationDate) ? Math.round(cookie.expirationDate * 1000) : null,
            secure: cookie.secure === true,
            httpOnly: cookie.httpOnly === true,
            sameSite: cookie.sameSite && cookie.sameSite !== 'unspecified' ? String(cookie.sameSite) : ''
        };
    }

    static cookieValueLabel(value) {
        const label = BaseAdvancedModule._tr('advCommonValue', 'Value');
        const length = String(value || '').length;
        if (length <= 120) return label;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let count = String(length);
        try { count = length.toLocaleString(uiLocale); } catch (_) { /* plain digits */ }
        return `${label} · ${BaseAdvancedModule._fmt('advCommonCharsFmt', `${count} chars`, count)}`;
    }

    static cookieResultsBody(result) {
        const K = BaseAdvancedModule;
        const tr = K._tr;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        const when = (ms) => {
            try { return new Date(ms).toLocaleString(uiLocale); } catch (_) { return new Date(ms).toLocaleString(); }
        };
        const cookies = Array.isArray(result.cookies) ? result.cookies : [];
        const missing = Array.isArray(result.missing) ? result.missing : [];
        const summary = K.kitCard(
            K.kitField(tr('advCommonCookiesFound', 'Cookies Found:').replace(/:\s*$/, ''), `${cookies.length}/${result.total || cookies.length}`, { mono: false })
            + (Array.isArray(result.facts) ? result.facts : []).map(fact => K.kitField(String(fact.label || '').replace(/:\s*$/, ''), fact.value, { mono: false })).join('')
        );
        const cards = cookies.map(cookie => K.kitCard(
            K.kitField(K.cookieValueLabel(cookie.value), cookie.value, { clamp: true })
            + K.kitField(tr('advCommonDomainLabel', 'Domain:').replace(/:\s*$/, ''), cookie.domain)
            + K.kitField(tr('advCookiePath', 'Path'), cookie.path)
            + K.kitField(tr('advCookieExpires', 'Expires'), cookie.expires ? when(cookie.expires) : tr('advCookieSession', 'Session (deleted when the browser closes)'), { mono: false }),
            K.kitChip(cookie.name, 'blue')
            + (cookie.secure ? K.kitChip('Secure', 'green') : '')
            + (cookie.httpOnly ? K.kitChip('HttpOnly', 'purple') : '')
            + (cookie.sameSite ? K.kitChip(`SameSite=${cookie.sameSite}`, 'neutral') : '')
        )).join('');
        const absent = missing.length
            ? K.kitSection(tr('advCookieNotFound', 'Not found'), `<div class="adv-kit-chips">${missing.map(name => K.kitChip(name, 'neutral')).join('')}</div>`, missing.length)
            : '';
        const none = cookies.length ? '' : K.kitNote(BaseAdvancedModule._fmt('advCommonNoCookiesFmt', `No ${result.vendor} cookies found`, result.vendor));
        return summary + cards + none + absent;
    }

    showCookieResults({ vendor, expected = [], cookies = [], facts = [], total = null }) {
        const records = cookies.map(cookie => BaseAdvancedModule.cookieRecord(cookie));
        const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
        const missing = expected.filter(pattern => !records.some(cookie => matches(pattern, cookie.name)));
        const result = { kind: 'cookies', vendor, total: Number.isInteger(total) ? total : Math.max(expected.length, records.length), facts, cookies: records, missing };
        const title = BaseAdvancedModule._fmt('advCommonCookiesTitleFmt', `${vendor} Cookies`, vendor);
        this.openKitModal({
            title,
            subtitle: `${records.length}/${result.total}`,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: BaseAdvancedModule.cookieResultsBody(result),
            copiedMessage: BaseAdvancedModule._tr('copiedNotification', 'Copied'),
            record: false
        });
        const tool = this._lastTool;
        void this.saveToolResult({ ...result, tool: tool?.id || `${this.moduleName}CheckCookies`, label: tool?.label || title, title });
    }

    showSavedCookieResults(capture) {
        const data = capture?.data || capture?.captureData || {};
        const K = BaseAdvancedModule;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let when = '';
        try { when = new Date(capture.timestamp).toLocaleString(uiLocale); } catch (_) { when = new Date(capture.timestamp).toLocaleString(); }
        this.openKitModal({
            title: data.title || K._fmt('advCommonCookiesTitleFmt', `${data.vendor} Cookies`, data.vendor),
            subtitle: when,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: K.kitCard(K.kitField(K._tr('advCommonPage', 'Page'), capture.url, { mono: false, wrap: true }))
                + BaseAdvancedModule.cookieResultsBody(data),
            copiedMessage: K._tr('copiedNotification', 'Copied'),
            record: false
        });
    }
}
for (const name of ['showCookieResults', 'showSavedCookieResults']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedCookieResults.prototype, name));
}
for (const name of ['cookieRecord', 'cookieValueLabel', 'cookieResultsBody']) {
    Object.defineProperty(BaseAdvancedModule, name, Object.getOwnPropertyDescriptor(AdvancedCookieResults, name));
}
})();
