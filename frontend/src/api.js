export const api = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/_api`;
const versions = new Map();
let writes = Promise.resolve();
const errorTranslations = {
  "Invalid team key, username or password": "团队密钥、用户名或密码不正确。",
  "Current password is incorrect": "当前密码不正确。",
  "Use a new password of 12–256 characters": "请设置一个不同于当前密码的新密码，长度为 12–256 个字符。",
  "Keep at least one active administrator": "至少需要保留一位已启用的管理员。请先指定另一位管理员。",
  "Administrator access required": "此操作需要管理员权限。",
  "Username already exists": "用户名已存在。",
  "Too many attempts. Try again in 15 minutes.": "尝试次数过多，请在 15 分钟后重试。",
  "This item changed. Your action was not applied; review the latest version and try again.": "其他成员已修改此项，本次操作未应用。请查看最新版本后重试。",
  "Card content changed. Refresh and retry your action.": "卡片内容已更新，本次操作未应用。请查看最新内容后重试。",
  "Another member is editing this item. Ask them to close it before deleting.": "其他成员正在编辑此项，请让对方关闭编辑窗口后再删除。",
  "Close all editors for this card before restoring": "请先关闭这张卡片的所有编辑窗口，再恢复历史版本。",
  "Settings changed. Refresh and try again.": "排序或标签设置已更新，请刷新后重试。",
  "Destination already exists": "目标位置已有同名内容，请换一个名称。",
};
const key = (value) => decodeURIComponent(new URL(value, window.location.origin).pathname).replace(/\/$/, "");
export const knownVersion = (path) => versions.get(key(`${api}/resource/${path.replace(/^\//, "")}`));
export function rememberVersion(path, version) {
  if (version) versions.set(key(`${api}/resource/${path.replace(/^\//, "")}`), version);
}

async function remember(url, response) {
  const urlKey = key(url);
  const etag = response.headers.get("ETag");
  if (etag) versions.set(urlKey, etag);
  if (!response.headers.get("Content-Type")?.includes("application/json")) return;
  const data = await response.clone().json();
  if (urlKey.includes("/resource") && Array.isArray(data)) {
    const parent = urlKey.slice(urlKey.indexOf("/resource") + 9);
    for (const lane of data) {
      const prefix = [parent, lane.name].filter(Boolean).join("/");
      rememberVersion(prefix, lane.version);
      for (const card of lane.files) rememberVersion(`${prefix}/${card.name}.md`, card.version);
    }
  } else if (urlKey.endsWith("/cards") && Array.isArray(data)) {
    for (const card of data) rememberVersion([card.board, card.lane, `${card.name}.md`].filter(Boolean).join("/"), card.version);
  } else if (urlKey.includes("/tree") && Array.isArray(data)) {
    const root = urlKey.slice(urlKey.indexOf("/tree") + 5);
    rememberVersion(`${root}/.order`, response.headers.get("X-Order-Version"));
    const walk = (nodes) => { for (const node of nodes) { rememberVersion(node.path, node.version); rememberVersion(`${node.path}/.order`, node.orderVersion); walk(node.children || []); } };
    walk(data);
  }
}

export function apiFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const run = async () => {
    const headers = new Headers(options.headers);
    const urlKey = key(url);
    if (["PATCH", "PUT", "DELETE"].includes(method) && !headers.has("If-Match")) {
      let version = versions.get(urlKey);
      if (!version && urlKey.includes("/resource")) {
        const path = urlKey.slice(urlKey.indexOf("/resource") + 9);
        const response = await window.fetch(`${api}/version?path=${encodeURIComponent(path)}`, { cache: "no-store" });
        if (response.ok) { version = response.headers.get("ETag"); rememberVersion(path, version); }
      }
      if (version) headers.set("If-Match", version);
    }
    const response = await window.fetch(url, { ...options, headers, credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      const locale = localStorage.getItem("locale") || navigator.language;
      const message = String(locale).includes("zh") ? errorTranslations[body.error] || body.error : body.error;
      const error = Object.assign(new Error(message || `Request failed (${response.status})`), { status: response.status });
      if (response.status === 401) window.dispatchEvent(new Event("tasks-session-expired"));
      window.dispatchEvent(new CustomEvent("tasks-api-error", { detail: error }));
      throw error;
    }
    await remember(url, response);
    if (method === "PATCH" && options.body) {
      const body = JSON.parse(options.body);
      if (body.newPath) rememberVersion(body.newPath, response.headers.get("ETag"));
    }
    return response;
  };
  if (method === "GET") return run();
  const result = writes.then(run);
  writes = result.catch(() => {});
  return result;
}

export async function jsonRequest(route, body) {
  return apiFetch(`${api}${route}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.status === 204 ? null : response.json());
}
