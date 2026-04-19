/**
 * Manual test regression suite — bugs found during manual QA.
 *
 * Target: Docker stack  →  frontend http://localhost:3000
 *                          API      http://localhost:8080
 *                          MailHog  http://localhost:8025
 *
 * Run: npx playwright test e2e/manual-tests.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import { uniqueUser } from "./helpers";

const API = "http://localhost:8080";

// ─── MT-01: Password reset security ─────────────────────────────────────────
//
// Bug reported: old password still works after reset; reset link reusable.
// Expected:
//   a) Logging in with the old password after a successful reset returns 401.
//   b) Using the same reset token a second time does NOT change the password again
//      (token is marked used; second attempt silently no-ops per no-enumeration policy).

test("MT-01a old password rejected after successful password reset", async ({ page }) => {
  const u = uniqueUser();

  // Register via API
  const regResp = await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });
  expect(regResp.status()).toBe(201);

  // Request password reset
  await page.request.post(`${API}/api/auth/forgot-password`, {
    data: { email: u.email },
    headers: { "Content-Type": "application/json" },
  });

  // Fetch the reset token from MailHog (latest message)
  await page.waitForTimeout(300);
  const mailResp = await page.request.get("http://localhost:8025/api/v2/messages");
  const mailJson = await mailResp.json();
  const body: string = mailJson.items[0]?.Content?.Body ?? "";
  const tokenMatch = body.match(/token=([A-Za-z0-9_\-]+)/);
  const resetToken = tokenMatch?.[1];
  test.skip(!resetToken, "Could not extract reset token from MailHog");

  // Perform the reset
  const resetResp = await page.request.post(`${API}/api/auth/reset-password`, {
    data: { token: resetToken, newPassword: "NewSecure1!" },
    headers: { "Content-Type": "application/json" },
  });
  expect(resetResp.status()).toBe(200);

  // OLD password must now be rejected
  const loginOld = await page.request.post(`${API}/api/auth/login`, {
    data: { email: u.email, password: u.password },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginOld.status()).toBe(401); // fails if old password still works

  // NEW password must be accepted
  const loginNew = await page.request.post(`${API}/api/auth/login`, {
    data: { email: u.email, password: "NewSecure1!" },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginNew.status()).toBe(200);
});

test("MT-01b reset token cannot be reused after first use", async ({ page }) => {
  const u = uniqueUser();

  // Register
  await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });

  // Request reset
  await page.request.post(`${API}/api/auth/forgot-password`, {
    data: { email: u.email },
    headers: { "Content-Type": "application/json" },
  });

  await page.waitForTimeout(300);
  const mailResp = await page.request.get("http://localhost:8025/api/v2/messages");
  const mailJson = await mailResp.json();
  const body: string = mailJson.items[0]?.Content?.Body ?? "";
  const tokenMatch = body.match(/token=([A-Za-z0-9_\-]+)/);
  const resetToken = tokenMatch?.[1];
  test.skip(!resetToken, "Could not extract reset token from MailHog");

  // First use — legitimate reset
  await page.request.post(`${API}/api/auth/reset-password`, {
    data: { token: resetToken, newPassword: "LegitPass1!" },
    headers: { "Content-Type": "application/json" },
  });

  // Second use of same token — must silently no-op (server returns 200 per no-enumeration policy)
  await page.request.post(`${API}/api/auth/reset-password`, {
    data: { token: resetToken, newPassword: "AttackerPass1!" },
    headers: { "Content-Type": "application/json" },
  });

  // "LegitPass1!" must still work — attacker's second reset must have been rejected
  const loginLegit = await page.request.post(`${API}/api/auth/login`, {
    data: { email: u.email, password: "LegitPass1!" },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginLegit.status()).toBe(200); // fails if second reset overwrote the password

  // "AttackerPass1!" must be rejected
  const loginAttacker = await page.request.post(`${API}/api/auth/login`, {
    data: { email: u.email, password: "AttackerPass1!" },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginAttacker.status()).toBe(401); // fails if token was reusable
});

// ─── MT-02: Keep me signed in ───────────────────────────────────────────────
//
// Bug reported: user remains logged in after browser restart even without
// checking "Keep me signed in".
//
// Root cause: setAccessTokenCookie / setRefreshTokenCookie always set maxAge,
// producing persistent cookies regardless of keepSignedIn flag.
//
// Expected:
//   keepSignedIn = false  →  session cookies (no maxAge / maxAge = -1):
//                            cleared when browser closes
//   keepSignedIn = true   →  persistent cookies with maxAge set:
//                            survive browser restart

test("MT-02a login WITHOUT keep-me-signed-in sets session cookies (no persistent expiry)", async ({ page, context }) => {
  const u = uniqueUser();
  await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });

  // Log out first so we start clean, then log in without keepSignedIn
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  // keepSignedIn checkbox must be UNCHECKED (default)
  const checkbox = page.locator('[role="checkbox"]').first();
  if ((await checkbox.getAttribute("aria-checked")) === "true") await checkbox.click();
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 5000 });

  // Inspect the cookies — refresh_token must be a session cookie (expires = -1)
  const cookies = await context.cookies();
  const refreshCookie = cookies.find((c) => c.name === "refresh_token");
  expect(refreshCookie).toBeDefined();
  // A persistent cookie has expires > 0 (Unix timestamp); session cookie has expires = -1
  expect(refreshCookie!.expires).toBe(-1); // FAILS before fix — currently a persistent cookie
});

test("MT-02b login WITH keep-me-signed-in sets persistent cookies", async ({ page, context }) => {
  const u = uniqueUser();
  await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });

  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  const checkbox = page.locator('[role="checkbox"]').first();
  if ((await checkbox.getAttribute("aria-checked")) !== "true") await checkbox.click();
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 5000 });

  const cookies = await context.cookies();
  const refreshCookie = cookies.find((c) => c.name === "refresh_token");
  expect(refreshCookie).toBeDefined();
  // Must be a persistent cookie when keepSignedIn = true
  expect(refreshCookie!.expires).toBeGreaterThan(0);
});

// ─── MT-03: Revoke session takes effect immediately ──────────────────────────
//
// Bug reported: revoking a session from the sessions screen does not
// immediately kill the other browser — it keeps working.
//
// Root cause: JwtAuthFilter only validates JWT signature/expiry; it never
// checks whether the session still exists in the DB. After revocation the
// access_token JWT (15-min TTL) remains accepted until it naturally expires.
//
// Expected: after revocation any request from the revoked session returns 401.

test("MT-03 revoked session is rejected immediately on next request", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    const u = uniqueUser();

    // Register via p1
    await p1.request.post(`${API}/api/auth/register`, {
      data: { email: u.email, username: u.username, password: u.password },
      headers: { "Content-Type": "application/json" },
    });

    // Log in on p2 as the same user (second session)
    const loginResp = await p2.request.post(`${API}/api/auth/login`, {
      data: { email: u.email, password: u.password, keepSignedIn: false },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginResp.status()).toBe(200);

    // Confirm p2 can reach an authenticated endpoint
    const meBefore = await p2.request.get(`${API}/api/auth/me`);
    expect(meBefore.status()).toBe(200);

    // From p1, list sessions and revoke the p2 session
    const sessionsResp = await p1.request.get(`${API}/api/auth/sessions`);
    const sessions = await sessionsResp.json();
    // p2's session is not the current p1 session — pick the one that isn't p1's
    const p1SessionResp = await p1.request.get(`${API}/api/auth/me`);
    const { userId } = await p1SessionResp.json();
    // Revoke every session except p1's own (p1 is registered so it also has a session)
    // Since we just did a fresh register (p1) and a fresh login (p2), there are exactly 2 sessions.
    // Revoke the one that belongs to the p2 login (it will be the newer one).
    const p2Session = sessions.find((s: { id: number; current?: boolean }) => !s.current);
    expect(p2Session).toBeDefined();

    const revokeResp = await p1.request.delete(`${API}/api/auth/sessions/${p2Session.id}`);
    expect(revokeResp.status()).toBe(204);

    // p2 must be rejected IMMEDIATELY — not after 15 minutes
    const meAfter = await p2.request.get(`${API}/api/auth/me`);
    expect(meAfter.status()).toBe(401); // FAILS before fix — JWT still accepted despite revocation
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ─── MT-01c: UI must not show "Password updated" when token is already used ─
//
// Root cause of user confusion: the server always returns 200 (no-enumeration).
// The frontend must NOT display a success message on a second submission — it
// must redirect to /login (or stay silent) because showing "Password updated"
// on a no-op makes the user believe their password was changed again.

test("MT-01c reset page does not show success message when token is already used", async ({ page }) => {
  const u = uniqueUser();

  // Register
  await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });

  // Request reset
  await page.request.post(`${API}/api/auth/forgot-password`, {
    data: { email: u.email },
    headers: { "Content-Type": "application/json" },
  });

  await page.waitForTimeout(300);
  const mailResp = await page.request.get("http://localhost:8025/api/v2/messages");
  const mailJson = await mailResp.json();
  const body: string = mailJson.items[0]?.Content?.Body ?? "";
  const tokenMatch = body.match(/token=([A-Za-z0-9_\-]+)/);
  const resetToken = tokenMatch?.[1];
  test.skip(!resetToken, "Could not extract reset token from MailHog");

  // ── First use: legitimate reset via the UI ──────────────────────────────
  await page.goto(`http://localhost:3000/reset-password?token=${resetToken}`);
  await page.fill("#password", "NewSecure1!");
  await page.fill("#confirm", "NewSecure1!");
  await page.click('button[type="submit"]');

  // Should show success and redirect to /login
  await expect(page.locator("text=Password updated")).toBeVisible({ timeout: 3000 });
  await page.waitForURL("**/login", { timeout: 5000 });

  // ── Second use: visit the same link again (token already consumed) ──────
  await page.goto(`http://localhost:3000/reset-password?token=${resetToken}`);
  await page.fill("#password", "AttackerPass1!");
  await page.fill("#confirm", "AttackerPass1!");
  await page.click('button[type="submit"]');

  // Must NOT show "Password updated" — the token was already used
  await expect(page.locator("text=Password updated")).not.toBeVisible({ timeout: 3000 }); // FAILS before fix
  // Should show an error or redirect to login without claiming success
});
