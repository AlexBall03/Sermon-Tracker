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
      "Ideas capturadas o modificadas cuando no se podía conectar con el servidor. Solo están en este dispositivo hasta que se guarden en tu cuenta.",
    empty: "No hay nada en espera. Todo lo que capturaste o modificaste está en tu cuenta.",
    badge: "Solo en este dispositivo",
    untitled: "Sin título",
    captured: (when: string) => `Capturada ${when}`,
    changed: (when: string) => `Modificada ${when}`,
    kinds: {
      "idea.create": "Idea nueva",
      "idea.update": "Editada",
      "idea.archive": "Archivada",
      "idea.restore": "Restaurada",
      "idea.delete": "Eliminada",
    },
    behind: "Espera al cambio anterior en esta idea.",
    conflicts: {
      stale: "Esta idea se modificó en tu cuenta después de que la cambiaras aquí.",
      staleDelete: "Esta idea se modificó en tu cuenta después de que la eliminaras aquí.",
      differs: (fields: string) => `Es distinto allí: ${fields}.`,
      missing: "Esta idea se eliminó de tu cuenta.",
      preached:
        "Ya se predicó, así que no se puede eliminar. Su registro de predicación se conserva.",
      outline: "Ahora tiene un bosquejo, que se eliminaría con ella.",
    },
    fields: {
      title: "título",
      notes: "notas",
      subject: "tema",
      passages: "pasajes",
      tags: "etiquetas",
      classification: "clasificación",
    },
    choices: {
      keepMine: "Conservar mi versión",
      deleteAnyway: "Eliminar de todos modos",
      useAccount: "Usar la versión de mi cuenta",
      discard: "Descartar mis cambios",
      keepIdea: "Conservar la idea",
      saveAsNew: "Guardar como idea nueva",
      archiveInstead: "Archivarla en su lugar",
      deleteWithOutline: "Eliminarla con su bosquejo",
    },
    discard: "Descartar",
    discardTitle: "¿Descartar este cambio?",
    discardBody:
      "No se ha guardado en tu cuenta. Al descartarlo, esta idea vuelve a estar como en tu cuenta, junto con cualquier otro cambio hecho aquí.",
    discardConfirm: "Descartar",
    save: "Guardar ahora",
    saving: "Guardando…",
    retry: "Volver a intentar",
    status: {
      waiting: "En espera de sincronizar",
      sending: "Sincronizando…",
      failed: "Sin guardar",
      conflict: "Necesita tu decisión",
    },
    nextTry: (when: string) => `Se intentará de nuevo ${when}`,
    stopped: "Dejó de intentarlo por sí sola. Revisa tu conexión y vuelve a intentarlo.",
    rejected: "El servidor no la aceptó tal como está. Vuelve a intentarlo o elimínala.",
    missingTags: (count: number) =>
      count === 1
        ? "Una etiqueta que tenía se eliminó después de capturarla."
        : `${count} etiquetas que tenía se eliminaron después de capturarla.`,
    saveWithoutTags: "Guardar sin las etiquetas eliminadas",
    delete: "Eliminar",
    deleteTitle: "¿Eliminar esta idea?",
    deleteBody: "No se ha guardado en tu cuenta, así que eliminarla aquí la elimina para siempre.",
    keep: "Conservarla",
    deleteConfirm: "Eliminar para siempre",
    count: (count: number) =>
      count === 1
        ? "1 cambio en espera en este dispositivo"
        : `${count} cambios en espera en este dispositivo`,
    review: "Revisar",
    unavailable: "Este navegador no permite que Sermon Tracker guarde nada en este dispositivo.",
  },
  sync: {
    statusTitle: "Estado de la sincronización",
    statusDescription:
      "Lo que guardas en este dispositivo sin conexión se guarda en tu cuenta por sí solo cuando se puede conectar con el servidor. Si falla, no se pierde nada.",
    running: "Sincronizando…",
    paused: "En pausa hasta que vuelvas a iniciar sesión.",
    clear: "Todo lo de este dispositivo está en tu cuenta.",
    waiting: (count: number) => `${count} en espera de sincronizar`,
    failed: (count: number) => `${count} sin guardar`,
    conflict: (count: number) => `${count} necesitan tu decisión`,
    lastSync: (when: string) => `Guardado en tu cuenta por última vez ${when}`,
    never: "Todavía no se ha guardado nada desde este dispositivo.",
    now: "Sincronizar ahora",
    queueTitle: "En espera en este dispositivo",
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
    ideasDescription:
      "Una copia de tus ideas en este dispositivo, para leerlas, buscarlas y modificarlas sin conexión. Los cambios se guardan en tu cuenta cuando vuelve la conexión.",
    ideasSwitch: "Guardar mis ideas en este dispositivo",
    ideasOff: "Tus ideas no se guardan en este dispositivo.",
    ideasKept: (count: number, when: string) =>
      `${count === 1 ? "1 idea guardada" : `${count} ideas guardadas`}, actualizadas ${when}.`,
    ideasNever: "Aún no se han descargado. Se descargan solas mientras tienes conexión.",
    ideasDownloading: (have: number, total: number) => `Descargando… ${have} de ${total} ideas.`,
    ideasPartial: (have: number, total: number) =>
      `Por ahora solo hay ${have} de ${total} ideas en este dispositivo.`,
    ideasFailed: "La última actualización no pudo terminar. Se volverá a intentar sola.",
    ideasAuth:
      "La última actualización fue rechazada. Vuelve a iniciar sesión para mantener tus ideas al día.",
    ideasSize: (size: string) => `Unos ${size}.`,
    ideasRefresh: "Actualizar ahora",
    ideasRemove: "Quitar de este dispositivo",
    ideasRemoveTitle: "¿Quitar tus ideas de este dispositivo?",
    ideasRemoveBody:
      "Se quita la copia de este dispositivo; tus ideas siguen en tu cuenta. Las ideas con cambios que esperan sincronizarse se conservan aquí hasta que se guarden.",
    ideasRemoveConfirm: "Quitar",
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
    ideasTitle: "Tus ideas",
    ideasBody: (count: number) =>
      count === 1
        ? "1 idea está guardada en este dispositivo. Léela, búscala y modifícala aquí."
        : `${count} ideas están guardadas en este dispositivo. Léelas, búscalas y modifícalas aquí.`,
    openIdeas: "Abrir tus ideas",
  },
  ideas: {
    copy: (when: string) =>
      `Esta es la copia guardada en este dispositivo, actualizada por última vez ${when}. Lo que cambies aquí se guardará en tu cuenta cuando vuelva la conexión.`,
    copyNever:
      "Esta es la copia guardada en este dispositivo. Lo que cambies aquí se guardará en tu cuenta cuando vuelva la conexión.",
    partial: (have: number, total: number) =>
      `Solo se habían descargado ${have} de ${total} ideas en este dispositivo, así que aquí faltan algunas. Siguen en tu cuenta.`,
    notYet: "Tus ideas aún no están en este dispositivo",
    notYetBody:
      "Se descargan solas mientras tienes la sesión iniciada y conexión. Abre Sermon Tracker cuando estés conectado y estarán aquí la próxima vez.",
    off: "Las ideas no se guardan en este dispositivo",
    offBody:
      "Guardar tus ideas aquí está desactivado en Configuración, en Almacenamiento sin conexión. Actívalo cuando tengas conexión para usarlas sin ella.",
    signedOut: "Inicia sesión con conexión para guardar tus ideas en este dispositivo.",
    empty: "Aún no hay ideas en este dispositivo.",
    missing: "Esta idea no está en este dispositivo",
    missingBody:
      "Puede que se capturara o modificara después de la última descarga de tus ideas en este dispositivo. Sigue en tu cuenta.",
    back: "Volver a tus ideas",
    connection:
      "Las ideas relacionadas, los bosquejos y el registro de predicación necesitan conexión.",
    waiting: (count: number) =>
      count === 1 ? "1 cambio espera sincronizarse." : `${count} cambios esperan sincronizarse.`,
  },
  notice: {
    title: "Sermon Tracker ya funciona sin conexión",
    body: "Tu traducción de la Biblia se descarga en este dispositivo para que la leas sin conexión, y lo que captures sin conexión se guarda aquí hasta que se pueda guardar en tu cuenta.",
    manage: "Gestionar el almacenamiento sin conexión",
    dismiss: "Descartar",
  },
};
