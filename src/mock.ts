import type { Spec } from './spec.ts';

/**
 * The page-side half of mocking. Rewrites text nodes and attributes, and
 * blurs selectors, then keeps doing it: a MutationObserver re-applies every
 * rule when the app re-renders, so React putting the real name back is undone
 * in the same frame. Text is changed on text nodes only (never textContent of
 * an element), which frameworks tolerate because they update nodes in place.
 */
export function mockInitScript(spec: Spec): string | null {
  const text = (spec.mock?.text ?? []).map((r) => ({
    find: r.find,
    regex: r.find.startsWith('/') && r.find.lastIndexOf('/') > 0,
    replace: r.replace,
  }));
  const set = spec.mock?.set ?? [];
  const hide = spec.mock?.hide ?? [];
  const blur = spec.privacy?.blur ?? [];
  if (!text.length && !set.length && !hide.length && !blur.length) return null;

  const config = JSON.stringify({ text, set, hide, blur });
  return `(() => {
  const cfg = ${config};
  const rules = cfg.text.map((r) => {
    if (r.regex) {
      const end = r.find.lastIndexOf('/');
      const flags = r.find.slice(end + 1);
      return { re: new RegExp(r.find.slice(1, end), flags.includes('g') ? flags : flags + 'g'), to: r.replace };
    }
    return { re: new RegExp(r.find.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), to: r.replace };
  });
  const css = [
    ...cfg.blur.map((s) => s + ' { filter: blur(7px) !important; }'),
    ...cfg.hide.map((s) => s + ' { visibility: hidden !important; }'),
  ].join('\\n');

  // Matches across text nodes ("<b>Ada</b> Lovelace"): the replacement goes
  // into the first node of the match and the rest is trimmed from the others,
  // so no node is created or removed under the framework's feet.
  function rewriteText(root) {
    if (!rules.length || !root) return;
    if (root.nodeType === 3) root = root.parentNode;
    if (!root || root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentNode && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode.nodeName) ? 2 : 1,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    if (!nodes.length) return;
    const starts = [];
    let full = '';
    for (const n of nodes) { starts.push(full.length); full += n.nodeValue; }

    const edits = [];
    for (const r of rules) {
      const done = [];
      const literal = r.to;
      for (let k = full.indexOf(literal); literal && k >= 0; k = full.indexOf(literal, k + 1)) done.push([k, k + literal.length]);
      for (const m of full.matchAll(r.re)) {
        if (!m[0]) continue;
        const a = m.index, b = m.index + m[0].length;
        if (done.some(([x, y]) => a >= x && b <= y)) continue;
        if (edits.some((e) => a < e.b && b > e.a)) continue;
        edits.push({ a, b, to: m[0].replace(new RegExp(r.re.source, r.re.flags.replace('g', '')), r.to) });
      }
    }
    edits.sort((x, y) => y.a - x.a);
    for (const e of edits) {
      let k = starts.length - 1;
      while (k > 0 && starts[k] > e.a) k--;
      let left = e.b - e.a;
      let off = e.a - starts[k];
      let first = true;
      for (; k < nodes.length && (left > 0 || first); k++) {
        const v = nodes[k].nodeValue;
        const take = Math.min(left, v.length - off);
        const next = v.slice(0, off) + (first ? e.to : '') + v.slice(off + take);
        if (next !== v) nodes[k].nodeValue = next;
        left -= take;
        off = 0;
        first = false;
      }
    }
    for (const el of root.querySelectorAll ? root.querySelectorAll('input, textarea') : []) {
      let v = el.value;
      for (const r of rules) v = v.replace(r.re, r.to);
      if (v !== el.value) el.value = v;
    }
  }
  // An element's label is its longest text node; copies of it (a screen-reader
  // twin, a tooltip) change with it, and short bits (badges, times) stay.
  function setLabel(el, text) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
    if (!nodes.length) { if (el.textContent !== text) el.textContent = text; return; }
    const main = nodes.reduce((a, b) => (b.nodeValue.trim().length > a.nodeValue.trim().length ? b : a));
    const original = main.nodeValue.trim();
    if (original === text) return;
    for (const n of nodes) if (n === main || n.nodeValue.trim() === original) n.nodeValue = text;
  }
  function applySet() {
    for (const s of cfg.set) {
      document.querySelectorAll(s.selector).forEach((el, i) => {
        if (s.texts && s.texts.length) setLabel(el, s.texts[i % s.texts.length]);
        else if (s.text !== undefined) setLabel(el, s.text);
        if (s.attr && el.getAttribute(s.attr) !== s.value) el.setAttribute(s.attr, s.value);
      });
    }
  }
  let busy = false;
  function apply(root) {
    if (busy) return;
    busy = true;
    try { rewriteText(root || document.body); applySet(); } finally { busy = false; }
  }
  function start() {
    if (css) {
      const style = document.createElement('style');
      style.dataset.showhow = 'privacy';
      style.textContent = css;
      document.documentElement.appendChild(style);
    }
    apply(document.body);
    new MutationObserver((records) => {
      if (busy) return;
      // Re-scan from a block-level ancestor, so a match split across the
      // changed node and its siblings is still seen whole.
      const block = (n) => {
        const el = n && (n.nodeType === 1 ? n : n.parentElement);
        return (el && el.parentElement && el.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,td,th,dd,dt,button,a,label,section,article,header,nav,aside,main,form,dialog')) || (el && el.parentElement) || el;
      };
      const roots = new Set();
      for (const rec of records) {
        if (rec.type === 'characterData') roots.add(block(rec.target));
        else for (const n of rec.addedNodes) roots.add(block(n));
      }
      for (const r of roots) if (r && r.isConnected) apply(r);
      applySet();
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.__showhowMock = () => apply(document.body);
})();`;
}
