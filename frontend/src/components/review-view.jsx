import { createSignal, createMemo, onMount, onCleanup, For, Show } from "solid-js";
import { LoadError } from "./load-error";
import { useTeamText } from "../team-session";
import { formatTimestamp } from "../dates";
import { api, apiFetch as fetch } from "../api";
import {
  getTagsFromContent,
  getPeopleFromContent,
  getReviewAtFromContent,
  getDoneAtFromContent,
} from "../card-content-utils";
import { IconEye } from "@stackoverflow/stacks-icons/icons";
import { visibleName } from "../placeholder-id";

/**
 * All cards waiting for acceptance, oldest first so the queue is obvious.
 * Click jumps to the board so the highlighted card is visible in context.
 */
export function ReviewView(props) {
  const text = useTeamText();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [cards, setCards] = createSignal(null);
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

  const reviewCards = createMemo(() => {
    const query = search().trim().toLowerCase();
    return (cards() || [])
      .filter((card) => !getDoneAtFromContent(card.content))
      .map((card) => ({
        ...card,
        reviewAt: getReviewAtFromContent(card.content),
      }))
      .filter((card) => card.reviewAt)
      .filter((card) => {
        if (!query) {
          return true;
        }
        return (
          card.name.toLowerCase().includes(query) ||
          (card.content || "").toLowerCase().includes(query)
        );
      })
      .toSorted((a, b) => a.reviewAt.localeCompare(b.reviewAt));
  });

  return (
    <div class="inbox-view">
      <div class="inbox-view__header">
        <p class="inbox-view__hint">{props.t()("review.hint")}</p>
        <input
          class="search-input"
          placeholder={props.t()("review.searchPlaceholder")}
          type="search"
          value={search()}
          onInput={(e) => setSearch(e.target.value)}
          aria-label={props.t()("review.searchPlaceholder")}
        />
      </div>
      <Show when={error()}><LoadError message={error()} busy={busy()} onRetry={fetchCards} /></Show>
      <Show
        when={cards() !== null}
        fallback={!error() && <div class="inbox-view__empty" role="status">{text("加载中…", "Loading…")}</div>}
      >
        <Show
          when={reviewCards().length}
          fallback={
            <div class="inbox-view__empty" role="status">
              {search().trim() ? text("没有匹配的卡片", "No matching cards") : props.t()("review.empty")}
              <Show when={search().trim()}><button type="button" onClick={() => setSearch("")}>{text("清除搜索", "Clear search")}</button></Show>
            </div>
          }
        >
          <ul class="inbox-view__list">
            <For each={reviewCards()}>
              {(card) => (
                <li>
                  {/* biome-ignore lint/a11y/useSemanticElements: This rich card has button semantics but contains non-phrasing content. */}
                  <div
                    class="inbox-card inbox-card--review"
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
                    <div class="inbox-card__top">
                      <span class="inbox-card__icon" innerHTML={IconEye} />
                      <strong class="inbox-card__name">
                        {visibleName(card.name) || props.t()("common.untitled")}
                      </strong>
                    </div>
                    <div class="inbox-card__meta">
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
                      <span class="inbox-card__when">
                        {props.t()("review.since", {
                          date: formatTimestamp(card.reviewAt, props.locale),
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
                    </Show>                    <button type="button" class="view-locate" onClick={(event) => { event.stopPropagation(); props.onJump(card); }}>{text("定位到看板", "Locate on board")}</button>

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
