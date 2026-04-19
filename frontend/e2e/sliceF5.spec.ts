import { test, expect, Browser } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register, login } from "./helpers";

// ─── helpers ────────────────────────────────────────────────────────────────

async function setupFriendship(p1: ReturnType<Browser["newPage"]> extends Promise<infer T> ? T : never, p2: ReturnType<Browser["newPage"]> extends Promise<infer T> ? T : never) {
  // p1 sends a friend request to p2; p2 accepts; returns dmRoomId
  const u2Me = await p2.request.get("http://localhost:8080/api/auth/me");
  const { username: u2Username } = await u2Me.json();

  const reqResp = await p1.request.post("http://localhost:8080/api/friends/requests", {
    data: { username: u2Username },
    headers: { "Content-Type": "application/json" },
  });
  const req = await reqResp.json();

  const acceptResp = await p2.request.patch(
    `http://localhost:8080/api/friends/requests/${req.id}`,
    { data: { action: "ACCEPT" }, headers: { "Content-Type": "application/json" } },
  );
  const accepted = await acceptResp.json();
  return accepted.dmRoomId as number;
}

// ─── T-F5-01: online presence ────────────────────────────────────────────────

// T-F5-01: Logged-in friend's presence dot shows online in contacts sidebar; visible within 2s
test("T-F5-01 friend presence dot shows online", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  await setupFriendship(p1, p2);

  // Navigate to /rooms to see the contacts section
  await p1.goto("/rooms");
  await p1.waitForTimeout(500);

  // p2 is logged in and STOMP-connected → p1 should see Online dot for u2
  await expect(p1.locator('[aria-label="Online"]').first()).toBeVisible({ timeout: 3000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F5-02: AFK via tab hidden ────────────────────────────────────────────

// T-F5-02: Tab hidden → presence transitions to AFK (visibilitychange → sends presence.afk)
test("T-F5-02 tab hidden → presence shows AFK", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  await setupFriendship(p1, p2);

  await p1.goto("/rooms");
  // Verify online first
  await expect(p1.locator('[aria-label="Online"]').first()).toBeVisible({ timeout: 3000 });

  // Simulate p2 hiding tab → triggers presence.afk to backend
  await p2.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // p1 should see AFK within 3s
  await expect(p1.locator('[aria-label="Away"]').first()).toBeVisible({ timeout: 3000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F5-03: Multi-tab presence ────────────────────────────────────────────

// T-F5-03: Two tabs for u2: one active → Online; both hidden → AFK
test("T-F5-03 two tabs: one active → online; both hidden → AFK", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2a = await browser.newContext();
  const ctx2b = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2a = await ctx2a.newPage();
  const p2b = await ctx2b.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2a, u2.email, u2.username, u2.password);
  // Log in second "tab" as same user
  await login(p2b, u2.email, u2.password);

  await setupFriendship(p1, p2a);

  await p1.goto("/rooms");
  await expect(p1.locator('[aria-label="Online"]').first()).toBeVisible({ timeout: 3000 });

  // Hide p2a's tab → p2b still active → u2 remains Online
  await p2a.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // p2b's session is still active → should stay Online
  await p1.waitForTimeout(1000);
  await expect(p1.locator('[aria-label="Online"]').first()).toBeVisible();

  // Hide p2b's tab too → both sessions AFK → u2 becomes AFK
  await p2b.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(p1.locator('[aria-label="Away"]').first()).toBeVisible({ timeout: 3000 });

  await ctx1.close();
  await ctx2a.close();
  await ctx2b.close();
});

// ─── T-F5-04: Unread count badge ────────────────────────────────────────────

// T-F5-04: Room sidebar shows unread count; opening room clears count to 0
test("T-F5-04 unread count badge appears and clears on room open", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  // Create a room with both users
  const roomName = uniqueRoomName();
  const rResp = await p1.request.post("http://localhost:8080/api/rooms", {
    data: { name: roomName, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  const { id: roomId } = await rResp.json();
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p1 logs out — will log in after p2 sends messages
  await p1.request.post("http://localhost:8080/api/auth/logout");

  // p2 sends 3 messages
  await p2.goto(`/rooms/${roomId}`);
  for (let i = 1; i <= 3; i++) {
    await p2.locator("textarea").fill(`unread-msg-${i}`);
    await p2.click('[aria-label="Send"]');
    await expect(p2.locator(`text=unread-msg-${i}`).first()).toBeVisible({ timeout: 5000 });
  }

  // p1 logs back in — getMyRooms returns unread count = 3
  await login(p1, u1.email, u1.password);
  await p1.goto("/rooms");

  // Sidebar should show the room with unread badge
  const badge = p1.locator("aside a").filter({ hasText: roomName }).locator(".bg-destructive");
  await expect(badge).toBeVisible({ timeout: 5000 });

  // p1 opens the room → history loaded → read cursor upserted → count clears
  await p1.goto(`/rooms/${roomId}`);
  await expect(p1.locator("text=unread-msg-1").first()).toBeVisible({ timeout: 5000 });
  await p1.waitForTimeout(1000); // wait for invalidation to propagate

  // Badge should be gone
  await expect(p1.locator("aside a").filter({ hasText: roomName }).locator(".bg-destructive")).not.toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F5-05: Offline message delivery ──────────────────────────────────────

// T-F5-05: Message sent while user is offline → visible on login; room has unread badge
test("T-F5-05 offline user receives messages on login with unread badge", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  // Create room, both join
  const roomName = uniqueRoomName();
  const rResp = await p1.request.post("http://localhost:8080/api/rooms", {
    data: { name: roomName, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  const { id: roomId } = await rResp.json();
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p1 logs out
  await p1.request.post("http://localhost:8080/api/auth/logout");

  // p2 sends a message while p1 is offline
  await p2.goto(`/rooms/${roomId}`);
  const offlineMsg = `offline-${Date.now()}`;
  await p2.locator("textarea").fill(offlineMsg);
  await p2.click('[aria-label="Send"]');
  await expect(p2.locator(`text=${offlineMsg}`).first()).toBeVisible({ timeout: 5000 });

  // p1 logs back in → navigates to /rooms
  await login(p1, u1.email, u1.password);
  await p1.goto("/rooms");

  // Sidebar shows unread badge for the room
  await expect(p1.locator("aside").locator(`text=${roomName}`)).toBeVisible({ timeout: 3000 });
  // Badge (unread count) is present
  const roomLink = p1.locator("aside a").filter({ hasText: roomName });
  await expect(roomLink.locator(".bg-destructive")).toBeVisible({ timeout: 3000 });

  // Open the room → message is visible
  await p1.goto(`/rooms/${roomId}`);
  await expect(p1.locator(`text=${offlineMsg}`).first()).toBeVisible({ timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F5-06: DM_BANNED notification ────────────────────────────────────────

// T-F5-06: DM_BANNED notification disables MessageInput; history remains visible
test("T-F5-06 DM_BANNED notification disables MessageInput", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  // Set up friendship + DM room
  const dmRoomId = await setupFriendship(p1, p2);

  // p2 navigates to DM room — input is enabled
  await p2.goto(`/rooms/${dmRoomId}`);
  await expect(p2.locator("textarea")).toBeVisible({ timeout: 5000 });

  // p2 sends a message to establish history
  await p2.locator("textarea").fill("hello from p2");
  await p2.click('[aria-label="Send"]');
  await expect(p2.locator("text=hello from p2").first()).toBeVisible({ timeout: 5000 });

  // p1 bans p2 — backend creates room_bans row and pushes DM_BANNED to p2
  const u2Me = await p2.request.get("http://localhost:8080/api/auth/me");
  const { userId: u2Id } = await u2Me.json();
  await p1.request.post(`http://localhost:8080/api/users/${u2Id}/ban`);

  // p2's MessageInput should become disabled (shows disabledReason text)
  await expect(
    p2.locator("text=You have been banned from this conversation.").first(),
  ).toBeVisible({ timeout: 5000 });

  // History is still visible (read-only)
  await expect(p2.locator("text=hello from p2").first()).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});
