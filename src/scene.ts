import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { withChannel } from './browser.ts';
import { loadSpec } from './spec.ts';
import { outputDir } from './paths.ts';
import { GEOMETRY } from './format.ts';
import { CLOCK_SCRIPT } from './clock.ts';
import { resolveBackdrop, scenePage } from './timeline.ts';
import { readLines } from './voice.ts';

const STAGE = path.resolve(import.meta.dirname, 'stage.html');

/**
 * One scene on its own, before a full render: eight stills across its
 * narration (with the real word timings) on one sheet, the sounds it
 * schedules, and the layout check. Lifts come from the last recording, or
 * from probe when there is none yet.
 */
export async function previewScene(file: string, id: string) {
  const { spec, dir } = loadSpec(file);
  const step = spec.steps.find((s) => s.id === id);
  if (!step?.scene) throw new Error(`no scene step "${id}"`);
  const out = outputDir(file);
  let lines = new Map();
  try {
    lines = readLines(file);
  } catch {
    /* no narration yet: words fall back to the scene's defaults */
  }
  const line = lines.get(id);
  const duration = line ? line.duration + 0.6 : 6;
  const lifts = [path.join(out, 'capture', 'lifts'), path.join(out, 'probe', 'lifts')].find((d) => existsSync(d)) ?? path.join(out, 'capture', 'lifts');
  const src = scenePage(step.scene, dir);
  const app = Object.fromEntries(Object.entries(spec.theme?.app ?? {}).map(([k, v]) => [`app${k[0].toUpperCase()}${k.slice(1)}`, v]));

  const browser = await withChannel((channel) => chromium.launch({ channel, headless: true, args: ['--allow-file-access-from-files'] }));
  try {
    const geo = GEOMETRY[spec.format ?? 'landscape'];
    const page = await browser.newPage({ viewport: { width: geo.width, height: geo.height } });
    // Scenes and backdrops run on a virtual clock the render advances frame by frame.
    await page.addInitScript(CLOCK_SCRIPT);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${STAGE}`);
    await page.evaluate((o) => (window as any).setup(o), {
      ...spec.viewport, theme: spec.theme ?? {}, title: spec.title, appTheme: app, geometry: geo,
      fontsCss: spec.theme?.fonts ? readFileSync(path.resolve(dir, spec.theme.fonts), 'utf8') : '',
      gsapDir: `file://${path.resolve(import.meta.dirname, '..', 'node_modules', 'gsap', 'dist')}`,
      liftDir: `file://${lifts}`,
    });
    const backdrop = resolveBackdrop(spec, step, dir);
    const state = (t: number) => ({ src, base: `file://${path.resolve(dir)}/`, age: t, duration, alpha: 1, data: step.scene!.data, words: line?.words ?? [], backdrop });
    const sounds = (await page.evaluate((s) => (window as any).sceneSounds(s), state(0))) as { t: number; name: string }[];
    const dirOut = path.join(out, 'scenes', id);
    mkdirSync(dirOut, { recursive: true });
    const stills: string[] = [];
    for (let k = 0; k < 8; k++) {
      const t = (duration * (k + 0.5)) / 8;
      await page.evaluate((s) => (window as any).draw(s), { camera: { scale: 1, cx: spec.viewport!.width / 2, cy: spec.viewport!.height / 2 }, t: 4, scene: state(t) });
      const f = path.join(dirOut, `${k}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 82 });
      stills.push(f);
    }
    const { issues, palette, legibility } = await page.evaluate(() => { const w = window as any; return { issues: w.layoutIssues() as string[], palette: w.paletteIssues() as string[], legibility: w.legibilityIssues() as string[] }; });
    const sheet = path.join(dirOut, 'sheet.jpg');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...stills.flatMap((f) => ['-i', f]), '-filter_complex',
      stills.map((_, i) => `[${i}:v]scale=640:-1[v${i}]`).join(';') + ';' + stills.map((_, i) => `[v${i}]`).join('') + 'xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0', sheet]);
    console.log(`scene ${id}: ${duration.toFixed(1)}s${line ? '' : ' (no narration yet: cues fall back)'}`);
    console.log(`  sheet: ${sheet} (8 stills, left to right, top to bottom)`);
    console.log(`  sounds: ${sounds.map((s) => `${s.name}@${s.t.toFixed(2)}`).join(' ') || 'none'}`);
    if (errors.length) console.log(`  errors:\n    ${errors.join('\n    ')}`);
    console.log(issues.length ? `  layout (settled):\n    ${issues.join('\n    ')}` : '  layout: clean');
    console.log(palette.length ? `  palette:\n    ${palette.join('\n    ')}` : '  palette: on brand');
    console.log(legibility.length ? `  legibility:\n    ${legibility.join('\n    ')}` : '  legibility: readable');
  } finally {
    await browser.close();
  }
}
