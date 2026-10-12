import type { Untranslated } from "../../index";
import type { settings as english } from "../en/settings";

export const settings: Untranslated<typeof english> = {
  page: {
    title: "Configuración",
    description: "Tu perfil, cómo inicias sesión, tu idioma y el aspecto de Sermon Tracker.",
  },
  sections: {
    profile: {
      title: "Perfil",
      description: "Cómo apareces en Sermon Tracker y las direcciones de tu cuenta.",
    },
    security: {
      title: "Seguridad",
      description:
        "Tu contraseña, las cuentas conectadas y los dispositivos donde tienes la sesión abierta. Algunos cambios te piden confirmar primero que eres tú.",
    },
    language: {
      title: "Idioma",
      description:
        "El idioma en que está escrito Sermon Tracker y la Biblia que lees. Ambos se guardan en tu cuenta.",
    },
    appearance: {
      title: "Apariencia",
      description: "Claro u oscuro. Es el mismo control que el de la barra.",
    },
    bible: {
      title: "Biblia",
      description: "Cómo se comporta el lector de la Biblia en este dispositivo.",
    },
    account: {
      title: "Cuenta",
      description: "Tu lugar en este espacio de trabajo. Estos datos son de referencia.",
    },
  },
  blocks: {
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
  language: {
    interface: "Idioma de la interfaz",
    interfaceHelp: "Menús, botones y mensajes. Lo que tú has escrito nunca se traduce.",
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
