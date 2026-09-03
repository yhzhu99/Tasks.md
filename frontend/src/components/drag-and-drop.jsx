import {
  createEffect,
  createSignal,
  onMount,
  onCleanup,
  children,
  createMemo,
  batch,
  Show,
  createContext,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { useLongPress } from "../utils";

const DragAndDropContext = createContext();

function Provider(props) {
  const initialDragAndDropTarget = {
    originalElement: null,
    top: null,
    left: null,
    cursorDisplacementLeft: null,
    cursorDisplacementTop: null,
    from: null,
    to: null,
  };
  const [dragAndDropTarget, setDragAndDropTarget] = createSignal(
    initialDragAndDropTarget
  );

  return (
    <DragAndDropContext.Provider
      value={[dragAndDropTarget, setDragAndDropTarget]}
    >
      {props.children}
    </DragAndDropContext.Provider>
  );
}

function getPageCoordinatesFromMouseOrTouchEvent(e) {
  const pageX = e.changedTouches ? e.changedTouches[0].pageX : e.pageX;
  const pageY = e.changedTouches ? e.changedTouches[0].pageY : e.pageY;
  return { pageX, pageY };
}

/**
 *
 * @typedef {Object} dragAndDropTarget()
 * @property {number} left
 * @property {number} top
 * @property {number} cursorDisplacementLeft
 * @property {number} cursorDisplacementTop
 * @property {string} from Id of parent element of the target
 * @property {string} to Id of the new target parent
 */

/**
 * @callback OnDragAndDropTargetChange
 * @param {dragAndDropTarget()} newDragAndDropTarget
 */

function Target() {
  const [dragAndDropTarget, setDragAndDropTarget] =
    useContext(DragAndDropContext);
  const draggableItem = createMemo((prev) => {
    if (prev === dragAndDropTarget().originalElement) {
      return prev;
    }
    if (!dragAndDropTarget().originalElement) {
      return null;
    }
    if (dragAndDropTarget().originalElement && prev) {
      return prev;
    }
    const target = dragAndDropTarget().originalElement.cloneNode(true);
    const targetComputedStyle = window.getComputedStyle(
      dragAndDropTarget().originalElement
    );
    target.style.height = targetComputedStyle.height;
    target.style.width = targetComputedStyle.width;
    target.style.opacity = "1";
    target.classList.add("being-dragged");
    return target;
  });

  function handlePointerMove(e) {
    if (!dragAndDropTarget().originalElement) {
      return;
    }
    e.preventDefault();
    const { pageX, pageY } = getPageCoordinatesFromMouseOrTouchEvent(e);
    const itemLeft = pageX - dragAndDropTarget().cursorDisplacementLeft;
    const itemTop = pageY - dragAndDropTarget().cursorDisplacementTop;
    setDragAndDropTarget({
      ...dragAndDropTarget(),
      left: itemLeft,
      top: itemTop,
    });
  }

  onMount(() => {
    document.addEventListener("mousemove", handlePointerMove, {
      passive: false,
    });
    document.addEventListener("touchmove", (e) => handlePointerMove(e), {
      passive: false,
    });
  });

  onCleanup(() => {
    document.removeEventListener("mousemove", handlePointerMove);
    document.removeEventListener("touchmove", handlePointerMove);
  });

  return (
    <Show when={draggableItem}>
      <div
        style={{
          opacity: draggableItem ? "1" : "0",
          position: "absolute",
          top: `${dragAndDropTarget().top}px`,
          left: `${dragAndDropTarget().left}px`,
          "z-index": "999",
          "touch-action": "none",
        }}
      >
        {draggableItem}
      </div>
    </Show>
  );
}

/**
 *
 * @param {Object} props
 * @param {string} props.class
 * @param {string} props.group Target group if container is nested
 * @param {string} props.id
 * @param {OnDragAndDropTargetChange} props.onChange
 * @param {boolean} props.disabled
 */
function Container(props) {
  const [dragAndDropTarget, setDragAndDropTarget] =
    useContext(DragAndDropContext);
  const [autoScrollSign, setAutoScrollSign] = createSignal(0);
  const [sortedItemsIds, setSortedItemsIds] = createStore([]);
  const [positions, setPositions] = createSignal([]);
  const [flexDirection, setFlexDirection] = createSignal(null);
  const [gap, setGap] = createSignal(0);
  const [positionProperty, setPositionProperty] = createSignal(null);
  const [paddingProperty, setPaddingProperty] = createSignal(null);
  const [lengthProperty, setLengthProperty] = createSignal(null);
  const [scrollProperty, setScrollProperty] = createSignal(null);
  const [clientLengthProperty, setClientLengthProperty] = createSignal(null);
  const [startPageCoordinates, setStartPageCoordinates] = createSignal(null);

  let containerRef;

  const items = children(() => props.children());

  const [targetBeforeMoving, setTargetBeforeMoving] = createSignal(null);

  function handlePointerDown(e, currentTarget) {
    if (e.target.tagName === "INPUT") {
      return;
    }
    if (currentTarget?.hasAttribute?.("data-no-reorder")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const targetBoundingRect = currentTarget.getBoundingClientRect();
    const { pageX, pageY } = getPageCoordinatesFromMouseOrTouchEvent(e);
    const cursorDisplacementLeft = pageX - targetBoundingRect.left;
    const cursorDisplacementTop = pageY - targetBoundingRect.top;
    const top = targetBoundingRect.top;
    const left = targetBoundingRect.left;
    setTargetBeforeMoving({
      top,
      left,
      cursorDisplacementLeft,
      cursorDisplacementTop,
      originalElement: currentTarget,
      height: targetBoundingRect.height,
      width: targetBoundingRect.width,
      from: props.id,
      to: props.id,
      group: props.group,
    });
    setStartPageCoordinates({ x: pageX, y: pageY });
    const newPositions = calculateNewPositions();
    setPositions(newPositions);
  }

  function handlePointerMove(e, touch) {
    if (!startPageCoordinates()) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const { pageX, pageY } = getPageCoordinatesFromMouseOrTouchEvent(e);
    const diffLeft = Math.abs(pageX - startPageCoordinates().x);
    const diffTop = Math.abs(pageY - startPageCoordinates().y);
    const minMovement = 6;
    if (!touch && diffLeft <= minMovement && diffTop <= minMovement) {
      return;
    }
    if (touch) {
      const maxMovement = 26;
      if (diffLeft > maxMovement || diffTop > maxMovement) {
        setTargetBeforeMoving(null);
        setStartPageCoordinates(null);
        return;
      }
    }
    setDragAndDropTarget((prev) => ({
      ...prev,
      ...targetBeforeMoving(),
    }));
    dragAndDropTarget().originalElement.style.opacity = "0";
    setTargetBeforeMoving(null);
    setStartPageCoordinates(null);
  }

  const [onLongPressStart, onLongPressEnd] = useLongPress(
    handleTouchStart,
    500
  );

  function handleTouchStart(e, currentTarget) {
    e.preventDefault();
    handlePointerDown(e, currentTarget);
    handlePointerMove(e, true);
  }

  function resetItemDragStyles() {
    for (const item of items() || []) {
      item.style.opacity = "1";
      item.style.translate = "";
    }
    if (containerRef && paddingProperty()) {
      containerRef.style[paddingProperty()] = "";
    }
  }

  function handlePointerUp() {
    setTargetBeforeMoving(null);
    setStartPageCoordinates(null);
    const target = dragAndDropTarget();
    const original = target.originalElement;
    const isDropTarget = target.to === props.id;
    if (original && sortedItemsIds && isDropTarget) {
      const index = sortedItemsIds.findIndex((id) => id === original.id);
      props.onChange({
        id: original.id,
        from: target.from,
        to: target.to,
        index,
      });
    }
    resetItemDragStyles();
    if (!original) {
      return;
    }
    // Every container listens to the document mouseup. Only the container
    // that owns the drop (or, when dropping outside any container, the first
    // listener that runs) clears the shared drag state; other listeners must
    // leave it intact so the drop target can still read the original element
    // and fire its onChange handler.
    if (!isDropTarget && target.to !== null) {
      return;
    }
    setDragAndDropTarget((prev) => ({
      ...prev,
      originalElement: null,
    }));
    setAutoScrollSign(0);
    setSortedItemsIds([]);
  }

  function updateChildrenElements() {
    const itemLength = dragAndDropTarget()?.[lengthProperty()];
    if (!itemLength) {
      return;
    }
    if (sortedItemsIds.length > items().length) {
      const newItem = dragAndDropTarget().originalElement.cloneNode(true);
      newItem.style.opacity = "0";
      newItem.style["z-index"] = "0";
      items().push(newItem);
    }
    for (let itemIndex = 0; itemIndex < items().length; itemIndex += 1) {
      const item = items()[itemIndex];
      const sortedItemIndex = sortedItemsIds.findIndex((id) => id === item.id);
      let translateToNewPosition = (sortedItemIndex - itemIndex) * itemLength;
      if (sortedItemIndex < itemIndex) {
        translateToNewPosition -= gap();
      }
      if (sortedItemIndex > itemIndex) {
        translateToNewPosition += gap();
      }
      if (flexDirection() === "row") {
        item.style.translate = `${translateToNewPosition}px 0`;
      } else {
        item.style.translate = `0 ${translateToNewPosition}px`;
      }
      if (item.id === dragAndDropTarget().originalElement?.id) {
        item.style.opacity = "0";
      }
    }
  }

  function calculateNewPositions() {
    const containerRect = containerRef.getBoundingClientRect();
    const containerStartPadding =
      window.getComputedStyle(containerRef)[paddingProperty()];
    const containerStartPaddingIntValue = Number(
      containerStartPadding.slice(0, -2)
    );
    const firstItemPosition =
      containerRect[positionProperty()] + containerStartPaddingIntValue;
    let lastPosition = firstItemPosition;
    let prevItemHeight = 0;
    const newPositions = sortedItemsIds.map((id, i) => {
      const item = items().find((itemToFind) => itemToFind.id === id);
      const itemLength = item?.getBoundingClientRect()[lengthProperty()] || 0;
      if (i === 0) {
        prevItemHeight = itemLength;
        return lastPosition;
      }
      const newPosition = lastPosition + gap() + prevItemHeight;
      lastPosition = newPosition;
      prevItemHeight = itemLength;
      return newPosition;
    });
    return newPositions;
  }

  createEffect(() => {
    if (!sortedItemsIds.length) {
      return;
    }
    const newPositions = calculateNewPositions();
    setPositions(newPositions);
  })

  function getItemLength(id) {
    const item = items().find((item) => item.id === id);
    const lengthInPx = getComputedStyle(item)[lengthProperty()];
    const length = Number(lengthInPx.substring(0, lengthInPx.length - 2));
    return length;
  }

  function sortItems(direction) {
    if (!sortedItemsIds.every(id => items().some(item => item.id === id))) {
      return;
    }
    const targetId = dragAndDropTarget().originalElement.id;
    // The drag clone is positioned in page coordinates; positions() and the
    // container rect are viewport-based, so normalize before comparing.
    // Compare against the cached pointer position (not the clone's edges),
    // so the drop index follows the cursor even for tall cards.
    const pointerOffset =
      positionProperty() === "top"
        ? dragAndDropTarget().cursorDisplacementTop
        : dragAndDropTarget().cursorDisplacementLeft;
    const targetPosition =
      dragAndDropTarget()[positionProperty()] -
      window.scrollY +
      pointerOffset +
      containerRef[scrollProperty()];

    if (direction === 1) {
      for (let i = 0; i < sortedItemsIds.length - 1; i++) {
        let currPos = positions()[i];
        const nextPos = positions()[i + 1];
        if (sortedItemsIds[i] === targetId) {
          currPos = targetPosition;
        }
        const nextItemLength = getItemLength(sortedItemsIds[i + 1]);
        if (currPos > nextPos + nextItemLength * 0.5) {
          const tempItem = sortedItemsIds[i + 1];
          batch(() => {
            setSortedItemsIds(i + 1, sortedItemsIds[i]);
            setSortedItemsIds(i, tempItem);
          });
        }
      }
      return;
    }

    for (let i = sortedItemsIds.length - 1; i > 0; i--) {
      let currPos = positions()[i];
      const nextPos = positions()[i - 1];
      if (sortedItemsIds[i] === targetId) {
        currPos = targetPosition;
      }
      const nextItemLength = getItemLength(sortedItemsIds[i - 1]);
      if (currPos < nextPos + nextItemLength * 0.5) {
        const tempItem = sortedItemsIds[i - 1];
        batch(() => {
          setSortedItemsIds(i - 1, sortedItemsIds[i]);
          setSortedItemsIds(i, tempItem);
        });
      }
    }
    
  }

  function autoScroll(setAutoScrollSign, topOrLeft) {
    if (!autoScrollSign()) {
      containerRef.style["scroll-snap-type"] = "";
      return;
    }
    const maxScroll = Number.MAX_SAFE_INTEGER;
    if (autoScrollSign() > 0 && containerRef[scrollProperty()] >= maxScroll) {
      setAutoScrollSign(0);
      containerRef.style["scroll-snap-type"] = "";
      return;
    }
    if (autoScrollSign() < 0 && containerRef[scrollProperty()] <= 0) {
      setAutoScrollSign(0);
      containerRef.style["scroll-snap-type"] = "";
      return;
    }
    const autoScrollAmount = 4;
    containerRef.style["scroll-snap-type"] = "none";
    containerRef.scrollBy({
      [topOrLeft]: autoScrollSign() * autoScrollAmount,
    });
    if (!dragAndDropTarget().originalElement) {
      return;
    }
    sortItems(autoScrollSign());
    setTimeout(() => {
      autoScroll(setAutoScrollSign, topOrLeft);
    }, 7);
  }

  onMount(() => {
    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("touchend", handlePointerUp);
  });

  onCleanup(() => {
    document.removeEventListener("mouseup", handlePointerUp);
    document.removeEventListener("touchend", handlePointerUp);
  });

  function preventDragWhenScrollingWithTouch() {
    onLongPressEnd();
    setStartPageCoordinates(null);
    setTargetBeforeMoving(null);
  }

  // setup signals, runs when items container ref changes
  createEffect(() => {
    const containerComputedStyle = window.getComputedStyle(containerRef);
    const computedGap = containerComputedStyle.gap;
    const gapIsInteger =
      /[0-9]*px|em|rem|%|vh|vw|vmin|vmax|ex|ch|cm|mm|in/.test(computedGap);
    const gapIntergerValue = gapIsInteger
      ? Number(containerComputedStyle.gap.slice(0, -"px".length))
      : 0;
    setGap(gapIntergerValue);
    const flexDirection = containerComputedStyle.flexDirection;
    setFlexDirection(flexDirection);
    setPositionProperty(flexDirection === "row" ? "left" : "top");
    setPaddingProperty(flexDirection === "row" ? "paddingLeft" : "paddingTop");
    setLengthProperty(flexDirection === "row" ? "width" : "height");
    setScrollProperty(flexDirection === "row" ? "scrollLeft" : "scrollTop");
    setClientLengthProperty(
      flexDirection === "row" ? "clientWidth" : "clientHeight"
    );
    containerRef.removeEventListener("mousemove", handlePointerMove);
    containerRef.addEventListener("mousemove", handlePointerMove);
    containerRef.removeEventListener("touchmove", handlePointerMove, {
      passive: false,
    });
    containerRef.addEventListener("touchmove", handlePointerMove, {
      passive: false,
    });
    containerRef.removeEventListener(
      "scroll",
      preventDragWhenScrollingWithTouch
    );
    containerRef.addEventListener("scroll", preventDragWhenScrollingWithTouch);
    // Keep positions in sync while the lane content scrolls, otherwise the
    // visual reordering compares against stale coordinates.
    const refreshPositions = () => {
      if (sortedItemsIds.length && dragAndDropTarget().originalElement) {
        setPositions(calculateNewPositions());
      }
    };
    containerRef.removeEventListener("scroll", refreshPositions);
    containerRef.addEventListener("scroll", refreshPositions);
  });

  // Highlight the lane that will receive the drop while dragging over it
  createEffect(() => {
    const isTarget =
      !!dragAndDropTarget().originalElement &&
      dragAndDropTarget().to === props.id;
    const host = containerRef?.parentElement || containerRef;
    host?.classList?.toggle("drag-over", isTarget);
  });

  onCleanup(() => {
    (containerRef?.parentElement || containerRef)?.classList?.remove(
      "drag-over"
    );
  });

  function handleContextMenu(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // add event listeners to dom items, runs when items change
  createEffect(() => {
    const handleLongPress = (e) => onLongPressStart(e, e.currentTarget);
    const handleMouseDown = (e) => handlePointerDown(e, e.currentTarget);
    for (const item of items()) {
      item.removeEventListener("mousedown", handleMouseDown);
      item.addEventListener("mousedown", handleMouseDown);
      item.removeEventListener("touchstart", handleLongPress);
      item.addEventListener("touchstart", handleLongPress);
      item.removeEventListener("mouseup", onLongPressEnd);
      item.addEventListener("mouseup", onLongPressEnd);
      item.removeEventListener("touchend", onLongPressEnd);
      item.addEventListener("touchend", onLongPressEnd);
      item.removeEventListener("contextmenu", handleContextMenu);
      item.addEventListener("contextmenu", handleContextMenu);
      item.style.opacity = "1";
      item.style.translate = "";
    }
    setSortedItemsIds([]);
    const endPadding =
      flexDirection === "row" ? "paddingRight" : "paddingBottom";
    containerRef.style[endPadding] = "";
  });

  // update dragAndDropTarget().to, runs when target top or left changes
  createEffect((prev) => {
    if (
      !dragAndDropTarget().originalElement ||
      prev === JSON.stringify(dragAndDropTarget()) ||
      dragAndDropTarget().group !== props.group
    ) {
      return JSON.stringify(dragAndDropTarget());
    }
    if (props.id !== dragAndDropTarget().to) {
      setSortedItemsIds(
        sortedItemsIds.filter(
          (id) => id !== dragAndDropTarget().originalElement.id
        )
      );
      return JSON.stringify(dragAndDropTarget());
    }
    if (props.id !== dragAndDropTarget().from) {
      const endPadding =
        flexDirection === "row" ? "paddingRight" : "paddingBottom";
      containerRef.style[endPadding] =
        `${dragAndDropTarget()[lengthProperty()]}px`;
    }
    if (!sortedItemsIds.length) {
      const newSortedItemsIds = items().map((item) => item.id);
      setSortedItemsIds(newSortedItemsIds);
    }
    if (
      !sortedItemsIds.some(
        (id) => id === dragAndDropTarget().originalElement.id
      )
    ) {
      const targetId = dragAndDropTarget().originalElement.id;
      setSortedItemsIds(sortedItemsIds.length, targetId);
    }
    let direction;
    if (JSON.parse(prev).originalElement !== null) {
      direction = Math.sign(
        dragAndDropTarget()[positionProperty()] -
          JSON.parse(prev)[positionProperty()]
      );
    }
    sortItems(direction || -1);
    return JSON.stringify(dragAndDropTarget());
  });

  // update dom items, runs when sortedItemsIds change
  createEffect((prev) => {
    if (prev === JSON.stringify(sortedItemsIds)) {
      return JSON.stringify(sortedItemsIds);
    }
    if (sortedItemsIds.length) {
      updateChildrenElements();
    }
    return JSON.stringify(sortedItemsIds);
  }, "[]");

  // update dragAndDropTarget().to, runs when target top or left changes
  createEffect((prev) => {
    if (!dragAndDropTarget().originalElement) {
      return;
    }
    if (![null, props.id].includes(dragAndDropTarget().to)) {
      return;
    }
    if (dragAndDropTarget().group !== props.group) {
      return;
    }
    // Decide the drop container from the cached pointer position, not the
    // clone's edges, so dropping near the bottom edge of a lane still lands.
    const pointerLeft =
      dragAndDropTarget().left +
      dragAndDropTarget().cursorDisplacementLeft -
      window.scrollX;
    const pointerTop =
      dragAndDropTarget().top +
      dragAndDropTarget().cursorDisplacementTop -
      window.scrollY;
    const positionKey = JSON.stringify([pointerLeft, pointerTop]);
    if (prev === positionKey) {
      return prev;
    }
    const containerRect =
      containerRef.clientHeight > 0
        ? containerRef.getBoundingClientRect()
        : (containerRef.parentElement || containerRef).getBoundingClientRect();
    const containerStart = containerRect.left;
    const containerEnd = containerRect.left + containerRect.width;
    const innerStart = containerRect.top;
    const innerEnd = containerRect.top + containerRect.height;
    const isWithinBounds =
      pointerLeft > containerStart &&
      pointerLeft <= containerEnd &&
      pointerTop > innerStart &&
      pointerTop <= innerEnd;
    if (isWithinBounds) {
      setDragAndDropTarget((prev) => ({
        ...prev,
        to: props.id,
      }));
      return positionKey;
    }
    if (dragAndDropTarget().to === props.id) {
      setDragAndDropTarget((prev) => ({
        ...prev,
        to: null,
      }));
    }
    return positionKey;
  });

  // update autoScrollAmount, runs when target top or left changes
  createEffect((prev) => {
    if (!dragAndDropTarget().originalElement) {
      return;
    }
    if (prev === dragAndDropTarget()[positionProperty()]) {
      return prev;
    }
    const isSameGroup = dragAndDropTarget().group === props.group;
    if (isSameGroup && dragAndDropTarget().to !== props.id) {
      return;
    }
    const isDescendant = containerRef.contains(
      dragAndDropTarget().originalElement
    );
    if (!isDescendant && !isSameGroup) {
      return;
    }
    const itemLength =
      dragAndDropTarget().originalElement[clientLengthProperty()];
    const maxScroll = Number.MAX_SAFE_INTEGER;
    let newAutoScrollAmount = 0;
    const containerRect = containerRef.getBoundingClientRect();
    const containerStart = containerRect[positionProperty()];
    const containerEndPos =
      containerStart + containerRef[clientLengthProperty()];
    const autoscrollThreshold = 0.7;
    if (
      dragAndDropTarget()[positionProperty()] &&
      containerRef[scrollProperty()] < maxScroll &&
      dragAndDropTarget()[positionProperty()] +
        itemLength * autoscrollThreshold >=
        containerEndPos
    ) {
      newAutoScrollAmount = 1;
    } else if (
      dragAndDropTarget()[positionProperty()] <=
      containerStart - itemLength * (1 - autoscrollThreshold)
    ) {
      newAutoScrollAmount = -1;
    }
    if (autoScrollSign() !== newAutoScrollAmount) {
      setAutoScrollSign(newAutoScrollAmount);
      autoScroll(setAutoScrollSign, positionProperty());
    }
    return dragAndDropTarget()[positionProperty()];
  });

  return (
    <ul
      class={props.class}
      id={props.id}
      ref={(el) => {
        containerRef = el;
      }}
      style={{
        position: "relative",
        "touch-action": dragAndDropTarget().originalElement ? "none" : "auto",
      }}
      draggable
    >
      {items()}
    </ul>
  );
}

export const DragAndDrop = {
  Provider,
  Target,
  Container,
};
