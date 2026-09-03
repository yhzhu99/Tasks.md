import { createMemo, For, Show } from "solid-js";
import {
  IconSidebarLeft,
  IconSidebarRight,
  IconPeople,
  IconEye,
  IconArchive,
  IconGear,
} from "@stackoverflow/stacks-icons/icons";

/**
 * Full-width app toolbar. Board-specific controls hide on the People view.
 * View density lives in Settings so this bar stays focused on search,
 * filter, and create actions.
 *
 * @param {Object} props
 * @param {string} props.sort
 * @param {string} props.search
 * @param {string} props.filteredTag
 * @param {string[]} props.tagOptions
 * @param {Function} props.onSearchChange
 * @param {Function} props.onTagChange
 * @param {Function} props.onNewLaneBtnClick
 * @param {Function} props.onNewBoardBtnClick
 * @param {boolean} props.hideBoardControls
 * @param {boolean} props.peopleActive
 * @param {Function} props.onNavigatePeople
 * @param {boolean} props.sidebarCollapsed
 * @param {Function} props.onToggleSidebar
 * @param {boolean} props.selectionMode
 * @param {Function} props.onSelectionModeChange
 * @param {Function} props.onOpenSettings
 * @param {Function} props.t
 */
export function Header(props) {
  const filterSelect = createMemo(() => {
    if (!props.tagOptions.length) {
      return null;
    }
    return (
      <select
        class="app-header__select"
        onChange={props.onTagChange}
        value={props.filteredTag || "none"}
        title={props.t()("header.filterByTag")}
        aria-label={props.t()("header.filterByTag")}
      >
        <option value="none">{props.t()("header.filterNone")}</option>
        <For each={props.tagOptions}>
          {(tag) => <option value={tag}>{tag}</option>}
        </For>
      </select>
    );
  });

  return (
    <header class="app-header">
      <button
        type="button"
        class="app-header__icon-btn"
        title={
          props.sidebarCollapsed
            ? props.t()("header.showSidebar")
            : props.t()("header.hideSidebar")
        }
        aria-label={
          props.sidebarCollapsed
            ? props.t()("header.showSidebar")
            : props.t()("header.hideSidebar")
        }
        aria-pressed={!props.sidebarCollapsed}
        onClick={props.onToggleSidebar}
      >
        <span
          innerHTML={
            props.sidebarCollapsed ? IconSidebarRight : IconSidebarLeft
          }
        />
      </button>
      <button
        type="button"
        class={`app-header__view-btn ${props.peopleActive ? "button--active" : ""}`}
        title={props.t()("people.viewAll")}
        aria-pressed={!!props.peopleActive}
        onClick={props.onNavigatePeople}
      >
        <span innerHTML={IconPeople} />
        <span>{props.t()("people.viewAll")}</span>
      </button>
      <button
        type="button"
        class={`app-header__view-btn ${props.reviewActive ? "button--active" : ""}`}
        title={props.t()("review.viewAll")}
        aria-pressed={!!props.reviewActive}
        onClick={props.onNavigateReview}
      >
        <span innerHTML={IconEye} />
        <span>{props.t()("review.viewAll")}</span>
      </button>
      <button
        type="button"
        class={`app-header__view-btn ${props.doneActive ? "button--active" : ""}`}
        title={props.t()("done.viewAll")}
        aria-pressed={!!props.doneActive}
        onClick={props.onNavigateDone}
      >
        <span innerHTML={IconArchive} />
        <span>{props.t()("done.viewAll")}</span>
      </button>
      <Show when={!props.hideBoardControls}>
        <input
          placeholder={props.t()("header.searchPlaceholder")}
          type="search"
          value={props.search || ""}
          onInput={(e) => props.onSearchChange(e.target.value)}
          class="search-input"
          aria-label={props.t()("header.searchPlaceholder")}
        />
        <select
          class="app-header__select"
          onChange={props.onSortChange}
          value={props.sort}
          title={props.t()("header.sortBy")}
          aria-label={props.t()("header.sortBy")}
        >
          <option value="none">{props.t()("header.sort.manually")}</option>
          <option value="priority:asc">
            {props.t()("header.sort.priorityFirst")}
          </option>
          <option value="priority:desc">
            {props.t()("header.sort.priorityLast")}
          </option>
          <option value="name:asc">{props.t()("header.sort.nameAsc")}</option>
          <option value="name:desc">{props.t()("header.sort.nameDesc")}</option>
          <option value="tags:asc">{props.t()("header.sort.tagsAsc")}</option>
          <option value="tags:desc">{props.t()("header.sort.tagsDesc")}</option>
          <option value="due:asc">{props.t()("header.sort.dueAsc")}</option>
          <option value="due:desc">{props.t()("header.sort.dueDesc")}</option>
          <option value="lastUpdated:desc">
            {props.t()("header.sort.lastUpdated")}
          </option>
          <option value="createdFirst:asc">
            {props.t()("header.sort.createdFirst")}
          </option>
        </select>
        {filterSelect()}
      </Show>
      <div class="app-header__spacer" />
      <Show when={!props.hideBoardControls}>
        <div class="app-header__actions">
          <button
            type="button"
            onClick={props.onNewLaneBtnClick}
            disabled={props.selectionMode}
          >
            {props.t()("header.newLane")}
          </button>
          <button
            type="button"
            onClick={() => props.onSelectionModeChange?.(!props.selectionMode)}
            class={props.selectionMode ? "button--active" : ""}
            aria-pressed={!!props.selectionMode}
          >
            {props.selectionMode
              ? props.t()("header.exitSelection")
              : props.t()("header.selectCards")}
          </button>
        </div>
      </Show>
      <button
        type="button"
        class="app-header__icon-btn app-header__settings-btn"
        title={props.t()("header.settings")}
        aria-label={props.t()("header.settings")}
        onClick={props.onOpenSettings}
      >
        <span innerHTML={IconGear} />
      </button>
    </header>
  );
}
