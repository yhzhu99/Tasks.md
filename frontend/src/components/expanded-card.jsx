import { createEffect, createSignal, createMemo, For, Show } from "solid-js";
import { Menu } from "./menu";
import { handleKeyDown } from "../utils";
import { makePersisted } from "@solid-primitives/storage";
import { NameInput } from "./name-input";
import { Portal } from "solid-js/web";
import { MarkdownEditor } from "./markdown-editor";
import {
  IconClear,
  IconScreenFull,
  IconScreenNormal,
} from "@stackoverflow/stacks-icons/icons";
import {
  addTagToContent,
  removeTagFromContent,
  addPersonToContent,
  removePersonFromContent,
  setDueDateInContent,
  getDueDateFromContent,
  getReviewAtFromContent,
  getDoneAtFromContent,
  markContentForReview,
  markContentDone,
  clearReviewFromContent,
  restoreDoneContent,
} from "../card-content-utils";

/**
 *
 * @param {Object} props
 * @param {string} props.name Card name
 * @param {string} props.content Initial card content
 * @param {boolean} props.disableImageUpload Disable local image upload button
 * @param {string[]} props.tags Card tags
 * @param {string[]} props.tagsOptions List of all available tags
 * @param {string[]} props.people Card assignees
 * @param {string[]} props.peopleOptions List of all known people
 * @param {Function} props.onClose Callback function for when user clicks outside of the dialog
 * @param {Function} props.onContentChange Callback function for when the content of the card is changed
 * @param {Function} props.onTagColorChange Callback function for when the color of a tag is changed
 * @param {Function} props.onNameChange Callback function for when the name of the card is changed
 * @param {Function} props.getNameErrorMsg Callback function to validate new card name
 * @param {Function} props.t
 */
function ExpandedCard(props) {
  const [isCardBeingRenamed, setIsCardBeingRenamed] = createSignal(!!props.justCreated);
  const [newCardName, setNewCardName] = createSignal(props.justCreated ? "" : null);
  const [isCreatingNewTag, setIsCreatingNewTag] = createSignal(null);
  const [availableTags, setAvailableTags] = createSignal([]);
  const [newTagName, setNewTagName] = createSignal("");
  const [newTagNameError, setTagNameError] = createSignal(null);
  const [isCreatingNewPerson, setIsCreatingNewPerson] = createSignal(false);
  const [newPersonName, setNewPersonName] = createSignal("");
  const [newPersonNameError, setNewPersonNameError] = createSignal(null);
  const [clickedPerson, setClickedPerson] = createSignal(null);
  const [showPersonPopup, setShowPersonPopup] = createSignal(false);
  const [editorApi, setEditorApi] = createSignal(null);
  const [availablePeople, setAvailablePeople] = createSignal([]);
  const [menuCoordinates, setMenuCoordinates] = createSignal(null);
  const [clickedTag, setClickedTag] = createSignal(null);
  const [showTagPopup, setShowTagPopup] = createSignal(false);
  const [showColorPopup, setShowColorPopup] = createSignal(false);
  const [isMaximized, setIsMaximized] = makePersisted(createSignal("false"), {
    storage: localStorage,
    name: "isExpandedCardMaximized",
  });

  const dueDate = createMemo(() => {
    return getDueDateFromContent(props.content);
  });

  let dialogRef;
  let backdropRef;

  function getCurrentContent() {
    return editorApi()?.getContent() ?? props.content ?? "";
  }

  function handleTagRenameChange(newValue) {
    setNewTagName(newValue);
    const taskAlreadyHasThisTag = props.tags.some(
      (tag) => tag.name.toLowerCase() === newTagName().toLowerCase()
    );
    setTagNameError(
      taskAlreadyHasThisTag ? props.t()("expandedCard.tagError.duplicate") : null
    );
  }

  function handleTagRenameConfirm() {
    setIsCreatingNewTag(false);
    if (newTagNameError()) {
      return handleTagRenameCancel();
    }

    if (!newTagName()) {
      return setNewTagName("");
    }

    const actualContent = getCurrentContent();
    const newContent = addTagToContent(actualContent, newTagName());
    editorApi()?.setContent(newContent);
    setNewTagName("");
  }

  function handleTagRenameCancel() {
    setIsCreatingNewTag(false);
    setNewTagName("");
    setTagNameError(null);
  }

  function handlePersonRenameChange(newValue) {
    setNewPersonName(newValue);
    const cardAlreadyHasThisPerson = (props.people || []).some(
      (person) => person.toLowerCase() === newPersonName().toLowerCase()
    );
    setNewPersonNameError(
      cardAlreadyHasThisPerson ? props.t()("expandedCard.personError.duplicate") : null
    );
  }

  function handlePersonRenameConfirm() {
    setIsCreatingNewPerson(false);
    if (newPersonNameError()) {
      return handlePersonRenameCancel();
    }
    if (!newPersonName()) {
      return setNewPersonName("");
    }
    const newContent = addPersonToContent(getCurrentContent(), newPersonName());
    editorApi()?.setContent(newContent);
    setNewPersonName("");
  }

  function handlePersonRenameCancel() {
    setIsCreatingNewPerson(false);
    setNewPersonName("");
    setNewPersonNameError(null);
  }

  function handleAssignPersonBtnOnClick(event) {
    event.stopPropagation();
    setNewPersonName("");
    setIsCreatingNewPerson(true);
  }

  function removePerson(personName) {
    setShowPersonPopup(false);
    setMenuCoordinates(null);
    const newContent = removePersonFromContent(getCurrentContent(), personName);
    editorApi()?.setContent(newContent);
    setClickedPerson(null);
  }

  function handleAddTagBtnOnClick(event) {
    event.stopPropagation();
    setNewTagName("");
    setIsCreatingNewTag(true);
  }

  function deleteTag(tagName) {
    setShowTagPopup(false);
    setMenuCoordinates(null);
    const currentContent = getCurrentContent();
    const newContent = removeTagFromContent(currentContent, tagName);
    editorApi()?.setContent(newContent);
    setClickedTag(null);
  }

  function handleOnNameInputChange(value) {
    setNewCardName(value);
  }

  function handleCardRenameConfirm() {
    const newNameWihtoutSpaces = (newCardName() || "").trim();
    if (!newNameWihtoutSpaces) {
      return handleCardRenameCancel();
    }
    const isSameName = newNameWihtoutSpaces === props.name;
    if (isSameName) {
      setIsCardBeingRenamed(false);
      return;
    }
    props.onNameChange(newNameWihtoutSpaces);
    setNewCardName("");
    setIsCardBeingRenamed(false);
  }

  function handleCardRenameCancel() {
    if (props.justCreated) {
      props.onDiscardNew?.();
      return;
    }
    setNewCardName("");
    setIsCardBeingRenamed(false);
  }

  function startRenamingCard() {
    setNewCardName(props.name);
    setIsCardBeingRenamed(true);
  }

  function getButtonCoordinates(event) {
    event.stopPropagation();
    const dialogCoordinates = dialogRef.getBoundingClientRect();
    const {
      x: dialogX,
      y: dialogY,
      width: dialogWidth,
    } = dialogCoordinates;
    const btnCoordinates = event.currentTarget.getBoundingClientRect();
    let x = btnCoordinates.x;
    const menuWidth = 90;
    const offsetX =
      x + btnCoordinates.width + menuWidth > dialogWidth + dialogX
        ? -btnCoordinates.width - menuWidth
        : btnCoordinates.width;
    x += offsetX - dialogX;
    const y = btnCoordinates.y - dialogY;
    return { x, y };
  }

  function handleTagClick(event, tag) {
    event.stopPropagation();
    const buttonCoordinates = getButtonCoordinates(event);
    setMenuCoordinates(buttonCoordinates);
    setClickedTag(tag);
    setShowTagPopup(true);
  }

  function handlePersonClick(event, person) {
    event.stopPropagation();
    const buttonCoordinates = getButtonCoordinates(event);
    setMenuCoordinates(buttonCoordinates);
    setClickedPerson(person);
    setShowPersonPopup(true);
  }

  function handleChangeColorOptionClick() {
    setShowTagPopup(false);
    setShowColorPopup(true);
  }

  function handleColorOptionClick(option) {
    setShowColorPopup(null);
    setMenuCoordinates(null);
    const tagName = clickedTag().name;
    setClickedTag(null);
    const mapTagToColor = {
      [tagName]: `var(--color-alt-${option + 1})`,
    };
    props.onTagColorChange(mapTagToColor);
  }

  const tagOptionsLength = 7;
  const colorMenuOptions = createMemo(() =>
    new Array(tagOptionsLength).fill(1).map((_, i) => ({
      label: (
        <>
          {props.t()("expandedCard.colorOption", { n: i + 1 })}{" "}
          <div
            class="color-preview-option"
            style={{ "background-color": `var(--color-alt-${i + 1})` }}
          />
        </>
      ),
      onClick: () => handleColorOptionClick(i),
    }))
  );

  const tagMenuOptions = createMemo(() => [
    {
      label: props.t()("expandedCard.changeColor"),
      onClick: handleChangeColorOptionClick,
      popoverTarget: "tag-color-menu",
    },
    {
      label: props.t()("expandedCard.deleteTag"),
      onClick: () => deleteTag(clickedTag()?.name),
    },
  ]);

  const personMenuOptions = createMemo(() => [
    {
      label: props.t()("expandedCard.removePerson"),
      onClick: () => removePerson(clickedPerson()),
      requiresConfirmation: false,
    },
  ]);

  createEffect(() => {
    setAvailablePeople(
      (props.peopleOptions || []).filter(
        (person) =>
          !(props.people || []).some(
            (assigned) => assigned.toLowerCase() === person.toLowerCase()
          ) && person.toLowerCase().includes(newPersonName()?.toLowerCase())
      )
    );
  });

  createEffect(() => {
    setAvailableTags(
      props.tagsOptions.filter(
        (tagOption) =>
          !props.tags.some((tag) => tag.name === tagOption.name) &&
          tagOption.name.toLowerCase().includes(newTagName()?.toLowerCase())
      )
    );
  });

  createEffect(() => {
    dialogRef?.show();
  });

  function handleDialogCancel(e) {
    if (e?.target?.type === "file") {
      return;
    }
    e?.preventDefault();
    if (newCardName() || isCreatingNewTag()) {
      setIsCreatingNewTag(false);
      return;
    }
    props.onClose();
  }

  function handleBackdropClick(e) {
    if (e.target === backdropRef) {
      handleDialogCancel();
    }
  }

  function handleDialogKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleDialogCancel();
    }
  }

  function handleChangeDueDate(e) {
    const newContent = setDueDateInContent(getCurrentContent(), e.target.value);
    editorApi()?.setContent(newContent);
  }

  function applyContent(next) {
    editorApi()?.setContent(next);
  }

  const reviewAt = createMemo(() => getReviewAtFromContent(props.content));
  const doneAt = createMemo(() => getDoneAtFromContent(props.content));

  return (
    <Portal>
      <div
        class="dialog-backdrop"
        onPointerDown={handleBackdropClick}
        onKeyDown={(e) =>
          handleKeyDown(e, (event) => handleBackdropClick(event))
        }
        ref={(el) => {
          backdropRef = el;
        }}
      >
        <dialog
          ref={(el) => {
            dialogRef = el;
          }}
          class={`${isMaximized() === "true" ? "dialog--maximized" : ""}`}
          onKeyDown={handleDialogKeyDown}
          onCancel={handleDialogCancel}
        >
          <div class="dialog__body">
            <header class="dialog__toolbar">
              <div class="dialog__toolbar-name">
                <h1>
                  {isCardBeingRenamed() ? (
                    <NameInput
                      value={newCardName()}
                      placeholder={props.t()("cardName.namePlaceholder")}
                      errorMsg={
                        newCardName()
                          ? props.getNameErrorMsg(newCardName())
                          : null
                      }
                      keepOpenWhenEmpty={!!props.justCreated}
                      onChange={(value) => handleOnNameInputChange(value)}
                      onConfirm={handleCardRenameConfirm}
                      onCancel={handleCardRenameCancel}
                    />
                  ) : (
                    <div
                      role="button"
                      onClick={startRenamingCard}
                      onKeyDown={(e) => handleKeyDown(e, startRenamingCard)}
                      title={props.t()("expandedCard.rename")}
                      tabIndex="0"
                    >
                      {props.name || "NO NAME"}
                    </div>
                  )}
                </h1>
              </div>
              <div class="dialog__toolbar-btns">
                <button
                  type="button"
                  class="dialog__toolbar-btn"
                  title={
                    isMaximized() === "true"
                      ? props.t()("expandedCard.minimize")
                      : props.t()("expandedCard.expand")
                  }
                  onClick={() =>
                    setIsMaximized(isMaximized() === "true" ? "false" : "true")
                  }
                >
                  <span
                    innerHTML={
                      isMaximized() === "true" ? IconScreenNormal : IconScreenFull
                    }
                  />
                </button>
                <button
                  type="button"
                  class="dialog__toolbar-btn"
                  onClick={props.onClose}
                  title={props.t()("common.close")}
                >
                  <span innerHTML={IconClear} />
                </button>
              </div>
            </header>
            <div class="dialog__tags-and-due-date">
              <div class="dialog__tags">
                {isCreatingNewTag() ? (
                  <NameInput
                    value={newTagName()}
                    errorMsg={newTagNameError()}
                    onChange={handleTagRenameChange}
                    onConfirm={handleTagRenameConfirm}
                    onCancel={handleTagRenameCancel}
                    list="tags"
                    datalist={
                      <datalist id="tags">
                        <For each={availableTags()}>
                          {(tag) => <option value={tag.name} />}
                        </For>
                      </datalist>
                    }
                  />
                ) : (
                  <button type="button" onClick={handleAddTagBtnOnClick}>
                    {props.t()("expandedCard.addTag")}
                  </button>
                )}
                <For each={props.tags || []}>
                  {(tag) => (
                    <div
                      class="tag tag--clickable"
                      style={{
                        "--tag-color": tag.backgroundColor,
                      }}
                      role="button"
                      popoverTarget="tag-menu"
                      onClick={(e) => handleTagClick(e, tag)}
                      onKeyDown={(e) =>
                        handleKeyDown(e, () => handleTagClick(e, tag))
                      }
                      tabIndex={0}
                    >
                      <h5>{tag.name}</h5>
                    </div>
                  )}
                </For>
              </div>
              <div class="dialog__people">
                {isCreatingNewPerson() ? (
                  <NameInput
                    value={newPersonName()}
                    errorMsg={newPersonNameError()}
                    onChange={handlePersonRenameChange}
                    onConfirm={handlePersonRenameConfirm}
                    onCancel={handlePersonRenameCancel}
                    list="people"
                    datalist={
                      <datalist id="people">
                        <For each={availablePeople()}>
                          {(person) => <option value={person} />}
                        </For>
                      </datalist>
                    }
                  />
                ) : (
                  <button type="button" onClick={handleAssignPersonBtnOnClick}>
                    {props.t()("expandedCard.assign")}
                  </button>
                )}
                <For each={props.people || []}>
                  {(person) => (
                    <div
                      class="person person--clickable"
                      role="button"
                      popoverTarget="person-menu"
                      onClick={(e) => handlePersonClick(e, person)}
                      onKeyDown={(e) =>
                        handleKeyDown(e, () => handlePersonClick(e, person))
                      }
                      tabIndex={0}
                    >
                      <h5>{person}</h5>
                    </div>
                  )}
                </For>
              </div>
              <div class="dialog__status">
                <Show when={!doneAt()}>
                  <Show
                    when={!reviewAt()}
                    fallback={
                      <button
                        type="button"
                        class="dialog__status-btn"
                        onClick={() => applyContent(clearReviewFromContent(getCurrentContent()))}
                      >
                        {props.t()("expandedCard.clearReview")}
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="dialog__status-btn dialog__status-btn--review"
                      onClick={() => applyContent(markContentForReview(getCurrentContent()))}
                    >
                      {props.t()("expandedCard.markReview")}
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="dialog__status-btn dialog__status-btn--done"
                    onClick={() => applyContent(markContentDone(getCurrentContent()))}
                  >
                    {props.t()("expandedCard.markDone")}
                  </button>
                </Show>
                <Show when={doneAt()}>
                  <button
                    type="button"
                    onClick={() => applyContent(restoreDoneContent(getCurrentContent()))}
                  >
                    {props.t()("expandedCard.restore")}
                  </button>
                </Show>
              </div>
              <div class="dialog__due-date">
                <label for="due">{props.t()("expandedCard.dueDate")}: </label>
                <input
                  name="due"
                  type="date"
                  value={dueDate()}
                  onChange={handleChangeDueDate}
                ></input>
              </div>
            </div>
            <div class="dialog__content">
              <MarkdownEditor
                content={props.content}
                onContentChange={props.onContentChange}
                disableImageUpload={props.disableImageUpload}
                editorRef={setEditorApi}
                t={props.t}
              />
            </div>
          </div>
          <Menu
            id="tag-menu"
            open={showTagPopup()}
            options={tagMenuOptions()}
            onClose={() => {
              setShowTagPopup(null);
              setMenuCoordinates(null);
            }}
            x={menuCoordinates()?.x}
            y={menuCoordinates()?.y}
          />
          <Menu
            id="tag-color-menu"
            open={showColorPopup()}
            options={colorMenuOptions()}
            onClose={() => {
              setShowColorPopup(null);
              setMenuCoordinates(null);
            }}
            x={menuCoordinates()?.x}
            y={menuCoordinates()?.y}
          />
          <Menu
            id="person-menu"
            open={showPersonPopup()}
            options={personMenuOptions()}
            onClose={() => {
              setShowPersonPopup(null);
              setMenuCoordinates(null);
            }}
            x={menuCoordinates()?.x}
            y={menuCoordinates()?.y}
          />
        </dialog>
      </div>
    </Portal>
  );
}

export default ExpandedCard;
