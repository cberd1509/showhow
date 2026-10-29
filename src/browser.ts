import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Spec } from './spec.ts';
import { mockInitScript } from './mock.ts';
import { applyRoutes } from './routes.ts';

export const PROFILES_DIR = path.resolve(import.meta.dirname, '..', '.profiles');

// Real Chrome, not the bundled Chromium: sites behind bot checks
// let it in, and its profile is the one `login` signed into.
const CHROME_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--hide-scrollbars',
];

/**
 * Starts the installed browser: Google Chrome, else Microsoft Edge (the same engine, preinstalled on
 * Windows). `SHOWHOW_BROWSER` picks one (`chrome`, `msedge` or another Playwright channel) and skips the
 * fallback.
 */
export async function withChannel<T>(start: (channel: string) => Promise<T>): Promise<T> {
  const channels = process.env.SHOWHOW_BROWSER ? [process.env.SHOWHOW_BROWSER] : ['chrome', 'msedge'];
  for (const [i, channel] of channels.entries()) {
    try {
      return await start(channel);
    } catch (err) {
      const missing = /distribution '[^']+' is not found|Executable doesn't exist/i.test(String((err as Error)?.message));
      if (!missing || i === channels.length - 1) throw err;
    }
  }
  throw new Error('unreachable');
}

export interface LaunchOptions {
  profile: string;
  headless: boolean;
  viewport?: { width: number; height: number; scale: number };
  /** A throwaway profile: nothing (cookies, site storage) carries over from one run to the next. */
  fresh?: boolean;
}

export async function launch(opts: LaunchOptions): Promise<BrowserContext> {
  const dir = opts.fresh ? mkdtempSync(path.join(os.tmpdir(), 'showhow-')) : path.join(PROFILES_DIR, opts.profile);
  mkdirSync(dir, { recursive: true });
  const vp = opts.viewport;
  const context = await withChannel((channel) => chromium.launchPersistentContext(dir, {
    channel,
    headless: opts.headless,
    args: CHROME_ARGS,
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: vp ? { width: vp.width, height: vp.height } : null,
    deviceScaleFactor: vp?.scale,
    colorScheme: 'light',
    locale: 'en-US',
  }));
  // Chrome may still be flushing the profile as it closes: retry, and never fail a run over a temp dir.
  if (opts.fresh) context.on('close', () => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} });
  // Headless Chrome announces itself in the UA; some sites refuse it.
  if (opts.headless) {
    const page = context.pages()[0] ?? (await context.newPage());
    const ua = await page.evaluate(() => navigator.userAgent);
    await context.addInitScript(
      `Object.defineProperty(navigator, 'userAgent', { get: () => ${JSON.stringify(ua.replace('HeadlessChrome', 'Chrome'))} });`,
    );
  }
  return context;
}

/**
 * Everything that must hold before a single pixel is captured: API responses
 * replaced, DOM text rewritten, private areas blurred. Applied to the context,
 * so it covers every page and every tab the flow opens.
 */
export async function applyPrivacy(context: BrowserContext, spec: Spec, specDir: string, currentStep: () => string | undefined = () => undefined) {
  await applyRoutes(context, spec, specDir, currentStep);
  const script = mockInitScript(spec);
  if (script) await context.addInitScript(script);
}

export async function activePage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  return pages[pages.length - 1] ?? (await context.newPage());
}
