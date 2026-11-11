'use strict';
/**
 * A small DOM built from real HTML text, for tests of code that walks a page's markup as it is (the Settings search reads
 * sections/settings/settings.html itself, so a change to that page is a change to the test). It is not a browser: no layout, no CSS
 * rules, no scripts. What it does model: elements with attributes, classes, inline display, children and text; the selectors the
 * extension's code uses (tag, .class, #id, [attr], [attr="v"], [attr^="v"], :not(), :scope, descendant and child combinators,
 * lists); focus; and events that run in the order of the standard (window, document and the ancestors in the capture phase, the
 * target, then the way back up), honouring preventDefault, stopPropagation and stopImmediatePropagation.
 * Not a test file (no .test.js suffix), so `node --test test/*.test.js` does not run it.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (text) => text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
  if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
  return name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : whole;
});
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// ---------------------------------------------------------------------------------------------------------------- selectors
function parseCompound(source, start) {
  const compound = { tag: null, classes: [], id: null, attrs: [], nots: [], scope: false };
  let i = start;
  while (i < source.length && !/[\s>,]/.test(source[i])) {
    const rest = source.slice(i);
    let m;
    if ((m = /^\.([\w-]+)/.exec(rest))) { compound.classes.push(m[1]); i += m[0].length; }
    else if ((m = /^#([\w-]+)/.exec(rest))) { compound.id = m[1]; i += m[0].length; }
    else if (rest[0] === '*') i += 1;
    else if (rest[0] === '[') {
      const end = source.indexOf(']', i);
      const body = source.slice(i + 1, end).trim();
      const parts = /^([\w-]+)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]*)))?$/.exec(body);
      if (!parts) throw new Error(`unsupported attribute selector: [${body}]`);
      compound.attrs.push({ name: parts[1], op: parts[2] || null, value: parts[3] ?? parts[4] ?? parts[5] ?? '' });
      i = end + 1;
    } else if (rest.startsWith(':scope')) { compound.scope = true; i += 6; }
    else if (rest.startsWith(':not(')) {
      let depth = 1, j = i + 5;
      while (depth && j < source.length) { depth += source[j] === '(' ? 1 : source[j] === ')' ? -1 : 0; j += 1; }
      compound.nots.push(parseList(source.slice(i + 5, j - 1)));
      i = j;
    } else if ((m = /^[a-zA-Z][\w-]*/.exec(rest))) { compound.tag = m[0].toLowerCase(); i += m[0].length; }
    else throw new Error(`unsupported selector: ${source}`);
  }
  return [compound, i];
}

/** "a > b c" as [a, '>', b, ' ', c] */
function parseComplex(source) {
  const parts = [];
  let i = 0;
  for (;;) {
    while (/\s/.test(source[i] || '')) i += 1;
    if (i >= source.length) break;
    if (source[i] === '>') { parts.push('>'); i += 1; continue; }
    if (parts.length && typeof parts.at(-1) !== 'string') parts.push(' ');
    const [compound, next] = parseCompound(source, i);
    parts.push(compound);
    i = next;
  }
  return parts;
}

function parseList(source) {
  const items = [];
  let depth = 0, current = '';
  for (const ch of source) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && !depth) { items.push(current); current = ''; } else current += ch;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean).map(parseComplex);
}

const attrMatches = (el, { name, op, value }) => {
  const actual = el.getAttribute(name);
  if (actual === null) return false;
  if (!op) return true;
  return op === '=' ? actual === value : op === '^=' ? actual.startsWith(value) : op === '$=' ? actual.endsWith(value)
    : op === '*=' ? actual.includes(value) : op === '~=' ? actual.split(/\s+/).includes(value) : actual === value || actual.startsWith(`${value}-`);
};

function matchesCompound(el, c, scope) {
  if (c.scope && el !== scope) return false;
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  if (c.classes.some((name) => !el.classList.contains(name))) return false;
  if (c.attrs.some((attr) => !attrMatches(el, attr))) return false;
  return !c.nots.some((list) => list.some((complex) => matchesComplex(el, complex, scope)));
}

function matchesComplex(el, parts, scope, at = parts.length - 1) {
  if (!matchesCompound(el, parts[at], scope)) return false;
  if (at === 0) return true;
  const combinator = parts[at - 1];
  if (combinator === '>') return !!el.parentNode && el.parentNode.nodeType === 1 && matchesComplex(el.parentNode, parts, scope, at - 2);
  for (let up = el.parentNode; up && up.nodeType === 1; up = up.parentNode) if (matchesComplex(up, parts, scope, at - 2)) return true;
  return false;
}

const matchesList = (el, list, scope = el) => list.some((complex) => matchesComplex(el, complex, scope));

// ---------------------------------------------------------------------------------------------------------------- events
/** Listeners by type, with the capture flag; `run` calls them in order and honours stopImmediatePropagation. */
function listeners() {
  const byType = new Map();
  return {
    add(type, fn, options) { const capture = options === true || !!(options && options.capture); (byType.get(type) || byType.set(type, []).get(type)).push({ fn, capture }); },
    remove(type, fn) { byType.set(type, (byType.get(type) || []).filter((entry) => entry.fn !== fn)); },
    get(type, phase) { return (byType.get(type) || []).filter((entry) => phase === 'target' || entry.capture === (phase === 'capture')); }
  };
}

function dispatch(target, init, path) {
  const event = {
    bubbles: true, cancelable: true, defaultPrevented: false, propagationStopped: false, immediateStopped: false, ...init, target,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; }
  };
  const call = (node, phase) => {
    event.currentTarget = node;
    for (const { fn } of node._events.get(event.type, phase)) {
      fn.call(node, event);
      if (event.immediateStopped) break;
    }
  };
  // path: outermost first, target last
  for (const node of path.slice(0, -1)) { if (event.propagationStopped) break; call(node, 'capture'); }
  if (!event.propagationStopped) call(target, 'target');
  if (event.bubbles) for (const node of path.slice(0, -1).reverse()) { if (event.propagationStopped) break; call(node, 'bubble'); }
  return event;
}

// ---------------------------------------------------------------------------------------------------------------- nodes
class TextNode {
  constructor(data) { this.nodeType = 3; this.data = data; this.parentNode = null; }
  get textContent() { return this.data; }
}

class Element {
  constructor(tag, document) {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._events = listeners();
    this.style = {};
    this.value = '';
    this.checked = false;
    this.scrollTop = 0;
    this.scrolled = 0;
    this.dataset = new Proxy({}, {
      get: (_, key) => { const value = typeof key === 'string' ? this.getAttribute(`data-${kebab(key)}`) : null; return value === null ? undefined : value; },
      set: (_, key, value) => { this.setAttribute(`data-${kebab(key)}`, value); return true; },
      deleteProperty: (_, key) => { this.removeAttribute(`data-${kebab(key)}`); return true; },
      has: (_, key) => this.hasAttribute(`data-${kebab(key)}`)
    });
    const element = this;
    this.classList = {
      contains: (name) => element._classes().includes(name),
      add: (...names) => element._setClasses([...new Set([...element._classes(), ...names])]),
      remove: (...names) => element._setClasses(element._classes().filter((name) => !names.includes(name))),
      toggle: (name, force) => {
        const on = force === undefined ? !element._classes().includes(name) : !!force;
        if (on) element.classList.add(name); else element.classList.remove(name);
        return on;
      }
    };
  }

  _classes() { return (this.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
  _setClasses(list) { if (list.length) this.setAttribute('class', list.join(' ')); else this.removeAttribute('class'); }

  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  setAttribute(name, value) {
    this._attrs.set(name, String(value));
    if (name === 'style') this._readStyle(String(value));
    if (name === 'value') this.value = String(value);
    if (name === 'checked') this.checked = true;
  }
  removeAttribute(name) { this._attrs.delete(name); if (name === 'checked') this.checked = false; }
  hasAttribute(name) { return this._attrs.has(name); }
  _readStyle(text) {
    this.style = {};
    for (const declaration of text.split(';')) {
      const at = declaration.indexOf(':');
      if (at > 0) this.style[camel(declaration.slice(0, at).trim())] = declaration.slice(at + 1).trim();
    }
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get tabIndex() { return this.hasAttribute('tabindex') ? Number(this.getAttribute('tabindex')) : (['button', 'input', 'select', 'textarea', 'a'].includes(this.localName) ? 0 : -1); }
  set tabIndex(value) { this.setAttribute('tabindex', value); }
  get type() { return this.getAttribute('type') || (this.localName === 'input' ? 'text' : ''); }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }

  get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }
  set textContent(value) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    if (String(value) !== '') this.appendChild(new TextNode(String(value)));
  }
  set innerHTML(html) { this.textContent = ''; parseInto(this, html); }

  appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this; this.childNodes.push(node); return node; }
  removeChild(node) { this.childNodes = this.childNodes.filter((child) => child !== node); node.parentNode = null; return node; }
  insertAdjacentHTML(position, html) {
    const holder = new Element('div', this.ownerDocument);
    parseInto(holder, html);
    const nodes = holder.childNodes.slice();
    if (position === 'afterbegin') { nodes.reverse().forEach((node) => { node.parentNode = this; this.childNodes.unshift(node); }); return; }
    if (position !== 'beforeend') throw new Error(`insertAdjacentHTML(${position}) is not modelled`);
    nodes.forEach((node) => this.appendChild(node));
  }
  contains(node) { for (let up = node; up; up = up.parentNode) if (up === this) return true; return false; }

  * _descendants() { for (const child of this.children) { yield child; yield* child._descendants(); } }
  querySelectorAll(selector) { const list = parseList(selector); return [...this._descendants()].filter((el) => matchesList(el, list, this)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return matchesList(this, parseList(selector)); }
  closest(selector) {
    const list = parseList(selector);
    for (let up = this; up && up.nodeType === 1; up = up.parentNode) if (matchesList(up, list)) return up;
    return null;
  }

  /** Outermost first, this element last: the window, the document, then the elements from <html> down. */
  _path() {
    const elements = [];
    for (let up = this; up && up.nodeType === 1; up = up.parentNode) elements.unshift(up);
    return [this.ownerDocument._window, this.ownerDocument, ...elements];
  }
  addEventListener(type, fn, options) { this._events.add(type, fn, options); }
  removeEventListener(type, fn) { this._events.remove(type, fn); }
  dispatchEvent(init) { return dispatch(this, init, this._path()); }

  focus() {
    const document = this.ownerDocument;
    if (document.activeElement === this) return;
    document.activeElement = this;
    this.dispatchEvent({ type: 'focus', bubbles: false });
    this.dispatchEvent({ type: 'focusin' });
  }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() { return this.dispatchEvent({ type: 'click' }); }
  scrollIntoView() { this.scrolled += 1; }
  getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
  /** One box, unless the element (or an ancestor) is hidden by its attribute or inline display: what a focus trap asks. */
  getClientRects() {
    for (let up = this; up && up.nodeType === 1; up = up.parentNode) if (up.hidden || up.style.display === 'none') return [];
    return [{}];
  }
}

// ---------------------------------------------------------------------------------------------------------------- parsing
const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)|</g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseInto(container, html) {
  const document = container.ownerDocument;
  const stack = [container];
  for (const match of html.matchAll(TOKEN)) {
    const top = stack.at(-1);
    if (match[5] !== undefined) { top.appendChild(new TextNode(decode(match[5]))); continue; }
    if (match[1]) { // a closing tag closes the nearest open element of that name
      const at = stack.map((el) => el.localName).lastIndexOf(match[1].toLowerCase());
      if (at > 0) stack.length = at;
      continue;
    }
    if (!match[2]) continue; // a comment, or a stray "<"
    const tag = match[2].toLowerCase();
    const element = new Element(tag, document);
    for (const attr of (match[3] || '').matchAll(ATTRIBUTE)) element.setAttribute(attr[1], decode(attr[2] ?? attr[3] ?? attr[4] ?? ''));
    top.appendChild(element);
    if (!match[4] && !VOID.has(tag)) stack.push(element);
  }
  return container;
}

// ---------------------------------------------------------------------------------------------------------------- document
/**
 * A document with a body, and a window that sees the events first. `window.dir` etc. are plain properties to set.
 * @returns {{document: object, window: object}}
 */
function createDom() {
  const window = { _events: listeners(), nodeType: 9, dir: 'ltr', addEventListener(type, fn, options) { this._events.add(type, fn, options); }, removeEventListener(type, fn) { this._events.remove(type, fn); } };
  const document = {
    nodeType: 9, _events: listeners(), _window: window, activeElement: null,
    addEventListener(type, fn, options) { this._events.add(type, fn, options); },
    removeEventListener(type, fn) { this._events.remove(type, fn); },
    createElement(tag) { return new Element(tag, document); },
    querySelector(selector) { return this.documentElement.querySelector(selector); },
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); },
    getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  };
  document.documentElement = new Element('html', document);
  document.body = document.documentElement.appendChild(new Element('body', document));
  document.activeElement = document.body;
  window.document = document;
  /** Key presses and other events that start at an element (or the window/document), through the whole path. */
  window.fire = (target, init) => (target.dispatchEvent ? target.dispatchEvent(init) : dispatch(target, init, [window, ...(target === document ? [document] : [])]));
  return { document, window };
}

module.exports = { createDom, parseInto, Element, TextNode };
