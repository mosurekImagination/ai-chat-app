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

// ─── MT-04: Friend request sender sees their own request ─────────────────────
//
// Bug reported: "test2 wants to be friends" shown to user test2 (the sender).
// Root cause: GET /api/friends/requests returns ALL pending requests where the
// user is requester OR addressee. Senders should not see their own outgoing
// requests as incoming requests.
//
// Expected: GET /api/friends/requests for the SENDER returns 0 items.
//           GET /api/friends/requests for the RECIPIENT returns 1 item with
//           requester.username === sender's username.

test("MT-04 sender does not see their own outgoing request in pending list", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage(); // user A — sender
    const p2 = await ctx2.newPage(); // user B — recipient

    const a = uniqueUser();
    const b = uniqueUser();

    // Register both users
    await p1.request.post(`${API}/api/auth/register`, {
      data: { email: a.email, username: a.username, password: a.password },
      headers: { "Content-Type": "application/json" },
    });
    await p2.request.post(`${API}/api/auth/register`, {
      data: { email: b.email, username: b.username, password: b.password },
      headers: { "Content-Type": "application/json" },
    });

    // A sends a friend request to B
    const reqResp = await p1.request.post(`${API}/api/friends/requests`, {
      data: { username: b.username },
      headers: { "Content-Type": "application/json" },
    });
    expect(reqResp.status()).toBe(201);

    // A (the sender) should NOT see any incoming pending requests
    const aRaw = await p1.request.get(`${API}/api/friends/requests`);
    const aList = await aRaw.json();
    expect(aList.length).toBe(0); // FAILS before fix — currently returns 1 (A's own sent request)

    // B (the recipient) should see exactly 1 request from A
    const bRaw = await p2.request.get(`${API}/api/friends/requests`);
    const bList = await bRaw.json();
    expect(bList.length).toBe(1);
    expect(bList[0].requester.username).toBe(a.username);
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ─── MT-05: Unread badge for own messages ────────────────────────────────────
//
// Bug reported: user sees unread badge for messages they sent themselves.
// Root cause: countUnread SQL counts ALL messages after the cursor, including
// messages where sender_id = the requesting user.
//
// Expected: after sending a message yourself, your unread count for that room
// is 0, not 1.

test("MT-05 user does not see unread count for their own messages", async ({ page }) => {
  const u = uniqueUser();

  // Register
  const regResp = await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });
  expect(regResp.status()).toBe(201);

  // Get own userId
  const me = await (await page.request.get(`${API}/api/auth/me`)).json();

  // Create a room
  const roomResp = await page.request.post(`${API}/api/rooms`, {
    data: { name: `mt05-${Date.now()}`, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  expect(roomResp.status()).toBe(201);
  const room = await roomResp.json();

  // Load history — sets read cursor to MAX(id) = 0 (no messages yet → COALESCE → 0)
  await page.request.get(`${API}/api/messages/${room.id}`);

  // Seed 1 message from this user (simulates sending a message)
  await page.request.post(`${API}/api/dev/seed/rooms/${room.id}/messages?count=1&userId=${me.userId}`, {
    headers: { "Content-Type": "application/json" },
  });

  // Check unread count via getMyRooms — own message must NOT count as unread
  const roomsRaw = await page.request.get(`${API}/api/rooms`);
  const rooms = await roomsRaw.json();
  const myRoom = rooms.find((r: { id: number }) => r.id === room.id);
  expect(myRoom?.unreadCount).toBe(0); // FAILS before fix — currently 1
});

// ─── MT-06: File upload sends empty message ───────────────────────────────────
//
// Bug reported: attaching a file and clicking send sends an empty message with
// no content and no visible attachment.
// Root cause: api.ts request() always adds "Content-Type: application/json"
// header. For FormData uploads this overrides the browser's auto-generated
// "multipart/form-data; boundary=..." header. The backend receives
// Content-Type: application/json with a multipart body → 415 → upload fails
// silently → onUploadFile returns undefined → onSend("", undefined) sends a
// blank message.
//
// Expected: message shows the attachment filename after sending.

test("MT-06 file attachment is visible in sent message after upload", async ({ page }) => {
  const u = uniqueUser();

  // Register via API (:8080 cookies in page context)
  await page.request.post(`${API}/api/auth/register`, {
    data: { email: u.email, username: u.username, password: u.password },
    headers: { "Content-Type": "application/json" },
  });

  // Login via UI to get cookies from nginx (:3000)
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 5000 });

  // Create room via :3000 proxy
  const roomResp = await page.request.post("http://localhost:3000/api/rooms", {
    data: { name: `mt06-${Date.now()}`, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  const room = await roomResp.json();

  // Navigate to the room
  await page.goto(`http://localhost:3000/rooms/${room.id}`);
  await expect(page.locator("textarea")).toBeEnabled({ timeout: 8000 });

  // Track the upload HTTP status
  let uploadStatus = 0;
  page.on("response", (resp) => {
    if (resp.url().includes("/api/files/upload")) uploadStatus = resp.status();
  });

  // Attach a valid 1×1 PNG using setInputFiles
  await page.locator('input[aria-label="Attach file input"]').setInputFiles({
    name: "attachment.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.locator("text=attachment.png")).toBeVisible({ timeout: 2000 });

  // Click send
  await page.click('[aria-label="Send"]');

  // Give the upload and STOMP message time to complete
  await page.waitForTimeout(3000);

  // Upload must have succeeded (201)
  expect(uploadStatus).toBe(201); // FAILS before fix — 415 (Content-Type: application/json sent for multipart)

  // The sent message must show the attachment (not an empty bubble)
  const msgWithAttachment = page.locator('[data-message-id]').filter({ hasText: "attachment.png" });
  await expect(msgWithAttachment).toBeVisible({ timeout: 3000 }); // FAILS before fix — no attachment in message
});

// ─── MT-07: Reply chain not visible after sending reply ───────────────────────
//
// Bug reported: after hovering a message, clicking Reply, and sending a reply,
// the quoted message chain is not visible in the sent reply.
// Expected: the reply message shows a quoted preview of the original message.

test("MT-07 reply message shows quoted original message", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage(); // user A — will reply
    const p2 = await ctx2.newPage(); // user B — sends original

    const a = uniqueUser();
    const b = uniqueUser();

    // Register both
    await p1.request.post(`${API}/api/auth/register`, {
      data: { email: a.email, username: a.username, password: a.password },
      headers: { "Content-Type": "application/json" },
    });
    await p2.request.post(`${API}/api/auth/register`, {
      data: { email: b.email, username: b.username, password: b.password },
      headers: { "Content-Type": "application/json" },
    });

    // Login A via UI (to get :3000 cookies)
    await p1.goto("http://localhost:3000/login");
    await p1.fill('input[type="email"]', a.email);
    await p1.fill('input[type="password"]', a.password);
    await p1.click('button[type="submit"]');
    await p1.waitForURL("**/rooms", { timeout: 8000 });

    // Login B via UI
    await p2.goto("http://localhost:3000/login");
    await p2.fill('input[type="email"]', b.email);
    await p2.fill('input[type="password"]', b.password);
    await p2.click('button[type="submit"]');
    await p2.waitForURL("**/rooms", { timeout: 8000 });

    // Create a room as A, then B joins
    const roomResp = await p1.request.post("http://localhost:3000/api/rooms", {
      data: { name: `mt07-${Date.now()}`, visibility: "PUBLIC" },
      headers: { "Content-Type": "application/json" },
    });
    const room = await roomResp.json();
    await p2.request.post(`http://localhost:3000/api/rooms/${room.id}/join`, {
      headers: { "Content-Type": "application/json" },
    });

    // Both navigate to the room
    await p1.goto(`http://localhost:3000/rooms/${room.id}`);
    await p2.goto(`http://localhost:3000/rooms/${room.id}`);
    await expect(p1.locator("textarea")).toBeEnabled({ timeout: 8000 });
    await expect(p2.locator("textarea")).toBeEnabled({ timeout: 8000 });

    // B sends the original message
    const originalText = "This is the original message for reply test";
    await p2.fill("textarea", originalText);
    await p2.click('[aria-label="Send"]');
    await expect(p1.locator(`text=${originalText}`)).toBeVisible({ timeout: 5000 });

    // A hovers the message to reveal Reply button, then clicks Reply
    const msgDiv = p1.locator('[data-message-id]').filter({ hasText: originalText });
    await msgDiv.hover();
    await p1.click('[aria-label="Reply"]');

    // Reply preview should appear in the input
    await expect(p1.locator("text=Replying to")).toBeVisible({ timeout: 2000 });

    // A sends the reply
    await p1.fill("textarea", "This is A's reply");
    await p1.click('[aria-label="Send"]');

    // The reply message should show the quoted original message
    const replyMsg = p1.locator('[data-message-id]').filter({ hasText: "This is A's reply" });
    await expect(replyMsg).toBeVisible({ timeout: 5000 });
    // The reply chain border should be visible inside the reply message
    await expect(replyMsg.locator('.border-l-2')).toBeVisible({ timeout: 3000 }); // FAILS before fix if reply chain missing
    await expect(replyMsg.locator('.border-l-2')).toContainText(originalText.slice(0, 30));
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ─── MT-09: Registration should not cause 401 errors ─────────────────────────
//
// Bug reported: after registering a new account and being redirected to /rooms,
// the browser logs "Failed to load resource: 401" errors.
// Expected: all API calls after successful registration return 200/201, not 401.

test("MT-09 no 401 errors occur after successful registration", async ({ page }) => {
  const u = uniqueUser();

  // Capture any 401 responses that happen AFTER registration
  const post401s: string[] = [];
  let registrationSubmitted = false;
  page.on("response", (resp) => {
    if (resp.status() === 401 && registrationSubmitted) {
      post401s.push(resp.url());
    }
  });

  // Register via UI form
  await page.goto("http://localhost:3000/register");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input#username', u.username);
  await page.fill('input[type="password"]', u.password);

  registrationSubmitted = true;
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 5000 });

  // Wait for all initial data fetches to complete
  await page.waitForTimeout(2000);

  // No 401s should have occurred after registration
  expect(post401s).toHaveLength(0); // FAILS if any API call after register returns 401
});
