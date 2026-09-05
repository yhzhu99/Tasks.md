const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const Y = require("yjs");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function cleanPath(value) {
  if (typeof value !== "string" || /[\\\0]/.test(value)) fail(400, "Invalid path");
  const parts = value.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === "." || (part.startsWith(".") && ![".board", ".order"].includes(part)))) fail(400, "Invalid path");
  return parts.length ? `/${parts.join("/")}` : "";
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tasks-tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

class Store {
  constructor(tasksDir, configDir) {
    this.tasksDir = path.resolve(tasksDir);
    this.configDir = path.resolve(configDir);
    fs.mkdirSync(this.tasksDir, { recursive: true });
    fs.mkdirSync(this.configDir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.configDir, "team.sqlite"));
    fs.chmodSync(path.join(this.configDir, "team.sqlite"), 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, kind TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '', state BLOB, revision INTEGER NOT NULL DEFAULT 1,
        created TEXT NOT NULL, updated TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS active_path ON resources(path) WHERE deleted=0;
      CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY, resource_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
        path TEXT NOT NULL, before TEXT, after TEXT, created TEXT NOT NULL, updated TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_resource ON history(resource_id, id);
      CREATE TABLE IF NOT EXISTS exports (path TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    if (!this.db.prepare("SELECT 1 FROM meta WHERE name='imported'").get()) {
      this.transaction(() => {
        this.insert("", "directory", "", "migration");
        const walk = (dir, prefix) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") && ![".board", ".order"].includes(entry.name)) continue;
            if (entry.isSymbolicLink()) fail(400, "Import does not follow symbolic links");
            const rel = `${prefix}/${entry.name}`;
            if (entry.isDirectory()) {
              this.insert(rel, "directory", "", "migration");
              walk(path.join(dir, entry.name), rel);
            } else if (entry.isFile()) {
              this.insert(rel, "file", fs.readFileSync(path.join(dir, entry.name), "utf8"), "migration");
              const stats = fs.statSync(path.join(dir, entry.name));
              this.db.prepare("UPDATE resources SET created=?,updated=? WHERE path=? AND deleted=0").run((stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime).toISOString(), stats.mtime.toISOString(), rel);
            }
          }
        };
        walk(this.tasksDir, "");
        for (const name of ["tags", "sort"]) {
          const file = path.join(this.configDir, `${name}.json`);
          const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
          this.db.prepare("INSERT INTO settings(name,content) VALUES (?,?)").run(name, JSON.stringify(data));
        }
        this.db.prepare("INSERT INTO meta VALUES ('imported','1')").run();
      });
    }
    this.flushExports();
    if (this.exportError) throw this.exportError;
  }

  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  get(value) { return this.db.prepare("SELECT * FROM resources WHERE path=? AND deleted=0").get(cleanPath(value)); }
  byId(id) { return this.db.prepare("SELECT * FROM resources WHERE id=? AND deleted=0").get(id); }
  all() { return this.db.prepare("SELECT * FROM resources WHERE deleted=0 ORDER BY path").all(); }
  etag(row) { return `"${row.id}:${row.revision}"`; }
  check(row, expected) {
    if (!row) fail(404, "Resource no longer exists");
    if (!expected) fail(428, "Reload this item before changing it");
    if (expected !== this.etag(row)) fail(412, "This item changed. Your action was not applied; review the latest version and try again.");
  }
  audit(actor, action, row, before = null, after = null) {
    const now = new Date().toISOString();
    // Consecutive edits by one actor within ten seconds form a readable revision.
    const last = action === "edit" && this.db.prepare("SELECT * FROM history WHERE resource_id=? ORDER BY id DESC LIMIT 1").get(row.id);
    if (last && last.actor === actor && last.action === action && Date.now() - Date.parse(last.updated) < 10000) {
      this.db.prepare("UPDATE history SET after=?,updated=? WHERE id=?").run(after, now, last.id);
    } else {
      this.db.prepare("INSERT INTO history(resource_id,actor,action,path,before,after,created,updated) VALUES (?,?,?,?,?,?,?,?)")
        .run(row.id || null, actor, action, row.path || "", before, after, now, now);
    }
  }
  queueExport(value) { this.db.prepare("INSERT OR IGNORE INTO exports VALUES (?)").run(value); }
  touchParents(value) {
    let parent = path.posix.dirname(value);
    while (true) {
      if (parent === "/" || parent === ".") parent = "";
      this.db.prepare("UPDATE resources SET revision=revision+1,updated=? WHERE path=? AND deleted=0").run(new Date().toISOString(), parent);
      if (!parent) break;
      parent = path.posix.dirname(parent);
    }
  }
  insert(value, kind, content, actor) {
    const now = new Date().toISOString();
    const row = { id: randomUUID(), path: value, kind, content, created: now, updated: now };
    let state = null;
    if (kind === "file" && value.endsWith(".md")) {
      const doc = new Y.Doc();
      doc.getText("content").insert(0, content);
      state = Y.encodeStateAsUpdate(doc);
      doc.destroy();
    }
    this.db.prepare("INSERT INTO resources(id,path,kind,content,state,created,updated) VALUES (?,?,?,?,?,?,?)")
      .run(row.id, value, kind, content, state, now, now);
    this.audit(actor, actor === "migration" ? "import" : "create", row, null, content);
    this.queueExport(value);
    if (value) this.touchParents(value);
    return this.get(value);
  }
  create(value, isFile, content, actor) {
    value = cleanPath(value);
    if (!value || this.get(value)) fail(409, "A resource with this name already exists");
    const parent = this.get(path.posix.dirname(value));
    if (!parent || parent.kind !== "directory") fail(404, "Parent directory no longer exists");
    if (typeof content !== "string" || content.length > 2_000_000) fail(400, "Invalid content");
    const row = this.transaction(() => this.insert(value, isFile ? "file" : "directory", content, actor));
    this.flushExports();
    return row;
  }
  move(value, destination, expected, actor) {
    value = cleanPath(value); destination = cleanPath(destination);
    const row = this.get(value);
    this.check(row, expected);
    if (!value || !destination || destination.startsWith(`${value}/`)) fail(400, "Invalid move");
    if (value === destination) return row;
    if (this.get(destination)) fail(409, "Destination already exists");
    if (this.get(path.posix.dirname(destination))?.kind !== "directory") fail(404, "Destination directory no longer exists");
    this.transaction(() => {
      const descendants = this.all().filter((item) => item.path === value || item.path.startsWith(`${value}/`));
      for (const item of descendants) {
        const next = destination + item.path.slice(value.length);
        this.db.prepare("UPDATE resources SET path=?,revision=revision+1,updated=? WHERE id=?").run(next, new Date().toISOString(), item.id);
        this.audit(actor, "move", { ...item, path: next }, item.path, next);
        this.queueExport(item.path); this.queueExport(next);
      }
      this.touchParents(value); this.touchParents(destination);
    });
    this.flushExports();
    return this.byId(row.id);
  }
  remove(value, expected, actor) {
    value = cleanPath(value);
    const row = this.get(value); this.check(row, expected);
    if (!value) fail(400, "Cannot delete the root");
    this.transaction(() => {
      for (const item of this.all().filter((item) => item.path === value || item.path.startsWith(`${value}/`))) {
        this.db.prepare("UPDATE resources SET deleted=1,revision=revision+1 WHERE id=?").run(item.id);
        this.audit(actor, "delete", item, item.content, null);
        this.queueExport(item.path);
      }
      this.touchParents(value);
    });
    this.flushExports();
  }
  saveDocument(id, doc, actor, action = "edit") {
    const row = this.byId(id);
    if (!row) fail(404, "Card was deleted");
    const content = doc.getText("content").toString();
    const state = Y.encodeStateAsUpdate(doc);
    if (content === row.content && Buffer.from(state).equals(Buffer.from(row.state))) return row;
    if (content.length > 2_000_000) fail(413, "Card is too large");
    this.transaction(() => {
      this.db.prepare("UPDATE resources SET content=?,state=?,revision=revision+1,updated=? WHERE id=?")
        .run(content, state, new Date().toISOString(), id);
      if (content !== row.content) this.audit(actor, action, row, row.content, content);
      this.queueExport(row.path); this.touchParents(row.path);
    });
    this.flushExports();
    return this.byId(id);
  }
  saveText(row, content, actor) {
    this.transaction(() => {
      this.db.prepare("UPDATE resources SET content=?,revision=revision+1,updated=? WHERE id=?").run(content, new Date().toISOString(), row.id);
      this.audit(actor, "edit", row, row.content, content);
      this.queueExport(row.path); this.touchParents(row.path);
    });
    this.flushExports();
    return this.byId(row.id);
  }
  setting(name, scope) {
    const row = this.db.prepare("SELECT * FROM settings WHERE name=?").get(name);
    return { content: JSON.parse(row.content)[scope] || {}, etag: `"${name}:${row.revision}"` };
  }
  saveSetting(name, scope, content, expected, actor) {
    const row = this.db.prepare("SELECT * FROM settings WHERE name=?").get(name);
    if (expected !== `"${name}:${row.revision}"`) fail(412, "Settings changed. Refresh and try again.");
    const previous = JSON.parse(row.content);
    this.transaction(() => {
      this.db.prepare("UPDATE settings SET content=?,revision=revision+1 WHERE name=?").run(JSON.stringify({ ...previous, [scope]: content }), name);
      this.audit(actor, name, { path: scope }, JSON.stringify(previous[scope] || {}), JSON.stringify(content));
    });
    atomicWrite(path.join(this.configDir, `${name}.json`), this.db.prepare("SELECT content FROM settings WHERE name=?").get(name).content);
    return this.setting(name, scope);
  }
  flushExports() {
    try { this.materialize(); this.exportError = null; }
    catch (error) { this.exportError = error; console.error("Markdown export will be retried:", error.message); }
  }
  materialize() {
    // The durable queue allows interrupted exports to be replayed after restart.
    const queued = this.db.prepare("SELECT path FROM exports ORDER BY length(path) DESC").all();
    for (const item of queued) {
      if (item.path && !this.get(item.path)) fs.rmSync(path.join(this.tasksDir, item.path), { recursive: true, force: true });
    }
    for (const item of queued.reverse()) {
      const row = this.get(item.path);
      if (!row) continue;
      const destination = path.join(this.tasksDir, row.path);
      if (row.kind === "directory") fs.mkdirSync(destination, { recursive: true });
      else atomicWrite(destination, row.content);
    }
    this.db.exec("DELETE FROM exports");
  }
}

module.exports = { Store, cleanPath, fail, atomicWrite };
