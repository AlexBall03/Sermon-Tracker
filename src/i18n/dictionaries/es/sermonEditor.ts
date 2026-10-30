import type { Untranslated } from "../../index";
import type { sermonEditor as english } from "../en/sermonEditor";

export const sermonEditor: Untranslated<typeof english> = {
  header: {
    sermon: "Sermón",
    archived: "Archivado",
    refiled: "Ya no es un sermón",
    more: "Más",
    deleteOutline: "Eliminar bosquejo",
    deleteTitle: "¿Eliminar este bosquejo?",
    deleteBody:
      "Se eliminan el bosquejo y todo lo escrito en él. El sermón se conserva. No se puede deshacer.",
    deleteConfirm: "Eliminar bosquejo",
  },
  opening: {
    title: "Abriendo el bosquejo…",
    converting: "Preparando el bosquejo…",
    convertFailed: "No se pudo abrir el bosquejo. No se cambió nada. Inténtalo de nuevo.",
    stayedLegacy:
      "Este bosquejo se queda en el editor de bosquejos: no puede abrirse en el editor nuevo sin cambiar lo que dice.",
    stayedTooLarge:
      "Este bosquejo se queda en el editor de bosquejos: es demasiado grande para el editor nuevo. No se le quitó nada.",
    queued:
      "Este dispositivo todavía tiene cambios de este bosquejo esperando guardarse, así que se abre en el editor de bosquejos hasta que se guarden.",
    retry: "Intentar de nuevo",
  },
  states: {
    readOnlyTitle: "Este bosquejo está abierto en otra pestaña",
    readOnlyBody:
      "Solo una pestaña puede editar un bosquejo a la vez. Puedes leerlo aquí, o editarlo aquí: la otra pestaña guarda sus cambios primero.",
    editHere: "Editar aquí",
    declinedUnprotected:
      "La otra pestaña tiene cambios que todavía no pudo guardar, así que sigue editando. Inténtalo en un momento.",
    declinedStarting: "La otra pestaña todavía está abriendo el bosquejo. Inténtalo en un momento.",
    unanswered:
      "La otra pestaña no respondió. Puede estar cerrada o en reposo. Cambia a ella, o ciérrala, y vuelve a intentarlo.",
    takeoverPending: "Pidiendo a la otra pestaña que guarde y lo entregue…",
    previewLoading: "Cargando el bosquejo guardado…",
    previewFailed: "No se pudo cargar aquí el bosquejo guardado.",
    offlineTitle: "No se puede conectar con el servidor",
    offlineBody:
      "El bosquejo se abre desde el servidor, así que no se puede abrir sin conexión. No se cambió nada.",
    failedTitle: "No se pudo abrir el bosquejo",
    failedBody: "No se pudo conectar con el servidor. No se cambió nada.",
    unauthorizedTitle: "Vuelve a iniciar sesión",
    unauthorizedBody: "Tu sesión terminó. Inicia sesión de nuevo para abrir este bosquejo.",
    signIn: "Iniciar sesión",
    missingTitle: "Este bosquejo ya no existe",
    missingBody: "Puede que se haya eliminado, en esta pestaña o en otro lugar.",
    backToSermon: "Volver al sermón",
    unreadableTitle: "Este bosquejo no se puede abrir aquí",
    unreadableBody:
      "Lo guardado de este bosquejo no lo puede leer esta versión de la aplicación. Se dejó exactamente como estaba y no se guardará nada encima. Inténtalo después de actualizar la aplicación.",
    lostTitle: "Se dejó de editar",
    lockLost:
      "Esta pestaña perdió el permiso para editar el bosquejo. Tus cambios se guardaron en este dispositivo.",
    reconnect: "Editar aquí otra vez",
    handedOff: "Ahora otra pestaña está editando este bosquejo.",
    identityTitle: "Iniciaste sesión con otra cuenta",
    identityBody:
      "La cuenta cambió mientras el bosquejo estaba abierto, así que se dejó de editar. Tus cambios se guardaron en este dispositivo para la cuenta que los hizo.",
    reload: "Recargar",
    unsupportedTitle: "Este navegador no puede editar bosquejos",
    unsupportedBody:
      "Para editar se necesita un navegador que pueda dejar una sola pestaña a cargo de un bosquejo. Prueba con un navegador actualizado.",
    attachFailed:
      "El editor no abrió el bosquejo exactamente como estaba guardado, así que la edición está desactivada. No se cambió nada. Recarga para intentarlo de nuevo.",
    refused: "El bosquejo guardado no se pudo abrir en el editor. No se cambió nada.",
    tryAgain: "Intentar de nuevo",
  },
  save: {
    label: "Estado del guardado",
    unchanged: "Sin cambios",
    pending: "Guardando en este dispositivo…",
    local: "Guardado en este dispositivo",
    saving: "Guardando…",
    saved: "Guardado",
    offline: "Sin conexión · guardado en este dispositivo",
    unresolved: "Comprobando el último guardado…",
    failed: "No se pudo guardar · reintentando",
    stalled: "No se puede conectar con el servidor",
    conflict: "Cambiado en otro lugar · tu texto está guardado en este dispositivo",
    unauthorized: "Inicia sesión de nuevo para guardar",
    tooLarge: "Demasiado grande para guardar · acórtalo",
    unprotected: "Todavía no está guardado en ningún lugar",
    refused: "No se guardó · tu texto está guardado en este dispositivo",
    tryAgain: "Intentar de nuevo",
    review: "Revisar",
    leave:
      "Tus últimos cambios todavía no están guardados en ningún lugar. Si sales ahora, podrían perderse.",
  },
  recovery: {
    title: "Se encontró trabajo sin guardar",
    body: "Este dispositivo tiene trabajo de este bosquejo que el servidor no tiene. Míralo y decide si conservarlo o descartarlo. No se combina ni se quita nada a menos que tú lo elijas.",
    checking: "Revisando este dispositivo…",
    inspectionFailed:
      "No se pudo leer el trabajo guardado en este dispositivo. No se cambió nada. Inténtalo de nuevo, o cierra antes otras pestañas de la aplicación.",
    units: "Trabajo encontrado en este dispositivo",
    unit: (index: number) => `Trabajo sin guardar ${index}`,
    savedAt: (when: string) => `Último cambio: ${when}`,
    restoredEarlier: "Incluye trabajo restaurado antes",
    conflict: "No se guardó: el bosquejo cambió en otro lugar",
    oversized: "Demasiado grande para guardar hasta que se acorte",
    unreadable: "Esta versión de la aplicación no lo puede leer",
    recovered: "Trabajo sin guardar",
    server: "Guardado en el servidor",
    previewUnavailable: "Este trabajo no se puede mostrar.",
    restore: "Conservar esta versión",
    restoreHint:
      "La abre en el editor. Queda en este dispositivo hasta que se guarde, y la versión del servidor se conserva hasta entonces.",
    resolveOthers:
      "Primero descarta el otro trabajo encontrado. Solo se puede conservar una versión.",
    discard: "Descartar",
    discardTitle: "¿Descartar este trabajo?",
    discardBody:
      "Este trabajo sin guardar se quita de este dispositivo. El bosquejo guardado en el servidor no cambia. No se puede deshacer.",
    discardConfirm: "Descartar",
    restored: "Restaurado. Queda en este dispositivo hasta que se guarde.",
    restoredOversized:
      "Restaurado, pero es demasiado grande para guardarlo. Acórtalo y se guardará.",
    changed: "Algo cambió mientras mirabas. Esto es lo que hay ahora.",
    serverChanged: "El bosquejo se cambió en otro lugar mientras tanto. Esto es lo que hay ahora.",
    storageFailed: "Este dispositivo no pudo guardarlo. No se cambió nada.",
    readFailed: "No se pudo conectar con el servidor. No se cambió nada.",
    failed: "No funcionó. No se cambió nada.",
    retry: "Intentar de nuevo",
  },
  insert: {
    label: "Insertar",
    menu: "Insertar un componente",
    introduction: "Introducción",
    point: "Punto principal",
    subpoint: "Subpunto",
    savedPoint: "Punto guardado…",
    scripture: "Pasaje bíblico…",
    note: "Nota del predicador",
    script: "Guion",
    conclusion: "Conclusión",
    hints: {
      introduction: "Abre el sermón",
      point: "Después del punto actual",
      subpoint: "Dentro del punto actual",
      savedPoint: "Una de tus ideas de punto, por su título",
      scripture: "Su texto, después de esta línea",
      note: "Para ti, no para la congregación",
      script: "Palabras para decir tal como están",
      conclusion: "Cierra el sermón",
    },
    scriptureTitle: "Insertar un pasaje bíblico",
    scriptureLabel: "Cita",
    scripturePlaceholder: "Juan 3:16-18",
    scriptureNowhere: "Aquí no puede ir un pasaje. Pon el cursor en otra línea.",
    scriptureInsert: "Insertar",
    cancel: "Cancelar",
    savedPointDescription:
      "El título del punto se añade a este bosquejo como un punto nuevo. Sus notas y pasajes se quedan en el punto guardado, que no cambia.",
    savedPointAtEnd: "Se añade como punto principal después del último, antes de la conclusión.",
    savedPointRefused:
      "No se pudo añadir aquí. Puede que la edición se haya detenido en esta pestaña o que el lugar sea demasiado profundo.",
    thisPoint: "este punto",
  },
  view: {
    label: "Ver",
    menu: "Opciones de vista",
    expandPoints: "Expandir todos los puntos",
    collapsePoints: "Contraer todos los puntos",
    expandScripture: "Expandir todos los pasajes",
    collapseScripture: "Contraer todos los pasajes",
    collapsePoint: "Contraer punto",
    expandPoint: "Expandir punto",
  },
};
