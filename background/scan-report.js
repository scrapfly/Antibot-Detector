/**
 * Scan report: one collapsible console block per scanned page (Debug mode).
 *
 *   [13:22:50.412] bg/scan  walmart.com · 7 detections in 4.6 s (top: Akamai Bot Manager 95%)
 *     Anti-bot    Akamai Bot Manager     95%  cookie _abck, url /akam/13/…, header akamai-grn
 *     Anti-bot    PerimeterX             90%  url /px/PXu6b0qd2S/init.js, cookie _px3
 *     Fingerprint Canvas Fingerprint     40%  js_hooks toDataURL, getImageData
 *     Data        cookies=15 dom=488 scripts=31 resources=206 requests=200 html=351 KB
 *     Timing      collect 0.8 s · match 62 ms · hooks 4.0 s (activity_timeout, 21/93 fired) · window 18/30
 *
 * It replaces the ~190 lines a debug scan used to print (one per rule, hook,
 * message and network URL). Pure: build() returns { title, lines } from the
 * finalized results and the tab's detection state, so it is unit-tested.
 */
const ScanReport = {
    MAX_EVIDENCE: 3,
    MAX_VALUE: 48,
    MAX_ROWS: 25,
    MAX_ROW: 220,

    categoryLabel(category) {
        const key = String(category || '').toLowerCase().replace(/[^a-z]/g, '');
        if (key.includes('captcha')) return 'Captcha';
        if (key.includes('fingerprint')) return 'Fingerprint';
        if (key.includes('antibot') || key.includes('bot') || key.includes('waf')) return 'Anti-bot';
        return 'Other';
    },

    short(text, max = ScanReport.MAX_VALUE) {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    },

    /** The part of a match worth reading: a cookie name, a URL path, a hook method */
    evidence(match) {
        if (!match || typeof match !== 'object') return '';
        const type = match.type || '?';
        let value;
        switch (type) {
            case 'cookie': value = match.name || String(match.value || '').split('=')[0]; break;
            case 'header': value = match.name || String(match.value || '').split(':')[0]; break;
            case 'url': {
                const raw = match.fullUrl || match.value || match.pattern || '';
                try {
                    const u = new URL(raw);
                    value = `${u.hostname.replace(/^www\./, '')}${u.pathname}`;
                } catch (e) {
                    value = raw;
                }
                break;
            }
            case 'js_hooks': value = String(match.pattern || match.target || match.value || '').split('.').pop(); break;
            case 'window': value = match.pattern || match.value; break;
            case 'dom': value = match.selector || match.pattern || match.value; break;
            case 'content': {
                const where = ScanReport.fileName(match.foundIn);
                value = `"${ScanReport.short(match.pattern || match.value, 28)}"${where ? ` in ${where}` : ''}`;
                break;
            }
            default: value = match.pattern || match.value || match.name;
        }
        return `${type} ${ScanReport.short(value)}`;
    },

    /** Evidence grouped by method: "cookie _abck, bm_sz · url /akam/13/x" */
    evidenceLine(matches) {
        const byType = new Map();
        for (const match of Array.isArray(matches) ? matches : []) {
            const text = ScanReport.evidence(match);
            if (!text) continue;
            const [type, ...rest] = text.split(' ');
            const list = byType.get(type) || [];
            const value = rest.join(' ');
            if (!list.includes(value)) list.push(value);
            byType.set(type, list);
        }
        return Array.from(byType, ([type, values]) => {
            const shown = values.slice(0, ScanReport.MAX_EVIDENCE).join(', ');
            const more = values.length > ScanReport.MAX_EVIDENCE ? ` +${values.length - ScanReport.MAX_EVIDENCE}` : '';
            return `${type} ${shown}${more}`;
        }).join(' · ');
    },

    /** "init.js" for a script URL, "inline" for inline scripts, '' for the page itself */
    fileName(where) {
        if (!where || where === 'page content') return '';
        if (where === 'inline script') return 'inline';
        try {
            const u = new URL(where);
            const last = u.pathname.split('/').filter(Boolean).pop();
            return ScanReport.short(last || u.hostname, 32);
        } catch (e) {
            return ScanReport.short(where, 32);
        }
    },

    seconds(ms) {
        if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '?';
        return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
    },

    host(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (e) {
            return ScanReport.short(url, 60) || '(unknown page)';
        }
    },

    /**
     * @param {string} url
     * @param {Array<object>} results - finalized detections
     * @param {object} state - the tab's detection state (stats, hooks, window, timing)
     * @returns {{title: string, lines: string[]}}
     */
    build(url, results, state = {}) {
        const detections = (Array.isArray(results) ? results : [])
            .filter(d => d && typeof d === 'object')
            .sort((a, b) => (b?.confidence || 0) - (a?.confidence || 0));
        const total = typeof state.startTime === 'number' ? Date.now() - state.startTime : null;
        const name = d => d?.detector?.name || d?.name || d?.detector?.id || 'Unknown';

        const top = detections[0];
        const title = `${ScanReport.host(url)} · ${detections.length} detection${detections.length === 1 ? '' : 's'}` +
            (total !== null ? ` in ${ScanReport.seconds(total)}` : '') +
            (top ? ` (top: ${name(top)} ${Math.round(top.confidence || 0)}%)` : '');

        const lines = [];
        const nameWidth = Math.min(28, Math.max(0, ...detections.map(d => name(d).length)));
        for (const d of detections.slice(0, ScanReport.MAX_ROWS)) {
            const label = ScanReport.categoryLabel(d.category || d.detector?.category).padEnd(11);
            const confidence = `${Math.round(d.confidence || 0)}%`.padStart(4);
            const combos = Array.isArray(d.combinations) && d.combinations.length
                ? ` · ${d.combinations.length === 1 ? 'combination' : `${d.combinations.length} combinations`}: ${ScanReport.short(d.combinations[0].name || d.combinations[0].id, 40)}`
                : '';
            const row = `${label} ${ScanReport.short(name(d), 28).padEnd(nameWidth)} ${confidence}  ${ScanReport.evidenceLine(d.matches)}${combos}`;
            lines.push(row.length > ScanReport.MAX_ROW ? `${row.slice(0, ScanReport.MAX_ROW - 1)}…` : row);
        }
        if (detections.length > ScanReport.MAX_ROWS) lines.push(`… ${detections.length - ScanReport.MAX_ROWS} more`);
        if (detections.length === 0) lines.push('No protection found on this page.');

        const stats = state.stats || {};
        const data = [];
        if (typeof stats.cookies === 'number') data.push(`cookies=${stats.cookies}`);
        if (stats.headers) data.push(`headers=${stats.headers}`);
        if (typeof stats.dom === 'number') data.push(`dom=${stats.dom}`);
        if (typeof stats.scripts === 'number') data.push(`scripts=${stats.scripts}`);
        if (typeof stats.resources === 'number') data.push(`resources=${stats.resources}`);
        if (typeof stats.requests === 'number') data.push(`requests=${stats.requests}`);
        if (stats.payloads) data.push(`payloads=${stats.payloads}`);
        if (typeof stats.html === 'number') data.push(`html=${Math.round(stats.html / 1024)} KB`);
        if (data.length) lines.push(`${'Data'.padEnd(11)} ${data.join(' ')}`);

        const timing = [];
        if (typeof stats.collectMs === 'number') timing.push(`collect ${ScanReport.seconds(stats.collectMs)}`);
        if (typeof stats.matchMs === 'number') timing.push(`match ${ScanReport.seconds(stats.matchMs)}${stats.detectors ? ` (${stats.detectors} detectors)` : ''}`);
        if (state.hooksTimedOut) {
            timing.push('hooks timed out');
        } else if (state.hooksCompletionReason || typeof state.hooksCompletionTime === 'number') {
            const fired = typeof state.hooksFired === 'number' ? `, ${state.hooksFired} fired` : '';
            timing.push(`hooks ${ScanReport.seconds(state.hooksCompletionTime)} (${state.hooksCompletionReason || 'done'}${fired})`);
        }
        if (state.windowStats && typeof state.windowStats.checked === 'number') {
            timing.push(`window ${state.windowStats.detected || 0}/${state.windowStats.checked}${state.windowStats.reason ? ` (${state.windowStats.reason})` : ''}`);
        }
        if (timing.length) lines.push(`${'Timing'.padEnd(11)} ${timing.join(' · ')}`);

        const failed = state.hooksUninstallStats?.failedTargets;
        if (Array.isArray(failed) && failed.length) {
            lines.push(`${'Warning'.padEnd(11)} ${failed.length} hooks could not be removed: ${failed.slice(0, 4).join(', ')}`);
        }
        return { title, lines };
    },

    /** Print the report (Debug mode only; free otherwise) */
    log(url, results, state) {
        if (typeof Logger === 'undefined' || !Logger.debugMode) return;
        try {
            const { title, lines } = ScanReport.build(url, results, state);
            Logger.report('SCAN', title, lines);
        } catch (error) {
            Logger.warn('SCAN', 'Scan report failed', error);
        }
    }
};

if (typeof self !== 'undefined') {
    self.ScanReport = ScanReport;
}

// Node test export (no-op in the service worker, where `module` is undefined)
if (typeof module !== 'undefined' && module.exports) { module.exports = ScanReport; }
