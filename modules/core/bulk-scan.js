/**
 * Bulk scan: a list of pages scanned one at a time in a background tab (sections/bulk/, background/bulk-scan-runner.js).
 * Pure (no browser APIs), so the page, the service worker and the tests share it.
 *
 *   linesOf()        the addresses in a pasted list or an uploaded .txt/.csv (one per line; the first cell of a CSV row
 *                    that looks like an address)
 *   readList(), extrasOf(), attachExtras()   a CSV's other columns (header and cells), kept with the run's pages so the
 *                    table and the exports give them back after http_status and the results join back to the person's sheet
 *   normalize()      one address as it is scanned: https:// added to a bare host, the #fragment dropped; or why not
 *   prepare()        the run's pages: de-duplicated, http/https only, the "Sites to scan" setting applied, at most
 *                    the cap; what is left out is listed as skipped with the reason (duplicates and the pages over the
 *                    cap are only counted)
 *   isSitemap(), parseSitemap()   a sitemap address, and the <loc> entries of a sitemap or a sitemap index
 *   sameSite()       whether an address a sitemap lists is on the sitemap's own site: a sitemap speaks for its own host
 *                    only (the page keeps every other listed address out, and never fetches a sitemap listed for another
 *                    host). It judges the address as listed: the worker opens it and follows its redirects
 *   createRun(), begin(), finish(), fail(), skip(), pause(), resume(), stop(), complete(), recover()
 *                    the run's states: running → paused → running, then done or stopped; recover() is what a service
 *                    worker that starts again does with a run it finds in session storage (nobody is scanning it any
 *                    more: a running one is stopped, never left "running"; a paused one stays paused). finish() keeps a
 *                    page's outcome with its HTTP status when it is known (the status code of the response that loaded
 *                    it: a block page answers 403, 429 or 503), which the table and every export show
 *   waitBefore()     how long the run still waits before its next page: "Wait between pages" (delaySec, 0 to 60 s) counts
 *                    from the end of the last page visited, so a run resumed, or taken on by a worker that started again,
 *                    waits only what is left of it
 *   hold(), release()   a pause the person did not ask for ('off': the extension was switched off, so no page can be
 *                    scanned): the page being scanned waits again at once, and the reason stays until the extension is
 *                    on again (release) or the run resumes
 *   continuation(), carryOver()   "Scan the pages still waiting": what a stopped run leaves to scan, and the pages that
 *                    already have their outcome, which stay in the list of the run that scans the rest
 *   summarize()      the protections of a finished page, as the table and the exports show them
 *   protectionTotals()   how many scanned pages each protection was found on: the "Most seen" line of the page, and a line
 *                    of the Markdown export and a field of the JSON export (the CSV is one row per protection, as it was)
 *   diff(), diffText()    what changed on each page since an earlier run of the same list (background/bulk-scan-runner.js
 *                    keeps the last ones: BulkRuns), pages matched by address and protections by name: "+DataDome −Kasada · 200 → 403"
 *   build(), fileName()   the CSV, JSON and Markdown exports (with the person's columns and the comparison, when there are)
 *   oneLines()            the run as one line per page, for a chat or a ticket
 */
(function(root) {
  'use strict';

  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);
  const HttpStatus = root.HttpStatus || (typeof require === 'function' ? require('./http-status.js') : undefined);
  /** A page's HTTP status as the table and the exports give it, or null when it is not known. */
  const httpStatusOf = (value) => (HttpStatus ? HttpStatus.of(value) : null);

  const MAX_URLS = 200;            // pages per run, at most
  const TIMEOUT_S = Object.freeze({ min: 10, max: 120, default: 45 });
  const DELAY_S = Object.freeze({ min: 0, max: 60, default: 0 });  // the wait between two pages ("Wait between pages")
  const MAX_SKIPPED_LISTED = 200;  // skipped lines listed in the table; the rest are counted
  const MOST_SEEN = 5;             // protections named in the "Most seen" line (the page, the Markdown export)
  const MAX_EXTRA_COLUMNS = 10;    // the person's own columns of a CSV kept with the results, at most
  const MAX_EXTRA_ROWS = 5000;     // rows of them (what the worker takes of a list, at most)
  /** A header cell that names the address column. */
  const ADDRESS_HEADER = /^(urls?|address(es)?|links?|websites?|sites?|domains?|pages?|hosts?|hostnames?)$/i;
  const MAX_CELL = 200;            // characters of one of their cells
  const MAX_HEADER = 60;           // characters of one of their column names
  /**
   * Why a page was not scanned (skipped) or has no result (failed); the page shows each in words. 'sitemap': the sitemap could
   * not be read (not fetched, not a sitemap); 'moved': the sitemap was fetched but ended on another site, so it was not read.
   */
  const REASONS = Object.freeze(['invalid', 'scheme', 'scope', 'sitemap', 'moved', 'timeout', 'load', 'error', 'off']);
  const FORMATS = Object.freeze(['csv', 'json', 'md']);
  const TYPES = Object.freeze({ csv: 'text/csv', json: 'application/json', md: 'text/markdown' });

  const clampInt = (value, min, max, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const capOf = (value) => clampInt(value, 1, MAX_URLS, MAX_URLS);
  const timeoutOf = (value) => clampInt(value, TIMEOUT_S.min, TIMEOUT_S.max, TIMEOUT_S.default);
  const delayOf = (value) => clampInt(value, DELAY_S.min, DELAY_S.max, DELAY_S.default);

  /* ---------- Input ---------- */

  const unquote = (cell) => String(cell || '').trim().replace(/^["']+|["']+$/g, '').trim();
  const looksLikeAddress = (cell) => /^[a-z][a-z0-9+.-]*:/i.test(cell) || /^[^\s/:?#]+\.[^\s/:?#]+(:\d+)?([/?#]|$)/.test(cell);

  /**
   * Reads one line the way a CSV does: commas, semicolons and tabs separate cells, except inside double quotes (a CSV
   * quotes a cell that holds a comma, and Bulk scan's own export does). `open` says a quoted cell is still open at the
   * end of the line (it goes on in the next one).
   * @param {string} line
   * @returns {{cells: string[], open: boolean}}
   */
  function scanLine(line) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch !== '"') cell += ch;
        else if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        continue;
      }
      if (ch === '"' && !cell.trim()) { quoted = true; continue; }
      if (ch === ',' || ch === ';' || ch === '\t') { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    return { cells: cells.map(unquote), open: quoted };
  }
  const cellsOf = (line) => scanLine(line).cells;

  // A quoted cell may hold a line break (a spreadsheet name or note): its lines are one row. A quote that is never
  // closed within a few lines is not a quoted cell, so a stray quote cannot swallow the list below it
  const MAX_QUOTED_LINES = 4;
  function logicalLines(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      let joined = raw[i];
      let last = i;
      while (scanLine(joined).open && last + 1 < raw.length && last - i < MAX_QUOTED_LINES - 1) joined += ` ${raw[++last]}`;
      if (last > i && !scanLine(joined).open) { out.push(joined); i = last; } else out.push(raw[i]);
    }
    return out;
  }

  /**
   * The parts of a line that is not a table row: one address, or several (a.com, b.com), or an address and a name. A
   * comma or semicolon ends an address when what came before is only a host (a host has none), or follows a "/" (no
   * path segment starts with one), or what follows is another address, or what follows has a space (an address has
   * none: it is a name or a note). Any other one belongs to the address: ?ids=1,2,3, ;jsessionid=…, Portland,_Oregon.
   * @param {string} line
   * @returns {string[]}
   */
  function partsOf(line) {
    const parts = [];
    let start = 0;
    // Where the address that starts at `start` first has a "/", "?" or "#" (after its scheme): found once per address, so a
    // list of thousands on one line is read in one pass and not searched again from each comma
    let pathAt = null;
    const pathChar = /[/?#]/g;
    const addressAhead = /\s*[a-z][a-z0-9+.-]*:\/\//iy;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== ',' && line[i] !== ';') continue;
      if (pathAt === null) {
        const scheme = /^\s*[a-z][a-z0-9+.-]*:\/\//i.exec(line.slice(start, start + 64));
        pathChar.lastIndex = start + (scheme ? scheme[0].length : 0);
        const found = pathChar.exec(line);
        pathAt = found ? found.index : Infinity;
      }
      let next = i + 1;
      while (next < line.length && line[next] !== ',' && line[next] !== ';') next++;
      const token = line.slice(i + 1, next);
      let blank = i + 1;
      while (blank < line.length && /\s/.test(line[blank])) blank++;
      addressAhead.lastIndex = i + 1;
      const ends = pathAt >= i
        || (i > start && line[i - 1] === '/')
        || blank >= line.length // nothing follows: a list pasted as "https://a.com/x," ends there, the comma is not part of the address
        || addressAhead.test(line)
        || (/^\s/.test(token) && looksLikeAddress(token.trim()))
        || /\s/.test(token.trim());
      if (ends) { parts.push(line.slice(start, i)); start = i + 1; pathAt = null; }
    }
    parts.push(line.slice(start));
    return parts.map(unquote);
  }

  /**
   * The addresses of a pasted list or a .txt/.csv file: one per line, blank lines and # comments ignored. The text is a
   * table when it has tabs or a header row (a row with no address, like "url,name"): every row's first address is its
   * page and the other columns are data. Otherwise a line holds an address, or several, or an address and a name (see
   * partsOf), and a row that starts with a quote is read as a quoted CSV row.
   * @param {string} text
   * @returns {string[]}
   */
  function linesOf(text) {
    return readList(text).addresses;
  }

  /**
   * The list as linesOf() reads it, and when it is a table, the person's other columns too: the header (the first row with no
   * address, when there is one) and, for each row, the cells beside its address. They go back out with the results (the table and
   * every export), so the results join back to the person's sheet. Bounded: MAX_EXTRA_COLUMNS columns, MAX_CELL characters a
   * cell, MAX_HEADER a column name. A table with no header names its columns by their place in the row ("column_3").
   * @param {string} text
   * @returns {{addresses: string[], columns: string[], rows: Array<{address: string, cells: string[]}>}}
   */
  function readList(text) {
    const lines = logicalLines(text).map(raw => raw.trim()).filter(line => line && !line.startsWith('#'));
    // A header names the address column ("url", "website"): such a row is a header even when another of its names has a dot in it
    // ("owner.name", "Est.traffic"), which would otherwise read as an address and be scanned
    // A cell is a column name only when the rows under it hold addresses: "https://acme.com/,site" over "https://foo.com/,page" is
    // two pages with a note, not a header and a page
    const cellRows = lines.map(cellsOf);
    const namesAddress = (index) => {
      const cells = cellRows[index];
      if (!cells || cells.length < 2) return false;
      const below = cellRows.slice(index + 1);
      return cells.some((cell, i) => ADDRESS_HEADER.test(String(cell).trim())
        && (!below.length || below.some(row => looksLikeAddress(row[i]))));
    };
    // A table with no header: two rows or more, each split (as partsOf reads a line, so a comma inside an address's path stays
    // in it) into the same number of cells, one of them an address and another not ("Acme Corp,acme.com"). Not when a comma
    // inside an address would split it as a table row ("Acme,https://a.com/s?q=a,b"): that list is read line by line
    const split = lines.map(partsOf);
    const headerless = lines.length > 1 && split.every((parts, i) => parts.length > 1 && parts.length === split[0].length
      && parts.length === cellRows[i].length && parts.filter(looksLikeAddress).length === 1);
    const table = lines.some(line => line.includes('\t'))
      || cellRows.some(cells => cells.length > 1 && !cells.some(looksLikeAddress))
      || namesAddress(0)
      || headerless;
    const out = [];
    const found = [];
    let header = null;
    for (const [index, line] of lines.entries()) {
      const parts = table || /^"/.test(line) ? cellsOf(line) : partsOf(line);
      if (parts.length < 2) { out.push(unquote(line)); continue; }
      if (!table) { out.push(...parts.filter(looksLikeAddress)); continue; }
      if (!parts.some(looksLikeAddress) || (header === null && !found.length && namesAddress(index))) {
        // The header: the first row with no address, before any row that has one
        if (header === null && !found.length) header = parts;
        continue;
      }
      // Placed once the address column is known: a row's first cell that looks like an address may be a number or a note
      found.push({ cells: parts, slot: out.length });
      out.push(null);
    }
    // The address column: the one the header names (url, address, …), else the one where most rows hold an address, a full
    // address with its scheme counting most. "4.5", "note: vip" or an e-mail address in an earlier column look like one too
    const width = found.reduce((max, row) => Math.max(max, row.cells.length), 0);
    let addressAt = header ? header.findIndex(cell => ADDRESS_HEADER.test(String(cell).trim())) : -1;
    if (addressAt === -1 || !found.some(row => looksLikeAddress(row.cells[addressAt]))) {
      const score = new Array(width).fill(0);
      for (const row of found) row.cells.forEach((cell, i) => {
        if (looksLikeAddress(cell)) score[i] += /^[a-z][a-z0-9+.-]*:\/\//i.test(String(cell).trim()) ? 3 : 1;
      });
      addressAt = score.reduce((best, value, i) => (value > score[best] ? i : best), 0);
    }
    const rows = found.map(row => {
      const at = looksLikeAddress(row.cells[addressAt]) ? addressAt : row.cells.findIndex(looksLikeAddress);
      out[row.slot] = row.cells[at];
      return { address: row.cells[at], at, cells: row.cells };
    });
    if (!table || !rows.length || width < 2) return { addresses: out.filter(Boolean), columns: [], rows: [] };
    // The others are the person's columns, in their order
    const places = [];
    for (let i = 0; i < width && places.length < MAX_EXTRA_COLUMNS; i++) if (i !== addressAt) places.push(i);
    const cut = (value, max) => String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
    const columns = places.map(i => cut(header && header[i], MAX_HEADER) || `column_${i + 1}`);
    const extras = rows.map(row => ({
      address: row.address,
      // A row whose address is in another column: its cells are read around that one, so they line up with the header
      cells: places.map(i => cut(row.at === addressAt ? row.cells[i] : row.cells.filter((_, j) => j !== row.at)[places.indexOf(i)], MAX_CELL))
    }));
    const any = extras.some(row => row.cells.some(Boolean)) || !!header;
    return { addresses: out.filter(Boolean), columns: any ? columns : [], rows: any ? extras : [] };
  }

  /**
   * The person's other columns as the worker takes them with the list: the column names, and the cells of each address under
   * its scanned form (normalize). The first row of an address wins, as the first one is the page that is scanned.
   * @param {{columns?: string[], rows?: Array<{address: string, cells: string[]}>}} list  readList()'s result
   * @returns {{columns: string[], rows: Object<string, string[]>}|null}  null when the list has no other columns
   */
  function extrasOf(list) {
    const columns = list && Array.isArray(list.columns) ? list.columns : [];
    if (!columns.length || !Array.isArray(list.rows)) return null;
    const rows = {};
    let count = 0;
    for (const row of list.rows) {
      if (count >= MAX_EXTRA_ROWS) break;
      const normal = row && normalize(row.address);
      if (!normal || !normal.url || Object.prototype.hasOwnProperty.call(rows, normal.url)) continue;
      rows[normal.url] = Array.isArray(row.cells) ? row.cells : [];
      count++;
    }
    return count ? cleanExtras({ columns, rows }) : null;
  }

  /** Extras as they may be kept with a run: checked and bounded, whoever sent them. null when there are none. */
  function cleanExtras(extras) {
    if (!extras || typeof extras !== 'object' || !Array.isArray(extras.columns) || !extras.rows || typeof extras.rows !== 'object') return null;
    const text = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
    const columns = extras.columns.slice(0, MAX_EXTRA_COLUMNS).map((name, i) => text(name, MAX_HEADER) || `column_${i + 2}`);
    if (!columns.length) return null;
    const rows = {};
    let count = 0;
    for (const [url, cells] of Object.entries(extras.rows)) {
      if (count >= MAX_EXTRA_ROWS) break;
      if (typeof url !== 'string' || url.length > 2048 || !Array.isArray(cells)) continue;
      rows[url] = columns.map((_, i) => text(cells[i], MAX_CELL));
      count++;
    }
    return { columns, rows };
  }

  /**
   * Put the person's other columns on the pages of a run (createRun's pages carry the address as it is scanned): run.columns and,
   * for each page found in them, item.extra (one cell per column). Pages the list did not give (a sitemap's) get empty cells.
   * Without extras the run keeps what it has (the pages a continued run carried over keep theirs).
   */
  function attachExtras(run, extras) {
    const clean = cleanExtras(extras);
    if (!run || !Array.isArray(run.items) || !clean) return run;
    run.columns = clean.columns;
    for (const item of run.items) {
      const cells = Object.prototype.hasOwnProperty.call(clean.rows, item.url) ? clean.rows[item.url] : null;
      if (cells) item.extra = cells;
      else if (!Array.isArray(item.extra) || item.extra.length !== clean.columns.length) item.extra = clean.columns.map(() => '');
    }
    return run;
  }

  /** The extras of a run, in the form attachExtras() takes them (Run again and the continued runs hand them to the worker again). */
  function extrasOfRun(run) {
    if (!run || !Array.isArray(run.columns) || !run.columns.length || !Array.isArray(run.items)) return null;
    const rows = {};
    for (const item of run.items) if (item && Array.isArray(item.extra)) rows[item.url] = item.extra;
    return cleanExtras({ columns: run.columns, rows });
  }

  /**
   * One address as it is scanned.
   * @param {string} raw
   * @returns {{url: string}|{error: 'invalid'|'scheme'}}
   */
  function normalize(raw) {
    let text = String(raw || '').trim();
    if (!text) return { error: 'invalid' };
    // A bare host or host/path is a web address
    // (host:port/path has a colon too: only scheme:// or a host-less scheme: such as mailto: names a scheme)
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /^[^\s/:?#]+\.[^\s/:?#]+(:\d+)?([/?#]|$)/.test(text)) text = `https://${text}`;
    let parsed;
    try { parsed = new URL(text); } catch (_) { return { error: 'invalid' }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: 'scheme' };
    if (!parsed.hostname) return { error: 'invalid' };
    parsed.hash = '';
    // "https://a.com/?" is "https://a.com/": an empty query is no query, so the page is not scanned twice
    if (!parsed.search) parsed.search = '';
    return { url: parsed.href };
  }

  const isSitemap = (url) => {
    try { return /\.xml$/i.test(new URL(url).pathname); } catch (_) { return false; }
  };

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : match;
  });

  /**
   * The <loc> entries of a sitemap (pages) or of a sitemap index (more sitemaps).
   * @param {string} xml
   * @returns {{kind: 'urlset'|'sitemapindex'|null, locs: string[]}}
   */
  function parseSitemap(xml) {
    const text = String(xml || '');
    const kind = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(text) ? 'sitemapindex' : (/<(?:[\w-]+:)?urlset[\s>]/i.test(text) ? 'urlset' : null);
    const locs = [];
    for (const match of text.matchAll(/<(?:[\w-]+:)?loc\s*>([\s\S]*?)<\/(?:[\w-]+:)?loc\s*>/gi)) {
      const value = decode(match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim());
      if (value) locs.push(value);
    }
    return { kind, locs };
  }

  /**
   * The site an address belongs to: its host in lower case, without a leading "www." (the scheme, the port, the path and
   * the query do not matter). '' when it is not an address that is scanned (not http or https, no host, not an address).
   * It reads the address as normalize() does, which is what the worker scans.
   * @param {string} address
   * @returns {string}
   */
  function siteOf(address) {
    const normal = normalize(address);
    if (!normal.url) return '';
    let host = new URL(normal.url).hostname.toLowerCase().replace(/\.$/, '');
    // "www." is the same site as the host under it, but only when something is under it (www.com is a host)
    if (host.startsWith('www.') && host.indexOf('.', 4) !== -1) host = host.slice(4);
    return host;
  }

  /**
   * Whether an address listed in a sitemap is on the sitemap's own site. A sitemap speaks for its own site only: each page of
   * a run is a real visit with the person's cookies, so a public sitemap does not get to list 127.0.0.1, a router, a cloud
   * metadata address or someone else's site. example.com and www.example.com are one site; the port and the scheme may differ,
   * the host may not. Addresses the person pastes never go through this (a local test page is a real use).
   * What is judged is the address as listed. It is not a promise about where the visit ends: the worker opens the listed
   * address and follows its redirects, so a hostile host can still redirect one of its own listed addresses to another host
   * (the person's own Sites to scan list is the only check after that).
   * @param {string} sitemapUrl  the address of the sitemap
   * @param {string} loc  an entry of it (a page, or a sitemap of an index)
   * @returns {boolean}
   */
  function sameSite(sitemapUrl, loc) {
    const site = siteOf(sitemapUrl);
    return site !== '' && site === siteOf(loc);
  }

  /**
   * The pages of a run.
   * @param {Array<string|{url: string, reason: string}>} entries  addresses, or lines already skipped (a sitemap that
   *   could not be read) with their reason
   * @param {{cap?: number, isExcluded?: (url: string) => boolean}} [options]  isExcluded: the "Sites to scan" setting
   * @returns {{items: Array<{url: string, status: string, reason?: string}>, duplicates: number, overCap: number, skippedOver: number}}
   */
  function prepare(entries, options = {}) {
    const cap = capOf(options.cap);
    const isExcluded = typeof options.isExcluded === 'function' ? options.isExcluded : () => false;
    const seen = new Set();
    const items = [];
    let scannable = 0;
    let duplicates = 0;
    let overCap = 0;
    let skippedListed = 0;
    let skippedOver = 0;
    const skip = (url, reason) => {
      if (skippedListed >= MAX_SKIPPED_LISTED) { skippedOver++; return; }
      skippedListed++;
      items.push({ url: String(url || '').slice(0, 2048), status: 'skipped', reason });
    };
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry && typeof entry === 'object') {
        skip(entry.url, REASONS.includes(entry.reason) ? entry.reason : 'invalid');
        continue;
      }
      const normal = normalize(entry);
      const key = normal.url || String(entry).trim();
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (normal.error) { skip(entry, normal.error); continue; }
      if (isExcluded(normal.url)) { skip(normal.url, 'scope'); continue; }
      if (scannable >= cap) { overCap++; continue; }
      scannable++;
      items.push({ url: normal.url, status: 'waiting' });
    }
    return { items, duplicates, overCap, skippedOver };
  }

  /* ---------- The run ---------- */

  /**
   * @param {{items: Array, duplicates?: number, overCap?: number, skippedOver?: number}} prepared
   * @param {{timeoutSec?: number, delaySec?: number, cap?: number, now?: number, id?: string}} [options]
   */
  function createRun(prepared, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    return {
      id: options.id || `bulk_${now}`,
      status: 'running',
      reason: null,
      startedAt: now,
      finishedAt: null,
      timeoutSec: timeoutOf(options.timeoutSec),
      delaySec: delayOf(options.delaySec),
      cap: capOf(options.cap),
      duplicates: prepared.duplicates || 0,
      overCap: prepared.overCap || 0,
      skippedOver: prepared.skippedOver || 0,
      items: (prepared.items || []).map(item => ({ ...item }))
    };
  }

  const isActive = (run) => !!run && (run.status === 'running' || run.status === 'paused');
  const nextWaiting = (run) => (run && Array.isArray(run.items) ? run.items.findIndex(item => item.status === 'waiting') : -1);

  function counts(run) {
    const out = { total: 0, waiting: 0, scanning: 0, done: 0, failed: 0, skipped: 0, found: 0 };
    for (const item of (run && run.items) || []) {
      out.total++;
      if (out[item.status] !== undefined) out[item.status]++;
      if (item.status === 'done' && Array.isArray(item.detections) && item.detections.length) out.found++;
    }
    return out;
  }

  /**
   * How many milliseconds the run still waits before it opens its next page: the run's wait between pages, counted from when the
   * last page it visited finished (done or failed; a page skipped for its site was never opened). 0 with no wait, or before the
   * first page. Never more than the wait itself (a clock that went back does not hold the run up).
   */
  function waitBefore(run, now = Date.now()) {
    const delay = run ? delayOf(run.delaySec) * 1000 : 0;
    if (!delay || !Array.isArray(run.items)) return 0;
    let last = 0;
    for (const item of run.items) {
      if (item && (item.status === 'done' || item.status === 'failed') && Number.isFinite(item.finishedAt)) last = Math.max(last, item.finishedAt);
    }
    if (!last) return 0;
    return Math.min(delay, Math.max(0, last + delay - now));
  }

  const itemAt = (run, index) => (run && run.items && run.items[index]) || null;

  function begin(run, index, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || run.status !== 'running' || item.status !== 'waiting') return false;
    item.status = 'scanning';
    item.startedAt = now;
    return true;
  }

  function finish(run, index, outcome = {}, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || item.status !== 'scanning') return false;
    item.status = 'done';
    item.finishedAt = now;
    item.detections = Array.isArray(outcome.detections) ? outcome.detections : [];
    item.difficulty = outcome.difficulty || '';
    if (outcome.finalUrl && outcome.finalUrl !== item.url) item.finalUrl = outcome.finalUrl;
    const httpStatus = httpStatusOf(outcome.httpStatus);
    if (httpStatus) item.httpStatus = httpStatus; else delete item.httpStatus;
    return true;
  }

  function fail(run, index, reason = 'error', now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || item.status !== 'scanning') return false;
    item.status = 'failed';
    item.reason = REASONS.includes(reason) ? reason : 'error';
    item.finishedAt = now;
    return true;
  }

  function skip(run, index, reason, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || (item.status !== 'scanning' && item.status !== 'waiting')) return false;
    item.status = 'skipped';
    item.reason = REASONS.includes(reason) ? reason : 'invalid';
    item.finishedAt = now;
    return true;
  }

  function pause(run) {
    if (!run || run.status !== 'running') return false;
    run.status = 'paused';
    return true;
  }

  function resume(run) {
    if (!run || run.status !== 'paused') return false;
    run.status = 'running';
    run.reason = null;
    return true;
  }

  /**
   * Pause a run for a reason the person did not choose ('off': the extension was switched off, so no page can be scanned).
   * Unlike pause(), the page being scanned does not finish: it goes back to waiting (it has no result), and the reason stays
   * until release() or resume(). A run the person had paused takes the reason too. The run is still the one in progress.
   */
  function hold(run, reason) {
    if (!isActive(run)) return false;
    for (const item of run.items) {
      if (item.status === 'scanning') { item.status = 'waiting'; delete item.startedAt; }
    }
    run.status = 'paused';
    run.reason = reason || null;
    return true;
  }

  /** What a run was held for is over (the extension is on again): it stays paused, with no reason, until Resume. */
  function release(run, reason) {
    if (!run || run.status !== 'paused' || !reason || run.reason !== reason) return false;
    run.reason = null;
    return true;
  }

  /**
   * Stop a run: the page being scanned goes back to waiting (it has no result), the others keep theirs.
   * @param {string} [reason] 'user' | 'restart' | 'no_window' | 'off'
   */
  function stop(run, reason = 'user', now = Date.now()) {
    if (!isActive(run)) return false;
    for (const item of run.items) {
      if (item.status === 'scanning') { item.status = 'waiting'; delete item.startedAt; }
    }
    run.status = 'stopped';
    run.reason = reason;
    run.finishedAt = now;
    return true;
  }

  /** Every page has its outcome: the run is done. */
  function complete(run, now = Date.now()) {
    if (!isActive(run) || nextWaiting(run) !== -1 || run.items.some(item => item.status === 'scanning')) return false;
    run.status = 'done';
    run.finishedAt = now;
    return true;
  }

  /**
   * What "Scan the pages still waiting" (and "Scan the failed pages again") takes from a run that is over: the addresses
   * to scan, and the pages that already have their outcome (done, skipped, and failed unless they are scanned again),
   * which stay in the list with their results.
   * @returns {{entries: string[], kept: object[], duplicates: number, overCap: number, skippedOver: number}|null} null when
   *   the run is still going or nothing waits
   */
  function continuation(run, options = {}) {
    if (!run || typeof run !== 'object' || !Array.isArray(run.items) || isActive(run)) return null;
    // Waiting pages, and with `includeFailed` the pages that failed (timeout, load error) too: scanned again
    const again = (item) => item.status === 'waiting' || (options.includeFailed === true && item.status === 'failed');
    const entries = run.items.filter(again).map(item => item.url);
    if (!entries.length) return null;
    return {
      entries,
      kept: run.items.filter(item => !again(item) && item.status !== 'scanning').map(item => ({ ...item })),
      duplicates: run.duplicates || 0, overCap: run.overCap || 0, skippedOver: run.skippedOver || 0
    };
  }

  /** Put the kept pages before the ones a new run scans, with the counts of what the first paste left out. */
  function carryOver(run, resumed) {
    if (!run || !resumed) return run;
    run.items = [...resumed.kept, ...run.items];
    run.duplicates = resumed.duplicates;
    run.overCap = (resumed.overCap || 0) + (run.overCap || 0);
    run.skippedOver = (resumed.skippedOver || 0) + (run.skippedOver || 0);
    return run;
  }

  /**
   * A run found by a service worker that has just started: nothing scans it any more. A running one is stopped; a paused one
   * stays paused (Chrome stops an idle worker, and a pause is idle: Resume starts its loop again), its page that was being
   * scanned waiting again.
   */
  function recover(run, now = Date.now()) {
    if (!run || typeof run !== 'object' || !Array.isArray(run.items)) return null;
    if (run.status === 'paused') {
      for (const item of run.items) {
        if (item.status === 'scanning') { item.status = 'waiting'; delete item.startedAt; }
      }
    } else if (isActive(run)) stop(run, 'restart', now);
    return run;
  }

  /* ---------- Results ---------- */

  const detectionName = (d) => String((d && ((d.detector && typeof d.detector === 'object' && d.detector.name) || d.name || (typeof d.detector === 'string' && d.detector))) || '').trim();

  /**
   * The protections of a finished page, strongest first.
   * @param {Array<object>} results  the scan's detections
   * @param {(results: Array) => string} [difficultyOf]  the page difficulty the popup shows (DetectionUtils.getDifficultyLevel)
   * @returns {{detections: Array<{name: string, category: string, confidence: number|null}>, difficulty: string}}
   */
  function summarize(results, difficultyOf) {
    const list = (Array.isArray(results) ? results : []).filter(d => d && typeof d === 'object');
    const detections = list.map(d => ({
      name: detectionName(d) || '?',
      category: Categories ? Categories.keyOf(d) : String(d.category || ''),
      confidence: Number.isFinite(Number(d.confidence)) ? Math.round(Number(d.confidence)) : null
    })).sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || a.name.localeCompare(b.name));
    let difficulty = '';
    if (list.length && typeof difficultyOf === 'function') {
      try { difficulty = String(difficultyOf(list) || ''); } catch (_) { difficulty = ''; }
    }
    return { detections, difficulty };
  }

  /**
   * How many of the pages that were scanned each protection was found on, most first and then by name. A page counts once
   * for a protection however many of its detections name it. A page that failed, was skipped, waits or is being scanned has
   * no result and counts for nothing. A protection that went by two names (or a spelling of one) is one row, as History groups
   * them (Categories.protectionKey), under the name it was first found with.
   * @param {object} run
   * @returns {Array<{name: string, category: string, pages: number}>}
   */
  function protectionTotals(run) {
    const rows = new Map();
    for (const item of (run && Array.isArray(run.items) ? run.items : [])) {
      if (!item || item.status !== 'done' || !Array.isArray(item.detections)) continue;
      const onPage = new Set();
      for (const d of item.detections) {
        if (!d || typeof d !== 'object') continue;
        const name = detectionName(d);
        // "?" is what summarize() writes for a detection that has no name
        if (!name || name === '?') continue;
        const key = Categories ? Categories.protectionKey(name) : name.toLowerCase();
        if (onPage.has(key)) continue;
        onPage.add(key);
        const row = rows.get(key);
        if (row) row.pages++;
        else rows.set(key, { key, name, category: Categories ? Categories.keyOf(d) : String(d.category || ''), pages: 1 });
      }
    }
    // By the key, not the shown name: the same order on every machine and in every language
    return [...rows.values()]
      .sort((a, b) => b.pages - a.pages || (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0)))
      .map(({ name, category, pages }) => ({ name, category, pages }));
  }

  /* ---------- Compared with an earlier run ---------- */

  /** The page an item stands for when two runs are compared: its address as it is scanned (normalize), or the text as given. */
  const pageKeyOf = (url) => { const normal = normalize(url); return normal.url || String(url || '').trim(); };
  /**
   * Addresses a kept run holds, at most (BulkRuns): a longer one is kept shortened, and found again by its shortened form. Long
   * enough for tracking queries, so Run again from a run kept over a restart scans the whole address.
   */
  const KEPT_URL = 8192;
  const keptKeyOf = (url) => pageKeyOf(String(url || '').slice(0, KEPT_URL));
  const protectionKeyOf = (name) => (Categories ? Categories.protectionKey(name) : String(name).trim().toLowerCase());
  const confidenceOf = (d) => (d && d.confidence !== null && d.confidence !== undefined && d.confidence !== '' && Number.isFinite(Number(d.confidence)) ? Math.round(Number(d.confidence)) : null);
  const OUTCOMES = Object.freeze(['done', 'failed', 'skipped']);

  /** A page's protections by name (one protection under two spellings is one), the strongest of each. */
  function protectionsOf(item) {
    const map = new Map();
    for (const d of Array.isArray(item && item.detections) ? item.detections : []) {
      const name = detectionName(d);
      if (!name || name === '?') continue;
      const row = { name, confidence: confidenceOf(d) };
      const key = protectionKeyOf(name);
      const have = map.get(key);
      if (!have || (row.confidence === null ? -1 : row.confidence) > (have.confidence === null ? -1 : have.confidence)) map.set(key, row);
    }
    return map;
  }

  /**
   * What changed on each page between an earlier run of a list and this one: pages are matched by their address as it is
   * scanned, protections by name (as History's Compare matches them). Only a page with an outcome in this run (done, failed,
   * skipped) is compared; one still waiting has nothing to compare yet.
   * @param {object} prev  the earlier run (a run, the copy the worker keeps, or a JSON export read back)
   * @param {object} run   this run
   * @returns {{startedAt: number|null, finishedAt: number|null, compared: number, changed: number,
   *   pages: Object<string, {inPrevious: boolean, changed: boolean, added: object[], removed: object[], confidence: object[],
   *   status: {from: string, to: string}|null, http: {from: number|null, to: number|null}|null}>}|null}
   *   null without an earlier run. added/removed: [{name, confidence}]; confidence: [{name, from, to}]
   */
  function diff(prev, run) {
    if (!prev || !Array.isArray(prev.items) || !run || !Array.isArray(run.items)) return null;
    const before = new Map();
    for (const item of prev.items) {
      // A page the earlier run never finished (an export of a stopped run, or one made mid-run) has no outcome to compare with:
      // it reads as not in that run, not as "waiting → done"
      if (!item || typeof item.url !== 'string' || !OUTCOMES.includes(item.status)) continue;
      const key = pageKeyOf(item.url);
      if (key && !before.has(key)) before.set(key, item);
    }
    const pages = {};
    let compared = 0;
    let changed = 0;
    for (const item of run.items) {
      if (!item || !OUTCOMES.includes(item.status)) continue;
      const key = pageKeyOf(item.url);
      if (!key || Object.prototype.hasOwnProperty.call(pages, key)) continue;
      const was = before.get(key) || (item.url.length > KEPT_URL ? before.get(keptKeyOf(item.url)) : undefined);
      compared++;
      if (!was) {
        pages[key] = { inPrevious: false, changed: true, added: [], removed: [], confidence: [], status: null, http: null };
        changed++;
        continue;
      }
      const status = was.status !== item.status ? { from: String(was.status || ''), to: item.status } : null;
      const httpFrom = was.status === 'done' ? httpStatusOf(was.httpStatus) : null;
      const httpTo = item.status === 'done' ? httpStatusOf(item.httpStatus) : null;
      // A code that only one of the two knew is no change (a run made before codes were kept, a page that failed)
      const http = httpFrom && httpTo && httpFrom !== httpTo ? { from: httpFrom, to: httpTo } : null;
      const added = [];
      const removed = [];
      const confidence = [];
      // Protections are compared only between two scans: a page that failed has no protections, not none found
      if (was.status === 'done' && item.status === 'done') {
        const a = protectionsOf(was);
        const b = protectionsOf(item);
        for (const [k, row] of b) {
          const old = a.get(k);
          if (!old) added.push(row);
          else if (old.confidence !== null && row.confidence !== null && old.confidence !== row.confidence) confidence.push({ name: row.name, from: old.confidence, to: row.confidence });
        }
        for (const [k, row] of a) if (!b.has(k)) removed.push(row);
      }
      const byName = (x, y) => x.name.localeCompare(y.name);
      [added, removed, confidence].forEach(list => list.sort(byName));
      const isChanged = !!(status || http || added.length || removed.length || confidence.length);
      if (isChanged) changed++;
      pages[key] = { inPrevious: true, changed: isChanged, added, removed, confidence, status, http };
    }
    const time = (value) => (Number.isFinite(value) ? value : (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null));
    return { startedAt: time(prev.startedAt), finishedAt: time(prev.finishedAt), compared, changed, pages };
  }

  /** One page's entry of a diff() (undefined when the page was not compared). */
  const diffOf = (result, item) => (result && result.pages && item ? result.pages[pageKeyOf(item.url)] : undefined);

  const MINUS = '\u2212';
  /**
   * One page's change as a line: "+DataDome −Kasada · Cloudflare 70% → 95% · 200 → 403", "done → failed". The words for a page
   * with no change, a page the earlier run did not have, and the statuses come from the options (the page translates them; the
   * exports keep the English ones).
   */
  function diffText(entry, options = {}) {
    if (!entry) return '';
    const words = { unchanged: 'unchanged', new: 'not in the previous run', ...options };
    if (!entry.inPrevious) return words.new;
    if (!entry.changed) return words.unchanged;
    const statusOf = typeof options.status === 'function' ? options.status : (value) => value;
    const percent = (value) => (value === null || value === undefined ? '' : ` ${value}%`);
    const parts = [];
    const names = [...entry.added.map(d => `+${d.name}`), ...entry.removed.map(d => `${MINUS}${d.name}`)];
    if (names.length) parts.push(names.join(' '));
    for (const row of entry.confidence) parts.push(`${row.name}${percent(row.from)} \u2192${percent(row.to)}`);
    if (entry.status) parts.push(`${statusOf(entry.status.from)} \u2192 ${statusOf(entry.status.to)}`);
    if (entry.http) parts.push(`${entry.http.from} \u2192 ${entry.http.to}`);
    return parts.join(' \u00b7 ');
  }

  /* ---------- Exports ---------- */

  /** A spreadsheet runs text that starts with = + - @ as a formula: the apostrophe keeps it text. */
  const csvCell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const iso = (ts) => (Number.isFinite(ts) ? new Date(ts).toISOString() : '');

  /** The person's own columns of a run (readList), and one page's cells under them. */
  const columnsOf = (run) => (run && Array.isArray(run.columns) ? run.columns.slice(0, MAX_EXTRA_COLUMNS).map(String) : []);
  const extraOf = (item, columns) => columns.map((_, i) => (item && Array.isArray(item.extra) && item.extra[i] != null ? String(item.extra[i]) : ''));

  function buildCsv(run, compare) {
    // http_status stays where it was, so the columns a sheet or a script already reads keep their places; the person's own
    // columns follow it, and the change since the earlier run comes last
    const columns = columnsOf(run);
    const header = ['url', 'status', 'reason', 'final_url', 'difficulty', 'protection', 'category', 'confidence', 'scanned_at', 'http_status',
      ...columns, ...(compare ? ['vs_previous'] : [])];
    const lines = [header.map(csvCell).join(',')];
    for (const item of (run && run.items) || []) {
      const detections = Array.isArray(item.detections) && item.detections.length ? item.detections : [null];
      const tail = [...extraOf(item, columns), ...(compare ? [diffText(diffOf(compare, item))] : [])];
      for (const d of detections) {
        lines.push([item.url, item.status, item.reason || '', item.finalUrl || '', item.difficulty || '',
          d ? d.name : '', d ? d.category : '', d && Number.isFinite(d.confidence) ? d.confidence : '',
          item.status === 'done' ? iso(item.finishedAt) : '', httpStatusOf(item.httpStatus) || '', ...tail].map(csvCell).join(','));
      }
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  /** A page's change for the JSON export: what diff() found, and the line the other exports show. */
  function previousOf(compare, item) {
    const entry = diffOf(compare, item);
    if (!entry) return null;
    return { inPrevious: entry.inPrevious, changed: entry.changed, added: entry.added.map(d => d.name), removed: entry.removed.map(d => d.name),
      confidence: entry.confidence, status: entry.status, httpStatus: entry.http, text: diffText(entry) };
  }

  function buildJson(run, now, compare) {
    const items = (run && run.items) || [];
    const columns = columnsOf(run);
    return JSON.stringify({
      version: '1.0',
      type: 'bulk-scan',
      exportedAt: new Date(now).toISOString(),
      run: run ? {
        status: run.status, reason: run.reason || null, startedAt: iso(run.startedAt) || null, finishedAt: iso(run.finishedAt) || null,
        timeoutSec: run.timeoutSec, delaySec: delayOf(run.delaySec), duplicates: run.duplicates || 0, overCap: run.overCap || 0, counts: counts(run),
        protectionTotals: protectionTotals(run),
        ...(columns.length ? { columns } : {}),
        ...(compare ? { comparedWith: { startedAt: iso(compare.startedAt) || null, finishedAt: iso(compare.finishedAt) || null, changed: compare.changed } } : {})
      } : null,
      pages: items.map(item => ({
        url: item.url,
        status: item.status,
        reason: item.reason || null,
        finalUrl: item.finalUrl || null,
        httpStatus: httpStatusOf(item.httpStatus),
        difficulty: item.difficulty || null,
        scannedAt: item.status === 'done' ? iso(item.finishedAt) || null : null,
        detections: Array.isArray(item.detections) ? item.detections : [],
        ...(columns.length ? { extra: extraOf(item, columns) } : {}),
        ...(compare ? { previous: previousOf(compare, item) } : {})
      }))
    }, null, 2);
  }

  /** A Markdown table cell: what would format the text or end the cell is escaped, a line break becomes a space. */
  const mdCell = (value) => String(value == null ? '' : value).replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ').trim();
  /** The page's address without its query and fragment, as every other copy for tickets and chats gives it (tokens live there). */
  function addressOf(url) {
    const text = String(url || '');
    try { const u = new URL(text); return `${u.origin}${u.pathname}`; } catch (_) { return text.split('#')[0].split('?')[0]; }
  }

  /** The address cell, as an autolink (see HistoryExport): no backslash in a path with an underscore; other text is escaped. */
  function mdAddress(url) {
    const address = addressOf(url);
    return /^https?:\/\/[^\s<>]+$/i.test(address) ? `<${address.replace(/\|/g, '\\|')}>` : mdCell(address);
  }

  /** A heading, a line of counts and one row per page, for a ticket or a chat. */
  function buildMarkdown(run, compare) {
    const c = counts(run);
    const parts = [`${c.total} pages`, c.done && `${c.done} scanned`, c.failed && `${c.failed} failed`, c.skipped && `${c.skipped} skipped`,
      c.waiting && `${c.waiting} waiting`, c.scanning && `${c.scanning} scanning`].filter(Boolean);
    const lines = ['# Scrapfly Antibot Detector: Bulk scan', '', `${parts.join(', ')}; ${c.found} with protections`, ''];
    // The protections found on the most pages, when any was found
    const seen = protectionTotals(run).slice(0, MOST_SEEN);
    if (seen.length) lines.push(`Most seen: ${seen.map(row => `${mdCell(row.name)} (${row.pages} page${row.pages === 1 ? '' : 's'})`).join(', ')}`, '');
    const columns = columnsOf(run);
    const head = ['Page', 'Status', 'Difficulty', 'Protections', ...columns.map(mdCell), ...(compare ? ['Vs previous run'] : [])];
    lines.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
    for (const item of (run && run.items) || []) {
      const found = (Array.isArray(item.detections) ? item.detections : [])
        .map(d => `${d.name} (${d.category}${Number.isFinite(d.confidence) ? `, ${d.confidence}%` : ''})`);
      const code = httpStatusOf(item.httpStatus);
      const status = `${item.reason ? `${item.status}: ${item.reason}` : item.status}${code ? ` · ${code}` : ''}`;
      const tail = [...extraOf(item, columns).map(mdCell), ...(compare ? [mdCell(diffText(diffOf(compare, item)))] : [])];
      lines.push(`| ${[mdAddress(item.url), mdCell(status), mdCell(item.difficulty || ''), mdCell(found.length ? found.join('; ') : '-'), ...tail].join(' | ')} |`);
    }
    return `${lines.join('\n')}\n`;
  }

  /** One line per page, for a chat or a ticket: "address: Cloudflare 90%, reCAPTCHA", "address: -" when nothing was found, "address: failed (load)". No query or fragment. */
  function oneLines(run) {
    const one = (value) => String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
    return (((run && run.items) || [])).map((item) => {
      let what;
      if (item.status === 'done') {
        const found = (Array.isArray(item.detections) ? item.detections : []).map(d => `${one(d.name) || '?'}${Number.isFinite(d.confidence) ? ` ${Math.round(d.confidence)}%` : ''}`);
        what = found.length ? found.join(', ') : '-';
      } else {
        what = item.reason ? `${item.status} (${one(item.reason)})` : String(item.status);
      }
      return `${one(addressOf(item.url))}: ${what}`;
    }).join('\n');
  }

  /**
   * @param {object} run
   * @param {{format?: 'csv'|'json'|'md', now?: number, compare?: object}} [options]  compare: diff()'s result
   * @returns {{text: string, fileText: string, type: string, extension: string}}
   *   fileText is what goes in a file: text, with the byte-order mark a CSV needs for a spreadsheet to read UTF-8
   */
  function build(run, options = {}) {
    const format = FORMATS.includes(options.format) ? options.format : 'json';
    // The comparison with an earlier run (diff()), when there is one: a column of every export
    const compare = options.compare && options.compare.pages ? options.compare : null;
    const text = format === 'csv' ? buildCsv(run, compare)
      : format === 'md' ? buildMarkdown(run, compare)
      : buildJson(run, Number.isFinite(options.now) ? options.now : Date.now(), compare);
    return { text, fileText: format === 'csv' ? `\uFEFF${text}` : text, type: TYPES[format], extension: format };
  }

  /** scrapfly-bulk-scan-2026-10-26.csv (the day is the person's own: FormatUtils.localDay). */
  function fileName(format, day) {
    const ext = FORMATS.includes(format) ? format : 'json';
    const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : 'export';
    return `scrapfly-bulk-scan-${safeDay}.${ext}`;
  }

  const api = {
    MAX_URLS, TIMEOUT_S, DELAY_S, MAX_SKIPPED_LISTED, MOST_SEEN, REASONS, FORMATS, MAX_EXTRA_COLUMNS, MAX_EXTRA_ROWS, MAX_CELL, MAX_HEADER,
    capOf, timeoutOf, delayOf, linesOf, readList, extrasOf, cleanExtras, attachExtras, extrasOfRun, normalize, isSitemap, parseSitemap, sameSite, prepare,
    createRun, isActive, nextWaiting, waitBefore, counts, begin, finish, fail, skip, pause, resume, hold, release, stop, complete, recover, continuation, carryOver,
    summarize, protectionTotals, pageKeyOf, KEPT_URL, keptKeyOf, diff, diffOf, diffText, oneLines, build, fileName
  };
  root.BulkScan = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkScan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
