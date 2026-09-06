import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useTeamText } from "../team-session";

export function ConfirmDialog(props) {
  const text = useTeamText();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let dialog;
  onMount(() => {
    const opener = document.activeElement;
    dialog.showModal();
    onCleanup(() => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  });
  async function confirm() {
    if (busy()) return;
    setBusy(true); setError("");
    try { await props.onConfirm(); props.onClose(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <Portal><dialog class="confirm-dialog" ref={dialog} aria-label={props.title}
    onCancel={(event) => { event.preventDefault(); if (!busy()) props.onClose(); }}
    onKeyDown={(event) => event.stopPropagation()}>
    <h2>{props.title}</h2><p>{props.message}</p>
    <Show when={error()}><p class="team-error" role="alert">{error()}</p></Show>
    <div class="confirm-dialog__actions">
      <button type="button" autofocus disabled={busy()} onClick={props.onClose}>{text("取消", "Cancel")}</button>
      <button type="button" class="button--danger" disabled={busy()} onClick={confirm}>{busy() ? text("处理中…", "Working…") : text("确认", "Confirm")}</button>
    </div>
  </dialog></Portal>;
}
