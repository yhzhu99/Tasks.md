const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const Koa = require("koa");
const Router = require("@koa/router");
const bodyParser = require("koa-bodyparser");
const multer = require("@koa/multer");
const mount = require("koa-mount");
const serve = require("koa-static");
const { zipSync, strToU8 } = require("fflate");
const Y = require("yjs");
const { Store, cleanPath, fail } = require("./store");
const { createAuth } = require("./auth");
const { createRealtime } = require("./realtime");

const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");
const store = new Store(process.env.TASKS_DIR || "tasks", process.env.CONFIG_DIR || "config");
const auth = createAuth(store);
const app = new Koa();
app.proxy = Boolean(process.env.PUBLIC_ORIGIN);
const router = new Router();
const apiApp = new Koa();
const server = http.createServer(app.callback());
const originAllowed = (origin) => !origin || origin === process.env.PUBLIC_ORIGIN || (!process.env.PUBLIC_ORIGIN && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
const realtime = createRealtime(server, store, auth, BASE_PATH, originAllowed);
const subPath = (ctx, prefix) => cleanPath(decodeURIComponent(ctx.path.slice(prefix.length)));
const visible = (row) => !path.posix.basename(row.path).startsWith(".");
const children = (rows, parent) => rows.filter((row) => row.path && path.posix.dirname(row.path) === (parent || "/"));
const describe = (row) => ({ id: row.id, name: path.posix.basename(row.path).replace(/\.md$/, ""), content: row.content, version: store.etag(row), createdAt: row.created, lastUpdated: row.updated });

app.use(async (ctx, next) => {
  try {
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set("Referrer-Policy", "same-origin");
    ctx.set("X-Frame-Options", "DENY");
    if (!["GET", "HEAD", "OPTIONS"].includes(ctx.method) && !originAllowed(ctx.headers.origin)) fail(403, "Origin is not allowed");
    await next();
  } catch (error) {
    ctx.status = error.status || error.statusCode || 500;
    if (ctx.status >= 500) console.error(error);
    ctx.body = { error: ctx.status >= 500 ? "Internal server error" : error.message };
    ctx.set("Cache-Control", "no-store");
  }
});
app.use(bodyParser({ jsonLimit: "3mb" }));
apiApp.use(auth.middleware);
router.get("/title", (ctx) => { ctx.body = process.env.TITLE || "Tasks.md"; });
router.get("/events", (ctx) => realtime.subscribe(ctx));
router.get("/version", (ctx) => {
  const row = store.get(ctx.query.path || "");
  if (!row) fail(404, "Resource no longer exists");
  ctx.set("ETag", store.etag(row)); ctx.body = describe(row);
});

function getResource(ctx) {
  const value = subPath(ctx, "/resource");
  const root = store.get(value);
  if (!root) fail(404, "Board no longer exists");
  ctx.set("ETag", store.etag(root));
  if (root.kind === "file") { ctx.body = describe(root); return; }
  const rows = store.all();
  const total = (prefix) => rows.filter((row) => row.kind === "file" && row.path.startsWith(`${prefix}/`) && row.path.endsWith(".md") && visible(row)).length;
  const files = (parent) => children(rows, parent).filter((row) => row.kind === "file" && row.path.endsWith(".md") && visible(row)).map(describe);
  const result = children(rows, value).filter((row) => row.kind === "directory" && visible(row)).map((row) => {
    const dirs = children(rows, row.path).filter((item) => item.kind === "directory" && visible(item));
    return { name: path.posix.basename(row.path), version: store.etag(row), files: files(row.path), hasSubDirectories: Boolean(dirs.length), isBoard: Boolean(store.get(`${row.path}/.board`)), subBoards: dirs.map((item) => ({ name: path.posix.basename(item.path), path: item.path, totalCards: total(item.path) })) };
  });
  const rootFiles = files(value);
  if (rootFiles.length) result.unshift({ name: "", version: store.etag(root), files: rootFiles, hasSubDirectories: false, subBoards: [], implicit: true });
  ctx.body = result;
}
function getTree(ctx) {
  const rows = store.all();
  const walk = (row, parentKind = "board") => {
    const entries = children(rows, row.path).filter(visible);
    const cards = entries.filter((item) => item.kind === "file" && item.path.endsWith(".md")).length;
    const dirs = entries.filter((item) => item.kind === "directory");
    const isBoard = store.get(`${row.path}/.board`) || parentKind === "lane" || (cards === 0 && dirs.length > 0);
    const kind = isBoard ? "board" : "lane";
    const order = (store.get(`${row.path}/.order`)?.content || "").split(/\r?\n/).filter(Boolean);
    const index = (name) => order.includes(name) ? order.indexOf(name) : Infinity;
    const nodes = dirs.map((child) => walk(child, kind)).sort((a, b) => (index(a.name) - index(b.name)) || a.name.localeCompare(b.name));
    return { orderVersion: store.get(`${row.path}/.order`) ? store.etag(store.get(`${row.path}/.order`)) : null, name: path.posix.basename(row.path), path: row.path, version: store.etag(row), cards, totalCards: cards + nodes.reduce((sum, node) => sum + node.totalCards, 0), kind, children: nodes };
  };
  const root = store.get(subPath(ctx, "/tree"));
  if (!root) fail(404, "Board no longer exists");
  const order = store.get(`${root.path}/.order`);
  if (order) ctx.set("X-Order-Version", store.etag(order));
  ctx.body = walk(root).children;
}
router.get("/cards", (ctx) => {
  ctx.body = store.all().filter((row) => row.kind === "file" && row.path.endsWith(".md") && visible(row)).map((row) => {
    const segments = row.path.slice(1).split("/");
    return { ...describe(row), board: segments.length > 2 ? `/${segments.slice(0, -2).join("/")}` : "", lane: segments.length > 1 ? segments.at(-2) : "" };
  });
});
function createResource(ctx) {
  const row = store.create(subPath(ctx, "/resource"), Boolean(ctx.request.body?.isFile), ctx.request.body?.content || "", ctx.state.user.username);
  ctx.set("ETag", store.etag(row)); ctx.status = 201; ctx.body = describe(row); realtime.notify();
}
function updateResource(ctx) {
  const value = subPath(ctx, "/resource");
  let row = store.get(value); store.check(row, ctx.get("If-Match"));
  const { newPath, content, baseContent } = ctx.request.body || {};
  if (baseContent !== undefined && baseContent !== row.content) fail(412, "Card content changed. Refresh and retry your action.");
  if (newPath !== undefined && content !== undefined) fail(400, "Rename and edit are separate operations");
  if (newPath !== undefined) row = store.move(value, newPath, ctx.get("If-Match"), ctx.state.user.username);
  else if (content !== undefined) {
    if (row.kind !== "file" || typeof content !== "string" || content.length > 2_000_000) fail(400, "Invalid file content");
    row = row.state ? realtime.edit(row.id, content, ctx.state.user.username) : store.saveText(row, content, ctx.state.user.username);
  }
  ctx.set("ETag", store.etag(row)); ctx.status = 204; realtime.notify();
}
function deleteResource(ctx) {
  const value = subPath(ctx, "/resource");
  if (realtime.activeUnder(value, ctx.state.user.username)) fail(409, "Another member is editing this item. Ask them to close it before deleting.");
  store.remove(value, ctx.get("If-Match"), ctx.state.user.username);
  realtime.closeDeleted(); realtime.notify(); ctx.status = 204;
}
for (const suffix of ["", "/{*path}"]) {
  router.get(`/resource${suffix}`, getResource);
  router.post(`/resource${suffix}`, createResource);
  router.patch(`/resource${suffix}`, updateResource);
  router.delete(`/resource${suffix}`, deleteResource);
  router.get(`/tree${suffix}`, getTree);
  for (const name of ["tags", "sort"]) {
    router.get(`/${name}${suffix}`, (ctx) => {
      const result = store.setting(name, subPath(ctx, `/${name}`)); ctx.body = result.content; ctx.set("ETag", result.etag);
    });
    router[name === "tags" ? "patch" : "put"](`/${name}${suffix}`, (ctx) => {
      const content = ctx.request.body;
      if (!content || typeof content !== "object" || Array.isArray(content)) fail(400, "Invalid settings");
      const result = store.saveSetting(name, subPath(ctx, `/${name}`), content, ctx.get("If-Match"), ctx.state.user.username);
      ctx.set("ETag", result.etag); ctx.status = 204; realtime.notify();
    });
  }
}
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.post("/image", upload.single("file"), (ctx) => {
  const file = ctx.request.file;
  const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" };
  if (!file || !extensions[file.mimetype]) fail(400, "Choose a PNG, JPEG, GIF, WebP or AVIF image");
  const name = `${randomUUID()}.${extensions[file.mimetype]}`;
  fs.mkdirSync(path.join(store.configDir, "images"), { recursive: true });
  fs.writeFileSync(path.join(store.configDir, "images", name), file.buffer);
  store.audit(ctx.state.user.username, "upload", { path: name }); ctx.body = name;
});
router.get("/history", (ctx) => {
  const { actor = "", resource = "", search = "", from = "", to = "" } = ctx.query;
  const offset = Math.max(0, Number(ctx.query.offset) || 0);
  const conditions = []; const values = [];
  for (const [clause, value] of [["actor=?", actor], ["resource_id=?", resource], ["instr(path,?)>0", search], ["updated>=?", from], ["updated<=?", to]]) {
    if (value) { conditions.push(clause); values.push(value); }
  }
  ctx.body = store.db.prepare(`SELECT * FROM history ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 50 OFFSET ?`).all(...values, offset);
});
router.post("/history/:id/restore", (ctx) => {
  if (!ctx.state.user.admin) fail(403, "Administrator access required");
  const event = store.db.prepare("SELECT * FROM history WHERE id=?").get(ctx.params.id);
  if (!event?.resource_id || !event.path.endsWith(".md") || !["edit", "restore", "delete", "create", "import"].includes(event.action)) fail(400, "Choose a card content revision");
  const content = event.action === "delete" ? event.before : event.after;
  let row = store.byId(event.resource_id);
  if (row) {
    store.check(row, ctx.get("If-Match"));
    if (realtime.activeUnder(row.path, "")) fail(409, "Close all editors for this card before restoring");
    row = realtime.edit(row.id, content, ctx.state.user.username, "restore");
  } else {
    row = store.db.prepare("SELECT * FROM resources WHERE id=?").get(event.resource_id);
    if (!row || store.get(row.path)) fail(409, "A different item now occupies this path");
    if (store.get(path.posix.dirname(row.path))?.kind !== "directory") fail(409, "Recreate the parent board or lane first");
    const doc = new Y.Doc(); doc.getText("content").insert(0, content);
    store.transaction(() => {
      store.db.prepare("UPDATE resources SET deleted=0,content=?,state=?,revision=revision+1,updated=? WHERE id=?").run(content, Y.encodeStateAsUpdate(doc), new Date().toISOString(), row.id);
      store.audit(ctx.state.user.username, "restore", row, null, content); store.queueExport(row.path); store.touchParents(row.path);
    });
    doc.destroy(); store.flushExports(); row = store.byId(row.id);
  }
  ctx.body = describe(row); ctx.set("ETag", store.etag(row)); realtime.notify();
});
router.get("/export", (ctx) => {
  const files = {};
  for (const row of store.all()) {
    if (row.kind === "directory") { files[`tasks${row.path}/`] = new Uint8Array(); continue; }
    let content = row.content;
    if (row.path.endsWith(".md")) {
      const imageRoot = path.posix.relative(path.posix.dirname(`tasks${row.path}`), "images");
      content = content.replace(/(?:https?:\/\/[^\s)]+)?(?:\/[^\s)]*)?\/_api\/image\//g, `${imageRoot}/`);
    }
    files[`tasks${row.path}`] = strToU8(content);
  }
  const imagesDir = path.join(store.configDir, "images");
  if (fs.existsSync(imagesDir)) for (const name of fs.readdirSync(imagesDir)) {
    if (fs.statSync(path.join(imagesDir, name)).isFile()) files[`images/${name}`] = fs.readFileSync(path.join(imagesDir, name));
  }
  for (const name of ["tags", "sort"]) files[`config/${name}.json`] = strToU8(store.db.prepare("SELECT content FROM settings WHERE name=?").get(name).content);
  ctx.set("Content-Disposition", 'attachment; filename="tasks-markdown.zip"'); ctx.type = "application/zip"; ctx.body = Buffer.from(zipSync(files));
});
apiApp.use(mount("/image", serve(path.join(store.configDir, "images"))));
apiApp.use(router.routes());
apiApp.use(router.allowedMethods());
apiApp.use((ctx) => { ctx.status = 404; ctx.body = { error: "Unknown API endpoint" }; });
app.use(mount(`${BASE_PATH}/_api`, apiApp));
app.use(mount(`${BASE_PATH}/stylesheets`, serve(path.join(store.configDir, "stylesheets"))));
app.use(mount(BASE_PATH || "/", serve(path.join(__dirname, "static"))));
app.use((ctx) => {
  if (!["GET", "HEAD"].includes(ctx.method)) { ctx.status = 404; return; }
  ctx.set("Cache-Control", "no-cache"); ctx.type = "html";
  const index = path.join(__dirname, "static/index.html");
  ctx.body = fs.existsSync(index) ? fs.readFileSync(index) : "Tasks.md frontend is not built";
});
server.listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.log("Tasks.md API ready"));
