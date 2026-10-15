import { expect, test } from "@playwright/test";

import { ANALYST, signIn, watchProblems } from "./helpers";

// Kept to two sign-ins so it stays inside nginx's login rate limit in CI.

test("admin can use every section without errors", async ({ page }) => {
  const problems = watchProblems(page);
  await signIn(page);

  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByText("Shares shorted", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".dbx-stat__value").first()).not.toHaveText("—");

  const sections: Array<[string, RegExp | string]> = [
    ["/explorer", "Explorer"],
    ["/symbols", "Symbols"],
    ["/watchlist", "Watchlist"],
    ["/compare", "Compare symbols"],
    ["/assistant", "Ask AI"],
    ["/admin/status", "Administration"],
    ["/admin/ingestion", "Administration"],
    ["/admin/users", "Administration"],
    ["/admin/branding", "Administration"],
  ];
  for (const [path, heading] of sections) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }

  await page.goto("/explorer");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  const firstSymbol = await page.locator("table tbody tr td:nth-child(2) a").first().innerText();
  await page.locator("table tbody tr td:nth-child(2) a").first().click();
  await expect(page.getByRole("heading", { name: firstSymbol, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByText("Sign out").click();
  await page.waitForURL(/\/login/);
  await page.goto("/overview");
  await page.waitForURL(/\/login/);

  expect(problems).toEqual([]);
});

test("analysts do not get the admin console", async ({ page }) => {
  const problems = watchProblems(page);
  await signIn(page, ANALYST);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(problems).toEqual([]);
});
