import { createContext, createSignal, onMount, onCleanup, Show, useContext } from "solid-js";
import { jsonRequest } from "./api";
import { useI18n } from "./i18n";
import "./stylesheets/team.css";

const SessionContext = createContext();
export const useSession = () => useContext(SessionContext);
export function useTeamText() {
  const { locale } = useI18n();
  return (zh, en) => locale() === "zh" ? zh : en;
}

export function PasswordForm(props) {
  const text = useTeamText();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const submit = async (event) => {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) { setError(text("两次输入的密码不同", "Passwords do not match")); return; }
    setBusy(true);
    try {
      const user = await jsonRequest("/auth/password", { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") });
      form.reset(); props.onSuccess(user);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <form class="team-form" onSubmit={submit}>
    <label>{text("当前 / 临时密码", "Current / temporary password")}<input name="currentPassword" type="password" autocomplete="current-password" required /></label>
    <label>{text("新密码", "New password")}<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="256" required /><small>{text("至少 12 个字符，可使用易记的长句。", "At least 12 characters. A memorable phrase works well.")}</small></label>
    <label>{text("确认新密码", "Confirm new password")}<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required /></label>
    <Show when={error()}><p class="team-error" role="alert">{error()}</p></Show>
    <button class="team-primary" disabled={busy()} type="submit">{busy() ? text("正在保存…", "Saving…") : text("设置新密码", "Set new password")}</button>
  </form>;
}

export function SessionGate(props) {
  const text = useTeamText();
  const { locale, setLocale } = useI18n();
  const [user, setUser] = createSignal(null);
  const [site, setSite] = createSignal({ title: "Tasks.md", supportContact: "" });
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [forgot, setForgot] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  async function logout() {
    await jsonRequest("/auth/logout", {}); setUser(null);
  }
  onMount(async () => {
    const expired = () => { setUser(null); setError(text("登录已过期，请重新登录。", "Your session expired. Please sign in again.")); };
    const failed = (event) => setNotice(event.detail.message);
    const rejected = (event) => { if (event.reason?.status) event.preventDefault(); };
    window.addEventListener("tasks-session-expired", expired);
    window.addEventListener("tasks-api-error", failed);
    window.addEventListener("unhandledrejection", rejected);
    onCleanup(() => {
      window.removeEventListener("tasks-session-expired", expired);
      window.removeEventListener("tasks-api-error", failed);
      window.removeEventListener("unhandledrejection", rejected);
    });
    setSite(await jsonRequest("/auth/config"));
    try { setUser(await jsonRequest("/auth/me")); } catch { setError(""); setNotice(""); } finally { setLoading(false); }
  });
  async function login(event) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { setUser(await jsonRequest("/auth/login", Object.fromEntries(data))); setNotice(""); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <SessionContext.Provider value={{ user, setUser, logout }}>
    <Show when={!loading()} fallback={<div class="team-loading" aria-busy="true">{text("正在连接工作区…", "Connecting to your workspace…")}</div>}>
      <Show when={user() && !user().mustChangePassword} fallback={
        <main class="team-login">
          <button class="team-language" onClick={() => setLocale(locale() === "zh" ? "en" : "zh")}>{locale() === "zh" ? "English" : "中文"}</button>
          <div class="team-login__story"><div class="team-eyebrow">{site().title} / WORKSPACE</div><h1>{text("让想法成为进展。", "Make room for progress.")}</h1><p>{text("共享看板，一起编辑，每一步都有迹可循。", "Shared boards. Live collaboration. A history of every step.")}</p><div class="team-login__cards" aria-hidden="true"><span>01 · PLAN</span><span>02 · BUILD</span><span>03 · DONE ✓</span></div></div>
          <section class="team-login__panel">
            <div class="team-eyebrow">TASKS.MD</div>
            <h2>{user() ? text("设置你的个人密码", "Make this account yours") : text("登录团队看板", "Welcome to your workspace")}</h2>
            <p class="team-muted">{user() ? text(`你好，${user().username}。首次登录或重置后，请先更换临时密码。`, `Hello, ${user().username}. Replace your temporary password to continue.`) : text("使用用户名和密码进入工作区。", "Sign in with your username and password.")}</p>
            <Show when={user()} fallback={<>
              <form class="team-form" onSubmit={login}>
                <label>{text("用户名", "Username")}<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" /></label>
                <label>{text("密码", "Password")}<input name="password" type="password" required autocomplete="current-password" /></label>
                <Show when={error()}><p class="team-error" role="alert">{error()}</p></Show>
                <button type="submit" class="team-primary" disabled={busy()}>{busy() ? text("正在登录…", "Signing in…") : text("进入看板 →", "Enter workspace →")}</button>
              </form>
              <button class="team-text-button" onClick={() => setForgot(!forgot())}>{text("忘记密码？", "Forgot your password?")}</button>
              <Show when={forgot()}><p class="team-help">{text("请联系工作区管理员。管理员会在「设置 → 用户管理」为你生成临时密码；登录后即可设置新密码。", "Contact your workspace administrator for a temporary password in Settings → User management. Set a new password after signing in.")} {site().supportContact}</p></Show>
            </>}><PasswordForm onSuccess={setUser} /><button class="team-text-button" onClick={logout}>{text("退出账号", "Sign out")}</button></Show>
          </section>
        </main>
      }>{props.children}</Show>
    </Show>
    <Show when={notice() && user() && !user().mustChangePassword}><div class="team-toast" role="alert"><span>{notice()}</span><button onClick={() => setNotice("")} aria-label={text("关闭提示", "Dismiss")}>×</button></div></Show>
  </SessionContext.Provider>;
}
