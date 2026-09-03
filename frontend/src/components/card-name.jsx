import { createSignal, createMemo } from "solid-js";
import { Menu } from "./menu";
import { getButtonCoordinates, handleKeyDown } from "../utils";
import { Portal } from "solid-js/web";
import { IconEllipsisVertical } from '@stackoverflow/stacks-icons/icons'
import { visibleName } from "../placeholder-id";

/**
 *
 * @param {Object} props
 * @param {string} props.name
 * @param {boolean} props.hasContent
 * @param {Function} props.onRenameBtnClick
 * @param {Function} props.onDelete
 * @param {Function} props.t
 */
export function CardName(props) {
	const [showMenu, setShowMenu] = createSignal(false);
	const [menuCoordinates, setMenuCoordinates] = createSignal();

	function startRenamingCard() {
		setShowMenu(false);
		props.onRenameBtnClick();
	}

	function handleMenuClose() {
		setShowMenu(false);
		setMenuCoordinates(null);
	}

	const menuOptions = createMemo(() => {
		const options = [];
		if (props.priorityAt) {
			options.push({
				label: props.t()("cardName.clearPriority"),
				onClick: props.onClearPriority,
			});
		} else {
			options.push({
				label: props.t()("cardName.markPriority"),
				onClick: props.onMarkPriority,
			});
		}
		if (props.doneAt) {
			options.push({
				label: props.t()("cardName.restore"),
				onClick: props.onRestore,
			});
		} else if (props.reviewAt) {
			options.push({
				label: props.t()("cardName.clearReview"),
				onClick: props.onClearReview,
			});
			options.push({
				label: props.t()("cardName.markDone"),
				onClick: props.onMarkDone,
			});
		} else {
			options.push({
				label: props.t()("cardName.markReview"),
				onClick: props.onMarkReview,
			});
			options.push({
				label: props.t()("cardName.markDone"),
				onClick: props.onMarkDone,
			});
		}
		options.push({ label: props.t()("cardName.rename"), onClick: startRenamingCard });
		options.push({
			label: props.t()("cardName.delete"),
			onClick: props.onDelete,
			requiresConfirmation: true,
		});
		return options;
	});

	function handleClickCardOptions(event, focus) {
		const coordinates = getButtonCoordinates(event);
		setMenuCoordinates(coordinates);
		setShowMenu(true);
		event.stopImmediatePropagation();
		event.stopPropagation();
		event.preventDefault();
	}

	function handleCancel() {
		setShowMenu(false);
	}

	return (
		<>
			<div class="card__name">
				{props.hasContent ? "\uD83D\uDCDD " : ""}
				{visibleName(props.name) || props.t()("common.untitled")}
			</div>
			<div class="header-buttons">
				<button
					type="button"
					title={props.t()('cardName.showOptions')}
					class="small"
					popoverTarget={`${props.name}-card-options`}
					onClick={handleClickCardOptions}
					onKeyDown={(e) =>
						handleKeyDown(
							e,
							() => handleClickCardOptions(e, true),
							handleCancel,
						)
					}
				>
					<span innerHTML={IconEllipsisVertical} />
				</button>
			</div>
			{showMenu() ? (
				<Portal>
					<Menu
						id={`${props.name}-card-options`}
						open={showMenu()}
						options={menuOptions()}
						onClose={handleMenuClose}
						x={menuCoordinates()?.x}
						y={menuCoordinates()?.y}
					/>
				</Portal>
			) : null}
		</>
	);
}
