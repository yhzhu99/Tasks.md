const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("card edits notify once as content and do not force a structural refresh", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-events-"));
  fs.mkdirSync(`${dir}/config`, { recursive: true });
  fs.writeFileSync(`${dir}/config/users.json`, JSON.stringify({ users: [{ username: "alice", role: "admin", initialPassword: "test_alice" }] }));
  const port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    env: { ...process.env, PORT: String(port), TASKS_DIR: `${dir}/tasks`, CONFIG_DIR: `${dir}/config`, LOCAL_IMAGES_CLEANUP_INTERVAL: "0", COOKIE_SECURE: "false", TITLE: "", SUPPORT_CONTACT: "", REALTIME_CONTENT_DEBOUNCE_MS: "400" },
    stdio: "ignore",
  });
  let reader;
  t.after(async () => {
    reader?.cancel().catch(() => {});
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}/_api`;
  for (let i = 0; i < 1000; i++) {
    try { await fetch(`${base}/title`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 30)); }
  }
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "alice", password: "test_alice" }) });
  assert.equal(login.status, 200);
  let cookie = login.headers.get("set-cookie").split(";")[0];
  const changed = await fetch(`${base}/auth/password`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ currentPassword: "test_alice", newPassword: "a-test-password-2026" }) });
  assert.equal(changed.status, 200);
  cookie = changed.headers.get("set-cookie").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const received = [];
  const stream = await fetch(`${base}/events`, { headers: { Cookie: cookie } });
  assert.equal(stream.status, 200);
  reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const data = chunk.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
        if (data) received.push(JSON.parse(data));
      }
    }
  })();
  pump.catch(() => {});
  const waitFor = async (predicate, timeout = 2000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`timed out waiting for events: ${JSON.stringify(received)}`);
  };

  assert.equal((await fetch(`${base}/resource/Lane`, { method: "POST", headers, body: "{}" })).status, 201);
  const created = await fetch(`${base}/resource/Lane/Card.md`, { method: "POST", headers, body: JSON.stringify({ isFile: true, content: "one" }) });
  assert.equal(created.status, 201);
  await waitFor(() => received.filter((event) => event.kind === "structure").length >= 2);
  const createdEvent = received.find((event) => event.kind === "structure" && event.path === "/Lane/Card.md");
  assert.equal(createdEvent.id.length > 0, true);
  const beforeEdits = received.length;

  const edit = async (content, etag) => {
    const response = await fetch(`${base}/resource/Lane/Card.md`, { method: "PATCH", headers: { ...headers, "If-Match": etag }, body: JSON.stringify({ content }) });
    assert.equal(response.status, 204, await response.clone().text());
    return response.headers.get("etag");
  };
  let etag = created.headers.get("etag");
  etag = await edit("two", etag);
  etag = await edit("three", etag);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const edits = received.slice(beforeEdits);
  assert.deepEqual(edits.map((event) => event.kind), ["content"], "typing must not force every board to reload");
  assert.equal(edits[0].path, "/Lane/Card.md");
  assert.equal(edits[0].id, createdEvent.id);
  void etag;
});
