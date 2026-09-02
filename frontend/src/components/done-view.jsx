import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api";
import {
  getTagsFromContent,
  getPeopleFromContent,
  getDoneAtFromContent,
} from "../card-content-utils";
import { IconArchive } from "@stackoverflow/stacks-icons/icons";

function formatDoneAt(iso, locale) {
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
 * Archive of completed cards, newest first.
 */
export function DoneView(props) {
  const [cards, setCards] = createSignal(null);
  const [search, setSearch] = createSignal("");

  async function fetchCards() {
    const res = await fetch(`${api}/cards`, {
      method: "GET",
      mode: "cors",
    });
    setCards(await res.json());
  }

  onMount(fetchCards);

  const doneCards = createMemo(() => {
    const query = search().toLowerCase();
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
      <Show
        when={cards() !== null}
        fallback={<div class="done-view__empty">…</div>}
      >
        <Show
          when={doneCards().length}
          fallback={
            <div class="done-view__empty">{props.t()("done.empty")}</div>
          }
        >
          <ul class="done-view__list">
            <For each={doneCards()}>
              {(card) => (
                <li>
                  <div
                    class="done-card"
                    role="button"
                    tabIndex={0}
                    title={props.t()("done.openCard")}
                    onClick={() => props.onOpenCard(card)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onOpenCard(card);
                      }
                    }}
                  >
                    <div class="done-card__top">
                      <span class="done-card__icon" innerHTML={IconArchive} />
                      <strong class="done-card__name">{card.name}</strong>
                    </div>
                    <div class="done-card__meta">
                      <span>
                        <Show when={card.board}>
                          {decodeURIComponent(card.board).replaceAll("/", " / ")}
                          {" / "}
                        </Show>
                        {card.lane}
                      </span>
                      <span class="done-card__when">
                        {props.t()("done.completedAt", {
                          date: formatDoneAt(card.doneAt, props.locale),
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
                    <Show when={props.onRestore}>
                      <button
                        type="button"
                        class="done-card__restore"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await props.onRestore(card);
                          await fetchCards();
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
