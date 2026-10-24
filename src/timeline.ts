import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Spec, Step } from './spec.ts';
import { GEOMETRY } from './format.ts';
import { blockPage, reactPage } from './bundle.ts';
import type { Capture } from './record.ts';
import type { Box, Event } from './runner.ts';
import type { Line } from './voice.ts';

/**
 * Maps the recording onto the video. Capture time is the wall clock of the
 * recording; output time skips the cuts (page loads). Every visual decision
 * is a function of output time, so any frame can be drawn in any order —
 * except the camera, which is a spring and is advanced frame by frame.
 */

const FADE = 0.35;
const SCENES = path.resolve(import.meta.dirname, '..', 'scenes');
const CAMERA_OMEGA = 6.5;
const MAX_ZOOM = 1.6;

type Cam = { scale: number; cx: number; cy: number };
// The event of a type; works for shapes shared by several types (step-start | step-end).
type Ev<T extends Event['type']> = Event extends infer E ? (E extends { type: infer K } ? (T extends K ? E & { type: T } : never) : never) : never;

export interface DrawState {
  frame?: string;
  fadeFrom?: string;
  fadeAlpha?: number;
  /** The outgoing frame's own camera, so a dissolve doesn't reframe the old page. */
  fadeCamera?: Cam;
  camera: Cam;
  cursor?: { x: number; y: number; down: boolean };
  ripple?: { x: number; y: number; p: number };
  ring?: Box & { alpha: number; label?: string };
  chip?: { n: number; title: string; alpha: number };
  caption?: string;
  card?: CardState;
  scene?: { src: string; age: number; duration: number; alpha: number; data?: unknown; words: { word: string; start: number; end: number }[]; base: string; key?: string; backdrop?: StageBackdrop };
  /** Output time, for anything that just flows (the aurora). */
  t?: number;
}

export type CardState = Omit<NonNullable<Step['card']>, 'image'> & {
  alpha: number;
  start: number;
  age: number;
  number?: number;
  image?: string;
  ring?: Box;
  backdrop?: StageBackdrop;
};

/** A built-in backdrop's name, a shader file (its path, for caching, and its source), or a page. */
export type StageBackdrop = string | { name: string; src: string } | { url: string };

type PageSource = { html?: string; react?: string; props?: unknown; export?: string; hyperframes?: string; vars?: Record<string, unknown> };

/** A full-frame page (scene or backdrop): a React component, a HyperFrames block, or an HTML file (`showhow:name` is a built-in scene). */
function pageUrl(src: PageSource, specDir: string): string | undefined {
  if (src.react) return reactPage(path.resolve(specDir, src.react), src.props, src.export);
  if (src.hyperframes) return blockPage(path.resolve(specDir, src.hyperframes), src.vars);
  if (!src.html) return undefined;
  return pathToFileURL(src.html.startsWith('showhow:') ? path.join(SCENES, `${src.html.slice(8)}.html`) : path.resolve(specDir, src.html)).href;
}

/** The page a scene step shows. */
export function scenePage(sc: NonNullable<Step['scene']>, specDir: string): string {
  const url = pageUrl(sc, specDir);
  if (!url) throw new Error('a scene needs html, react or hyperframes');
  return url;
}

/** The step's backdrop, else the theme's, else the aurora; a shader file is read for the stage. */
export function resolveBackdrop(spec: Spec, step: Step, specDir: string): StageBackdrop {
  const b = step.backdrop ?? spec.theme?.backdrop ?? 'aurora';
  if (typeof b === 'string') return b;
  if ('shader' in b) {
    const file = path.resolve(specDir, b.shader);
    return { name: file, src: readFileSync(file, 'utf8') };
  }
  return { url: pageUrl(b, specDir)! };
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

export interface Placed {
  step: Step;
  start: number;
  end: number;
  capStart: number;
  capEnd: number;
  n?: number;
}

export class Timeline {
  readonly duration: number;
  readonly steps: Placed[] = [];
  readonly sounds: { kind: 'voice' | 'click' | 'key' | 'sfx'; t: number; file?: string; volume?: number }[] = [];
  private segments: { c0: number; c1: number; o0: number }[] = [];
  private frames: Capture['frames'];
  private W: number;
  private H: number;
  private captions: { t0: number; t1: number; text: string }[] = [];
  private cam: Cam;
  private vel = { scale: 0, cx: 0, cy: 0 };
  private camT = 0;
  private camStep?: Placed;
  private fadeCam?: Cam;

  private spec: Spec;
  private cap: Capture;
  private specDir: string;
  private trailer: boolean;
  /** The page area the window shows at scale 1 (the window covers the page; a portrait one crops it). */
  private vis: { w: number; h: number };
  private lines: Map<string, Line>;

  constructor(spec: Spec, cap: Capture, lines: Map<string, Line>, specDir = '.') {
    this.spec = spec;
    this.cap = cap;
    this.specDir = specDir;
    this.trailer = spec.style === 'trailer';
    const win = GEOMETRY[spec.format ?? 'landscape'].window;
    const cover = Math.max(win.w / cap.viewport.width, win.h / cap.viewport.height);
    this.vis = { w: win.w / cover, h: win.h / cover };
    this.lines = lines;
    this.W = cap.viewport.width;
    this.H = cap.viewport.height;
    this.cam = { scale: 1, cx: this.W / 2, cy: this.H / 2 };
    this.frames = [...cap.frames].sort((a, b) => a.t - b.t);

    const starts = this.of('step-start');
    const ends = this.of('step-end');
    const c0 = starts[0].t;
    const cEnd = ends[ends.length - 1].t;
    let o = 0;
    let at = c0;
    for (const cut of this.of('cut').filter((c) => c.t1 > c0).sort((a, b) => a.t0 - b.t0)) {
      if (cut.t0 > at) {
        this.segments.push({ c0: at, c1: cut.t0, o0: o });
        o += cut.t0 - at;
      }
      at = Math.max(at, cut.t1);
    }
    this.segments.push({ c0: at, c1: cEnd, o0: o });
    this.duration = o + (cEnd - at) + 0.4;

    let n = 0;
    for (const step of spec.steps) {
      const s = starts.find((e) => e.step === step.id);
      const e = ends.find((x) => x.step === step.id);
      if (!s || !e) continue;
      const placed: Placed = { step, start: this.out(s.t), end: this.out(e.t), capStart: s.t, capEnd: e.t };
      if (step.title && !step.card && !step.scene) placed.n = ++n;
      this.steps.push(placed);

      const line = lines.get(step.id);
      if (line) {
        this.sounds.push({ kind: 'voice', t: placed.start, file: line.file });
        this.captions.push(...captionGroups(line, placed.start));
      }
    }
    for (const c of this.of('click')) if (!this.inCut(c.t)) this.sounds.push({ kind: 'click', t: this.out(c.t) });
    for (const ty of this.of('type')) {
      for (let t = ty.t0; t < ty.t1; t += 0.085) this.sounds.push({ kind: 'key', t: this.out(t) });
    }
  }

  private of<T extends Event['type']>(type: T): Ev<T>[] {
    return this.cap.events.filter((e): e is Ev<T> => e.type === type);
  }

  private inCut(t: number) {
    return this.of('cut').some((c) => t > c.t0 && t < c.t1);
  }

  /** Capture time → output time. Inside a cut, the cut's end. */
  out(t: number): number {
    for (const s of this.segments) if (t <= s.c1) return s.o0 + Math.max(0, t - s.c0);
    const last = this.segments[this.segments.length - 1];
    return last.o0 + (last.c1 - last.c0);
  }

  /** Output time → capture time. */
  capture(t: number): number {
    let seg = this.segments[0];
    for (const s of this.segments) if (t >= s.o0) seg = s;
    return Math.min(seg.c0 + (t - seg.o0), seg.c1);
  }

  private frameAt(c: number): string | undefined {
    let lo = 0;
    let hi = this.frames.length - 1;
    let hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= c) {
        hit = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const f = this.frames[Math.max(0, hit)];
    return f ? `file://${f.file}` : undefined;
  }

  private stepAt(t: number): Placed | undefined {
    const hit = this.steps.find((p) => t >= p.start && t < p.end);
    if (hit) return hit;
    // Between two steps (a few hundredths of a second where one ends before the next starts) the
    // earlier one holds: a gap would show whatever the browser was left on.
    return this.steps.filter((p) => p.start <= t).at(-1) ?? this.steps[0];
  }

  /** Where the camera wants to be: on the latest target, until something makes that box stale. */
  private desired(c: number, t: number, opening = false): Cam {
    let placed = this.stepAt(t);
    // While a card fades out over the next beat, that beat is the one being framed.
    if (opening && placed && (placed.step.card || placed.step.scene)) placed = this.steps[this.steps.indexOf(placed) + 1] ?? placed;
    // A step with no targets of its own is a look at the whole screen.
    const own = placed ? this.of('target').filter((e) => e.t >= placed.capStart && e.t <= placed.capEnd) : [];
    // A portrait window shows a slice of the page: the wide shot is the slice where the step acts on
    // the page now showing (after a navigation, the next target; a box from the last page is stale).
    const shown = Math.max(placed?.capStart ?? 0, ...[...this.of('page'), ...this.of('reset')].map((e) => e.t).filter((x) => x <= c), ...this.of('cut').map((x) => x.t1).filter((x) => x <= c));
    const here = own.find((e) => e.t >= shown) ?? own.filter((e) => e.t <= c).at(-1);
    const slice = this.vis.w < this.W * 0.9 && here ? here.box : null;
    const wide = (scale: number) => {
      const hw = this.vis.w / (2 * scale);
      return { scale, cx: slice ? Math.min(this.W - hw, Math.max(hw, slice.x + Math.min(slice.w, this.vis.w) / 2)) : this.W / 2, cy: this.H / 2 };
    };
    const full = wide(1);
    if (!placed || placed.step.card || placed.step.scene || placed.step.zoom === 1) return full;
    // A trailer never sits still on a wide shot: a slow push across the step.
    const drift = this.trailer && !opening ? wide(1 + 0.06 * Math.min(1, Math.max(0, (t - placed.start) / Math.max(1, placed.end - placed.start)))) : full;
    if (opening) return full;
    if (!own.length) return drift;
    const target = this.of('target').filter((e) => e.t - 0.45 <= c).at(-1);
    if (!target) return drift;
    // A target goes stale with a new tab, a scroll, or a navigation (a cut): its box was on another page.
    const stale = [...this.of('page'), ...this.of('reset')].some((e) => e.t > target.t && e.t <= c) || this.of('cut').some((x) => x.t0 >= target.t && x.t1 <= c);
    if (stale) return drift;
    return this.zoomOn(target.box, placed.step.zoom);
  }

  private zoomOn(b: Box, fixed?: number): Cam {
    // A trailer frames the proof tighter: the element fills more of the shot.
    const fill = this.trailer ? 0.6 : 0.42;
    const max = Math.min(GEOMETRY[this.spec.format ?? 'landscape'].maxZoom ?? Infinity, this.trailer ? 2.1 : MAX_ZOOM);
    const scale = fixed ?? Math.min(max, Math.max(1, Math.min((fill * this.vis.w) / b.w, (fill * this.vis.h) / b.h)));
    const hw = this.vis.w / (2 * scale);
    const hh = this.vis.h / (2 * scale);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    // Wider (or taller) than the shot: frame from the start, where a row's label is, not the middle.
    const cx = b.w * scale > this.vis.w * 0.9 ? b.x - 16 + hw : b.x + b.w / 2;
    const cy = b.h * scale > this.vis.h * 0.9 ? b.y - 16 + hh : b.y + b.h / 2;
    return { scale, cx: clamp(cx, hw, this.W - hw), cy: clamp(cy, hh, this.H - hh) };
  }

  /** Critically damped spring toward the desired camera. Call with increasing t. */
  private advanceCamera(t: number, c: number, mode?: 'hold' | 'snap'): Cam {
    if (mode === 'hold') {
      this.camT = t;
      return { ...this.cam };
    }
    if (mode === 'snap') {
      this.fadeCam = { ...this.cam };
      // Where this beat starts: its own wide shot (targets come in a beat later).
      this.cam = { ...this.desired(c, t, true) };
      this.vel = { scale: 0, cx: 0, cy: 0 };
      this.camT = t;
      return { ...this.cam };
    }
    const goal = this.desired(c, t);
    const steps = Math.max(1, Math.round((t - this.camT) * 240));
    const dt = (t - this.camT) / steps;
    for (let i = 0; i < steps; i++) {
      for (const k of ['scale', 'cx', 'cy'] as const) {
        const a = CAMERA_OMEGA ** 2 * (goal[k] - this.cam[k]) - 2 * CAMERA_OMEGA * this.vel[k];
        this.vel[k] += a * dt;
        this.cam[k] += this.vel[k] * dt;
      }
    }
    this.camT = t;
    return { ...this.cam };
  }

  state(t: number, opts: { stillCamera?: boolean } = {}): DrawState {
    let c = this.capture(t);
    const placed = this.stepAt(t);
    const i = placed ? this.steps.indexOf(placed) : -1;
    const fullFrame = (p?: Placed) => !!p && !!(p.step.card || p.step.scene);
    // Behind a card or scene the browser shows whatever it was left on (a blank tab, the last page
    // at the wrong zoom). Never let that through: while it fades in, hold the previous beat exactly
    // as it was; while it fades out, the next beat's opening frame is already underneath.
    let camMode: 'hold' | 'snap' | undefined;
    if (placed && fullFrame(placed)) {
      const prev = this.steps[i - 1], next = this.steps[i + 1];
      if (next && !fullFrame(next) && t > placed.end - FADE * 1.5) {
        c = next.capStart + 0.02;
        camMode = 'snap';
      } else if (prev && !fullFrame(prev)) {
        c = prev.capEnd - 0.02;
        camMode = 'hold';
      }
    }
    // A recorded beat that opens on a new page starts from its own framing: the camera does not fly
    // across the new page from where the old one was zoomed. The old page dissolves at its own camera.
    if (placed && !fullFrame(placed) && placed !== this.camStep) {
      const prev = this.steps[i - 1];
      const cut = this.of('cut').some((x) => prev && x.t0 >= prev.capEnd - 0.05 && x.t1 <= placed.capStart + 0.05);
      if (cut || fullFrame(prev)) camMode = 'snap';
      this.camStep = placed;
    }
    const s: DrawState = {
      frame: this.frameAt(c),
      camera: opts.stillCamera ? { scale: 1, cx: this.W / 2, cy: this.H / 2 } : this.advanceCamera(t, c, camMode),
    };

    // Crossfade over a cut, so a page load reads as a transition, not a jump. Not after a card or
    // scene: its own fade-out already brought this page in, and the frame before the cut is whatever
    // sat behind it.
    const afterFull = placed && i > 0 && fullFrame(this.steps[i - 1]) && t - placed.start < FADE * 2;
    for (const seg of afterFull ? [] : this.segments.slice(1)) {
      const k = (t - seg.o0) / FADE;
      if (k >= 0 && k < 1) {
        s.fadeFrom = this.frameAt(seg.o0 > 0 ? this.capture(seg.o0 - 0.001) : seg.c0);
        s.fadeAlpha = 1 - smooth(k);
        if (this.fadeCam && !opts.stillCamera) s.fadeCamera = this.fadeCam;
      }
    }

    const move = this.of('move').filter((m) => m.t0 <= c).at(-1);
    // A new tab starts without a pointer; it reappears with the next move.
    const tabSwitch = move && this.of('page').some((p) => p.t > move.t1 && p.t <= c);
    if (move && !this.trailer && !placed?.step.card && !placed?.step.scene && !tabSwitch) {
      const k = move.t1 > move.t0 ? Math.min(1, (c - move.t0) / (move.t1 - move.t0)) : 1;
      const e = easeInOut(k);
      const down = this.of('click').some((x) => c >= x.t - 0.08 && c <= x.t + 0.06);
      s.cursor = { x: move.from.x + (move.to.x - move.from.x) * e, y: move.from.y + (move.to.y - move.from.y) * e, down };
    }
    const click = this.of('click').filter((x) => x.t <= c && c - x.t < 0.5).at(-1);
    if (click && !this.trailer) s.ripple = { x: click.at.x, y: click.at.y, p: (c - click.t) / 0.5 };

    // The beat whose footage is on screen: the previous one while a card or scene fades in over it.
    const shown = camMode === 'hold' ? this.steps[i - 1] : placed;
    if (shown && !fullFrame(shown)) {
      // The latest box (the element may have moved), faded in from the first. Held as it was at the end.
      const hls = this.of('target').filter((e) => e.kind === 'highlight' && e.t <= c && e.t >= shown.capStart);
      const hl = hls.at(-1);
      // Before a card or scene the ring stays to the end: the scene fading in is its exit, and an
      // early fade would brighten the page just before it is covered.
      const nextFull = fullFrame(this.steps[this.steps.indexOf(shown) + 1]);
      if (hl) s.ring = { ...hl.box, label: hl.label, alpha: fadeInOut(c, hls[0].t, nextFull ? Infinity : shown.capEnd, 0.25) };
    }
    if (placed) {
      if (placed.n && placed.step.title && !this.trailer) s.chip = { n: placed.n, title: placed.step.title, alpha: fadeInOut(t, placed.start, placed.end, 0.25) };
      if (placed.step.scene) {
        const i = this.steps.indexOf(placed);
        const prevFull = i > 0 && (this.steps[i - 1].step.card || this.steps[i - 1].step.scene);
        const next = this.steps[i + 1];
        const nextFull = !next || next.step.card || next.step.scene;
        const alpha = Math.min(i === 0 || prevFull ? 1 : smooth((t - placed.start) / FADE), nextFull ? 1 : smooth((placed.end - t) / FADE));
        s.scene = this.sceneState(placed, t - placed.start, Math.max(0, Math.min(1, alpha)));
      }
      if (placed.step.card) {
        const first = placed === this.steps[0];
        const next = this.steps[this.steps.indexOf(placed) + 1];
        const nextIsCard = !next || next.step.card || next.step.scene;
        const alpha = Math.min(first ? 1 : smooth((t - placed.start) / FADE), nextIsCard ? 1 : smooth((placed.end - t) / FADE));
        s.card = this.cardState(placed, t - placed.start, Math.max(0, Math.min(1, alpha)));
      }
    }
    s.caption = this.captions.find((g) => t >= g.t0 && t < g.t1)?.text;
    s.t = t;
    return s;
  }

  sceneState(placed: Placed, age: number, alpha: number): NonNullable<DrawState['scene']> {
    const sc = placed.step.scene!;
    const words = this.lines.get(placed.step.id)?.words ?? [];
    return { key: placed.step.id, src: this.resolved(placed.step).scene!, base: `file://${path.resolve(this.specDir)}/`, age, duration: placed.end - placed.start, alpha, data: sc.data, words, backdrop: this.backdrop(placed.step) };
  }

  cardState(placed: Placed, age: number, alpha: number): CardState {
    const c = placed.step.card!;
    const { image: _, ...rest } = c;
    const shot = c.style === 'chapter' || c.image === false ? {} : this.shot(c.image || this.nearestRecorded(placed));
    const number = c.style === 'chapter' ? this.steps.filter((p) => p.step.card?.style === 'chapter').indexOf(placed) + 1 : undefined;
    return { ...rest, start: c.start ?? 1, alpha, age, number, ...shot, backdrop: this.backdrop(placed.step) };
  }

  /** The step's backdrop for the stage: a built-in name, or a shader file's source. */
  private backdrop(step: Step): StageBackdrop {
    return this.resolved(step).backdrop;
  }

  /** A step's scene page and backdrop, resolved once (files read, components bundled), not every frame. */
  private pages = new Map<string, { scene?: string; backdrop: StageBackdrop }>();
  private resolved(step: Step) {
    let r = this.pages.get(step.id);
    if (!r) this.pages.set(step.id, (r = { scene: step.scene ? scenePage(step.scene, this.specDir) : undefined, backdrop: resolveBackdrop(this.spec, step, this.specDir) }));
    return r;
  }

  /** The intro shows the first recorded step; any later card, the one before it. */
  private nearestRecorded(placed: Placed): string | undefined {
    const i = this.steps.indexOf(placed);
    const recorded = (p: Placed) => !p.step.card;
    const before = this.steps.slice(0, i).reverse().find(recorded);
    return (before ?? this.steps.find(recorded))?.step.id;
  }

  /** A step's key moment: its highlight (else its first target) settled, ringed. */
  shot(stepId?: string): { image?: string; ring?: Box } {
    const p = this.steps.find((x) => x.step.id === stepId);
    if (!p) return {};
    const own = this.of('target').filter((e) => e.t >= p.capStart && e.t <= p.capEnd);
    const target = own.filter((e) => e.kind === 'highlight').at(-1) ?? own[0];
    const c = target ? Math.min(target.t + 0.6, p.capEnd - 0.05) : p.capEnd - 0.3;
    return { image: this.frameAt(c), ring: target?.box };
  }

  /**
   * Chapters: runs of steps sharing `chapter`, or else the intro and every
   * titled step. `youtube` applies YouTube's rules: the first at 0:00, none
   * under 10 seconds (merged into the one before).
   */
  chapters(opts: { youtube?: boolean } = {}): Chapter[] {
    const grouped = this.steps.some((p) => p.step.chapter);
    const out: Chapter[] = [];
    for (const p of this.steps) {
      const title = grouped ? p.step.chapter : p.n ? p.step.title : p === this.steps[0] ? (p.step.card?.title ?? 'Intro') : undefined;
      if (!title || out.at(-1)?.title === title) continue;
      out.push({ title, start: p.start, end: 0 });
    }
    if (!out.length) out.push({ title: this.spec.title, start: 0, end: 0 });
    out[0].start = 0;
    out.forEach((c, i) => (c.end = out[i + 1]?.start ?? this.duration));
    if (!opts.youtube) return out;
    // Forward: a chapter takes in what follows until it is 10 seconds long.
    const merged: Chapter[] = [];
    for (const c of out) {
      const last = merged.at(-1);
      if (last && last.end - last.start < 10) last.end = c.end;
      else merged.push({ ...c });
    }
    const tail = merged.at(-1)!;
    if (merged.length > 1 && tail.end - tail.start < 10) merged[merged.length - 2].end = merged.pop()!.end;
    return merged;
  }
}

function captionGroups(line: Line, offset: number) {
  const groups: { t0: number; t1: number; text: string }[] = [];
  let cur: Line['words'] = [];
  const flush = () => {
    if (!cur.length) return;
    groups.push({ t0: offset + cur[0].start, t1: offset + cur[cur.length - 1].end + 0.3, text: cur.map((w) => w.word).join(' ') });
    cur = [];
  };
  line.words.forEach((w, i) => {
    cur.push(w);
    const next = line.words[i + 1];
    const pause = next ? next.start - w.end > 0.45 : true;
    if (cur.length >= 8 || pause || (/[.!?;:,]$/.test(w.word) && cur.length >= 4)) flush();
  });
  flush();
  // Hold each group until the next starts, if the gap is short.
  for (let i = 0; i < groups.length - 1; i++) if (groups[i + 1].t0 - groups[i].t1 < 0.5) groups[i].t1 = groups[i + 1].t0;
  return groups;
}

export function captionsOf(tl: Timeline, lines: Map<string, Line>) {
  return tl.steps.flatMap((p) => {
    const line = lines.get(p.step.id);
    return line ? captionGroups(line, p.start) : [];
  });
}

const smooth = (k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const fadeInOut = (t: number, a: number, b: number, d: number) => Math.max(0, Math.min(smooth((t - a) / d), smooth((b - t) / d)));
