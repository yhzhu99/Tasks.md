import { For } from "solid-js";
import { IconColumns, IconPlusSm } from "@stackoverflow/stacks-icons/icons";

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
    if (board.children.length) {
      parts.push(
        props.t()(
          board.children.length !== 1
            ? "boards.boardsCount_plural"
            : "boards.boardsCount",
          { count: board.children.length }
        )
      );
    }
    parts.push(
      props.t()(
        board.totalCards !== 1 ? "boards.cardsCount_plural" : "boards.cardsCount",
        { count: board.totalCards }
      )
    );
    return parts.join(" · ");
  }

  return (
    <section class="boards">
      <div class="boards__header">
        <h4>{props.t()("boards.title")}</h4>
        <span class="tag">
          <h5 class="counter">{props.boards.length}</h5>
        </span>
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
            <div
              class="board-tile__top"
            >
              <div class="board-tile__icon">
                <span innerHTML={IconColumns} />
              </div>
              <strong class="board-tile__name">{board.name}</strong>
            </div>
            <h5 class="board-tile__subtitle">{boardSubtitle(board)}</h5>
            </div>
          )}
        </For>
        <button
          type="button"
          class="board-tile board-tile--new"
          title={props.t()("boards.newBoard")}
          onClick={props.onCreate}
        >
          <span class="board-tile__icon" innerHTML={IconPlusSm} />
          <strong class="board-tile__name">
            {props.t()("boards.newBoard")}
          </strong>
        </button>
      </div>
    </section>
  );
}
