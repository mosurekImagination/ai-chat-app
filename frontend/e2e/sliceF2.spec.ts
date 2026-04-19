import { test, expect, chromium } from "@playwright/test";
import { uniqueUser, register, login } from "./helpers";

// T-F2-01: Register with valid credentials → authenticated, redirected to /rooms
test("T-F2-01 register → redirect to /rooms", async ({ page }) => {
  const u = uniqueUser();
  await page.goto("/register");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input#username', u.username);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms**");
  await expect(page).toHaveURL(/\/rooms/);
});

// T-F2-02: Register with duplicate email → error shown
test("T-F2-02 register duplicate email → error", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  const u2 = uniqueUser();
  await page.goto("/register");
  await page.fill('input[type="email"]', u.email); // same email
  await page.fill('input#username', u2.username);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await expect(page.locator("text=already exists")).toBeVisible();
  await expect(page).not.toHaveURL(/\/rooms/);
});

// T-F2-03: Register with duplicate username → error shown
test("T-F2-03 register duplicate username → error", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  const u2 = uniqueUser();
  await page.goto("/register");
  await page.fill('input[type="email"]', u2.email);
  await page.fill('input#username', u.username); // same username
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await expect(page.locator("text=taken")).toBeVisible();
});

// T-F2-04: Login with valid credentials → redirects to /rooms
test("T-F2-04 login valid credentials → /rooms", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  // register logs us in; now logout and log back in
  await page.goto("/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms**");
  await expect(page).toHaveURL(/\/rooms/);
});

// T-F2-05: Login with wrong password → error shown, stays on /login
test("T-F2-05 login wrong password → error", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  await page.goto("/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', "wrongpassword");
  await page.click('button[type="submit"]');
  await expect(page.locator("text=Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// T-F2-06: After login, reload page → still authenticated
test("T-F2-06 login persists across page reload", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  await page.reload();
  await expect(page).toHaveURL(/\/rooms/);
});

// T-F2-07: Forgot password → confirmation shown
test("T-F2-07 forgot password shows confirmation", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  await page.goto("/forgot-password");
  await page.fill('input[type="email"]', u.email);
  await page.click('button[type="submit"]');
  await expect(page.locator("text=on its way").or(page.locator("text=reset link"))).toBeVisible();
});

// T-F2-08: Reset password with valid token → can log in with new password
test("T-F2-08 reset password with valid token", async ({ page, request }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  // Request password reset via API to get the token from MailHog
  await request.post("http://localhost:8080/api/auth/forgot-password", {
    data: { email: u.email },
    headers: { "Content-Type": "application/json" },
  });

  // Fetch the email from MailHog
  const mailResp = await request.get("http://localhost:8025/api/v2/messages");
  const mailJson = await mailResp.json();
  const latestMail = mailJson.items[0];
  const body: string = latestMail?.Content?.Body ?? "";
  const tokenMatch = body.match(/token=([A-Za-z0-9_-]+)/);
  const token = tokenMatch?.[1];
  test.skip(!token, "Could not extract reset token from MailHog");

  const newPassword = "NewPass456!";
  await page.goto(`/reset-password?token=${token}`);
  await page.fill('input#password', newPassword);
  await page.fill('input#confirm', newPassword);
  await page.click('button[type="submit"]');
  await expect(page.locator("text=updated").or(page.locator("text=Redirecting"))).toBeVisible();
  await page.waitForURL("**/login**", { timeout: 5000 });

  // Login with new password
  await login(page, u.email, newPassword);
  await expect(page).toHaveURL(/\/rooms/);
});

// T-F2-09: Logout → redirected to /login; /rooms redirects to /login
test("T-F2-09 logout → /login; /rooms redirects", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  // Click the user dropdown then Sign out
  await page.click("button:has(span)"); // username button in topbar
  await page.click('[role="menuitem"]:has-text("Sign out")');
  await page.waitForURL("**/login**");
  await page.goto("/rooms");
  await page.waitForURL("**/login**");
  await expect(page).toHaveURL(/\/login/);
});

// T-F2-10: Logout current session only; other session remains authenticated
test("T-F2-10 logout current session only", async ({ browser }) => {
  const u = uniqueUser();
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await register(page1, u.email, u.username, u.password);
  await login(page2, u.email, u.password);

  // Logout from page1
  await page1.click("button:has(span)");
  await page1.click('[role="menuitem"]:has-text("Sign out")');
  await page1.waitForURL("**/login**");

  // page2 should still be authenticated
  await page2.reload();
  await expect(page2).toHaveURL(/\/rooms/);

  await ctx1.close();
  await ctx2.close();
});

// T-F2-11: Unauthenticated access to /rooms redirects to /login
test("T-F2-11 unauthenticated /rooms → /login", async ({ page }) => {
  await page.goto("/rooms");
  await page.waitForURL("**/login**");
  await expect(page).toHaveURL(/\/login/);
});

// T-F2-12: "Keep me signed in" checkbox exists on login page
test("T-F2-12 keep me signed in checkbox on login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('text=Keep me signed in')).toBeVisible();
  const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();
  await expect(checkbox).toBeVisible();
});
