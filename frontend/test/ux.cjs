const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] }); });
after(async () => { await browser.close(); });

async function workspace(options = {}) {
  const page = await browser.newPage({ viewport: { width: options.width || 1440, height: 900 }, locale: "en-US", timezoneId: options.timezone || "Asia/Shanghai" });
  page.setDefaultTimeout(4000);
  await page.clock.install({ time: new Date(options.time || "2026-09-06T12:00:00+08:00") });
  if (options.filter) await page.addInitScript(() => localStorage.setItem("filteredTag", JSON.stringify("old-tag")));
  const state = { fail: options.fail, writes: [], cards: [
    { id: "first", name: "First task", content: "[person:alice] [due:2026-09-06]\n\nReview the results.", version: "v1", board: "", lane: "Tasks" },
    { id: "second", name: "Second task", content: "[person:bob] [review:2026-09-05T12:00:00Z]\n\nPrepare a report.", version: "v1", board: "", lane: "Tasks" },
  ] };
  await page.route("**/_api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/_api", "");
    let body = {}, status = 200;
    if (path === state.fail) { status = 503; body = { error: "Temporarily unavailable" }; }
    else if (request.method() !== "GET") {
      state.writes.push(path);
      if (path === "/image") { status = 413; body = { error: "Image too large" }; }
      if (state.failSecond && path.endsWith("Second task.md")) { status = 500; body = { error: "Could not update second task" }; }
      else if (request.method() === "PATCH") {
        const data = request.postDataJSON();
        state.cards = state.cards.map(card => path.endsWith(`${card.name}.md`) ? { ...card, content: data.content || card.content } : card);
      }
    }
    else if (path === "/auth/config") body = { title: "UX workspace" };
    else if (path === "/auth/me") body = { username: "alice", admin: true };
    else if (path === "/auth/users") body = [{ username: "alice", admin: true }];
    else if (path === "/tree" || path === "/history") body = [];
    else if (path === "/resource") body = [{ name: "Tasks", files: state.cards }, { name: "In progress", files: [] }];
    else if (path === "/cards") body = state.cards;
    else if (path === "/title") return route.fulfill({ body: "UX workspace" });
    else if (path === "/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  // A real Yjs sync exchange, isolated from the workspace's collaboration server.
  const Y = require("../node_modules/yjs");
  const sync = require("../node_modules/y-protocols/dist/sync.cjs");
  const encoding = require("../node_modules/lib0/dist/encoding.cjs");
  const decoding = require("../node_modules/lib0/dist/decoding.cjs");
  await page.routeWebSocket("**/_api/collab/**", (socket) => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, state.cards.find(c => socket.url().endsWith(c.id))?.content || "");
    socket.onMessage(message => {
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const type = decoding.readVarUint(decoder), encoder = encoding.createEncoder();
      if (type === 0) {
        encoding.writeVarUint(encoder, 0); sync.readSyncMessage(decoder, encoder, doc, null);
        if (encoding.length(encoder) > 1) socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      } else if (type === 4) {
        encoding.writeVarUint(encoder, 4); encoding.writeVarUint(encoder, decoding.readVarUint(decoder)); encoding.writeVarString(encoder, "v2");
        socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      }
    });
    socket.onClose(() => doc.destroy());
  });
  await page.goto(`${process.env.TEST_BASE_URL || "http://127.0.0.1:13000"}${options.path || "/"}`);
  return { page, state };
}

test("stale tag filters remain visible and can be cleared", async () => {
  const { page } = await workspace({ filter: true });
  try {
    await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
    await page.locator(".card").first().waitFor();
    assert.equal(await page.locator(".card").count(), 2);
    await page.getByRole("searchbox").fill("no match");
    await page.getByText("No matching cards", { exact: true }).waitFor();
  } finally { await page.close(); }
});

test("due dates use Shanghai calendar days even on a device in another timezone", async () => {
  for (const [timezone, time] of [["Asia/Shanghai", "2026-09-06T12:00:00+08:00"], ["America/Los_Angeles", "2026-09-06T00:01:00+08:00"]]) {
    const { page } = await workspace({ timezone, time });
    try {
      await page.locator(".card__due-date--in-time").waitFor();
      assert.match(await page.locator(".card__due-date").first().innerText(), /Due today/);
      await page.clock.fastForward(24 * 60 * 60 * 1000);
      await page.locator(".card__due-date--past-time").waitFor();
    } finally { await page.close(); }
  }
});

test("card details trap focus, show status without workflow buttons, and recover from upload errors", async () => {
  const { page } = await workspace();
  try {
    await page.locator(".card").first().click();
    const dialog = page.getByRole("dialog", { name: "First task", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("button", { name: /Mark.*priority|Mark.*review|Mark.*done/i }).count(), 0);
    assert(await dialog.evaluate(el => el.matches(":modal")));
    await page.getByText("✓ Saved", { exact: true }).waitFor();
    const upload = dialog.getByRole("button", { name: "Upload image", exact: true });
    await dialog.locator('input[type="file"]').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("test") });
    await dialog.getByText("Image too large", { exact: true }).waitFor();
    assert(await dialog.locator(".cm-content").evaluate(el => el.contentEditable === "true"));
    assert(await upload.isEnabled());
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => !!document.activeElement.closest("dialog")), "focus stays in details");
    }
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
  } finally { await page.close(); }
});

for (const fail of ["/auth/config", "/resource", "/cards"]) {
  test(`loading failure ${fail} offers a working retry`, async () => {
    const { page, state } = await workspace({ fail, path: fail === "/cards" ? "/_review/" : "/" });
    try {
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      state.fail = null;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.locator(fail === "/cards" ? ".inbox-card" : ".card").first().waitFor();
    } finally { await page.close(); }
  });
}

test("mobile controls fit without covering cards", async () => {
  const { page } = await workspace({ width: 390 });
  try {
    await page.locator(".card").first().waitFor();
    assert(await page.locator(".app-header").evaluate(el => el.getBoundingClientRect().height <= 110));
    assert.equal(await page.locator(".sidebar--collapsed").isVisible(), false);
    await page.locator(".card").first().click();
    const dialog = page.getByRole("dialog", { name: "First task", exact: true });
    await dialog.waitFor();
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  } finally { await page.close(); }
});
