/** Historical packaged patterns only. User edits and custom definitions are never repaired. */
class DetectorMigrations {
    static apply(detector) {
        if (!detector || detector.userModified || detector.officialSnapshot) return detector;
        if (typeof detector.author !== 'string' || detector.author.trim().toLowerCase() !== 'scrapfly') return detector;
        // Both affected definitions shipped as version 1.0. Newer definitions
        // (and custom rules with a reused ID) must keep their chosen semantics.
        if (!/^1\.0(?:\.0)?$/.test(String(detector.version || ''))) return detector;
        const detection = detector.detection;
        if (!detection || typeof detection !== 'object') return detector;
        if (detector.id === 'detect-datadome') {
            for (const [method, original] of [['cookie', 'datadome'], ['header', 'x-datadome-cid']]) {
                for (const rule of (Array.isArray(detection[method]) ? detection[method] : [])) {
                    if (!rule || rule.name !== original || rule.nameRegex === true || rule.value) continue;
                    // Literal names shipped before exact-name matching. Do not
                    // reinterpret custom expressions that happen to contain them.
                    rule.name = `^${original}$`;
                    rule.nameRegex = true;
                }
            }
        }
        if (detector.id === 'detect-shapesecurity') {
            const originals = new Set(['a', 'b', 'c', 'd', 'f', 'z'].map(suffix => `x-[a-z0-9]{8}-${suffix}`));
            for (const rule of (Array.isArray(detection.header) ? detection.header : [])) {
                if (!rule || typeof rule.name !== 'string' || rule.nameRegex !== true || rule.value) continue;
                const original = rule.name.trim();
                if (originals.has(original)) rule.name = `^${original}$`;
            }
        }
        return detector;
    }
}

if (typeof globalThis !== 'undefined') globalThis.DetectorMigrations = DetectorMigrations;
if (typeof module !== 'undefined' && module.exports) module.exports = DetectorMigrations;
