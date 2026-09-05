const { randomBytes, timingSafeEqual, createHash } = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(require("node:crypto").scrypt);
const { fail } = require("./store");
const fs = require("node:fs");
const path = require("node:path");
const { hashPassword, readUsers, writeUsers, validateUsers } = require("./users-config");

const digest = (value) => createHash("sha256").update(value).digest("hex");
async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, hash] = encoded.split(":");
  return timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(hash, "hex"));
}

function createAuth(store, env = process.env) {
  const db = store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, must_change INTEGER NOT NULL DEFAULT 1, disabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (name TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "disabled")) db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
  const usersFile = env.USERS_FILE || path.join(store.configDir, "users.json");
  let config = readUsers(usersFile);
  let source = fs.readFileSync(usersFile, "utf8");
  function synchronize(next, actor, action, target) {
    const revoked = [];
    const beforeTarget = target ? db.prepare("SELECT username,admin,disabled,must_change FROM users WHERE username=?").get(target) : null;
    store.transaction(() => {
      const incoming = new Set(next.users.map((user) => user.username));
      for (const old of db.prepare("SELECT * FROM users").all()) {
        if (!incoming.has(old.username)) {
          db.prepare("UPDATE users SET disabled=1 WHERE username=?").run(old.username);
          db.prepare("DELETE FROM sessions WHERE username=?").run(old.username); revoked.push(old.username);
        }
      }
      for (const user of next.users) {
        const old = db.prepare("SELECT * FROM users WHERE username=?").get(user.username);
        const changed = old && (old.password !== user.passwordHash || Boolean(old.admin) !== (user.role === "admin") || Boolean(old.disabled) !== user.disabled || Boolean(old.must_change) !== user.mustChangePassword);
        if (changed) { db.prepare("DELETE FROM sessions WHERE username=?").run(user.username); revoked.push(user.username); }
        db.prepare("INSERT INTO users(username,password,admin,must_change,disabled) VALUES (?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET password=excluded.password,admin=excluded.admin,must_change=excluded.must_change,disabled=excluded.disabled")
          .run(user.username, user.passwordHash, Number(user.role === "admin"), Number(user.mustChangePassword), Number(user.disabled));
      }
      if (actor) {
        const afterTarget = target ? db.prepare("SELECT username,admin,disabled,must_change FROM users WHERE username=?").get(target) : null;
        const includeState = action === "user_create" || action === "user_update";
        store.audit(actor, action, { path: target }, includeState && beforeTarget ? JSON.stringify(beforeTarget) : null, includeState && afterTarget ? JSON.stringify(afterTarget) : null);
      }
    });
    return revoked;
  }
  synchronize(config);
  function saveConfig(next, actor, action, target) {
    if (fs.readFileSync(usersFile, "utf8") !== source) fail(409, "User configuration changed on disk. Restart the application to load it first.");
    validateUsers(next);
    // Commit configuration first: a restart can always reconcile the account index.
    writeUsers(usersFile, next);
    source = fs.readFileSync(usersFile, "utf8"); config = next;
    for (const username of synchronize(next, actor, action, target)) auth.onRevoke?.(username);
  }
  function updateUser(username, changes, actor, action) {
    if (!config.users.some((user) => user.username === username)) fail(404, "Unknown user");
    saveConfig({ users: config.users.map((user) => user.username === username ? { ...user, ...changes } : user) }, actor, action, username);
  }
  const dummyHash = hashPassword(randomBytes(32).toString("hex"));
  const cookieOptions = { httpOnly: true, sameSite: "strict", secure: env.COOKIE_SECURE !== "false", path: "/", overwrite: true };
  const publicUser = (row) => ({ username: row.username, admin: Boolean(row.admin), mustChangePassword: Boolean(row.must_change), disabled: Boolean(row.disabled) });
  function session(cookie = "") {
    const token = cookie.match(/(?:^|;\s*)tasks_session=([^;]+)/)?.[1];
    if (!token) return null;
    return db.prepare("SELECT users.*,sessions.token AS session_token FROM users JOIN sessions USING(username) WHERE sessions.token=? AND sessions.expires>? AND users.disabled=0").get(digest(token), Date.now());
  }
  function issue(ctx, username) {
    const token = randomBytes(32).toString("base64url");
    const age = 7 * 24 * 60 * 60 * 1000;
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(digest(token), username, Date.now() + age);
    ctx.cookies.set("tasks_session", token, { ...cookieOptions, maxAge: age });
  }
  function revoke(username) {
    db.prepare("DELETE FROM sessions WHERE username=?").run(username);
    auth.onRevoke?.(username);
  }
  function reset(username, actor) {
    if (!db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) fail(404, "Unknown user");
    const password = randomBytes(15).toString("base64url");
    updateUser(username, { passwordHash: hashPassword(password), mustChangePassword: true }, actor, "password_reset");
    return password;
  }
  function rateLimit(name, limit) {
    const now = Date.now();
    db.prepare("DELETE FROM login_attempts WHERE expires<=?").run(now);
    db.prepare("INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(name) DO UPDATE SET count=count+1").run(name, now + 15 * 60 * 1000);
    if (db.prepare("SELECT count FROM login_attempts WHERE name=?").get(name).count > limit) fail(429, "Too many attempts. Try again in 15 minutes.");
  }
  const auth = { session, publicUser, revoke, reset, onRevoke: null };
  auth.middleware = async (ctx, next) => {
    ctx.set("Cache-Control", "no-store");
    const route = ctx.path;
    if (route === "/auth/config" && ctx.method === "GET") { ctx.body = { title: env.TITLE || "Tasks.md", supportContact: env.SUPPORT_CONTACT || "" }; return; }
    if (route === "/auth/login" && ctx.method === "POST") {
      const { username, password } = ctx.request.body || {};
      rateLimit(`ip:${ctx.ip}`, 100);
      if (typeof username !== "string" || username.length > 40) fail(401, "Invalid credentials");
      rateLimit(`user:${username}`, 15);
      const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
      const valid = await verifyPassword(password, user?.password || dummyHash);
      if (!user || user.disabled || !valid) fail(401, "Invalid username or password");
      // A reset during the asynchronous password check invalidates the login.
      if (db.prepare("SELECT password FROM users WHERE username=?").get(username).password !== user.password) fail(401, "Password changed; sign in again");
      db.prepare("DELETE FROM login_attempts WHERE name=?").run(`user:${username}`);
      issue(ctx, username);
      store.audit(username, "login", { path: "" });
      ctx.body = publicUser(user); return;
    }
    const user = session(ctx.headers.cookie);
    if (!user) fail(401, "Please sign in");
    ctx.state.user = user;
    if (route === "/auth/me" && ctx.method === "GET") { ctx.body = publicUser(user); return; }
    if (route === "/auth/logout" && ctx.method === "POST") {
      db.prepare("DELETE FROM sessions WHERE token=?").run(user.session_token);
      auth.onRevoke?.(user.username);
      ctx.cookies.set("tasks_session", null, cookieOptions);
      ctx.status = 204; return;
    }
    if (route === "/auth/password" && ctx.method === "POST") {
      const { currentPassword, newPassword } = ctx.request.body || {};
      rateLimit(`password:${user.username}`, 15);
      if (!(await verifyPassword(currentPassword, user.password))) fail(400, "Current password is incorrect");
      if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 256 || newPassword === currentPassword) fail(400, "Use a new password of 12–256 characters");
      if (!session(ctx.headers.cookie) || db.prepare("SELECT password FROM users WHERE username=?").get(user.username).password !== user.password) fail(401, "Session expired");
      updateUser(user.username, { passwordHash: hashPassword(newPassword), mustChangePassword: false }, user.username, "password_change");
      issue(ctx, user.username);
      ctx.body = publicUser({ ...user, must_change: 0 }); return;
    }
    if (user.must_change) fail(403, "Change your temporary password first");
    if (route === "/auth/users" && ctx.method === "GET") {
      ctx.body = db.prepare("SELECT username,admin,must_change,disabled FROM users ORDER BY username").all().map(publicUser); return;
    }
    if (route === "/auth/users" && ctx.method === "POST") {
      if (!user.admin) fail(403, "Administrator access required");
      const { username, role = "member" } = ctx.request.body || {};
      if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username || "")) fail(409, "Username already exists");
      const temporaryPassword = randomBytes(15).toString("base64url");
      saveConfig({ users: [...config.users, { username, role, disabled: false, mustChangePassword: true, passwordHash: hashPassword(temporaryPassword) }] }, user.username, "user_create", username);
      ctx.status = 201; ctx.body = { temporaryPassword }; return;
    }
    if (route === "/auth/user" && ctx.method === "POST") {
      if (!user.admin) fail(403, "Administrator access required");
      const { username, role, disabled } = ctx.request.body || {};
      const changes = {};
      if (role !== undefined) changes.role = role;
      if (disabled !== undefined) changes.disabled = disabled;
      updateUser(username, changes, user.username, "user_update");
      ctx.body = publicUser(db.prepare("SELECT * FROM users WHERE username=?").get(username)); return;
    }
    if (route === "/auth/reset" && ctx.method === "POST") {
      if (!user.admin) fail(403, "Administrator access required");
      if (ctx.request.body.username === user.username) fail(400, "Use Change password for your own account");
      ctx.body = { temporaryPassword: reset(ctx.request.body.username, user.username) }; return;
    }
    await next();
  };
  return auth;
}

module.exports = { createAuth };
