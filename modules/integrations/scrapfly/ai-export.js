/** Portable AI prompt; source options remain local. */
ScrapflyExport.aiPrompt = function({ language, url, protections = [], options = {} }) {
  const lang = ScrapflyExport.LANGUAGES.find(l => l.id === language) || ScrapflyExport.LANGUAGES[0];
  const o = ScrapflyExport.normalizeOptions(options);
  // Header values may contain browser credentials. Redact before generating
  // either the starter code or the prose shared with an AI assistant.
  o.headers = ScrapflyExport.parseHeaders(o.headers).map(([name]) => `${name}: REDACTED`).join('\n');
  const browser = o.product === 'browser';
  const code = ScrapflyExport.snippet(lang.id, url, (protections || []).map(p => p.name), o);
  const { file, run } = ScrapflyExport.fileAndRun(lang.id, o.product);
  const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ');
  const found = (protections || []).map(p => `- ${oneLine(p.name)} (${p.kind || 'anti-bot'})`);
  const formats = { raw: 'raw HTML', clean_html: 'clean HTML', json: 'JSON', markdown: 'Markdown', text: 'plain text' };
  const proxies = [
    (browser ? (o.cbMode === 'unblock' || o.browserProxyPool === 'residential') : o.proxyPool === 'public_residential_pool') ? 'residential proxies' : 'datacenter proxies',
    o.country ? `proxy country: ${o.country.toUpperCase()}` : 'any proxy country'
  ];
  // Every other parameter the code sets, as the API names it
  const shown = new Set(['unblocker', 'render_js', 'proxy_pool', 'country', 'format', 'solve_captcha', 'url', 'target_url']);
  const show = (value) => (Array.isArray(value) ? value.map(v => (Array.isArray(v) ? `${v[0]}: ${v[1]}` : (typeof v === 'object' ? JSON.stringify(v) : v))).join(', ') : String(value));
  const extra = (browser ? ScrapflyExport.browserParams(o, url) : ScrapflyExport.scrapeParams(o))
    .filter(p => !shown.has(p.api))
    .map(p => (p.api === 'headers' ? `headers (${p.value.map(([k]) => k).join(', ')})` : `${p.api}=${oneLine(show(p.value))}`));
  const settings = browser
    ? [o.cbMode === 'unblock' ? 'Scrapfly Cloud Browser opened through /unblock (a browser already past the anti-bot wall), driven with Playwright over CDP'
      : 'Scrapfly Cloud Browser driven with Playwright over CDP',
    o.cbMode === 'unblock' ? null : (o.solveCaptcha ? 'Captcha Solver on (solve_captcha=true: CAPTCHAs are solved by the browser as they appear)' : 'Captcha Solver off'),
    ...proxies].filter(Boolean)
    : [o.unblocker ? 'Scrape API with the Unblocker on (Scrapfly\'s anti-bot bypass)' : 'Scrape API with the Unblocker off',
      `output: ${formats[o.format]}`,
      ...proxies,
      o.renderJs ? 'JavaScript rendering on' : 'JavaScript rendering off'];
  if (extra.length) settings.push(`other parameters: ${extra.join('; ')}`);
  const fence = ['curl', 'cli', 'wss'].includes(lang.id) ? 'bash' : (lang.id === 'node' ? 'javascript' : lang.id);
  const steps = [`1. Set the API key: ${ScrapflyExport.keyCommand('')}`];
  steps.push(run ? `2. Save the code as ${file} and run: ${run}` : '2. Paste the code in a terminal.');
  return [
    'I want to scrape a web page with the Scrapfly Web Scraping API. Help me get this working and extend it.',
    '',
    `Page: ${oneLine(url)}`,
    found.length ? 'Protections detected on the page (by the Scrapfly Detector browser extension):' : 'No anti-bot or CAPTCHA protection was detected on the page.',
    ...found,
    `Settings: ${settings.join(', ')}.`,
    '',
    `Starter code (${lang.label}):`,
    '```' + fence,
    code,
    '```',
    '',
    'To run it:',
    ...steps,
    '',
    'Scrapfly docs for AI assistants: ' + ScrapflyExport.AI_DOCS_URL,
    browser ? 'Captcha Solver docs: ' + ScrapflyExport.CAPTCHA_DOCS_URL : 'Unblocker docs: ' + ScrapflyExport.UNBLOCKER_DOCS_URL,
    'Never put the API key in the code: keep reading it from SCRAPFLY_API_KEY.'
  ].join('\n');
};
