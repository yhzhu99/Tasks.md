import {
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
  createMemo,
  createEffect,
  createResource,
  batch,
} from "solid-js";
import ExpandedCard from "./components/expanded-card";
import { debounce } from "@solid-primitives/scheduled";
import { api } from "./api";
import { LaneName } from "./components/lane-name";
import { NameInput } from "./components/name-input";
import { Header } from "./components/header";
import { Card } from "./components/card";
import { CardName } from "./components/card-name";
import { BulkOperationsToolbar } from "./components/bulk-operations-toolbar";
import { Sidebar } from "./components/sidebar";
import { Breadcrumbs } from "./components/breadcrumbs";
import { BoardsSection } from "./components/boards-section";
import { PeopleView } from "./components/people-view";
import { DoneView } from "./components/done-view";
import { ReviewView } from "./components/review-view";
import { SettingsDialog } from "./components/settings-dialog";

import { LogoMark } from "./components/logo";
import { makePersisted } from "@solid-primitives/storage";
import { DragAndDrop } from "./components/drag-and-drop";
import { useI18n } from "./i18n";
import { addTagToContent, removeTagFromContent, setDueDateInContent, getTagsFromContent, getPeopleFromContent, getReviewAtFromContent, getDoneAtFromContent, getPriorityFromContent, markContentPriority, clearPriorityFromContent, markContentForReview, markContentDone, clearReviewFromContent, restoreDoneContent } from "./card-content-utils";
import "./stylesheets/index.css";
import { KeyboardNavigationDialog } from "./components/keyboard-navigation-dialog";
import { v7 } from "uuid";
import { isPlaceholderId, visibleName } from "./placeholder-id";

const MIN_BOARD_LOADING_MS = 240;

function orderLanes(laneNames, sortKeys) {
  const keys = sortKeys || [];
  return [...laneNames].sort((a, b) => {
    const indexA = keys.indexOf(a);
    const indexB = keys.indexOf(b);
    const sortA = indexA === -1 ? Number.POSITIVE_INFINITY : indexA;
    const sortB = indexB === -1 ? Number.POSITIVE_INFINITY : indexB;
    return sortA - sortB;
  });
}

function App() {
  const [lanes, setLanes] = createSignal([]);
  const [cards, setCards] = createSignal([]);
  const [sort, setSort] = makePersisted(createSignal("none"), {
    storage: localStorage,
    name: "sort",
  });
  const [sortDirection, setSortDirection] = makePersisted(createSignal("asc"), {
    storage: localStorage,
    name: "sortDirection",
  });
  const [search, setSearch] = createSignal("");
  const [filteredTag, setFilteredTag] = makePersisted(createSignal(null), {
    storage: localStorage,
    name: "filteredTag",
  });
  const [tagsOptions, setTagsOptions] = createSignal([]);
  const [laneBeingRenamedName, setLaneBeingRenamedName] = createSignal(null);
  const [newLaneName, setNewLaneName] = createSignal(null);
  const [cardBeingRenamed, setCardBeingRenamed] = createSignal(null);
  const [newCardName, setNewCardName] = createSignal(null);
  // Resources created moments ago that still await their real name;
  // cancelling their rename deletes them so no placeholder junk is left
  const [justCreatedLane, setJustCreatedLane] = createSignal(null);
  const [justCreatedCard, setJustCreatedCard] = createSignal(null);
  // Draft card still using a disk UUID; keep the dialog open without
  // putting that id in the URL.
  const [namingCard, setNamingCard] = createSignal(null);
  const [viewMode, setViewMode] = makePersisted(createSignal("regular"), {
    storage: localStorage,
    name: "viewMode",
  });
  const [colorScheme, setColorScheme] = makePersisted(createSignal("system"), {
    storage: localStorage,
    name: "colorScheme",
  });
  const [renderUID, setRenderUID] = createSignal(v7());
  const [selectionMode, setSelectionMode] = createSignal(false);
  const [selectedCards, setSelectedCards] = createSignal(new Set());
  const [focusedCardId, setFocusedCardId] = createSignal(null);
  const [focusedLaneIndex, setFocusedLaneIndex] = createSignal(null);
  const [hasAutoFocusedFirstCard, setHasAutoFocusedFirstCard] = createSignal(false);
  const [showHelpDialog, setShowHelpDialog] = createSignal(false);
  // Whether the boards sidebar is collapsed (persisted per user)
  const [sidebarCollapsed, setSidebarCollapsed] = makePersisted(
    createSignal(false),
    { storage: localStorage, name: "sidebarCollapsed" }
  );
  // Path of a board that should immediately go into rename mode in the
  // sidebar (used right after creating a board)
  const [boardRenameTarget, setBoardRenameTarget] = createSignal(null);
  const [pendingNewBoard, setPendingNewBoard] = createSignal(null);
  // Full tree of boards, used by the sidebar and the boards section
  const [tree, setTree] = createSignal(null);
  const [loadedBoardPath, setLoadedBoardPath] = createSignal(null);
  const { t, locale } = useI18n();
  const [pathname, setPathname] = createSignal(window.location.pathname);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  // Client-side navigation without a router: the URL drives the UI through
  // this signal (history.pushState + popstate). @solidjs/router's location
  // context does not update for Apps mounted as a root without child routes.
  function navigate(to, { replace = false } = {}) {
    if (replace) {
      window.history.replaceState(null, "", to);
    } else {
      window.history.pushState(null, "", to);
    }
    setPathname(window.location.pathname);
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  function collapseSidebarOnMobile() {
    if (isMobileViewport()) {
      setSidebarCollapsed(true);
    }
  }

  let mainContainerRef;

  const basePath = createMemo(() => {
    if ((import.meta.env.BASE_URL || "").endsWith("/")) {
      return import.meta.env.BASE_URL.substring(
        0,
        import.meta.env.BASE_URL.length - 1
      );
    }
    return import.meta.env.BASE_URL || "";
  });

  const board = createMemo(() => {
    let currentPathname = pathname();
    if (currentPathname.endsWith(".md") || currentPathname.endsWith(".md/")) {
      const pathnameParts = currentPathname.split("/").filter((item) => !!item);
      pathnameParts.pop();
      const concatenatedName = pathnameParts
        .join("/")
        .substring(basePath().length, currentPathname.length);
      if (!concatenatedName) {
        return "";
      }
      return `/${concatenatedName}`;
    }
    if (currentPathname.endsWith("/")) {
      currentPathname = currentPathname.substring(0, currentPathname.length - 1);
    }
    if (basePath() !== "/") {
      currentPathname = currentPathname.substring(basePath().length, currentPathname.length);
    }
    return currentPathname;
  });

  const selectedCardName = createMemo(() => {
    let currentPathname = pathname();
    if (currentPathname.endsWith("/")) {
      currentPathname = currentPathname.substring(0, currentPathname.length - 1);
    }
    const cardName = currentPathname.endsWith(".md")
      ? currentPathname.split("/").at(-1)
      : "";
    return cardName;
  });

  const selectedCard = createMemo(() => {
    const naming = namingCard();
    if (naming) {
      return cards().find((card) => card.name === naming) ?? null;
    }
    const decodedCardName = decodeURIComponent(selectedCardName())
    const card = cards().find(
      (card) => `${card.name}.md` === decodedCardName
    );
    return card;
  });

  // Decoded version of board(), comparable with raw tree paths
  const boardPath = createMemo(() => decodeURIComponent(board()));

  // Global per-person TODO view lives at a dedicated path
  const PEOPLE_VIEW_PATH = "/_people";
  const REVIEW_VIEW_PATH = "/_review";
  const DONE_VIEW_PATH = "/_done";
  const isPeopleView = createMemo(() => boardPath() === PEOPLE_VIEW_PATH);
  const isReviewView = createMemo(() => boardPath() === REVIEW_VIEW_PATH);
  const isDoneView = createMemo(() => boardPath() === DONE_VIEW_PATH);
  const isSpecialView = createMemo(
    () => isPeopleView() || isReviewView() || isDoneView()
  );
  const [openDoneLanes, setOpenDoneLanes] = createSignal(new Set());

  function navigateToPeopleView() {
    navigate(`${basePath()}${PEOPLE_VIEW_PATH}`);
    collapseSidebarOnMobile();
  }

  function navigateToReviewView() {
    navigate(`${basePath()}${REVIEW_VIEW_PATH}`);
    collapseSidebarOnMobile();
  }

  function navigateToDoneView() {
    navigate(`${basePath()}${DONE_VIEW_PATH}`);
    collapseSidebarOnMobile();
  }

  function jumpToCardOnBoard(card) {
    setFocusedCardId(card.name);
    navigateToBoard(card.board || "");
  }

  function toggleDoneLane(lane) {
    setOpenDoneLanes((prev) => {
      const next = new Set(prev);
      if (next.has(lane)) {
        next.delete(lane);
      } else {
        next.add(lane);
      }
      return next;
    });
  }

  async function fetchTree() {
    const res = await fetch(`${api}/tree`, {
      method: "GET",
      mode: "cors",
    });
    setTree(await res.json());
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function resourceUrl(...segments) {
    const extra = segments
      .filter((segment) => segment !== undefined && segment !== null && segment !== "")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${api}/resource${board()}${extra ? `/${extra}` : ""}`;
  }

  function cardDiskPath(lane, name) {
    const rel = [board(), lane, `${name}.md`].filter(Boolean).join("/");
    return rel.startsWith("/") ? rel : `/${rel}`;
  }

  function untitledLabel() {
    return t()("common.untitled");
  }

  function publicLabel(name, emptyFallback = "") {
    const shown = visibleName(name);
    if (shown) {
      return shown;
    }
    if (!name) {
      return emptyFallback;
    }
    return untitledLabel();
  }

  function laneDisplayName(lane) {
    return publicLabel(lane, t()("laneName.boardCards"));
  }

  function insertChildNode(parentPath, child) {
    setTree((prev) => {
      const root = structuredClone(prev || []);
      if (!parentPath) {
        return [...root, child];
      }
      const insert = (nodes) => {
        for (const node of nodes) {
          if (node.path === parentPath) {
            node.children = [...(node.children || []), child];
            return true;
          }
          if (insert(node.children || [])) {
            return true;
          }
        }
        return false;
      };
      if (!insert(root)) {
        root.push(child);
      }
      return root;
    });
  }

  function parentPathOf(path) {
    const parts = (path || "").split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "";
  }

  function siblingBoardNodes(parentPath, nodes = tree() || []) {
    const children = parentPath
      ? findTreeNode(parentPath, nodes)?.children || []
      : nodes;
    return hoistBoards(children).filter(
      (child) => !isPlaceholderId(child.name)
    );
  }

  function applySiblingOrder(parentPath, orderedNames) {
    setTree((prev) => {
      const root = structuredClone(prev || []);
      const list = parentPath
        ? findTreeNode(parentPath, root)?.children
        : root;
      if (!list) {
        return prev;
      }
      const byName = new Map(list.map((node) => [node.name, node]));
      const next = [];
      for (const name of orderedNames) {
        const node = byName.get(name);
        if (node) {
          next.push(node);
          byName.delete(name);
        }
      }
      for (const node of list) {
        if (byName.has(node.name)) {
          next.push(node);
        }
      }
      if (!parentPath) {
        return next;
      }
      const parent = findTreeNode(parentPath, root);
      if (parent) {
        parent.children = next;
      }
      return root;
    });
  }

  async function persistSiblingOrder(parentPath, names) {
    const orderPath = parentPath ? `${parentPath}/.order` : "/.order";
    const content = `${names.join("\n")}\n`;
    const url = `${api}/resource${encodePath(orderPath)}`;
    const headers = { "Content-Type": "application/json" };
    const patch = await fetch(url, {
      method: "PATCH",
      mode: "cors",
      headers,
      body: JSON.stringify({ content }),
    });
    if (patch.ok) {
      return;
    }
    await fetch(url, {
      method: "POST",
      mode: "cors",
      headers,
      body: JSON.stringify({ isFile: true, content }),
    });
  }

  async function saveSiblingBoardOrder(parentPath, orderedNames) {
    applySiblingOrder(parentPath, orderedNames);
    await persistSiblingOrder(parentPath, orderedNames);
  }

  async function moveBoard(path, delta) {
    const parentPath = parentPathOf(path);
    const currentName = path.split("/").filter(Boolean).at(-1);
    const names = siblingBoardNodes(parentPath).map((node) => node.name);
    const from = names.indexOf(currentName);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= names.length) {
      return;
    }
    const next = [...names];
    next.splice(from, 1);
    next.splice(to, 0, currentName);
    await saveSiblingBoardOrder(parentPath, next);
  }

  function findTreeNode(path, nodes = tree() || []) {
    for (const node of nodes) {
      if (node.path === path) {
        return node;
      }
      const found = findTreeNode(path, node.children || []);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function isLaneTreeNode(node) {
    return !!node && node.kind === "lane";
  }

  function hoistBoards(nodes) {
    const result = [];
    for (const node of nodes || []) {
      if (node.kind === "lane") {
        result.push(...hoistBoards(node.children || []));
        continue;
      }
      result.push({
        ...node,
        children: hoistBoards(node.children || []),
      });
    }
    return result;
  }

  function navigateToBoard(path, { replace = false } = {}) {
    const targetBoard = encodePath(path);
    navigate(`${basePath()}${targetBoard || "/"}`, { replace });
    collapseSidebarOnMobile();
  }

  function handleSidebarNavigate(path, node) {
    if (isLaneTreeNode(node)) {
      const parent = parentPathOf(path);
      const laneName = path.split("/").filter(Boolean).at(-1);
      navigateToBoard(parent);
      const index = lanes().indexOf(laneName);
      if (index >= 0) {
        setFocusedLaneIndex(index);
      }
      return;
    }
    navigateToBoard(path);
  }

  function navigateToParentBoard() {
    navigateToBoard(boardPath().split("/").slice(0, -1).join("/"));
  }

  function openCardFromPeopleView(card) {
    navigate(
      `${basePath()}${encodePath(card.board)}/${encodeURIComponent(card.name)}.md`
    );
  }

  const allPeople = createMemo(() => {
    const people = new Set();
    for (const card of cards()) {
      for (const person of card.people || []) {
        people.add(person);
      }
    }
    return [...people].sort((a, b) => a.localeCompare(b));
  });

  const [siteTitle] = createResource(() =>
    fetch(`${api}/title`).then((res) => res.text())
  );

  const pageTitle = createMemo(() => {
    if (isPeopleView()) {
      return t()("people.title");
    }
    if (isReviewView()) {
      return t()("review.title");
    }
    if (isDoneView()) {
      return t()("done.title");
    }
    if (!boardPath()) {
      return siteTitle() || t()("sidebar.home");
    }
    return publicLabel(boardPath().split("/").at(-1));
  });

  const homeLabel = createMemo(() =>
    boardPath() ? t()("sidebar.home") : siteTitle() || t()("sidebar.home")
  );

  // Child boards of the current folder: real boards, plus anything that
  // used to live under a lane so the canvas and sidebar stay in sync.
  const boards = createMemo(() => {
    const path = boardPath();
    let children = tree() || [];
    if (path) {
      const node = findTreeNode(path);
      children = node?.children || [];
    }
    return hoistBoards(children).filter(
      (child) => !isPlaceholderId(child.name)
    );
  });

  const sidebarTree = createMemo(() => hoistBoards(tree() || []));

  async function discardUntitledDrafts() {
    const pending = pendingNewBoard();
    if (pending?.path) {
      setPendingNewBoard(null);
      setBoardRenameTarget(null);
      await fetch(`${api}/resource${encodePath(pending.path)}`, {
        method: "DELETE",
        mode: "cors",
      });
    }
    const lane = justCreatedLane();
    if (lane) {
      deleteLane(lane);
      setJustCreatedLane(null);
      setNewLaneName(null);
      setLaneBeingRenamedName(null);
    }
    const naming = namingCard();
    if (naming) {
      const card = cards().find((item) => item.name === naming);
      setNamingCard(null);
      setJustCreatedCard(null);
      if (card) {
        deleteCard(card);
      }
    } else if (selectedCard()) {
      navigate(`${basePath()}${board()}` || "/", { replace: true });
    }
    if (pending?.path) {
      await fetchTree();
    }
  }

  async function createBoard(parentPath) {
    await discardUntitledDrafts();
    setSidebarCollapsed(false);
    const name = v7();
    const path = `${parentPath}/${name}`;
    await fetch(`${api}/resource${encodePath(path)}`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await fetch(`${api}/resource${encodePath(`${path}/.board`)}`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFile: true, content: "" }),
    });
    const child = {
      name,
      path,
      cards: 0,
      totalCards: 0,
      kind: "board",
      children: [],
    };
    batch(() => {
      insertChildNode(parentPath, child);
      setPendingNewBoard({ path, enter: false });
      setBoardRenameTarget(path);
    });
  }

  async function createLaneAt(parentPath) {
    const current = boardPath();
    if (!parentPath || parentPath === current) {
      await createNewLane();
      return;
    }
    await discardUntitledDrafts();
    setSidebarCollapsed(false);
    const name = v7();
    const path = `${parentPath}/${name}`;
    await fetch(`${api}/resource${encodePath(path)}`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    batch(() => {
      insertChildNode(parentPath, {
        name,
        path,
        cards: 0,
        totalCards: 0,
        kind: "lane",
        children: [],
      });
      setPendingNewBoard({ path, enter: false });
      setBoardRenameTarget(path);
    });
  }

  async function renameBoard(path, newName) {
    const segments = path.split("/").filter(Boolean);
    const newPath = `/${[...segments.slice(0, -1), newName].join("/")}`;
    const parentPath = parentPathOf(path);
    const oldName = segments.at(-1);
    const orderedNames = siblingBoardNodes(parentPath).map((node) =>
      node.name === oldName ? newName : node.name
    );
    await fetch(`${api}/resource${encodePath(path)}`, {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath }),
    });
    await persistSiblingOrder(parentPath, orderedNames);
    await fetchTree();
    const pending = pendingNewBoard();
    if (pending?.path === path) {
      setPendingNewBoard(null);
      setBoardRenameTarget(null);
      if (pending.enter) {
        navigateToBoard(newPath);
      } else if (!isSpecialView()) {
        await fetchData();
      }
      return;
    }
    const current = boardPath();
    if (current === path || current.startsWith(`${path}/`)) {
      navigateToBoard(current.replace(path, newPath));
    }
  }

  async function deleteBoard(node) {
    if (pendingNewBoard()?.path === node.path) {
      setPendingNewBoard(null);
      setBoardRenameTarget(null);
    }
    const parentPath = parentPathOf(node.path);
    const orderedNames = siblingBoardNodes(parentPath)
      .map((item) => item.name)
      .filter((name) => name !== node.name);
    await fetch(`${api}/resource${encodePath(node.path)}`, {
      method: "DELETE",
      mode: "cors",
    });
    await persistSiblingOrder(parentPath, orderedNames);
    const current = boardPath();
    if (current === node.path || current.startsWith(`${node.path}/`)) {
      navigateToBoard(node.path.split("/").slice(0, -1).join("/"));
    }
    await fetchTree();
    if (!isSpecialView()) {
      await fetchData();
    }
  }

  function getTagBackgroundCssColor(tagColor) {
    const backgroundColorNumber = /[0-9]/.exec(`${tagColor || "1"}`)[0];
    const backgroundColor = `var(--color-alt-${backgroundColorNumber})`;
    return backgroundColor;
  }

  function applyBoardData(boardValue, boardData) {
    setTagsOptions(boardData.tags);
    setLanes(boardData.lanes);
    setCards(boardData.cards);
    setRenderUID(v7());
    setLoadedBoardPath(boardValue);
  }

  async function fetchData(boardValue = board(), minimumLoadingMs = 0) {
    const startedAt = performance.now();
    const resourcesReq = fetch(`${api}/resource${boardValue}`, {
      method: "GET",
      mode: "cors",
    }).then((res) => res.json());
    const tagsReq = fetch(`${api}/tags${boardValue}`, {
      method: "GET",
      mode: "cors",
    }).then((res) =>
      res.json().then((resJson) =>
        Object.entries(resJson).map((entry) => ({
          name: entry[0],
          backgroundColor: entry[1],
        }))
      )
    );
    const sortReq = fetch(`${api}/sort${boardValue}`, {
      method: "GET",
    }).then((res) => res.json());
    const [remoteTagOptions, resources, manualSort] = await Promise.all([
      tagsReq,
      resourcesReq,
      sortReq,
    ]);

    // Columns hold cards (or are empty). Folders marked as boards — or that
    // only contain other folders — are not columns of this view.
    const laneResources = resources.filter(
      (resource) =>
        !resource.isBoard &&
        (resource.files.length > 0 || !resource.hasSubDirectories)
    );

    const lanesFromApi = laneResources.map((resource) => resource.name);
    const lanesSortedKeys = Object.keys(manualSort || {});
    const newLanes = orderLanes(lanesFromApi, lanesSortedKeys);

    let newCards = laneResources.flatMap((resource) =>
      resource.files.map((file) => ({ ...file, lane: resource.name }))
    );

    const currentTags = newCards.flatMap((card) =>
      getTagsByCardContent(card.content)
    );
    const currentTagsWithoutDuplicates = currentTags.filter(
      (tag, index, arr) =>
        arr.findIndex((duplicatedTag) => {
          return duplicatedTag.toLowerCase() === tag.toLowerCase();
        }) === index
    );
    const localTagNames = currentTagsWithoutDuplicates;
    const tagsWithColors = localTagNames.map((tagName) => {
      const remoteTag = remoteTagOptions.find((tag) => tag.name === tagName);
      const tagColor =
        remoteTag?.backgroundColor ||
        getTagBackgroundCssColor(pickTagColorIndexBasedOnHash(tagName));
      return {
        name: tagName,
        backgroundColor: tagColor,
      };
    });
    newCards = newCards
      .map((card) => {
        const newCard = structuredClone(card);
        const cardTagsNames = getTagsByCardContent(newCard.content) || [];
        newCard.tags = tagsWithColors.filter((tagOption) =>
          cardTagsNames.includes(tagOption.name)
        );
        const dueDateStringMatch = newCard.content.match(/\[due:(.*?)\]/);
        newCard.dueDate = dueDateStringMatch?.length
          ? dueDateStringMatch[1]
          : "";
        newCard.people = getPeopleFromContent(newCard.content);
        newCard.reviewAt = getReviewAtFromContent(newCard.content);
        newCard.doneAt = getDoneAtFromContent(newCard.content);
        newCard.priorityAt = getPriorityFromContent(newCard.content);
        return newCard;
      })
      .toSorted((a, b) => {
        const indexOfA = manualSort[a.lane]?.indexOf(a.name) || -1;
        const indexOfB = manualSort[b.lane]?.indexOf(b.name) || -1;
        return indexOfA - indexOfB;
    });
    const boardData = { tags: tagsWithColors, lanes: newLanes, cards: newCards };
    const remainingLoadingMs = minimumLoadingMs - (performance.now() - startedAt);
    if (remainingLoadingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingLoadingMs));
    }
    if (boardValue !== board()) {
      return;
    }
    batch(() => applyBoardData(boardValue, boardData));
  }

  function pickTagColorIndexBasedOnHash(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    const tagOptionsLength = 7;
    const colorIndex = Math.abs(hash % tagOptionsLength);
    return colorIndex;
  }

  const debounceChangeCardContent = debounce(
    (newContent) => changeCardContent(newContent),
    250
  );

  function updateTagColors(mapTagToColor) {
    return fetch(`${api}/tags${board()}`, {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapTagToColor),
    });
  }

  async function changeCardContent(newContent) {
    const newCards = structuredClone(cards());
    if (!selectedCard()) {
      return;
    }
    const newCardIndex = structuredClone(
      newCards.findIndex(
        (card) =>
          card.name === selectedCard().name && card.lane === selectedCard().lane
      )
    );
    const newCard = newCards[newCardIndex];
    const remoteTagOptions = await fetch(`${api}/tags${board()}`, {
      method: "GET",
      mode: "cors",
    }).then((res) =>
      res.json().then((resJson) => {
        return Object.entries(resJson).map((entry) => ({
          name: entry[0],
          backgroundColor: entry[1],
        }));
      })
    );
    const cardTags = getTagsByCardContent(newContent);
    const cardTagsWithoutDuplicates = cardTags.filter(
      (tag, index, arr) =>
        arr.findIndex((duplicatedTag) => {
          return duplicatedTag.toLowerCase() === tag.toLowerCase();
        }) === index
    );
    const cardTagOptions = cardTagsWithoutDuplicates.map((tagName) => {
      const remoteTagOption = remoteTagOptions.find(option => option.name === tagName);
      const tagColor = remoteTagOption?.backgroundColor || getTagBackgroundCssColor(
        pickTagColorIndexBasedOnHash(tagName)
      );
      return {
        name: tagName,
        backgroundColor: tagColor,
      };
    });
    newCard.tags = cardTagOptions;
    newCard.people = getPeopleFromContent(newContent);
    await fetch(resourceUrl(newCard.lane, `${newCard.name}.md`), {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    newCard.content = newContent;
    newCard.reviewAt = getReviewAtFromContent(newContent);
    newCard.doneAt = getDoneAtFromContent(newContent);
    newCard.priorityAt = getPriorityFromContent(newContent);
    newCard.lastUpdated = new Date().toISOString();
    const dueDateStringMatch = newCard.content.match(/\[due:(.*?)\]/);
    newCard.dueDate = dueDateStringMatch?.length ? dueDateStringMatch[1] : "";
    newCards[newCardIndex] = newCard;
    setCards(newCards);
    if (newCard.doneAt) {
      setOpenDoneLanes((prev) => {
        const next = new Set(prev);
        next.add(newCard.lane);
        return next;
      });
    }
    const localTagOptions = cardTagOptions.filter((tag) => !tagsOptions().some(remoteTag => remoteTag.name === tag.name))
    const allTagOptions = [...tagsOptions(), ...localTagOptions];
    setTagsOptions(allTagOptions);
    navigate(`${basePath()}${board()}/${encodeURIComponent(newCard.name)}.md`);
  }

  // Use shared utility function for getting tags
  const getTagsByCardContent = getTagsFromContent;

  function handleSortSelectOnChange(e) {
    const value = e.target.value;
    if (value === "none") {
      setSort("none");
      return setSortDirection("asc");
    }
    const [newSort, newSortDirection] = value.split(":");
    setSort(newSort);
    setSortDirection(newSortDirection);
  }

  function handleFilterSelectOnChange(e) {
    const value = e.target.value;
    if (value === "none") {
      return setFilteredTag(null);
    }
    setFilteredTag(value);
  }

  async function createNewCard(lane) {
    await discardUntitledDrafts();
    const newCardName = v7();
    await fetch(resourceUrl(lane, `${newCardName}.md`), {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFile: true }),
    });
    const now = new Date().toISOString();
    const newCard = {
      lane,
      name: newCardName,
      content: "",
      lastUpdated: now,
      createdAt: now,
      tags: [],
      people: [],
    };
    batch(() => {
      setCards([newCard, ...cards()]);
      setJustCreatedCard(newCardName);
      setNamingCard(newCardName);
    });
  }

  function deleteCard(card) {
    const newCards = structuredClone(cards());
    fetch(resourceUrl(card.lane, `${card.name}.md`), {
      method: "DELETE",
      mode: "cors",
    });
    const cardsWithoutDeletedCard = newCards.filter(
      (cardToFind) => cardToFind.name !== card.name
    );
    setCards(cardsWithoutDeletedCard);
  }

  function moveCardToLane(card, newLane) {
    // Move card to a different lane (used for keyboard shortcuts) by reusing
    // the existing handleCardsSortChange logic used by drag-and-drop. The
    // drop index counts open cards only, matching what the board displays.
    const targetLaneCards = cards().filter(
      (c) => c.lane === newLane && !c.doneAt
    );
    const targetIndex = targetLaneCards.length;

    handleCardsSortChange({
      id: `card-${card.name}`,
      from: `lane-content-${card.lane}`,
      to: `lane-content-${newLane}`,
      index: targetIndex,
    });

    // Keep focus on the moved card
    setTimeout(() => {
      document.getElementById(`card-${card.name}`)?.focus();
    }, 50);
  }

  function moveCardInLane(card, direction) {
    // Move card up or down within its current lane by delegating to
    // handleCardsSortChange so that ordering logic is centralized. Index is
    // computed over open cards only, matching what the board displays.
    const laneCards = cards().filter(
      (c) => c.lane === card.lane && !c.doneAt
    );
    const currentIndex = laneCards.findIndex((c) => c.name === card.name);

    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= laneCards.length) return;

    handleCardsSortChange({
      id: `card-${card.name}`,
      from: `lane-content-${card.lane}`,
      to: `lane-content-${card.lane}`,
      index: newIndex,
    });

    // Keep focus on the moved card
    setTimeout(() => {
      document.getElementById(`card-${card.name}`)?.focus();
    }, 50);
  }

  async function createNewLane() {
    if (isSpecialView()) {
      return;
    }
    await discardUntitledDrafts();
    const newName = v7();
    await fetch(`${api}/resource${board()}/${encodeURIComponent(newName)}`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
    });
    batch(() => {
      setLanes([...lanes(), newName]);
      setNewLaneName("");
      setLaneBeingRenamedName(newName);
      setJustCreatedLane(newName);
    });
  }

  function renameLane() {
    const fromName = laneBeingRenamedName();
    const trimmed = (newLaneName() || "").trim();
    if (!fromName || !trimmed || isPlaceholderId(trimmed)) {
      return;
    }
    fetch(`${api}/resource${board()}/${encodeURIComponent(fromName)}`, {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: `${board()}/${trimmed}` }),
    });
    const newLanes = structuredClone(lanes());
    const newLaneIndex = newLanes.indexOf(fromName);
    const newCards = structuredClone(cards()).map((card) => ({
      ...card,
      lane: card.lane === fromName ? trimmed : card.lane,
    }));
    setCards(newCards);
    newLanes[newLaneIndex] = trimmed;
    setLanes(newLanes);
    setNewLaneName(null);
    setLaneBeingRenamedName(null);
    setJustCreatedLane(null);
    fetchTree();
  }

  function deleteLane(lane) {
    fetch(`${api}/resource${board()}/${encodeURIComponent(lane)}`, {
      method: "DELETE",
      mode: "cors",
    });
    const newLanes = structuredClone(lanes());
    const lanesWithoutDeletedCard = newLanes.filter(
      (laneToFind) => laneToFind !== lane
    );
    setLanes(lanesWithoutDeletedCard);
    const newCards = cards().filter((card) => card.lane !== lane);
    setCards(newCards);
    fetchTree();
  }

  function sortCardsByName() {
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) =>
      sortDirection() === "asc"
        ? a.name?.localeCompare(b.name)
        : b.name?.localeCompare(a.name)
    );
  }

  function sortCardsByTags() {
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) => {
      const tagNameA = a.tags?.[0]?.name || '';
      const tagNameB = b.tags?.[0]?.name || '';
      return sortDirection() === "asc"
        ? tagNameA.localeCompare(tagNameB)
        : tagNameB.localeCompare(tagNameA);
    });
  }

  function sortCardsByDue() {
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) => {
      return sortDirection() === "asc"
        ? (a.dueDate || "z").localeCompare(b.dueDate || "z")
        : (b.dueDate || "").localeCompare(a.dueDate || "");
    });
  }

  function sortCardsByLastUpdated() {
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) => {
      return (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    });
  }

  function sortCardsByCreatedFirst() {
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) => {
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }

  function sortCardsByPriority() {
    // Priority-marked cards float to the top of their lane. Unmarked cards
    // keep their incoming (manual) order at the bottom.
    const newCards = structuredClone(cards());
    return newCards.sort((a, b) => {
      const priorityA = a.priorityAt || "";
      const priorityB = b.priorityAt || "";
      if (priorityA && priorityB) {
        return sortDirection() === "asc"
          ? priorityA.localeCompare(priorityB)
          : priorityB.localeCompare(priorityA);
      }
      if (priorityA) {
        return -1;
      }
      if (priorityB) {
        return 1;
      }
      return 0;
    });
  }

  function handleOnSelectedCardNameChange(newName) {
    renameCard(selectedCard().name, newName);
    setNamingCard(null);
    navigate(`${basePath()}${board()}/${encodeURIComponent(newName)}.md`);
  }

  // Bulk operations functions
  function toggleCardSelection(cardKey, isSelected) {
    const newSelected = new Set(selectedCards());
    if (isSelected) {
      newSelected.add(cardKey);
    } else {
      newSelected.delete(cardKey);
    }
    setSelectedCards(newSelected);
  }

  function clearSelection() {
    setSelectedCards(new Set());
  }

  function getCardKey(card) {
    return `${card.lane}/${card.name}`;
  }

  // Get tags that exist on selected cards (for remove tags dropdown)
  const tagsOnSelectedCards = createMemo(() => {
    const selectedCardsList = cards().filter((card) =>
      selectedCards().has(getCardKey(card))
    );

    const allTagsOnSelected = new Set();
    selectedCardsList.forEach((card) => {
      const cardTags = getTagsFromContent(card.content || "");
      cardTags.forEach((tag) => {
        allTagsOnSelected.add(tag);
      });
    });

    return Array.from(allTagsOnSelected);
  });

  async function bulkDeleteCards() {
    const cardsToDelete = cards().filter((card) =>
      selectedCards().has(getCardKey(card))
    );

    // Delete all selected cards using existing API
    const deletePromises = cardsToDelete.map((card) =>
      fetch(resourceUrl(card.lane, `${card.name}.md`), {
        method: "DELETE",
        mode: "cors",
      })
    );

    await Promise.all(deletePromises);

    // Update local state
    const remainingCards = cards().filter(
      (card) => !selectedCards().has(getCardKey(card))
    );
    setCards(remainingCards);
    clearSelection(); // Clear after delete since cards are gone
  }

  async function bulkAddTags(tagName) {
    const cardsToUpdate = cards().filter((card) =>
      selectedCards().has(getCardKey(card))
    );

    // Add tag to each selected card using shared utility function
    const updatePromises = cardsToUpdate.map(async (card) => {
      const content = card.content || "";
      const currentTags = getTagsFromContent(content);

      // Skip if card already has this tag
      if (currentTags.some((t) => t.toLowerCase() === tagName.toLowerCase())) {
        return;
      }

      const newContent = addTagToContent(content, tagName);

      return fetch(resourceUrl(card.lane, `${card.name}.md`), {
        method: "PATCH",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
    });

    await Promise.all(updatePromises);
    await fetchData();
    // Keep selection to allow chaining operations
  }

  async function bulkRemoveTags(tagName) {
    const cardsToUpdate = cards().filter((card) =>
      selectedCards().has(getCardKey(card))
    );

    // Remove tag from each selected card using shared utility function
    const updatePromises = cardsToUpdate.map(async (card) => {
      const content = card.content || "";
      const currentTags = getTagsFromContent(content);

      // Skip if card doesn't have this tag
      if (!currentTags.some((t) => t.toLowerCase() === tagName.toLowerCase())) {
        return;
      }

      const newContent = removeTagFromContent(content, tagName);

      return fetch(resourceUrl(card.lane, `${card.name}.md`), {
        method: "PATCH",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
    });

    await Promise.all(updatePromises);
    await fetchData();
    // Keep selection to allow chaining operations
  }

  async function bulkSetDueDate(dueDate) {
    const cardsToUpdate = cards().filter((card) =>
      selectedCards().has(getCardKey(card))
    );

    // Set due date for each selected card using shared utility function
    const updatePromises = cardsToUpdate.map(async (card) => {
      const content = card.content || "";
      const newContent = setDueDateInContent(content, dueDate);

      return fetch(resourceUrl(card.lane, `${card.name}.md`), {
        method: "PATCH",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
    });

    await Promise.all(updatePromises);
    await fetchData();
    // Keep selection to allow chaining operations
  }

  function renameCard(oldName, newName) {
    const newCards = structuredClone(cards());
    const newCardIndex = newCards.findIndex((card) => card.name === oldName);
    const newCard = newCards[newCardIndex];
    const newCardNameWithoutSpaces = newName.trim();
    fetch(resourceUrl(newCard.lane, `${newCard.name}.md`), {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPath: cardDiskPath(newCard.lane, newCardNameWithoutSpaces),
      }),
    });
    newCard.name = newCardNameWithoutSpaces;
    newCards[newCardIndex] = newCard;
    setCards(newCards);
    setCardBeingRenamed(null);
    setJustCreatedCard(null);
    if (namingCard() === oldName) {
      setNamingCard(null);
    }
    // Restore focus to the renamed card
    setTimeout(() => {
      setFocusedCardId(newCardNameWithoutSpaces);
      document.getElementById(`card-${newCardNameWithoutSpaces}`)?.focus();
    }, 50);
  }

  async function updateTagColorFromExpandedCard(tagColor) {
    const allTagsColors = Object.fromEntries(
      tagsOptions().map((tag) => [tag.name, tag.backgroundColor])
    );
    const newTagColors = {
      ...allTagsColors,
      ...tagColor,
    };
    await updateTagColors(newTagColors);
    await fetchData();
    const newCardIndex = structuredClone(
      cards().findIndex(
        (card) =>
          card.name === selectedCard().name && card.lane === selectedCard().lane
      )
    );
    navigate(`${basePath()}${board()}/${encodeURIComponent(cards()[newCardIndex].name)}.md`);
  }

  function validateName(newName, namesList) {
    if (newName === null) {
      return null;
    }
    if (newName === "") {
      return t()('validation.mustHaveName');
    }
    if (newName.startsWith(".")) {
      return t()('validation.hiddenByDot');
    }
    if (namesList.filter((name) => name === (newName || "").trim()).length) {
      return t()('validation.duplicateName');
    }
    if (/[<>:%"/\\|?*]/g.test(newName)) {
      return t()('validation.forbiddenChars');
    }
    if (newName.endsWith(".md")) {
      return t()('validation.noMdExtension');
    }
    if (
      newName === "_api" ||
      newName === "_people" ||
      newName === "_review" ||
      newName === "_done"
    ) {
      return t()('validation.prohibitedName');
    }
    return null;
  }

  function startRenamingLane(lane) {
    setNewLaneName(lane);
    setLaneBeingRenamedName(lane);
  }

  const sortedCards = createMemo(() => {
    if (sort() === "none") {
      return cards();
    }
    if (sort() === "name") {
      return sortCardsByName();
    }
    if (sort() === "tags") {
      return sortCardsByTags();
    }
    if (sort() === "due") {
      return sortCardsByDue();
    }
    if (sort() === "lastUpdated") {
      return sortCardsByLastUpdated();
    }
    if (sort() === "createdFirst") {
      return sortCardsByCreatedFirst();
    }
    if (sort() === "priority") {
      return sortCardsByPriority();
    }
    return cards();
  });

  const filteredCards = createMemo(() =>
    sortedCards()
      .filter(
        (card) =>
          card.name.toLowerCase().includes(search().toLowerCase()) ||
          (card.content || "").toLowerCase().includes(search().toLowerCase())
      )
      .filter(
        (card) =>
          filteredTag() === null ||
          card.tags
            ?.map((tag) => tag.name?.toLowerCase())
            .includes(filteredTag().toLowerCase())
      )
  );

  function getCardsFromLane(lane) {
    const naming = namingCard();
    return filteredCards().filter(
      (card) =>
        card.lane === lane &&
        !card.doneAt &&
        card.name !== naming
    );
  }

  function getDoneCardsFromLane(lane) {
    return filteredCards().filter((card) => card.lane === lane && card.doneAt);
  }

  async function patchCardContent(card, newContent) {
    await fetch(resourceUrl(card.lane, `${card.name}.md`), {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    // Completed cards stay in their lane (bottom, greyed out) until the user
    // moves or restores them; nothing is sent back to a "home" lane.
    setCards(
      cards().map((item) =>
        item.name === card.name && item.lane === card.lane
          ? {
              ...item,
              content: newContent,
              people: getPeopleFromContent(newContent),
              reviewAt: getReviewAtFromContent(newContent),
              doneAt: getDoneAtFromContent(newContent),
              priorityAt: getPriorityFromContent(newContent),
            }
          : item
      )
    );
    if (getDoneAtFromContent(newContent)) {
      setOpenDoneLanes((prev) => {
        const next = new Set(prev);
        next.add(card.lane);
        return next;
      });
    }
  }

  function startRenamingCard(card) {
    setNewCardName(card.name);
    setCardBeingRenamed(card);
  }

  onMount(() => {
    const url = window.location.href;
    if (!url.match(/\/$/)) {
      window.location.replace(`${url}/`);
    }
    if (isMobileViewport()) {
      setSidebarCollapsed(true);
    }
    // The app manages its own scroll containers; let pushState navigation
    // stay put instead of the browser restoring stale scroll offsets.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    onCleanup(() => window.removeEventListener("popstate", onPopState));
  });

  function resetBoardScroll() {
    document.querySelector(".lanes")?.scrollTo?.(0, 0);
    document.querySelector(".app-shell__main")?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  // Load the board data whenever the current board changes (sidebar
  // navigation happens client-side, without remounting). The boards tree
  // is global, so it is always fetched; the people view loads its own data.
  createEffect(() => {
    const currentBoard = board();
    fetchTree();
    if (isSpecialView()) {
      return;
    }
    if (loadedBoardPath() === currentBoard) {
      return;
    }
    // Entering a board resets board-local state so the previous board's
    // cards, scroll position or focus never flash for a frame (the
    // "jump" when moving between parent and child boards).
    batch(() => {
      setLanes([]);
      setCards([]);
      setOpenDoneLanes(new Set());
      setFocusedCardId(null);
      setFocusedLaneIndex(null);
    });
    queueMicrotask(resetBoardScroll);
    fetchData(currentBoard, MIN_BOARD_LOADING_MS);
  });

  createEffect(() => {
    if (isSpecialView()) {
      return;
    }
    const path = boardPath();
    if (!path || !tree()) {
      return;
    }
    const node = findTreeNode(path);
    if (isLaneTreeNode(node)) {
      navigateToBoard(parentPathOf(path), { replace: true });
    }
  });

  createEffect(() => {
    if (pageTitle()) {
      document.title = pageTitle();
    }
  });

  createEffect(() => {
    if (!lanes().length) {
      return;
    }
    if (selectedCard()) {
      return;
    }
    const newSortJson = Object.fromEntries(lanes().map((curr) => {
      const laneCardNames = cards()
        .filter((card) => card.lane === curr)
        .map((card) => card.name);
      return [curr, laneCardNames];
    }));
    fetch(`${api}/sort${board()}`, {
      method: "PUT",
      body: JSON.stringify(newSortJson),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (disableCardsDrag()) {
      return;
    }
  });

  function handleLanesSortChange(changedLane) {
    const lane = lanes().find(
      (lane) => lane === changedLane.id.slice("lane-".length)
    );
    if (!lane) {
      return;
    }
    const newLanes = JSON.parse(JSON.stringify(lanes())).filter(
      (newLane) => newLane !== lane
    );
    const nextIndex = changedLane.index;
    const updatedLanes = [
      ...newLanes.slice(0, nextIndex),
      lane,
      ...newLanes.slice(nextIndex),
    ];
    setLanes(updatedLanes);

    // If a lane was focused, keep focus on the moved lane by index
    const newIndex = updatedLanes.indexOf(lane);
    if (newIndex !== -1) {
      setFocusedLaneIndex(newIndex);
      setTimeout(() => {
        document.getElementById(`lane-${lane}`)?.focus();
      }, 50);
    }
  }

  function handleCardsSortChange(changedCard) {
    const cardName = changedCard.id.slice("card-".length);
    const oldLane = changedCard.from.slice("lane-content-".length);
    const oldIndex = cards().findIndex(
      (card) => card.name === cardName && card.lane === oldLane
    );
    const card = cards()[oldIndex];
    if (!card) {
      return;
    }
    const newCardLane = changedCard.to.slice("lane-content-".length);
    fetch(resourceUrl(oldLane, `${cardName}.md`), {
      method: "PATCH",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPath: cardDiskPath(newCardLane, cardName),
      }),
    });
    card.lane = newCardLane;
    // Rebuild each lane so the drop index (computed over open cards only)
    // matches the array order: active cards first, done cards at the end.
    // Keeping done cards mixed in between shifted the index and made drags
    // appear to snap back to their previous position.
    const newCards = lanes().flatMap((lane) => {
      const activeCards = cards().filter(
        (c) => c.lane === lane && !c.doneAt && c.name !== cardName
      );
      const doneCards = cards().filter((c) => c.lane === lane && c.doneAt);
      let ordered = activeCards;
      if (lane === newCardLane) {
        ordered = [
          ...activeCards.slice(0, changedCard.index),
          card,
          ...activeCards.slice(changedCard.index),
        ];
      }
      return [...ordered, ...doneCards];
    });
    setCards(newCards);

    // Keep focus on the moved card so keyboard navigation works after
    // drag-and-drop and keyboard-based moves.
    setFocusedCardId(cardName);
    setTimeout(() => {
      document.getElementById(`card-${cardName}`)?.focus();
    }, 50);
  }

  const disableCardsDrag = createMemo(() => sort() !== "none" || selectionMode());

  createEffect((prev) => {
    document.body.classList.remove(`view-mode-${prev}`);
    document.body.classList.add(`view-mode-${viewMode()}`);
    return viewMode();
  });

  createEffect(() => {
    const scheme = colorScheme();
    const root = document.documentElement;
    if (scheme === "light" || scheme === "dark") {
      root.setAttribute("data-theme", scheme);
    } else {
      root.removeAttribute("data-theme");
    }
    document.body.classList.remove("theme-system", "theme-light", "theme-dark");
    document.body.classList.add(`theme-${scheme || "system"}`);
  });

  // Clear selection when exiting selection mode
  createEffect(() => {
    if (!selectionMode()) {
      setSelectedCards(new Set());
    }
  });

  // Auto-focus first card once on initial load for keyboard navigation
  createEffect(() => {
    if (hasAutoFocusedFirstCard()) {
      return;
    }
    // Only auto-focus if no card is currently focused and we have cards
    if (!focusedCardId() && !selectedCard() && lanes().length > 0) {
      setTimeout(() => {
        // Find the first card in the first lane
        const firstLane = lanes()[0];
        const firstLaneCards = getCardsFromLane(firstLane);
        if (firstLaneCards.length > 0) {
          const firstCard = firstLaneCards[0];
          setFocusedCardId(firstCard.name);
          document.getElementById(`card-${firstCard.name}`)?.focus();
          setHasAutoFocusedFirstCard(true);
        }
      }, 100);
    }
  });

  createEffect(() => {
    let focusedElement;
    if (focusedCardId()) {
      focusedElement = document.getElementById(`card-${focusedCardId()}`)?.focus();
    }
    if (focusedLaneIndex()) {
      const laneName = lanes()[focusedLaneIndex()];
      focusedElement = document.getElementById(`lane-${laneName}`)?.focus();
    }
    if (focusedElement) {
      focusedElement.scrollIntoView()
    }
  })

  function handleMainBoardKeyDown(e) {
    // Don't interfere with input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Don't interfere when a card is expanded
    if (selectedCard()) {
      return;
    }

    const visibleCards = filteredCards();

    // Allow certain keys to work even when there are no cards
    const allowedKeysWithoutCards = ['n', '?', 'Escape'];
    if (!visibleCards.length && !allowedKeysWithoutCards.includes(e.key)) {
      return;
    }

    switch(e.key) {
      case 'ArrowDown':
      case 'j': // vim-style navigation
        e.preventDefault();
        if (focusedCardId()) {
          // Find the actual focused card and get cards in the same lane
          const currentCard = cards().find(c => c.name === focusedCardId());
          if (currentCard) {
            // Alt+Down: Move card down in the lane
            if (e.altKey) {
              moveCardInLane(currentCard, 'down');
            } else {
              // Normal Down: Navigate to next card in lane
              const currentLaneCards = getCardsFromLane(currentCard.lane);
              const currentIndexInLane = currentLaneCards.findIndex(c => c.name === focusedCardId());
              if (currentIndexInLane < currentLaneCards.length - 1) {
                const nextCard = currentLaneCards[currentIndexInLane + 1];
                setFocusedCardId(nextCard.name);
                document.getElementById(`card-${nextCard.name}`)?.focus();
              }
            }
          }
        } else if (focusedLaneIndex() !== null) {
          // From a focused lane, move Down to the first card in that lane
          const laneName = lanes()[focusedLaneIndex()];
          const laneCards = getCardsFromLane(laneName);
          if (laneCards.length > 0) {
            const firstCard = laneCards[0];
            setFocusedCardId(firstCard.name);
            setFocusedLaneIndex(null);
            document.getElementById(`card-${firstCard.name}`)?.focus();
          }
        } else if (visibleCards.length > 0) {
          // If nothing focused, focus first card
          const firstCard = visibleCards[0];
          setFocusedCardId(firstCard.name);
          document.getElementById(`card-${firstCard.name}`)?.focus();
        }
        break;

      case 'ArrowUp':
      case 'k': // vim-style navigation
        e.preventDefault();
        if (focusedCardId()) {
          // Find the actual focused card and get cards in the same lane
          const currentCard = cards().find(c => c.name === focusedCardId());
          if (currentCard) {
            // Alt+Up: Move card up in the lane
            if (e.altKey) {
              moveCardInLane(currentCard, 'up');
            } else {
              // Normal Up: Navigate to previous card in lane
              const currentLaneCards = getCardsFromLane(currentCard.lane);
              const currentIndexInLane = currentLaneCards.findIndex(c => c.name === focusedCardId());
              if (currentIndexInLane > 0) {
                const prevCard = currentLaneCards[currentIndexInLane - 1];
                setFocusedCardId(prevCard.name);
                document.getElementById(`card-${prevCard.name}`)?.focus();
              } else if (currentIndexInLane === 0) {
                // From the first card in a lane, move focus to the lane itself
                const laneIndex = lanes().indexOf(currentCard.lane);
                if (laneIndex !== -1) {
                  setFocusedCardId(null);
                  setFocusedLaneIndex(laneIndex);
                  setTimeout(() => {
                    document.getElementById(`lane-${currentCard.lane}`)?.focus();
                  }, 0);
                }
              }
            }
          }
        } else if (visibleCards.length > 0) {
          // If nothing focused, focus first card
          const firstCard = visibleCards[0];
          setFocusedCardId(firstCard.name);
          document.getElementById(`card-${firstCard.name}`)?.focus();
        }
        break;

      case 'ArrowRight':
      case 'l': // vim-style navigation
        e.preventDefault();
        if (focusedCardId()) {
          // Find the actual focused card from all cards, not just visible filtered ones
          const currentCard = cards().find(c => c.name === focusedCardId());
          if (currentCard) {
            const currentLaneIndex = lanes().indexOf(currentCard.lane);

            // Alt+Right: Move card to next lane (if exists)
            if (e.altKey) {
              if (currentLaneIndex < lanes().length - 1) {
                const nextLane = lanes()[currentLaneIndex + 1];
                moveCardToLane(currentCard, nextLane);
              }
            } else {
              // Normal Right: Navigate to first card in next non-empty lane
              for (let i = currentLaneIndex + 1; i < lanes().length; i++) {
                const nextLaneCards = getCardsFromLane(lanes()[i]);
                if (nextLaneCards.length > 0) {
                  setFocusedCardId(nextLaneCards[0].name);
                  document.getElementById(`card-${nextLaneCards[0].name}`)?.focus();
                  break;
                }
              }
            }
          }
        } else if (focusedLaneIndex() !== null) {
          const currentLaneIdx = focusedLaneIndex();
          if (e.altKey) {
            // Alt+Right: move the lane itself one position to the right
            if (currentLaneIdx < lanes().length - 1) {
              const laneName = lanes()[currentLaneIdx];
              handleLanesSortChange({
                id: `lane-${laneName}`,
                index: currentLaneIdx + 1,
              });
            }
          } else {
            // Normal Right: move lane focus to the next lane
            if (currentLaneIdx < lanes().length - 1) {
              const nextLaneName = lanes()[currentLaneIdx + 1];
              setFocusedLaneIndex(currentLaneIdx + 1);
              setFocusedCardId(null);
              setTimeout(() => {
                document.getElementById(`lane-${nextLaneName}`)?.focus();
              }, 0);
            }
          }
        } else if (visibleCards.length > 0) {
          // If nothing focused, focus first card
          const firstCard = visibleCards[0];
          setFocusedCardId(firstCard.name);
          document.getElementById(`card-${firstCard.name}`)?.focus();
        }
        break;

      case 'ArrowLeft':
      case 'h': // vim-style navigation
        e.preventDefault();
        if (focusedCardId()) {
          // Find the actual focused card from all cards, not just visible filtered ones
          const currentCard = cards().find(c => c.name === focusedCardId());
          if (currentCard) {
            const currentLaneIndex = lanes().indexOf(currentCard.lane);

            // Alt+Left: Move card to previous lane (if exists)
            if (e.altKey) {
              if (currentLaneIndex > 0) {
                const prevLane = lanes()[currentLaneIndex - 1];
                moveCardToLane(currentCard, prevLane);
              }
            } else {
              // Normal Left: Navigate to first card in previous non-empty lane
              for (let i = currentLaneIndex - 1; i >= 0; i--) {
                const prevLaneCards = getCardsFromLane(lanes()[i]);
                if (prevLaneCards.length > 0) {
                  setFocusedCardId(prevLaneCards[0].name);
                  document.getElementById(`card-${prevLaneCards[0].name}`)?.focus();
                  break;
                }
              }
            }
          }
        } else if (focusedLaneIndex() !== null) {
          const currentLaneIdx = focusedLaneIndex();
          if (e.altKey) {
            // Alt+Left: move the lane itself one position to the left
            if (currentLaneIdx > 0) {
              const laneName = lanes()[currentLaneIdx];
              handleLanesSortChange({
                id: `lane-${laneName}`,
                index: currentLaneIdx - 1,
              });
            }
          } else {
            // Normal Left: move lane focus to the previous lane
            if (currentLaneIdx > 0) {
              const prevLaneName = lanes()[currentLaneIdx - 1];
              setFocusedLaneIndex(currentLaneIdx - 1);
              setFocusedCardId(null);
              setTimeout(() => {
                document.getElementById(`lane-${prevLaneName}`)?.focus();
              }, 0);
            }
          }
        } else if (visibleCards.length > 0) {
          // If nothing focused, focus first card
          const firstCard = visibleCards[0];
          setFocusedCardId(firstCard.name);
          document.getElementById(`card-${firstCard.name}`)?.focus();
        }
        break;

      case 'Enter':
      case 'e': // Edit card
        e.preventDefault();
        if (focusedCardId()) {
          const card = cards().find(c => c.name === focusedCardId());
          if (card) {
            navigate(`${basePath()}${board()}/${card.name}.md`);
          }
        }
        break;

      case 'b': // Toggle boards sidebar
        e.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed());
        break;
      case 'u': // Go to parent board
        e.preventDefault();
        if (boardPath()) {
          navigateToParentBoard();
        }
        break;

      case 'n': // New card
        e.preventDefault();
        if (lanes().length > 0) {
          const currentCard = focusedCardId()
            ? cards().find(c => c.name === focusedCardId())
            : null;
          const targetLane = currentCard ? currentCard.lane : lanes()[0];
          createNewCard(targetLane);
        }
        break;

      case 'r': // Rename card
        e.preventDefault();
        if (focusedCardId()) {
          const card = cards().find(c => c.name === focusedCardId());
          if (card) {
            startRenamingCard(card);
          }
        }
        break;

      case 'p': { // Toggle priority TODO on the focused card
        e.preventDefault();
        if (focusedCardId()) {
          const card = cards().find(c => c.name === focusedCardId());
          if (card && !card.doneAt) {
            patchCardContent(
              card,
              card.priorityAt
                ? clearPriorityFromContent(card.content)
                : markContentPriority(card.content)
            );
            // The card list re-renders with fresh objects, which recreates
            // the card element and drops focus — restore it so repeated
            // presses keep working.
            setTimeout(() => {
              setFocusedCardId(card.name);
              document.getElementById(`card-${card.name}`)?.focus();
            }, 60);
          }
        }
        break;
      }

      case 'd': // Delete card (with confirmation)
        e.preventDefault();
        if (focusedCardId()) {
          const card = cards().find(c => c.name === focusedCardId());
          if (card && confirm(`Delete card "${publicLabel(card.name)}"?`)) {
            // Find cards in the same lane for next focus
            const currentLaneCards = getCardsFromLane(card.lane);
            const currentIndexInLane = currentLaneCards.findIndex(c => c.name === focusedCardId());

            deleteCard(card);

            // Wait for the DOM to update, then focus next or previous card in the same lane
            setTimeout(() => {
              if (currentIndexInLane < currentLaneCards.length - 1) {
                const nextCard = currentLaneCards[currentIndexInLane + 1];
                setFocusedCardId(nextCard.name);
                document.getElementById(`card-${nextCard.name}`)?.focus();
              } else if (currentIndexInLane > 0) {
                const prevCard = currentLaneCards[currentIndexInLane - 1];
                setFocusedCardId(prevCard.name);
                document.getElementById(`card-${prevCard.name}`)?.focus();
              } else {
                setFocusedCardId(null);
              }
            }, 50);
          }
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (showHelpDialog()) {
          setShowHelpDialog(false);
        } else if (settingsOpen()) {
          setSettingsOpen(false);
        } else if (!sidebarCollapsed() && isMobileViewport()) {
          setSidebarCollapsed(true);
        } else {
          setFocusedCardId(null);
          setFocusedLaneIndex(null);
          mainContainerRef?.focus();
        }
        break;

      case '?': // Help
        e.preventDefault();
        setShowHelpDialog(true);
        break;
    }
  }

  return (
    // biome-ignore lint/a11y: The focusable app shell owns board-wide keyboard shortcuts.
    <div
      ref={(el) => mainContainerRef = el}
      tabIndex="-1"
      onKeyDown={handleMainBoardKeyDown}
      class="app"
    >
      <Header
        search={search()}
        onSearchChange={setSearch}
        sort={sort() === "none" ? "none" : `${sort()}:${sortDirection()}`}
        onSortChange={handleSortSelectOnChange}
        tagOptions={tagsOptions().map((option) => option.name)}
        filteredTag={filteredTag()}
        onTagChange={handleFilterSelectOnChange}
        onNewLaneBtnClick={createNewLane}
        hideBoardControls={isSpecialView()}
        peopleActive={isPeopleView()}
        onNavigatePeople={navigateToPeopleView}
        reviewActive={isReviewView()}
        onNavigateReview={navigateToReviewView}
        doneActive={isDoneView()}
        onNavigateDone={navigateToDoneView}
        sidebarCollapsed={sidebarCollapsed()}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed())}
        selectionMode={selectionMode()}
        onSelectionModeChange={setSelectionMode}
        onOpenSettings={() => setSettingsOpen(true)}
        t={t}
      />
      <Show when={selectionMode()}>
        <BulkOperationsToolbar
          selectedCount={selectedCards().size}
          onDelete={bulkDeleteCards}
          onAddTags={bulkAddTags}
          onRemoveTags={bulkRemoveTags}
          onSetDueDate={bulkSetDueDate}
          onClearSelection={clearSelection}
          tagsOptions={tagsOptions().map((option) => option.name)}
          tagsOnSelectedCards={tagsOnSelectedCards()}
          t={t}
        />
      </Show>
      <div class="app-shell">
        <Show when={!sidebarCollapsed()}>
          <button
            type="button"
            class="sidebar-backdrop"
            aria-label={t()("header.hideSidebar")}
            onClick={() => setSidebarCollapsed(true)}
          />
        </Show>
        <Sidebar
          tree={sidebarTree()}
          currentPath={boardPath()}
          collapsed={sidebarCollapsed()}
          onNavigate={handleSidebarNavigate}
          onCreateBoard={createBoard}
          onCreateLane={createLaneAt}
          onRenameBoard={renameBoard}
          onDeleteBoard={deleteBoard}
          onMoveBoard={moveBoard}
          renameTarget={boardRenameTarget()}
          t={t}
        />
        <div class="app-shell__main">
          <Breadcrumbs
            currentPath={boardPath()}
            basePath={basePath()}
            homeLabel={homeLabel()}
            untitledLabel={t()("common.untitled")}
            onNavigate={navigateToBoard}
            peopleActive={isPeopleView()}
            peopleLabel={t()("people.title")}
            reviewActive={isReviewView()}
            reviewLabel={t()("review.title")}
            doneActive={isDoneView()}
            doneLabel={t()("done.title")}
          />
          <Show when={isPeopleView()}>
            <PeopleView
              onOpenCard={openCardFromPeopleView}
              t={t}
              locale={locale()}
            />
          </Show>
          <Show when={isReviewView()}>
            <ReviewView
              onJump={jumpToCardOnBoard}
              t={t}
              locale={locale()}
            />
          </Show>
          <Show when={isDoneView()}>
            <DoneView
              onJump={jumpToCardOnBoard}
              onRestore={async (card) => {
                await fetch(
                  `${api}/resource${card.board || ""}/${encodeURIComponent(card.lane)}/${encodeURIComponent(card.name)}.md`,
                  {
                    method: "PATCH",
                    mode: "cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      content: restoreDoneContent(card.content),
                    }),
                  }
                );
              }}
              t={t}
              locale={locale()}
            />
          </Show>
          <Show when={!isSpecialView()}>
          <Show
            when={loadedBoardPath() === board()}
            fallback={
              <div class="board-loading-state" aria-busy="true">
                <span class="board-loading-spinner" aria-hidden="true" />
              </div>
            }
          >
          <Show when={boards().length}>
            <BoardsSection
              boards={boards()}
              onOpen={navigateToBoard}
              onCreate={() => createBoard(boardPath())}
              t={t}
            />
          </Show>
          <Show when={!lanes().length && !boards().length}>
            <div class="board-empty-state">
              <LogoMark size={40} class="board-empty-state__logo" />
              <h2>{t()('boardEmpty.title')}</h2>
              <p>{t()('boardEmpty.description')}</p>
              <div class="board-empty-state__actions">
                <button type="button" onClick={createNewLane}>
                  {t()('boardEmpty.newLane')}
                </button>
              </div>
            </div>
          </Show>
            <Show when={lanes().length}>
              <DragAndDrop.Provider>
                <DragAndDrop.Container class={`lanes`} onChange={handleLanesSortChange}>
          <For each={lanes()}>
            {(lane, index) => (
              // biome-ignore lint/a11y: Each lane is a focus target for board keyboard navigation.
              <div
                class="lane"
                id={`lane-${lane}`}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Lanes are focus stops for board keyboard navigation.
                tabIndex={0}
                onFocus={() => {
                  setFocusedLaneIndex(index());
                  setFocusedCardId(null);
                }}
              >
                <header class="lane__header">
                  {laneBeingRenamedName() === lane || justCreatedLane() === lane ? (
                    <NameInput
                      value={newLaneName() ?? ""}
                      placeholder={t()("laneName.namePlaceholder")}
                      errorMsg={
                        newLaneName()
                          ? validateName(
                              newLaneName(),
                              lanes().filter(
                                (lane) => lane !== laneBeingRenamedName()
                              )
                            )
                          : null
                      }
                      onChange={(newValue) => setNewLaneName(newValue)}
                      onConfirm={renameLane}
                      onCancel={() => {
                        const laneName = laneBeingRenamedName() || lane;
                        if (
                          justCreatedLane() === laneName ||
                          isPlaceholderId(laneName)
                        ) {
                          deleteLane(laneName);
                          setJustCreatedLane(null);
                        }
                        setNewLaneName(null);
                        setLaneBeingRenamedName(null);
                      }}
                    />
                  ) : (
                    <LaneName
                      name={lane}
                      label={laneDisplayName(lane)}
                      locked={!lane}
                      count={getCardsFromLane(lane).length}
                      onRenameBtnClick={() => startRenamingLane(lane)}
                      onCreateNewCardBtnClick={() => createNewCard(lane)}
                      onDelete={() => deleteLane(lane)}
                      t={t}
                    />
                  )}
                </header>
                <div class="lane__body">
                <DragAndDrop.Container
                  class="lane__content"
                  group="cards"
                  id={`lane-content-${lane}`}
                  onChange={handleCardsSortChange}
                >
                  <For each={getCardsFromLane(lane)}>
                    {(card) => (
                      <Card
                        name={card.name}
                        tags={card.tags}
                        people={card.people}
                        dueDate={card.dueDate}
                        reviewAt={card.reviewAt}
                        priorityAt={card.priorityAt}
                        content={card.content}
                        disableDrag={disableCardsDrag()}
                        t={t}
                        locale={locale()}
                        selectionMode={selectionMode()}
                        isSelected={selectedCards().has(getCardKey(card))}
                        onSelectionChange={(isSelected) =>
                          toggleCardSelection(getCardKey(card), isSelected)
                        }
                        onClearPriority={() =>
                          patchCardContent(
                            card,
                            clearPriorityFromContent(card.content)
                          )
                        }
                        onFocus={() => {
                          setFocusedCardId(card.name);
                          setFocusedLaneIndex(null);
                        }}
                        onClick={() => {
                          if (!selectionMode()) {
                            let cardUrl = basePath();
                            if (board()) {
                              cardUrl += `${board()}`;
                            }
                            cardUrl += `/${encodeURIComponent(card.name)}.md`;
                            navigate(cardUrl);
                          }
                        }}
                        onMarkDone={() =>
                          patchCardContent(card, markContentDone(card.content))
                        }
                        onRestore={() =>
                          patchCardContent(card, restoreDoneContent(card.content))
                        }
                        headerSlot={
                          cardBeingRenamed()?.name === card.name ? (
                            <NameInput
                              value={newCardName()}
                              placeholder={t()("cardName.namePlaceholder")}
                              errorMsg={
                                newCardName()
                                  ? validateName(
                                      newCardName(),
                                      cards()
                                        .filter(
                                          (card) =>
                                            card.name !== cardBeingRenamed()?.name
                                        )
                                        .map((card) => card.name)
                                    )
                                  : null
                              }
                              onChange={(newValue) => setNewCardName(newValue)}
                              onConfirm={() =>
                                renameCard(
                                  cardBeingRenamed()?.name,
                                  newCardName()
                                )
                              }
                              onCancel={() => {
                                const renamedCard = cardBeingRenamed();
                                // A brand-new card left blank is discarded entirely
                                if (
                                  renamedCard &&
                                  justCreatedCard() === renamedCard.name &&
                                  !(newCardName() || "").trim()
                                ) {
                                  deleteCard(renamedCard);
                                  setJustCreatedCard(null);
                                } else {
                                  // Restore focus to the card
                                  setTimeout(() => {
                                    if (renamedCard) {
                                      setFocusedCardId(renamedCard.name);
                                      document
                                        .getElementById(`card-${renamedCard.name}`)
                                        ?.focus();
                                    }
                                  }, 50);
                                }
                                setNewCardName(null);
                                setCardBeingRenamed(null);
                              }}
                            />
                          ) : (
                            <CardName
                              name={card.name}
                              hasContent={!!card.content}
                              reviewAt={card.reviewAt}
                              priorityAt={card.priorityAt}
                              onMarkPriority={() =>
                                patchCardContent(
                                  card,
                                  markContentPriority(card.content)
                                )
                              }
                              onClearPriority={() =>
                                patchCardContent(
                                  card,
                                  clearPriorityFromContent(card.content)
                                )
                              }
                              onTogglePriority={() =>
                                patchCardContent(
                                  card,
                                  card.priorityAt
                                    ? clearPriorityFromContent(card.content)
                                    : markContentPriority(card.content)
                                )
                              }
                              onMarkReview={() =>
                                patchCardContent(card, markContentForReview(card.content))
                              }
                              onClearReview={() =>
                                patchCardContent(card, clearReviewFromContent(card.content))
                              }
                              onMarkDone={() =>
                                patchCardContent(card, markContentDone(card.content))
                              }
                              onRenameBtnClick={() => startRenamingCard(card)}
                              onDelete={() => deleteCard(card)}
                              onClick={() =>
                                navigate(
                                  `${basePath()}${board()}/${encodeURIComponent(card.name)}.md`
                                )
                              }
                              t={t}
                            />
                          )
                        }
                      />
                    )}
                  </For>
                </DragAndDrop.Container>
                <Show when={getDoneCardsFromLane(lane).length}>
                  <button
                    type="button"
                    class="lane__done-toggle"
                    onClick={() => toggleDoneLane(lane)}
                  >
                    {t()("laneName.completedToggle", {
                      count: getDoneCardsFromLane(lane).length,
                    })}
                  </button>
                  <Show when={openDoneLanes().has(lane)}>
                    <div class="lane__done-list">
                      <For each={getDoneCardsFromLane(lane)}>
                        {(card) => (
                          <Card
                            name={card.name}
                            tags={card.tags}
                            people={card.people}
                            dueDate={card.dueDate}
                            doneAt={card.doneAt}
                            priorityAt={card.priorityAt}
                            content={card.content}
                            disableDrag={true}
                            t={t}
                            locale={locale()}
                            onRestore={() =>
                              patchCardContent(
                                card,
                                restoreDoneContent(card.content)
                              )
                            }
                            onClearPriority={() =>
                              patchCardContent(
                                card,
                                clearPriorityFromContent(card.content)
                              )
                            }
                            onClick={() => {
                              navigate(
                                `${basePath()}${board()}/${encodeURIComponent(card.name)}.md`
                              );
                            }}
                            headerSlot={
                              <CardName
                                name={card.name}
                                hasContent={!!card.content}
                                doneAt={card.doneAt}
                                priorityAt={card.priorityAt}
                                onMarkPriority={() =>
                                  patchCardContent(
                                    card,
                                    markContentPriority(card.content)
                                  )
                                }
                                onClearPriority={() =>
                                  patchCardContent(
                                    card,
                                    clearPriorityFromContent(card.content)
                                  )
                                }
                                onTogglePriority={() =>
                                  patchCardContent(
                                    card,
                                    card.priorityAt
                                      ? clearPriorityFromContent(card.content)
                                      : markContentPriority(card.content)
                                  )
                                }
                                onRestore={() =>
                                  patchCardContent(
                                    card,
                                    restoreDoneContent(card.content)
                                  )
                                }
                                onRenameBtnClick={() => startRenamingCard(card)}
                                onDelete={() => deleteCard(card)}
                                onClick={() =>
                                  navigate(
                                    `${basePath()}${board()}/${encodeURIComponent(card.name)}.md`
                                  )
                                }
                                t={t}
                              />
                            }
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
                </div>
              </div>
            )}
          </For>
              </DragAndDrop.Container>
              <DragAndDrop.Target />
            </DragAndDrop.Provider>
          </Show>
          </Show>
          </Show>
        </div>
      </div>
      <Show when={renderUID()} keyed>
        <Show when={selectedCard()}>
          <ExpandedCard
            name={selectedCard().name}
            content={selectedCard().content}
            tags={selectedCard().tags || []}
            tagsOptions={tagsOptions()}
            people={selectedCard().people || []}
            peopleOptions={allPeople()}
            t={t}
            justCreated={
              justCreatedCard() === selectedCard().name ||
              isPlaceholderId(selectedCard().name)
            }
            onDiscardNew={() => {
              const card = selectedCard();
              setJustCreatedCard(null);
              setNamingCard(null);
              if (card) {
                deleteCard(card);
              }
              navigate(`${basePath()}${board()}` || "/");
            }}
            onClose={() => {
              const card = selectedCard();
              const cardName = card?.name;
              if (
                card &&
                (justCreatedCard() === card.name || isPlaceholderId(card.name)) &&
                !(card.content || "").trim()
              ) {
                setJustCreatedCard(null);
                setNamingCard(null);
                deleteCard(card);
              } else {
                setJustCreatedCard(null);
                setNamingCard(null);
              }
              navigate(`${basePath()}${board()}` || "/");
              setTimeout(() => {
                setFocusedCardId(cardName);
                const cardElement = document.getElementById(`card-${cardName}`);
                if (cardElement) {
                  cardElement.focus();
                  cardElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
              }, 50);
            }}
            onContentChange={(value) =>
              debounceChangeCardContent(value, selectedCard().id)
            }
            onTagColorChange={updateTagColorFromExpandedCard}
            onNameChange={handleOnSelectedCardNameChange}
            getNameErrorMsg={(newName) =>
              validateName(
                newName,
                cards()
                  .filter((card) => card.name !== selectedCard().name)
                  .map((card) => card.name)
              )
            }
            disableImageUpload={false}
            board={board()}
            lane={selectedCard()?.lane}
          />
        </Show>
      </Show>
      <Show when={showHelpDialog()}>
        <KeyboardNavigationDialog onClose={() => setShowHelpDialog(false)} t={t} />
      </Show>
      <Show when={settingsOpen()}>
        <SettingsDialog
          viewMode={viewMode()}
          onViewModeChange={setViewMode}
          colorScheme={colorScheme()}
          onColorSchemeChange={setColorScheme}
          onClose={() => setSettingsOpen(false)}
        />
      </Show>
    </div>
  );
}

export default App;
