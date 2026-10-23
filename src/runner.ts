import type { BrowserContext, CDPSession, Locator, Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { actionKind, actionTarget, type Action, type Spec, type Step, type Target } from './spec.ts';
import { describe, locate } from './locate.ts';
import { cardAround, liftElement } from './lift.ts';
import { wordTime, type Line } from './voice.ts';

export type Box = { x: number; y: number; w: number; h: number };
export type Event =
  | { type: 'step-start' | 'step-end'; step: string; t: number }
  | { type: 'move'; from: Pt; to: Pt; t0: number; t1: number }
  | { type: 'click'; at: Pt; t: number }
  | { type: 'target'; step: string; kind: string; box: Box; t: number; label?: string }
  | { type: 'type'; t0: number; t1: number }
  | { type: 'page'; url: string; t: number }
  | { type: 'cut'; t0: number; t1: number }
  /** The page moved under the camera (a scroll): earlier boxes are stale. */
  | { type: 'reset'; t: number };
type Pt = { x: number; y: number };

export interface Frame {
  file: string;
  t: number;
}

const MOVE_SECONDS = 0.55;
const STEP_TAIL = 0.6;
const CARD_SECONDS = 2.8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Actions that only set the scene. At the head of a step they run off the clock. */
const SETUP = new Set(['goto', 'wait', 'waitFor', 'waitForUrl', 'lift']);

/**
 * Drives the app through the steps. Paced, it records: every step lasts at
 * least as long as its narration, pointer actions land on their `sync` word,
 * and the active tab is captured frame by frame. Unpaced, it just gets there
 * fast, for probing.
 */
export class Runner {
  events: Event[] = [];
  /** The step being run, for mocks that only apply to part of the tutorial. */
  step?: string;
  frames: Frame[] = [];
  page!: Page;
  private cursor: Pt;
  private origin = 0;
  private cdp?: CDPSession;
  private frameDir?: string;
  private frameCount = 0;
  private stopped = false;
  /** A highlighted element, followed until its step ends: layouts shift after we measure. */
  private tracked?: { loc: Locator; step: string; label?: string; box: Box };

  private context: BrowserContext;
  private spec: Spec;
  private opts: { paced: boolean; frameDir?: string; liftDir?: string };

  constructor(context: BrowserContext, spec: Spec, opts: { paced: boolean; frameDir?: string; liftDir?: string }) {
    this.context = context;
    this.spec = spec;
    this.opts = opts;
    const vp = spec.viewport!;
    this.cursor = { x: vp.width / 2, y: vp.height / 2 };
    this.frameDir = opts.frameDir;
    if (this.frameDir) mkdirSync(this.frameDir, { recursive: true });
    context.on('page', (p) => void this.follow(p));
  }

  now(): number {
    return performance.now() / 1000 - this.origin;
  }

  async start(page: Page) {
    this.origin = performance.now() / 1000;
    await this.follow(page);
  }

  /** New tabs and popups take over the capture; a closing one hands it back. */
  private async follow(page: Page) {
    if (this.stopped || this.page === page || page.isClosed()) return;
    const previous = this.page;
    this.page = page;
    page.on('close', () => {
      const pages = this.context.pages().filter((p) => !p.isClosed());
      if (this.page === page && pages.length) void this.follow(pages[pages.length - 1]);
    });
    this.events.push({ type: 'page', url: page.url(), t: this.now() });
    if (!this.frameDir) return;
    if (this.cdp && previous && !previous.isClosed()) await this.cdp.send('Page.stopScreencast').catch(() => {});
    const vp = this.spec.viewport!;
    let cdp: CDPSession;
    try {
      cdp = await this.context.newCDPSession(page);
    } catch {
      return; // the tab closed while we attached
    }
    this.cdp = cdp;
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      if (this.cdp !== cdp) return;
      const file = path.join(this.frameDir!, `${String(this.frameCount++).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      this.frames.push({ file, t: this.now() });
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: Math.round(vp.width * vp.scale),
      maxHeight: Math.round(vp.height * vp.scale),
    });
  }

  async stop() {
    this.stopped = true;
    if (this.cdp) await this.cdp.send('Page.stopScreencast').catch(() => {});
  }

  async runStep(step: Step, line?: Line) {
    this.step = step.id;
    const actions = step.do ?? [];
    let i = 0;
    // Loading is not worth watching: leading setup runs before the step's clock.
    if (this.opts.paced && actions.length && SETUP.has(actionKind(actions[0]))) {
      const t0 = this.now();
      for (; i < actions.length && SETUP.has(actionKind(actions[i])); i++) await this.act(actions[i], step, 0, line);
      await this.settle();
      this.events.push({ type: 'cut', t0, t1: this.now() });
    }

    const start = this.now();
    this.events.push({ type: 'step-start', step: step.id, t: start });
    for (; i < actions.length; i++) await this.act(actions[i], step, start, line);

    if (this.opts.paced) {
      const spoken = line ? line.duration + STEP_TAIL : 1.2;
      const minimum = step.card || step.scene ? Math.max(spoken, CARD_SECONDS) : spoken;
      const end = start + minimum;
      while (this.now() < end) {
        await this.retrack();
        await sleep(Math.min(150, (end - this.now()) * 1000));
      }
    }
    this.tracked = undefined;
    this.events.push({ type: 'step-end', step: step.id, t: this.now() });
  }

  private async settle() {
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await this.page.evaluate(() => document.fonts.ready).catch(() => {});
    await sleep(this.opts.paced ? 400 : 100);
  }

  private async act(a: Action, step: Step, stepStart: number, line?: Line) {
    const kind = actionKind(a);
    const page = this.page;
    const sync = 'sync' in a ? a.sync : undefined;

    // A pointer action arrives on its word; without one, it waits a beat so
    // the narration gets ahead of the cursor rather than behind it.
    if (this.opts.paced && actionTarget(a)) {
      const spoken = sync ? wordTime(line, sync) : undefined;
      if (sync && spoken === undefined) console.warn(`  "${sync}" is not in the narration of ${step.id}`);
      const arrive = stepStart + (spoken ?? 0.7);
      await sleep((arrive - MOVE_SECONDS - this.now()) * 1000);
    }

    switch (kind) {
      case 'goto':
        await page.goto((a as { goto: string }).goto, { waitUntil: 'domcontentloaded' });
        return this.settle();
      case 'wait':
        return sleep((a as { wait: number }).wait * 1000);
      case 'waitFor':
        await locate(page, (a as { waitFor: Target }).waitFor).waitFor({ state: 'visible', timeout: 20000 });
        return;
      case 'waitForUrl':
        // Any tab: the URL often arrives in the one a click just opened.
        await this.follow(await this.waitForPage((a as { waitForUrl: string }).waitForUrl));
        return this.settle();
      case 'lift': {
        const { lift, as, container } = a as { lift: Target; as: string; container?: boolean };
        const loc = locate(page, lift);
        await loc.waitFor({ state: 'visible', timeout: 15000 });
        await loc.scrollIntoViewIfNeeded();
        const got = await liftElement(container ? await cardAround(loc) : loc);
        if (this.opts.liftDir) {
          mkdirSync(this.opts.liftDir, { recursive: true });
          writeFileSync(path.join(this.opts.liftDir, `${as}.html`), got.html);
        }
        console.log(`  lift: ${as} (${Math.round(got.width)}×${Math.round(got.height)}, ${(got.html.length / 1024).toFixed(0)} KB)`);
        return;
      }
      case 'press':
        await page.keyboard.press((a as { press: string }).press);
        return sleep(this.opts.paced ? 300 : 50);
      case 'scroll': {
        const loc = locate(page, (a as { scroll: Target }).scroll);
        await loc.waitFor({ state: 'attached', timeout: 15000 });
        this.events.push({ type: 'reset', t: this.now() });
        await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await sleep(this.opts.paced ? 900 : 300);
        return;
      }
    }

    const target = actionTarget(a);
    if (kind === 'type' && !target) return this.type((a as { type: string }).type, step);
    if (!target) throw new Error(`${step.id}: ${kind} needs a target`);

    const loc = locate(page, target);
    try {
      await loc.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`${step.id}: could not find ${describe(target)} on ${page.url()}`);
    }
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error(`${step.id}: ${describe(target)} has no box`);
    const box = { x: b.x, y: b.y, w: b.width, h: b.height };
    const label = 'label' in a ? a.label : undefined;
    this.events.push({ type: 'target', step: step.id, kind, box, t: this.now(), label });

    await this.moveTo({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    if (kind === 'click' || kind === 'type') {
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
      this.events.push({ type: 'click', at: { ...this.cursor }, t: this.now() });
      await sleep(this.opts.paced ? 250 : 50);
    }
    if (kind === 'type') await this.type((a as { type: string }).type);
    if (kind === 'highlight') {
      this.tracked = { loc, step: step.id, label, box };
      if (this.opts.paced) await sleep(400);
    }
  }

  /** Re-measures the tracked element; a move becomes a new target event the ring and camera follow. */
  private async retrack() {
    const tr = this.tracked;
    if (!tr) return;
    const b = await tr.loc.boundingBox({ timeout: 200 }).catch(() => null);
    if (!b) return;
    const box = { x: b.x, y: b.y, w: b.width, h: b.height };
    const moved = Math.abs(box.x - tr.box.x) + Math.abs(box.y - tr.box.y) + Math.abs(box.w - tr.box.w) + Math.abs(box.h - tr.box.h);
    if (moved < 1.5) return;
    tr.box = box;
    this.events.push({ type: 'target', step: tr.step, kind: 'highlight', box, t: this.now(), label: tr.label });
  }

  /** `pattern` is a substring, or a glob when it contains `*`. */
  private async waitForPage(pattern: string): Promise<Page> {
    const re = pattern.includes('*')
      ? new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`)
      : null;
    const matches = (url: string) => (re ? re.test(url) : url.includes(pattern));
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const pages = this.context.pages().filter((p) => !p.isClosed()).reverse();
      const hit = pages.find((p) => matches(p.url()));
      if (hit) return hit;
      await sleep(200);
    }
    throw new Error(`no tab reached ${pattern}; open: ${this.context.pages().map((p) => p.url()).join(', ')}`);
  }

  private async moveTo(to: Pt) {
    const from = { ...this.cursor };
    const t0 = this.now();
    if (this.opts.paced) {
      // Real moves, so the app's own hover states show up in the capture.
      const n = Math.round(MOVE_SECONDS * 60);
      for (let k = 1; k <= n; k++) {
        const e = ease(k / n);
        await this.page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        await sleep(1000 / 60);
      }
    } else await this.page.mouse.move(to.x, to.y);
    this.cursor = to;
    this.events.push({ type: 'move', from, to, t0, t1: this.now() });
  }

  private async type(text: string, step?: Step) {
    // Typing into whatever has focus: that field is where the eye should be.
    if (step) {
      const b = await this.page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }).catch(() => null);
      if (b && b.w > 0) this.events.push({ type: 'target', step: step.id, kind: 'type', box: b, t: this.now() });
    }
    const t0 = this.now();
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      if (this.opts.paced) await sleep(40 + Math.random() * 45);
    }
    this.events.push({ type: 'type', t0, t1: this.now() });
  }
}
