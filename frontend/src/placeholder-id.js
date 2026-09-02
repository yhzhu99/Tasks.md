/**
 * Create flows write a UUID to disk first, then rename it once the user
 * types a real name. That id is an implementation detail — never show it.
 */
const PLACEHOLDER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlaceholderId(name) {
  return typeof name === "string" && PLACEHOLDER_ID_RE.test(name);
}

export function visibleName(name) {
  if (name == null || name === "") {
    return "";
  }
  if (isPlaceholderId(name)) {
    return "";
  }
  return name;
}
