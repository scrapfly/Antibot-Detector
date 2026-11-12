/**
 * The HTTP status of a page: the status code of the response that loaded its document (the last hop of its redirects), as the
 * Detection tab, Bulk scan and the webhook show it. A block page (403, 429, a 503 from a challenge) is itself a signal. Pure
 * (no browser APIs): the worker, the popup, the Bulk scan page and the tests share it.
 *
 *   of(value)        the status a page can show, or null when it is not known: a whole number from 100 to 599, except 304.
 *                    A revalidated page shows the copy Chrome kept, and Chrome reports that copy's own status: a 304 would say
 *                    nothing about the page. A result saved before 3.1.8 has none, and so does a page its service worker
 *                    answered or one restored from the back/forward cache (background/header-capture.js: pageHttpStatus)
 *   tone(status)     'error' for 5xx, 'warn' for 4xx, 'ok' for any other known status, '' when it is not known
 *   isError(status)  4xx or 5xx: the server answered with an error, which often means the request was blocked or challenged
 */
(function(root) {
  'use strict';

  function of(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599 && value !== 304 ? value : null;
  }

  function tone(value) {
    const status = of(value);
    if (status === null) return '';
    if (status >= 500) return 'error';
    return status >= 400 ? 'warn' : 'ok';
  }

  const isError = (value) => {
    const kind = tone(value);
    return kind === 'warn' || kind === 'error';
  };

  const api = Object.freeze({ of, tone, isError });
  root.HttpStatus = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.HttpStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
