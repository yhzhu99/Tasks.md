export const LANE_WIDTH_MIN = 220;
export const LANE_WIDTH_MAX = 960;
export const LANE_WIDTH_DEFAULT = 380;

export function clampLaneWidth(value) {
  const width = Math.round(Number(value));
  if (!Number.isFinite(width)) return LANE_WIDTH_DEFAULT;
  return Math.min(LANE_WIDTH_MAX, Math.max(LANE_WIDTH_MIN, width));
}

export function columnLayoutStorageKey(username) {
  return `columnLayout:${username || "local"}`;
}

export function laneWidthKey(boardPath, lane) {
  return `${boardPath || "/"}\u0000${lane}`;
}

export function normalizeColumnLayout(value) {
  const lanes = {};
  if (value && typeof value.lanes === "object" && value.lanes) {
    for (const [key, width] of Object.entries(value.lanes)) {
      if (typeof key === "string" && key) lanes[key] = clampLaneWidth(width);
    }
  }
  return {
    defaultWidth: clampLaneWidth(value?.defaultWidth ?? LANE_WIDTH_DEFAULT),
    lanes,
  };
}

export function readColumnLayout(storage, username) {
  try {
    return normalizeColumnLayout(JSON.parse(storage.getItem(columnLayoutStorageKey(username)) || ""));
  } catch {
    return normalizeColumnLayout(null);
  }
}

export function writeColumnLayout(storage, username, layout) {
  storage.setItem(columnLayoutStorageKey(username), JSON.stringify(normalizeColumnLayout(layout)));
}

export function effectiveLaneWidth(layout, boardPath, lane) {
  const stored = layout?.lanes?.[laneWidthKey(boardPath, lane)];
  return stored === undefined ? clampLaneWidth(layout?.defaultWidth) : stored;
}

export function withLaneWidth(layout, boardPath, lane, width) {
  return normalizeColumnLayout({
    ...layout,
    lanes: { ...layout.lanes, [laneWidthKey(boardPath, lane)]: width },
  });
}

export function withoutLaneWidth(layout, boardPath, lane) {
  const lanes = { ...layout.lanes };
  delete lanes[laneWidthKey(boardPath, lane)];
  return normalizeColumnLayout({ ...layout, lanes });
}

export function renameLaneWidth(layout, boardPath, from, to) {
  const lanes = {};
  const oldKey = laneWidthKey(boardPath, from);
  const nextKey = laneWidthKey(boardPath, to);
  for (const [key, width] of Object.entries(layout.lanes || {})) {
    lanes[key === oldKey ? nextKey : key] = width;
  }
  return normalizeColumnLayout({ ...layout, lanes });
}
