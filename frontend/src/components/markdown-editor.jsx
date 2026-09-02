import { createSignal, onMount, createMemo, Show } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api } from "../api";
import { IconImage } from "@stackoverflow/stacks-icons/icons";

// Open links from rendered markdown in a new tab, safely
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * A lightweight Markdown editor: a plain textarea for writing and a
 * sanitized rendered preview. Replaces the previous rich text editor.
 *
 * @param {Object} props
 * @param {string} props.content - Initial markdown content
 * @param {Function} props.onContentChange - Called with the new content on every change
 * @param {boolean} [props.disableImageUpload] - Hide the image upload button
 * @param {Function} [props.editorRef] - Receives ({ getContent, setContent }) imperative API
 * @param {Function} props.t
 */
export function MarkdownEditor(props) {
  const [content, setContent] = createSignal(props.content || "");
  const [mode, setMode] = makePersisted(createSignal("write"), {
    storage: localStorage,
    name: "editorMode",
  });
  let textareaRef;
  let fileInputRef;

  onMount(() => {
    props.editorRef?.({
      getContent: () => content(),
      setContent: (value) => {
        setContent(value);
        props.onContentChange(value);
      },
    });
    textareaRef?.focus();
  });

  function handleInput(e) {
    setContent(e.target.value);
    props.onContentChange(e.target.value);
  }

  function switchToWriteMode() {
    setMode("write");
    requestAnimationFrame(() => textareaRef?.focus());
  }

  const renderedHtml = createMemo(() => {
    if (mode() !== "preview") {
      return "";
    }
    const raw = marked.parse(content() || "", {
      async: false,
      gfm: true,
      breaks: true,
    });
    return DOMPurify.sanitize(raw);
  });

  function insertAtCursor(text) {
    if (mode() !== "write") {
      switchToWriteMode();
    }
    const textarea = textareaRef;
    const current = content();
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? start;
    const newContent = `${current.slice(0, start)}${text}${current.slice(end)}`;
    setContent(newContent);
    props.onContentChange(newContent);
    requestAnimationFrame(() => {
      if (!textarea) {
        return;
      }
      textarea.focus();
      const cursor = start + text.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    const imageName = await fetch(`${api}/image`, {
      method: "POST",
      mode: "cors",
      body: formData,
    }).then((res) => res.text());
    const url = `${api}/image/${imageName}`;
    insertAtCursor(`![${file.name}](${url})`);
  }

  return (
    <div class="md-editor">
      <div class="md-editor__toolbar">
        <div class="md-editor__modes">
          <button
            type="button"
            class={mode() === "write" ? "button--active" : ""}
            title={props.t()("editor.writeMode")}
            onClick={() => switchToWriteMode()}
          >
            {props.t()("editor.write")}
          </button>
          <button
            type="button"
            class={mode() === "preview" ? "button--active" : ""}
            title={props.t()("editor.previewMode")}
            onClick={() => setMode("preview")}
          >
            {props.t()("editor.preview")}
          </button>
        </div>
        <Show when={!props.disableImageUpload}>
          <button
            type="button"
            class="small"
            title={props.t()("editor.uploadImage")}
            onClick={() => fileInputRef?.click()}
          >
            <span innerHTML={IconImage} />
          </button>
          <input
            ref={(el) => {
              fileInputRef = el;
            }}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />
        </Show>
      </div>
      <Show
        when={mode() === "write"}
        fallback={<div class="markdown-body" innerHTML={renderedHtml()} />}
      >
        <textarea
          ref={(el) => {
            textareaRef = el;
          }}
          class="md-editor__textarea"
          value={content()}
          onInput={handleInput}
          spellcheck="false"
          placeholder={props.t()("editor.placeholder")}
        />
      </Show>
    </div>
  );
}
