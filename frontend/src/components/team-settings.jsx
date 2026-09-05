import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { api, apiFetch, jsonRequest } from "../api";
import { useSession, useTeamText, PasswordForm } from "../team-session";

const ACTIONS = {
  user_create: ["创建账号", "Created account"], user_update: ["调整账号权限 / 状态", "Changed account role / status"],
  import: ["迁入", "Imported"], create: ["创建", "Created"], edit: ["编辑", "Edited"], move: ["改名 / 移动", "Renamed / moved"], delete: ["删除", "Deleted"], restore: ["恢复版本", "Restored revision"], tags: ["调整标签颜色", "Changed tag colors"], sort: ["调整排序", "Reordered"], login: ["登录", "Signed in"], password_reset: ["重置密码", "Reset password"], password_change: ["修改密码", "Changed password"], upload: ["上传图片", "Uploaded image"],
};
function ChangedText(props) {
  const parts = () => {
    const value = props.value || "", other = props.other || "";
    let start = 0, end = value.length, otherEnd = other.length;
    while (start < end && start < otherEnd && value[start] === other[start]) start++;
    while (end > start && otherEnd > start && value[end - 1] === other[otherEnd - 1]) { end--; otherEnd--; }
    return [value.slice(0, start), value.slice(start, end), value.slice(end)];
  };
  return <pre>{parts()[0]}<mark>{parts()[1]}</mark>{parts()[2] || (!props.value && !props.other ? "∅" : "")}</pre>;
}
export function HistoryPanel(props) {
  const text = useTeamText();
  const session = useSession();
  const [entries, setEntries] = createSignal([]);
  const [users, setUsers] = createSignal([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [more, setMore] = createSignal(false);
  const [restoring, setRestoring] = createSignal(null);
  let filter;
  async function load(append = false) {
    setBusy(true); setError("");
    try {
      if (!users().length) setUsers(await jsonRequest("/auth/users"));
      const values = new FormData(filter);
      const query = new URLSearchParams();
      for (const name of ["actor", "search"]) if (values.get(name)) query.set(name, values.get(name));
      if (values.get("from")) query.set("from", new Date(`${values.get("from")}T00:00:00`).toISOString());
      if (values.get("to")) query.set("to", new Date(`${values.get("to")}T23:59:59.999`).toISOString());
      if (props.resourceId) query.set("resource", props.resourceId);
      if (append) query.set("offset", entries().length);
      const result = await jsonRequest(`/history?${query}`);
      setEntries(append ? [...entries(), ...result] : result); setMore(result.length === 50);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  onMount(() => load());
  async function restore(entry) {
    setBusy(true); setError("");
    try {
      const cards = await jsonRequest("/cards");
      const current = cards.find((card) => card.id === entry.resource_id);
      await apiFetch(`${api}/history/${entry.id}/restore`, { method: "POST", headers: current ? { "If-Match": current.version } : {} });
      setRestoring(null); await load();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <div class="activity-panel">
      <p class="preference-footnote">{text("展开记录查看修改差异。连续编辑按成员合并为版本。", "Expand an event to compare revisions. Consecutive edits are grouped by member.")}</p>
      <form class="team-filter" ref={filter} onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label>{text("看板 / 卡片", "Board / card")}<input name="search" type="search" placeholder={text("搜索路径", "Search path")} /></label>
        <label>{text("成员", "Member")}<select name="actor"><option value="">{text("所有成员", "Everyone")}</option><option value="migration">{text("迁入数据", "Imported data")}</option><For each={users()}>{(user) => <option value={user.username}>{user.username}</option>}</For></select></label>
        <label>{text("开始日期", "From")}<input type="date" name="from" /></label><label>{text("结束日期", "To")}<input type="date" name="to" /></label>
        <button type="submit" disabled={busy()}>{text("筛选 / 刷新", "Filter / refresh")}</button>
      </form>
      <Show when={error()}><p role="alert" class="team-error">{error()}</p></Show>
      <Show when={!busy() && !error() && !entries().length}><p class="team-help">{text("这里还没有记录。试试调整筛选条件。", "No activity here yet. Try adjusting the filters.")}</p></Show>
      <ul class="history-list"><For each={entries()}>{(entry) => <li class="history-entry"><details>
        <summary><strong>{entry.actor === "migration" ? text("初始数据", "Initial data") : entry.actor}</strong> · {text(...(ACTIONS[entry.action] || [entry.action, entry.action]))}<time datetime={entry.updated}>{new Date(entry.updated).toLocaleString()}</time><div class="history-path">{entry.path || "Workspace"}</div></summary>
        <Show when={entry.before !== null || entry.after !== null}><div class="history-diff"><div><small>{text("修改前", "Before")}</small><ChangedText value={entry.before} other={entry.after} /></div><div><small>{text("修改后", "After")}</small><ChangedText value={entry.after} other={entry.before} /></div></div></Show>
        <Show when={session.user().admin && !props.resourceId && entry.path.endsWith(".md") && ["import", "create", "edit", "delete", "restore"].includes(entry.action)}><button disabled={busy()} onClick={() => setRestoring(entry.id)}>{text("恢复此版本", "Restore revision")}</button></Show>
        <Show when={restoring() === entry.id}><div class="inline-confirm" role="group" aria-label={text("确认恢复", "Confirm restore")}><p>{text("恢复此版本？当前内容保留在历史里。请先关闭该卡片的编辑窗口。", "Restore this revision? Current content stays in history. Close this card’s editors first.")}</p><button disabled={busy()} onClick={() => restore(entry)}>{text("确认恢复", "Confirm restore")}</button><button disabled={busy()} onClick={() => setRestoring(null)}>{text("取消", "Cancel")}</button></div></Show>
      </details></li>}</For></ul>
      <Show when={props.resourceId && session.user().admin}><p class="team-muted">{text("需要恢复？关闭卡片后，在设置 → 操作历史中恢复该版本。", "To restore, close this card and open Settings → Activity history.")}</p></Show>
      <Show when={more()}><button disabled={busy()} onClick={() => load(true)}>{text("加载更早记录", "Load earlier activity")}</button></Show>
      <Show when={busy()}><p class="team-muted" role="status">{text("加载中…", "Loading…")}</p></Show>
    </div>;
}

export function HistoryDialog(props) {
  const text = useTeamText();
  let dialog;
  onMount(() => {
    const opener = document.activeElement;
    dialog.showModal();
    onCleanup(() => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  });
  return <Portal><dialog ref={dialog} class="history-dialog" aria-label={text("卡片历史", "Card history")} onCancel={(event) => { event.preventDefault(); props.onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
    <div class="dialog__body"><div class="history-header"><h2>{text("卡片历史", "Card history")}</h2><button type="button" onClick={props.onClose} aria-label={text("关闭", "Close")}>×</button></div><HistoryPanel resourceId={props.resourceId} /></div>
  </dialog></Portal>;
}

export function AccountSettings() {
  const text = useTeamText();
  const session = useSession();
  const [notice, setNotice] = createSignal("");
  const [error, setError] = createSignal("");
  return <>
    <div class="preference-card"><div class="preference-row"><div><h2>{text("用户名", "Username")}</h2><p>{text("用于登录和标记操作历史。", "Used to sign in and identify your activity.")}</p></div><strong>{session.user().username}</strong></div><div class="preference-row"><h2>{text("角色", "Role")}</h2><span class="member-badge">{session.user().admin ? text("管理员", "Administrator") : text("成员", "Member")}</span></div></div>
    <section class="preference-group"><h2>{text("修改密码", "Change password")}</h2><p>{text("更新后，其他设备需要重新登录。", "Other devices will need to sign in again.")}</p><PasswordForm onSuccess={(user) => { session.setUser(user); setNotice(text("密码已更新。", "Password updated.")); }} /></section>
    <Show when={notice()}><p role="status" class="team-help">{notice()}</p></Show>
    <div class="preference-row"><div><h2>{text("登录状态", "Session")}</h2><p>{text("退出当前浏览器的账号。", "Sign out of this browser.")}</p></div><button type="button" onClick={async () => { try { await session.logout(); } catch (error) { setError(error.message); } }}>{text("退出登录", "Sign out")}</button></div>
    <Show when={error()}><p role="alert" class="team-error">{error()}</p></Show>
  </>;
}

export function DataSettings() {
  const text = useTeamText();
  return <div class="preference-card"><div class="preference-row"><div><h2>{text("导出工作区", "Export workspace")}</h2><p>{text("下载所有 Markdown 卡片和图片，保留看板目录结构。", "Download all Markdown cards and images, organized by board.")}</p></div><a class="preference-download" href={`${api}/export`} download>{text("下载 ZIP", "Download ZIP")}</a></div><p class="preference-footnote">{text("单张卡片可在编辑器中下载为 .md 文件。", "You can also download an individual .md file from its editor.")}</p></div>;
}

export function UserSettings() {
  const text = useTeamText();
  const session = useSession();
  const [users, setUsers] = createSignal([]);
  const [query, setQuery] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [pending, setPending] = createSignal(null);
  const [temporary, setTemporary] = createSignal(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  let temporaryPanel;
  createEffect(() => { if (temporary()) queueMicrotask(() => temporaryPanel?.scrollIntoView({ block: "nearest" })); });
  async function load() {
    setBusy(true); setError("");
    try { setUsers(await jsonRequest("/auth/users")); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  onMount(load);
  async function createUser(event) {
    event.preventDefault(); setBusy(true); setError(""); setTemporary(null);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const result = await jsonRequest("/auth/users", values);
      setTemporary({ username: values.username, password: result.temporaryPassword });
      setUsers(await jsonRequest("/auth/users")); form.reset(); setCreating(false);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function apply(user) {
    const action = pending().action;
    setBusy(true); setError(""); setTemporary(null); setNotice("");
    try {
      if (action === "reset") {
        const result = await jsonRequest("/auth/reset", { username: user.username });
        setTemporary({ username: user.username, password: result.temporaryPassword });
      } else {
        await jsonRequest("/auth/user", { username: user.username, ...(action === "role" ? { role: user.admin ? "member" : "admin" } : { disabled: !user.disabled }) });
        if (user.username === session.user().username) { session.setUser(await jsonRequest("/auth/me")); return; }
        setNotice(text("成员设置已更新。", "Member settings updated."));
      }
      setPending(null); setUsers(await jsonRequest("/auth/users"));
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  const filtered = () => users().filter((user) => user.username.toLowerCase().includes(query().trim().toLowerCase()));
  return <div class="members-panel" aria-busy={busy()}>
    <div class="members-toolbar"><input type="search" aria-label={text("搜索成员", "Search members")} placeholder={text("搜索成员…", "Search members…")} value={query()} onInput={(event) => setQuery(event.currentTarget.value)} /><span class="preference-footnote">{users().length} {text("位成员", "members")}</span><button type="button" disabled={busy()} onClick={() => setCreating(!creating())}>{creating() ? text("取消", "Cancel") : text("添加成员", "Add member")}</button></div>
    <Show when={creating()}><form class="team-form member-create" onSubmit={createUser}>
      <label>{text("用户名", "Username")}<input name="username" required minlength="2" maxlength="41" pattern="[a-z][a-z0-9_]{1,40}" placeholder="username" autocomplete="off" /><small>{text("小写字母、数字和下划线，以字母开头。", "Lowercase letters, digits and underscores; start with a letter.")}</small></label>
      <label>{text("角色", "Role")}<select name="role"><option value="member">{text("成员", "Member")}</option><option value="admin">{text("管理员", "Administrator")}</option></select></label>
      <button type="submit" disabled={busy()}>{text("创建账号", "Create account")}</button>
    </form></Show>
    <Show when={error()}><div class="team-error" role="alert">{error()} <button type="button" disabled={busy()} onClick={load}>{text("重试", "Retry")}</button></div></Show>
    <Show when={notice()}><p role="status" class="team-help">{notice()}</p></Show>
    <Show when={temporary()}><div class="team-temporary" role="status" ref={temporaryPanel}><strong>{temporary().username} · {text("临时密码", "Temporary password")}</strong><code>{temporary().password}</code><p class="preference-footnote">{text("请私下交给该成员，首次登录必须更换。关闭后不再显示。", "Share privately. The member must replace it at sign-in. This password will not be shown again.")}</p><div class="team-actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(temporary().password); setNotice(text("临时密码已复制。", "Temporary password copied.")); } catch { setError(text("无法复制，请手动选择并复制密码。", "Could not copy. Select and copy the password manually.")); } }}>{text("复制临时密码", "Copy temporary password")}</button><button type="button" onClick={() => setTemporary(null)}>{text("已保存，隐藏", "Hide password")}</button></div></div></Show>
    <div class="member-list"><For each={filtered()}>{(user) => <div class="member-row">
      <div class="member-info"><span class="member-avatar" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span><div><strong>{user.username}</strong><small>{user.disabled ? text("已停用", "Disabled") : user.username === session.user().username ? text("你", "You") : text("已启用", "Active")}</small></div></div>
      <span class="member-badge">{user.admin ? text("管理员", "Administrator") : text("成员", "Member")}</span>
      <div class="member-actions"><Show when={user.username !== session.user().username}><button type="button" disabled={busy()} onClick={() => setPending({ username: user.username, action: "reset" })}>{text("重置密码", "Reset password")}</button></Show><button type="button" disabled={busy()} onClick={() => setPending({ username: user.username, action: "role" })}>{user.admin ? text("设为成员", "Make member") : text("设为管理员", "Make admin")}</button><button type="button" disabled={busy()} onClick={() => setPending({ username: user.username, action: "status" })}>{user.disabled ? text("启用", "Enable") : text("停用", "Disable")}</button></div>
      <Show when={pending()?.username === user.username}><div class="inline-confirm" role="group" aria-label={text("确认成员操作", "Confirm member action")}><p>{pending().action === "reset" ? text(`为 ${user.username} 重置密码？该成员需要重新登录。`, `Reset ${user.username}'s password? They will need to sign in again.`) : text(`更改 ${user.username} 的角色或状态？该成员需要重新登录。`, `Change ${user.username}'s role or status? They will need to sign in again.`)}</p><button type="button" disabled={busy()} onClick={() => apply(user)}>{text("确认", "Confirm")}</button><button type="button" disabled={busy()} onClick={() => setPending(null)}>{text("取消", "Cancel")}</button></div></Show>
    </div>}</For></div>
    <Show when={!busy() && !error() && !filtered().length}><p class="team-help">{text("没有找到成员。", "No members found.")}</p></Show>
    <p class="preference-footnote">{text("所有成员共享看板。管理员可管理账号与恢复历史版本。", "All members share the boards. Administrators can manage accounts and restore revisions.")}</p>
  </div>;
}
