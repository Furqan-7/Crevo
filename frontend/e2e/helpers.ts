import type { Page } from "@playwright/test";

/** Collects uncaught page errors and console errors while a test runs. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Scrolls through the page so scroll-triggered content gets a chance to appear. */
export async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(1200);
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 810;
