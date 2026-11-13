/**
 * PrerenderOutbox: what the content script sends the worker while Chrome prerenders the page (speculation rules, the address
 * bar guessing the next page), held until the page is shown.
 *
 * A prerendered page runs its scripts, and so its JS hooks and window checks, before anyone sees it, in a document that is
 * not the tab's page yet: the worker turns its reports away (they come from a frame that is not the tab's top frame), and
 * by the time the page is shown its hooks have already reported and gone quiet, so its scan had none of them. Held here,
 * they are sent once the page is shown, in the order they were made, right after the notice that the page is now the tab's
 * (activation: the worker sets aside what the tab captured for the page before and takes what it kept of this page's own
 * load). A page that is never shown is thrown away by Chrome, and what it held with it.
 *
 *   create({ document, send, shownMessage, sparable, max })
 *     document       the page's document (prerendering, prerenderingchange)
 *     send           (message) => Promise of the worker's answer (chrome.runtime.sendMessage)
 *     shownMessage   () => the message that tells the worker the page is shown, sent first; null sends none
 *     sparable       the message types a full outbox may drop, oldest first: reports another one or the scan repeats (the
 *                    content script names hook batches, response bodies and hook failures, ScrapflyBridgeProtocol);
 *                    any other type, a completion above all, is never dropped while one of these can go
 *     max            how many messages are held at most (default 300)
 *   returns { send(message), whenShown(callback), holding() }
 *     send           sends now, or holds it while the page is prerendered; a Promise of the worker's answer either way
 *                    (undefined for one dropped past `max`)
 *     whenShown      runs callback once the page is shown, after the held messages went out (at once when it is shown)
 *
 * Content script only (ISOLATED world, manifest.json). No dependencies.
 */
(function(root) {
  'use strict';

  const DEFAULT_MAX = 300;

  function create({ document, send, shownMessage = null, sparable = [], max = DEFAULT_MAX } = {}) {
    const spareTypes = new Set(sparable);
    const held = [];
    const waiting = [];
    let shown = !(document && document.prerendering === true);
    let open = shown; // the held messages went out: later ones go straight to the worker

    const deliver = (message) => {
      try {
        return Promise.resolve(send(message));
      } catch (error) {
        return Promise.reject(error);
      }
    };

    const onShown = () => {
      if (shown) return;
      shown = true;
      const notice = shownMessage ? shownMessage() : null;
      const ready = notice ? deliver(notice).catch(() => undefined) : Promise.resolve();
      // The held reports after the notice: what the worker keeps of the page's load is set up before they arrive
      ready.then(() => {
        open = true;
        for (const entry of held.splice(0)) deliver(entry.message).then(entry.resolve, entry.reject);
        for (const callback of waiting.splice(0)) {
          try { callback(); } catch (_) { /* one caller's failure is its own */ }
        }
      });
    };

    if (!shown) document.addEventListener('prerenderingchange', onShown, { once: true });

    return {
      send(message) {
        if (open) return deliver(message);
        return new Promise((resolve, reject) => {
          held.push({ message, resolve, reject });
          if (held.length <= max) return;
          const spare = held.findIndex(entry => entry.message && spareTypes.has(entry.message.type));
          const [dropped] = held.splice(spare === -1 ? held.length - 1 : spare, 1);
          dropped.resolve(undefined);
        });
      },
      whenShown(callback) {
        if (open) { callback(); return; }
        waiting.push(callback);
      },
      holding() { return !open; }
    };
  }

  const PrerenderOutbox = Object.freeze({ create, DEFAULT_MAX });
  root.PrerenderOutbox = PrerenderOutbox;
  if (typeof module !== 'undefined' && module.exports) module.exports = PrerenderOutbox;
})(typeof globalThis !== 'undefined' ? globalThis : this);
