/**
 * Detection tab: where the results it shows were found, and what History says changed on the page. Pure (no browser APIs), loaded
 * by the popup after history-filter.js, history-policy.js and history-compare.js, and shared with the tests.
 *
 *   pageOf()       the page of an address as History counts pages: origin and path, without the query and the fragment
 *   otherPage()    the result shown was found on another page of the site (the Domain cache scope serves the scan of one page to
 *                  every page of it): that page's path, its whole address and when it was scanned; null when it is this page's
 *   scansOf()      the page's saved scans in History, newest first (an entry recorded from the cache is not a scan of the page)
 *   change()       what History says changed on the page: its newest saved scan's Changed record, or no change, and since when;
 *                  null when History has nothing to compare, or when its newest scan of the page is not what the tab shows
 *   changeText()   the protections a change added and removed, on one line: "+DataDome −Kasada"
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup; under Node they sit next to it
  const load = (name, file) => root[name] || (typeof require === 'function' ? require(file) : undefined);
  const HistoryCompare = load('HistoryCompare', './history-compare.js');
  const HistoryPolicy = load('HistoryPolicy', './history-policy.js');
  const HistoryFilter = load('HistoryFilter', './history-filter.js');

  // The real minus sign (U+2212), as History's Compare summary writes a protection that went away
  const MINUS = '\u2212';
  // A page path longer than this is cut in its middle: the line under the site's name stays short, the hover has it whole
  const MAX_PATH = 48;

  const parse = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { return new URL(value.trim()); } catch (_) { return null; }
  };
  // A name is one line: a line break in a custom rule's name cannot make a second one
  const oneLine = (value) => String(value == null ? '' : value).replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').trim();

  /** A text longer than `max` characters as its start, an ellipsis and its end. */
  function shorten(text, max = MAX_PATH) {
    const chars = [...String(text)];
    if (chars.length <= max) return chars.join('');
    const head = Math.ceil((max - 1) / 2);
    const tail = Math.floor((max - 1) / 2);
    return `${chars.slice(0, head).join('')}\u2026${chars.slice(chars.length - tail).join('')}`;
  }

  /** The page of an address: origin and path (HistoryCompare.pageKey); '' when it cannot be read. */
  function pageOf(url) {
    return HistoryCompare.pageKey({ url: typeof url === 'string' ? url : '' });
  }

  /**
   * The page the result shown was found on, when that is not the page in the tab. Under the Domain cache scope every page of a
   * site is served the scan of one of them: the tab says which, so a protection of this page (a CAPTCHA on /login when / was
   * scanned first) is not taken for missing. Null when it is this page (the same address up to the query and the fragment, as
   * History counts a page), when either address cannot be read, and for a result saved under the Path or Full URL scope (it only
   * ever answers its own page).
   * @param {{url?: string, timestamp?: number, cacheScope?: string}} result - the result's cache metadata
   * @param {string} tabUrl - the address of the page in the tab
   * @returns {{path: string, url: string, at: number}|null}
   *   path: the other page's path (with its host when it is another spelling of the site, www.shop.example), cut when long;
   *   url: its whole address; at: when it was scanned (0 when not known)
   */
  function otherPage(result, tabUrl) {
    const meta = result && typeof result === 'object' ? result : {};
    if (meta.cacheScope === 'path' || meta.cacheScope === 'full') return null;
    const found = parse(meta.url);
    const here = parse(tabUrl);
    if (!found || !here || pageOf(found.href) === pageOf(here.href)) return null;
    const path = found.origin === here.origin ? found.pathname : `${found.host}${found.pathname}`;
    const at = HistoryCompare.timeOf({ timestamp: meta.timestamp });
    return { path: shorten(path), url: found.href, at: at > 0 ? at : 0 };
  }

  /** The saved scans of the page at `url`, newest first: History's entries of that page, not those recorded from the cache. */
  function scansOf(items, url) {
    const key = pageOf(url);
    if (!key || !Array.isArray(items)) return [];
    return items
      .filter(item => item && typeof item === 'object' && item.fromCache !== true && HistoryCompare.pageKey(item) === key)
      .sort((a, b) => HistoryCompare.timeOf(b) - HistoryCompare.timeOf(a));
  }

  /**
   * What History says changed on the page in the tab, for the line under the Detection summary's stats. It speaks of the page's
   * newest saved scan, and only when that scan found what the tab shows (the same anti-bot and CAPTCHA protections, as History
   * compares two scans): a result History has not recorded yet (it saves a scan a moment after the popup shows it), or does not
   * record, is not described by an older scan.
   *   - the scan has a Changed record: what it added and removed (the names History shows), since the earlier scan
   *   - it has none: no change since the earlier scan
   * The date is that of the page's previous saved scan (the one Compare scans opens with); for a Changed record when History no
   * longer holds an earlier scan of the page (it was updated in place, by the watchlist or a duplicate), the date of the change.
   * @param {object[]} items - History
   * @param {string} url - the address of the page in the tab
   * @param {object[]} shown - the detections the tab shows
   * @returns {{entry: object, changed: boolean, since: number, added: string[], removed: string[], comparable: boolean}|null}
   *   entry: the page's newest saved scan (what Compare scans and Watch for changes act on); comparable: History holds another
   *   scan of the page to compare it with; null: nothing to say (no saved scan, the only one, or not what the tab shows)
   */
  function change(items, url, shown) {
    const scans = scansOf(items, url);
    const entry = scans[0];
    if (!entry) return null;
    if (HistoryPolicy.diffProtections(entry.detections, Array.isArray(shown) ? shown : []).changed) return null;
    const previous = scans[1] || null;
    const marked = HistoryFilter.isChanged(entry);
    const changedAt = marked ? Number(entry.changed.at) : 0;
    const since = (previous ? HistoryCompare.timeOf(previous) : 0) || (marked && Number.isFinite(changedAt) && changedAt > 0 ? changedAt : 0);
    if (!since) return null;
    const names = (list) => HistoryFilter.changeNames(list).map(oneLine).filter(Boolean);
    return {
      entry,
      changed: marked,
      since,
      added: marked ? names(entry.changed.added) : [],
      removed: marked ? names(entry.changed.removed) : [],
      comparable: !!previous
    };
  }

  /** The protections a change added (+) and removed (−), on one line: "+DataDome −Kasada". */
  function changeText(added, removed) {
    const list = (value) => (Array.isArray(value) ? value : []).map(oneLine).filter(Boolean);
    return [...list(added).map(name => `+${name}`), ...list(removed).map(name => `${MINUS}${name}`)].join(' ');
  }

  const api = { MINUS, MAX_PATH, shorten, pageOf, otherPage, scansOf, change, changeText };
  root.DetectionHistory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
