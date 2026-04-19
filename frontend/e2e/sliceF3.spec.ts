import { test, expect } from "@playwright/test";
import { uniqueUser, uniqueRoomName, register, login } from "./helpers";

// T-F3-01: Catalog page shows room name, description, member count
test("T-F3-01 catalog shows room name, description, member count", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  // Use page.request which shares cookies with the browser session
  await page.request.post("http://localhost:8080/api/rooms", {
    data: { name: roomName, visibility: "PUBLIC", description: "A test room" },
    headers: { "Content-Type": "application/json" },
  });

  await page.goto("/rooms/catalog");
  const main = page.locator("main");
  await expect(main.locator(`text=${roomName}`)).toBeVisible();
  await expect(main.locator("text=A test room").first()).toBeVisible();
  await expect(main.locator("text=members").first()).toBeVisible();
});

// T-F3-02: Catalog search filters rooms by name
test("T-F3-02 catalog search filters rooms by name", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const nameA = uniqueRoomName();
  const nameB = uniqueRoomName();
  await page.request.post("http://localhost:8080/api/rooms", {
    data: { name: nameA, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });
  await page.request.post("http://localhost:8080/api/rooms", {
    data: { name: nameB, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });

  await page.goto("/rooms/catalog");
  const main = page.locator("main");
  await page.fill('input[placeholder*="Search"]', nameA);
  await expect(main.locator(`text=${nameA}`)).toBeVisible();
  await expect(main.locator(`text=${nameB}`)).not.toBeVisible();
});

// T-F3-03: Create room → appears in sidebar
test("T-F3-03 create room → appears in sidebar", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  await page.click('[aria-label="Create room"]');
  await page.fill('#room-name', roomName);
  await page.click('button:has-text("Create room")');

  await page.waitForURL(/\/rooms\/\d+/);
  await expect(page.locator(`text=${roomName}`).first()).toBeVisible();
});

// T-F3-04: Create room with duplicate name → error shown
test("T-F3-04 create room duplicate name → error", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  await page.click('[aria-label="Create room"]');
  await page.fill('#room-name', roomName);
  await page.click('button:has-text("Create room")');
  await page.waitForURL(/\/rooms\/\d+/);

  await page.click('[aria-label="Create room"]');
  await page.fill('#room-name', roomName);
  await page.click('button:has-text("Create room")');
  await expect(page.locator("text=already exists")).toBeVisible();
});

// T-F3-05: Join public room via catalog → room in sidebar; user navigated to room
test("T-F3-05 join public room via catalog → in sidebar", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  // User A creates a public room
  const uA = uniqueUser();
  await register(page1, uA.email, uA.username, uA.password);
  const roomName = uniqueRoomName();
  await page1.request.post("http://localhost:8080/api/rooms", {
    data: { name: roomName, visibility: "PUBLIC" },
    headers: { "Content-Type": "application/json" },
  });

  // User B registers and joins via catalog
  const uB = uniqueUser();
  await register(page2, uB.email, uB.username, uB.password);
  await page2.goto("/rooms/catalog");
  await page2.fill('input[placeholder*="Search"]', roomName);
  await expect(page2.locator(`text=${roomName}`)).toBeVisible();
  await page2.locator(`button:has-text("Join")`).first().click();
  await page2.waitForURL(/\/rooms\/\d+/);

  // Navigate back to rooms index where the accordion is expanded, then check sidebar
  await page2.goto("/rooms");
  await expect(page2.locator("aside").locator(`text=${roomName}`)).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

// T-F3-06: App shell shows top menu, center message area, bottom input, right sidebar
test("T-F3-06 app shell layout present", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);
  await page.goto("/rooms");

  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
});

// T-F3-07: Sidebar section has collapse/expand control
test("T-F3-07 sidebar rooms section collapse/expand", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  // The search input is inside the collapsible Rooms section body
  await expect(page.locator('[aria-label="Search rooms"]')).toBeVisible();

  // Click the Rooms section toggle to collapse
  const toggleBtn = page.locator('aside button').filter({ hasText: /^Rooms$/i }).first();
  await toggleBtn.click();
  await expect(page.locator('[aria-label="Search rooms"]')).toBeHidden();

  // Click to expand again
  await toggleBtn.click();
  await expect(page.locator('[aria-label="Search rooms"]')).toBeVisible();
});

// T-F3-08: Entering a room collapses the sidebar accordion
test("T-F3-08 entering room collapses sidebar accordion", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  // Verify search is visible on rooms index
  await expect(page.locator('[aria-label="Search rooms"]')).toBeVisible();

  // Create a room to navigate into
  const roomName = uniqueRoomName();
  await page.click('[aria-label="Create room"]');
  await page.fill('#room-name', roomName);
  await page.click('button:has-text("Create room")');
  await page.waitForURL(/\/rooms\/\d+/);

  // When inside a room, the rooms accordion collapses — search input hidden
  await expect(page.locator('[aria-label="Search rooms"]')).toBeHidden();
});

// T-F3-09: Top nav shows logo and Public Rooms link
test("T-F3-09 top nav shows logo and public rooms link", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  await expect(page.locator("header").locator("text=Relay")).toBeVisible();
  await expect(page.locator("header").locator("text=Public Rooms")).toBeVisible();
});

// T-F3-10: Sidebar shows "Public" and "Private" room group labels
test("T-F3-10 sidebar has Public and Private sections", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  await expect(page.locator("aside").locator("text=Public").first()).toBeVisible();
  await expect(page.locator("aside").locator("text=Private").first()).toBeVisible();
});

// T-F3-11: Sidebar has search field and "Create room" button
test("T-F3-11 sidebar has search field and create room button", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  await expect(page.locator('[aria-label="Create room"]')).toBeVisible();
  await expect(page.locator('[aria-label="Search rooms"]')).toBeVisible();
});

// T-F3-12: Members panel shows member count and list when a room is open
test("T-F3-12 members panel in room", async ({ page }) => {
  const u = uniqueUser();
  await register(page, u.email, u.username, u.password);

  const roomName = uniqueRoomName();
  await page.click('[aria-label="Create room"]');
  await page.fill('#room-name', roomName);
  await page.click('button:has-text("Create room")');
  await page.waitForURL(/\/rooms\/\d+/);

  await expect(page.locator("aside").locator("text=Members").first()).toBeVisible();
  await expect(page.locator("aside").locator(`text=${u.username}`)).toBeVisible();
});
