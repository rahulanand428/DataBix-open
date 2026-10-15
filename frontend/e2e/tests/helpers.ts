import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: process.env.E2E_USERNAME ?? "admin", password: process.env.E2E_PASSWORD ?? "demo-password-123" };
export const ANALYST = { username: process.env.E2E_ANALYST ?? "analyst", password: process.env.E2E_PASSWORD ?? "demo-password-123" };

/** Collects console errors, page errors and CSP violations for later assertions. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // The session-restore probe before sign-in is expected to 401.
    if (message.type() === "error" && !/status of 401/.test(text)) problems.push(`console: ${text}`);
    if (/Content Security Policy/i.test(text)) problems.push(`csp: ${text}`);
  });
  return problems;
}

export async function signIn(page: Page, user = ADMIN, path = "/overview") {
  await page.goto(path);
  await page.waitForURL(/\/login/);
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Waits until data has rendered and network is quiet, so screenshots are stable. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".dbx-skeleton")).toHaveCount(0);
  await page.waitForTimeout(400);
}

/** Exchanges the refresh cookie for an access token, for API calls from tests. */
export async function accessToken(page: Page): Promise<string> {
  const response = await page.request.post("/api/v1/auth/refresh", { headers: { "X-Requested-With": "databix" } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}
