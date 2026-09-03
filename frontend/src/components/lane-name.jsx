import { createSignal, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import { Menu } from "./menu";
import { getButtonCoordinates, handleKeyDown } from "../utils";
import { IconPlusSm, IconEllipsisVertical } from '@stackoverflow/stacks-icons/icons'
import { visibleName } from "../placeholder-id";

/**
 *
 * @param {Object} props
 * @param {string} props.name
 * @param {number} props.count
 * @param {Function} props.onRenameBtnClick
 * @param {Function} props.onDelete
 * @param {Function} props.onDragStart
 * @param {Function} props.onCreateNewCardBtnClick
 * @param {Function} props.t
 */
export function LaneName(props) {
	const [showMenu, setShowMenu] = createSignal(false);
	const [menuCoordinates, setMenuCoordinates] = createSignal();

	function startRenamingLane() {
		setShowMenu(false);
		props.onRenameBtnClick();
	}

	function handleCancel() {
		setShowMenu(false);
		setMenuCoordinates(null);
	}

	function handleOptionsBtnClick(e) {
		e.preventDefault();
		e.stopPropagation();
		const coordinates = getButtonCoordinates(e);
		setMenuCoordinates(coordinates);
		setShowMenu(true);
	}

	const menuOptions = createMemo(() => {
		const options = [];
		if (!props.locked) {
			options.push({ label: props.t()('laneName.rename'), onClick: startRenamingLane });
			options.push({
				label: props.t()('laneName.deleteLane'),
				onClick: props.onDelete,
				requiresConfirmation: true,
			});
		}
		return options;
	});

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Native HTML drag events require a draggable element; lane movement also has keyboard shortcuts. */}
			<div
				class="lane__header-name-and-count"
				draggable={true}
				onDragEnter={(e) => e.preventDefault()}
				onDragStart={props.onDragStart}
			>
				<strong class="lane__header-name">
					{visibleName(props.label || props.name) ||
						props.t()("laneName.boardCards") ||
						"Cards"}
				</strong>
				<span class="count-badge">{props.count}</span>
			</div>
			<div class="header-buttons">
				<button
					type="button"
					title={props.t()('laneName.createCard')}
					class="small"
					onClick={() => props.onCreateNewCardBtnClick()}
				>
					<span innerHTML={IconPlusSm} />
				</button>
				<button
					type="button"
					title={props.t()('laneName.showOptions')}
					class="small"
					popoverTarget={`${props.name}-lane-options`}
					onClick={handleOptionsBtnClick}
					onKeyDown={(e) =>
						handleKeyDown(e, () => handleOptionsBtnClick(e, true), handleCancel)
					}
				>
					<span innerHTML={IconEllipsisVertical} />
				</button>
			</div>
			{showMenu() ? (
				<Portal>
					<Menu
						id={`${props.name}-lane-options`}
						open={showMenu()}
						options={menuOptions()}
						onClose={handleCancel}
						x={menuCoordinates()?.x}
						y={menuCoordinates()?.y}
					/>
				</Portal>
			) : null}
		</>
	);
}
