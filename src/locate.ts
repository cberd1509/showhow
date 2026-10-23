import type { Locator, Page } from 'playwright';
import type { Target } from './spec.ts';

/** Resolves a spec target to a Playwright locator, preferring what a user sees. */
export function locate(page: Page, t: Target): Locator {
  let loc: Locator;
  if (t.role) loc = page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.name, exact: t.exact });
  else if (t.label) loc = page.getByLabel(t.label, { exact: t.exact });
  else if (t.placeholder) loc = page.getByPlaceholder(t.placeholder, { exact: t.exact });
  else if (t.text) loc = page.getByText(t.text, { exact: t.exact });
  else if (t.testId) loc = page.getByTestId(t.testId);
  else if (t.css) loc = page.locator(t.css);
  else throw new Error(`target has nothing to find it by: ${JSON.stringify(t)}`);
  return t.nth !== undefined ? loc.nth(t.nth) : loc.first();
}

export function describe(t: Target): string {
  if (t.role) return `${t.role} "${t.name ?? ''}"`;
  return JSON.stringify(t);
}
