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
import { isPlaceholderId, visibleName } from "../placeholder-id";

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

  function visibleNodes(nodes) {
    const currentRenaming = renamingPath();
    const renameTarget = props.renameTarget;
    return (nodes || []).filter((node) => {
      if (HIDDEN_PATHS.has(node.path)) {
        return false;
      }
      if (!isPlaceholderId(node.name)) {
        return true;
      }
      return node.path === currentRenaming || node.path === renameTarget;
    });
  }

  const visibleTree = createMemo(() => visibleNodes(props.tree || []));

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
    const tree = props.tree || [];
    if (current === lastAutoExpandPath) {
      return;
    }
    if (!current || HIDDEN_PATHS.has(current)) {
      lastAutoExpandPath = current;
      return;
    }
    const segments = current.split("/").filter(Boolean);
    let accumulated = "";
    let currentNode = null;
    let level = tree;
    for (const segment of segments) {
      accumulated += `/${segment}`;
      currentNode = level.find((node) => node.path === accumulated) || null;
      level = currentNode?.children || [];
    }
    if (segments.length && !currentNode && tree.length === 0) {
      return;
    }
    lastAutoExpandPath = current;
    setExpanded((prev) => {
      const next = new Set(prev);
      let pathSoFar = "";
      for (const segment of segments) {
        pathSoFar += `/${segment}`;
        next.add(pathSoFar);
      }
      for (const child of currentNode?.children || []) {
        if (child.kind === "lane" && (child.children || []).length) {
          next.add(child.path);
        }
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
    const path = renamingPath() || props.renameTarget;
    if (path && (renamingIsNew() || path === props.renameTarget)) {
      props.onDeleteBoard({ path });
    }
    stopRenaming();
  }

  function confirmRename() {
    const path = renamingPath() || props.renameTarget;
    if (!path) {
      return;
    }
    const trimmed = (renameValue() || "").trim();
    if (!trimmed || isPlaceholderId(trimmed)) {
      if (renamingIsNew() || isPlaceholderId(path.split("/").filter(Boolean).at(-1))) {
        discardNewBoard();
        return;
      }
      stopRenaming();
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
            onClick={() => props.onCreateBoard("", { enter: false })}
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
                    renameTarget={props.renameTarget}
                    renameValue={renameValue()}
                    renameKeepOpen={renamingIsNew()}
                    visibleChildren={visibleNodes}
                    untitledLabel={props.t()("common.untitled")}
                    onToggle={toggleExpanded}
                    onNavigate={props.onNavigate}
                    onCreateBoard={props.onCreateBoard}
                    onCreateLane={props.onCreateLane}
                    onStartRename={startRenaming}
                    onDeleteBoard={props.onDeleteBoard}
                    onMoveBoard={props.onMoveBoard}
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
  const [showAddMenu, setShowAddMenu] = createSignal(false);
  const [menuCoordinates, setMenuCoordinates] = createSignal();
  const [addMenuCoordinates, setAddMenuCoordinates] = createSignal();
  const node = () => props.node;
  const hasChildren = () => (node().children || []).length > 0;
  const isExpanded = () => props.expanded.has(node().path);
  const isActive = () => props.activePath === node().path;
  const isRenaming = () =>
    props.renamingPath === node().path || props.renameTarget === node().path;

  function handleOptionsBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();
    setMenuCoordinates(getButtonCoordinates(e));
    setShowMenu(true);
  }

  const siblingIndex = () =>
    (props.siblings || []).findIndex((sibling) => sibling.path === node().path);

  const menuOptions = () => {
    const options = [
      { label: props.t()("sidebar.rename"), onClick: () => props.onStartRename(node()) },
    ];
    if (siblingIndex() > 0) {
      options.push({
        label: props.t()("sidebar.moveUp"),
        onClick: () => props.onMoveBoard?.(node().path, -1),
      });
    }
    if (siblingIndex() >= 0 && siblingIndex() < (props.siblings || []).length - 1) {
      options.push({
        label: props.t()("sidebar.moveDown"),
        onClick: () => props.onMoveBoard?.(node().path, 1),
      });
    }
    options.push({
      label: props.t()("sidebar.delete"),
      onClick: () => props.onDeleteBoard(node()),
      requiresConfirmation: true,
    });
    return options;
  };

  const addMenuOptions = () => [
    {
      label: props.t()("sidebar.newLane"),
      onClick: () => props.onCreateLane(node().path),
    },
    {
      label: props.t()("sidebar.newChildBoardShort"),
      onClick: () => props.onCreateBoard(node().path),
    },
  ];

  function handleAddClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const options = addMenuOptions();
    if (options.length === 1) {
      options[0].onClick();
      return;
    }
    setAddMenuCoordinates(getButtonCoordinates(e));
    setShowAddMenu(true);
  }

  function addButtonTitle() {
    const options = addMenuOptions();
    if (options.length === 1) {
      return options[0].label;
    }
    return props.t()("sidebar.addUnder", {
      name: visibleName(node().name) || props.untitledLabel,
    });
  }

  const isChildBoard = () =>
    (node().path || "").split("/").filter(Boolean).length > 1;

  return (
    <li
      class="sidebar__node"
      id={`sidebar-item-${encodeURIComponent(node().path)}`}
    >
      <Show
        when={!isRenaming()}
        fallback={
          <div class="sidebar__rename">
            <NameInput
              value={
                isPlaceholderId(node().name) && !props.renameValue
                  ? ""
                  : props.renameValue
              }
              placeholder={
                node().kind === "lane"
                  ? props.t()("laneName.namePlaceholder")
                  : isChildBoard()
                    ? props.t()("sidebar.childNamePlaceholder")
                    : props.t()("sidebar.namePlaceholder")
              }
              errorMsg={
                props.renameValue
                  ? props.getNameErrorMsg(
                      props.renameValue,
                      props.siblings
                        .filter((sibling) => !isPlaceholderId(sibling.name))
                        .map((sibling) => sibling.name)
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
          class={`sidebar__node-row ${isActive() ? "sidebar__node-row--active" : ""} ${
            node().kind === "lane" ? "sidebar__node-row--lane" : ""
          }`}
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
            onClick={() => props.onNavigate(node().path, node())}
          >
            <span
              class="sidebar__node-name"
              title={visibleName(node().name) || props.untitledLabel}
            >
              {visibleName(node().name) || props.untitledLabel}
            </span>
            <Show when={node().totalCards > 0}>
              <span class="sidebar__node-count">{node().totalCards}</span>
            </Show>
          </button>
          <button
            type="button"
            class="sidebar__add-child-btn"
            title={addButtonTitle()}
            aria-label={addButtonTitle()}
            onClick={handleAddClick}
          >
            <span innerHTML={IconPlusSm} />
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
        <Show when={showAddMenu()}>
          <Portal>
            <Menu
              id={`sidebar-node-${encodeURIComponent(node().path)}-add`}
              open={showAddMenu()}
              options={addMenuOptions()}
              onClose={() => {
                setShowAddMenu(false);
                setAddMenuCoordinates(null);
              }}
              x={addMenuCoordinates()?.x}
              y={addMenuCoordinates()?.y}
            />
          </Portal>
        </Show>
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
          <For each={props.visibleChildren(node().children)}>
            {(child) => (
              <SidebarNode
                node={child}
                siblings={props.visibleChildren(node().children)}
                depth={(props.depth || 0) + 1}
                expanded={props.expanded}
                activePath={props.activePath}
                renamingPath={props.renamingPath}
                renameTarget={props.renameTarget}
                renameValue={props.renameValue}
                renameKeepOpen={props.renameKeepOpen}
                visibleChildren={props.visibleChildren}
                untitledLabel={props.untitledLabel}
                onToggle={props.onToggle}
                onNavigate={props.onNavigate}
                onCreateBoard={props.onCreateBoard}
                onCreateLane={props.onCreateLane}
                onStartRename={props.onStartRename}
                onDeleteBoard={props.onDeleteBoard}
                onMoveBoard={props.onMoveBoard}
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
