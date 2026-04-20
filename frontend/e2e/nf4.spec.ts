import { test, expect, Browser } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register } from "./helpers";

const API = "http://localhost:8080";

async function getMyUserId(page: Parameters<typeof register>[0]): Promise<number> {
  const resp = await page.request.get(`${API}/api/auth/me`);
  const body = await resp.json();
  return body.userId as number;
}

// ─── NF4-01: private room is not visible in the public catalog UI ──────────────

test("NF4-01 private room is absent from catalog for non-members", async ({ page }) => {
  const owner = uniqueUser();
  const other = uniqueUser();
  await register(page, owner.email, owner.username, owner.password);

  const roomName = uniqueRoomName();
  await page.request.post(`${API}/api/rooms`, {
    data: { name: roomName, visibility: "PRIVATE" },
    headers: { "Content-Type": "application/json" },
  });

  // Switch to the other user's session
  await page.request.post(`${API}/api/auth/logout`);
  await register(page, other.email, other.username, other.password);

  await page.goto("/rooms/catalog");
  await expect(page.locator("main")).toBeVisible({ timeout: 5000 });

  // Private room must not appear in the catalog
  await expect(page.locator("main").locator(`text=${roomName}`)).not.toBeVisible();
});

// ─── NF4-02: description update is reflected in catalog ───────────────────────

test("NF4-02 updating room description via PATCH is visible in catalog", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  const createResp = await page.request.post(`${API}/api/rooms`, {
    data: { name: roomName, visibility: "PUBLIC", description: "original desc" },
    headers: { "Content-Type": "application/json" },
  });
  const { id: roomId } = await createResp.json();

  await page.request.patch(`${API}/api/rooms/${roomId}`, {
    data: { description: "updated desc" },
    headers: { "Content-Type": "application/json" },
  });

  await page.goto("/rooms/catalog");
  const main = page.locator("main");
  await expect(main.locator(`text=${roomName}`)).toBeVisible({ timeout: 5000 });
  await expect(main.locator("text=updated desc").first()).toBeVisible();
  await expect(main.locator("text=original desc")).not.toBeVisible();
});

// ─── NF4-03: Unban via UI → member can rejoin public room ─────────────────────

test("NF4-03 unban via manage dialog lets previously banned user rejoin", async ({ browser }: { browser: Browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage(); // owner
  const p2 = await ctx2.newPage(); // member who gets banned

  try {
    const u1 = uniqueUser();
    await register(p1, u1.email, u1.username, u1.password);
    const u2 = uniqueUser();
    await register(p2, u2.email, u2.username, u2.password);

    const roomName = uniqueRoomName();
    const createResp = await p1.request.post(`${API}/api/rooms`, {
      data: { name: roomName, visibility: "PUBLIC" },
      headers: { "Content-Type": "application/json" },
    });
    const { id: roomId } = await createResp.json();

    // p2 joins
    await p2.request.post(`${API}/api/rooms/${roomId}/join`);

    // p1 bans p2 via API (ban already covered by T-F6-05)
    const u2Id = await getMyUserId(p2);
    await p1.request.post(`${API}/api/rooms/${roomId}/bans`, {
      data: { userId: u2Id },
      headers: { "Content-Type": "application/json" },
    });

    // p1 opens the Manage dialog and uses the Unban button
    await p1.goto(`/rooms/${roomId}`);
    await p1.locator('[aria-label="Manage"]').click();
    await p1.locator('[role="tab"]:has-text("Banned")').click();

    const banRow = p1.locator('[role="dialog"]').locator("div.rounded-md").filter({ hasText: u2.username });
    await expect(banRow.locator('button:has-text("Unban")')).toBeVisible({ timeout: 5000 });
    await banRow.locator('button:has-text("Unban")').click();

    // Banned row disappears from the dialog
    await expect(banRow).not.toBeVisible({ timeout: 5000 });

    // p2 can now rejoin via the catalog
    await p2.goto("/rooms/catalog");
    const roomCard = p2.locator("main").locator(`text=${roomName}`).locator("../..").first();
    const joinBtn = roomCard.locator('button:has-text("Join"), a:has-text("Join")');
    await expect(joinBtn).toBeVisible({ timeout: 5000 });
    await joinBtn.click();

    // p2 lands in the room
    await p2.waitForURL(`**/rooms/${roomId}**`, { timeout: 5000 });

  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ─── NF4-04: username shown in auth/me is the original registration username ──

test("NF4-04 username in profile is the original registration value and cannot differ", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  // The /api/auth/me endpoint must return the exact username used at registration
  const meResp = await page.request.get(`${API}/api/auth/me`);
  const me = await meResp.json();
  expect(me.username).toBe(u.username);

  // After a page reload the username is still the same (not reset or changed by any background call)
  await page.reload();
  const meResp2 = await page.request.get(`${API}/api/auth/me`);
  const me2 = await meResp2.json();
  expect(me2.username).toBe(u.username);
});
