// Run against Vite with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

test("settings navigation, member actions, errors, keyboard and mobile layout", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let failUsers = false, resets = 0;
    const users = [{ username: "alice", admin: true }, { username: "bob", admin: false }];
    await page.route("**/_api/**", async (route) => {
      const url = new URL(route.request().url()), path = url.pathname.replace("/_api", "");
      let body = {}, status = 200;
      if (path === "/auth/config") body = { title: "Test workspace", supportContact: "" };
      if (path === "/auth/me") body = users[0];
      if (path === "/auth/users") { body = users; if (failUsers) { status = 500; body = { error: "Unable to load members" }; } }
      if (path === "/auth/reset") { resets++; body = { temporaryPassword: "temporary-test-password" }; }
      if (path === "/tree" || path === "/resource" || path === "/cards") body = [];
      if (path === "/history") body = [{ id: 1, actor: "alice", action: "edit", path: "/Board/Card.md", before: "Before", after: "After", updated: "2026-09-05T12:00:00Z" }];
      if (path === "/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
      if (path === "/title") return route.fulfill({ body: "Test workspace" });
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:13000");
    await page.waitForTimeout(1200);
    assert.deepEqual(errors, [], "application must load without module or runtime errors");
    const opener = page.getByRole("button", { name: "Settings", exact: true });
    await opener.click();
    const panel = page.getByRole("dialog", { name: "Settings", exact: true });
    await panel.waitFor();
    assert(await panel.evaluate((element) => element.clientWidth === innerWidth && element.clientHeight === innerHeight), "settings must fill the viewport");
    await panel.getByRole("button", { name: "Members", exact: true }).click();
    assert.equal(await page.locator("dialog[open]").count(), 1, "member management stays in settings");
    const bob = panel.locator(".member-row").filter({ hasText: "bob" });
    await bob.getByRole("button", { name: "Reset password", exact: true }).click();
    assert.equal(resets, 0, "reset needs inline confirmation");
    await bob.getByRole("button", { name: "Confirm", exact: true }).click();
    await panel.getByText("temporary-test-password", { exact: true }).waitFor();
    assert.equal(resets, 1);
    await panel.getByRole("button", { name: "Activity history", exact: true }).click();
    await panel.locator(".history-entry summary").click();
    assert.equal(await panel.locator(".history-diff").innerText(), "Before\nBefore\nAfter\nAfter");
    await panel.getByRole("button", { name: "Account & security", exact: true }).click();
    await panel.locator('input[name="newPassword"]').fill("some-new-password");
    await panel.getByRole("button", { name: "General", exact: true }).click();
    await panel.getByRole("button", { name: "Account & security", exact: true }).click();
    assert.equal(await panel.locator('input[name="newPassword"]').inputValue(), "some-new-password");
    const search = panel.getByRole("searchbox", { name: "Search settings" });
    await search.fill("export");
    await panel.getByRole("button", { name: "Export data", exact: true }).click();
    await search.fill("no-match");
    await panel.getByText("No matching settings").waitFor();
    await search.fill("");
    failUsers = true;
    await panel.getByRole("button", { name: "Members", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    failUsers = false;
    await panel.getByRole("button", { name: "Retry", exact: true }).click();
    await panel.getByText("bob", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await panel.count(), 0);
    assert(await opener.evaluate((element) => element === document.activeElement));
    await page.keyboard.press("Control+,");
    await panel.waitFor();
    await panel.getByRole("button", { name: "General", exact: true }).click();
    await panel.getByRole("button", { name: "Dark", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await panel.getByRole("button", { name: "Light", exact: true }).click();
    for (const width of [390, 720]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth), "settings must fit mobile viewport");
      for (const section of ["Members", "Activity history", "Account & security", "Keyboard shortcuts"]) {
        await panel.getByRole("button", { name: section, exact: true }).click();
        assert(await panel.locator(".preferences-content").evaluate((element) => element.scrollWidth <= element.clientWidth), section + " must not overflow");
      }
    }
    await page.keyboard.press("Escape");
    users[0].admin = false;
    await page.reload();
    await opener.click();
    await panel.waitFor();
    assert.equal(await panel.getByRole("button", { name: "Members", exact: true }).count(), 0, "members cannot access administration");
    await panel.getByRole("button", { name: "Account & security", exact: true }).click();
    await panel.locator('input[name="newPassword"]').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
