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

const HIDDEN_PATHS = new Set(["/_people", "/_review", "/_done"]);

/**
 * Boards sidebar: recursive tree of every board.
 */
export function Sidebar(props) {
  const [expanded, setExpanded] = createSignal(new Set());
  const [renamingPath, setRenamingPath] = createSignal(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [renamingIsNew, setRenamingIsNew] = createSignal(false);
  let lastAutoExpandPath = null;

  const activePath = createMemo(() => props.currentPath || "");

  const visibleTree = createMemo(() =>
    (props.tree || []).filter((node) => !HIDDEN_PATHS.has(node.path))
  );

  const newBoardParent = createMemo(() =>
    activePath() && !HIDDEN_PATHS.has(activePath()) ? activePath() : ""
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

  // Expand ancestors only when the user navigates to a different board,
  // never on every render — that was forcing trees back open after collapse.
  createEffect(() => {
    const current = props.currentPath || "";
    if (current === lastAutoExpandPath) {
      return;
    }
    lastAutoExpandPath = current;
    if (!current || HIDDEN_PATHS.has(current)) {
      return;
    }
    const segments = current.split("/").filter(Boolean);
    let accumulated = "";
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const segment of segments) {
        accumulated += `/${segment}`;
        next.add(accumulated);
      }
      return next;
    });
  });

  createEffect(() => {
    if (props.renameTarget) {
      const target = props.renameTarget;
      const segments = target.split("/").filter(Boolean);
      let accumulated = "";
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const segment of segments.slice(0, -1)) {
          accumulated += `/${segment}`;
          next.add(accumulated);
        }
        return next;
      });
      setRenamingPath(target);
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
          <Show
            when={visibleTree().length}
            fallback={
              <div class="sidebar__empty">{props.t()("sidebar.empty")}</div>
            }
          >
            <ul class="sidebar__root">
              <For each={visibleTree()}>
                {(node) => (
                  <SidebarNode
                    node={node}
                    siblings={visibleTree()}
                    depth={0}
                    expanded={expanded()}
                    activePath={activePath()}
                    renamingPath={renamingPath()}
                    renameValue={renameValue()}
                    onToggle={toggleExpanded}
                    onNavigate={props.onNavigate}
                    onCreateBoard={props.onCreateBoard}
                    onStartRename={startRenaming}
                    onDeleteBoard={props.onDeleteBoard}
                    onRenameChange={setRenameValue}
                    onRenameConfirm={confirmRename}
                    onRenameCancel={discardNewBoard}
                    getNameErrorMsg={getNameErrorMsg}
                    t={props.t}
                  />
                )}
              </For>
            </ul>
          </Show>
        </nav>
      </aside>
    </Show>
  );
}

function SidebarNode(props) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [menuCoordinates, setMenuCoordinates] = createSignal();
  const node = () => props.node;
  const hasChildren = () => (node().children || []).length > 0;
  const isExpanded = () => props.expanded.has(node().path);
  const isActive = () => props.activePath === node().path;
  const isRenaming = () => props.renamingPath === node().path;

  function handleOptionsBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();
    setMenuCoordinates(getButtonCoordinates(e));
    setShowMenu(true);
  }

  const menuOptions = () => [
    {
      label: props.t()("sidebar.newSubBoard"),
      onClick: () => props.onCreateBoard(node().path),
    },
    { label: props.t()("sidebar.rename"), onClick: () => props.onStartRename(node()) },
    {
      label: props.t()("sidebar.delete"),
      onClick: () => props.onDeleteBoard(node()),
      requiresConfirmation: true,
    },
  ];

  return (
    <li class="sidebar__node">
      <Show
        when={!isRenaming()}
        fallback={
          <div class="sidebar__rename">
            <NameInput
              value={props.renameValue}
              placeholder={props.t()("sidebar.namePlaceholder")}
              errorMsg={
                props.renameValue
                  ? props.getNameErrorMsg(
                      props.renameValue,
                      props.siblings.map((sibling) => sibling.name)
                    )
                  : null
              }
              onChange={props.onRenameChange}
              onConfirm={props.onRenameConfirm}
              onCancel={props.onRenameCancel}
            />
          </div>
        }
      >
        <div
          class={`sidebar__node-row ${isActive() ? "sidebar__node-row--active" : ""}`}
        >
          <button
            type="button"
            class={`sidebar__expander ${hasChildren() ? "" : "sidebar__expander--hidden"}`}
            aria-expanded={hasChildren() ? isExpanded() : undefined}
            aria-label={
              isExpanded()
                ? props.t()("sidebar.collapse")
                : props.t()("sidebar.expand")
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (hasChildren()) {
                props.onToggle(node().path);
              }
            }}
          >
            <svg
              class={`sidebar__chevron ${isExpanded() ? "sidebar__chevron--expanded" : ""}`}
              viewBox="0 0 16 16"
              width="10"
              height="10"
              aria-hidden="true"
            >
              <path
                d="M6 3.5 10.5 8 6 12.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="sidebar__node-main"
            onClick={() => props.onNavigate(node().path)}
          >
            <span class="sidebar__node-name" title={node().name}>
              {node().name}
            </span>
            <Show when={node().totalCards > 0}>
              <span class="sidebar__node-count">{node().totalCards}</span>
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
              id={`sidebar-node-${encodeURIComponent(node().path)}-options`}
              open={showMenu()}
              options={menuOptions()}
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
      <Show when={hasChildren() && isExpanded()}>
        <ul class="sidebar__node-children">
          <For each={node().children}>
            {(child) => (
              <SidebarNode
                node={child}
                siblings={node().children}
                depth={(props.depth || 0) + 1}
                expanded={props.expanded}
                activePath={props.activePath}
                renamingPath={props.renamingPath}
                renameValue={props.renameValue}
                onToggle={props.onToggle}
                onNavigate={props.onNavigate}
                onCreateBoard={props.onCreateBoard}
                onStartRename={props.onStartRename}
                onDeleteBoard={props.onDeleteBoard}
                onRenameChange={props.onRenameChange}
                onRenameConfirm={props.onRenameConfirm}
                onRenameCancel={props.onRenameCancel}
                getNameErrorMsg={props.getNameErrorMsg}
                t={props.t}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}
