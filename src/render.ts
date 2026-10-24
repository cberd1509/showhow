import { chromium } from 'playwright';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadSpec, type Spec } from './spec.ts';
import { outputDir, outputName } from './paths.ts';
import { GEOMETRY } from './format.ts';
import { CLOCK_SCRIPT } from './clock.ts';
import { plainSay, readLines } from './voice.ts';
import { Timeline, captionsOf } from './timeline.ts';
import type { Capture } from './record.ts';

const FPS = 30;
const ASSETS = path.resolve(import.meta.dirname, '..', 'assets');
const STAGE = path.resolve(import.meta.dirname, 'stage.html');
// Shared across tutorials: the same prompt and length is the same track.
const MUSIC_CACHE = path.resolve(import.meta.dirname, '..', '.cache', 'music');

export async function render(file: string, opts: { compress?: boolean } = {}) {
  const { spec, dir } = loadSpec(file);
  const lines = readLines(file);
  const out = outputDir(file);
  const cap: Capture = JSON.parse(readFileSync(path.join(out, 'capture', 'capture.json'), 'utf8'));
  const tl = new Timeline(spec, cap, lines, dir);
  const total = Math.ceil(tl.duration * FPS);
  console.log(`render: ${tl.duration.toFixed(1)}s, ${total} frames`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--allow-file-access-from-files'] });
  const geo = GEOMETRY[spec.format ?? 'landscape'];
  const page = await browser.newPage({ viewport: { width: geo.width, height: geo.height }, deviceScaleFactor: 1 });
  // Scenes and backdrops run on a virtual clock the render advances frame by frame.
  await page.addInitScript(CLOCK_SCRIPT);
  await page.goto(`file://${STAGE}`);
  const app = Object.fromEntries(Object.entries(spec.theme?.app ?? {}).map(([k, v]) => [`app${k[0].toUpperCase()}${k.slice(1)}`, v]));
  const fontsCss = spec.theme?.fonts ? readFileSync(path.resolve(dir, spec.theme.fonts), 'utf8') : '';
  await page.evaluate((o) => (window as any).setup(o), {
    ...cap.viewport, theme: spec.theme ?? {}, title: spec.badge ?? (spec.style === 'trailer' ? '' : spec.title), appTheme: app, fontsCss, geometry: geo,
    gsapDir: `file://${path.resolve(import.meta.dirname, '..', 'node_modules', 'gsap', 'dist')}`,
    liftDir: `file://${path.join(out, 'capture', 'lifts')}`,
  });

  const still = new Timeline(spec, cap, lines, dir);
  // The poster: the intro card fully settled, beside the key moment.
  const first = tl.steps.find((p) => p.step.card);
  const keyStep = spec.poster?.image ?? (first?.step.card?.image || undefined) ?? tl.steps.find((p) => p.n)?.step.id;
  const { image: _, ...posterText } = stripUndefined(spec.poster ?? {});
  const poster = { ...(first ? still.cardState(first, 12, 1) : { title: spec.title, start: 1 }), ...posterText, ...tl.shot(keyStep), age: 12, alpha: 1, bullets: [] };

  // Before spending minutes on frames: every card, chip and the poster,
  // settled, must lay out cleanly.
  const rest = { camera: { scale: 1, cx: cap.viewport.width / 2, cy: cap.viewport.height / 2 }, t: 4 };
  const layouts: [string, object][] = [
    ...tl.steps.filter((p) => p.step.card).map((p): [string, object] => [`card "${p.step.id}"`, { ...rest, card: still.cardState(p, 12, 1) }]),
    ...tl.steps.filter((p) => p.n).map((p): [string, object] => [`step "${p.step.id}"`, { ...rest, chip: { n: p.n, title: p.step.title, alpha: 1 } }]),
    ...tl.steps.filter((p) => p.step.scene).map((p): [string, object] => [`scene "${p.step.id}"`, { ...rest, scene: still.sceneState(p, Math.max(0, p.end - p.start - 0.2), 1) }]),
    ['poster', { ...rest, card: poster }],
  ];
  const problems: string[] = [];
  for (const [what, state] of layouts) {
    await page.evaluate((s) => (window as any).draw(s), state);
    const checks = await page.evaluate(() => { const w = window as any; return { layout: w.layoutIssues() as string[], palette: w.paletteIssues() as string[], legibility: w.legibilityIssues() as string[] }; });
    for (const issue of checks.layout) problems.push(`${what}: ${issue}`);
    for (const w of checks.palette) console.warn(`render: palette: ${what}: ${w}`);
    for (const w of checks.legibility) console.warn(`render: legibility: ${what}: ${w}`);
  }
  if (problems.length) {
    await browser.close();
    throw new Error(`layout check failed — shorten the text or change the card:\n  ${problems.join('\n  ')}`);
  }
  console.log(`render: layout check passed (${layouts.length} cards, chips and poster)`);

  // Sounds a scene schedules land at its time in the video.
  for (const p of tl.steps.filter((x) => x.step.scene)) {
    const cues = (await page.evaluate((s) => (window as any).sceneSounds(s), still.sceneState(p, 0, 0))) as { t: number; name: string; volume?: number }[];
    for (const c of cues) {
      const file = /[./]/.test(c.name) ? path.resolve(dir, c.name) : path.join(ASSETS, 'sfx', `${c.name}.ogg`);
      if (!existsSync(file)) throw new Error(`scene "${p.step.id}": no sound "${c.name}" (built in: ${readdirSync(path.join(ASSETS, 'sfx')).map((f) => f.replace('.ogg', '')).join(', ')})`);
      if (c.t < p.end - p.start) tl.sounds.push({ kind: 'sfx', t: p.start + Math.max(0, c.t), file, volume: c.volume });
    }
  }

  const silent = path.join(out, 'work', 'video.mp4');
  mkdirSync(path.dirname(silent), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((res, rej) => ff.on('close', (code) => (code ? rej(new Error(`ffmpeg exited ${code}`)) : res())));

  const started = Date.now();
  for (let n = 0; n < total; n++) {
    await page.evaluate((s) => (window as any).draw(s), tl.state(n / FPS));
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (n % (FPS * 10) === 0 && n) console.log(`render: ${(n / FPS).toFixed(0)}s (${((Date.now() - started) / n).toFixed(0)} ms/frame)`);
  }
  ff.stdin.end();
  await done;

  // Stills for the guide and the poster, from the same stage, camera at rest.
  const guideDir = path.join(out, 'guide');
  rmSync(guideDir, { recursive: true, force: true });
  mkdirSync(guideDir, { recursive: true });
  const shots: Record<string, string> = {};
  for (const p of tl.steps.filter((x) => x.n)) {
    const target = cap.events.find((e) => e.type === 'target' && e.step === p.step.id);
    const t = target && 't' in target ? tl.out(target.t + 0.6) : p.end - 0.3;
    const s = still.state(Math.min(t, p.end - 0.05), { stillCamera: true });
    s.caption = undefined;
    s.chip = undefined;
    s.ripple = undefined;
    if (target && target.type === 'target') s.ring = { ...target.box, alpha: 1, label: target.label };
    await page.evaluate((st) => (window as any).draw(st), s);
    const shot = path.join(guideDir, `${String(p.n).padStart(2, '0')}-${p.step.id}.png`);
    await page.locator('#window').screenshot({ path: shot });
    shots[p.step.id] = shot;
  }  // Scenes go into the guide as they look when settled.
  for (const p of tl.steps.filter((x) => x.step.scene)) {
    await page.evaluate((st) => (window as any).draw(st), { camera: { scale: 1, cx: cap.viewport.width / 2, cy: cap.viewport.height / 2 }, t: 4, scene: still.sceneState(p, Math.max(0, p.end - p.start - 0.2), 1) });
    const shot = path.join(guideDir, `scene-${p.step.id}.png`);
    await page.screenshot({ path: shot });
    shots[p.step.id] = shot;
  }

  await page.evaluate((s) => (window as any).draw(s), { camera: { scale: 1, cx: 0, cy: 0 }, card: poster, t: 4 });
  await page.screenshot({ path: path.join(out, 'poster.jpg'), type: 'jpeg', quality: 92 });
  await browser.close();

  const name = outputName(file, spec.output?.name);
  // Older renders named everything tutorial.*: don't leave those next to the new files.
  if (name !== 'tutorial') for (const ext of ['mp4', 'srt', 'vtt']) rmSync(path.join(out, `tutorial.${ext}`), { force: true });
  const video = path.join(out, `${name}.mp4`);
  await mixAudio(spec, tl, silent, video, out);
  writeCaptions(tl, lines, out, name);
  embedChapters(tl, video);
  const setting = spec.output?.compress;
  if (opts.compress ?? setting !== false) compress(video, path.join(out, 'work', 'master.mp4'), typeof setting === 'number' ? setting : 20);
  writeGuide(spec, tl, shots, out, name);
  console.log(`render: done in ${((Date.now() - started) / 1000).toFixed(0)}s\n  ${video}\n  ${path.join(out, `${name}.srt`)}\n  ${path.join(out, 'guide.md')}`);
}

async function mixAudio(spec: Spec, tl: Timeline, silent: string, video: string, out: string) {
  const inputs: string[] = ['-i', silent];
  const parts: string[] = [];
  const voice: string[] = [];
  const sfx: string[] = [];
  let i = 1;
  const add = (file: string, t: number, volume: number, into: string[]) => {
    inputs.push('-i', file);
    const ms = Math.max(0, Math.round(t * 1000));
    parts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${volume},adelay=${ms}|${ms}[a${i}]`);
    into.push(`[a${i}]`);
    i++;
  };
  for (const s of tl.sounds) {
    if (s.kind === 'voice') add(s.file!, s.t, 1, voice);
    else if (s.kind === 'click') add(path.join(ASSETS, 'click.ogg'), s.t, 0.35, sfx);
    else if (s.kind === 'sfx') add(s.file!, s.t, s.volume ?? 0.3, sfx);
    else add(path.join(ASSETS, `keypress-00${1 + Math.floor(Math.random() * 4)}.wav`), s.t, 0.12, sfx);
  }
  const bus = (labels: string[], name: string) =>
    parts.push(labels.length > 1 ? `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[${name}]` : `${labels[0]}anull[${name}]`);

  const final: string[] = [];
  if (voice.length) bus(voice, 'voice');
  if (sfx.length) {
    bus(sfx, 'sfx');
    final.push('[sfx]');
  }
  const music = await musicFile(spec, tl.duration, out);
  if (music) {
    const d = tl.duration.toFixed(3);
    inputs.push('-stream_loop', '-1', '-i', music);
    // A bed, not a soundtrack: fades at both ends, and dips while anyone speaks.
    parts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${d},volume=${spec.music?.volume ?? 0.22},afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, tl.duration - 2.5).toFixed(3)}:d=2.5[bed]`);
    if (voice.length) {
      parts.push('[voice]asplit=2[vo][key]');
      parts.push(`[bed][key]sidechaincompress=threshold=0.015:ratio=${spec.music?.duck ?? 8}:attack=40:release=600:makeup=1[ducked]`);
      final.push('[vo]', '[ducked]');
    } else final.push('[bed]');
    i++;
  } else if (voice.length) final.push('[voice]');

  if (!final.length) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-c', 'copy', video]);
    return;
  }
  parts.push(`${final.join('')}amix=inputs=${final.length}:normalize=0:dropout_transition=0[premix]`);

  // Two-pass loudness: measure, then one linear gain to -16 LUFS (voice-led
  // web video), true peak under -1.5 dB. Linear keeps the ducking intact.
  const target = 'I=-16:TP=-1.5:LRA=11';
  const script = path.join(path.dirname(silent), 'mix.txt');
  writeFileSync(script, [...parts, `[premix]loudnorm=${target}:print_format=json[mix]`].join(';\n'));
  const pass1 = spawnSync('ffmpeg', ['-y', '-hide_banner', ...inputs, '-filter_complex_script', script, '-map', '[mix]', '-t', tl.duration.toFixed(3), '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1));
  const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  writeFileSync(script, [...parts, `[premix]loudnorm=${target}:${measured},aresample=48000[mix]`].join(';\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', script, '-map', '0:v', '-map', '[mix]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', tl.duration.toFixed(3), video]);
}

/**
 * The music bed: a file, or ElevenLabs Music from a prompt. Generated a few
 * seconds long in 10s steps and cached by prompt, so re-renders and small
 * timing changes reuse it; shorter-than-video tracks loop.
 */
async function musicFile(spec: Spec, duration: number, out: string): Promise<string | undefined> {
  const m = spec.music;
  if (!m) return undefined;
  if (m.file) return path.resolve(path.dirname(path.dirname(out)), m.file); // relative to the spec
  if (!m.prompt) return undefined;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.warn('render: music.prompt needs ELEVENLABS_API_KEY; rendering without music');
    return undefined;
  }
  const length = Math.min(600, Math.ceil((duration + 3) / 10) * 10);
  const hash = createHash('sha1').update(m.prompt).digest('hex').slice(0, 12);
  mkdirSync(MUSIC_CACHE, { recursive: true });
  // Any track already made from this prompt that is long enough: one prompt,
  // one song, so every video in a series (and every language) shares it.
  const cached = readdirSync(MUSIC_CACHE)
    .map((f) => f.match(new RegExp(`^${hash}-(\\d+)s\\.mp3$`)))
    .filter((x): x is RegExpMatchArray => !!x && Number(x[1]) >= length)
    .sort((a, b) => Number(a[1]) - Number(b[1]))[0];
  if (cached) return path.join(MUSIC_CACHE, cached[0]);
  const file = path.join(MUSIC_CACHE, `${hash}-${length}s.mp3`);
  // A shorter track from the same prompt is extended rather than paid for
  // again: repeats joined with a long crossfade, so there is no seam.
  const shorter = readdirSync(MUSIC_CACHE)
    .map((f) => f.match(new RegExp(`^${hash}-(\\d+)s\\.mp3$`)))
    .filter((x): x is RegExpMatchArray => !!x && Number(x[1]) >= 60)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (shorter) {
    const src = path.join(MUSIC_CACHE, shorter[0]);
    const fade = 6;
    const copies = Math.ceil((length - fade) / (Number(shorter[1]) - fade));
    const ins = Array.from({ length: copies }, () => ['-i', src]).flat();
    let graph = '[0:a]anull[m0]';
    for (let k = 1; k < copies; k++) graph += `;[m${k - 1}][${k}:a]acrossfade=d=${fade}:c1=tri:c2=tri[m${k}]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', graph, '-map', `[m${copies - 1}]`, '-t', String(length), '-b:a', '160k', file]);
    console.log(`render: extended the ${shorter[1]}s track to ${length}s (no new composition)`);
    return file;
  }
  console.log(`render: composing ${length}s of music`);
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: m.prompt, music_length_ms: length * 1000, force_instrumental: true }),
  });
  if (!res.ok) throw new Error(`ElevenLabs music ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/**
 * A web-sized copy: x264 at the given CRF, slow preset (UI video is mostly
 * still, which x264 compresses very well), 128k audio, chapters kept. The
 * master moves to work/; if the copy is not smaller, the master stays.
 */
function compress(video: string, master: string, crf: number) {
  const small = video.replace(/\.mp4$/, '.small.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-map', '0:v', '-map', '0:a', '-map_metadata', '0', '-map_chapters', '0',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', small]);
  const before = statSync(video).size;
  const after = statSync(small).size;
  if (after >= before) {
    rmSync(small);
    console.log('render: compression saved nothing; keeping the master');
    return;
  }
  renameSync(video, master);
  renameSync(small, video);
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  console.log(`render: compressed ${mb(before)} → ${mb(after)} (CRF ${crf}); master in ${path.relative(path.dirname(path.dirname(master)), master)}`);
}

/** Chapters inside the MP4 itself: QuickTime, VLC, IINA and most players show them (YouTube does not). */
function embedChapters(tl: Timeline, video: string) {
  const meta = [';FFMETADATA1', ...tl.chapters().map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, (m) => `\\${m}`)}`)].join('\n');
  const metaFile = `${video}.chapters.txt`;
  const tmp = video.replace(/\.mp4$/, '.tmp.mp4');
  writeFileSync(metaFile, meta + '\n');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', metaFile, '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', tmp]);
  renameSync(tmp, video);
  rmSync(metaFile);
}

const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

function writeCaptions(tl: Timeline, lines: ReturnType<typeof readLines>, out: string, name: string) {
  const groups = captionsOf(tl, lines);
  const stamp = (t: number, sep: string) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
  };
  writeFileSync(path.join(out, `${name}.srt`), groups.map((g, i) => `${i + 1}\n${stamp(g.t0, ',')} --> ${stamp(g.t1, ',')}\n${g.text}\n`).join('\n'));
  writeFileSync(path.join(out, `${name}.vtt`), `WEBVTT\n\n${groups.map((g) => `${stamp(g.t0, '.')} --> ${stamp(g.t1, '.')}\n${g.text}\n`).join('\n')}`);
  // YouTube reads chapters from the description, under its rules; players
  // that read WebVTT chapter tracks get the full list.
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const yt = tl.chapters({ youtube: true });
  writeFileSync(path.join(out, 'chapters.txt'), yt.map((c) => `${mmss(c.start)} ${c.title}`).join('\n') + '\n');
  if (yt.length < 3) console.warn(`render: ${yt.length} chapter(s) — YouTube needs at least 3 of 10s or more to show them`);
  const all = tl.chapters();
  writeFileSync(path.join(out, 'chapters.vtt'), `WEBVTT\n\n${all.map((c, i) => `${i + 1}\n${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.title}\n`).join('\n')}`);
}

function writeGuide(spec: ReturnType<typeof loadSpec>['spec'], tl: Timeline, shots: Record<string, string>, out: string, name: string) {
  const md = [`# ${spec.title}`, ''];
  const intro = tl.steps[0]?.step.card;
  if (intro?.subtitle) md.push(intro.subtitle, '');
  if (tl.steps[0]?.step.guide) md.push(tl.steps[0].step.guide.trim(), '');
  md.push(`![Video](${name}.mp4)`, '');
  const grouped = tl.steps.some((p) => p.step.chapter);
  let chapter: string | undefined;
  for (const p of tl.steps.slice(1)) {
    const step = p.step;
    // Chapters become sections, so a long guide reads as one.
    if (grouped && step.chapter && step.chapter !== chapter) {
      chapter = step.chapter;
      md.push(`## ${chapter}`, '');
    }
    const h = grouped ? '###' : '##';
    if (p.n) {
      md.push(`${h} ${p.n}. ${step.title}`, '');
      if (step.say) md.push(plainSay(step.say), '');
      const shot = shots[step.id];
      if (shot) md.push(`![${step.title}](${path.relative(out, shot)})`, '');
    } else if (step.scene) {
      if (step.title) md.push(`${h} ${step.title}`, '');
      if (step.say) md.push(plainSay(step.say), '');
      const shot = shots[step.id];
      if (shot) md.push(`![${step.title ?? step.id}](${path.relative(out, shot)})`, '');
    } else if (step.card && step.card.style !== 'chapter') {
      md.push(`${h} ${step.card.title}`, '');
      if (step.card.subtitle) md.push(step.card.subtitle, '');
      (step.card.bullets ?? []).forEach((b, i) => md.push(`${(step.card!.start ?? 1) + i}. ${b}`));
      if (step.card.bullets?.length) md.push('');
      if (step.say && !step.guide) md.push(plainSay(step.say), '');
    }
    if (step.guide) md.push(step.guide.trim(), '');
  }
  if (spec.facts?.length) {
    md.push('---', '', '<details><summary>Sources</summary>', '');
    for (const f of spec.facts) md.push(`- ${f.text} — *${f.source}*`);
    md.push('', '</details>', '');
  }
  writeFileSync(path.join(out, 'guide.md'), md.join('\n'));
}
