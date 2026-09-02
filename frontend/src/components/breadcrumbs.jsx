import { For, Show, createMemo } from "solid-js";
import { IconHome } from "@stackoverflow/stacks-icons/icons";

/**
 * Clickable breadcrumb navigation: Home / Project / Board.
 * On the people view it renders Home / People's TODOs.
 * On Home, the Home segment is the page title.
 *
 * @param {Object} props
 * @param {string} props.currentPath
 * @param {string} props.basePath
 * @param {string} props.homeLabel
 * @param {Function} props.onNavigate
 * @param {boolean} [props.peopleActive]
 * @param {string} [props.peopleLabel]
 */
export function Breadcrumbs(props) {
  const segments = createMemo(() => {
    if (props.peopleActive) {
      return [{ name: props.peopleLabel || "People", path: "/_people" }];
    }
    if (props.reviewActive) {
      return [{ name: props.reviewLabel || "Review", path: "/_review" }];
    }
    if (props.doneActive) {
      return [{ name: props.doneLabel || "Done", path: "/_done" }];
    }
    const raw = (props.currentPath || "").split("/").filter(Boolean);
    let accumulated = "";
    return raw.map((segment) => {
      accumulated += `/${segment}`;
      return { name: segment, path: accumulated };
    });
  });

  const isHomeCurrent = createMemo(
    () =>
      !props.peopleActive &&
      !props.reviewActive &&
      !props.doneActive &&
      segments().length === 0
  );

  return (
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <Show
        when={!isHomeCurrent()}
        fallback={
          <h1 class="breadcrumbs__current breadcrumbs__home">
            <span innerHTML={IconHome} />
            <span>{props.homeLabel}</span>
          </h1>
        }
      >
        <button
          type="button"
          class="breadcrumbs__segment breadcrumbs__home"
          title={props.homeLabel}
          onClick={() => props.onNavigate("")}
        >
          <span innerHTML={IconHome} />
          <span>{props.homeLabel}</span>
        </button>
      </Show>
      <For each={segments()}>
        {(segment, index) => (
          <>
            <span class="breadcrumbs__separator" aria-hidden="true">
              /
            </span>
            <Show
              when={index() === segments().length - 1}
              fallback={
                <button
                  type="button"
                  class="breadcrumbs__segment"
                  onClick={() => props.onNavigate(segment.path)}
                >
                  {segment.name}
                </button>
              }
            >
              <h1 class="breadcrumbs__current" title={segment.name}>
                {segment.name}
              </h1>
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}
