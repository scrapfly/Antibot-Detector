/** Pure statistics of Advanced captures and tool results (scrapfly_advanced_history). */
const ToolsStats = {
  /** Product names of the Advanced modules; History buckets use imperva / awswaf. */
  MODULE_NAMES: {
    recaptcha: 'reCAPTCHA', akamai: 'Akamai Bot Manager', shapesecurity: 'Shape Security',
    incapsula: 'Imperva/Incapsula', imperva: 'Imperva/Incapsula', 'aws-waf': 'AWS WAF', awswaf: 'AWS WAF',
    geetest: 'GeeTest', datadome: 'DataDome', cloudflare: 'Cloudflare', turnstile: 'Turnstile',
    hcaptcha: 'hCaptcha', funcaptcha: 'FunCaptcha'
  },
  isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); },
  moduleName(id) { return ToolsStats.MODULE_NAMES[id] || String(id || ''); },
  /** Flat list { module, timestamp, tool } from the stored history (object or JSON string). */
  parse(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    if (!ToolsStats.isRecord(value)) return [];
    const out = [];
    for (const [module, captures] of Object.entries(value)) {
      for (const capture of Array.isArray(captures) ? captures : []) {
        if (!ToolsStats.isRecord(capture)) continue;
        const ts = Number(capture.timestamp);
        if (!Number.isFinite(ts)) continue;
        const data = ToolsStats.isRecord(capture.data) ? capture.data : {};
        // A tool result carries its button's label; anything else is a capture
        const tool = data.tool && typeof data.label === 'string' && data.label.trim() ? data.label.trim() : '';
        out.push({ module, timestamp: ts, tool });
      }
    }
    return out;
  },
  /** Captures in [since, now] (since null: all), grouped by vendor, tool and local day. */
  compute(captures, options = {}) {
    const since = typeof options.since === 'number' && Number.isFinite(options.since) ? options.since : null;
    const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
    const dayKey = typeof options.dayKey === 'function' ? options.dayKey : (ts) => new Date(ts).toISOString().slice(0, 10);
    const list = (Array.isArray(captures) ? captures : []).filter((c) => c.timestamp <= now && (since === null || c.timestamp >= since));
    const modules = new Map(), tools = new Map(), perDay = new Map();
    for (const capture of list) {
      const m = modules.get(capture.module) || { module: capture.module, name: ToolsStats.moduleName(capture.module), count: 0 };
      m.count++;
      modules.set(capture.module, m);
      const key = capture.tool || '';
      const t = tools.get(key) || { label: capture.tool, capture: !capture.tool, count: 0 };
      t.count++;
      tools.set(key, t);
      const day = dayKey(capture.timestamp);
      perDay.set(day, (perDay.get(day) || 0) + 1);
    }
    const byCount = (a, b) => b.count - a.count || String(a.name || a.label).localeCompare(String(b.name || b.label));
    return { total: list.length, byModule: [...modules.values()].sort(byCount), byTool: [...tools.values()].sort(byCount), perDay };
  }
};
if (typeof window !== 'undefined') window.ToolsStats = ToolsStats;
else if (typeof self !== 'undefined') self.ToolsStats = ToolsStats;
if (typeof module !== 'undefined' && module.exports) module.exports = ToolsStats;
