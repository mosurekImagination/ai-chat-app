import { Page } from "@playwright/test";

let seq = Date.now();
export function uniqueUser() {
  seq++;
  return {
    email: `testuser${seq}@example.com`,
    username: `testuser${seq}`,
    password: "TestPass123!",
  };
}

export async function register(page: Page, email: string, username: string, password: string) {
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input#username', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms**");
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/rooms**");
}

export async function logout(page: Page) {
  await page.click('[aria-label="Open user menu"], button:has-text("Sign out"), [role="menuitem"]:has-text("Sign out")');
  try {
    await page.click('[role="menuitem"]:has-text("Sign out")');
  } catch {
    // already clicked
  }
  await page.waitForURL("**/login**");
}
