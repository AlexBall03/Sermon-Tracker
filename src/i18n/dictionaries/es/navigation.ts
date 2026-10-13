import type { Untranslated } from "../../index";
import type { navigation as english } from "../en/navigation";

export const navigation: Untranslated<typeof english> = {
  dashboard: "Inicio",
  library: "Biblioteca",
  outlines: "Bosquejos",
  bible: "Biblia",
  home: "Inicio de Sermon Tracker",
  application: "Aplicación",
  sections: "Secciones",
  capture: "Capturar",
  captureIdea: "Capturar una idea",
  account: "Cuenta",
  accountMenu: "Menú de la cuenta",
  openAccountMenu: "Abrir el menú de la cuenta",
  closeAccountMenu: "Cerrar el menú de la cuenta",
  settings: "Configuración",
  administration: "Administración",
  signOut: "Cerrar sesión",
  colorTheme: "Tema de color",
  theme: { light: "Claro", dark: "Oscuro" },
  backToTop: "Volver arriba",
  loading: "Cargando",
  dismiss: "Descartar",
  leave: {
    title: "¿Salir sin guardar?",
    stay: "Quedarme en esta página",
    leave: "Salir sin guardar",
  },
  error: {
    title: "Algo salió mal",
    detail:
      "No se pudo cargar esta página. No se cambió nada. Inténtalo de nuevo y, si sigue pasando, avisa a un administrador.",
    retry: "Reintentar",
    dashboard: "Ir al inicio",
    home: "Ir a la página principal",
    reference: "Referencia",
  },
  notFound: {
    code: "404",
    title: "Página no encontrada",
    body: "No hay nada en esta dirección. Puede que esté mal escrita o que la página se haya movido.",
    dashboard: "Ir al inicio",
    home: "Ir a la página principal",
  },
};
