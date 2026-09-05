const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");
const { unzipSync, strFromU8 } = require("fflate");

async function until(check) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 20)); }
  assert.fail("Timed out waiting for behavior");
}
function client(url, cookie, username) {
  const doc = new Y.Doc();
  class AuthenticatedSocket extends WebSocket {
    constructor(address, protocols) { super(address, protocols, { headers: { Cookie: cookie, Origin: "http://localhost" } }); }
  }
  const split = url.lastIndexOf("/");
  const provider = new WebsocketProvider(url.slice(0, split), url.slice(split + 1), doc, { WebSocketPolyfill: AuthenticatedSocket, disableBc: true });
  provider.awareness.setLocalStateField("user", { name: username, color: "#527cce", colorLight: "#527cce33" });
  return { doc, provider, ready: () => provider.synced, text: doc.getText("content"), close: () => { provider.destroy(); doc.destroy(); } };
}

test("team authentication, collaboration, history, export and restart", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-team-"));
  fs.mkdirSync(`${dir}/tasks/Board/Todo`, { recursive: true });
  fs.mkdirSync(`${dir}/config/images`, { recursive: true });
  fs.writeFileSync(`${dir}/tasks/Board/.board`, "");
  fs.writeFileSync(`${dir}/tasks/Board/Todo/Card.md`, "# Original\n![image](/_api/image/example.png)\n");
  fs.writeFileSync(`${dir}/config/images/example.png`, "image-test");
  fs.writeFileSync(`${dir}/config/users.json`, JSON.stringify({ users: [{ username: "alice", role: "admin", initialPassword: "test_alice" }, { username: "bob", role: "member", initialPassword: "test_bob" }] }));
  const port = 29000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}/_api`;
  let child;
  const start = async () => {
    child = spawn(process.execPath, [path.join(__dirname, "../server.js")], { env: { ...process.env, PORT: String(port), TASKS_DIR: `${dir}/tasks`, CONFIG_DIR: `${dir}/config`, COOKIE_SECURE: "false", TITLE: "Example workspace", SUPPORT_CONTACT: "Email help@example.com" }, stdio: "ignore" });
    await until(async () => { try { return (await fetch(`${base}/title`)).status === 401; } catch { return false; } });
  };
  const stop = async () => { const exit = once(child, "exit"); child.kill(); await exit; };
  t.after(async () => { if (child.exitCode === null) await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  await start();
  const request = (route, cookie = "", body, method = body === undefined ? "GET" : "POST", headers = {}) => fetch(`${base}${route}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
  assert.deepEqual(await request("/auth/config").then((response) => response.json()), { title: "Example workspace", supportContact: "Email help@example.com" });
  for (const route of ["/cards", "/tree", "/resource", "/history", "/export", "/image/example.png", "/auth/users"]) assert.equal((await request(route)).status, 401, route);
  assert.equal((await request("/auth/login", "", { username: "alice", password: "incorrect-password" })).status, 401);
  const login = async (username) => {
    const response = await request("/auth/login", "", { username, password: `test_${username}` });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /httponly/i);
    assert.match(response.headers.get("set-cookie"), /samesite=strict/i);
    const temporary = cookieOf(response);
    assert.equal((await request("/cards", temporary)).status, 403);
    const changed = await request("/auth/password", temporary, { currentPassword: `test_${username}`, newPassword: `secure-${username}-password-2026` });
    assert.equal(changed.status, 200);
    assert.equal((await request("/cards", temporary)).status, 401);
    return cookieOf(changed);
  };
  const alice = await login("alice"), bob = await login("bob");
  assert.equal((await request("/auth/reset", bob, { username: "alice" })).status, 403);
  assert.equal((await request("/resource/Evil.md", alice, { isFile: true }, "POST", { Origin: "https://evil.example" })).status, 403);
  assert.equal((await request("/resource/Board/Todo/Card.md", alice, { newPath: "/../outside.md" }, "PATCH", { "If-Match": (await request("/version?path=/Board/Todo/Card.md", alice)).headers.get("etag") })).status, 400);
  const initial = await request("/resource/Board/Todo/Card.md", alice).then((response) => response.json());
  assert.equal((await request("/resource/Board/Todo/Card.md", alice, { isFile: true, content: "bad" })).status, 409);
  const first = client(`ws://127.0.0.1:${port}/_api/collab/${initial.id}`, alice, "alice");
  const second = client(`ws://127.0.0.1:${port}/_api/collab/${initial.id}`, bob, "bob");
  t.after(() => { first.close(); second.close(); });
  await until(() => first.ready() && second.ready());
  // Both start from the same state and edit without waiting for the other client.
  first.text.insert(0, "Alice\n"); second.text.insert(second.text.length, "Bob\n");
  await until(() => first.text.toString() === second.text.toString() && first.text.toString().includes("Alice") && first.text.toString().includes("Bob"));
  await until(() => [...first.provider.awareness.getStates().values()].some((state) => state.user?.name === "bob"));
  const merged = first.text.toString();
  await until(() => fs.readFileSync(`${dir}/tasks/Board/Todo/Card.md`, "utf8") === merged);
  const current = await request("/resource/Board/Todo/Card.md", alice).then((response) => response.json());
  assert.equal((await request("/resource/Board/Todo/Card.md", alice, { content: "stale", baseContent: initial.content }, "PATCH", { "If-Match": current.version })).status, 412);
  assert.equal((await request("/resource/Board/Todo/Card.md", alice, undefined, "DELETE", { "If-Match": current.version })).status, 409);
  assert.equal((await request("/resource/Board/Todo/Card.md", alice, { newPath: "/Board/Todo/Renamed.md" }, "PATCH", { "If-Match": current.version })).status, 204);
  first.text.insert(first.text.length, "After rename\n");
  await until(() => fs.readFileSync(`${dir}/tasks/Board/Todo/Renamed.md`, "utf8").includes("After rename"));
  assert.equal(fs.existsSync(`${dir}/tasks/Board/Todo/Card.md`), false);
  const history = await request(`/history?resource=${initial.id}`, alice).then((response) => response.json());
  assert(history.some((event) => event.actor === "alice" && event.action === "edit"));
  assert(history.some((event) => event.actor === "bob" && event.action === "edit"));
  assert(history.some((event) => event.action === "move"));
  const exported = unzipSync(new Uint8Array(await request("/export", alice).then((response) => response.arrayBuffer())));
  assert(strFromU8(exported["tasks/Board/Todo/Renamed.md"]).includes("../../../images/example.png"));
  assert.equal(strFromU8(exported["images/example.png"]), "image-test");
  assert(!Object.keys(exported).some((name) => /sqlite|password|session/i.test(name)));
  const reset = await request("/auth/reset", alice, { username: "bob" });
  const { temporaryPassword } = await reset.json();
  await until(() => !second.provider.wsconnected);
  assert.equal((await request("/cards", bob)).status, 401);
  assert.equal((await request("/auth/login", "", { username: "bob", password: "secure-bob-password-2026" })).status, 401);
  const relogin = await request("/auth/login", "", { username: "bob", password: temporaryPassword });
  assert.equal((await relogin.json()).mustChangePassword, true);
  assert.equal((await request("/auth/user", alice, { username: "alice", role: "member" })).status, 409);
  assert.equal((await request("/auth/user", alice, { username: "alice", disabled: true })).status, 409);
  const createdUser = await request("/auth/users", alice, { username: "charlie", role: "admin" });
  assert.equal(createdUser.status, 201);
  const charliePassword = (await createdUser.json()).temporaryPassword;
  assert.equal((await request("/auth/user", alice, { username: "charlie", disabled: true })).status, 200);
  assert.equal((await request("/auth/login", "", { username: "charlie", password: charliePassword })).status, 401);
  assert.equal((await request("/auth/user", alice, { username: "charlie", role: "member", disabled: false })).status, 200);
  const configuration = JSON.parse(fs.readFileSync(`${dir}/config/users.json`, "utf8"));
  assert.equal(configuration.users.find((user) => user.username === "charlie").role, "member");
  assert(configuration.users.every((user) => user.passwordHash && !user.initialPassword));
  assert(!JSON.stringify(configuration).includes(charliePassword));
  first.close(); second.close(); await until(() => !first.provider.wsconnected);
  await stop(); await start();
  const persisted = await request("/resource/Board/Todo/Renamed.md", alice).then((response) => response.json());
  assert.equal(persisted.id, initial.id);
  assert(persisted.content.includes("After rename"));
  const baseline = history.find((event) => event.action === "import");
  const restored = await request(`/history/${baseline.id}/restore`, alice, {}, "POST", { "If-Match": persisted.version });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).content, initial.content);
  const saved = await request("/resource/Board/Todo/Renamed.md", alice).then((response) => response.json());
  assert.equal((await request("/resource/Board/Todo/Renamed.md", alice, undefined, "DELETE", { "If-Match": saved.version })).status, 204);
  assert.equal((await request(`/history/${baseline.id}/restore`, alice, {})).status, 200);
  assert.equal(fs.readFileSync(`${dir}/tasks/Board/Todo/Renamed.md`, "utf8"), initial.content);
});
