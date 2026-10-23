import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
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

export interface LaunchOptions {
  profile: string;
  headless: boolean;
  viewport?: { width: number; height: number; scale: number };
}

export async function launch(opts: LaunchOptions): Promise<BrowserContext> {
  const dir = path.join(PROFILES_DIR, opts.profile);
  mkdirSync(dir, { recursive: true });
  const vp = opts.viewport;
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: opts.headless,
    args: CHROME_ARGS,
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: vp ? { width: vp.width, height: vp.height } : null,
    deviceScaleFactor: vp?.scale,
    colorScheme: 'light',
    locale: 'en-US',
  });
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
