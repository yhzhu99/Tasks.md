import { onMount, onCleanup } from "solid-js";
// biome-ignore lint/correctness/noUnusedImports: Solid consumes clickOutside through the use: directive.
import { handleKeyDown, clickOutside } from "../utils";
import { isPlaceholderId } from "../placeholder-id";

/**
 *
 * @param {Object} props
 * @param {string} props.errorMsg
 * @param {string} props.value
 * @param {string} props.class
 * @param {Function} props.onChange
 * @param {Function} props.onCancel
 * @param {Function} props.onConfirm
 * @param {HTMLElement} props.datalist
 * @param {string} props.list
 * @returns
 */
export function NameInput(props) {
	let inputRef;
	let armed = false;
	let finished = false;

	function typedValue() {
		const value = props.value;
		if (value == null || isPlaceholderId(value)) {
			return "";
		}
		return value;
	}

	onMount(() => {
		inputRef.focus();
		inputRef.setSelectionRange(0, typedValue().length);
		// Ignore the click that opened this input, and remounts from tree
		// refreshes, so an empty blur does not immediately discard the item.
		const timer = setTimeout(() => {
			armed = true;
		}, 250);
		onCleanup(() => clearTimeout(timer));
	});

	function finish(kind) {
		if (finished) {
			return;
		}
		finished = true;
		if (kind === "confirm") {
			props.onConfirm();
			return;
		}
		props.onCancel();
	}

	function handleConfirm() {
		if (!armed || finished) {
			return;
		}
		if (props.errorMsg) {
			return;
		}
		if (!typedValue().trim()) {
			if (props.keepOpenWhenEmpty) {
				return;
			}
			finish("cancel");
			return;
		}
		finish("confirm");
	}

	function handleCancel() {
		if (finished) {
			return;
		}
		finish("cancel");
	}

	function handleClick(e) {
		e.stopPropagation();
	}

	return (
		<div class="input-and-error-msg">
			<input
				ref={(el) => {
					inputRef = el;
				}}
				type="text"
				class={`${props.class ||  ''} ${props.errorMsg ? "input-error" : ""}`}
				value={typedValue()}
				placeholder={props.placeholder || ""}
				onInput={(e) => props.onChange(e.target.value)}
				onFocusOut={handleConfirm}
				use:clickOutside={handleConfirm}
				onKeyDown={(e) => handleKeyDown(e, handleConfirm, handleCancel)}
				onClick={handleClick}
				list={props.list || ''}
			/>
			{props.datalist || null}
			{props.errorMsg ? <span class="error-msg">{props.errorMsg}</span> : null}
		</div>
	);
}
