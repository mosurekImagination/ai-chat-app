import { Page, APIRequestContext } from "@playwright/test";

let seq = Date.now();
export function uniqueUser() {
  seq++;
  return {
    email: `testuser${seq}@example.com`,
    username: `testuser${seq}`,
    password: "TestPass123!",
  };
}

export function uniqueRoomName() {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

/** Create a room via the API, returns the room id */
export async function createRoomViaApi(
  request: APIRequestContext,
  name: string,
  visibility: "PUBLIC" | "PRIVATE" = "PUBLIC",
  description?: string,
): Promise<number> {
  const resp = await request.post("http://localhost:8080/api/rooms", {
    data: { name, visibility, description },
    headers: { "Content-Type": "application/json" },
  });
  const body = await resp.json();
  return body.id as number;
}
