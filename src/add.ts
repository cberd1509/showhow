import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `showhow add <source>:<name> [--to vendor]`: installs a component from a library into the video's
 * folder, the way that library distributes it, so a scene or backdrop can use it:
 *   reactbits:Silk        a React Bits component, from its registry (as `shadcn add` would)
 *   hyperframes:starfield a HyperFrames catalog block or component (`hyperframes add`)
 * It prints the spec line that uses it.
 */
export async function add(what: string, to = 'vendor') {
  const [source, name] = what.includes(':') ? what.split(/:(.*)/s) : ['', what];
  if (!name) throw new Error('add what? e.g. reactbits:Silk or hyperframes:starfield');
  if (source === 'reactbits') {
    const url = `https://reactbits.dev/r/${name}-JS-CSS.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`React Bits has no "${name}" (${res.status} from ${url}); names are PascalCase, as on reactbits.dev (Silk, Iridescence, BlurText…)`);
    const item = (await res.json()) as { title?: string; description?: string; dependencies?: string[]; files: { path: string; content: string }[] };
    const dir = path.resolve(to, 'reactbits', name);
    mkdirSync(dir, { recursive: true });
    for (const f of item.files) writeFileSync(path.join(dir, path.basename(f.path)), f.content);
    writeFileSync(path.join(dir, 'SOURCE.md'), `${item.title ?? name}: ${item.description ?? ''}\n\nFrom React Bits (https://reactbits.dev), installed from ${url}.\nLicense: MIT + Commons Clause (https://github.com/DavidHDev/react-bits): use it in your projects; don't resell or redistribute the component itself.\n`);
    const main = item.files.find((f) => /\.(jsx|tsx|js)$/.test(f.path));
    console.log(`add: ${dir}`);
    if (item.dependencies?.length) console.log(`  npm dependencies (loaded from esm.sh at render): ${item.dependencies.join(', ')}`);
    console.log(`  use it:  backdrop: { react: ${path.relative(process.cwd(), path.join(dir, path.basename(main?.path ?? `${name}.jsx`)))}, props: { … } }`);
    console.log('  (or `scene: { react: …, props: … }`). Props are documented on its reactbits.dev page.');
    return;
  }
  if (source === 'hyperframes') {
    const dir = path.resolve(to, 'hyperframes');
    mkdirSync(dir, { recursive: true });
    const out = execFileSync('npx', ['-y', 'hyperframes@latest', 'add', name, '--dir', dir, '--no-clipboard', '--json'], { encoding: 'utf8' });
    const json = JSON.parse(out.slice(out.indexOf('{')));
    if (!json.ok) throw new Error(`hyperframes add ${name} failed: ${out}`);
    console.log(`add: ${json.written.join(', ')}`);
    for (const f of json.written as string[]) if (f.endsWith('.html')) console.log(`  use it:  backdrop: { hyperframes: ${path.relative(process.cwd(), f)}, vars: { … } }   (or scene: { hyperframes: …, vars })`);
    console.log('  Its variables are listed in data-composition-variables at the top of the file. Search the catalog: npx hyperframes catalog <words> --json');
    return;
  }
  throw new Error(`unknown source "${source}": reactbits or hyperframes`);
}
