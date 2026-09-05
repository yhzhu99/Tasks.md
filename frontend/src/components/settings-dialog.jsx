import { For } from "solid-js";
import { Portal } from "solid-js/web";
import { IconClear } from "@stackoverflow/stacks-icons/icons";
import { useI18n } from "../i18n";
import { TeamSettings } from "./team-settings";

const VIEW_MODES = ["extended", "regular", "compact", "tight"];
const COLOR_SCHEMES = ["system", "light", "dark"];
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
 * @param {string} props.colorScheme
 * @param {Function} props.onColorSchemeChange
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: The backdrop is an optional pointer target; Escape and the close button provide keyboard access. */}
      <div
        class="dialog-backdrop"
        onPointerDown={handleBackdropClick}
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
            <TeamSettings />
            <fieldset class="settings-dialog__group">
              <legend class="settings-dialog__legend">
                {t()("settings.appearance")}
              </legend>
              <div class="settings-dialog__segmented">
                <For each={COLOR_SCHEMES}>
                  {(scheme) => (
                    <button
                      type="button"
                      class={`settings-dialog__segment ${props.colorScheme === scheme ? "is-active" : ""}`}
                      aria-pressed={props.colorScheme === scheme}
                      onClick={() => props.onColorSchemeChange(scheme)}
                    >
                      {t()(`settings.colorScheme.${scheme}`)}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
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
