const path = require("node:path");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { hashPassword, readUsers, writeUsers } = require("./users-config");

const [command, username] = process.argv.slice(2);
const configDir = process.env.CONFIG_DIR || "config";
const file = process.env.USERS_FILE || path.join(configDir, "users.json");
if (!["init", "reset"].includes(command) || !username) {
  console.error("Usage: node manage-users.js init|reset <username>"); process.exit(1);
}
if (command === "init" && fs.existsSync(file)) throw new Error("User configuration already exists; use reset for recovery");
const config = command === "init" ? { users: [] } : readUsers(file);
const password = randomBytes(18).toString("base64url");
const hash = hashPassword(password);
if (command === "init") config.users.push({ username, role: "admin", passwordHash: hash, disabled: false, mustChangePassword: true });
else {
  const user = config.users.find((user) => user.username === username);
  if (!user) throw new Error("Unknown user");
  user.passwordHash = hash; user.mustChangePassword = true; user.disabled = false;
}
writeUsers(file, config);
const database = path.join(configDir, "team.sqlite");
if (fs.existsSync(database)) {
  const db = new DatabaseSync(database);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password=?,must_change=1,disabled=0 WHERE username=?").run(hash, username);
    db.prepare("DELETE FROM sessions WHERE username=?").run(username);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO history(actor,action,path,created,updated) VALUES ('server-admin','password_reset',?,?,?)").run(username, now, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  db.close();
}
console.log(`Temporary password for ${username}: ${password}`);
console.log("Restart the application after this command to reload the private user configuration.");
