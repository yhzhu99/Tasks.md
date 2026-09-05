import { createSignal, createEffect, onMount, For, Show } from "solid-js";
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
export function HistoryDialog(props) {
  const text = useTeamText();
  const session = useSession();
  const [entries, setEntries] = createSignal([]);
  const [users, setUsers] = createSignal([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [more, setMore] = createSignal(false);
  let filter;
  async function load(append = false) {
    setBusy(true); setError("");
    try {
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
  onMount(async () => { setUsers(await jsonRequest("/auth/users")); await load(); });
  async function restore(entry) {
    if (!confirm(text("恢复此版本？当前内容会保留在历史里。请先关闭这张卡片的所有编辑窗口。", "Restore this revision? Current content stays in history. Close all editors for this card first."))) return;
    setBusy(true); setError("");
    try {
      const cards = await jsonRequest("/cards");
      const current = cards.find((card) => card.id === entry.resource_id);
      await apiFetch(`${api}/history/${entry.id}/restore`, { method: "POST", headers: current ? { "If-Match": current.version } : {} });
      await load();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <Portal><div class="dialog-backdrop" style={{ "z-index": 1100 }} onPointerDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); props.onClose(); } }}>
    <dialog open class="history-dialog" aria-label={text("操作历史", "Activity history")}><div class="dialog__body">
      <div class="history-header"><div><div class="team-eyebrow">ACTIVITY</div><h2>{props.resourceId ? text("卡片历史", "Card history") : text("团队操作历史", "Team activity")}</h2></div><button onClick={props.onClose} aria-label={text("关闭", "Close")}>×</button></div>
      <p class="team-muted">{text("连续编辑按成员合并为版本。展开一条记录，查看修改前后；高亮标出变化区域。", "Consecutive edits are grouped by member. Expand a revision to compare before and after; highlights show the changed region.")}</p>
      <form class="team-filter" ref={filter} onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label>{text("看板 / 卡片", "Board / card")}<input name="search" type="search" placeholder={text("搜索路径", "Search path")} /></label>
        <label>{text("成员", "Member")}<select name="actor"><option value="">{text("所有成员", "Everyone")}</option><option value="migration">{text("迁入数据", "Imported data")}</option><For each={users()}>{(user) => <option value={user.username}>{user.username}</option>}</For></select></label>
        <label>{text("开始日期", "From")}<input type="date" name="from" /></label><label>{text("结束日期", "To")}<input type="date" name="to" /></label>
        <button type="submit" disabled={busy()}>{text("筛选 / 刷新", "Filter / refresh")}</button>
      </form>
      <Show when={error()}><p role="alert" class="team-error">{error()}</p></Show>
      <Show when={!busy() && !entries().length}><p class="team-help">{text("这里还没有记录。试试调整筛选条件。", "No activity here yet. Try adjusting the filters.")}</p></Show>
      <ul class="history-list"><For each={entries()}>{(entry) => <li class="history-entry"><details>
        <summary><strong>{entry.actor === "migration" ? text("初始数据", "Initial data") : entry.actor}</strong> · {text(...(ACTIONS[entry.action] || [entry.action, entry.action]))}<time datetime={entry.updated}>{new Date(entry.updated).toLocaleString()}</time><div class="history-path">{entry.path || "Workspace"}</div></summary>
        <Show when={entry.before !== null || entry.after !== null}><div class="history-diff"><div><small>{text("修改前", "Before")}</small><ChangedText value={entry.before} other={entry.after} /></div><div><small>{text("修改后", "After")}</small><ChangedText value={entry.after} other={entry.before} /></div></div></Show>
        <Show when={session.user().admin && !props.resourceId && entry.path.endsWith(".md") && ["import", "create", "edit", "delete", "restore"].includes(entry.action)}><button disabled={busy()} onClick={() => restore(entry)}>{text("恢复此版本", "Restore revision")}</button></Show>
      </details></li>}</For></ul>
      <Show when={props.resourceId && session.user().admin}><p class="team-muted">{text("需要恢复？关闭卡片后，在设置 → 操作历史中恢复该版本。", "To restore, close this card and open Settings → Activity history.")}</p></Show>
      <Show when={more()}><button disabled={busy()} onClick={() => load(true)}>{text("加载更早记录", "Load earlier activity")}</button></Show>
      <Show when={busy()}><p class="team-muted" role="status">{text("加载中…", "Loading…")}</p></Show>
    </div></dialog>
  </div></Portal>;
}

export function TeamSettings() {
  const text = useTeamText();
  const session = useSession();
  const [history, setHistory] = createSignal(false);
  const [usersOpen, setUsersOpen] = createSignal(false);
  const [password, setPassword] = createSignal(false);
  const [users, setUsers] = createSignal([]);
  const [temporary, setTemporary] = createSignal(null);
  let temporaryPanel;
  createEffect(() => { if (temporary()) queueMicrotask(() => temporaryPanel?.scrollIntoView({ block: "nearest", behavior: "smooth" })); });
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  onMount(async () => setUsers(await jsonRequest("/auth/users")));
  async function reset(username) {
    if (!confirm(text(`为 ${username} 重置密码？其现有登录会立即失效。`, `Reset ${username}'s password? Their current sessions will end immediately.`))) return;
    setBusy(true);
    try { const result = await jsonRequest("/auth/reset", { username }); setTemporary({ username, password: result.temporaryPassword }); }
    finally { setBusy(false); }
  }
  async function createUser(event) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const result = await jsonRequest("/auth/users", values);
      setTemporary({ username: values.username, password: result.temporaryPassword });
      setUsers(await jsonRequest("/auth/users")); form.reset();
    } finally { setBusy(false); }
  }
  async function updateUser(user, changes) {
    if (!confirm(text(`修改 ${user.username} 的权限或状态？该账号需要重新登录。`, `Change ${user.username}'s role or status? They will need to sign in again.`))) return;
    setBusy(true);
    try {
      await jsonRequest("/auth/user", { username: user.username, ...changes });
      setUsers(await jsonRequest("/auth/users"));
    } finally { setBusy(false); }
  }
  return <>
    <section class="team-section"><h3>{text("账号与数据", "Account & data")}</h3><p class="team-muted">{session.user().username} · {session.user().admin ? text("管理员", "Administrator") : text("团队成员", "Team member")}</p>
      <div class="team-actions"><button onClick={() => setHistory(true)}>{text("操作历史", "Activity history")}</button><a href={`${api}/export`} download>{text("导出全部 Markdown", "Export all Markdown")}</a><Show when={session.user().admin}><button onClick={() => setUsersOpen(true)}>{text("用户管理", "User management")}</button></Show><button onClick={() => setPassword(!password())}>{text("修改密码", "Change password")}</button><button onClick={session.logout}>{text("退出登录", "Sign out")}</button></div>
      <Show when={password()}><PasswordForm onSuccess={(user) => { session.setUser(user); setPassword(false); setNotice(text("密码已更新，其他设备已退出。", "Password updated. Other devices have been signed out.")); }} /></Show>
      <Show when={notice()}><p role="status" class="team-help">{notice()}</p></Show>
    </section>
    <Show when={session.user().admin && usersOpen()}><Portal><div class="dialog-backdrop" style={{ "z-index": 1100 }} onPointerDown={(event) => { if (event.target === event.currentTarget) setUsersOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setUsersOpen(false); } }}><dialog open class="history-dialog" aria-label={text("用户管理", "User management")}><div class="dialog__body"><div class="history-header"><h2>{text("用户管理", "User management")}</h2><button onClick={() => { setUsersOpen(false); setTemporary(null); }} aria-label={text("关闭", "Close")}>×</button></div><section><p class="team-muted">{text("忘记密码时，生成临时密码并私下交给该成员。首次使用后必须更换。", "Generate a temporary password and share it privately with the member. They must replace it after signing in.")}</p>
      <form class="team-form" onSubmit={createUser}>
        <label>{text("新账号用户名", "New username")}<input name="username" required minlength="2" maxlength="41" pattern="[a-z][a-z0-9_]{1,40}" placeholder="username" autocomplete="off" /><small>{text("小写字母、数字和下划线，以字母开头。", "Lowercase letters, digits and underscores; start with a letter.")}</small></label>
        <label>{text("角色", "Role")}<select name="role"><option value="member">{text("成员", "Member")}</option><option value="admin">{text("管理员", "Administrator")}</option></select></label>
        <button type="submit" disabled={busy()}>{text("创建账号并生成临时密码", "Create account & temporary password")}</button>
      </form>
      <For each={users()}>{(user) => <div class="team-user"><div><strong>{user.username}</strong><p class="team-muted">{user.admin ? text("管理员", "Administrator") : text("成员", "Member")} · {user.disabled ? text("已停用", "Disabled") : text("已启用", "Active")}</p><div class="team-actions">
        <Show when={user.username !== session.user().username}><button disabled={busy()} onClick={() => reset(user.username)}>{text("重置密码", "Reset password")}</button></Show>
        <button disabled={busy()} onClick={() => updateUser(user, { role: user.admin ? "member" : "admin" })}>{user.admin ? text("设为成员", "Make member") : text("设为管理员", "Make admin")}</button>
        <button disabled={busy()} onClick={() => updateUser(user, { disabled: !user.disabled })}>{user.disabled ? text("启用", "Enable") : text("停用", "Disable")}</button>
      </div></div></div>}</For>
      <Show when={temporary()}><div class="team-temporary" role="status" ref={temporaryPanel}><strong>{temporary().username}</strong><code>{temporary().password}</code><p class="team-muted">{text("临时密码只在本次操作后显示，请通过私密渠道交付。", "This temporary password is shown only after this reset. Share it privately.")}</p><button onClick={async () => { await navigator.clipboard.writeText(temporary().password); setNotice(text("临时密码已复制。", "Temporary password copied.")); }}>{text("复制临时密码", "Copy temporary password")}</button><button onClick={() => setTemporary(null)}>{text("已保存，隐藏", "Hide password")}</button></div></Show>
    </section></div></dialog></div></Portal></Show>
    <Show when={history()}><HistoryDialog onClose={() => setHistory(false)} /></Show>
  </>;
}
