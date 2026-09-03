import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api";
import {
  getTagsFromContent,
  getPeopleFromContent,
  getReviewAtFromContent,
  getDoneAtFromContent,
} from "../card-content-utils";
import { IconEye } from "@stackoverflow/stacks-icons/icons";
import { visibleName } from "../placeholder-id";

function formatWhen(iso, locale) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * All cards waiting for acceptance, oldest first so the queue is obvious.
 * Click jumps to the board so the highlighted card is visible in context.
 */
export function ReviewView(props) {
  const [cards, setCards] = createSignal(null);
  const [search, setSearch] = createSignal("");

  async function fetchCards() {
    const res = await fetch(`${api}/cards`, { method: "GET", mode: "cors" });
    setCards(await res.json());
  }

  onMount(fetchCards);

  const reviewCards = createMemo(() => {
    const query = search().toLowerCase();
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
      <Show
        when={cards() !== null}
        fallback={<div class="inbox-view__empty">…</div>}
      >
        <Show
          when={reviewCards().length}
          fallback={
            <div class="inbox-view__empty">{props.t()("review.empty")}</div>
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
                    title={props.t()("review.openBoard")}
                    onClick={() => props.onJump(card)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onJump(card);
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
                          date: formatWhen(card.reviewAt, props.locale),
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
