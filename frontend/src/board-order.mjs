// Cards missing from a saved manual list are new. They stay at the top,
// newest first, until someone drags them into a custom slot. Index 0 is a
// real position (a falsy index must not be treated as "missing").
export function manualRank(sortMap, lane, name) {
  const list = sortMap?.[lane];
  if (!Array.isArray(list)) return Number.POSITIVE_INFINITY;
  const index = list.indexOf(name);
  return index < 0 ? Number.NEGATIVE_INFINITY : index;
}

export function compareManual(sortMap) {
  return (a, b) => {
    const rankA = manualRank(sortMap, a.lane, a.name);
    const rankB = manualRank(sortMap, b.lane, b.name);
    if (rankA !== rankB) return rankA - rankB;
    return (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
  };
}

export function orderCards(cards, mode, direction = "asc") {
  const list = [...cards];
  const dir = direction === "desc" ? -1 : 1;
  if (mode === "name") {
    list.sort((a, b) => dir * (a.name || "").localeCompare(b.name || ""));
  } else if (mode === "tags") {
    list.sort((a, b) => dir * (a.tags?.[0]?.name || "").localeCompare(b.tags?.[0]?.name || ""));
  } else if (mode === "due") {
    list.sort((a, b) => direction === "asc"
      ? (a.dueDate || "z").localeCompare(b.dueDate || "z")
      : (b.dueDate || "").localeCompare(a.dueDate || ""));
  } else if (mode === "lastUpdated") {
    list.sort((a, b) => (b.lastUpdated || "").localeCompare(a.lastUpdated || ""));
  } else if (mode === "createdFirst") {
    list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  } else if (mode === "priority") {
    list.sort((a, b) => {
      const priorityA = a.priorityAt || "";
      const priorityB = b.priorityAt || "";
      if (priorityA && priorityB) return dir * priorityA.localeCompare(priorityB);
      if (priorityA) return -1;
      if (priorityB) return 1;
      return 0;
    });
  }
  return list;
}

export function cardOrderKey(card) {
  return `${card.lane}\u0000${card.name}`;
}

// Automatic sorts keep their order while cards are only edited, so another
// person's update does not shuffle the column under the reader. A new,
// removed, moved or explicitly re-sorted card computes a fresh order.
export function placeCards(cards, mode, direction, pinned) {
  if (mode === "none") return { cards, pinned: null };
  const keys = cards.map(cardOrderKey);
  const same = pinned
    && pinned.mode === mode
    && pinned.direction === direction
    && pinned.keys.length === keys.length
    && pinned.keys.every((key) => keys.includes(key));
  if (same) {
    const byKey = new Map(cards.map((card) => [cardOrderKey(card), card]));
    return { cards: pinned.keys.map((key) => byKey.get(key)).filter(Boolean), pinned };
  }
  const ordered = orderCards(cards, mode, direction);
  return { cards: ordered, pinned: { mode, direction, keys: ordered.map(cardOrderKey) } };
}
