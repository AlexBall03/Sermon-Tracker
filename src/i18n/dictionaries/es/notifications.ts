import type { Untranslated } from "../../index";
import type { notifications as english } from "../en/notifications";

export const notifications: Untranslated<typeof english> = {
  metaTitle: "Notificaciones",
  title: "Notificaciones",
  description:
    "Respuestas, cambios de estado y comentarios nuevos, de lo más reciente a lo más antiguo.",
  bell: "Notificaciones",
  bellUnread: (count) => `Notificaciones, ${count} sin leer`,
  markAllRead: "Marcar todo como leído",
  viewAll: "Ver todas las notificaciones",
  empty: "Nada nuevo. Aquí se te avisará cuando alguien responda a tus comentarios.",
  error: "No se pudieron cargar las notificaciones. Inténtalo de nuevo en un momento.",
  unread: "Sin leer",
  kinds: {
    reply: (subject) => `Nueva respuesta a «${subject}»`,
    status: (subject, status) => `«${subject}» ahora está: ${status}`,
    new_ticket: (subject) => `Nuevos comentarios: «${subject}»`,
    user_reply: (subject) => `Nueva respuesta del solicitante en «${subject}»`,
    contact: (subject) => `Nuevo mensaje de contacto: «${subject}»`,
  },
  push: {
    title: "Sermon Tracker",
    reply: "Tienes una nueva respuesta a tus comentarios.",
    status: "El estado de tus comentarios ha cambiado.",
    new_ticket: "Han llegado comentarios nuevos.",
    user_reply: "Un solicitante respondió a sus comentarios.",
    contact: "Ha llegado un nuevo mensaje de contacto.",
    test: "Las notificaciones push funcionan en este dispositivo.",
  },
  settings: {
    email: "Correo",
    emailDescription:
      "Correos opcionales sobre tus comentarios. Los mensajes sobre el inicio de sesión y la seguridad de tu cuenta se envían siempre.",
    emailReplies: "Respuestas a mis comentarios",
    emailStatus: "Cambios de estado de mis comentarios",
    push: "Notificaciones push",
    pushDescription:
      "Avisos en los dispositivos donde las actives. Nunca muestran lo que alguien escribió.",
    pushSupport: "Enviar notificaciones de soporte a mis dispositivos",
    devices: "Dispositivos",
    noDevices: "Las notificaciones push aún no están activas en ningún dispositivo.",
    thisDevice: "Este dispositivo",
    enable: "Activar en este dispositivo",
    disable: "Desactivar en este dispositivo",
    removeFrom: (label) => `Quitar ${label}`,
    test: "Enviar notificación de prueba",
    testSent: "Notificación de prueba enviada.",
    testNone: "Ningún dispositivo la recibió. Primero activa push en este dispositivo.",
    enabled: "Las notificaciones push están activas en este dispositivo.",
    disabled: "Las notificaciones push están desactivadas en este dispositivo.",
    removed: "Dispositivo quitado.",
    saved: "Guardado.",
    failed: "No se pudo guardar. Inténtalo de nuevo.",
    denied:
      "Las notificaciones están bloqueadas para este sitio. Permítelas en la configuración del sitio de tu navegador y vuelve a intentarlo.",
    unsupported: "Este navegador no puede recibir notificaciones push.",
    notConfigured: "Las notificaciones push aún no están disponibles.",
    iosInstall:
      "En iPhone y iPad, primero agrega Sermon Tracker a tu pantalla de inicio (Compartir y luego Agregar a inicio) y activa las notificaciones desde la app instalada.",
    addedOn: (date) => `Agregado el ${date}`,
  },
};
