const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync, backup } = require("node:sqlite");
const { writeUsers } = require("./users-config");

async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error("Usage: node backup.js <new-snapshot-directory>");
  const configDir = process.env.CONFIG_DIR || "config";
  fs.mkdirSync(destination, { mode: 0o700 });
  fs.mkdirSync(path.join(destination, "config"));
  fs.mkdirSync(path.join(destination, "tasks"));
  const source = new DatabaseSync(path.join(configDir, "team.sqlite"), { readOnly: true });
  const target = path.join(destination, "config/team.sqlite");
  await backup(source, target); source.close();
  const snapshot = new DatabaseSync(target);
  // Reconstruct files and account config from the same database snapshot.
  for (const row of snapshot.prepare("SELECT * FROM resources WHERE deleted=0 ORDER BY length(path)").all()) {
    const file = path.join(destination, "tasks", row.path);
    if (row.kind === "directory") fs.mkdirSync(file, { recursive: true });
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, row.content); }
  }
  for (const row of snapshot.prepare("SELECT * FROM settings").all()) fs.writeFileSync(path.join(destination, "config", `${row.name}.json`), row.content);
  writeUsers(path.join(destination, "config/users.json"), { users: snapshot.prepare("SELECT * FROM users").all().map((user) => ({ username: user.username, passwordHash: user.password, role: user.admin ? "admin" : "member", disabled: Boolean(user.disabled), mustChangePassword: Boolean(user.must_change) })) });
  snapshot.exec("DELETE FROM sessions"); snapshot.close();
  for (const name of ["images", "stylesheets"]) if (fs.existsSync(path.join(configDir, name))) fs.cpSync(path.join(configDir, name), path.join(destination, "config", name), { recursive: true });
  console.log("Snapshot created:", destination);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
