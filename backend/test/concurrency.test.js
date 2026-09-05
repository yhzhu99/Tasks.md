const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("a stale REST save cannot overwrite another editor's content", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-concurrency-"));
  fs.mkdirSync(`${dir}/config`, { recursive: true });
  fs.writeFileSync(`${dir}/config/users.json`, JSON.stringify({ users: [{ username: "alice", role: "admin", initialPassword: "test_alice" }] }));
  const port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    env: { ...process.env, PORT: String(port), TASKS_DIR: `${dir}/tasks`, CONFIG_DIR: `${dir}/config`, LOCAL_IMAGES_CLEANUP_INTERVAL: "0", COOKIE_SECURE: "false", TITLE: "", SUPPORT_CONTACT: "" },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}/_api`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/title`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 30)); }
  }
  assert.deepEqual(await fetch(`${base}/auth/config`).then((response) => response.json()), { title: "Tasks.md", supportContact: "" });
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "alice", password: "test_alice" }) });
  assert.equal(login.status, 200);
  let cookie = login.headers.get("set-cookie").split(";")[0];
  const changed = await fetch(`${base}/auth/password`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ currentPassword: "test_alice", newPassword: "a-test-password-2026" }) });
  assert.equal(changed.status, 200);
  cookie = changed.headers.get("set-cookie").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  await fetch(`${base}/resource/Test.md`, { method: "POST", headers, body: JSON.stringify({ isFile: true, content: "Saved work" }) });
  const stale = await fetch(`${base}/resource/Test.md`, { method: "PATCH", headers: { ...headers, "If-Match": '"stale-version"' }, body: JSON.stringify({ content: "Overwritten" }) });
  assert.equal(stale.status, 412);
  assert.equal(fs.readFileSync(`${dir}/tasks/Test.md`, "utf8"), "Saved work");
});
