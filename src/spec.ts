import { readFileSync } from 'node:fs';
import path from 'node:path';
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

export type Action =
  | { goto: string }
  | { click: Target; sync?: string }
  | { hover: Target; sync?: string }
  | { highlight: Target; sync?: string; label?: string }
  | { type: string; into?: Target; sync?: string }
  | { press: string }
  | { scroll: Target; sync?: string }
  | { wait: number }
  | { waitFor: Target }
  | { waitForUrl: string }
  /**
   * Copies the element, as shown, for scenes to animate (`showhow.lift(as)`). Off the clock; nothing
   * visible happens. `container: true` climbs from the target (e.g. a heading) to the card that holds it.
   */
  | { lift: Target; as: string; container?: boolean };

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
  scene?: { html: string; data?: unknown };
  /** Groups steps into a chapter (video chapters, YouTube timestamps). The first step of a run starts it. */
  chapter?: string;
  /** Markdown for the written guide only: the detail a reader wants and a viewer would not sit through. */
  guide?: string;
  /** Override the automatic camera: 1 keeps the full frame. */
  zoom?: number;
}

export interface Spec {
  /** Another spec this one overrides: a translation, a variant. Steps merge by id, their actions by position. */
  extends?: string;
  title: string;
  app: string;
  profile?: string;
  /** A visible window. Needed for sites that turn headless browsers away. */
  headed?: boolean;
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
  /** `compress: false` keeps the high-quality master as tutorial.mp4; a number sets the CRF (default 24). */
  output?: { compress?: boolean | number };
  /** The thumbnail: an intro-style card. Defaults to the first card, with the key moment's screenshot. */
  poster?: { kicker?: string; title?: string; highlight?: string; subtitle?: string; image?: string };
  steps: Step[];
}

export const DEFAULT_VIEWPORT = { width: 1280, height: 720, scale: 1.5 };

export function loadSpec(file: string): { spec: Spec; dir: string } {
  const spec = read(path.resolve(file));
  if (!spec?.steps?.length) throw new Error(`${file}: no steps`);
  const ids = new Set<string>();
  for (const s of spec.steps) {
    if (!s.id) throw new Error(`${file}: a step has no id`);
    if (ids.has(s.id)) throw new Error(`${file}: duplicate step id "${s.id}"`);
    ids.add(s.id);
  }
  spec.viewport ??= DEFAULT_VIEWPORT;
  spec.profile ??= new URL(spec.app).hostname;
  return { spec, dir: path.dirname(path.resolve(file)) };
}

function read(file: string): Spec {
  const own = parse(readFileSync(file, 'utf8')) as Spec;
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
  return Object.keys(a).find((k) => k !== 'sync' && k !== 'into' && k !== 'label' && k !== 'as')!;
}

export function actionTarget(a: Action): Target | undefined {
  if ('click' in a) return a.click;
  if ('hover' in a) return a.hover;
  if ('highlight' in a) return a.highlight;
  if ('scroll' in a) return a.scroll;
  if ('type' in a) return a.into;
  return undefined;
}
