import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GEOMETRY } from './format.ts';
import { parse } from 'yaml';
import { merge } from './merge.ts';

/** How a step finds an element. The first key present wins. */
export interface Target {
  role?: string;
  name?: string;
  exact?: boolean;
  text?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  css?: string;
  nth?: number;
}

/** A point inside an element's box, as fractions of its width and height (0,0 is the top left). */
export interface Point {
  x: number;
  y: number;
}

export type Action =
  | { goto: string }
  | { click: Target; sync?: string }
  | { hover: Target; sync?: string }
  | { highlight: Target; sync?: string; label?: string }
  | { type: string; into?: Target; sync?: string }
  | { press: string; sync?: string }
  | { scroll: Target; sync?: string }
  /**
   * Presses on the target and drags: on a canvas (draw a shape, connect two), a slider, a card to a column.
   * `from`/`to` are points inside the target's box as fractions (0–1, default the centre); `to` may
   * instead be another target, to drop on its centre. The pointer lands on `from` on the `sync` word.
   */
  | { drag: Target; from?: Point; to: Point | Target; sync?: string }
  | { wait: number }
  | { waitFor: Target }
  | { waitForUrl: string }
  /**
   * Copies the element, as shown, for scenes to animate (`showhow.lift(as)`). Off the clock; nothing
   * visible happens. `container: true` climbs from the target (e.g. a heading) to the card that holds it.
   */
  | { lift: Target; as: string; container?: boolean };

/**
 * The field behind cards and scenes. A built-in shader by name (see the skill for the list), or:
 * `{ shader: x.frag }` a fragment shader of your own; `{ html: x.html }` any page; `{ react: X.jsx,
 * props }` a React component (e.g. a React Bits background, `showhow add reactbits:Name`);
 * `{ hyperframes: block.html, vars }` a HyperFrames block (`showhow add hyperframes:name`). Pages run on
 * a virtual clock, so their own animation renders frame by frame.
 */
export type Backdrop =
  | string
  | { shader: string }
  | { html: string }
  | { react: string; props?: Record<string, unknown>; export?: string }
  | { hyperframes: string; vars?: Record<string, unknown> };

export interface Step {
  id: string;
  /** Short title, shown as the step chip and the guide heading. */
  title?: string;
  /** Narration for this step. */
  say?: string;
  do?: Action[];
  /** A full-screen card instead of the app (intro, outro, steps not recorded). */
  card?: {
    kicker?: string;
    title: string;
    /** Words of the title drawn in the accent gradient. */
    highlight?: string;
    subtitle?: string;
    bullets?: string[];
    start?: number;
    /** `chapter`: a short numbered section opener. */
    style?: 'chapter';
    /** The product shot beside the text: a step id, or false. Defaults to the nearest recorded step. */
    image?: string | false;
  };
  /**
   * A graphic the app has no screen for: an HTML page (relative to the spec) that defines
   * `window.showhowScene({ t, duration, data, theme })` and draws itself as a pure function of t.
   * Rendered full-frame like a card; `data` is passed through.
   */
  scene?: {
    html?: string;
    data?: unknown;
    /** A React component as the scene (props passed in), running on the virtual clock. */
    react?: string;
    props?: Record<string, unknown>;
    export?: string;
    /** A HyperFrames block as the scene: its timeline is seeked like a scene's. */
    hyperframes?: string;
    vars?: Record<string, unknown>;
  };
  /** Groups steps into a chapter (video chapters, YouTube timestamps). The first step of a run starts it. */
  chapter?: string;
  /** Markdown for the written guide only: the detail a reader wants and a viewer would not sit through. */
  guide?: string;
  /** Override the automatic camera: 1 keeps the full frame. */
  zoom?: number;
  /** This card's or scene's backdrop, instead of theme.backdrop. */
  backdrop?: Backdrop;
}

export interface Spec {
  /** Another spec this one overrides: a translation, a variant. Steps merge by id, their actions by position. */
  extends?: string;
  title: string;
  app: string;
  profile?: string;
  /**
   * A local app to start first (a dev server, a demo): run in the spec's folder (or `cwd`), waited for
   * until `url` (default: `app`) answers, stopped at the end. Skipped if something already answers.
   */
  serve?: { command: string; url?: string; cwd?: string; timeout?: number };
  /** A visible window. Needed for sites that turn headless browsers away. */
  headed?: boolean;
  /**
   * Start every probe and recording from an empty browser profile (no cookies, no site storage), for
   * public apps that keep state in the browser: a canvas, a cart, a dismissed banner. Not with `login`.
   */
  fresh?: boolean;
  viewport?: { width: number; height: number; scale: number };
  voice?: {
    provider?: 'elevenlabs' | 'say';
    voice?: string;
    model?: string;
    language?: string;
    /** Written form → spoken form. Scripts and captions keep the written one. */
    pronounce?: Record<string, string>;
  };
  /** A bed under the narration: generated from `prompt` (ElevenLabs) or a `file`. Ducks under the voice. */
  /** How much the bed dips under the voice (compressor ratio, default 8; a trailer wants ~3). */
  music?: { prompt?: string; file?: string; volume?: number; duck?: number };
  /**
   * `trailer`: value, not procedure. No step chips or numbers, no cursor or click ripples, a tighter
   * camera and a slow push on wide shots. Default `tutorial`.
   */
  style?: 'tutorial' | 'trailer';
  /** `vertical` renders 1080×1920 (Reels, Shorts, TikTok); recorded footage becomes a moving portrait crop. */
  format?: 'landscape' | 'vertical';
  /** A small label pinned top right over recorded footage, e.g. "Datos de ejemplo". Replaces the title there. */
  badge?: string;
  theme?: {
    background?: string; background2?: string; accent?: string; text?: string; font?: string;
    /** Text on the accent colour (labels, tags). Default white. */
    onAccent?: string;
    /** The brand's display face for titles (cards, scene headings); `font` is for body text and captions. */
    headingFont?: string;
    /**
     * The brand's other colours (secondary, highlights). With background, accent and text, they are the
     * palette: render warns when a scene or card shows saturated colours outside it.
     */
    palette?: string[];
    /** Behind every card and scene, unless a step picks another. Default `aurora`. */
    backdrop?: Backdrop;
    /** The app's own look, as probe reads it: handed to scenes as theme.app*. */
    app?: { background?: string; surface?: string; text?: string; muted?: string; accent?: string; font?: string; headingFont?: string; radius?: string };
    /** A CSS file of @font-face rules (probe writes one), so the app's fonts render without the app. */
    fonts?: string;
  };
  privacy?: { blur?: string[] };
  mock?: {
    text?: { find: string; replace: string }[];
    /** `texts` relabels the Nth match with the Nth entry: lists of chats, projects, people. */
    set?: { selector: string; text?: string; texts?: string[]; attr?: string; value?: string }[];
    hide?: string[];
    /**
     * `json` answers without the network (inline or a fixture file; `{param}` in the path); `patch`
     * overrides fields of the real response. `:name` URL segments capture; `from`/`until` limit a
     * route to a window of steps. Writes (POST, PUT…) are only mocked when `method` names them.
     */
    routes?: { url: string; method?: string; status?: number; json?: unknown; patch?: unknown; from?: string; until?: string }[];
  };
  /**
   * Where the claims come from, beyond what the app shows: facts the person gave, docs, an API's
   * own description (an MCP server's tool list, an OpenAPI file). For the record and the guide.
   */
  facts?: { text: string; source: string }[];
  /** `compress: false` keeps the high-quality master as tutorial.mp4; a number sets the CRF (default 20). */
  output?: { compress?: boolean | number };
  /** The thumbnail: an intro-style card. Defaults to the first card, with the key moment's screenshot. */
  poster?: { kicker?: string; title?: string; highlight?: string; subtitle?: string; image?: string };
  steps: Step[];
}


export function loadSpec(file: string): { spec: Spec; dir: string } {
  const spec = read(path.resolve(file));
  if (!spec?.steps?.length) throw new Error(`${file}: no steps`);
  const ids = new Set<string>();
  for (const s of spec.steps) {
    if (!s.id) throw new Error(`${file}: a step has no id`);
    if (ids.has(s.id)) throw new Error(`${file}: duplicate step id "${s.id}"`);
    ids.add(s.id);
  }
  // An image that names no step would silently leave the card or poster without its picture.
  const images = [...spec.steps.map((s) => s.card?.image), spec.poster?.image].filter((x): x is string => typeof x === 'string');
  for (const image of images) if (!ids.has(image)) throw new Error(`${file}: image "${image}" is not a step id`);
  spec.viewport ??= GEOMETRY[spec.format ?? 'landscape'].viewport;
  if (spec.format === 'vertical' && spec.viewport.width > spec.viewport.height && spec.steps.some((s) => s.do?.length && !s.card && !s.scene))
    console.warn(`${file}: a vertical video recorded at a landscape viewport (${spec.viewport.width}×${spec.viewport.height}) shows a cropped slice of each page; leave \`viewport\` out (it records at ${GEOMETRY.vertical.viewport.width}×${GEOMETRY.vertical.viewport.height}) or set a portrait one`);
  spec.profile ??= new URL(spec.app).hostname;
  const dir = path.dirname(path.resolve(file));
  // A goto without a scheme is a file next to the spec (a local HTML report, a prototype).
  for (const step of spec.steps) for (const act of step.do ?? []) if ('goto' in act && !/^[a-z][a-z0-9+.-]*:/i.test(act.goto)) act.goto = pathToFileURL(path.resolve(dir, act.goto)).href;
  return { spec, dir };
}

/**
 * In a YAML flow mapping (`{ title: A, b }`) an unquoted comma ends the value: `b` becomes a key with no
 * value and the text is silently cut. A null-valued key containing a space is almost always that.
 */
function warnCutText(node: unknown, file: string, at = '') {
  if (Array.isArray(node)) return node.forEach((v, i) => warnCutText(v, file, `${at}[${i}]`));
  if (typeof node !== 'object' || node === null) return;
  for (const [k, v] of Object.entries(node)) {
    if (v === null && /\s/.test(k)) console.warn(`${path.basename(file)}: "${k}" at ${at || 'top'} looks like text cut by an unquoted comma; quote the value`);
    else warnCutText(v, file, at ? `${at}.${k}` : k);
  }
}

function read(file: string): Spec {
  const own = parse(readFileSync(file, 'utf8')) as Spec;
  warnCutText(own, file);
  if (!own.extends) return own;
  const base = read(path.resolve(path.dirname(file), own.extends));
  const { steps: overrides = [], extends: _, ...rest } = own;
  const merged = merge(base, rest) as Spec;
  // A base without steps is shared settings (app, mocks, theme): the steps are all this file's.
  if (!base.steps?.length) {
    merged.steps = overrides;
    return merged;
  }
  merged.steps = base.steps.map((step) => {
    const o = overrides.find((x) => x.id === step.id);
    return o ? (merge(step, o) as Step) : step;
  });
  const unknown = overrides.filter((o) => !base.steps.some((s) => s.id === o.id));
  if (unknown.length) throw new Error(`${file}: no step ${unknown.map((u) => `"${u.id}"`).join(', ')} in ${own.extends}`);
  return merged;
}

export function actionKind(a: Action): string {
  return Object.keys(a).find((k) => !['sync', 'into', 'label', 'as', 'container', 'from', 'to'].includes(k))!;
}

export function actionTarget(a: Action): Target | undefined {
  if ('click' in a) return a.click;
  if ('hover' in a) return a.hover;
  if ('highlight' in a) return a.highlight;
  if ('scroll' in a) return a.scroll;
  if ('drag' in a) return a.drag;
  if ('type' in a) return a.into;
  return undefined;
}
