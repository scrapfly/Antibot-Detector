/**
 * Who sent a message to the service worker. Pure (the runtime is a parameter): the worker's handlers that change the
 * person's own data (History, captures, backups, the webhook record) accept them from the extension's pages only,
 * never from a content script inside a web page.
 *
 *   isExtensionPage(sender, runtime)   true for the popup, Settings and Statistics (also when opened in a tab), for
 *                                      another extension context and for a direct call inside the worker (no sender)
 *
 * Decided by the sender's URL: an extension page opened in a tab also carries sender.tab, so that alone says nothing,
 * and a content script carries the address of the page it runs in.
 */
(function(root) {
  'use strict';

  function isExtensionPage(sender, runtime) {
    if (!sender) return true; // direct in-worker call
    const rt = runtime || (root.chrome && root.chrome.runtime);
    const own = (rt && typeof rt.getURL === 'function' ? String(rt.getURL('') || '') : '').replace(/\/$/, ''); // chrome-extension://<id>
    const url = String(sender.url || sender.origin || '');
    if (own && (url === own || url.startsWith(`${own}/`))) return true;
    return !sender.tab && !url; // no tab and no URL: another extension context
  }

  const api = { isExtensionPage };
  root.MessageSender = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.MessageSender = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
