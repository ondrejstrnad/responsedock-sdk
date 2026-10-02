// Just enough DOM for the SDK's embed and modal code paths, so the package can be
// tested with node:test and no browser/jsdom dependency.

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) {
    const evt = { type, target: this, stopPropagation() {}, preventDefault() {}, ...event };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(evt);
    return evt;
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

export function installFakeDom({ origin = 'https://host.example' } = {}) {
  const doc = new FakeEventTarget();

  class HTMLElement extends FakeEventTarget {
    constructor(tagName) {
      super();
      this.tagName = tagName.toUpperCase();
      this.style = {};
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.textContent = '';
      this.rect = { top: 0, height: 0 };
      if (this.tagName === 'IFRAME') this.contentWindow = { postMessage: (message, target) => this.posted.push({ message, target }) };
      this.posted = [];
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
    get isConnected() {
      let node = this;
      while (node.parentNode) node = node.parentNode;
      return node === doc.documentElement;
    }
    focus() { doc.activeElement = this; this.dispatch('focus'); }
    click() { this.dispatch('click', { target: this }); }
    getBoundingClientRect() { return this.rect; }
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => node.children.forEach((child) => {
        if ((selector.startsWith('#') && child.id === selector.slice(1)) || child.tagName === selector.toUpperCase()) out.push(child);
        walk(child);
      });
      walk(this);
      return out;
    }
  }

  const documentElement = new HTMLElement('html');
  documentElement.clientWidth = 1009;
  const body = new HTMLElement('body');
  documentElement.appendChild(body);
  Object.assign(doc, {
    documentElement,
    body,
    activeElement: body,
    referrer: '',
    title: 'Host page',
    createElement: (tag) => new HTMLElement(tag),
    querySelector: (selector) => documentElement.querySelectorAll(selector)[0] ?? null,
  });

  const win = new FakeEventTarget();
  Object.assign(win, {
    location: { origin, href: `${origin}/page?secret=1`, pathname: '/page', assigned: [], assign(url) { this.assigned.push(url); } },
    innerWidth: 1024,
    innerHeight: 800,
    scrollY: 1000,
    scrolls: [],
    scrollTo(options) { this.scrolls.push(options); },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (el) => ({ paddingRight: el.style.paddingRight || '0px' }),
  });
  win.top = win;

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.HTMLElement = HTMLElement;

  /** Deliver a postMessage from `iframe` to the host window. */
  const post = (iframe, data, fromOrigin) => win.dispatch('message', {
    source: iframe.contentWindow,
    origin: fromOrigin ?? new URL(iframe.src).origin,
    data,
  });
  const lifecycle = (iframe, name, payload = {}, fromOrigin) => post(iframe, {
    source: 'responsedock', protocol: 'responsedock.embed', version: 1, type: `responsedock.lifecycle.${name}`, payload,
  }, fromOrigin);

  return { window: win, document: doc, body, post, lifecycle };
}
