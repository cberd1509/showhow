import { launch } from './browser.ts';

/**
 * Opens a visible Chrome on the profile so a person can sign in, with email
 * codes, passkeys, SSO or whatever the app uses. Recording never automates
 * sign-in: it reuses this profile. Closing the window ends the command.
 */
export async function login(profile: string, urls: string[]) {
  const context = await launch({ profile, headless: false });
  const first = context.pages()[0] ?? (await context.newPage());
  await first.goto(urls[0]);
  for (const url of urls.slice(1)) await (await context.newPage()).goto(url);
  console.log(`Sign in on every tab, then close the browser window. Profile: ${profile}`);
  // On macOS, closing the last window leaves Chrome running and the profile
  // locked, so the last tab closing is the signal, not the browser exiting.
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
    const watch = (p: import('playwright').Page) =>
      p.on('close', () => {
        if (context.pages().every((x) => x.isClosed())) resolve();
      });
    context.pages().forEach(watch);
    context.on('page', watch);
  });
  await context.close().catch(() => {});
  console.log('Saved.');
}
