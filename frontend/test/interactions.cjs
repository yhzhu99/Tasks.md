// Run against Vite with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function openWorkspace(browser, path = "/") {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], writes = [];
  const card = { id: "test-card", name: "Finished task", lane: "Tasks", board: "", content: "[done:2026-09-05T12:00:00Z]", version: "v1" };
  await page.route("**/_api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/_api", "");
    if (request.method() !== "GET") writes.push(request.method());
    let body = {};
    if (path === "/auth/config") body = { title: "Test workspace" };
    if (path === "/auth/me") body = { username: "alice", admin: true };
    if (path === "/tree") body = [];
    if (path === "/resource") body = [{ name: "Tasks", files: [] }];
    if (path === "/cards") body = [card];
    if (path === "/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path === "/title") return route.fulfill({ body: "Test workspace" });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${process.env.TEST_BASE_URL || "http://127.0.0.1:13000"}${path}`);
  await page.locator(".app-header").waitFor();
  return { page, errors, writes };
}

test("lane options open and cancelling deletion keeps the lane", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  try {
    const { page, errors, writes } = await openWorkspace(browser);
    await page.locator(".lane__header button[popovertarget]").click();
    assert.deepEqual(errors, [], "opening an action menu must not crash");
    await page.getByRole("button", { name: "Delete lane", exact: true }).click();
    assert.deepEqual(writes, [], "deletion must wait for confirmation");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".lane").count(), 1);
    assert.deepEqual(writes, []);
  } finally { await browser.close(); }
});

test("restoring a completed card with the keyboard keeps the completed view open", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  try {
    for (const key of ["Enter", "Space"]) {
      const { page, errors, writes } = await openWorkspace(browser, "/_done/");
      const restore = page.getByRole("button", { name: "Restore", exact: true });
      await restore.focus();
      const response = page.waitForResponse((response) => response.request().method() === "PATCH", { timeout: 3000 });
      await restore.press(key);
      await response;
      assert.equal(new URL(page.url()).pathname, "/_done/");
      assert.deepEqual(writes, ["PATCH"]);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
