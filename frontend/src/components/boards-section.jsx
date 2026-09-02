import { For } from "solid-js";
import { visibleName } from "../placeholder-id";

/**
 * Grid of sub-boards of the current board, with a quick "new board" tile.
 * A sub-board is a child folder with no direct cards but with children.
 *
 * @param {Object} props
 * @param {Object[]} props.boards - [{ name, path, cards, totalCards, children }]
 * @param {Function} props.onOpen - (path: string) => void
 * @param {Function} props.onCreate - () => void
 * @param {Function} props.t
 */
export function BoardsSection(props) {
  function boardSubtitle(board) {
    const parts = [];
    const childBoards = (board.children || []).filter(
      (child) => child.cards === 0 && child.children.length > 0
    );
    const childLanes = (board.children || []).filter(
      (child) => child.cards > 0 || child.children.length === 0
    );
    if (childBoards.length) {
      parts.push(
        props.t()(
          childBoards.length !== 1
            ? "boards.boardsCount_plural"
            : "boards.boardsCount",
          { count: childBoards.length }
        )
      );
    }
    if (childLanes.length) {
      parts.push(
        props.t()(
          childLanes.length !== 1
            ? "boards.lanesCount_plural"
            : "boards.lanesCount",
          { count: childLanes.length }
        ) || `${childLanes.length} lane${childLanes.length === 1 ? "" : "s"}`
      );
    }
    parts.push(
      props.t()(
        board.totalCards !== 1 ? "boards.cardsCount_plural" : "boards.cardsCount",
        { count: board.totalCards }
      )
    );
    return parts.filter(Boolean).join(" · ");
  }

  return (
    <section class="boards">
      <div class="boards__header">
        <h4>{props.t()("boards.title")}</h4>
        <span class="count-badge">{props.boards.length}</span>
      </div>
      <div class="boards__tiles">
        <For each={props.boards}>
          {(board) => (
            <div
              class="board-tile"
              role="link"
              tabIndex={0}
              title={props.t()("boards.open")}
              onClick={() => props.onOpen(board.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onOpen(board.path);
                }
              }}
            >
            <div class="board-tile__top">
              <strong class="board-tile__name">
                {visibleName(board.name) || props.t()("common.untitled")}
              </strong>
            </div>
            <h5 class="board-tile__subtitle">{boardSubtitle(board)}</h5>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
