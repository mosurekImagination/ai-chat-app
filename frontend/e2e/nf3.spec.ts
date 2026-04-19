import { test, expect } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register } from "./helpers";

// NF3: Large message history — 10K messages, scroll integrity, no duplicates, correct order.
test("NF3 large history: scroll 20 pages, no duplicate IDs, ascending order, page fetch < 1s", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  // Create a public room
  const roomName = uniqueRoomName();
  const createResp = await page.request.post("http://localhost:8080/api/rooms", {
    data: { name: roomName, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  expect(createResp.status()).toBe(201);
  const { id: roomId } = await createResp.json();

  // Get the user's ID from /api/auth/me
  const meResp = await page.request.get("http://localhost:8080/api/auth/me");
  const { userId } = await meResp.json();

  // Seed 10 000 messages via the dev endpoint (local/test profile only)
  const seedResp = await page.request.post(
    `http://localhost:8080/api/dev/seed/rooms/${roomId}/messages?count=10000&userId=${userId}`,
    { headers: { "Content-Type": "application/json" } }
  );
  expect(seedResp.status()).toBe(200);
  const { inserted } = await seedResp.json();
  expect(inserted).toBe(10000);

  // Capture paginated fetch timings before navigating
  const pageFetchTimings: number[] = [];
  await page.route(`**/api/messages/${roomId}?before=*`, async (route) => {
    const start = Date.now();
    const response = await route.fetch();
    pageFetchTimings.push(Date.now() - start);
    await route.fulfill({ response });
  });

  // Navigate to the room — newest 50 messages load
  await page.goto(`/rooms/${roomId}`);
  await expect(page.locator("textarea")).toBeEnabled({ timeout: 15000 });

  // Give initial load time to settle
  await page.waitForTimeout(500);

  // Scroll to top 20 times; each triggers IntersectionObserver → loadOlder
  const scrollContainer = page.locator(".overflow-y-auto").first();
  for (let i = 0; i < 20; i++) {
    await scrollContainer.evaluate((el) => { el.scrollTop = 0; });
    // Wait for the fetch + React state update to complete
    await page.waitForTimeout(600);
  }

  // Collect all data-message-id attributes from the rendered DOM
  const seenIds = await page.evaluate(() => {
    const items = document.querySelectorAll("[data-message-id]");
    return Array.from(items).map((el) => Number((el as HTMLElement).dataset.messageId));
  });

  // (a) All pages loaded — more than the initial 50 messages visible
  expect(seenIds.length).toBeGreaterThan(50);

  // (b) No duplicate IDs
  const uniqueIds = new Set(seenIds);
  expect(uniqueIds.size).toBe(seenIds.length);

  // (c) Messages in correct order: IDs strictly ascending (oldest → newest, top → bottom)
  for (let i = 1; i < seenIds.length; i++) {
    expect(seenIds[i]).toBeGreaterThan(seenIds[i - 1]);
  }

  // (d) Each paginated backend fetch completed in < 1000ms
  expect(pageFetchTimings.length).toBeGreaterThan(0);
  for (const timing of pageFetchTimings) {
    expect(timing).toBeLessThan(1000);
  }

  // Allow DB to settle after 10K inserts before subsequent tests run
  await page.waitForTimeout(2000);
});
