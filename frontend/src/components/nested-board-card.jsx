import { Show } from "solid-js";
import { NameInput } from "./name-input";
import { visibleName } from "../placeholder-id";

/**
 * A nested board rendered as a card inside a lane. Sub-folders of a lane
 * are first-class work items: click to open that board.
 */
export function NestedBoardCard(props) {
  return (
    <div
      class="card nested-board-card"
      role={props.renaming ? undefined : "link"}
      tabIndex={props.renaming ? -1 : 0}
      title={props.renaming ? undefined : props.t()("boards.nestedHint")}
      onClick={() => {
        if (!props.renaming) {
          props.onOpen();
        }
      }}
      onKeyDown={(e) => {
        if (props.renaming) {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      <Show
        when={!props.renaming}
        fallback={
          <NameInput
            value={props.renameValue}
            placeholder={props.t()("sidebar.childNamePlaceholder")}
            onChange={props.onRenameChange}
            onConfirm={props.onRenameConfirm}
            onCancel={props.onRenameCancel}
          />
        }
      >
        <div class="nested-board-card__row">
          <strong class="nested-board-card__name">
            {visibleName(props.name) || props.t()("common.untitled")}
          </strong>
          <span class="count-badge">{props.totalCards}</span>
        </div>
        <h5 class="nested-board-card__hint">{props.t()("boards.nestedHint")}</h5>
      </Show>
    </div>
  );
}
