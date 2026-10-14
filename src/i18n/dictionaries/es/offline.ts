import type { Untranslated } from "../../index";
import type { offline as english } from "../en/offline";

export const offline: Untranslated<typeof english> = {
  capture: {
    keptTitle: "Guardado en este dispositivo",
    kept: "Tu idea quedó guardada en este dispositivo. Todavía no está en tu cuenta.",
    notKept:
      "No se pudo conectar con el servidor y este dispositivo tampoco pudo guardar tu idea. Sigue aquí; cópiala en un lugar seguro o vuelve a intentarlo.",
  },
  pending: {
    title: "En espera en este dispositivo",
    description:
      "Ideas capturadas cuando no se podía conectar con el servidor. Solo están en este dispositivo hasta que se guarden en tu cuenta.",
    empty: "No hay nada en espera. Todo lo que capturaste está en tu cuenta.",
    badge: "Solo en este dispositivo",
    untitled: "Sin título",
    captured: (when: string) => `Capturada ${when}`,
    save: "Guardar en la cuenta",
    saving: "Guardando…",
    saved: "Guardada en tu cuenta.",
    notSaved: "Todavía no se guardó. Revisa tu conexión y vuelve a intentarlo.",
    delete: "Eliminar",
    deleteTitle: "¿Eliminar esta idea?",
    deleteBody: "No se ha guardado en tu cuenta, así que eliminarla aquí la elimina para siempre.",
    keep: "Conservarla",
    deleteConfirm: "Eliminar para siempre",
    count: (count: number) =>
      count === 1
        ? "1 idea en espera en este dispositivo"
        : `${count} ideas en espera en este dispositivo`,
    review: "Revisar",
    unavailable: "Este navegador no permite que Sermon Tracker guarde nada en este dispositivo.",
  },
  settings: {
    title: "Almacenamiento sin conexión",
    description:
      "Lo que este dispositivo guarda para que puedas trabajar sin conexión. Estas opciones son solo de este dispositivo y este navegador.",
    captureTitle: "Captura rápida",
    captureDescription:
      "Cuando no se pueda conectar con el servidor, guarda lo que captures en este dispositivo en lugar de perderlo.",
    captureSwitch: "Guardar las capturas en este dispositivo sin conexión",
    captureOff:
      "Desactivado, una captura que no llega al servidor se queda en el formulario para que lo intentes de nuevo. Lo que ya está en espera se conserva.",
    bibleTitle: "Traducciones de la Biblia",
    bibleDescription:
      "Una traducción descargada se puede leer sin conexión, en este navegador y en la aplicación instalada.",
    autoSwitch: "Mantener descargada mi traducción de lectura",
    autoDescription: "Se descarga sola en segundo plano, una vez, y de nuevo solo cuando cambia.",
    automatic: "Se mantiene automáticamente",
    status: {
      none: "No descargada",
      downloading: (percent: number) => `Descargando… ${percent} %`,
      paused: "Descarga interrumpida",
      ready: (size: string) => `Descargada · unos ${size}`,
      outdated: "Hay un texto actualizado disponible",
      busy: "Descargando en otra ventana",
    },
    errors: {
      network: "La descarga se detuvo porque se perdió la conexión.",
      quota: "No hay espacio suficiente en este dispositivo. Libera espacio y vuelve a intentarlo.",
      integrity:
        "La descarga no coincidía con el texto publicado, así que no se guardó. Vuelve a intentarlo.",
      unavailable: "Esta traducción no está disponible para tu cuenta en este momento.",
      storage: "Este navegador no permitió guardar la traducción en este dispositivo.",
    },
    download: "Descargar",
    retry: "Reintentar",
    resume: "Reanudar",
    remove: "Quitar",
    removeTitle: (name: string) => `¿Quitar ${name} de este dispositivo?`,
    removeBody:
      "Ya no se podrá leer sin conexión. Tus favoritos, resaltados e ideas no se ven afectados, y puedes volver a descargarla cuando quieras.",
    removeConfirm: "Quitar",
    cancel: "Cancelar",
    moreTitle: "Más contenido sin conexión",
    moreDescription:
      "Llegará en una próxima actualización. Todavía no se guarda nada de esto en este dispositivo.",
    ideas: "Ideas de sermones y puntos",
    outlines: "Bosquejos de sermones",
    later: "Próximamente",
    storageTitle: "Almacenamiento en este dispositivo",
    storageUsage: (used: string, total: string) =>
      `Unos ${used} usados de unos ${total} disponibles`,
    storageUnknown: "Este navegador no indica cuánto espacio tiene.",
    storageLow:
      "A este dispositivo casi no le queda espacio para Sermon Tracker. Las descargas pueden fallar hasta que se libere.",
    storageUnavailable:
      "Este navegador no permite que Sermon Tracker guarde nada en este dispositivo (una ventana privada puede hacerlo). Leer y capturar siguen funcionando con conexión.",
    storageNote: "Quitar una traducción nunca quita las ideas que esperan guardarse.",
  },
  shell: {
    title: "Estás sin conexión",
    body: "Sermon Tracker no puede conectar con el servidor ahora mismo. No se ha cerrado tu sesión.",
    readTitle: "Leer la Biblia",
    readBody: (names: string) => `${names} está en este dispositivo y se puede leer ahora.`,
    read: "Abrir la Biblia",
    noBible:
      "Todavía no hay ninguna traducción descargada en este dispositivo. La próxima vez que tengas conexión, descarga una en Configuración, en Almacenamiento sin conexión.",
    captureTitle: "Capturar una idea",
    captureBody:
      "Se guarda en este dispositivo y se guardará en tu cuenta cuando vuelvas a tener conexión.",
    capture: "Capturar",
    signedOut: "Inicia sesión con conexión para capturar ideas en este dispositivo.",
    back: "Volver",
    readerBadge: "Sin conexión",
  },
  notice: {
    title: "Sermon Tracker ya funciona sin conexión",
    body: "Tu traducción de la Biblia se descarga en este dispositivo para que la leas sin conexión, y lo que captures sin conexión se guarda aquí hasta que se pueda guardar en tu cuenta.",
    manage: "Gestionar el almacenamiento sin conexión",
    dismiss: "Descartar",
  },
};
