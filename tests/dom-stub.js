/* Deigracht — минимальная DOM-заглушка для рендер-проверок без браузера
   (tests/dom-stub.js), волна v0.4.1 (АН-27).
   Происхождение: харнесс внешнего ревьюера волны v0.4.0 (rev040-recheck,
   запись 7 — run-checks.js/t6.js/dom-stub.js, оригиналы в рабочей области
   аналитика); принят в tests/ с дополнениями v0.4.1: clientHeight/
   scrollHeight, getBoundingClientRect, addEventListener, scrollIntoView
   (нулевые значения — layout отсутствует).
   Границы: БЕЗ layout — scrollWidth = clientWidth = 0, переполнения и
   геометрия не моделируются; проверки структурные (состав рендера, логика
   директив/оглавлений), визуальная приёмка — браузером (регламент §8.4).
   Используется: tests/render-smoke.js. Node >= 16, без зависимостей. */
'use strict';
function parseSelector(sel) {
  const m = { tag: null, classes: [], attrs: [] };
  const tokens = String(sel).match(/[a-zA-Z][\w-]*|\.[\w-]+|\[[\w-]+(?:=["']?[^\]"']*["']?)?\]/g) || [];
  for (const t of tokens) {
    if (t.startsWith('.')) m.classes.push(t.slice(1));
    else if (t.startsWith('[')) {
      const am = t.slice(1, -1).match(/^([\w-]+)(?:=["']?([^\]"']*)["']?)?$/);
      if (am) m.attrs.push({ name: am[1], value: am[2] === undefined ? null : am[2] });
    } else m.tag = t.toUpperCase();
  }
  return m;
}
class TextNode {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); this.parentNode = null; }
  cloneNode() { return new TextNode(this.textContent); }
}
class ClassList {
  constructor(node) { this.node = node; }
  _set() { return new Set(String(this.node._className || '').split(/\s+/).filter(Boolean)); }
  add(c) { const s = this._set(); s.add(c); this.node._className = [...s].join(' '); }
  remove(c) { const s = this._set(); s.delete(c); this.node._className = [...s].join(' '); }
  contains(c) { return this._set().has(c); }
}
class Element {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag || 'div').toUpperCase();
    this.childNodes = [];
    this.attrs = {};
    this._className = '';
    this.style = {};
    this.classList = new ClassList(this);
    this.scrollWidth = 0; this.clientWidth = 0;
    this.scrollHeight = 0; this.clientHeight = 0;
    this.parentNode = null;
    this.hidden = false;
  }
  set className(v) { this._className = v; }
  get className() { return this._className || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this._className = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get lastElementChild() { const c = this.children; return c.length ? c[c.length - 1] : null; }
  set textContent(v) { this.childNodes = []; if (v !== '' && v != null) this.appendChild(new TextNode(v)); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
  scrollIntoView() {}
  addEventListener() {}
  matches(m) {
    if (m.tag && this.tagName !== m.tag) return false;
    for (const c of m.classes) if (!this.classList.contains(c)) return false;
    for (const a of m.attrs) {
      if (!(a.name in this.attrs)) return false;
      if (a.value !== null && this.attrs[a.name] !== a.value) return false;
    }
    return true;
  }
  querySelectorAll(sel) {
    const m = typeof sel === 'string' ? parseSelector(sel) : sel;
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 1) { if (c.matches(m)) out.push(c); walk(c); } } };
    walk(this);
    return out;
  }
  querySelector(sel) { const r = this.querySelectorAll(sel); return r.length ? r[0] : null; }
  cloneNode(deep) {
    const c = new Element(this.tagName);
    c.attrs = Object.assign({}, this.attrs);
    c._className = this._className;
    if (deep) for (const ch of this.childNodes) c.appendChild(ch.cloneNode(true));
    return c;
  }
}
function makeDocument() {
  const doc = {
    body: new Element('body'),
    head: new Element('head'),
    documentElement: new Element('html'),
    createElement: (t) => new Element(t),
    createTextNode: (t) => new TextNode(t),
    addEventListener: function () {}
  };
  return doc;
}
module.exports = { Element, TextNode, makeDocument };
