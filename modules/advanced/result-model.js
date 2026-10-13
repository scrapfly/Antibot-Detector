/** Versioned structured tool results; existing text-only records remain readable. */
(function (global) {
    let sequence = 0;
    function requestId() {
        return global.crypto?.randomUUID?.() || `advanced_${Date.now()}_${++sequence}`;
    }
    function create({ vendorId, operation, data, label = '', id = requestId() }) {
        return { schemaVersion: 1, requestId: id, vendorId, tool: operation, label, result: data };
    }
    function text(data) {
        if (data?.schemaVersion === 1) return JSON.stringify(data.result, null, 2);
        return Array.isArray(data?.lines) ? data.lines.join('\n') : '';
    }
    global.AdvancedResultModel = Object.freeze({ create, text, requestId });
})(globalThis);
