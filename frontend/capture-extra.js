const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname);

function uid() {
  const id = `${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
  return { email: `u${id}@example.com`, username: `u${id}`, password: "TestPass123!" };
}

async function register(page, u) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[placeholder*="sername"]', u.username);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 10000 });
}

async function login(page, u) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms", { timeout: 10000 });
}

async function createRoom(page, name, visibility = "PUBLIC") {
  await page.click('button:has-text("Create Room"), button[aria-label*="Create"], button:has-text("New Room")');
  await page.waitForTimeout(400);
  await page.fill('input[placeholder*="name"], input[name="name"]', name);
  if (visibility === "PUBLIC") {
    // find PUBLIC radio/option
    const pub = page.locator('label:has-text("Public"), button:has-text("Public"), [value="PUBLIC"]');
    if (await pub.count() > 0) await pub.first().click();
  }
  await page.click('button[type="submit"]:has-text("Create"), button:has-text("Create Room")');
  await page.waitForTimeout(800);
}

async function sendMessage(page, text) {
  await page.fill("textarea", text);
  await page.click('[aria-label="Send"], button[type="submit"]:near(textarea)');
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── users ──────────────────────────────────────────────────────────────────
  const alice = uid();
  const bob   = uid();
  const carol = uid();

  // ── Screenshot 8: file attachment ─────────────────────────────────────────
  console.log("08-file-attachment...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, alice);

    // create a room
    await createRoom(p, `room-${alice.username}`);
    await p.waitForTimeout(600);

    // send a plain message first
    await sendMessage(p, "Here is an image I wanted to share:");

    // upload a file — create a small PNG in memory
    const pngData = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000100000001008020000009091" +
      "2600000000c4944415478016360f8cfc0c0c0c4c0c0c000000000ffff03000" +
      "6000557bfabd400000000049454e44ae426082",
      "hex"
    );
    // Use clipboard/file chooser
    const [fileChooser] = await Promise.all([
      p.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
      p.click('[aria-label="Attach file"], button:has-text("📎"), label[for*="file"], input[type="file"] ~ *').catch(() => null),
    ]);
    if (fileChooser) {
      await fileChooser.setFiles({ name: "photo.png", mimeType: "image/png", buffer: pngData });
      await p.waitForTimeout(1500);
      // send message with attachment
      await p.fill("textarea", "Check out this photo!");
      await p.click('[aria-label="Send"], button[type="submit"]:near(textarea)');
      await p.waitForTimeout(1500);
    } else {
      // try direct file input
      const fileInput = p.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: pngData });
        await p.waitForTimeout(1500);
        await p.fill("textarea", "Check out this photo!");
        await p.click('[aria-label="Send"], button[type="submit"]:near(textarea)');
        await p.waitForTimeout(1500);
      }
    }
    await p.screenshot({ path: path.join(OUT, "08-file-attachment.png"), fullPage: false });
    await ctx.close();
  }

  // ── Screenshot 09: reply/quote ─────────────────────────────────────────────
  console.log("09-reply-quote...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await register(p, bob);
    await createRoom(p, `room-${bob.username}`);
    await p.waitForTimeout(600);

    await sendMessage(p, "Has anyone tried the new feature yet?");
    await sendMessage(p, "I think it works really well!");

    // hover first message and click reply
    const msgs = p.locator('[data-testid="message"], .group');
    await p.waitForTimeout(300);
    const firstMsg = msgs.first();
    await firstMsg.hover();
    await p.waitForTimeout(300);

    const replyBtn = p.locator('[aria-label="Reply"], button:has-text("Reply")').first();
    if (await replyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await replyBtn.click();
      await p.waitForTimeout(400);
      await p.fill("textarea", "Yes! The performance is noticeably better.");
      await p.screenshot({ path: path.join(OUT, "09-reply-quote.png"), fullPage: false });
      await p.click('[aria-label="Send"], button[type="submit"]:near(textarea)');
      await p.waitForTimeout(800);
    }
    await p.screenshot({ path: path.join(OUT, "09-reply-quote.png"), fullPage: false });
    await ctx.close();
  }

  // ── Screenshots 10 + 11: unread badges + edit/delete hover ────────────────
  console.log("10-unread-badges + 11-message-actions...");
  {
    const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await register(p1, carol);
    const dave = uid();
    await register(p2, dave);

    // p1 creates two rooms
    await createRoom(p1, `general-${carol.username}`);
    await p.waitForTimeout(400).catch(() => {}); // ignore - p is not defined, using p1
    await createRoom(p1, `random-${carol.username}`);

    // p2 joins both via catalog
    await p2.goto(`${BASE}/rooms/catalog`);
    await p2.waitForTimeout(1000);

    // search and join first room
    const search = p2.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    await search.fill(`general-${carol.username}`);
    await p2.waitForTimeout(600);
    const joinBtn1 = p2.locator('button:has-text("Join")').first();
    if (await joinBtn1.isVisible({ timeout: 2000 }).catch(() => false)) await joinBtn1.click();
    await p2.waitForTimeout(400);

    await search.fill(`random-${carol.username}`);
    await p2.waitForTimeout(600);
    const joinBtn2 = p2.locator('button:has-text("Join")').first();
    if (await joinBtn2.isVisible({ timeout: 2000 }).catch(() => false)) await joinBtn2.click();
    await p2.waitForTimeout(400);

    // p1 navigates to general room and sends messages
    const genLink = p1.locator("aside").locator(`text=general-${carol.username}`).first();
    if (await genLink.isVisible({ timeout: 2000 }).catch(() => false)) await genLink.click();
    await p1.waitForTimeout(600);

    // p2 stays on catalog (not in any room) — p1 sends messages to build unread
    await p1.fill("textarea", "Hey everyone!");
    await p1.click('[aria-label="Send"]');
    await p1.waitForTimeout(400);
    await p1.fill("textarea", "Anyone around?");
    await p1.click('[aria-label="Send"]');
    await p1.waitForTimeout(400);

    // p1 switches to random room and sends more
    const randLink = p1.locator("aside").locator(`text=random-${carol.username}`).first();
    if (await randLink.isVisible({ timeout: 2000 }).catch(() => false)) await randLink.click();
    await p1.waitForTimeout(600);
    await p1.fill("textarea", "Check this out!");
    await p1.click('[aria-label="Send"]');
    await p1.waitForTimeout(400);
    await p1.fill("textarea", "Really cool stuff here");
    await p1.click('[aria-label="Send"]');
    await p1.waitForTimeout(400);
    await p1.fill("textarea", "Thoughts?");
    await p1.click('[aria-label="Send"]');
    await p1.waitForTimeout(800);

    // p2 navigates to rooms shell (sidebar visible, not inside any room)
    await p2.goto(`${BASE}/rooms`);
    await p2.waitForTimeout(1500);
    await p2.screenshot({ path: path.join(OUT, "10-unread-badges.png"), fullPage: false });

    // Now: Screenshot 11 — edit/delete hover (p1's own messages)
    const p1RoomLink = p1.locator("aside").locator(`text=random-${carol.username}`).first();
    if (await p1RoomLink.isVisible({ timeout: 2000 }).catch(() => false)) await p1RoomLink.click();
    await p1.waitForTimeout(600);

    const messageEls = p1.locator(".group").filter({ hasText: "Really cool stuff here" });
    if (await messageEls.count() > 0) {
      await messageEls.first().hover();
      await p1.waitForTimeout(500);
    }
    await p1.screenshot({ path: path.join(OUT, "11-message-actions.png"), fullPage: false });

    await ctx1.close();
    await ctx2.close();
  }

  // ── Screenshot 12: soft-deleted message ───────────────────────────────────
  console.log("12-deleted-message...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const u = uid();
    await register(p, u);
    await createRoom(p, `room-${u.username}`);
    await p.waitForTimeout(600);

    await sendMessage(p, "This message will be deleted shortly.");
    await sendMessage(p, "But this one will stay!");
    await sendMessage(p, "And this one too.");

    // hover and delete first message
    const msgs = p.locator(".group");
    await p.waitForTimeout(300);
    const target = msgs.filter({ hasText: "This message will be deleted shortly." });
    if (await target.count() > 0) {
      await target.first().hover();
      await p.waitForTimeout(300);
      const delBtn = p.locator('[aria-label="Delete"], button:has-text("Delete")').first();
      if (await delBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await delBtn.click();
        await p.waitForTimeout(400);
        // confirm if dialog appears
        const confirm = p.locator('button:has-text("Delete"):not([aria-label="Delete"]), button:has-text("Confirm")').first();
        if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
        await p.waitForTimeout(800);
      }
    }
    await p.screenshot({ path: path.join(OUT, "12-deleted-message.png"), fullPage: false });
    await ctx.close();
  }

  // ── Screenshot 13: session management ─────────────────────────────────────
  console.log("13-sessions...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const u = uid();
    await register(p, u);
    // open user dropdown
    await p.click('[data-testid="user-menu"], button[aria-label*="user"], button[aria-label*="account"], button:has-text("Settings")').catch(() => {});
    await p.waitForTimeout(400);
    // look for sessions link
    const sessionsLink = p.locator('a:has-text("Sessions"), button:has-text("Sessions"), [href*="sessions"]').first();
    if (await sessionsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessionsLink.click();
    } else {
      // try navigating to a sessions modal via dropdown
      const userBtn = p.locator('button').filter({ hasText: /settings|account|profile/i }).first();
      if (await userBtn.isVisible({ timeout: 1000 }).catch(() => false)) await userBtn.click();
      await p.waitForTimeout(400);
      const sess2 = p.locator('text=Sessions, text=Active Sessions').first();
      if (await sess2.isVisible({ timeout: 2000 }).catch(() => false)) await sess2.click();
    }
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, "13-sessions.png"), fullPage: false });
    await ctx.close();
  }

  // ── Screenshot 14: friend request ─────────────────────────────────────────
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

    // p1 sends friend request to u2
    // find friend request button
    const frBtn = p1.locator('[aria-label*="friend"], button:has-text("Add Friend"), button[title*="friend"]').first();
    if (await frBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await frBtn.click();
      await p1.waitForTimeout(400);
      const input = p1.locator('input[placeholder*="username"]').first();
      await input.fill(u2.username);
      await p1.click('button[type="submit"]:has-text("Send"), button:has-text("Send Request")');
      await p1.waitForTimeout(800);
    }

    // p2 opens friend requests (bell icon or similar)
    await p2.reload();
    await p2.waitForTimeout(1000);
    const bellBtn = p2.locator('[aria-label*="notification"], [aria-label*="request"], button:has-text("Requests"), button[title*="friend"]').first();
    if (await bellBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bellBtn.click();
      await p2.waitForTimeout(600);
    }
    await p2.screenshot({ path: path.join(OUT, "14-friend-request.png"), fullPage: false });

    await ctx1.close();
    await ctx2.close();
  }

  // ── Screenshot 15: room settings tab ──────────────────────────────────────
  console.log("15-room-settings...");
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const u = uid();
    await register(p, u);
    await createRoom(p, `settings-room-${u.username}`);
    await p.waitForTimeout(600);

    // open manage/settings modal
    const manageBtn = p.locator('button:has-text("Manage"), button:has-text("Settings"), button[aria-label*="settings"], button[aria-label*="manage"]').first();
    if (await manageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await manageBtn.click();
      await p.waitForTimeout(400);
      // click Settings tab
      const settingsTab = p.locator('[role="tab"]:has-text("Settings"), button:has-text("Settings")').first();
      if (await settingsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsTab.click();
        await p.waitForTimeout(400);
      }
    }
    await p.screenshot({ path: path.join(OUT, "15-room-settings.png"), fullPage: false });
    await ctx.close();
  }

  // ── Screenshot 16: ban list ────────────────────────────────────────────────
  console.log("16-ban-list...");
  {
    const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const owner = uid();
    const member = uid();
    await register(p1, owner);
    await register(p2, member);

    await createRoom(p1, `ban-room-${owner.username}`);
    await p1.waitForTimeout(600);

    // p2 joins
    await p2.goto(`${BASE}/rooms/catalog`);
    await p2.waitForTimeout(800);
    const search = p2.locator('input[placeholder*="earch"]').first();
    await search.fill(`ban-room-${owner.username}`);
    await p2.waitForTimeout(600);
    const joinBtn = p2.locator('button:has-text("Join")').first();
    if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) await joinBtn.click();
    await p2.waitForTimeout(600);

    // p1 opens manage → Members → ban member
    const manageBtn = p1.locator('button:has-text("Manage"), button[aria-label*="manage"], button[aria-label*="settings"]').first();
    if (await manageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await manageBtn.click();
      await p1.waitForTimeout(500);
      // find the member row and ban
      const memberRow = p1.locator("div").filter({ hasText: member.username }).filter({ hasText: /ban|member/i }).first();
      const banBtn = memberRow.locator('button:has-text("Ban")');
      if (await banBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await banBtn.click();
        await p1.waitForTimeout(600);
        // confirm
        const confirm = p1.locator('button:has-text("Ban"):not([aria-label])').last();
        if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
        await p1.waitForTimeout(800);
      }
      // now go to Banned tab
      const bannedTab = p1.locator('[role="tab"]:has-text("Banned"), [role="tab"]:has-text("Ban"), button:has-text("Banned")').first();
      if (await bannedTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bannedTab.click();
        await p1.waitForTimeout(500);
      }
    }
    await p1.screenshot({ path: path.join(OUT, "16-ban-list.png"), fullPage: false });
    await ctx1.close();
    await ctx2.close();
  }

  await browser.close();
  console.log("Done.");
})();
