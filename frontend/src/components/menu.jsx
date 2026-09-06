import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import { ConfirmDialog } from "./confirm-dialog";
import { useTeamText } from "../team-session";

export function Menu(props) {
  const text = useTeamText();
  const [confirmation, setConfirmation] = createSignal(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const opener = document.activeElement;
  let menu;

  function close() {
    if (busy()) return;
    props.onClose();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  createEffect(() => {
    if (!props.open || confirmation()) return;
    queueMicrotask(() => {
      if (!menu?.isConnected) return;
      menu.showPopover();
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(props.x || 8, innerWidth - rect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(props.y || 8, innerHeight - rect.height - 8))}px`;
      menu.querySelector("button")?.focus();
    });
    const outside = (event) => { if (menu && !menu.contains(event.target) && !opener?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    onCleanup(() => document.removeEventListener("pointerdown", outside));
  });

  async function choose(option) {
    if (busy()) return;
    if (option.requiresConfirmation) { setConfirmation(option); return; }
    setBusy(true); setError("");
    try { await option.onClick(); setBusy(false); close(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  function keydown(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  return <Show when={props.open}>
    <Show when={!confirmation()} fallback={
      <ConfirmDialog title={confirmation()?.label} message={confirmation()?.confirmation || text(`确认${confirmation()?.label}？${props.subject ? `「${props.subject}」及其包含的内容将被删除。` : ""}`, `Confirm ${confirmation()?.label}?${props.subject ? ` “${props.subject}” and its contents will be deleted.` : ""}`)} onConfirm={() => confirmation().onClick()} onClose={close} />
    }>
      <div ref={menu} id={props.id} popover="manual" class="popup" onKeyDown={keydown}>
        <For each={props.options}>{(option) => <button type="button" disabled={busy()} onClick={() => choose(option)}>{option.label}</button>}</For>
        <Show when={error()}><p role="alert" class="team-error">{error()}</p></Show>
      </div>
    </Show>
  </Show>;
}
