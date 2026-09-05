import { For } from "solid-js";
import { useTeamText } from "../team-session";

const GROUPS = [
  { name: "navigation", keys: [["↑ / K", "up"], ["↓ / J", "down"], ["← / H", "left"], ["→ / L", "right"], ["Alt + ↑", "altUp"], ["Alt + ↓", "altDown"], ["Alt + ←", "altLeft"], ["Alt + →", "altRight"]] },
  { name: "cardActions", keys: [["Enter / E", "edit"], ["N", "newCard"], ["R", "rename"], ["P", "priority"], ["D", "delete"]] },
  { name: "general", keys: [["B", "toggleSidebar"], ["U", "parent"], ["Esc", "escape"], ["?", "help"]] },
];

export function KeyboardShortcuts(props) {
  const text = useTeamText();
  return <div class="shortcut-groups">
    <p class="preference-footnote">{text("在看板上使用；输入文字或编辑卡片时不会触发这些操作。", "Use these on the board. They stay out of the way while you type or edit a card.")}</p>
    <div class="shortcut-row"><span>{text("打开设置", "Open settings")}</span><kbd>Ctrl / ⌘ + ,</kbd></div>
    <div class="shortcut-row"><span>{text("搜索当前看板", "Search this board")}</span><kbd>/</kbd></div>
    <For each={GROUPS}>{(group) => <section class="preference-group"><h2>{props.t()(`keyboard.sections.${group.name}`)}</h2><For each={group.keys}>{([key, action]) => <div class="shortcut-row"><span>{props.t()(`keyboard.shortcuts.${action}`)}</span><kbd>{key}</kbd></div>}</For></section>}</For>
  </div>;
}
