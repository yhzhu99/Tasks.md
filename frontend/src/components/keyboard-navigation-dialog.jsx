import { Portal } from "solid-js/web";
import { IconClear } from "@stackoverflow/stacks-icons/icons";

export function KeyboardNavigationDialog(props) {
  const t = props.t;
  return (
    <Portal>
      <div class="dialog-backdrop" onClick={() => props.onClose()}>
        <dialog open class="help-dialog" onClick={(e) => e.stopPropagation()}>
          <div class="dialog__body help-dialog__body">
            <div class="help-dialog__header">
              <h2 class="help-dialog__title">{t()("keyboard.title")}</h2>
              <button
                type="button"
                class="dialog__toolbar-btn help-dialog__close-btn"
                onClick={() => props.onClose()}
                title={t()("common.close")}
              >
                <span innerHTML={IconClear} />
              </button>
            </div>

            <div class="help-dialog__sections">
              <div class="help-dialog__section">
                <h3 class="help-dialog__section-title">{t()("keyboard.sections.navigation")}</h3>
                <table class="help-dialog__table">
                  <tbody>
                    <tr>
                      <td class="help-dialog__key-cell">↑ or k</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.up")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">↓ or j</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.down")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">← or h</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.left")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">→ or l</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.right")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">Alt+↑</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.altUp")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">Alt+↓</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.altDown")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">Alt+←</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.altLeft")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">Alt+→</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.altRight")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="help-dialog__section">
                <h3 class="help-dialog__section-title">{t()("keyboard.sections.cardActions")}</h3>
                <table class="help-dialog__table">
                  <tbody>
                    <tr>
                      <td class="help-dialog__key-cell">Enter or e</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.edit")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">n</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.newCard")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">r</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.rename")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">d</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.delete")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="help-dialog__section">
                <h3 class="help-dialog__section-title">{t()("keyboard.sections.general")}</h3>
                <table class="help-dialog__table">
                  <tbody>
                    <tr>
                      <td class="help-dialog__key-cell">b</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.toggleSidebar")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">u</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.parent")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">Esc</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.escape")}</td>
                    </tr>
                    <tr>
                      <td class="help-dialog__key-cell">?</td>
                      <td class="help-dialog__desc-cell">{t()("keyboard.shortcuts.help")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </dialog>
      </div>
    </Portal>
  );
}
