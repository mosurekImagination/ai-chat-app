import { test, expect } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register } from "./helpers";

// NF2: STOMP gap recovery — messages sent while p1 was offline appear after reconnect.
test("NF2 missed messages recovered after STOMP reconnect", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();

  try {
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Register user1 and create a public room
    const u1 = uniqueUser();
    await register(p1, u1.email, u1.username, u1.password);
    const roomName = uniqueRoomName();
    const createResp = await p1.request.post("http://localhost:8080/api/rooms", {
      data: { name: roomName, visibility: "PUBLIC" },
      headers: { "Content-Type": "application/json" },
    });
    const { id: roomId } = await createResp.json();
    await p1.goto(`/rooms/${roomId}`);

    // Register user2 and join the same room
    const u2 = uniqueUser();
    await register(p2, u2.email, u2.username, u2.password);
    await p2.request.post(`http://localhost:8080/api/rooms/${roomId}/join`, {
      headers: { "Content-Type": "application/json" },
    });
    await p2.goto(`/rooms/${roomId}`);
    // Wait for p2's STOMP subscription to be active before p1 sends
    await expect(p2.locator("textarea")).toBeEnabled({ timeout: 8000 });

    // Both users online: send a baseline message to establish p1's watermark
    const baseline = `baseline-${Date.now()}`;
    await p1.fill("textarea", baseline);
    await p1.click('[aria-label="Send"]');
    await expect(p1.locator(`text=${baseline}`).first()).toBeVisible({ timeout: 5000 });
    // Wait for p2 to also receive it (confirms both are STOMP-connected)
    await expect(p2.locator(`text=${baseline}`).first()).toBeVisible({ timeout: 5000 });

    // Take p1 offline — STOMP connection drops.
    // Wait 4 s so the WebSocket close event propagates through SockJS before proceeding.
    await ctx1.setOffline(true);
    await p1.waitForTimeout(4000);

    // Send 3 gap messages from p2 while p1 is offline
    const gapMsgs: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const msg = `gap-${i}-${Date.now()}`;
      gapMsgs.push(msg);
      await p2.fill("textarea", msg);
      await p2.click('[aria-label="Send"]');
      await expect(p2.locator(`text=${msg}`).first()).toBeVisible({ timeout: 5000 });
    }

    // Bring p1 back online — STOMP reconnects (up to 5 s delay) then gap recovery fires
    await ctx1.setOffline(false);

    // All 3 gap messages must appear in p1's chat within 20 s
    // (5 s reconnect delay + HTTP request + render)
    for (const msg of gapMsgs) {
      await expect(p1.locator(`text=${msg}`).first()).toBeVisible({ timeout: 20000 });
    }

    // Banner is a nice-to-have; check it opportunistically but don't fail if already gone
    const bannerVisible = await p1.locator('[aria-label="reconnect-banner"]').isVisible();
    if (bannerVisible) {
      await expect(p1.locator('[aria-label="reconnect-banner"]')).toBeVisible();
    }

  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});
