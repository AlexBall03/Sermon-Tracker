import type { Untranslated } from "../../index";
import type { library as english } from "../en/library";

const ideas = (total: number, filtered: boolean) =>
  `${total === 1 ? "idea" : "ideas"}${filtered ? (total === 1 ? " que coincide" : " que coinciden") : ""}`;
const passages = (total: number, filtered: boolean) =>
  total === 1
    ? `pasaje ${filtered ? "que coincide" : "guardado"}`
    : `pasajes ${filtered ? "que coinciden" : "guardados"}`;

export const library: Untranslated<typeof english> = {
  title: "Biblioteca",
  description: "Todas las ideas que has capturado y la Escritura que has guardado.",
  sections: {
    label: "Secciones de la biblioteca",
    ideas: "Ideas",
    scripture: "Escritura guardada",
  },
  search: {
    label: "Buscar ideas",
    landmark: "Buscar en tu biblioteca",
    placeholder: "Buscar títulos, temas y notas...",
    clear: "Borrar la búsqueda",
  },
  toolbar: {
    filters: "Filtros",
    active: " activos",
    sort: "Ordenar ideas",
    manageTags: "Administrar etiquetas",
    view: "Vista de la biblioteca",
    views: { cards: "Vista de tarjetas", list: "Vista de lista" },
  },
  sorts: {
    "updated-desc": "Actualizadas recientemente",
    "updated-asc": "Actualizadas hace más tiempo",
    "created-desc": "Creadas recientemente",
    "created-asc": "Creadas hace más tiempo",
    "title-asc": "Título A–Z",
    "title-desc": "Título Z–A",
  },
  tagModes: { any: "Alguna", all: "Todas" },
  filters: {
    panel: "Filtros",
    kind: "Tipo de idea",
    status: "Estado",
    sermonType: "Tipo de sermón",
    sermonTypeHint: "Solo encuentra ideas de sermón.",
    tags: "Etiquetas",
    noTags:
      "Todavía no tienes etiquetas. Una etiqueta reúne ideas que comparten un tema, una serie o una temporada.",
    createTag: "Crear una etiqueta",
    matchTags: "Coincidir con etiquetas",
    chooseTags: "Elige etiquetas y luego si una idea necesita alguna de ellas o todas.",
    everyTag: "Ideas que tienen todas las etiquetas elegidas.",
    anyTag: "Ideas que tienen al menos una de las etiquetas elegidas.",
    findTag: "Buscar una etiqueta",
    noTagNamed: "Ninguna etiqueta tiene eso en su nombre.",
    tagLimit: (limit) => `La biblioteca se puede filtrar por ${limit} etiquetas a la vez.`,
    created: "Creada",
    changed: "Último cambio",
    from: "Desde",
    to: "Hasta",
    inverted: "Este rango termina antes de empezar, así que ninguna idea puede caer en él.",
    utc: "Las fechas son días completos en UTC, como se muestran en cada idea.",
    clear: "Quitar filtros",
  },
  chips: {
    label: "Filtros activos",
    kind: "Tipo",
    status: "Estado",
    sermonType: "Tipo de sermón",
    tag: "Etiqueta",
    unknownTag: "Etiqueta desconocida",
    created: "Creada",
    changed: "Cambiada",
    range: (from, to) => `del ${from} al ${to}`,
    from: (day) => `desde el ${day}`,
    to: (day) => `hasta el ${day}`,
    remove: (group, label) => `Quitar filtro: ${group} ${label}`,
    allTags: "Coinciden con todas las etiquetas",
    anyTag: "Coinciden con alguna etiqueta",
    clear: "Quitar filtros",
  },
  results: {
    label: "Tus ideas",
    sermonType: "Tipo de sermón:",
    status: "Estado:",
    more: (count) => `y ${count} más`,
    updated: "Actualizada el",
  },
  pagination: {
    label: "Páginas de la biblioteca",
    previous: "Anterior",
    next: "Siguiente",
    pageOf: (page, total) => `Página ${page} de ${total}`,
    page: "Página",
    pageNumber: (page) => `Página ${page}`,
  },
  tags: { label: "Etiquetas", more: " más" },
  count: (total, written, filtered) => `${written} ${ideas(total, filtered)}`,
  showing: (first, last, total, written, filtered) =>
    `Mostrando ${first}–${last} de ${written} ${ideas(total, filtered)}`,
  empty: {
    nothing: "Todavía no hay nada aquí",
    nothingBody:
      "Captura el primer pensamiento que valga la pena guardar. Basta una línea, y después decides si es un sermón o un punto.",
    noFilterMatch: "Ninguna idea coincide con estos filtros",
    noSearchMatch: "Ninguna idea coincide con tu búsqueda",
    impossibleDates:
      "Un rango de fechas termina antes de empezar, así que nada puede caer dentro de él.",
    both: (search) =>
      `Nada en tu biblioteca coincide con “${search}” junto con los filtros que elegiste.`,
    filtersOnly: "Tu biblioteca tiene ideas, pero ninguna cumple todos los filtros que elegiste.",
    searchOnly: (search) =>
      `Nada en tu biblioteca tiene “${search}” en su título, su tema o sus notas.`,
    clearFilters: "Quitar filtros",
    clearSearch: "Borrar la búsqueda",
  },
  saved: {
    metaTitle: "Escritura guardada",
    heading: "Escritura guardada",
    label: "Tu Escritura guardada",
    pages: "Páginas de la Escritura guardada",
    count: (total, written, filtered) => `${written} ${passages(total, filtered)}`,
    showing: (first, last, total, written, filtered) =>
      `Mostrando ${first}–${last} de ${written} ${passages(total, filtered)}`,
    empty: {
      nothing: "Todavía no has guardado Escritura",
      nothingBody:
        "Mientras lees, selecciona un versículo o un pasaje y elige Favorito. Se guarda aquí, con espacio para una etiqueta y tus notas.",
      openBible: "Abrir la Biblia",
      noFilterMatch: "Ningún pasaje coincide con estos filtros",
      noSearchMatch: "Ningún pasaje coincide con tu búsqueda",
      both: (search) =>
        `Nada de lo que has guardado coincide con “${search}” junto con los filtros que elegiste.`,
      fromBook: (book) => `Has guardado Escritura, pero nada de ${book}.`,
      filtersOnly: "Has guardado Escritura, pero nada cumple todos los filtros que elegiste.",
      searchOnly: (search) =>
        `Nada de lo que has guardado tiene “${search}” en su referencia, su etiqueta o sus notas.`,
    },
  },
};
