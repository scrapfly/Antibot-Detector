// A small DOM for tests of the DOM extractor (modules/detection/engine/detection-engine-extractors.js): elements with
// attributes and children, a document with a head and a body, and a TreeWalker that follows the DOM standard for the two
// answers the extractor gives (accept, skip). Elements are plain objects: tagName, hasAttribute, getAttribute, textContent.
const ACCEPT = 1;
const REJECT = 2;
const SKIP = 3;

/** An element. `text` is its text content (what an inline script holds). */
function element(tag, attributes = {}, children = [], text = '') {
  const attrs = { ...attributes };
  return {
    tagName: tag.toUpperCase(),
    children,
    textContent: text,
    hasAttribute: (name) => Object.hasOwn(attrs, name),
    getAttribute: (name) => (Object.hasOwn(attrs, name) ? attrs[name] : null)
  };
}

/**
 * A document: <html><head>…</head><body>…</body></html>. `walkers` records the root of every TreeWalker the code under test
 * creates, `walked` how many nodes the filter was asked about.
 */
function documentOf({ head = [], body = [] } = {}) {
  const headElement = element('head', {}, head);
  const bodyElement = element('body', {}, body);
  const documentElement = element('html', {}, [headElement, bodyElement]);
  const walkers = [];
  const doc = {
    documentElement, head: headElement, body: bodyElement, walkers, walked: 0,
    createTreeWalker(root, _show, filter) {
      walkers.push({ root });
      // Document order below the root (the root itself is never returned); SKIP leaves the node out but still enters its
      // children, REJECT leaves out the whole subtree
      const order = [];
      const visit = (node) => {
        for (const child of node.children) {
          doc.walked += 1;
          const verdict = filter.acceptNode(child);
          if (verdict === ACCEPT) order.push(child);
          if (verdict !== REJECT) visit(child);
        }
      };
      visit(root);
      let index = -1;
      return { currentNode: root, nextNode() { index += 1; this.currentNode = order[index]; return !!this.currentNode; } };
    }
  };
  return doc;
}

module.exports = { element, documentOf, ACCEPT, REJECT, SKIP };
