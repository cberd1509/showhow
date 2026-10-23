import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';

const CACHE = path.resolve(import.meta.dirname, '..', '.cache', 'bundles');
const REACT = '18.3.1';

/**
 * A React component as a full-frame page: a backdrop or a scene. Local files (the component, its CSS)
 * are bundled with esbuild; npm imports stay imports, resolved by an import map to esm.sh, so the
 * library's own published code runs (one React for all of them). Cached by the component's contents
 * and props. Returns the page's file URL. Its animation runs on the virtual clock (see clock.ts).
 */
export function reactPage(file: string, props: unknown = {}, exportName = 'default'): string {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`no component at ${abs}`);
  const key = createHash('sha1').update(JSON.stringify([abs, statSync(abs).mtimeMs, props, exportName, REACT])).digest('hex').slice(0, 12);
  const out = path.join(CACHE, key);
  const page = path.join(out, 'index.html');
  if (existsSync(page)) return `file://${page}`;
  mkdirSync(out, { recursive: true });
  const entry = `import * as M from ${JSON.stringify(abs)};
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
const C = M[${JSON.stringify(exportName)}];
if (!C) throw new Error(${JSON.stringify(`${path.basename(abs)} has no export "${exportName}"`)});
createRoot(document.getElementById('root')).render(createElement(C, ${JSON.stringify(props ?? {})}));`;
  const result = buildSync({
    stdin: { contents: entry, resolveDir: path.dirname(abs), loader: 'jsx', sourcefile: 'entry.jsx' },
    bundle: true,
    format: 'esm',
    outdir: out,
    entryNames: 'app',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.js': 'jsx', '.jsx': 'jsx', '.ts': 'tsx', '.tsx': 'tsx', '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.glsl': 'text', '.frag': 'text', '.vert': 'text' },
    metafile: true,
    logLevel: 'silent',
  });
  // Every bare import the bundle kept, mapped to esm.sh with React shared.
  const bare = new Set<string>(['react', 'react/jsx-runtime', 'react-dom/client']);
  for (const o of Object.values(result.metafile!.outputs)) for (const i of o.imports) if (i.external) bare.add(i.path);
  const imports: Record<string, string> = {};
  for (const spec of bare) {
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    const sub = spec.slice(name.length);
    imports[spec] = name === 'react' || name === 'react-dom'
      ? `https://esm.sh/${name}@${REACT}${sub}${name === 'react-dom' ? '?external=react' : ''}`
      : `https://esm.sh/${spec}?external=react,react-dom`;
  }
  const css = existsSync(path.join(out, 'app.css')) ? '<link rel="stylesheet" href="app.css">' : '';
  writeFileSync(page, `<!doctype html>
<html><head><meta charset="utf-8">
<style>html, body, #root { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: transparent; }</style>
${css}
<script type="importmap">${JSON.stringify({ imports }, null, 1)}</script>
</head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>
`);
  return `file://${page}`;
}

/** A HyperFrames block (`hyperframes add`) as a page, with its variables. */
export function blockPage(file: string, vars: Record<string, unknown> = {}): string {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`no block at ${abs}: install it with \`showhow add hyperframes:<name>\``);
  if (!readFileSync(abs, 'utf8').includes('__timelines')) throw new Error(`${abs} registers no timeline on window.__timelines: not a HyperFrames block`);
  return `file://${abs}?vars=${encodeURIComponent(JSON.stringify(vars))}`;
}
