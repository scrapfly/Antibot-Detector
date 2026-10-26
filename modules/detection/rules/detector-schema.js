/** Pure normalization and admission checks for detector definitions. */
// The detection categories are described once, in modules/core/categories.js (the popup and the worker load it first)
if (typeof Categories === 'undefined' && typeof module !== 'undefined' && typeof require === 'function') {
  globalThis.Categories = require('../../core/categories.js');
}
class DetectorSchema {
    static METHODS = ['cookie', 'header', 'content', 'dom', 'url', 'window', 'js_hooks', 'payload'];
    static isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    static safeKey(key) {
        return typeof key === 'string' && key.trim().length > 0 && key !== 'prototype' && !Object.prototype.hasOwnProperty.call(Object.prototype, key);
    }

    static validVersion(version) {
        return typeof version === 'string' && /^\d+(?:\.\d+){0,3}$/.test(version);
    }

    static compatible(detector, extensionVersion) {
        if (detector.minExtensionVersion === undefined) return true;
        if (!this.validVersion(detector.minExtensionVersion)) return false;
        if (!extensionVersion) return false;
        const need = detector.minExtensionVersion.split('.').map(Number);
        const have = extensionVersion.split('.').map(Number);
        for (let i = 0; i < Math.max(need.length, have.length); i++) {
            if ((need[i] || 0) !== (have[i] || 0)) return (have[i] || 0) > (need[i] || 0);
        }
        return true;
    }

    static validCombination(node, ids, depth = 0) {
        if (!this.isRecord(node) || depth > 30) return false;
        const kinds = ['pattern', 'method', 'not', 'all', 'any', 'of'].filter(key => node[key] !== undefined);
        if (kinds.length !== 1) return false;
        if (kinds[0] === 'pattern') return typeof node.pattern === 'string' && ids.has(node.pattern);
        if (kinds[0] === 'method') return this.METHODS.includes(node.method);
        if (kinds[0] === 'not') return this.validCombination(node.not, ids, depth + 1);
        const children = node[kinds[0]];
        if (!Array.isArray(children) || !children.length) return false;
        if (kinds[0] === 'of' && (!Number.isInteger(node.atLeast) || node.atLeast < 1 || node.atLeast > children.length)) return false;
        return children.every(child => this.validCombination(child, ids, depth + 1));
    }

    static RULE_TEXT_FIELDS = Object.freeze(['name', 'value', 'text', 'selector', 'path', 'target', 'urlPattern', 'description',
        'textScope', 'scope', 'condition', 'nameScope', 'valueScope', 'body', 'windowPath']);

    /** Validate before normalizing: normalization must never hide corrupt input. */
    static admit(detector, { categoryName, detectorName, extensionVersion } = {}) {
        if (!this.isRecord(detector) || !this.safeKey(detectorName) || !this.isRecord(detector.detection)) return null;
        if (detector.id !== undefined && (!this.safeKey(detector.id) || this.canonicalizeDetectorId(detector.id) !== this.canonicalizeDetectorId(detectorName))) return null;
        for (const field of ['name', 'author', 'category', 'version', 'description', 'website', 'lastUpdated', 'icon', 'customIcon', 'difficulty']) {
            if (detector[field] !== undefined && typeof detector[field] !== 'string') return null;
        }
        // A logo is a file name, an address or an emoji, never markup
        if (/[<>"'`]/.test(detector.icon || '') || /[<>"'`\s]/.test(detector.customIcon || '')) return null;
        if (detector.enabled !== undefined && typeof detector.enabled !== 'boolean') return null;
        if (!this.compatible(detector, extensionVersion)) return null;
        const ids = new Set();
        const fields = { cookie: 'name', header: 'name', url: 'text', content: 'text', payload: 'text', dom: 'selector', window: 'path', js_hooks: 'target' };
        for (const method of this.METHODS) {
            const rules = detector.detection[method];
            if (rules === undefined) continue;
            if (!Array.isArray(rules)) return null;
            for (const [index, rule] of rules.entries()) {
                if (!this.isRecord(rule) || typeof rule[fields[method]] !== 'string' || !rule[fields[method]].trim()) return null;
                if (rule.confidence !== undefined && (!Number.isFinite(rule.confidence) || rule.confidence < 0 || rule.confidence > 100)) return null;
                if (rule.id !== undefined && !this.safeKey(rule.id)) return null;
                // The engine calls string methods on these: a number or an object would stop every scan
                for (const field of this.RULE_TEXT_FIELDS) {
                    if (rule[field] !== undefined && typeof rule[field] !== 'string') return null;
                }
                if (rule.methods !== undefined && (!Array.isArray(rule.methods) || rule.methods.some(m => typeof m !== 'string'))) return null;
                const id = rule.id || `${method}-${index + 1}`;
                if (ids.has(id)) return null;
                ids.add(id);
                for (const field of ['name', 'value', 'text', 'selector', 'url']) {
                    if (rule[`${field}Regex`] !== true) continue;
                    const pattern = field === 'url' ? rule.urlPattern : rule[field];
                    if (pattern === undefined || pattern === '') continue;
                    if (typeof pattern !== 'string') return null;
                    try { new RegExp(pattern); } catch (_) { return null; }
                }
            }
        }
        if (detector.combinations !== undefined) {
            if (!Array.isArray(detector.combinations)) return null;
            for (const combination of detector.combinations) {
                if (!this.isRecord(combination) || !this.validCombination(combination.when, ids)) return null;
                if (combination.confidence !== undefined && (!Number.isFinite(combination.confidence) || combination.confidence < 0 || combination.confidence > 100)) return null;
            }
        }
        return this.normalize(JSON.parse(JSON.stringify(detector)), { categoryName, detectorName, source: 'import' });
    }

    /** All-or-nothing admission for current exports and legacy bare maps. */
    static admitImport(data, extensionVersion) {
        if (!this.isRecord(data)) return null;
        const source = Object.prototype.hasOwnProperty.call(data, 'detectors') ? data.detectors : data;
        if (!this.isRecord(source)) return null;
        const incoming = [];
        const ids = new Set();
        for (const [category, records] of Object.entries(source)) {
            if (!this.safeKey(category) || !this.isRecord(records)) return null;
            for (const [key, detector] of Object.entries(records)) {
                const normalized = this.admit(detector, { categoryName: category, detectorName: key, extensionVersion });
                if (!normalized || ids.has(normalized.id)) return null;
                ids.add(normalized.id);
                incoming.push({ category, detector: normalized, enabledProvided: typeof detector.enabled === 'boolean' });
            }
        }
        return incoming.length ? incoming : null;
    }

    // Remove prefix, join with spaces, capitalize
    static humanizeDetectorName(detectorId) {
        if (!detectorId || typeof detectorId !== 'string') return 'Unknown';
        const cleaned = detectorId.replace(/^detect-/, '').replace(/[-_]+/g, ' ').trim();
        return cleaned.split(' ').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Ensure canonical prefix format
    static canonicalizeDetectorId(detectorId) {
        if (!detectorId || typeof detectorId !== 'string') return '';
        if (detectorId.startsWith('detect-')) {
            return detectorId;
        }
        return `detect-${detectorId}`;
    }

    // Convert category name to display format
    static categoryDisplayName(categoryName) {
        return Categories.NAMES[Categories.normalize(categoryName)] || categoryName || 'Unknown';
    }

    /** Return a normalized copy; stored data can be repaired without mutating its caller. */
    static normalize(detectorData, { categoryName, detectorName } = {}) {
        if (!this.isRecord(detectorData)) return null;
        const canonicalId = this.canonicalizeDetectorId(detectorName || detectorData.id || '');
        if (!canonicalId) return null;
        const detector = JSON.parse(JSON.stringify(detectorData));
        detector.id = canonicalId;
        if (!detector.name || typeof detector.name !== 'string') detector.name = this.humanizeDetectorName(canonicalId);
        if (!detector.category || typeof detector.category !== 'string') detector.category = this.categoryDisplayName(categoryName);
        if (detector.enabled === undefined) detector.enabled = true;
        if (!detector.version || typeof detector.version !== 'string') detector.version = '0.0';
        const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
            ? DetectionUtils.normalizeDifficulty(detector.difficulty) : null;
        const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
            ? DetectionUtils.defaultDifficultyForCategory(categoryName || detector.category) : 'Medium';
        detector.difficulty = normalizedDifficulty || defaultDifficulty;
        if (!this.isRecord(detector.detection)) detector.detection = {};
        for (const key of this.METHODS) {
            if (detector.detection[key] !== undefined && !Array.isArray(detector.detection[key])) detector.detection[key] = [];
        }
        // Cookie/header collectors never expose storage; normalize legacy scopes.
        const normalizeScope = (scope, fallback) => {
            const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
            if (normalized === 'all_with_storage') return 'all';
            return ['request', 'response', 'all'].includes(normalized) ? normalized : fallback;
        };
        for (const [method, fallback] of [['cookie', 'request'], ['header', 'response']]) {
            for (const rule of (detector.detection[method] || [])) {
                if (!this.isRecord(rule)) continue;
                if (rule.nameScope != null) rule.nameScope = normalizeScope(rule.nameScope, fallback);
                if (rule.valueScope != null) rule.valueScope = normalizeScope(rule.valueScope, fallback);
            }
        }
        return detector;
    }

}

if (typeof globalThis !== 'undefined') globalThis.DetectorSchema = DetectorSchema;
if (typeof module !== 'undefined' && module.exports) module.exports = DetectorSchema;
