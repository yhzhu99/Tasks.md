import { createSignal, onMount, onCleanup, createEffect, createMemo, Show, For } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { api, apiFetch, rememberVersion } from "../api";
import { useSession, useTeamText } from "../team-session";
import { IconImage } from "@stackoverflow/stacks-icons/icons";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
});

export function MarkdownEditor(props) {
  const text = useTeamText();
  const session = useSession();
  const [content, setContent] = createSignal(props.content || "");
  const [mode, setMode] = makePersisted(createSignal("write"), { storage: localStorage, name: "editorMode" });
  const [connected, setConnected] = createSignal(false);
  const [synced, setSynced] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [people, setPeople] = createSignal([session.user().username]);
  const [error, setError] = createSignal("");
  const [recovered, setRecovered] = createSignal("");
  let editorRoot, fileInput, view, provider, doc;
  let sequence = 0;
  const editable = new Compartment();
  const canEdit = () => connected() && synced() && !error();
  const draftKey = `tasks-draft:${session.user().username}:${props.id}`;
  function download(value = content()) {
    const url = URL.createObjectURL(new Blob([value], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${props.name || "card"}.md`; link.click(); URL.revokeObjectURL(url);
  }
  function checkpoint() {
    if (provider?.ws?.readyState !== 1) return;
    const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 4); encoding.writeVarUint(encoder, sequence);
    provider.ws.send(encoding.toUint8Array(encoder));
  }
  function replaceContent(value) {
    if (!view || !canEdit()) { setError(text("连接恢复后才能编辑。你的草稿可以下载。", "Reconnect before editing. You can download your draft.")); return; }
    const current = view.state.doc.toString();
    let start = 0, end = current.length, nextEnd = value.length;
    while (start < end && start < nextEnd && current[start] === value[start]) start++;
    while (end > start && nextEnd > start && current[end - 1] === value[nextEnd - 1]) { end--; nextEnd--; }
    view.dispatch({ changes: { from: start, to: end, insert: value.slice(start, nextEnd) } });
  }
  onMount(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) setRecovered(saved);
    doc = new Y.Doc();
    const endpoint = new URL(`${api}/collab`, window.location.origin); endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    provider = new WebsocketProvider(endpoint.toString(), props.id, doc, { disableBc: true });
    provider.messageHandlers[4] = (_encoder, decoder) => {
      const acknowledged = decoding.readVarUint(decoder);
      const version = decoding.readVarString(decoder);
      rememberVersion(props.path, version);
      props.onVersion?.(version);
      if (acknowledged === sequence) { setPending(false); localStorage.removeItem(draftKey); }
    };
    provider.on("status", ({ status }) => { setConnected(status === "connected"); if (status === "connected") setError(""); });
    provider.on("sync", (value) => { setSynced(value); if (value) checkpoint(); });
    provider.on("closed", ({ reason }) => setError(reason || text("连接已关闭，请重新登录或刷新。", "Connection closed. Sign in again or reload.")));
    const ytext = doc.getText("content");
    provider.awareness.setLocalStateField("user", { name: session.user().username, color: "#527cce", colorLight: "#527cce33" });
    provider.awareness.on("change", () => setPeople([...new Set([...provider.awareness.getStates().values()].map((state) => state.user?.name).filter(Boolean))]));
    const observe = () => { const value = ytext.toString(); setContent(value); props.onContentChange(value); };
    ytext.observe(observe);
    doc.on("update", (_update, origin) => {
      if (origin === provider) return;
      sequence++; setPending(true);
      try { localStorage.setItem(draftKey, ytext.toString()); } catch { setError(text("本机草稿存储已满，请下载备份。", "Local draft storage is full. Download a backup.")); }
      checkpoint();
    });
    view = new EditorView({
      parent: editorRoot,
      state: EditorState.create({ doc: ytext.toString(), extensions: [basicSetup, markdown(), EditorView.lineWrapping, yCollab(ytext, provider.awareness), editable.of(EditorView.editable.of(false)), EditorView.contentAttributes.of({ "aria-label": "Markdown", spellcheck: "false" })] }),
    });
    props.editorRef?.({ getContent: () => content(), setContent: replaceContent, canClose: () => !pending() || confirm(text("还有未同步的修改。本机已保留恢复草稿，确定关闭？", "Some edits are not synced. A recovery draft is saved on this device. Close anyway?")) });
    const beforeUnload = (event) => { if (pending()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    onCleanup(() => { window.removeEventListener("beforeunload", beforeUnload); ytext.unobserve(observe); view.destroy(); provider.destroy(); doc.destroy(); });
  });
  createEffect(() => { const allowed = canEdit(); view?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(allowed)) }); });
  const renderedHtml = createMemo(() => mode() === "preview" ? DOMPurify.sanitize(marked.parse(content(), { async: false, gfm: true, breaks: true })) : "");
  async function uploadImage(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !canEdit()) return;
    const data = new FormData(); data.set("file", file);
    try {
      const name = await apiFetch(`${api}/image`, { method: "POST", body: data }).then((response) => response.text());
      if (!canEdit()) return;
      const selection = view.state.selection.main;
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: `![${file.name.replace(/[\[\]]/g, "")}](${api}/image/${name})` } });
      setMode("write"); view.focus();
    } catch (error) { setError(error.message); }
  }
  return <div class="md-editor">
    <div class="md-editor__toolbar"><div class="md-editor__modes">
      <button type="button" class={mode() === "write" ? "button--active" : ""} onClick={() => { setMode("write"); view?.focus(); }}>{props.t()("editor.write")}</button>
      <button type="button" class={mode() === "preview" ? "button--active" : ""} onClick={() => setMode("preview")}>{props.t()("editor.preview")}</button>
    </div><div class="team-actions"><button type="button" onClick={() => download()}>{text("下载 .md", "Download .md")}</button><Show when={!props.disableImageUpload}><button type="button" disabled={!canEdit()} title={props.t()("editor.uploadImage")} onClick={() => fileInput.click()}><span innerHTML={IconImage} /></button><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden onChange={uploadImage} /></Show></div></div>
    <div class="collab-status" aria-live="polite"><span class={canEdit() && !pending() ? "collab-status__saved" : ""}>{error() || (!connected() ? text("连接中 · 草稿保留在本机", "Connecting · drafts stay on this device") : !synced() || pending() ? text("正在同步…", "Syncing…") : text("✓ 已保存 · Markdown 实时协作", "✓ Saved · live Markdown"))}</span><div class="collab-people"><For each={people()}>{(name) => <span class="collab-person">{name}</span>}</For></div></div>
    <Show when={recovered()}><div class="team-help">{text("找到上次未同步的草稿。请先下载，确认内容后再清除。", "An unsynced recovery draft was found. Download it before dismissing.")}<div class="team-actions"><button onClick={() => download(recovered())}>{text("下载恢复草稿", "Download recovery draft")}</button><button onClick={() => { setRecovered(""); localStorage.removeItem(draftKey); }}>{text("清除", "Dismiss")}</button></div></div></Show>
    <div class="collab-editor" ref={editorRoot} style={{ display: mode() === "write" ? "block" : "none" }} />
    <Show when={mode() === "preview"}><div class="markdown-body" innerHTML={renderedHtml()} /></Show>
  </div>;
}
