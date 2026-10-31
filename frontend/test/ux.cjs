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
    else if (path === "/resource" || path === "/resource/%E4%BA%A7%E5%93%81") body = [{ name: "Tasks", files: state.cards }, { name: "In progress", files: [] }];
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
    const currentCard = () => state.cards.find(c => socket.url().endsWith(c.id));
    doc.getText("content").insert(0, currentCard()?.content || "");
    socket.onMessage(message => {
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const type = decoding.readVarUint(decoder), encoder = encoding.createEncoder();
      if (type === 0) {
        encoding.writeVarUint(encoder, 0); sync.readSyncMessage(decoder, encoder, doc, null);
        const card = currentCard();
        if (card) card.content = doc.getText("content").toString();
        if (encoding.length(encoder) > 1) socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      } else if (type === 4) {
        const card = currentCard();
        if (card) card.content = doc.getText("content").toString();
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

test("card details keep properties compact and the editor usable across viewport sizes", async () => {
  const { page } = await workspace({ path: "/%E4%BA%A7%E5%93%81/" });
  try {
    await page.locator(".card").first().click();
    await page.getByText("✓ Saved", { exact: true }).waitFor();
    const dialog = page.locator("dialog.card-details");
    assert.equal(await dialog.locator(".card-details__context").innerText(), "产品 / Tasks");
    for (const width of [1440, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await dialog.evaluate(el => {
        const rect = selector => el.querySelector(selector).getBoundingClientRect();
        const properties = rect(".card-details__properties"), editor = rect(".collab-editor");
        const modes = rect(".md-editor__modes"), actions = rect(".md-editor__toolbar .team-actions");
        return { overflow: el.scrollWidth > el.clientWidth, propertiesHeight: properties.height, editorHeight: editor.height, toolbarOverlap: modes.right > actions.left && modes.top < actions.bottom && actions.top < modes.bottom };
      });
      assert.equal(layout.overflow, false, `no horizontal overflow at ${width}px`);
      assert(layout.propertiesHeight < 190, `compact properties at ${width}px`);
      assert(layout.editorHeight > 300, `editor uses remaining space at ${width}px`);
      assert.equal(layout.toolbarOverlap, false, `toolbar groups do not overlap at ${width}px`);
      if (width <= 600) assert(await dialog.evaluate(el => el.clientHeight >= innerHeight - 2), "mobile dialog fills the viewport");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await dialog.locator(".dialog__toolbar-btn").first().click();
    assert(await dialog.evaluate(el => el.clientWidth >= innerWidth - 2), "maximized dialog fills the viewport");
    await dialog.locator(".dialog__toolbar-btn").first().click();
    await dialog.getByRole("button", { name: "Preview", exact: true }).click();
    await dialog.locator(".markdown-body").getByText("Review the results.").waitFor();
  } finally { await page.close(); }
});

test("dark mode cursor contrast, stateful auto-save without confirm prompt, auto-refresh on close, sticky header, unified date format, three-dot menu dismissal, and drag handle sorting", async () => {
  const { page, state } = await workspace();
  try {
    let dialogPromptTriggered = false;
    page.on("dialog", async (d) => {
      dialogPromptTriggered = true;
      await d.dismiss();
    });

    await page.locator(".card").first().waitFor();

    // Issue 7: Three-dot menu opens and closes cleanly on outside click or toggle
    const firstCardMenuBtn = page.locator(".card").first().locator(".header-buttons button[popovertarget]");
    await firstCardMenuBtn.click();
    const cardPopup = page.locator('.popup[role="menu"]').first();
    await cardPopup.waitFor({ state: "visible" });
    await page.locator(".app-header").click({ position: { x: 10, y: 10 } });
    assert.equal(await cardPopup.isVisible(), false, "card options menu must close when clicking outside");

    // Toggle open and close by clicking the same 3-dot button twice
    await firstCardMenuBtn.click();
    await cardPopup.waitFor({ state: "visible" });
    await firstCardMenuBtn.click();
    assert.equal(await cardPopup.isVisible(), false, "card options menu must toggle closed on second click");

    // Lane 3-dot menu also closes on outside click
    const laneMenuBtn = page.locator(".lane__header button[popovertarget]").first();
    await laneMenuBtn.click();
    const lanePopup = page.locator('.popup[role="menu"]').first();
    await lanePopup.waitFor({ state: "visible" });
    await page.locator(".lane__body").first().click({ position: { x: 20, y: 260 } });
    assert.equal(await lanePopup.isVisible(), false, "lane options menu must close when clicking outside");

    // Issue 4: Drag handle exists, dragging reorders cards even from default sort without opening card modal
    const handles = page.locator(".card__drag-handle");
    assert.equal(await handles.count(), 2, "each active card has a drag handle");
    const initialNames = await page.locator(".card .card__name").allInnerTexts();
    assert.deepEqual(initialNames, ["\uD83D\uDCDD First task", "\uD83D\uDCDD Second task"]);

    const firstHandleBox = await handles.first().boundingBox();
    const secondCardBox = await page.locator(".card").nth(1).boundingBox();
    await page.mouse.move(firstHandleBox.x + firstHandleBox.width / 2, firstHandleBox.y + firstHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(firstHandleBox.x + firstHandleBox.width / 2, firstHandleBox.y + firstHandleBox.height / 2 + 10, { steps: 3 });
    await page.mouse.move(secondCardBox.x + 20, secondCardBox.y + secondCardBox.height + 15, { steps: 8 });
    await page.mouse.up();

    assert.equal(await page.locator("dialog.card-details").count(), 0, "releasing mouse after dragging must not open card");
    const reorderedNames = await page.locator(".card .card__name").allInnerTexts();
    assert.deepEqual(reorderedNames, ["\uD83D\uDCDD Second task", "\uD83D\uDCDD First task"], "cards must reorder after drag and drop");
    assert(state.writes.includes("/sort"), "manual sort order is persisted to backend");

    // Open "First task" to test Issues 1, 2, 3, 5, 6
    await page.locator("#card-First\\ task").click();
    const dialog = page.locator("dialog.card-details");
    await dialog.waitFor();
    const saveBtn = dialog.locator("button.collab-save-btn");
    await saveBtn.waitFor();
    await page.getByText("✓ Saved", { exact: true }).waitFor();

    // Issue 1: Dark mode cursor & caret contrast
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const cursorStyles = await page.evaluate(() => {
      const inputCaret = getComputedStyle(document.querySelector(".search-input")).caretColor;
      const cmCaret = getComputedStyle(document.querySelector(".collab-editor .cm-content")).caretColor;
      return { inputCaret, cmCaret };
    });
    assert.notEqual(cursorStyles.inputCaret, "rgb(0, 0, 0)", "dark mode input caret must not be black");
    assert.notEqual(cursorStyles.cmCaret, "rgb(0, 0, 0)", "dark mode editor caret must not be black");

    // Issue 5: Unified YYYY-MM-DD due date display & clear button
    const dueInput = dialog.locator("#card-due");
    assert.equal(await dueInput.getAttribute("lang"), "en-CA");
    assert.equal(await dueInput.getAttribute("data-date-display"), "2026-09-06");
    await dialog.locator(".dialog__due-date-clear").click();
    assert.equal(await dueInput.getAttribute("data-date-display"), "YYYY-MM-DD");
    assert.equal(await dueInput.getAttribute("data-empty"), "true");

    // Issue 2 & 3: Typing in editor auto-saves, clears draft key after ACK, updates board on close without confirm dialog
    const cmContent = dialog.locator(".collab-editor .cm-content");
    await cmContent.click();
    await page.keyboard.insertText(`\n[tag:urgent] [person:charlie] [due:2026-09-10]\n${"long line\n".repeat(20)}`);
    await page.getByText("✓ Saved", { exact: true }).waitFor();
    await page.clock.runFor(400);
    const hasStaleDraft = await page.evaluate(() => localStorage.getItem("tasks-draft:first"));
    assert.equal(hasStaleDraft, null, "acknowledged auto-save must not leave stale draft in localStorage");

    // Issue 6: Scrolling down inside dialog__body keeps dialog__toolbar sticky at the top
    const stickyCheck = await dialog.evaluate((el) => {
      const body = el.querySelector(".dialog__body");
      const toolbar = el.querySelector(".dialog__toolbar");
      body.scrollTop = 250;
      const bodyRect = body.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      return {
        scrolled: body.scrollTop > 0,
        pinnedAtTop: Math.abs(toolbarRect.top - bodyRect.top) <= 2,
        position: getComputedStyle(toolbar).position,
      };
    });
    assert.equal(stickyCheck.position, "sticky");
    assert.equal(stickyCheck.pinnedAtTop, true, "header toolbar stays pinned at top when scrolling card modal");

    // Close card and verify no confirm prompt & board auto-refreshes with new tag, person, and due date
    await dialog.locator(".dialog__toolbar-btn").last().click();
    assert.equal(dialogPromptTriggered, false, "closing a synced card must never trigger an unsaved changes confirm dialog");
    assert.equal(await dialog.count(), 0);

    const updatedCard = page.locator("#card-First\\ task");
    await updatedCard.locator(".tag", { hasText: "urgent" }).first().waitFor();
    await updatedCard.locator(".person", { hasText: "charlie" }).first().waitFor();
  } finally { await page.close(); }
});
