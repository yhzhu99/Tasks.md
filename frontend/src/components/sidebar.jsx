import {
  createSignal,
  createEffect,
  For,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Menu } from "./menu";
import { NameInput } from "./name-input";
import { getButtonCoordinates } from "../utils";
import {
  IconHome,
  IconPlusSm,
  IconSidebarLeft,
  IconColumns,
  IconPeople,
} from "@stackoverflow/stacks-icons/icons";

/**
 * Recursively renders the tree of boards (any folder is navigable).
 *
 * @param {Object} props
 * @param {Object[]} props.tree - Nested tree of boards: [{ name, path, cards, totalCards, children }]
 * @param {string} props.currentPath - Raw (decoded) path of the board being viewed ("" is home)
 * @param {string} props.basePath
 * @param {boolean} props.collapsed
 * @param {Function} props.onToggle - Toggle sidebar visibility
 * @param {Function} props.onNavigate - (path: string) => void
 * @param {Function} props.onCreateBoard - (parentPath: string) => void
 * @param {Function} props.onRenameBoard - (path: string, newName: string) => void
 * @param {Function} props.onDeleteBoard - (node: Object) => void
 * @param {string|null} props.renameTarget - Path of a board that should be renamed right away
 * @param {Function} props.onRenameTargetConsumed
 * @param {boolean} props.peopleActive - Whether the global people view is open
 * @param {Function} props.onNavigatePeople
 * @param {string} props.homeLabel
 * @param {Function} props.t
 */
export function Sidebar(props) {
  // Paths (raw, decoded) that are expanded in the tree
  const [expanded, setExpanded] = createSignal(new Set());
  // Path of the node currently being renamed
  const [renamingPath, setRenamingPath] = createSignal(null);
  const [renameValue, setRenameValue] = createSignal("");

  function toggleExpanded(path) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function expandPath(path) {
    setExpanded((prev) => {
      if (prev.has(path)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }

  // Auto-expand ancestors of the board being viewed so it's visible in the tree
  createEffect(() => {
    const current = props.currentPath || "";
    if (!current) {
      return;
    }
    const segments = current.split("/").filter(Boolean);
    let accumulated = "";
    for (const segment of segments) {
      accumulated += `/${segment}`;
      expandPath(accumulated);
    }
  });

  // A board was just created (or renamed from elsewhere): focus its rename input
  createEffect(() => {
    if (props.renameTarget) {
      setRenamingPath(props.renameTarget);
      setRenameValue(props.renameTarget.split("/").filter(Boolean).at(-1) || "");
      props.onRenameTargetConsumed();
    }
  });

  function startRenaming(node) {
    setRenamingPath(node.path);
    setRenameValue(node.name);
  }

  function confirmRename() {
    const path = renamingPath();
    if (!path) {
      return;
    }
    const trimmed = (renameValue() || "").trim();
    if (!trimmed || trimmed === path.split("/").filter(Boolean).at(-1)) {
      setRenamingPath(null);
      return;
    }
    props.onRenameBoard(path, trimmed);
    setRenamingPath(null);
  }

  function getNameErrorMsg(newName, siblings) {
    if (!newName) {
      return props.t()("validation.mustHaveName");
    }
    if (newName.startsWith(".")) {
      return props.t()("validation.hiddenByDot");
    }
    if (siblings.some((name) => name === newName.trim())) {
      return props.t()("validation.duplicateName");
    }
    if (/[<>:%"/\\|?*]/g.test(newName)) {
      return props.t()("validation.forbiddenChars");
    }
    if (newName.endsWith(".md")) {
      return props.t()("validation.noMdExtension");
    }
    return null;
  }

  const Chevron = (p) => (
    <svg
      class={`sidebar__chevron ${p.expanded ? "sidebar__chevron--expanded" : ""}`}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );

  /**
   * @param {Object} node - Tree node
   * @param {Object[]} siblings - Sibling nodes (for duplicate name validation)
   */
  const TreeNode = (node, siblings) => {
    const [showMenu, setShowMenu] = createSignal(false);
    const [menuCoordinates, setMenuCoordinates] = createSignal();
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded().has(node.path);
    const isActive = props.currentPath === node.path;
    const isRenaming = renamingPath() === node.path;

    function handleOptionsBtnClick(e) {
      e.preventDefault();
      e.stopPropagation();
      setMenuCoordinates(getButtonCoordinates(e));
      setShowMenu(true);
    }

    function handleRowClick(e) {
      e.stopPropagation();
      if (hasChildren) {
        toggleExpanded(node.path);
      }
      props.onNavigate(node.path);
    }

    const menuOptions = [
      {
        label: props.t()("sidebar.newSubBoard"),
        onClick: () => props.onCreateBoard(node.path),
      },
      { label: props.t()("sidebar.rename"), onClick: () => startRenaming(node) },
      {
        label: props.t()("sidebar.delete"),
        onClick: () => props.onDeleteBoard(node),
        requiresConfirmation: true,
      },
    ];

    return (
      <li class="sidebar__node">
        <Show
          when={!isRenaming}
          fallback={
            <div class="sidebar__rename">
              <NameInput
                value={renameValue()}
                errorMsg={getNameErrorMsg(
                  renameValue(),
                  siblings.map((sibling) => sibling.name)
                )}
                onChange={(newValue) => setRenameValue(newValue)}
                onConfirm={confirmRename}
                onCancel={() => setRenamingPath(null)}
              />
            </div>
          }
        >
          <div
            class={`sidebar__node-row ${isActive ? "sidebar__node-row--active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={handleRowClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleRowClick(e);
              }
            }}
          >
            <span
              class={`sidebar__expander ${hasChildren ? "" : "sidebar__expander--hidden"}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.path);
              }}
            >
              <Chevron expanded={isExpanded} />
            </span>
            <span class="sidebar__node-icon" innerHTML={IconColumns} />
            <span class="sidebar__node-name" title={node.name}>
              {node.name}
            </span>
            <Show when={node.totalCards > 0}>
              <span class="sidebar__node-count">{node.totalCards}</span>
            </Show>
            <button
              type="button"
              class="small sidebar__node-options-btn"
              title={props.t()("sidebar.showOptions")}
              onClick={handleOptionsBtnClick}
            >
              <span innerHTML={"…"} />
            </button>
          </div>
          <Show when={showMenu()}>
            <Portal>
              <Menu
                id={`sidebar-node-${encodeURIComponent(node.path)}-options`}
                open={showMenu()}
                options={menuOptions}
                onClose={() => {
                  setShowMenu(false);
                  setMenuCoordinates(null);
                }}
                x={menuCoordinates()?.x}
                y={menuCoordinates()?.y}
              />
            </Portal>
          </Show>
        </Show>
        <Show when={hasChildren && isExpanded}>
          <ul class="sidebar__node-children">
            <For each={node.children}>
              {(child) => TreeNode(child, node.children)}
            </For>
          </ul>
        </Show>
      </li>
    );
  };

  const homeActive = !props.currentPath;

  return (
    <Show
      when={!props.collapsed}
      fallback={
        <button
          type="button"
          class="sidebar__expand-btn"
          title={props.t()("sidebar.expand")}
          onClick={props.onToggle}
        >
          <span innerHTML={IconSidebarLeft} />
        </button>
      }
    >
      <aside class="sidebar">
        <div class="sidebar__header">
          <span class="sidebar__title">{props.t()("sidebar.title")}</span>
          <button
            type="button"
            class="small"
            title={props.t()("sidebar.collapse")}
            onClick={props.onToggle}
          >
            <span innerHTML={IconSidebarLeft} />
          </button>
        </div>
        <nav class="sidebar__tree" aria-label={props.t()("sidebar.title")}>
          <div
            class={`sidebar__node-row sidebar__node-row--home ${homeActive ? "sidebar__node-row--active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => props.onNavigate("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onNavigate("");
              }
            }}
          >
            <span class="sidebar__expander sidebar__expander--hidden" />
            <span class="sidebar__node-icon" innerHTML={IconHome} />
            <span class="sidebar__node-name">{props.homeLabel}</span>
          </div>
          <div
            class={`sidebar__node-row sidebar__node-row--home ${props.peopleActive ? "sidebar__node-row--active" : ""}`}
            role="button"
            tabIndex={0}
            title={props.t()("people.viewAll")}
            onClick={() => props.onNavigatePeople()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onNavigatePeople();
              }
            }}
          >
            <span class="sidebar__expander sidebar__expander--hidden" />
            <span class="sidebar__node-icon" innerHTML={IconPeople} />
            <span class="sidebar__node-name">{props.t()("people.viewAll")}</span>
          </div>
          <Show
            when={props.tree?.length}
            fallback={
              <div class="sidebar__empty">{props.t()("sidebar.empty")}</div>
            }
          >
            <ul class="sidebar__root">
              <For each={props.tree}>
                {(node) => TreeNode(node, props.tree)}
              </For>
            </ul>
          </Show>
        </nav>
        <div class="sidebar__footer">
          <button
            type="button"
            class="sidebar__new-board-btn"
            title={props.t()("sidebar.newBoard")}
            onClick={() => props.onCreateBoard(props.currentPath || "")}
          >
            <span innerHTML={IconPlusSm} />
            <span>{props.t()("sidebar.newBoard")}</span>
          </button>
        </div>
      </aside>
    </Show>
  );
}
