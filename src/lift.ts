import type { ElementHandle, Locator, Page } from 'playwright';

/**
 * Lifts a live element out of the app: a detached copy with every computed
 * style inlined (only where it differs from a bare element of the same tag),
 * ::before/::after as rules, images and the fonts it uses embedded as data
 * URLs. The copy renders without the app, its stylesheets or its session, so
 * a scene can animate the real UI piece by piece.
 *
 * It is taken from the page as shown, after mocks: what it contains is what
 * the viewer would have seen.
 */
export async function liftElement(loc: Locator | ElementHandle): Promise<{ html: string; width: number; height: number }> {
  return (loc as Locator).evaluate(async (root: Element) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const bare = frame.contentDocument!;
    const baseline = new Map<string, CSSStyleDeclaration>();
    const base = (tag: string, ns: string | null, type?: string | null) => {
      const key = `${ns}|${tag}|${type ?? ''}`;
      if (!baseline.has(key)) {
        const el = ns && ns !== 'http://www.w3.org/1999/xhtml' ? bare.createElementNS(ns, tag) : bare.createElement(tag);
        if (type) el.setAttribute('type', type);
        (ns === 'http://www.w3.org/2000/svg' && tag !== 'svg' ? bare.body.appendChild(bare.createElementNS(ns, 'svg')) : bare.body).appendChild(el);
        baseline.set(key, frame.contentWindow!.getComputedStyle(el));
      }
      return baseline.get(key)!;
    };
    const SKIP = new Set(['transition', 'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function', 'animation', 'animation-name', 'animation-duration', 'cursor', 'pointer-events', 'will-change']);
    const ALWAYS = /^(border-(top|right|bottom|left)-width|outline-width)$/;
    const styleOf = (cs: CSSStyleDeclaration, ref: CSSStyleDeclaration) => {
      let out = '';
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i];
        if (SKIP.has(prop) || prop.startsWith('--')) continue;
        const v = cs.getPropertyValue(prop);
        // Widths always: a reset like Tailwind's (solid, 0) would otherwise come back as the default 3px.
        if (v !== ref.getPropertyValue(prop) || ALWAYS.test(prop)) out += `${prop}:${v};`;
      }
      return out;
    };
    const toData = async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        const blob = await res.blob();
        return await new Promise<string>((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result as string);
          r.readAsDataURL(blob);
        });
      } catch {
        return url;
      }
    };

    const rules: string[] = [];
    const families = new Set<string>();
    const images: Promise<void>[] = [];
    let n = 0;
    const copy = (src: Element): Element => {
      // <body> and <html> can't live inside another document's markup (a parser drops them): a div stands in.
      const el = src === document.body || src === document.documentElement ? document.createElement('div') : (src.cloneNode(false) as Element);
      const cs = getComputedStyle(src);
      // No links (they would pick up :link styles) and nothing that runs or refers back to the app's CSS.
      for (const a of [...el.attributes]) if (/^(on|href$|id$|class$|style$|tabindex$|target$)/.test(a.name)) el.removeAttribute(a.name);
      el.setAttribute('style', styleOf(cs, base(src.localName, src.namespaceURI, src.getAttribute('type'))));
      // Pinned to the viewport in the app (a toast, a bottom bar): pinned to the lift in the copy.
      if (cs.position === 'fixed') el.setAttribute('style', `${el.getAttribute('style')}position:absolute;`);
      cs.fontFamily.split(',').forEach((f) => families.add(f.trim().replace(/^["']|["']$/g, '')));
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(src, pseudo);
        if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
          const cls = `lift-${n++}`;
          el.classList.add(cls);
          rules.push(`.${cls}${pseudo}{${styleOf(ps, base('span', null))}content:${ps.content};}`);
        }
      }
      if (src instanceof HTMLImageElement) {
        el.removeAttribute('srcset');
        images.push(toData(src.currentSrc || src.src).then((d) => el.setAttribute('src', d)));
      }
      if (src instanceof HTMLInputElement || src instanceof HTMLTextAreaElement) el.setAttribute('value', src.value);
      if (src instanceof HTMLTextAreaElement) el.textContent = src.value;
      if (src instanceof HTMLCanvasElement) {
        const img = document.createElement('img');
        img.setAttribute('style', el.getAttribute('style')!);
        img.src = src.toDataURL();
        return img;
      }
      if (src instanceof HTMLIFrameElement || src instanceof HTMLScriptElement) {
        const ph = document.createElement('div');
        ph.setAttribute('style', el.getAttribute('style')!);
        return ph;
      }
      for (const child of src.childNodes) {
        if (child.nodeType === 1) el.appendChild(copy(child as Element));
        else if (child.nodeType === 3) el.appendChild(child.cloneNode());
      }
      return el;
    };
    const out = copy(root);
    const box = root.getBoundingClientRect();
    // The root keeps its size and becomes the positioning context; where it sat on the page no longer matters.
    out.setAttribute('style', `${out.getAttribute('style')}position:relative;inset:auto;margin:0;width:${box.width}px;height:${box.height}px;transform:none;box-sizing:border-box;`);
    out.setAttribute('data-lift', '');
    await Promise.all(images);

    // The fonts this piece uses, from every stylesheet the page can read.
    const faces: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...list]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const fam = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '');
        if (!families.has(fam)) continue;
        let text = rule.cssText;
        const urls = [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
        for (const u of urls) text = text.replace(u, await toData(new URL(u, sheet.href ?? location.href).href));
        faces.push(text);
      }
    }
    frame.remove();
    return { html: `<style>${faces.join('\n')}\n${rules.join('\n')}</style>${out.outerHTML}`, width: box.width, height: box.height };
  });
}

/**
 * The app's look, read from the page: background, surfaces, text, accent
 * (the primary button), fonts and corner radius. A starting point for
 * `theme.app`, not a verdict; probe prints it for the agent to check.
 */
export async function readBrand(page: Page) {
  return page.evaluate(() => {
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : undefined);
    const opaque = (c?: string) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
    const body = cs(document.body)!;
    const main = cs(document.querySelector('main'));
    const buttons = [...document.querySelectorAll('button, a[role=button], [type=submit]')].map((b) => getComputedStyle(b));
    // The accent: the most common saturated button background.
    const sat = (c: string) => {
      const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
      return m.length >= 3 ? Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]) : 0;
    };
    const tally = new Map<string, number>();
    for (const b of buttons) if (opaque(b.backgroundColor) && sat(b.backgroundColor) > 40) tally.set(b.backgroundColor, (tally.get(b.backgroundColor) ?? 0) + 1);
    const accent = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const card = [...document.querySelectorAll('section, article, [class*=card], [class*=Card]')].map((e) => getComputedStyle(e)).find((c) => opaque(c.backgroundColor));
    const h = cs(document.querySelector('h1, h2'));
    const muted = cs(document.querySelector('p, small, [class*=muted]'));
    return {
      background: opaque(main?.backgroundColor) ? main!.backgroundColor : body.backgroundColor,
      surface: card?.backgroundColor,
      text: body.color,
      muted: muted?.color,
      accent,
      font: body.fontFamily,
      headingFont: h?.fontFamily,
      radius: card?.borderRadius,
    };
  });
}

/** @font-face rules for the fonts the page uses, embedded, as one CSS file. */
export async function readFonts(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const used = new Set<string>();
    for (const el of document.querySelectorAll('body, body *')) getComputedStyle(el).fontFamily.split(',').forEach((f) => used.add(f.trim().replace(/^["']|["']$/g, '')));
    const faces: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...list]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        if (!used.has(rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, ''))) continue;
        let text = rule.cssText;
        for (const m of [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)]) {
          try {
            const blob = await (await fetch(new URL(m[1], sheet.href ?? location.href).href)).blob();
            const data = await new Promise<string>((ok) => {
              const r = new FileReader();
              r.onload = () => ok(r.result as string);
              r.readAsDataURL(blob);
            });
            text = text.replace(m[1], data);
          } catch {
            /* keep the URL */
          }
        }
        faces.push(text);
      }
    }
    return faces.join('\n');
  });
}

/**
 * The card around an element: the nearest ancestor that looks like one (rounded, with a background,
 * border or shadow, and a real size). A heading is easy to target; the panel it titles is what to lift.
 */
export async function cardAround(loc: Locator): Promise<ElementHandle> {
  const handle = await loc.evaluateHandle((el: Element) => {
    for (let a: Element | null = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      const framed = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
      if (parseFloat(cs.borderTopLeftRadius) > 0 && framed && r.width > 200 && r.height > 80) return a;
    }
    return el;
  });
  return handle as ElementHandle;
}
