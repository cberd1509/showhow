import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { activePage, applyPrivacy, launch } from './browser.ts';
import { loadSpec } from './spec.ts';
import { outputDir } from './paths.ts';
import { Runner } from './runner.ts';
import { readBrand, readFonts } from './lift.ts';

/**
 * Discovery without the source code. Replays the spec's steps (fast, no
 * pacing) up to `after`, or opens `url`, then writes what is on screen:
 * the ARIA snapshot (roles and names, which is what steps target), a
 * screenshot, and the JSON requests the page made (what `mock.routes` can
 * replace). Mocks and blurs are applied, so the screenshot shows what the
 * recording will.
 */
export async function probe(file: string, opts: { after?: string; url?: string; out?: string; headed?: boolean }) {
  const { spec, dir } = loadSpec(file);
  const out = opts.out ? path.resolve(opts.out) : path.join(outputDir(file), 'probe');
  mkdirSync(out, { recursive: true });

  const context = await launch({ profile: spec.profile!, headless: !(opts.headed || spec.headed), viewport: spec.viewport, fresh: spec.fresh });
  try {
    const runner = new Runner(context, spec, { paced: false, liftDir: path.join(out, 'lifts') });
    await applyPrivacy(context, spec, dir, () => runner.step);
    // Bodies are saved so a mock fixture can copy a real response's shape.
    // They hold real data: they stay in the probe folder and go nowhere else.
    const requests: { method: string; url: string; status: number; body?: string }[] = [];
    const bodies = path.join(out, 'responses');
    rmSync(bodies, { recursive: true, force: true });
    mkdirSync(bodies, { recursive: true });
    context.on('response', async (r) => {
      const type = r.headers()['content-type'] ?? '';
      if (!type.includes('json')) return;
      const entry: (typeof requests)[number] = { method: r.request().method(), url: r.url(), status: r.status() };
      const n = requests.push(entry);
      const text = await r.text().catch(() => '');
      if (!text || text.length > 500_000) return;
      const name = `${String(n).padStart(2, '0')}-${new URL(r.url()).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.json`;
      entry.body = path.join(bodies, name);
      writeFileSync(entry.body, text);
    });

    const errors: string[] = [];
    const watch = (p: import('playwright').Page) => {
      p.on('pageerror', (e) => errors.push(`pageerror ${new URL(p.url()).host}: ${e.message.split('\n')[0]}`));
      p.on('console', (m) => m.type() === 'error' && errors.push(`console ${new URL(p.url() || 'about:blank').host}: ${m.text().slice(0, 200)}`));
      p.on('requestfailed', (r) => errors.push(`failed ${r.method()} ${r.url().slice(0, 120)}: ${r.failure()?.errorText}`));
    };
    context.pages().forEach(watch);
    context.on('page', watch);

    await runner.start(await activePage(context));
    if (opts.url) {
      await runner.page.goto(opts.url, { waitUntil: 'domcontentloaded' });
    } else {
      const last = opts.after ? spec.steps.findIndex((s) => s.id === opts.after) : -1;
      if (opts.after && last < 0) throw new Error(`no step "${opts.after}"`);
      const steps = opts.after ? spec.steps.slice(0, last + 1) : [];
      if (!steps.length) await runner.page.goto(spec.app, { waitUntil: 'domcontentloaded' });
      for (const step of steps) {
        if (step.card || step.scene) continue;
        process.stdout.write(`probe: ${step.id}\n`);
        await runner.runStep(step);
      }
    }
    const page = runner.page;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);

    const snapshot = await page.locator('body').ariaSnapshot();
    const shot = path.join(out, 'screen.png');
    await page.screenshot({ path: shot });
    writeFileSync(path.join(out, 'aria.yaml'), snapshot);
    writeFileSync(path.join(out, 'requests.json'), JSON.stringify(requests, null, 2));
    // The app's look, for theme.app and theme.fonts.
    const brand = await readBrand(page);
    writeFileSync(path.join(out, 'brand.json'), JSON.stringify(brand, null, 2));
    writeFileSync(path.join(out, 'fonts.css'), await readFonts(page));

    console.log(`url: ${page.url()}\ntitle: ${await page.title()}\ntabs: ${context.pages().length}`);
    console.log(`brand: ${JSON.stringify(brand)}\n  (theme.app; fonts embedded in ${path.join(out, 'fonts.css')} for theme.fonts)`);
    console.log(`screenshot: ${shot}\nrequests: ${requests.length} JSON responses in ${path.join(out, 'requests.json')}`);
    if (errors.length) console.log(`--- errors (${errors.length}) ---\n${[...new Set(errors)].slice(0, 25).join('\n')}`);
    console.log('--- aria snapshot ---');
    const lines = snapshot.split('\n');
    console.log(lines.slice(0, 300).join('\n'));
    if (lines.length > 300) console.log(`… ${lines.length - 300} more lines in ${path.join(out, 'aria.yaml')}`);
  } finally {
    await context.close();
  }
}
