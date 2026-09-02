import { For } from "solid-js";
import { Portal } from "solid-js/web";
import { IconClear } from "@stackoverflow/stacks-icons/icons";
import { useI18n } from "../i18n";

const VIEW_MODES = ["extended", "regular", "compact", "tight"];
const LOCALES = [
  { id: "en", native: "English" },
  { id: "zh", native: "中文" },
];

/**
 * App settings: card density and language.
 *
 * @param {Object} props
 * @param {string} props.viewMode
 * @param {Function} props.onViewModeChange
 * @param {Function} props.onClose
 */
export function SettingsDialog(props) {
  const { t, locale, setLocale } = useI18n();

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  }

  return (
    <Portal>
      <div
        class="dialog-backdrop"
        onClick={handleBackdropClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.onClose();
          }
        }}
      >
        <dialog
          open
          class="settings-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="dialog__body settings-dialog__body">
            <div class="settings-dialog__header">
              <h2 class="settings-dialog__title">
                {t()("settings.title")}
              </h2>
              <button
                type="button"
                class="dialog__toolbar-btn"
                onClick={props.onClose}
                title={t()("common.close")}
              >
                <span innerHTML={IconClear} />
              </button>
            </div>
            <fieldset class="settings-dialog__group">
              <legend class="settings-dialog__legend">
                {t()("settings.language")}
              </legend>
              <div class="settings-dialog__segmented">
                <For each={LOCALES}>
                  {(item) => (
                    <button
                      type="button"
                      class={`settings-dialog__segment ${locale() === item.id ? "is-active" : ""}`}
                      aria-pressed={locale() === item.id}
                      onClick={() => setLocale(item.id)}
                    >
                      {item.native}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
            <fieldset class="settings-dialog__group">
              <legend class="settings-dialog__legend">
                {t()("settings.viewMode")}
              </legend>
              <For each={VIEW_MODES}>
                {(mode) => (
                  <label class="settings-dialog__option">
                    <input
                      type="radio"
                      name="viewMode"
                      value={mode}
                      checked={props.viewMode === mode}
                      onChange={() => props.onViewModeChange(mode)}
                    />
                    <span class="settings-dialog__option-copy">
                      <strong>{t()(`settings.view.${mode}`)}</strong>
                      <small>
                        {t()(`settings.view.${mode}Hint`)}
                      </small>
                    </span>
                  </label>
                )}
              </For>
            </fieldset>
          </div>
        </dialog>
      </div>
    </Portal>
  );
}
