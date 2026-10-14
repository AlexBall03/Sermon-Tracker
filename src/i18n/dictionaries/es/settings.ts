import type { Untranslated } from "../../index";
import type { settings as english } from "../en/settings";

export const settings: Untranslated<typeof english> = {
  page: {
    title: "Configuración",
    description:
      "Tu perfil, tu idioma y tu Biblia, el aspecto y el funcionamiento de Sermon Tracker en este dispositivo, y cómo inicias sesión.",
  },
  nav: {
    label: "Categorías de configuración",
    back: "Configuración",
    soon: "Pronto",
  },
  categories: {
    profile: {
      title: "Perfil",
      description: "Tu nombre, tu foto y tus correos, y tu iglesia y ministerio.",
    },
    bible: {
      title: "Biblia e idioma",
      description:
        "El idioma en que está escrito Sermon Tracker, la Biblia que lees y cómo se comporta el lector de la Biblia.",
    },
    appearance: {
      title: "Apariencia",
      description: "Claro u oscuro, o según tu dispositivo.",
    },
    app: {
      title: "Aplicación y experiencia",
      description:
        "Instala Sermon Tracker, repite el recorrido por la aplicación o vuelve a configurar la cuenta.",
    },
    offline: {
      title: "Almacenamiento sin conexión",
      description:
        "Lo que este dispositivo guarda para trabajar sin conexión: capturas, descargas de la Biblia y el espacio que ocupan.",
    },
    sync: {
      title: "Sincronización",
      description: "Mantener tu trabajo al día entre dispositivos.",
    },
    account: {
      title: "Cuenta y seguridad",
      description:
        "Tu acceso, tu contraseña, las cuentas conectadas y los dispositivos donde tienes la sesión abierta. Algunos cambios te piden confirmar primero que eres tú.",
    },
  },
  unsaved: "Los cambios de esta página no se han guardado.",
  blocks: {
    ministry: "Iglesia y ministerio",
    ministryDescription:
      "Dónde sirves y qué haces allí. Todo es opcional, solo lo ves tú y no cambia en nada tu acceso.",
    language: "Idioma y traducción",
    languageDescription: "Se guardan en tu cuenta, así que te acompañan en todos tus dispositivos.",
    reader: "Lector de la Biblia",
    readerDescription: "Se guarda en este dispositivo.",
    theme: "Tema",
    setup: "Configuración de la cuenta",
    setupDescription:
      "Repite los pasos de configuración cuando quieras: tu iglesia y ministerio, tu idioma y tu Biblia, y el tema. Nada cambia a menos que tú lo cambies.",
    runSetup: "Configurar la cuenta",
    tour: "Recorrido por la aplicación",
    tourDescription:
      "Un recorrido breve por las páginas principales: el inicio, la captura, la biblioteca, la Biblia, los bosquejos y el registro de predicación. No cambia nada.",
    restartTour: "Repetir el recorrido",
    access: "Tu acceso",
    picture: "Foto",
    name: "Nombre",
    emails: "Correos electrónicos",
    emailsDescription:
      "A tu dirección principal se envían los correos de inicio de sesión y de la cuenta. Una dirección nueva debe verificarse antes de poder usarse.",
    password: "Contraseña",
    connected: "Cuentas conectadas",
    connectedDescription: "Otras formas de iniciar sesión en esta cuenta.",
    devices: "Dispositivos",
    devicesDescription: "Dónde está abierta tu cuenta en este momento.",
  },
  devices: {
    showMore: (count) => `Mostrar ${count} más`,
    showFewer: "Mostrar menos",
    signOutOthers: "Cerrar sesión en los demás dispositivos",
    signOutOthersTitle: "¿Cerrar sesión en los demás dispositivos?",
    signOutOthersDescription: (count) =>
      count === 1
        ? "Se cerrará la sesión de Sermon Tracker en el otro dispositivo, que tendrá que iniciarla de nuevo. Este dispositivo sigue con la sesión abierta."
        : `Se cerrará la sesión de Sermon Tracker en los otros ${count} dispositivos, que tendrán que iniciarla de nuevo. Este dispositivo sigue con la sesión abierta.`,
    signOutOthersConfirm: "Cerrar las demás sesiones",
    signedOutOthers: "Se cerró la sesión en todos los demás dispositivos.",
    signOutOthersFailed: "No se pudo cerrar la sesión en algunos dispositivos. Inténtalo de nuevo.",
  },
  ministry: {
    churchName: "Nombre de la iglesia",
    churchNamePlaceholder: "Iglesia Bautista Gracia",
    ministryRole: "Función en el ministerio",
    ministryRolePlaceholder: "Pastor, evangelista, estudiante de predicación…",
    ministryRoleHint:
      "Con tus propias palabras. Te describe y no cambia lo que puedes hacer en Sermon Tracker.",
    optional: "(opcional)",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Se guardaron los datos de tu iglesia y ministerio.",
    preachingClass: "Asisto a la clase de predicación",
    preachingClassHelp:
      "Ofrece lo que está pensado para la clase de predicación, como sugerir Clase de predicación como contexto al registrar un sermón. Desactivarlo no borra nada de lo que has registrado.",
    preachingClassOn: "Guardado. La clase de predicación está activada.",
    preachingClassOff: "Guardado. La clase de predicación está desactivada.",
    churchTooLong: (limit) => `Usa ${limit} caracteres o menos para el nombre de la iglesia.`,
    roleTooLong: (limit) => `Usa ${limit} caracteres o menos para la función en el ministerio.`,
    invalid: "Esos datos no eran válidos.",
    notSaved: "No se pudieron guardar tus datos. Inténtalo de nuevo.",
    offline: "Eso no llegó al servidor. Revisa tu conexión e inténtalo de nuevo.",
  },
  language: {
    interface: "Idioma de la interfaz",
    interfaceHelp:
      "Menús, botones y mensajes. Lo que tú has escrito nunca se traduce. Al cambiarlo, la traducción de la Biblia cambia con él, y puedes elegir otra abajo.",
    translation: "Traducción de la Biblia",
    follow: (translation) => `Según el idioma de la interfaz (${translation})`,
    translationHelp:
      "La traducción en que se abre la Biblia y la que se cita junto a tus ideas. También puedes cambiarla en el lector y leer dos una al lado de la otra.",
    saved: "Idioma guardado.",
    translationSaved: (translation) => `Tu traducción de la Biblia ahora es la ${translation}.`,
    followSaved: "Tu traducción de la Biblia ahora sigue el idioma de la interfaz.",
    invalid: "Esa opción no era válida.",
    spanishOff: "El español no está disponible en este momento.",
    translationOff: "Esa traducción no está disponible en este momento.",
    notSaved: "No se pudo guardar tu elección. Inténtalo de nuevo.",
    offline: "Eso no llegó al servidor. Revisa tu conexión e inténtalo de nuevo.",
    unavailable:
      "El español está desactivado por ahora, así que Sermon Tracker está en inglés y la Biblia es la King James Version. Lo que elegiste antes se conserva y vuelve cuando vuelva el español.",
  },
  appearance: {
    remembered: "Tu elección se recuerda en este dispositivo.",
    following: "Sigue la configuración de tu dispositivo hasta que elijas una.",
    useDevice: "Usar la configuración del dispositivo",
  },
  bible: {
    copyShortcut: "Atajo para copiar",
    copyKinds: { text: "Texto del versículo", reference: "Referencia", link: "Enlace" },
    copyHelp:
      "Lo que copia Ctrl+C (Comando+C en una Mac) cuando hay versículos seleccionados en la Biblia. La selección se quita una vez copiada. Los botones junto a una selección copian el texto, la referencia o un enlace, sea cual sea la opción elegida aquí.",
  },
  account: {
    role: "Rol",
    administrator: "Administrador",
    standardUser: "Usuario estándar",
    status: "Estado",
    active: "Activa",
    disabled: "Desactivada",
    memberSince: "Miembro desde",
    managed: "Los roles y el acceso los administra un administrador.",
  },
};
