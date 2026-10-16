import type { Untranslated } from "../../index";
import type { auth as english } from "../en/auth";

export const auth: Untranslated<typeof english> = {
  home: "Inicio de Sermon Tracker",
  backHome: "Volver al inicio",
  loading: "Cargando",
  language: "Idioma",
  beta: "Sermon Tracker",
  signIn: {
    metaTitle: "Iniciar sesión",
    unavailableTitle: "El inicio de sesión no está disponible aquí",
    unavailable:
      "La autenticación no se ha configurado para este entorno, así que nadie puede iniciar sesión todavía.",
  },
  signUp: {
    metaTitle: "Crear cuenta",
  },
  invitation: {
    metaTitle: "Aceptar invitación",
    requiredTitle: "Se necesita una invitación",
    required:
      "Las cuentas se crean desde un correo de invitación. Abre el enlace de tu invitación para continuar, o pídele a un administrador que te envíe una nueva si ya venció.",
  },
  denied: {
    metaTitle: "Acceso denegado",
    eyebrow: "Acceso denegado",
    title: "No tienes acceso",
    body: "Tu cuenta no puede abrir esta parte de Sermon Tracker. Si crees que es un error, comunícate con un administrador.",
    dashboard: "Ir al inicio",
    signOut: "Cerrar sesión",
  },
  access: {
    sessionEnded: "Tu sesión terminó. Vuelve a iniciar sesión.",
    noAccess: "Tu cuenta no tiene acceso.",
    adminsOnly: "Solo los administradores pueden hacer eso.",
  },
};
