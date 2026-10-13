
// strings; Rust needs \u{..}; the shell gets single quotes.
const scrapflyQuote = {
  json: (value) => JSON.stringify(String(value)),
  rust: (value) => `"${String(value)
    .replace(/[\\"]/g, c => `\\${c}`)
    .replace(/[\u0000-\u001f\u007f]/g, c => `\\u{${c.charCodeAt(0).toString(16)}}`)}"`,
  shell: (value) => `'${String(value).replace(/'/g, `'\\''`)}'`
};

/** "Detected: A, B, C, D and 2 more" as a comment line, or '' */
ScrapflyExport.detectedComment = function(names, prefix) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return '';
  const shown = list.slice(0, ScrapflyExport.MAX_NAMES).join(', ');
  const more = list.length > ScrapflyExport.MAX_NAMES ? ` and ${list.length - ScrapflyExport.MAX_NAMES} more` : '';
  // A name never ends the comment early: no line breaks inside it
  return `${prefix} Detected: ${shown}${more}`.replace(/[\r\n]+/g, ' ');
};

const scrapflyLines = (...lines) => lines.filter(line => line !== null).join('\n');

/** Base64 (URL-safe, no padding) of UTF-8 text, as the SDKs send js and js_scenario */
ScrapflyExport.base64Url = function(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// A JSON value as a literal: Python (True/None), JavaScript, Go (map[string]any)
const sfxLiteral = (value, lang) => {
  const q = scrapflyQuote.json;
  if (value === null) return lang === 'python' ? 'None' : (lang === 'go' ? 'nil' : 'null');
  if (typeof value === 'boolean') return lang === 'python' ? (value ? 'True' : 'False') : String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return q(value);
  if (Array.isArray(value)) {
    const items = value.map(v => sfxLiteral(v, lang)).join(', ');
    return lang === 'go' ? `[]any{${items}}` : `[${items}]`;
  }
  const pairs = Object.entries(value).map(([k, v]) => `${q(k)}: ${sfxLiteral(v, lang)}`).join(', ');
  return lang === 'go' ? `map[string]any{${pairs}}` : `{${pairs}}`;
};
// Rust's json! takes JSON, except \uXXXX escapes, which Rust writes \u{XXXX}
const sfxRustJson = (value) => JSON.stringify(value).replace(/\\u([0-9a-fA-F]{4})/g, '\\u{$1}');
const sfxPascal = (snake) => String(snake).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
// A shell word that needs no quotes stays bare (us, win11, en-US,fr)
const sfxShellArg = (value) => (/^[A-Za-z0-9_.,:\/+-]+$/.test(String(value)) ? String(value) : scrapflyQuote.shell(value));
const SFX_GO_FORMAT = { clean_html: 'FormatCleanHTML', json: 'FormatJSON', markdown: 'FormatMarkdown', text: 'FormatText' };
const SFX_RUST_FORMAT = { clean_html: 'CleanHtml', json: 'Json', markdown: 'Markdown', text: 'Text' };
const SFX_GO_POOL = { public_residential_pool: 'PublicResidentialPool', public_datacenter_pool: 'PublicDataCenterPool' };
const SFX_RUST_POOL = { public_residential_pool: 'PublicResidentialPool', public_datacenter_pool: 'PublicDatacenterPool' };
// SDK field names that differ from the API's (all others are the same in
// Python and Node; Go and Rust below)
const SFX_SDK_NAME = { webhook_name: 'webhook' };
const SFX_GO_FIELD = {
  unblocker: 'Unblocker', cost_budget: 'CostBudget', render_js: 'RenderJS', rendering_wait: 'RenderingWait', wait_for_selector: 'WaitForSelector',
  rendering_stage: 'RenderingStage', auto_scroll: 'AutoScroll', js: 'JS', js_scenario: 'JSScenario', screenshots: 'Screenshots',
  screenshot_flags: 'ScreenshotFlags', proxy_pool: 'ProxyPool', country: 'Country', lang: 'Lang', os: 'OS', browser_brand: 'BrowserBrand',
  geolocation: 'Geolocation', headers: 'Headers', timeout: 'Timeout', retry: 'Retry', format: 'Format', format_options: 'FormatOptions',
  proxified_response: 'ProxifiedResponse', extraction_model: 'ExtractionModel', extraction_prompt: 'ExtractionPrompt',
  extraction_template: 'ExtractionTemplate', cache: 'Cache', cache_ttl: 'CacheTTL', cache_clear: 'CacheClear', session: 'Session',
  session_sticky_proxy: 'SessionStickyProxy', debug: 'Debug', correlation_id: 'CorrelationID', tags: 'Tags', dns: 'DNS', ssl: 'SSL',
  webhook_name: 'Webhook'
};
const SFX_CLI_FLAG = {
  unblocker: '--unblocker', cost_budget: '--cost-budget', render_js: '--render-js', rendering_wait: '--rendering-wait',
  wait_for_selector: '--wait-for-selector', rendering_stage: '--rendering-stage', auto_scroll: '--auto-scroll', js: '--js-file',
  js_scenario: '--js-scenario-file', screenshot_flags: '--screenshot-flag', proxy_pool: '--proxy-pool', country: '--country', lang: '--lang',
  os: '--os', browser_brand: '--browser-brand', geolocation: '--geolocation', headers: '--header', timeout: '--request-timeout', retry: '--retry',
  format: '--format', format_options: '--format-option', proxified_response: '--proxified', extraction_model: '--extraction-model',
  extraction_prompt: '--extraction-prompt', extraction_template: '--extraction-template', cache: '--cache', cache_ttl: '--cache-ttl',
  cache_clear: '--cache-clear', session: '--session', session_sticky_proxy: '--session-sticky-proxy', debug: '--debug',
  correlation_id: '--correlation-id', tags: '--tag', dns: '--dns', ssl: '--ssl', webhook_name: '--webhook'
};

/** Python or Node keyword/value lines for the parameters (one per line, scenarios one step per line) */
const sfxKeywordLines = (params, lang, indent) => {
  const q = scrapflyQuote.json;
  const sep = lang === 'python' ? '=' : ': ';
  const bool = (v) => (lang === 'python' ? (v ? 'True' : 'False') : String(v));
  const lines = [];
  for (const { api, type, value } of params) {
    const name = SFX_SDK_NAME[api] || api;
    let v;
    if (type === 'bool') v = bool(value);
    else if (type === 'int') v = String(value);
    else if (type === 'list' || type === 'fmtopts' || type === 'flags') v = `[${value.map(q).join(', ')}]`;
    else if (type === 'headers' || type === 'screens') v = `{${value.map(([k, x]) => `${q(k)}: ${q(x)}`).join(', ')}}`;
    else if (type === 'scenario') {
      lines.push(`${indent}${name}${sep}[`, ...value.map(step => `${indent}    ${sfxLiteral(step, lang)},`), `${indent}],`);
      continue;
    } else v = q(value);
    const comment = api === 'unblocker' ? (lang === 'python' ? '  # anti-bot bypass' : ' // anti-bot bypass') : '';
    lines.push(`${indent}${name}${sep}${v},${comment}`);
  }
  return lines;
};

/**
 * Ready-to-run code for one language.
 * @param {string} language - id from ScrapflyExport.LANGUAGES
 * @param {string} url - http(s) page address (ScrapflyExport.targetUrl)
 * @param {string[]} [names] - detected protections, for a comment
 * @param {object} [options] - see ScrapflyExport.FIELDS
 * @returns {string}
 */
ScrapflyExport.snippet = function(language, url, names = [], options = {}) {
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
  const o = ScrapflyExport.normalizeOptions(options);
  if (o.product === 'browser') return ScrapflyExport.browserSnippet(language, url, names, o);
  if (!ScrapflyExport.languagesFor('scrape').some(l => l.id === language)) return '';
  const params = ScrapflyExport.scrapeParams(o);
  const has = (type) => params.some(p => p.type === type);
  const q = scrapflyQuote;
  switch (language) {
    case 'python':
      return scrapflyLines(
        '# pip install scrapfly-sdk',
        detected('#'),
        'import os',
        'from scrapfly import ScrapflyClient, ScrapeConfig',
        '',
        'client = ScrapflyClient(key=os.environ["SCRAPFLY_API_KEY"])',
        'result = client.scrape(ScrapeConfig(',
        `    url=${q.json(url)},`,
        ...sfxKeywordLines(params, 'python', '    '),
        '))',
        'print(result.content)'
      );
    case 'node':
      return scrapflyLines(
        '// npm install scrapfly-sdk  (run as an ES module, e.g. scrape.mjs)',
        detected('//'),
        "import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';",
        '',
        'const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });',
        'const result = await client.scrape(new ScrapeConfig({',
        `  url: ${q.json(url)},`,
        ...sfxKeywordLines(params, 'node', '  '),
        '}));',
        'console.log(result.result.content);'
      );
    case 'curl': {
      // What the SDKs send: format options join the format, js and
      // js_scenario go base64-encoded, a saved template is "persistent:"
      const args = [`curl -G ${ScrapflyExport.API_URL}`, '  --data-urlencode "key=$SCRAPFLY_API_KEY"', `  --data-urlencode ${q.shell(`url=${url}`)}`];
      const formatOptions = params.find(p => p.api === 'format_options');
      for (const { api, type, value } of params) {
        if (type === 'bool' || type === 'int' || type === 'pool' || type === 'model') args.push(`  -d ${api}=${value}`);
        else if (type === 'format') args.push(`  -d format=${value}${formatOptions ? `:${formatOptions.value.join(',')}` : ''}`);
        else if (type === 'fmtopts') continue;
        else if (type === 'flags') args.push(`  -d ${api}=${value.join(',')}`);
        else if (type === 'list') args.push(sfxShellArg(value.join(',')) === value.join(',') ? `  -d ${api}=${value.join(',')}` : `  --data-urlencode ${q.shell(`${api}=${value.join(',')}`)}`);
        else if (type === 'headers' || type === 'screens') value.forEach(([k, x]) => args.push(`  --data-urlencode ${q.shell(`${api}[${type === 'headers' ? k.toLowerCase() : k}]=${x}`)}`));
        else if (type === 'js') args.push(`  -d js=${ScrapflyExport.base64Url(value)}`);
        else if (type === 'scenario') args.push(`  -d js_scenario=${ScrapflyExport.base64Url(JSON.stringify(value))}`);
        else if (type === 'template') args.push(`  --data-urlencode ${q.shell(`${api}=persistent:${value}`)}`);
        else if (sfxShellArg(value) === String(value)) args.push(`  -d ${api}=${value}`);
        else args.push(`  --data-urlencode ${q.shell(`${api}=${value}`)}`);
      }
      return scrapflyLines(detected('#'), args.join(' \\\n'));
    }
    case 'cli': {
      // The CLI reads js and js_scenario from files: written first
      const files = [];
      const flags = [];
      for (const { api, type, value } of params) {
        const flag = SFX_CLI_FLAG[api];
        if (type === 'bool') flags.push(value ? flag : `${flag}=false`);
        else if (type === 'int' || type === 'pool' || type === 'format' || type === 'model') flags.push(`${flag} ${value}`);
        else if (type === 'fmtopts' || type === 'flags') flags.push(`${flag} ${value.join(',')}`);
        else if (type === 'list') flags.push(`${flag} ${sfxShellArg(value.join(','))}`);
        else if (type === 'headers') value.forEach(([k, x]) => flags.push(`${flag} ${q.shell(`${k}=${x}`)}`));
        else if (type === 'screens') flags.push(value[0][1] === 'fullpage' ? '--screenshot' : `--screenshot-named ${q.shell(`main=${value[0][1]}`)}`);
        else if (type === 'js') {
          const body = value.replace(/\n+$/, '');
          let delimiter = 'SCRAPFLY_JS';
          const lines = new Set(body.split(/\r?\n/));
          while (lines.has(delimiter)) delimiter += '_';
          files.push(`cat > script.js <<'${delimiter}'`, body, delimiter);
          flags.push(`${flag} script.js`);
        } else if (type === 'scenario') {
          files.push('cat > scenario.json <<\'SCRAPFLY_JSON\'', JSON.stringify(value, null, 2), 'SCRAPFLY_JSON');
          flags.push(`${flag} scenario.json`);
        } else flags.push(`${flag} ${sfxShellArg(value)}`);
      }
      const command = flags.length <= 1
        ? [`scrapfly scrape ${q.shell(url)}`, ...flags].join(' ')
        : [`scrapfly scrape ${q.shell(url)}`, ...flags.map(f => `  ${f}`)].join(' \\\n');
      return scrapflyLines(
        '# https://github.com/scrapfly/scrapfly-cli/releases (reads SCRAPFLY_API_KEY)',
        detected('#'),
        ...files,
        command
      );
    }
    case 'go': {
      const fields = [['URL', q.json(url)]];
      for (const { api, type, value } of params) {
        const key = SFX_GO_FIELD[api];
        if (api === 'unblocker') fields.push([key, 'scrapfly.BoolPtr(true)', ' // anti-bot bypass']);
        else if (api === 'session_sticky_proxy') fields.push([key, 'scrapfly.BoolPtr(false)']);
        else if (api === 'retry') continue; // written below
        else if (type === 'bool' || type === 'int') fields.push([key, String(value)]);
        else if (type === 'pool') fields.push([key, `scrapfly.${SFX_GO_POOL[value]}`]);
        else if (type === 'format') fields.push([key, `scrapfly.${SFX_GO_FORMAT[value]}`]);
        else if (type === 'fmtopts') fields.push([key, `[]scrapfly.FormatOption{${value.map(v => `scrapfly.${sfxPascal(v)}`).join(', ')}}`]);
        else if (type === 'flags') fields.push([key, `[]scrapfly.ScreenshotFlag{${value.map(v => `scrapfly.${sfxPascal(v)}`).join(', ')}}`]);
        else if (type === 'model') fields.push([key, `scrapfly.ExtractionModel${sfxPascal(value)}`]);
        else if (type === 'list') fields.push([key, `[]string{${value.map(q.json).join(', ')}}`]);
        else if (type === 'headers' || type === 'screens') fields.push([key, `map[string]string{${value.map(([k, x]) => `${q.json(k)}: ${q.json(x)}`).join(', ')}}`]);
        else if (type === 'scenario') fields.push([key, ['[]js_scenario.JSScenarioStep{', ...value.map(step => `\t\t\t${sfxLiteral(step, 'go')},`), '\t\t}']]);
        else fields.push([key, q.json(value)]);
      }
      // Go's Retry is a plain bool: left out it would send retry=false
      if (o.retry) fields.push(['Retry', 'true', ' // the API default: Go sends false without it']);
      // gofmt lines values up one space after the longest key, per run of
      // one-line fields (a multi-line value ends the run)
      const runs = [];
      let run = [];
      for (const field of fields) {
        if (Array.isArray(field[1])) {
          if (run.length) runs.push(run);
          runs.push([field]);
          run = [];
        } else run.push(field);
      }
      if (run.length) runs.push(run);
      const body = runs.flatMap((group) => {
        if (Array.isArray(group[0][1])) {
          const [key, [first, ...rest]] = group[0];
          return [`\t\t${key}: ${first}`, ...rest.slice(0, -1), `${rest[rest.length - 1]},`];
        }
        const width = Math.max(...group.map(([key]) => key.length)) + 2;
        return group.map(([key, value, comment = '']) => `\t\t${`${key}:`.padEnd(width)}${value},${comment}`);
      });
      return scrapflyLines(
        '// go get github.com/scrapfly/go-scrapfly',
        detected('//'),
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"log"',
        '\t"os"',
        '',
        '\t"github.com/scrapfly/go-scrapfly"',
        has('scenario') ? '\tjs_scenario "github.com/scrapfly/go-scrapfly/scenario"' : null,
        ')',
        '',
        'func main() {',
        '\tclient, err := scrapfly.New(os.Getenv("SCRAPFLY_API_KEY"))',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tresult, err := client.Scrape(&scrapfly.ScrapeConfig{',
        ...body,
        '\t})',
        '\tif err != nil {',
        '\t\tlog.Fatal(err)',
        '\t}',
        '\tfmt.Println(result.Result.Content)',
        '}'
      );
    }
    case 'rust': {
      const calls = [];
      for (const { api, type, value } of params) {
        if (api === 'proxified_response') calls.push('.proxified_response()');
        else if (api === 'webhook_name') calls.push(`.webhook(${q.rust(value)})`);
        else if (type === 'bool' || type === 'int') calls.push(`.${api}(${value})${api === 'unblocker' ? ' // anti-bot bypass' : ''}`);
        else if (type === 'pool') calls.push(`.proxy_pool(ProxyPool::${SFX_RUST_POOL[value]})`);
        else if (type === 'format') calls.push(`.format(Format::${SFX_RUST_FORMAT[value]})`);
        else if (type === 'fmtopts') value.forEach(v => calls.push(`.format_option(FormatOption::${sfxPascal(v)})`));
        else if (type === 'flags') value.forEach(v => calls.push(`.screenshot_flag(ScreenshotFlag::${sfxPascal(v)})`));
        else if (type === 'model') calls.push(`.extraction_model(ExtractionModel::${sfxPascal(value)})`);
        else if (api === 'lang') value.forEach(v => calls.push(`.lang(${q.rust(v)})`));
        else if (api === 'tags') value.forEach(v => calls.push(`.tag(${q.rust(v)})`));
        else if (type === 'headers') value.forEach(([k, x]) => calls.push(`.header(${q.rust(k)}, ${q.rust(x)})`));
        else if (type === 'screens') value.forEach(([k, x]) => calls.push(`.screenshot(${q.rust(k)}, ${q.rust(x)})`));
        else if (type === 'scenario') calls.push(`.js_scenario(serde_json::json!(${sfxRustJson(value)}))`);
        else calls.push(`.${api}(${q.rust(value)})`);
      }
      const used = (type) => params.some(p => p.type === type);
      const imports = ['Client', used('model') ? 'ExtractionModel' : null, used('format') ? 'Format' : null, used('fmtopts') ? 'FormatOption' : null,
        used('pool') ? 'ProxyPool' : null, 'ScrapeConfig', used('flags') ? 'ScreenshotFlag' : null].filter(Boolean);
      return scrapflyLines(
        `// cargo add scrapfly-sdk && cargo add tokio --features full${has('scenario') ? ' && cargo add serde_json' : ''}`,
        detected('//'),
        `use scrapfly_sdk::{${imports.join(', ')}};`,
        '',
        '#[tokio::main]',
        'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
        '    let client = Client::builder()',
        '        .api_key(std::env::var("SCRAPFLY_API_KEY")?)',
        '        .build()?;',
        `    let config = ScrapeConfig::builder(${q.rust(url)})`,
        ...calls.map(call => `        ${call}`),
        '        .build()?;',
        '    let result = client.scrape(&config).await?;',
        '    println!("{}", result.result.content);',
        '    Ok(())',
        '}'
      );
    }
    default:
      return '';
  }
};

/**
 * Everything an AI assistant needs to help with this scrape, ready to paste:
 * the page, what protects it, the chosen settings, the code and the docs.
 * Written in English on purpose: it is read by a model, not shown in the UI.
 * @param {object} args
 * @param {string} args.language - id from ScrapflyExport.LANGUAGES
 * @param {string} args.url
 * @param {Array<{name: string, kind: string}>} [args.protections]
 * @param {object} [args.options]
 * @returns {string}
 */

/**
 * Cloud Browser code: the SDK builds the WebSocket address with the options
 * (or, in unblock mode, asks /unblock for a browser already past the wall),
 * Playwright connects to it and opens the page; with solveCaptcha the browser
 * solves CAPTCHAs by itself as they appear. Follows the Cloud Browser docs
 * and the SDKs' BrowserConfig and cloud_browser_unblock / cloudBrowserUnblock
 * (read 2026-10-12): proxy_pool is "datacenter" or "residential" here, not
 * the Scrape API pool names.
 */
ScrapflyExport.browserSnippet = function(language, url, names, options) {
  const o = ScrapflyExport.normalizeOptions({ ...options, product: 'browser' });
  const q = scrapflyQuote;
  const detected = (prefix) => ScrapflyExport.detectedComment(names, prefix) || null;
  const unblock = o.cbMode === 'unblock';
  const params = ScrapflyExport.browserParams(o, url);
  const captcha = !unblock && o.solveCaptcha;
  const pyArgs = sfxKeywordLines(params, 'python', '    ').map(line => (line.startsWith('    solve_captcha=') ? line.replace(/,$/, ',  # solves CAPTCHAs as they appear') : line));
  const nodeArgs = sfxKeywordLines(params, 'node', '  ').map(line => (line.startsWith('  solve_captcha:') ? line.replace(/,$/, ', // solves CAPTCHAs as they appear') : line));
  switch (language) {
    case 'python':
      return scrapflyLines(
        '# pip install scrapfly-sdk playwright',
        detected('#'),
        'import os',
        'from playwright.sync_api import sync_playwright',
        unblock ? 'from scrapfly import ScrapflyClient' : 'from scrapfly import BrowserConfig, ScrapflyClient',
        '',
        'client = ScrapflyClient(key=os.environ["SCRAPFLY_API_KEY"])',
        ...(unblock ? [
          '# A browser already past the anti-bot wall (always on residential proxies)',
          'unblocked = client.cloud_browser_unblock(',
          ...pyArgs,
          ')',
          'ws_url = unblocked["ws_url"]'
        ] : [
          'ws_url = client.cloud_browser(BrowserConfig(',
          ...pyArgs,
          '))'
        ]),
        '',
        'with sync_playwright() as p:',
        '    browser = p.chromium.connect_over_cdp(ws_url)',
        '    context = browser.contexts[0]',
        '    page = context.pages[0] if context.pages else context.new_page()',
        ...(captcha ? [
          '    # The browser solves CAPTCHAs by itself; its events say when it is done',
          '    cdp = context.new_cdp_session(page)',
          '    pending = set()',
          '',
          '    def detected(event):',
          '        pending.add(event["detectionId"])',
          '',
          '    def finished(event):',
          '        pending.discard(event["detectionId"])',
          '        if event.get("errorMessage"):',
          '            print("CAPTCHA not solved:", event["errorMessage"])',
          '',
          '    cdp.on("Antibot.captchaDetected", detected)',
          '    cdp.on("Antibot.captchaSolved", finished)',
          '    cdp.on("Antibot.captchaError", finished)',
          ''
        ] : []),
        `    page.goto(${q.json(url)})`,
        '    page.wait_for_load_state("networkidle")',
        ...(captcha ? [
          '    page.wait_for_timeout(3000)  # a CAPTCHA can appear after the page settles',
          '    for _ in range(240):  # one is being solved: wait up to 2 minutes',
          '        if not pending:',
          '            break',
          '        page.wait_for_timeout(500)'
        ] : []),
        '    print(page.content())',
        '    browser.close()  # ends the session (billed until then)'
      );
    case 'node':
      return scrapflyLines(
        '// npm install scrapfly-sdk playwright  (run as an ES module, e.g. browser.mjs)',
        detected('//'),
        "import { chromium } from 'playwright';",
        unblock ? "import { ScrapflyClient } from 'scrapfly-sdk';" : "import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';",
        '',
        'const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });',
        ...(unblock ? [
          '// A browser already past the anti-bot wall (always on residential proxies)',
          'const { ws_url: wsUrl } = await client.cloudBrowserUnblock({',
          ...nodeArgs,
          '});'
        ] : [
          'const wsUrl = client.cloudBrowser(new BrowserConfig({',
          ...nodeArgs,
          '}));'
        ]),
        '',
        'const browser = await chromium.connectOverCDP(wsUrl);',
        'const context = browser.contexts()[0];',
        'const page = context.pages()[0] ?? await context.newPage();',
        ...(captcha ? [
          '// The browser solves CAPTCHAs by itself; its events say when it is done',
          'const cdp = await context.newCDPSession(page);',
          'const pending = new Set();',
          "cdp.on('Antibot.captchaDetected', (event) => pending.add(event.detectionId));",
          "cdp.on('Antibot.captchaSolved', (event) => pending.delete(event.detectionId));",
          "cdp.on('Antibot.captchaError', (event) => {",
          '  pending.delete(event.detectionId);',
          "  console.error('CAPTCHA not solved:', event.errorMessage);",
          '});',
          ''
        ] : []),
        `await page.goto(${q.json(url)});`,
        "await page.waitForLoadState('networkidle');",
        ...(captcha ? [
          'await page.waitForTimeout(3000); // a CAPTCHA can appear after the page settles',
          'for (let i = 0; i < 240 && pending.size > 0; i++) await page.waitForTimeout(500); // one is being solved: up to 2 minutes'
        ] : []),
        'console.log(await page.content());',
        'await browser.close(); // ends the session (billed until then)'
      );
    case 'wss': {
      if (unblock) {
        const body = Object.fromEntries(params.map(({ api, value }) => [api, value]));
        return scrapflyLines(
          '# Unblocks the page in a fresh browser and returns its CDP address (ws_url)',
          '# for Playwright, Puppeteer or any CDP client; close the browser when done',
          detected('#'),
          `curl -s -X POST "${ScrapflyExport.BROWSER_HOST.replace(/^wss:/, 'https:')}/unblock?key=$SCRAPFLY_API_KEY" \\`,
          "  -H 'Content-Type: application/json' \\",
          `  -d ${q.shell(JSON.stringify(body))}`
        );
      }
      // Inside double quotes: everything but the key is percent-encoded
      // (and "!" too, which an interactive shell would expand)
      const enc = (value) => encodeURIComponent(String(value)).replace(/!/g, '%21');
      const query = ['api_key=$SCRAPFLY_API_KEY', ...params.map(({ api, value }) => `${api}=${enc(Array.isArray(value) ? value.join(',') : value)}`)];
      return scrapflyLines(
        '# Prints the address for Puppeteer, Selenium or any CDP client,',
        `# then open ${url.replace(/[\r\n]+/g, ' ')}`,
        captcha ? '# CAPTCHAs are solved by the browser: wait for its Antibot.captchaSolved event' : null,
        detected('#'),
        `echo "${ScrapflyExport.BROWSER_HOST}?${query.join('&')}"`
      );
    }
    default:
      return '';
  }
};

/** Command that puts the key in SCRAPFLY_API_KEY for this session */
ScrapflyExport.keyCommand = function(platform, language) {
  if (['curl', 'cli', 'wss'].includes(language)) return 'export SCRAPFLY_API_KEY="YOUR_API_KEY"';
  return /win/i.test(String(platform || ''))
    ? '$env:SCRAPFLY_API_KEY="YOUR_API_KEY"'
    : 'export SCRAPFLY_API_KEY="YOUR_API_KEY"';
};
