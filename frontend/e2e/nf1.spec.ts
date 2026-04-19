import { test, expect } from "@playwright/test";
import { uniqueUser, register } from "./helpers";

// NFR-1: Presence accuracy — optimistic AFK on tab hidden; instant ONLINE on tab visible.
test("NF1-a AFK signal sent immediately when tab hidden", async ({ browser }) => {
  // Two browser contexts: p1 is the user going AFK; p2 is a friend watching presence.
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Register p1 and p2
    const u1 = uniqueUser();
    const u2 = uniqueUser();
    await register(p1, u1.email, u1.username, u1.password);
    await register(p2, u2.email, u2.username, u2.password);

    // Send friend request from p1 to p2 and accept
    const reqResp = await p1.request.post("http://localhost:8080/api/friends/requests", {
      data: { username: u2.username },
      headers: { "Content-Type": "application/json" },
    });
    const { id: reqId } = await reqResp.json();
    await p2.request.patch(`http://localhost:8080/api/friends/requests/${reqId}`, {
      data: { action: "ACCEPT" },
      headers: { "Content-Type": "application/json" },
    });

    // Navigate to rooms so both users have the sidebar visible
    await p1.goto("/rooms");
    await p2.goto("/rooms");

    // Wait for p2's contacts section to show p1 as online
    await expect(
      p2.locator("aside").locator(`text=${u1.username}`)
    ).toBeVisible({ timeout: 5000 });

    // Simulate p1's tab going hidden — triggers immediate AFK signal
    await p1.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // p2 should see p1 as AFK within 3 s (PresenceDot renders aria-label="Away" for AFK)
    await expect(
      p2.locator("aside").locator('[aria-label="Away"]')
    ).toBeVisible({ timeout: 5000 });

    // Simulate p1's tab becoming visible again — immediate ONLINE recovery
    await p1.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // p2 should see p1 as ONLINE again within 3 s (aria-label="Online")
    await expect(
      p2.locator("aside").locator('[aria-label="Online"]')
    ).toBeVisible({ timeout: 5000 });

  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// NFR-1: Activity event triggers heartbeat within 2 s (cursor move → ONLINE status maintained)
test("NF1-b pointermove sends activity heartbeat — user stays ONLINE", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    const u1 = uniqueUser();
    const u2 = uniqueUser();
    await register(p1, u1.email, u1.username, u1.password);
    await register(p2, u2.email, u2.username, u2.password);

    const reqResp = await p1.request.post("http://localhost:8080/api/friends/requests", {
      data: { username: u2.username },
      headers: { "Content-Type": "application/json" },
    });
    const { id: reqId } = await reqResp.json();
    await p2.request.patch(`http://localhost:8080/api/friends/requests/${reqId}`, {
      data: { action: "ACCEPT" },
      headers: { "Content-Type": "application/json" },
    });

    await p1.goto("/rooms");
    await p2.goto("/rooms");

    // Verify p1 is visible in p2's contacts
    await expect(p2.locator("aside").locator(`text=${u1.username}`)).toBeVisible({ timeout: 5000 });

    // Move the cursor on p1's page — this should throttle-send an activity heartbeat
    await p1.mouse.move(100, 100);
    await p1.mouse.move(200, 200);

    // p1 should remain ONLINE in p2's contacts (PresenceDot aria-label="Online")
    await expect(
      p2.locator("aside").locator('[aria-label="Online"]')
    ).toBeVisible({ timeout: 3000 });

  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});
