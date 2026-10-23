import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { activePage, applyPrivacy, launch } from './browser.ts';
import { loadSpec } from './spec.ts';
import { outputDir } from './paths.ts';
import { readLines } from './voice.ts';
import { Runner } from './runner.ts';

export interface Capture {
  viewport: { width: number; height: number; scale: number };
  frames: { file: string; t: number }[];
  events: Runner['events'];
}

export async function record(file: string, opts: { headed: boolean }) {
  const { spec, dir } = loadSpec(file);
  const lines = readLines(file);
  const out = path.join(outputDir(file), 'capture');
  rmSync(out, { recursive: true, force: true });

  const context = await launch({ profile: spec.profile!, headless: !(opts.headed || spec.headed), viewport: spec.viewport });
  const runner = new Runner(context, spec, { paced: true, frameDir: path.join(out, 'frames'), liftDir: path.join(out, 'lifts') });
  try {
    await applyPrivacy(context, spec, dir, () => runner.step);
    await runner.start(await activePage(context));
    for (const step of spec.steps) {
      console.log(`record: ${step.id}`);
      await runner.runStep(step, lines.get(step.id));
    }
  } finally {
    await runner.stop();
    await context.close();
  }

  const capture: Capture = { viewport: spec.viewport!, frames: runner.frames, events: runner.events };
  writeFileSync(path.join(out, 'capture.json'), JSON.stringify(capture, null, 2));
  const end = runner.events.at(-1);
  console.log(`record: ${runner.frames.length} frames over ${end && 't' in end ? end.t.toFixed(1) : '?'}s → ${out}`);
}
