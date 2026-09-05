const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, scryptSync } = require("node:crypto");
const { fail } = require("./store");

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function validateUsers(config) {
  if (!Array.isArray(config.users) || !config.users.length) fail(400, "users.json must contain a users array");
  const names = new Set();
  for (const user of config.users) {
    if (typeof user.username !== "string" || !/^[a-z][a-z0-9_]{1,40}$/.test(user.username) || names.has(user.username)) fail(400, "Usernames must be unique, lowercase, 2–41 characters");
    names.add(user.username);
    if (!["admin", "member"].includes(user.role)) fail(400, "User role must be admin or member");
    if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash || "")) fail(400, "A valid passwordHash is required");
    if (typeof user.disabled !== "boolean" || typeof user.mustChangePassword !== "boolean") fail(400, "Invalid account flags");
  }
  if (!config.users.some((user) => user.role === "admin" && !user.disabled)) fail(409, "Keep at least one active administrator");
  return config;
}
function writeUsers(file, config) {
  validateUsers(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(`${file}.tmp`, 0o600);
  fs.renameSync(`${file}.tmp`, file);
}
function readUsers(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing user configuration: ${file}. Run node manage-users.js init <username> first.`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw.users)) fail(400, "users.json must contain a users array");
  let converted = false;
  const config = { users: raw.users.map((user) => {
    let passwordHash = user.passwordHash;
    if (user.initialPassword !== undefined) {
      if (typeof user.initialPassword !== "string" || user.initialPassword.length < 8 || user.initialPassword.length > 256) fail(400, "Initial passwords must have 8–256 characters");
      passwordHash = hashPassword(user.initialPassword); converted = true;
    }
    return { username: user.username, role: user.role || "member", passwordHash, disabled: user.disabled ?? false, mustChangePassword: user.initialPassword !== undefined ? true : (user.mustChangePassword ?? true) };
  }) };
  validateUsers(config);
  if (converted) writeUsers(file, config);
  return config;
}

module.exports = { hashPassword, readUsers, writeUsers, validateUsers };
