import { expect, test } from "@playwright/test";
import { isPhone, scrollThrough, watchErrors } from "./helpers";

const PAGES = [
  { path: "/", title: /Crevo — The AI Operating System for Creators/ },
  { path: "/contact-us", title: /Contact Crevo/ },
  { path: "/privacy-policy", title: /Privacy Policy — Crevo/ },
  { path: "/terms-of-service", title: /Terms of Service — Crevo/ },
];

test.describe("marketing pages", () => {
  for (const { path, title } of PAGES) {
    test(`${path} loads with no errors or template leftovers`, async ({ page }) => {
      const errors = watchErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(title);
      await expect(page.locator("main#main")).toHaveCount(1);

      const html = await page.content();
      expect(html).not.toMatch(/framer|verseo|creatoros/i);

      // Nothing should stay invisible once the visitor has scrolled past it.
      await scrollThrough(page);
      const hidden = await page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>("[data-scroll-reveal], [data-reveal]")].filter(
            (el) => el.offsetParent && Number(getComputedStyle(el).opacity) < 0.5,
          ).length,
      );
      expect(hidden).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("unknown addresses show the Crevo 404 page", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(/Page Not Found — Crevo/);
  });

  test("pages don't carry a hidden copy of the full 404 page", async ({ request }) => {
    // The full Crevo 404 lives in app/global-not-found.tsx; if it moves back
    // into app/not-found.tsx, every page grows by ~300 KB again.
    const signin = await (await request.get("/auth/signin")).text();
    expect(signin.length).toBeLessThan(100_000);
    expect(signin).not.toContain("Back to Home Page");
  });

  test("sitemap and robots.txt are served", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    for (const path of ["/contact-us", "/privacy-policy", "/terms-of-service"]) expect(await sitemap.text()).toContain(path);
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /dashboard");
  });

  test("security headers are sent and private pages aren't publicly cached", async ({ request }) => {
    const home = await request.get("/");
    const headers = home.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();

    const dashboard = await request.get("/dashboard", { maxRedirects: 0 });
    expect(dashboard.status()).toBe(307);
    expect(dashboard.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
  });

  test("every page has a 1200x630 link preview image", async ({ page, request }) => {
    for (const { path } of PAGES) {
      await page.goto(path);
      const image = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect(image).toMatch(/\/opengraph-image\.png/);
      await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    }
    const png = await request.get("/opengraph-image.png");
    expect(png.headers()["content-type"]).toBe("image/png");
  });
});

test.describe("navigation", () => {
  test("Sign in and Sign up free open the auth pages", async ({ page }) => {
    await page.goto("/");
    if (isPhone(page)) {
      await page.locator("[data-menu-toggle]:visible").click();
      await expect(page.locator("[data-mobile-menu]:visible")).toBeVisible();
      await page.locator('[data-mobile-menu] a[href="/auth/signin"]:visible').click();
    } else {
      await page.locator('nav a[href="/auth/signin"]:visible').click();
    }
    await expect(page).toHaveURL(/\/auth\/signin$/);

    await page.goto("/");
    await page.locator('a[href="/auth/signup"]:visible').first().click();
    await expect(page).toHaveURL(/\/auth\/signup$/);
  });

  test("short auth addresses redirect to the real pages", async ({ page }) => {
    const cases: [string, RegExp][] = [
      ["/signin", /\/auth\/signin$/],
      ["/login", /\/auth\/signin$/],
      ["/signup", /\/auth\/signup$/],
      ["/register", /\/auth\/signup$/],
      ["/forgot-password", /\/auth\/forgot$/],
    ];
    for (const [from, to] of cases) {
      const response = await page.goto(from);
      expect(response?.status(), from).toBe(200);
      await expect(page, from).toHaveURL(to);
    }
  });

  test("keyboard users reach the navigation first", async ({ page }) => {
    test.skip(isPhone(page), "the phone layout has a menu button instead of links");
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText("Product");
  });

  test("the dashboard sends signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});

test.describe("landing page interactions", () => {
  test("FAQ items open and close with the mouse and the keyboard", async ({ page }) => {
    await page.goto("/");
    // Pin one closed FAQ item that is visible at this screen size.
    const index = await page.evaluate(() =>
      [...document.querySelectorAll("[data-faq]:not([data-faq-group])")].findIndex(
        (el) => !el.hasAttribute("data-open") && (el.querySelector("[data-faq-closed]") as HTMLElement | null)?.offsetParent,
      ),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const item = page.locator("[data-faq]:not([data-faq-group])").nth(index);
    const question = item.locator("[data-faq-closed]");
    await question.scrollIntoViewIfNeeded();
    await question.click();
    await expect(item).toHaveAttribute("data-open", "");
    await expect(item.locator("[data-faq-open]")).toHaveAttribute("aria-expanded", "true");

    await item.locator("[data-faq-open]").focus();
    await page.keyboard.press("Enter");
    await expect(item).not.toHaveAttribute("data-open", "");
    await expect(item.locator("[data-faq-closed]")).toBeFocused();
  });

  test("only one use case is open at a time", async ({ page }) => {
    await page.goto("/");
    const closed = page.locator("[data-faq-group] [data-faq-closed]:visible").first();
    await closed.scrollIntoViewIfNeeded();
    await closed.click();
    await expect(page.locator("[data-faq-group][data-open] [data-faq-open]:visible")).toHaveCount(1);
  });

  test("the newsletter form goes to sign-up with the email filled in", async ({ page }) => {
    await page.goto("/");
    const email = page.locator("[data-newsletter-form] input[type=email]:visible").first();
    await email.scrollIntoViewIfNeeded();
    await email.fill("fan@example.com");
    await email.press("Enter");
    await expect(page).toHaveURL(/\/auth\/signup\?email=fan%40example\.com/);
    await expect(page.locator("#email")).toHaveValue("fan@example.com");
  });
});

test.describe("auth pages", () => {
  test("sign-up page shows the form and keeps its own submit", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/auth/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.fill("#name", "Maya Lopez");
    await page.fill("#email", "maya@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type=submit]");
    // Whatever Supabase answers, the visitor gets a message on an auth page;
    // the landing page's form script must not hijack this form.
    await expect(page.locator("form [role=alert], form [role=status]")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/auth\/(signup|signin)\?/);
    expect(errors).toEqual([]);
  });

  test("sign-in page shows a message instead of failing silently", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByRole("heading", { name: "Sign in to Crevo" })).toBeVisible();
    await page.fill("#email", "maya@example.com");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await expect(page.locator("form [role=alert], form [role=status]")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/auth\/signin\?/);
  });

  test("forgot-password checks the email before sending", async ({ page }) => {
    await page.goto("/auth/forgot");
    await page.evaluate(() => document.querySelector("form")!.setAttribute("novalidate", ""));
    await page.fill("#email", "not-an-email");
    await page.click("button[type=submit]");
    await expect(page.getByText("That email doesn't look right.")).toBeVisible();
  });
});
