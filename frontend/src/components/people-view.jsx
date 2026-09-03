import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api";
import {
  getTagsFromContent,
  getPeopleFromContent,
  getDueDateFromContent,
  getDoneAtFromContent,
} from "../card-content-utils";
import { IconPeople } from "@stackoverflow/stacks-icons/icons";
import { visibleName } from "../placeholder-id";

/**
 * Global view of everyone's TODOs: all cards from every board, grouped
 * by assignee ([person:Name] in the card content), sorted by due date.
 * Cards without assignees are listed under "Unassigned".
 *
 * @param {Object} props
 * @param {Function} props.onOpenCard - (card: {name, board}) => void
 * @param {Function} props.t
 * @param {string} props.locale
 */
export function PeopleView(props) {
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

  const filteredCards = createMemo(() => {
    const allCards = (cards() || []).filter(
      (card) => !getDoneAtFromContent(card.content)
    );
    const query = search().toLowerCase();
    if (!query) {
      return allCards;
    }
    return allCards.filter(
      (card) =>
        card.name.toLowerCase().includes(query) ||
        (card.content || "").toLowerCase().includes(query)
    );
  });

  const groups = createMemo(() => {
    const byPerson = new Map();
    for (const card of filteredCards()) {
      const people = getPeopleFromContent(card.content);
      const targets = people.length ? people : [null];
      for (const person of targets) {
        if (!byPerson.has(person)) {
          byPerson.set(person, []);
        }
        byPerson.get(person).push(card);
      }
    }
    const dueSorter = (a, b) => {
      const dueA = getDueDateFromContent(a.content) || "9999-12-31";
      const dueB = getDueDateFromContent(b.content) || "9999-12-31";
      return dueA.localeCompare(dueB);
    };
    return [...byPerson.entries()]
      .map(([person, personCards]) => ({
        person,
        cards: personCards.toSorted(dueSorter),
      }))
      .toSorted((a, b) => {
        if (a.person === null && b.person !== null) return 1;
        if (b.person === null && a.person !== null) return -1;
        return a.person.localeCompare(b.person);
      });
  });

  function dueDateStatusClass(card) {
    const dueDate = getDueDateFromContent(card.content);
    if (!dueDate) {
      return "";
    }
    const todayISO = new Date().toISOString().split("T")[0];
    if (dueDate === todayISO) {
      return "card__due-date--in-time";
    }
    if (dueDate < todayISO) {
      return "card__due-date--past-time";
    }
    return "";
  }

  function formatDueDate(card) {
    const dueDate = getDueDateFromContent(card.content);
    if (!dueDate) {
      return "";
    }
    const [year, month, day] = dueDate.split("-");
    const date = new Date(year, month - 1, day);
    return props
      .t()("card.due", {
        date: date.toLocaleDateString(props.locale === "zh" ? "zh-CN" : "en", {
          month: "short",
          day: "numeric",
        }),
      })
      .toString();
  }

  return (
    <div class="people-view">
      <div class="people-view__header">
        <input
          class="search-input"
          placeholder={props.t()("people.searchPlaceholder")}
          type="search"
          value={search()}
          onInput={(e) => setSearch(e.target.value)}
          aria-label={props.t()("people.searchPlaceholder")}
        />
      </div>
      <Show
        when={cards() !== null}
        fallback={<div class="people-view__empty">…</div>}
      >
        <Show
          when={groups().length}
          fallback={
            <div class="people-view__empty">{props.t()("people.empty")}</div>
          }
        >
          <div class="people-view__groups">
            <For each={groups()}>
              {(group) => (
                <section class="people-group">
                  <header class="people-group__header">
                    <span class="people-group__icon" innerHTML={IconPeople} />
                    <strong class="people-group__name">
                      {group.person ?? props.t()("people.unassigned")}
                    </strong>
                    <span class="count-badge">{group.cards.length}</span>
                  </header>
                  <ul class="people-group__cards">
                    <For each={group.cards}>
                      {(card) => (
                        <li>
                          {/* biome-ignore lint/a11y/useSemanticElements: This rich card has button semantics but contains non-phrasing content. */}
                          <div
                            class="person-card"
                            role="button"
                            tabIndex={0}
                            title={props.t()("people.openCard")}
                            onClick={() => props.onOpenCard(card)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                props.onOpenCard(card);
                              }
                            }}
                          >
                            <div class="person-card__name">
                              {visibleName(card.name) || props.t()("common.untitled")}
                            </div>
                            <div class="person-card__location">
                              <Show when={card.board}>
                                <span>
                                  {decodeURIComponent(card.board)
                                    .split("/")
                                    .filter(Boolean)
                                    .map(
                                      (segment) =>
                                        visibleName(segment) ||
                                        props.t()("common.untitled")
                                    )
                                    .join(" / ")}
                                </span>
                              </Show>
                              <Show when={card.lane}>
                                <span>
                                  {" "}
                                  /{" "}
                                  {visibleName(card.lane) ||
                                    props.t()("common.untitled")}
                                </span>
                              </Show>
                            </div>
                            <Show when={getTagsFromContent(card.content).length}>
                              <ul class="card__tags person-card__tags">
                                <For each={getTagsFromContent(card.content)}>
                                  {(tagName) => (
                                    <li class="tag">
                                      <h5>{tagName}</h5>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                            <h5
                              class={`card__due-date person-card__due-date ${dueDateStatusClass(card)}`}
                            >
                              {formatDueDate(card)}
                            </h5>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
