const { chromium } = require("playwright");
const path = require("path");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "../screenshots");

function uid() {
  const id = `${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
  return { email: `u${id}@example.com`, username: `u${id}`, password: "TestPass123!" };
}

async function register(page, u) {
  await page.goto(`${BASE}/register`);
  await page.fill("#email", u.email);
  await page.fill("#username", u.username);
  await page.fill("#password", u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 15000 });
  // wait for STOMP to connect and page to stabilise
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function createRoom(page, name, visibility = "PUBLIC") {
  await page.click('[aria-label="Create room"]');
  await page.waitForTimeout(400);
  await page.fill("#room-name", name);
  if (visibility === "PRIVATE") {
    await page.click('button:has-text("Private")');
    await page.waitForTimeout(200);
  }
  await page.click('button:has-text("Create")');
  await page.waitForTimeout(1000);
}

async function sendMsg(page, text) {
  await page.fill("textarea", text);
  await page.click('[aria-label="Send"]');
  await page.waitForTimeout(500);
}

// Navigate to catalog and join a room by name (UI-only, with retries for STOMP re-renders)
async function joinRoomViaCatalog(page, roomName) {
  await page.goto(`${BASE}/rooms/catalog`);
  // wait for the page to fully settle (STOMP may trigger re-renders on connect)
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // use locator-based fill with explicit retry to handle transient re-renders
  const searchInput = page.locator('input[placeholder*="Search rooms"]').first();
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(500); // let STOMP re-renders settle before interacting
  await searchInput.fill(roomName);
  await page.waitForTimeout(800);

  const joinBtn = page.locator('button:has-text("Join")').first();
  await joinBtn.waitFor({ state: "visible", timeout: 5000 });
  await joinBtn.click();
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── 08: file attachment ────────────────────────────────────────────────────
  console.log("08-file-attachment...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, uid());
    await createRoom(p, `room-${Date.now().toString().slice(-6)}`);

    await sendMsg(p, "Check out this screenshot I took:");

    // minimal valid 2×2 white PNG
    const pngData = Buffer.from([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x02,0x00,0x00,0x00,0x02,
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
      0xde,0x00,0x00,0x00,0x12,0x49,0x44,0x41,
      0x54,0x78,0x9c,0x62,0xf8,0xff,0xff,0x3f,
      0x00,0x05,0xfe,0x02,0xfe,0xdc,0xcc,0x59,
      0xe7,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,
      0x44,0xae,0x42,0x60,0x82
    ]);
    const [fc] = await Promise.all([
      p.waitForEvent("filechooser", { timeout: 5000 }),
      p.click('[aria-label="Attach file"]'),
    ]);
    await fc.setFiles({ name: "screenshot.png", mimeType: "image/png", buffer: pngData });
    await p.waitForTimeout(1500);
    const hasPending = await p.locator("text=screenshot.png").isVisible({ timeout: 2000 }).catch(() => false);
    if (hasPending) await sendMsg(p, "Here it is!");
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, "08-file-attachment.png") });
    await ctx.close();
  }

  // ── 09: reply / quote ──────────────────────────────────────────────────────
  console.log("09-reply-quote...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, uid());
    await createRoom(p, `chat-${Date.now().toString().slice(-6)}`);

    await sendMsg(p, "Has anyone tried the new dark mode?");
    await sendMsg(p, "It looks amazing on OLED screens.");
    await sendMsg(p, "The contrast ratio is excellent.");

    const firstMsg = p.locator(".group").filter({ hasText: "Has anyone tried the new dark mode?" }).first();
    await firstMsg.hover();
    await p.waitForTimeout(400);
    await p.click('[aria-label="Reply"]');
    await p.waitForTimeout(400);
    await p.fill("textarea", "Agreed! Especially on the chat bubbles.");
    await p.screenshot({ path: path.join(OUT, "09-reply-quote.png") });
    await ctx.close();
  }

  // ── 10: unread badges ──────────────────────────────────────────────────────
  console.log("10-unread-badges...");
  {
    const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const u1 = uid();
    const u2 = uid();
    const suffix = Date.now().toString().slice(-6);
    await register(p1, u1);
    await register(p2, u2);

    // p1 creates two rooms
    await createRoom(p1, `general-${suffix}`);
    await createRoom(p1, `random-${suffix}`);

    // p2 joins both rooms first (catalog navigates p2 into the room, setting read cursor)
    await joinRoomViaCatalog(p2, `general-${suffix}`);
    await joinRoomViaCatalog(p2, `random-${suffix}`);

    // p2 leaves both rooms and sits on the rooms shell
    await p2.goto(`${BASE}/rooms`);
    await p2.waitForTimeout(800);

    // p1 sends messages NOW — p2 is not inside either room so no auto-mark-read
    await p1.goto(`${BASE}/rooms`);
    await p1.waitForTimeout(600);
    await p1.locator("aside a").filter({ hasText: `general-${suffix}` }).click();
    await p1.waitForTimeout(600);
    for (const msg of ["Hey everyone!", "Anyone around?", "New feature shipped today"]) {
      await sendMsg(p1, msg);
    }
    await p1.goto(`${BASE}/rooms`);
    await p1.waitForTimeout(600);
    await p1.locator("aside a").filter({ hasText: `random-${suffix}` }).click();
    await p1.waitForTimeout(600);
    for (const msg of ["Check this out!", "Really cool stuff", "Thoughts?"]) {
      await sendMsg(p1, msg);
    }
    await p1.waitForTimeout(600);

    // p2 reloads to refetch unread counts from the API
    await p2.reload();
    await p2.waitForTimeout(2000);
    await p2.screenshot({ path: path.join(OUT, "10-unread-badges.png") });
    await ctx1.close();
    await ctx2.close();
  }

  // ── 11: message action buttons (hover) ────────────────────────────────────
  console.log("11-message-actions...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, uid());
    await createRoom(p, `actions-${Date.now().toString().slice(-6)}`);

    await sendMsg(p, "First message for context");
    await sendMsg(p, "Hover over me to see the action buttons");
    await sendMsg(p, "Another message below");

    const target = p.locator(".group").filter({ hasText: "Hover over me to see the action buttons" }).first();
    await target.hover();
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, "11-message-actions.png") });
    await ctx.close();
  }

  // ── 12: soft-deleted message ───────────────────────────────────────────────
  console.log("12-deleted-message...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, uid());
    await createRoom(p, `deleted-${Date.now().toString().slice(-6)}`);

    await sendMsg(p, "This message is about to be deleted.");
    await sendMsg(p, "This one stays.");
    await sendMsg(p, "And this one too.");

    const target = p.locator(".group").filter({ hasText: "This message is about to be deleted." }).first();
    await target.hover();
    await p.waitForTimeout(400);
    const delBtn = p.locator('[aria-label="Delete"]').first();
    if (await delBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await delBtn.click();
      await p.waitForTimeout(400);
      const confirm = p.locator('[role="alertdialog"] button:has-text("Delete"), [role="dialog"] button:has-text("Delete")').last();
      if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirm.click();
        await p.waitForTimeout(800);
      }
    }
    await p.screenshot({ path: path.join(OUT, "12-deleted-message.png") });
    await ctx.close();
  }

  // ── 13: session management ─────────────────────────────────────────────────
  console.log("13-sessions...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const u = uid();
    await register(p, u);
    await p.locator("header button").filter({ hasText: u.username }).click();
    await p.waitForTimeout(500);
    const sessItem = p.locator('[role="menuitem"]').filter({ hasText: /session/i }).first();
    if (await sessItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessItem.click();
      await p.waitForTimeout(600);
    }
    await p.screenshot({ path: path.join(OUT, "13-sessions.png") });
    await ctx.close();
  }

  // ── 14: friend request ─────────────────────────────────────────────────────
  console.log("14-friend-request...");
  {
    const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const u1 = uid();
    const u2 = uid();
    await register(p1, u1);
    await register(p2, u2);

    // p1 sends a friend request to u2
    await p1.click('[aria-label="Add friend"]');
    await p1.waitForTimeout(500);
    await p1.fill("#friend-username", u2.username);
    await p1.click('button:has-text("Send request")');
    await p1.waitForTimeout(800);

    // p2 opens the friend requests panel — sidebar shows incoming request
    await p2.click('[aria-label="Friend requests"]');
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: path.join(OUT, "14-friend-request.png") });
    await ctx1.close();
    await ctx2.close();
  }

  // ── 15: room settings tab ──────────────────────────────────────────────────
  console.log("15-room-settings...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, uid());
    await createRoom(p, `settings-${Date.now().toString().slice(-6)}`);

    await p.click('[aria-label="Room info"]');
    await p.waitForTimeout(400);
    await p.click('[aria-label="Manage"]');
    await p.waitForTimeout(500);
    const settingsTab = p.locator('[role="tab"]:has-text("Settings")').first();
    if (await settingsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsTab.click();
      await p.waitForTimeout(500);
    }
    await p.screenshot({ path: path.join(OUT, "15-room-settings.png") });
    await ctx.close();
  }

  // ── 16: ban list ───────────────────────────────────────────────────────────
  console.log("16-ban-list...");
  {
    const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const owner = uid();
    const member = uid();
    const suffix = Date.now().toString().slice(-6);
    await register(p1, owner);
    await register(p2, member);

    await createRoom(p1, `ban-room-${suffix}`);

    // p2 joins the room via catalog UI
    await joinRoomViaCatalog(p2, `ban-room-${suffix}`);

    // p1 opens Manage → Members → ban the member
    await p1.click('[aria-label="Room info"]');
    await p1.waitForTimeout(400);
    await p1.click('[aria-label="Manage"]');
    await p1.waitForTimeout(600);

    const memberRow = p1.locator("div.rounded-md").filter({ hasText: member.username }).first();
    const banBtn = memberRow.locator('button:has-text("Ban")').first();
    if (await banBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await banBtn.click();
      await p1.waitForTimeout(400);
      const confirmBtn = p1.locator('[role="alertdialog"] button:has-text("Ban"), [role="dialog"] button:has-text("Ban")').last();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await p1.waitForTimeout(800);
      }
    }
    const bannedTab = p1.locator('[role="tab"]:has-text("Banned")').first();
    if (await bannedTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bannedTab.click();
      await p1.waitForTimeout(500);
    }
    await p1.screenshot({ path: path.join(OUT, "16-ban-list.png") });
    await ctx1.close();
    await ctx2.close();
  }

  await browser.close();
  console.log("All done.");
})();
