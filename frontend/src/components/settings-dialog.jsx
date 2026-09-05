import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { IconArrowLeft, IconGear, IconPerson, IconPeople, IconHistory, IconDownload, IconCode } from "@stackoverflow/stacks-icons/icons";
import { useI18n } from "../i18n";
import { useSession, useTeamText } from "../team-session";
import { AccountSettings, UserSettings, HistoryPanel, DataSettings } from "./team-settings";
import { KeyboardShortcuts } from "./keyboard-navigation-dialog";
import "../stylesheets/preferences.css";

const VIEW_MODES = ["extended", "regular", "compact", "tight"];
const COLOR_SCHEMES = ["system", "light", "dark"];
const LOCALES = [{ id: "en", native: "English" }, { id: "zh", native: "中文" }];

export function SettingsDialog(props) {
  const { t, locale, setLocale } = useI18n();
  const text = useTeamText();
  const session = useSession();
  const [query, setQuery] = createSignal("");
  const [section, setSection] = createSignal(props.initialSection || "general");
  const sections = () => [
    { id: "general", icon: IconGear, name: text("通用", "General"), keywords: "appearance theme language density 外观 主题 语言 密度", hint: text("让工作区符合你的习惯。", "Make this workspace feel like yours.") },
    { id: "account", icon: IconPerson, name: text("账号与安全", "Account & security"), keywords: "password sign out 密码 退出", hint: text("管理个人密码与登录状态。", "Manage your password and sign-in settings.") },
    ...(session.user().admin ? [{ id: "users", icon: IconPeople, name: text("成员管理", "Members"), keywords: "users reset role 用户 重置 权限", hint: text("管理工作区的成员、角色与访问权限。", "Manage workspace members, roles and access.") }] : []),
    { id: "history", icon: IconHistory, name: text("操作历史", "Activity history"), hint: text("了解谁在何时做了什么，查看每次修改。", "See who changed what, and compare revisions.") },
    { id: "data", icon: IconDownload, name: text("数据导出", "Export data"), hint: text("你的内容，随时带走。", "Your work, ready to take with you.") },
    { id: "shortcuts", icon: IconCode, name: text("快捷键", "Keyboard shortcuts"), hint: text("少一点点击，多一点专注。", "Keep your hands on the keyboard.") },
  ];
  const matches = () => sections().filter((item) => `${item.name} ${item.hint} ${item.keywords || ""}`.toLowerCase().includes(query().trim().toLowerCase()));
  const current = () => sections().find((item) => item.id === section()) || sections()[0];
  let dialog, content;
  onMount(() => {
    const opener = document.activeElement;
    dialog.showModal();
    onCleanup(() => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  });
  function selectSection(id) {
    setSection(id);
    content.scrollTop = 0;
  }
  return <Portal>
    <dialog ref={dialog} class="workspace-settings" aria-label={t()("settings.title")}
      onCancel={(event) => { event.preventDefault(); props.onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}>
      <aside class="preferences-nav">
        <button class="preferences-back" type="button" onClick={props.onClose}><span innerHTML={IconArrowLeft} aria-hidden="true" />{text("返回看板", "Back to board")}</button>
        <input class="preferences-search" type="search" aria-label={text("搜索设置", "Search settings")} placeholder={text("搜索设置…", "Search settings…")} value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
        <div class="preferences-nav__heading">{t()("settings.title")}</div>
        <nav aria-label={text("设置分类", "Settings categories")}>
          <For each={matches()}>{(item) => <button type="button" classList={{ "is-active": section() === item.id }} aria-current={section() === item.id ? "page" : undefined} onClick={() => selectSection(item.id)}><span innerHTML={item.icon} aria-hidden="true" /><span>{item.name}</span></button>}</For>
          <Show when={!matches().length}><p class="preference-footnote">{text("没有匹配的设置", "No matching settings")}</p></Show>
        </nav>
        <div class="preferences-identity"><span class="member-avatar" aria-hidden="true">{session.user().username.slice(0, 2).toUpperCase()}</span><div><strong>{session.user().username}</strong><small>{session.user().admin ? text("管理员", "Administrator") : text("成员", "Member")}</small></div></div>
      </aside>
      <div class="preferences-main">
        <header class="preferences-header"><div><h1>{current().name}</h1><p>{current().hint}</p></div><button class="preferences-close" type="button" onClick={props.onClose} aria-label={t()("common.close")} title="Esc"><span aria-hidden="true">×</span></button></header>
        <div class="preferences-content" ref={content}>
          <section hidden={section() !== "general"} aria-label={text("通用设置", "General settings")}>
            <div class="preference-row"><div><h2>{t()("settings.appearance")}</h2><p>{text("选择浅色、深色，或跟随系统。", "Choose a theme, or match your device.")}</p></div>
              <div class="preference-segments"><For each={COLOR_SCHEMES}>{(scheme) => <button type="button" aria-pressed={props.colorScheme === scheme} onClick={() => props.onColorSchemeChange(scheme)}>{t()(`settings.colorScheme.${scheme}`)}</button>}</For></div>
            </div>
            <div class="preference-row"><div><h2>{t()("settings.language")}</h2><p>{text("界面语言，即时生效。", "Your interface language. Changes apply instantly.")}</p></div>
              <select aria-label={t()("settings.language")} value={locale()} onChange={(event) => setLocale(event.currentTarget.value)}><For each={LOCALES}>{(item) => <option value={item.id}>{item.native}</option>}</For></select>
            </div>
            <div class="preference-group"><h2>{t()("settings.viewMode")}</h2><p>{text("在信息量和浏览速度之间，找到合适的平衡。", "Choose how much detail each card shows.")}</p>
              <div class="density-options"><For each={VIEW_MODES}>{(mode, index) => <label class="density-option" classList={{ "is-selected": props.viewMode === mode }}><input type="radio" name="viewMode" value={mode} checked={props.viewMode === mode} onChange={() => props.onViewModeChange(mode)} /><span class={`density-preview density-preview--${mode}`} aria-hidden="true"><span /><For each={Array.from({ length: 4 - index() })}>{() => <i />}</For></span><strong>{t()(`settings.view.${mode}`)}</strong><small>{t()(`settings.view.${mode}Hint`)}</small></label>}</For></div>
            </div>
            <p class="preference-footnote">{text("外观、语言和显示密度自动保存在当前浏览器。", "Appearance, language and density are saved automatically in this browser.")}</p>
          </section>
          <section hidden={section() !== "account"}><AccountSettings /></section>
          <Show when={section() === "users" && session.user().admin}><UserSettings /></Show>
          <Show when={section() === "history"}><HistoryPanel /></Show>
          <Show when={section() === "data"}><DataSettings /></Show>
          <Show when={section() === "shortcuts"}><KeyboardShortcuts t={t} /></Show>
        </div>
      </div>
    </dialog>
  </Portal>;
}
