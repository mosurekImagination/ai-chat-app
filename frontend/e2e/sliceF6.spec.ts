import { test, expect, Browser } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register, login } from "./helpers";

// ─── helpers ────────────────────────────────────────────────────────────────

type Page = ReturnType<Browser["newPage"]> extends Promise<infer T> ? T : never;

async function createRoom(
  page: Page,
  name: string,
  visibility: "PUBLIC" | "PRIVATE" = "PUBLIC",
): Promise<number> {
  const resp = await page.request.post("http://localhost:8080/api/rooms", {
    data: { name, visibility },
    headers: { "Content-Type": "application/json" },
  });
  const { id } = await resp.json();
  return id as number;
}

async function getMyUserId(page: Page): Promise<number> {
  const resp = await page.request.get("http://localhost:8080/api/auth/me");
  const { userId } = await resp.json();
  return userId as number;
}

// ─── T-F6-01: modal has 5 tabs ───────────────────────────────────────────────

test("T-F6-01 manage room modal has 5 tabs", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const u = uniqueUser();
  await register(p, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p, roomName);

  await p.goto(`/rooms/${roomId}`);
  // Open the manage modal via the gear button in MembersPanel
  await p.locator('[aria-label="Manage"]').click();

  await expect(p.locator('[role="tab"]:has-text("Members")')).toBeVisible({ timeout: 3000 });
  await expect(p.locator('[role="tab"]:has-text("Admins")')).toBeVisible();
  await expect(p.locator('[role="tab"]:has-text("Banned")')).toBeVisible();
  await expect(p.locator('[role="tab"]:has-text("Invitations")')).toBeVisible();
  await expect(p.locator('[role="tab"]:has-text("Settings")')).toBeVisible();

  await ctx.close();
});

// ─── T-F6-02: members tab action buttons ─────────────────────────────────────

test("T-F6-02 members tab shows correct action buttons for admin and member", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  await p1.goto(`/rooms/${roomId}`);
  await p1.locator('[aria-label="Manage"]').click();

  // u2 is a regular member — should see Make admin and Ban buttons
  const memberRow = p1.locator('[role="dialog"]').locator("div.rounded-md").filter({ hasText: u2.username });
  await expect(memberRow.locator('button:has-text("Make admin")')).toBeVisible({ timeout: 3000 });
  await expect(memberRow.locator('button:has-text("Ban")')).toBeVisible();

  // Promote u2 to admin then check buttons change
  await memberRow.locator('button:has-text("Make admin")').click();
  await expect(memberRow.locator('button:has-text("Remove admin")')).toBeVisible({ timeout: 3000 });
  await expect(memberRow.locator('button:has-text("Ban")')).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-03: owner row has no ban/remove actions ────────────────────────────

test("T-F6-03 owner row has no remove or ban actions", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p2, roomName); // p2 is the owner
  await p1.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p1 (non-owner admin scenario: let's just use p1 as a regular member viewing the modal via p2)
  // Use p2 (owner) to open manage and check own row
  await p2.goto(`/rooms/${roomId}`);
  await p2.locator('[aria-label="Manage"]').click();

  const ownerRow = p2.locator('[role="dialog"]').locator("div.rounded-md").filter({ hasText: u2.username });
  await expect(ownerRow.locator('button:has-text("Ban")')).not.toBeVisible({ timeout: 3000 });
  await expect(ownerRow.locator('button:has-text("Make admin")')).not.toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-04: admins tab shows owner label ───────────────────────────────────

test("T-F6-04 admins tab shows owner with cannot-lose-admin-rights label", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const u = uniqueUser();
  await register(p, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p, roomName);

  await p.goto(`/rooms/${roomId}`);
  await p.locator('[aria-label="Manage"]').click();
  await p.locator('[role="tab"]:has-text("Admins")').click();

  await expect(p.locator('[role="dialog"]').locator("text=cannot lose admin rights")).toBeVisible({ timeout: 3000 });
  // Remove admin button should NOT appear for the owner
  await expect(p.locator('[role="dialog"]').locator('button:has-text("Remove admin")')).not.toBeVisible();

  await ctx.close();
});

// ─── T-F6-05: ban member → kicked; cannot rejoin public room ─────────────────

test("T-F6-05 ban member → user kicked; cannot rejoin public room", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p1 bans p2 via API
  const u2Id = await getMyUserId(p2);
  await p1.request.post(`http://localhost:8080/api/rooms/${roomId}/bans`, {
    data: { userId: u2Id },
    headers: { "Content-Type": "application/json" },
  });

  // p2 should no longer be a member
  const membersResp = await p1.request.get(`http://localhost:8080/api/rooms/${roomId}/members`);
  const members: Array<{ userId: number }> = await membersResp.json();
  expect(members.find((m) => m.userId === u2Id)).toBeUndefined();

  // p2 tries to rejoin → should be blocked (403 ROOM_BANNED)
  const joinResp = await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);
  expect(joinResp.status()).toBe(403);

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-06: invite to private room ─────────────────────────────────────────

test("T-F6-06 invite to private room by username → invitee sees room in sidebar", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName, "PRIVATE");

  // p1 invites p2 by username via API
  await p1.request.post(`http://localhost:8080/api/rooms/${roomId}/invitations`, {
    data: { username: u2.username },
    headers: { "Content-Type": "application/json" },
  });

  // p2 joins (invite allows it)
  const joinResp = await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);
  expect(joinResp.status()).toBe(201);

  // p2 navigates to /rooms — private room appears in sidebar
  await p2.goto("/rooms");
  await expect(p2.locator("aside").locator(`text=${roomName}`)).toBeVisible({ timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-07: leave room (owner cannot leave) ────────────────────────────────

test("T-F6-07 owner has no Leave button; other members can leave", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p1 (owner) — Leave button absent
  await p1.goto(`/rooms/${roomId}`);
  await expect(p1.locator('[aria-label="Leave room"]')).not.toBeVisible({ timeout: 3000 });

  // p2 (member) — Leave button present; click it
  await p2.goto(`/rooms/${roomId}`);
  await expect(p2.locator('[aria-label="Leave room"]')).toBeVisible({ timeout: 3000 });
  await p2.locator('[aria-label="Leave room"]').click();

  // p2 is navigated away; room no longer in sidebar
  await expect(p2).toHaveURL("/rooms", { timeout: 5000 });
  await expect(p2.locator("aside").locator(`text=${roomName}`)).not.toBeVisible({ timeout: 3000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-08: delete room ────────────────────────────────────────────────────

test("T-F6-08 owner deletes room → members navigated away, room gone from sidebar", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p2 is inside the room when p1 deletes it
  await p2.goto(`/rooms/${roomId}`);
  await expect(p2.locator("header").locator(`text=${roomName}`)).toBeVisible({ timeout: 3000 });

  // p1 deletes the room
  await p1.request.delete(`http://localhost:8080/api/rooms/${roomId}`);

  // p2 is navigated away and the room disappears from their sidebar
  await expect(p2).toHaveURL("/rooms", { timeout: 5000 });
  await expect(p2.locator("aside").locator(`text=${roomName}`)).not.toBeVisible({ timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-09: banned user loses file access ──────────────────────────────────

test("T-F6-09 banned user loses file access; file accessible after unban + rejoin", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p2 uploads a file
  const fileContent = Buffer.from("hello test file");
  const uploadResp = await p2.request.post("http://localhost:8080/api/files/upload", {
    multipart: {
      file: { name: "test.png", mimeType: "image/png", buffer: fileContent },
      roomId: String(roomId),
      originalFilename: "test.png",
    },
  });
  expect(uploadResp.status()).toBe(201);
  const { attachmentId } = await uploadResp.json();

  // p1 bans p2
  const u2Id = await getMyUserId(p2);
  await p1.request.post(`http://localhost:8080/api/rooms/${roomId}/bans`, {
    data: { userId: u2Id },
    headers: { "Content-Type": "application/json" },
  });

  // p2 can no longer download the file (404 = hidden per spec to avoid leakage)
  const downloadResp = await p2.request.get(`http://localhost:8080/api/files/${attachmentId}`);
  expect(downloadResp.status()).toBeGreaterThanOrEqual(400);

  // p1 unbans p2
  await p1.request.delete(`http://localhost:8080/api/rooms/${roomId}/bans/${u2Id}`);

  // p2 rejoins
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p2 can now download the file
  const downloadResp2 = await p2.request.get(`http://localhost:8080/api/files/${attachmentId}`);
  expect(downloadResp2.status()).toBe(200);

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-10: banned tab content ─────────────────────────────────────────────

test("T-F6-10 banned tab shows username, banned-by, date, unban button", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  const u2Id = await getMyUserId(p2);
  await p1.request.post(`http://localhost:8080/api/rooms/${roomId}/bans`, {
    data: { userId: u2Id },
    headers: { "Content-Type": "application/json" },
  });

  await p1.goto(`/rooms/${roomId}`);
  await p1.locator('[aria-label="Manage"]').click();
  await p1.locator('[role="tab"]:has-text("Banned")').click();

  const banRow = p1.locator('[role="dialog"]').locator("div.rounded-md").filter({ hasText: u2.username });
  await expect(banRow.locator(`text=${u2.username}`)).toBeVisible({ timeout: 3000 });
  await expect(banRow.locator(`text=${u1.username}`)).toBeVisible(); // banned by
  await expect(banRow.locator('button:has-text("Unban")')).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

// ─── T-F6-11: admin can delete any message ───────────────────────────────────

test("T-F6-11 admin can delete any message in the room", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const u1 = uniqueUser();
  await register(p1, u1.email, u1.username, u1.password);
  const u2 = uniqueUser();
  await register(p2, u2.email, u2.username, u2.password);

  const roomName = uniqueRoomName();
  const roomId = await createRoom(p1, roomName);
  await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`);

  // p2 sends a message
  await p2.goto(`/rooms/${roomId}`);
  await p2.locator("textarea").fill("admin-delete-test");
  await p2.click('[aria-label="Send"]');
  await expect(p2.locator("text=admin-delete-test").first()).toBeVisible({ timeout: 5000 });

  // p1 (admin) navigates to room — should see delete button on p2's message
  await p1.goto(`/rooms/${roomId}`);
  await expect(p1.locator("text=admin-delete-test").first()).toBeVisible({ timeout: 5000 });

  // Hover the message to reveal action buttons
  const msgEl = p1.locator("text=admin-delete-test").first();
  await msgEl.hover();
  await expect(p1.locator('[aria-label="Delete"]').first()).toBeVisible({ timeout: 3000 });

  await ctx1.close();
  await ctx2.close();
});
