import { onMount, onCleanup } from "solid-js";
import { handleKeyDown, clickOutside } from "../utils";

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

	onMount(() => {
		inputRef.focus();
		inputRef.setSelectionRange(0, (props.value || "").length);
		// Ignore the click that opened this input, and remounts from tree
		// refreshes, so an empty blur does not immediately discard the item.
		const timer = setTimeout(() => {
			armed = true;
		}, 250);
		onCleanup(() => clearTimeout(timer));
	});

	function handleConfirm() {
		if (!armed) {
			return;
		}
		if (props.errorMsg) {
			return;
		}
		if (!(props.value || "").trim()) {
			if (props.keepOpenWhenEmpty) {
				return;
			}
			props.onCancel();
			return;
		}
		props.onConfirm();
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
				value={props.value}
				placeholder={props.placeholder || ""}
				onInput={(e) => props.onChange(e.target.value)}
				onFocusOut={handleConfirm}
				use:clickOutside={handleConfirm}
				onKeyDown={(e) => handleKeyDown(e, handleConfirm, props.onCancel)}
				onClick={handleClick}
				list={props.list || ''}
			/>
			{props.datalist || null}
			{props.errorMsg ? <span class="error-msg">{props.errorMsg}</span> : <></>}
		</div>
	);
}
