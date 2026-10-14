import type { Untranslated } from "../../index";
import type { pwa as english } from "../en/pwa";

export const pwa: Untranslated<typeof english> = {
  offline: {
    title: "Estás sin conexión",
    body: "Sermon Tracker necesita conexión para abrir esta página. No se perdió nada y no se cerró tu sesión: todo lo que guardaste está en el servidor.",
    retry: "Intentar de nuevo",
    waiting: "Esta página volverá a intentarlo sola cuando vuelva la conexión.",
    pageTitle: "Sin conexión",
  },
  install: {
    title: "Instalar la aplicación",
    description:
      "Abre Sermon Tracker desde tu pantalla de inicio, el Dock o tu lista de aplicaciones, en su propia ventana y directo a tu espacio de trabajo. Aún necesita conexión; el trabajo sin conexión todavía no está disponible.",
    installed: "Estás usando la aplicación instalada.",
    justInstalled:
      "Sermon Tracker está instalado. Ábrelo desde tu pantalla de inicio o tu lista de aplicaciones; se abre en tu inicio.",
    button: "Instalar Sermon Tracker",
    installing: "Instalando…",
    dismissed: "No se instaló. Puedes instalarlo cuando quieras.",
    signIn:
      "La primera vez que se abra puede pedirte iniciar sesión, porque algunos dispositivos guardan la sesión de la aplicación instalada aparte de la del navegador.",
    stepsLabel: "Cómo instalarla",
    guides: {
      ios: [
        "Toca el botón Compartir: al pie de la pantalla en Safari, o junto a la dirección en otros navegadores.",
        "Desplázate y toca Agregar a inicio.",
        "Toca Agregar. Sermon Tracker aparece en tu pantalla de inicio.",
      ],
      macSafari: [
        "En la barra de menús de Safari, elige Archivo y luego Agregar al Dock.",
        "Haz clic en Agregar. Sermon Tracker se abre desde el Dock en su propia ventana.",
      ],
      android: [
        "Abre el menú del navegador (⋮).",
        "Elige Instalar aplicación o Agregar a la pantalla principal.",
        "Confirma. Sermon Tracker aparece con tus otras aplicaciones.",
      ],
      desktop: [
        "Haz clic en el icono de instalar a la derecha de la barra de direcciones, o abre el menú del navegador y elige Instalar Sermon Tracker.",
        "Si no aparece ninguno, puede que ya esté instalado: busca Sermon Tracker entre tus aplicaciones.",
      ],
      unknown: [
        "Abre el menú del navegador o el botón Compartir.",
        "Busca Instalar aplicación, Agregar a inicio o Agregar al Dock.",
      ],
    },
    unsupported:
      "Este navegador no puede instalar aplicaciones. Abre Sermon Tracker en Chrome, Edge o Safari para instalarlo.",
  },
  update: {
    title: "Hay una nueva versión de Sermon Tracker.",
    body: "Actualiza para empezar a usarla. La página se recarga una vez.",
    update: "Actualizar",
    updating: "Actualizando…",
    later: "Más tarde",
    unsaved:
      "Parte de tu trabajo aún no está guardado. Guárdalo o deja que termine de guardarse y luego actualiza.",
  },
};
