import type { Untranslated } from "../../index";
import type { appearancePresets as english } from "../en/appearancePresets";

export const appearancePresets: Untranslated<typeof english> = {
  outcomes: {
    uncertain:
      "No pudimos confirmar ese cambio. Revisa tu conexión e inténtalo de nuevo; volver a intentarlo es seguro.",
    expired:
      "Esa solicitud es demasiado antigua para enviarla de nuevo con seguridad. Revisa tus estilos predefinidos para ver si se guardó.",
    applied: "Listo. El cambio se guardó, aunque su respuesta se perdió en el camino.",
    notApplied: "Ese cambio no se guardó. Inténtalo de nuevo.",
    superseded:
      "Ese estilo predefinido cambió en otro lugar antes de que pudiéramos confirmarlo. Revísalo como está ahora.",
    tryAgain: "Intentar de nuevo",
    reload: "Ver lo más reciente",
  },
  library: {
    title: "Mis estilos predefinidos",
    description:
      "Apariencias que guardaste desde un bosquejo. Aplicar una la copia en el bosquejo: cambiar o eliminar un estilo predefinido después nunca cambia el estilo de un bosquejo ya hecho.",
    defaultTitle: "Predeterminado para bosquejos nuevos",
    defaultHint:
      "Los bosquejos nuevos empiezan con esta apariencia. Los que ya tienes conservan la suya.",
    builtIn: "Incluidos",
    mine: "Mis estilos predefinidos",
    defaultBadge: "Predeterminado",
    basedOn: (preset: string) => `Basado en ${preset}`,
    updated: (date: string) => `Actualizado el ${date}`,
    empty: "Aún no tienes estilos predefinidos",
    emptyBody:
      "Abre un bosquejo, ajústalo en Ajustes del bosquejo → Apariencia y elige Guardar como estilo predefinido. Aparecerá aquí.",
    loading: "Cargando estilos predefinidos…",
    loadFailed: "No se pudieron cargar tus estilos predefinidos.",
    retry: "Intentar de nuevo",
    offline: "No tienes conexión. Los estilos predefinidos necesitan conexión para cambiar.",
    previous: "Anterior",
    next: "Siguiente",
    page: (page: string, pages: string) => `Página ${page} de ${pages}`,
    actions: (name: string) => `Acciones para ${name}`,
    preview: "Vista previa",
    hidePreview: "Ocultar vista previa",
    previewOf: (name: string) => `Vista previa de ${name}`,
    previewLoading: "Cargando vista previa…",
    previewFailed: "No se pudo cargar esta vista previa.",
    previewUnreadable:
      "Este estilo predefinido no se puede leer, así que no se puede mostrar ni aplicar.",
    choosePreview: "Elige Vista previa en un estilo predefinido para verlo aquí.",
    rename: "Cambiar nombre",
    duplicate: "Duplicar",
    makeDefault: "Usar para bosquejos nuevos",
    delete: "Eliminar",
    name: "Nombre",
    save: "Guardar",
    cancel: "Cancelar",
    saving: "Guardando…",
    copyOf: (name: string) => `Copia de ${name}`,
    deleteTitle: (name: string) => `¿Eliminar «${name}»?`,
    deleteBody: "Los bosquejos que ya hiciste con este estilo predefinido conservan su apariencia.",
    deleteDefaultBody:
      "Los bosquejos que ya hiciste con este estilo predefinido conservan su apariencia. Es tu predeterminado para bosquejos nuevos, así que los nuevos empezarán con Equilibrada.",
    deleteConfirm: "Eliminar estilo predefinido",
    updateHint:
      "Para darle otra apariencia a un estilo predefinido, abre un bosquejo, ajústalo en Ajustes del bosquejo → Apariencia y elige Actualizar un estilo predefinido.",
  },
  editor: {
    mine: "Mis estilos predefinidos",
    mineHint: "Verlo en la vista previa no cambia nada hasta que lo apliques.",
    previewIn: (name: string) => `Ver ${name}`,
    previewing: (name: string) => `Viendo «${name}». Aplica para conservarlo, o Cancela.`,
    loading: "Cargando tus estilos predefinidos…",
    loadFailed: "No se pudieron cargar tus estilos predefinidos.",
    none: "Aún no tienes estilos predefinidos. Guarda esta apariencia como el primero.",
    more: "Mostrar más",
    retry: "Intentar de nuevo",
    offline: "No tienes conexión. Los estilos predefinidos necesitan conexión.",
    replaceTitle: "¿Reemplazar tus cambios sin aplicar?",
    replaceBody: (name: string) =>
      `Ver «${name}» reemplaza los cambios de todo el bosquejo que no has aplicado. Los cambios a componentes individuales se conservan. Nada se guarda hasta que lo apliques.`,
    replaceConfirm: "Ver estilo predefinido",
    keepEditing: "Conservar mis cambios",
    unreadable: "Ese estilo predefinido no se puede leer, así que no se puede aplicar.",
    invalid: "Ese estilo predefinido no se puede aplicar a este bosquejo.",
    saveTitle: "Guardar como estilo predefinido",
    saveHint:
      "Guarda la apariencia de la vista previa, con los cambios que no has aplicado, para usarla en otros bosquejos. Este bosquejo no cambia.",
    name: "Nombre del estilo predefinido",
    save: "Guardar estilo predefinido",
    saving: "Guardando…",
    updateTitle: "Actualizar un estilo predefinido",
    updateHint:
      "Reemplaza la apariencia de un estilo predefinido con la de la vista previa. Este bosquejo no cambia.",
    updateChoose: "Estilo predefinido que actualizar",
    update: "Actualizar estilo predefinido…",
    updateConfirmTitle: (name: string) => `¿Reemplazar la apariencia de «${name}»?`,
    updateConfirmBody:
      "Su apariencia guardada se reemplaza con la de la vista previa. Los bosquejos ya hechos con él conservan la suya, y este bosquejo no cambia.",
    updateConfirm: "Reemplazar apariencia",
    updateConflict: (name: string) =>
      `«${name}» cambió en otro lugar desde que lo elegiste. Tu apariencia sigue aquí: revísalo y reemplázalo de nuevo si aún quieres.`,
    replaceAgain: "Reemplazar de nuevo",
    cancel: "Cancelar",
    refusals: {
      conflict:
        "Algunos de tus cambios se hicieron sobre algo que cambió en otro lugar. Resuélvelos primero.",
      orphan: "Algunos cambios son para componentes que ya no están. Descártalos primero.",
      invalid: "Esta apariencia tiene valores que no se pueden guardar.",
      layout_unreadable:
        "La numeración de este bosquejo no se puede leer, así que su apariencia no se puede guardar.",
      no_preset:
        "Esta apariencia no se basa en un estilo predefinido, así que no se puede guardar.",
      too_large: "Esta apariencia es demasiado grande para guardarla como estilo predefinido.",
    },
  },
  actions: {
    invalid: "Esa solicitud no era válida.",
    invalidAppearance: "Esa apariencia no se puede guardar como estilo predefinido.",
    tooLarge: (limit: string) =>
      `Esa apariencia supera los ${limit} que puede contener un estilo predefinido.`,
    notFound: "Ese estilo predefinido ya no existe.",
    unreadable: "Ese estilo predefinido no se puede leer.",
    conflict: "Ese estilo predefinido cambió en otro lugar. Revísalo e inténtalo de nuevo.",
    defaultConflict:
      "Tu apariencia predeterminada cambió en otro lugar. Revísala e inténtalo de nuevo.",
    duplicateName: "Ya tienes un estilo predefinido con ese nombre.",
    limitReached: (limit: string) =>
      `Puedes guardar hasta ${limit} estilos predefinidos. Elimina uno para guardar otro.`,
    operationReused: "Esa solicitud ya se usó para otra cosa. Inténtalo de nuevo.",
    accountUnavailable: "Tu cuenta no puede cambiar estilos predefinidos en este momento.",
    failed: "No se pudo guardar ese cambio. Inténtalo de nuevo.",
    created: "Estilo predefinido guardado.",
    renamed: "Estilo predefinido renombrado.",
    replaced: "Estilo predefinido actualizado.",
    deleted: "Estilo predefinido eliminado.",
    deletedDefault:
      "Estilo predefinido eliminado. Tu apariencia predeterminada ahora es Equilibrada.",
    unchanged: "No cambió nada.",
    defaultSaved: "Apariencia predeterminada guardada.",
    loaded: "Estilos predefinidos cargados.",
  },
};
