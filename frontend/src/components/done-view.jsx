import { createSignal, createMemo, onMount, onCleanup, For, Show } from "solid-js";
import { LoadError } from "./load-error";
import { useTeamText } from "../team-session";
import { formatTimestamp } from "../dates";
import { api, apiFetch as fetch } from "../api";
import {
  getTagsFromContent,
  getPeopleFromContent,
  getDoneAtFromContent,
} from "../card-content-utils";
import { IconArchive } from "@stackoverflow/stacks-icons/icons";
import { visibleName } from "../placeholder-id";

/**
 * Archive of completed cards, newest first.
 */
export function DoneView(props) {
  const text = useTeamText();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [cards, setCards] = createSignal(null);
  const [restoring, setRestoring] = createSignal(null);
  const [search, setSearch] = createSignal("");

  async function fetchCards() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`${api}/cards`, { method: "GET" });
      setCards(await res.json());
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }

  onMount(() => {
    fetchCards();
    window.addEventListener("tasks-refresh-views", fetchCards);
    onCleanup(() => window.removeEventListener("tasks-refresh-views", fetchCards));
  });

  const doneCards = createMemo(() => {
    const query = search().trim().toLowerCase();
    return (cards() || [])
      .map((card) => ({ ...card, doneAt: getDoneAtFromContent(card.content) }))
      .filter((card) => card.doneAt)
      .filter((card) => {
        if (!query) {
          return true;
        }
        return (
          card.name.toLowerCase().includes(query) ||
          (card.content || "").toLowerCase().includes(query)
        );
      })
      .toSorted((a, b) => b.doneAt.localeCompare(a.doneAt));
  });

  return (
    <div class="done-view">
      <div class="done-view__header">
        <input
          class="search-input"
          placeholder={props.t()("done.searchPlaceholder")}
          type="search"
          value={search()}
          onInput={(e) => setSearch(e.target.value)}
          aria-label={props.t()("done.searchPlaceholder")}
        />
      </div>
      <Show when={error()}><LoadError message={error()} busy={busy()} onRetry={fetchCards} /></Show>
      <Show
        when={cards() !== null}
        fallback={!error() && <div class="done-view__empty" role="status">{text("加载中…", "Loading…")}</div>}
      >
        <Show
          when={doneCards().length}
          fallback={
            <div class="done-view__empty" role="status">
              {search().trim() ? text("没有匹配的卡片", "No matching cards") : props.t()("done.empty")}
              <Show when={search().trim()}><button type="button" onClick={() => setSearch("")}>{text("清除搜索", "Clear search")}</button></Show>
            </div>
          }
        >
          <ul class="done-view__list">
            <For each={doneCards()}>
              {(card) => (
                <li>
                  {/* biome-ignore lint/a11y/useSemanticElements: The card contains a nested restore button. */}
                  <div
                    class="done-card"
                    role="button"
                    tabIndex={0}
                    title={props.t()("people.openCard")}
                    onClick={() => props.onOpenCard(card)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        props.onOpenCard(card);
                      }
                    }}
                  >
                    <div class="done-card__top">
                      <span class="done-card__icon" innerHTML={IconArchive} />
                      <strong class="done-card__name">
                        {visibleName(card.name) || props.t()("common.untitled")}
                      </strong>
                    </div>
                    <div class="done-card__meta">
                      <span>
                        <Show when={card.board}>
                          {decodeURIComponent(card.board)
                            .split("/")
                            .filter(Boolean)
                            .map(
                              (segment) =>
                                visibleName(segment) ||
                                props.t()("common.untitled")
                            )
                            .join(" / ")}
                          {" / "}
                        </Show>
                        {card.lane
                          ? visibleName(card.lane) ||
                            props.t()("common.untitled")
                          : ""}
                      </span>
                      <span class="done-card__when">
                        {props.t()("done.completedAt", {
                          date: formatTimestamp(card.doneAt, props.locale),
                        })}
                      </span>
                    </div>
                    <Show when={getPeopleFromContent(card.content).length}>
                      <ul class="card__tags">
                        <For each={getPeopleFromContent(card.content)}>
                          {(person) => (
                            <li class="person">
                              <h5>{person}</h5>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                    <Show when={getTagsFromContent(card.content).length}>
                      <ul class="card__tags">
                        <For each={getTagsFromContent(card.content)}>
                          {(tagName) => (
                            <li class="tag">
                              <h5>{tagName}</h5>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                    <button type="button" class="view-locate" onClick={(event) => { event.stopPropagation(); props.onJump(card); }}>{text("定位到看板", "Locate on board")}</button>
                    <Show when={props.onRestore}>
                      <button
                        type="button"
                        class="done-card__restore"
                        disabled={restoring() === card.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (restoring()) return;
                          setRestoring(card.id);
                          try { await props.onRestore(card); await fetchCards(); }
                          catch (error) { setError(error.message); }
                          finally { setRestoring(null); }
                        }}
                      >
                        {props.t()("done.restore")}
                      </button>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
