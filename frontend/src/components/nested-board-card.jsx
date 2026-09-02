import { visibleName } from "../placeholder-id";

/**
 * A nested board rendered as a card inside a lane. Sub-folders of a lane
 * are first-class work items: click to open that board.
 *
 * @param {Object} props
 * @param {string} props.name
 * @param {number} props.totalCards
 * @param {Function} props.onOpen
 * @param {Function} props.t
 */
export function NestedBoardCard(props) {
  return (
    <div
      class="card nested-board-card"
      role="link"
      tabIndex={0}
      title={props.t()("boards.open")}
      onClick={props.onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      <div class="nested-board-card__row">
        <strong class="nested-board-card__name">
          {visibleName(props.name) || props.t()("common.untitled")}
        </strong>
        <span class="count-badge">{props.totalCards}</span>
      </div>
      <h5 class="nested-board-card__hint">{props.t()("boards.nestedHint")}</h5>
    </div>
  );
}
