import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { ADMIN, accessToken, settle, signIn, watchProblems } from "./helpers";

/**
 * Captures every page with seeded demo data (python -m scripts.seed_demo):
 *   SCREENSHOT_DIR=../screenshots pnpm --filter @databix/e2e screenshots
 */
const OUT = resolve(process.env.SCREENSHOT_DIR ?? "../screenshots");
const ACME = resolve(import.meta.dirname, "../../../branding/examples/acme.json");

async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  // Park the pointer so no hover tooltip is captured.
  await page.mouse.move(1, 1);
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: options.fullPage ?? true });
}

test("capture every page", async ({ page }) => {
  test.setTimeout(240_000);
  const problems = watchProblems(page);
  await page.emulateMedia({ colorScheme: "light" });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await shot(page, "01-login", { fullPage: false });

  await signIn(page);
  await expect(page.locator(".dbx-stat__value").first()).not.toHaveText("—");
  await shot(page, "02-overview");

  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "03-overview-dark");
  await page.emulateMedia({ colorScheme: "light" });

  await page.goto("/explorer?sort=-quantity");
  await shot(page, "04-explorer");

  await page.goto("/symbols");
  await shot(page, "05-symbols");

  await page.goto("/symbols/YESBANK?range=6m");
  await shot(page, "06-symbol-detail");

  await page.goto("/compare?symbols=RELIANCE,INFY,TCS&range=6m");
  await shot(page, "07-compare");

  await page.goto("/watchlist");
  await shot(page, "08-watchlist");

  await page.goto("/overview");
  await settle(page);
  await page.keyboard.press("/");
  await page.getByPlaceholder(/Symbol or company name/).fill("bank");
  await expect(page.getByRole("option").first()).toBeVisible();
  await shot(page, "09-symbol-search", { fullPage: false });
  await page.keyboard.press("Escape");

  await page.goto("/assistant");
  const suggestion = page.getByRole("button", { name: /shorted the most in the latest month/ });
  const disabled = page.getByText("The AI assistant is not enabled");
  await expect(suggestion.or(disabled)).toBeVisible();
  // Without an Anthropic key (e.g. in CI) this captures the "not enabled" state instead.
  if (await suggestion.isVisible()) {
    await suggestion.click();
    await expect(page.locator(".dbx-chat__msg--assistant .dbx-chat__bubble")).toHaveCount(1, { timeout: 60_000 });
    await page.getByLabel("Your question").fill("How has short selling in RELIANCE changed over the last three months?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".dbx-chat__msg--assistant .dbx-chat__bubble")).toHaveCount(2, { timeout: 60_000 });
  }
  await shot(page, "10-assistant");

  await page.goto("/admin/status");
  await expect(page.getByText("Healthy").first()).toBeVisible();
  await shot(page, "11-admin-status");

  await page.goto("/admin/ingestion");
  await shot(page, "12-admin-ingestion");

  await page.goto("/admin/users");
  await shot(page, "13-admin-users");

  await page.goto("/admin/branding");
  await shot(page, "14-admin-branding");

  // White-label: apply the Acme example brand through the admin API.
  const token = await accessToken(page);
  const saved = await page.request.put("/api/v1/admin/branding", {
    headers: { Authorization: `Bearer ${token}` },
    data: JSON.parse(readFileSync(ACME, "utf-8")),
  });
  expect(saved.ok()).toBeTruthy();
  try {
    await page.goto("/admin/branding");
    await expect(page.getByLabel("Product name")).toHaveValue("Acme Markets");
    await shot(page, "15-whitelabel-branding-editor");

    await page.goto("/overview");
    await expect(page.locator(".dbx-sidebar__brand img")).toBeVisible();
    await shot(page, "16-whitelabel-overview");

    await page.goto("/symbols/RELIANCE?range=6m");
    await shot(page, "17-whitelabel-symbol");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    await shot(page, "18-whitelabel-mobile", { fullPage: false });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.waitForTimeout(300);
    await shot(page, "19-whitelabel-mobile-nav", { fullPage: false });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/overview");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByText("Sign out").click();
    await page.waitForURL(/\/login/);
    await expect(page.locator(".dbx-login__aside img")).toBeVisible();
    await shot(page, "20-whitelabel-login", { fullPage: false });
  } finally {
    // Restore the default brand whatever state the page is in.
    const login = await page.request.post("/api/v1/auth/token", { form: { ...ADMIN } });
    const { access_token: resetToken } = await login.json();
    await page.request.delete("/api/v1/admin/branding", { headers: { Authorization: `Bearer ${resetToken}` } });
  }

  expect(problems).toEqual([]);
});
