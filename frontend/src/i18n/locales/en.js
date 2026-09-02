export default {
	common: {
		confirm: "Confirm", cancel: "Cancel", card: "Card", lane: "Lane", noTagsFound: "No tags found", close: "Close",
	},
	header: {
		searchPlaceholder: "Search", filterByTag: "Filter by tag", filterNone: "No filter",
		sortBy: "Sort by",
		sort: { manually: "Manually", nameAsc: "Name (A-Z)", nameDesc: "Name (Z-A)", tagsAsc: "Tags (A-Z)", tagsDesc: "Tags (Z-A)", dueAsc: "Due {{date}}", dueDesc: "Due {{date}}", lastUpdated: "Last updated", createdFirst: "Created first" },
		viewMode: "View mode",
		view: { extended: "Extended", regular: "Regular", compact: "Compact", tight: "Tight" },
		newLane: "New lane", newBoard: "New board", toggleSidebar: "Toggle boards sidebar", selectCards: "Select cards", exitSelection: "Exit selection", locale: "Language",
	},
	card: { due: "Due {{date}}" },
	cardName: { rename: "Rename", delete: "Delete", showOptions: "Show options" },
	laneName: { rename: "Rename", deleteCard: "Delete card", deleteLane: "Delete lane", createCard: "Create card", showOptions: "Show options" },
	expandedCard: {
		addTag: "Add tag", changeColor: "Change color", deleteTag: "Delete tag", dueDate: "Due date",
		assign: "Assign", removePerson: "Remove person",
		minimize: "Minimize", expand: "Expand", colorOption: "Color {{n}}", rename: "Click to rename",
		tagError: { duplicate: "Duplicate tag" },
		personError: { duplicate: "Duplicate person" },
	},
	bulk: {
		selected: "{{count}} card selected", selected_plural: "{{count}} cards selected",
		addTags: "Add tags", removeTags: "Remove tags", setDueDate: "Set due date", delete: "Delete", clearSelection: "Clear selection",
		tagSearchPlaceholder: "Search tags", removeTagPlaceholder: "Remove tag", createTag: 'Create "{{tag}}"',
		deleteConfirm: "Delete selected?", deleteConfirm_plural: "Delete selected?",
	},
	validation: {
		mustHaveName: "Name is required", hiddenByDot: "Hidden by dot", duplicateName: "Duplicate name",
		forbiddenChars: "Forbidden characters", noMdExtension: "No .md extension", prohibitedName: "Prohibited name",
	},
	sidebar: {
		title: "Boards", home: "Home", collapse: "Hide boards sidebar", expand: "Show boards sidebar",
		newBoard: "New board", newSubBoard: "New sub-board", rename: "Rename", delete: "Delete board",
		showOptions: "Show options", empty: "No boards yet. Create one to get started!",
	},
	boards: {
		title: "Boards", newBoard: "New board", open: "Open board",
		cardsCount: "{{count}} card", cardsCount_plural: "{{count}} cards",
		boardsCount: "{{count}} board", boardsCount_plural: "{{count}} boards",
	},
	boardEmpty: {
		title: "This board is empty",
		description: "Create a lane to start adding cards, or a sub-board to group related boards.",
		newLane: "New lane", newBoard: "New board",
	},
	editor: {
		write: "Write", preview: "Preview",
		writeMode: "Edit markdown", previewMode: "Preview rendered markdown",
		uploadImage: "Upload image", placeholder: "Write your card in Markdown…",
	},
	people: {
		viewAll: "People", title: "People's TODOs", unassigned: "Unassigned",
		searchPlaceholder: "Search cards", empty: "No cards found", openCard: "Open card",
	},
	keyboard: { title: "Keyboard Shortcuts", sections: { navigation: "Navigation", cardActions: "Card actions", general: "General" }, shortcuts: {} },
}
