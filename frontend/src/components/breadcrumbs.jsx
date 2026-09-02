import { For, Show, createMemo } from "solid-js";
import { IconHome } from "@stackoverflow/stacks-icons/icons";

/**
 * Clickable breadcrumb navigation: Home / Project / Board.
 *
 * @param {Object} props
 * @param {string} props.currentPath - Raw (decoded) path of the board being viewed ("" is home)
 * @param {string} props.basePath
 * @param {string} props.homeLabel
 * @param {Function} props.onNavigate - (path: string) => void
 */
export function Breadcrumbs(props) {
  const segments = createMemo(() => {
    const raw = (props.currentPath || "").split("/").filter(Boolean);
    let accumulated = "";
    return raw.map((segment) => {
      accumulated += `/${segment}`;
      return { name: segment, path: accumulated };
    });
  });

  return (
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <button
        type="button"
        class="breadcrumbs__segment breadcrumbs__home"
        title={props.homeLabel}
        onClick={() => props.onNavigate("")}
      >
        <span innerHTML={IconHome} />
        <span>{props.homeLabel}</span>
      </button>
      <For each={segments()}>
        {(segment, index) => (
          <>
            <span class="breadcrumbs__separator">/</span>
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
