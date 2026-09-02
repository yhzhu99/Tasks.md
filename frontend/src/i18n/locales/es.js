export default {
	common: {
		confirm: "Confirmar", cancel: "Cancelar", card: "Tarjeta", lane: "Columna", noTagsFound: "No se encontraron etiquetas", close: "Cerrar",
	},
	header: {
		searchPlaceholder: "Buscar", filterByTag: "Filtrar por etiqueta", filterNone: "Sin filtro",
		sortBy: "Ordenar por",
		sort: { manually: "Manual", nameAsc: "Nombre (A-Z)", nameDesc: "Nombre (Z-A)", tagsAsc: "Etiquetas (A-Z)", tagsDesc: "Etiquetas (Z-A)", dueAsc: "Fecha más próxima", dueDesc: "Fecha más lejana", lastUpdated: "Última actualización", createdFirst: "Creado primero" },
		viewMode: "Modo de vista",
		view: { extended: "Extendido", regular: "Regular", compact: "Compacto", tight: "Ajustado" },
		newLane: "Nueva columna", newBoard: "Nuevo tablero", toggleSidebar: "Alternar barra de tableros", selectCards: "Seleccionar tarjetas", exitSelection: "Salir de selección", locale: "Idioma",
	},
	card: { due: "Vencimiento {{date}}" },
	cardName: { rename: "Renombrar", delete: "Eliminar", showOptions: "Mostrar opciones" },
	laneName: { rename: "Renombrar", deleteCard: "Eliminar tarjeta", deleteLane: "Eliminar columna", createCard: "Crear tarjeta", showOptions: "Mostrar opciones" },
	expandedCard: {
		addTag: "Agregar etiqueta", changeColor: "Cambiar color", deleteTag: "Eliminar etiqueta", dueDate: "Fecha de vencimiento",
		minimize: "Minimizar", expand: "Expandir", colorOption: "Color {{n}}", rename: "Clic para renombrar",
		tagError: { duplicate: "Etiqueta duplicada" },
		close: "Cerrar"
	},
	bulk: {
		selected: "{{count}} tarjeta seleccionada", selected_plural: "{{count}} tarjetas seleccionadas",
		addTags: "Agregar etiquetas", removeTags: "Eliminar etiquetas", setDueDate: "Asignar fecha de vencimiento", delete: "Eliminar", clearSelection: "Limpiar selección",
		tagSearchPlaceholder: "Buscar etiquetas", removeTagPlaceholder: "Eliminar etiqueta", createTag: 'Crear "{{tag}}"',
		deleteConfirm: "¿Eliminar seleccionadas?", deleteConfirm_plural: "¿Eliminar seleccionadas?",
	},
	validation: {
		mustHaveName: "El nombre es obligatorio", hiddenByDot: "Oculto por punto", duplicateName: "Nombre duplicado",
		forbiddenChars: "Caracteres prohibidos", noMdExtension: "Sin extensión .md", prohibitedName: "Nombre prohibido",
	},
	sidebar: {
		title: "Tableros", home: "Inicio", collapse: "Ocultar barra de tableros", expand: "Mostrar barra de tableros",
		newBoard: "Nuevo tablero", newSubBoard: "Nuevo subtablero", rename: "Renombrar", delete: "Eliminar tablero",
		showOptions: "Mostrar opciones", empty: "Aún no hay tableros. ¡Crea uno para comenzar!",
	},
	boards: {
		title: "Tableros", newBoard: "Nuevo tablero", open: "Abrir tablero",
		cardsCount: "{{count}} tarjeta", cardsCount_plural: "{{count}} tarjetas",
		boardsCount: "{{count}} tablero", boardsCount_plural: "{{count}} tableros",
	},
	boardEmpty: {
		title: "Este tablero está vacío",
		description: "Crea una columna para empezar a agregar tarjetas, o un subtablero para agrupar tableros relacionados.",
		newLane: "Nueva columna", newBoard: "Nuevo tablero",
	},
	editor: {
		write: "Escribir", preview: "Vista previa",
		writeMode: "Editar markdown", previewMode: "Vista previa del markdown renderizado",
		uploadImage: "Subir imagen", placeholder: "Escribe tu tarjeta en Markdown…",
	},
	keyboard: { title: "Atajos de teclado", sections: { navigation: "Navegación", cardActions: "Acciones de tarjeta", general: "General" }, shortcuts: {} },
}
