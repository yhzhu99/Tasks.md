import {
  createSignal,
  createEffect,
  createMemo,
  For,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Menu } from "./menu";
import { NameInput } from "./name-input";
import { getButtonCoordinates } from "../utils";
import { IconPlusSm, IconEllipsisVertical } from "@stackoverflow/stacks-icons/icons";

/**
 * Boards sidebar: recursive tree of every board. Any folder is navigable;
 * boards with cards show their card count. Home / People live in the header.
 *
 * @param {Object} props
 * @param {Object[]} props.tree - Nested tree of boards: [{ name, path, cards, totalCards, children }]
 * @param {string} props.currentPath - Raw (decoded) path of the board being viewed ("" is home, "/_people" is the people view)
 * @param {string} props.basePath
 * @param {boolean} props.collapsed
 * @param {Function} props.onNavigate - (path: string) => void
 * @param {Function} props.onCreateBoard - (parentPath: string) => void
 * @param {Function} props.onRenameBoard - (path: string, newName: string) => void
 * @param {Function} props.onDeleteBoard - (node: Object) => void
 * @param {string|null} props.renameTarget - Path of a board that should be renamed right away
 * @param {Function} props.onRenameTargetConsumed
 * @param {Function} props.t
 */
export function Sidebar(props) {
  // Paths (raw, decoded) that are expanded in the tree
  const [expanded, setExpanded] = createSignal(new Set());
  // Path of the node currently being renamed
  const [renamingPath, setRenamingPath] = createSignal(null);
  const [renameValue, setRenameValue] = createSignal("");
  // True while a freshly created board awaits its name: cancelling or
  // confirming with a blank name deletes the placeholder resource
  const [renamingIsNew, setRenamingIsNew] = createSignal(false);

  const activePath = createMemo(() => props.currentPath || "");

  // "/_people" is reserved for the people view; never show it as a board
  const visibleTree = createMemo(
    () => (props.tree || []).filter((node) => node.path !== "/_people")
  );

  // "New board" is created in the board that is currently open
  const newBoardParent = createMemo(() =>
    activePath() && activePath() !== "/_people" ? activePath() : ""
  );

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

  // A board was just created: focus an empty rename input so the user can
  // type the real name right away (placeholder resource is removed on cancel)
  createEffect(() => {
    if (props.renameTarget) {
      setRenamingPath(props.renameTarget);
      setRenameValue("");
      setRenamingIsNew(true);
      props.onRenameTargetConsumed();
    }
  });

  function startRenaming(node) {
    setRenamingPath(node.path);
    setRenameValue(node.name);
    setRenamingIsNew(false);
  }

  function stopRenaming() {
    setRenamingPath(null);
    setRenameValue("");
    setRenamingIsNew(false);
  }

  function discardNewBoard() {
    const path = renamingPath();
    if (renamingIsNew() && path) {
      props.onDeleteBoard({ path });
    }
    stopRenaming();
  }

  function confirmRename() {
    const path = renamingPath();
    if (!path) {
      return;
    }
    const trimmed = (renameValue() || "").trim();
    if (!trimmed) {
      discardNewBoard();
      return;
    }
    const currentName = path.split("/").filter(Boolean).at(-1);
    if (trimmed !== currentName) {
      props.onRenameBoard(path, trimmed);
    }
    stopRenaming();
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
    const isActive = activePath() === node.path;
    const isRenaming = renamingPath() === node.path;

    function handleOptionsBtnClick(e) {
      e.preventDefault();
      e.stopPropagation();
      setMenuCoordinates(getButtonCoordinates(e));
      setShowMenu(true);
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
                placeholder={props.t()("sidebar.namePlaceholder")}
                errorMsg={
                  renameValue()
                    ? getNameErrorMsg(
                        renameValue(),
                        siblings.map((sibling) => sibling.name)
                      )
                    : null
                }
                onChange={(newValue) => setRenameValue(newValue)}
                onConfirm={confirmRename}
                onCancel={discardNewBoard}
              />
            </div>
          }
        >
          <div
            class={`sidebar__node-row ${isActive ? "sidebar__node-row--active" : ""}`}
          >
            <button
              type="button"
              class={`sidebar__expander ${hasChildren ? "" : "sidebar__expander--hidden"}`}
              aria-label={
                isExpanded
                  ? props.t()("sidebar.collapse")
                  : props.t()("sidebar.expand")
              }
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.path);
              }}
            >
              <Chevron expanded={isExpanded} />
            </button>
            <button
              type="button"
              class="sidebar__node-main"
              onClick={() => props.onNavigate(node.path)}
            >
              <span class="sidebar__node-name" title={node.name}>
                {node.name}
              </span>
              <Show when={node.totalCards > 0}>
                <span class="sidebar__node-count">{node.totalCards}</span>
              </Show>
            </button>
            <button
              type="button"
              class="sidebar__options-btn"
              title={props.t()("sidebar.showOptions")}
              onClick={handleOptionsBtnClick}
            >
              <span innerHTML={IconEllipsisVertical} />
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

  return (
    <Show when={!props.collapsed}>
      <aside class="sidebar">
        <header class="sidebar__header">
          <button
            type="button"
            class="sidebar__brand-btn"
            title={props.t()("sidebar.goHome")}
            onClick={() => props.onNavigate("")}
          >
            <strong class="sidebar__title">{props.t()("sidebar.title")}</strong>
          </button>
          <button
            type="button"
            class="sidebar__add-btn"
            title={props.t()("sidebar.newBoard")}
            aria-label={props.t()("sidebar.newBoard")}
            onClick={() => props.onCreateBoard(newBoardParent())}
          >
            <span innerHTML={IconPlusSm} />
          </button>
        </header>
        <nav class="sidebar__nav" aria-label={props.t()("sidebar.title")}>
          <div class="sidebar__section">
            <Show
              when={visibleTree().length}
              fallback={
                <div class="sidebar__empty">{props.t()("sidebar.empty")}</div>
              }
            >
              <ul class="sidebar__root">
                <For each={visibleTree()}>
                  {(node) => TreeNode(node, visibleTree())}
                </For>
              </ul>
            </Show>
          </div>
        </nav>
      </aside>
    </Show>
  );
}
