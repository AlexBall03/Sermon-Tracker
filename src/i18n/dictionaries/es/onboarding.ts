import type { Untranslated } from "../../index";
import type { onboarding as english } from "../en/onboarding";

export const onboarding: Untranslated<typeof english> = {
  metaTitle: "Configuración de la cuenta",
  progress: {
    label: "Progreso de la configuración",
    position: (step: number, total: number) => `Paso ${step} de ${total}`,
    done: "Hecho",
    current: "Paso actual",
  },
  steps: {
    welcome: "Bienvenida",
    ministry: "Iglesia y ministerio",
    preferences: "Preferencias",
    finish: "Todo listo",
  },
  exit: "Salir de la configuración",
  back: "Atrás",
  continue: "Continuar",
  saving: "Guardando…",
  welcome: {
    eyebrow: "Te damos la bienvenida a Sermon Tracker",
    title: "Un solo lugar para cada sermón que estás preparando",
    body: "Sermon Tracker guarda una idea desde el momento en que te llega hasta el día en que se predica, y la recuerda después.",
    features: [
      {
        title: "Captura",
        body: "Guarda una idea de sermón o un solo punto en segundos, antes de que se olvide.",
      },
      {
        title: "Organiza y retoma",
        body: "Ordena las ideas por estado, etiquétalas y vuelve a las que quedaron esperando.",
      },
      {
        title: "Estudia la Escritura",
        body: "Lee la Biblia, guarda y resalta pasajes, y añádelos a una idea.",
      },
      {
        title: "Bosqueja",
        body: "Dale estructura a un sermón: puntos, subpuntos, notas y pasajes.",
      },
      {
        title: "Registra la predicación",
        body: "Lleva la cuenta de cuándo y dónde se predicó cada sermón.",
      },
    ],
    outlineNote:
      "El bosquejo guarda la estructura de un sermón. No sustituye el lugar donde escribes tu manuscrito.",
    start: "Comenzar",
    lead: "La configuración toma cerca de un minuto. Todos los datos son opcionales.",
  },
  ministry: {
    title: "Tu iglesia y ministerio",
    body: "Cuéntale a Sermon Tracker un poco sobre dónde sirves. Todo es opcional, solo lo ves tú, y puedes dejar cualquier dato en blanco.",
  },
  preferences: {
    title: "Tus preferencias",
    body: "Elige cómo se lee y cómo se ve Sermon Tracker. Puedes dejar los valores como están.",
    language: "Idioma y traducción",
    appearance: "Apariencia",
    appearanceHelp: "Se guarda en este dispositivo, no en tu cuenta.",
    theme: { system: "Sistema", light: "Claro", dark: "Oscuro" },
  },
  finish: {
    title: "Todo está listo",
    body: "Tus datos y preferencias están guardados. Puedes cambiarlos más adelante en Configuración.",
    reviewBody:
      "Lo que cambiaste está guardado. Puedes cambiarlo de nuevo cuando quieras en Configuración.",
    open: "Ir al inicio",
    opening: "Abriendo…",
    settings: "Volver a Configuración",
  },
  actions: {
    invalid: "Ese paso no forma parte de la configuración.",
    notSaved: "No se pudo guardar tu progreso. Inténtalo de nuevo.",
    notReady: "Termina primero los pasos anteriores.",
    progressSaved: "Progreso guardado.",
    completed: "La configuración está completa.",
    offline: "Eso no llegó al servidor. Revisa tu conexión e inténtalo de nuevo.",
  },
};
