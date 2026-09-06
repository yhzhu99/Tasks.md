import { createSignal, onMount, onCleanup } from "solid-js";

export const WORKSPACE_TIME_ZONE = "Asia/Shanghai";

export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKSPACE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function useShanghaiToday() {
  const [today, setToday] = createSignal(shanghaiDate());
  onMount(() => {
    const refresh = () => setToday(shanghaiDate());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    onCleanup(() => { clearInterval(timer); window.removeEventListener("focus", refresh); });
  });
  return today;
}

export function dueStatus(date, today) {
  if (!date) return "";
  return date < today ? "overdue" : date === today ? "today" : "";
}

export function formatDueDate(date, locale) {
  if (!date) return "";
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en", {
    timeZone: WORKSPACE_TIME_ZONE, year: "numeric", month: "short", day: "numeric",
  });
}

export function formatTimestamp(value, locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en", {
    timeZone: WORKSPACE_TIME_ZONE, year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
