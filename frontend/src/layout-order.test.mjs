import assert from "node:assert/strict";
import test from "node:test";
import { compareManual, manualRank, orderCards, placeCards } from "./board-order.mjs";
import { clampLaneWidth, effectiveLaneWidth, laneWidthKey, normalizeColumnLayout, renameLaneWidth, withLaneWidth, withoutLaneWidth } from "./column-layout.mjs";

test("manual order keeps the first saved card and puts new cards on top", () => {
  const sortMap = { Todo: ["First", "Second"] };
  assert.equal(manualRank(sortMap, "Todo", "First"), 0);
  assert.equal(manualRank(sortMap, "Todo", "Second"), 1);
  assert.equal(manualRank(sortMap, "Todo", "Brand new"), Number.NEGATIVE_INFINITY);
  const ordered = [
    { lane: "Todo", name: "Second", lastUpdated: "2026-09-01T00:00:00.000Z" },
    { lane: "Todo", name: "Brand new", lastUpdated: "2026-09-03T00:00:00.000Z" },
    { lane: "Todo", name: "First", lastUpdated: "2026-09-02T00:00:00.000Z" },
    { lane: "Todo", name: "Newer still", lastUpdated: "2026-09-04T00:00:00.000Z" },
  ].sort(compareManual(sortMap));
  assert.deepEqual(ordered.map((card) => card.name), ["Newer still", "Brand new", "First", "Second"]);
});

test("a lane without a saved order follows last update", () => {
  const ordered = [
    { lane: "Doing", name: "Old", lastUpdated: "2026-09-01T00:00:00.000Z" },
    { lane: "Doing", name: "New", lastUpdated: "2026-09-05T00:00:00.000Z" },
  ].sort(compareManual({}));
  assert.deepEqual(ordered.map((card) => card.name), ["New", "Old"]);
});

test("last updated puts the newest card first", () => {
  const ordered = orderCards([
    { name: "Old", lastUpdated: "2026-09-01T00:00:00.000Z" },
    { name: "New", lastUpdated: "2026-09-05T00:00:00.000Z" },
  ], "lastUpdated", "desc");
  assert.deepEqual(ordered.map((card) => card.name), ["New", "Old"]);
});

test("editing a card does not reshuffle an automatic order", () => {
  const initial = placeCards([
    { lane: "Todo", name: "Old", lastUpdated: "2026-09-01T00:00:00.000Z" },
    { lane: "Todo", name: "New", lastUpdated: "2026-09-05T00:00:00.000Z" },
  ], "lastUpdated", "desc", null);
  assert.deepEqual(initial.cards.map((card) => card.name), ["New", "Old"]);
  const edited = placeCards([
    { lane: "Todo", name: "Old", lastUpdated: "2026-09-09T00:00:00.000Z", content: "changed" },
    { lane: "Todo", name: "New", lastUpdated: "2026-09-05T00:00:00.000Z" },
  ], "lastUpdated", "desc", initial.pinned);
  assert.deepEqual(edited.cards.map((card) => card.name), ["New", "Old"]);
  assert.equal(edited.cards[1].content, "changed");
});

test("a new card joins at the position of a fresh sort", () => {
  const initial = placeCards([
    { lane: "Todo", name: "Old", lastUpdated: "2026-09-01T00:00:00.000Z" },
  ], "lastUpdated", "desc", null);
  const next = placeCards([
    { lane: "Todo", name: "Old", lastUpdated: "2026-09-01T00:00:00.000Z" },
    { lane: "Todo", name: "Just added", lastUpdated: "2026-09-09T00:00:00.000Z" },
  ], "lastUpdated", "desc", initial.pinned);
  assert.deepEqual(next.cards.map((card) => card.name), ["Just added", "Old"]);
});

test("column widths are clamped per lane and survive a rename", () => {
  assert.equal(clampLaneWidth("400"), 400);
  assert.equal(clampLaneWidth(10), 220);
  assert.equal(clampLaneWidth(5000), 960);
  assert.equal(clampLaneWidth("nope"), 380);
  const layout = withLaneWidth(normalizeColumnLayout({ defaultWidth: 380 }), "/Board", "Todo", 520);
  assert.equal(effectiveLaneWidth(layout, "/Board", "Todo"), 520);
  assert.equal(effectiveLaneWidth(layout, "/Board", "Doing"), 380);
  assert.equal(laneWidthKey("/Board", "Todo") in layout.lanes, true);
  const renamed = renameLaneWidth(layout, "/Board", "Todo", "Doing");
  assert.equal(effectiveLaneWidth(renamed, "/Board", "Doing"), 520);
  assert.equal(effectiveLaneWidth(withoutLaneWidth(renamed, "/Board", "Doing"), "/Board", "Doing"), 380);
});
