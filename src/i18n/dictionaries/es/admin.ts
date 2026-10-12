import type { Untranslated } from "../../index";
import type { admin as english } from "../en/admin";

export const admin: Untranslated<typeof english> = {
  page: {
    metaTitle: "Administración",
    title: "Personas y acceso",
    description:
      "Sermon Tracker funciona solo por invitación. Invita a personas aquí y administra sus roles y su acceso.",
    users: "Usuarios",
    identitiesUnavailable:
      "No se pudieron cargar los nombres ni los correos desde el proveedor de inicio de sesión.",
    invitations: "Invitaciones",
    invitationsDescription:
      "La persona invitada recibe un correo con un enlace para crear su cuenta.",
    languages: "Idiomas",
    languagesDescription:
      "El español es la interfaz en español junto con la Biblia Reina-Valera Gómez. El inglés y la King James Version siempre están disponibles.",
  },
  stats: {
    registered: "Usuarios registrados",
    active: "Activos",
    disabled: "Desactivados",
    pending: "Invitaciones pendientes",
  },
  users: {
    caption: "Personas con acceso a Sermon Tracker",
    person: "Persona",
    role: "Rol",
    status: "Estado",
    added: "Agregado",
    actions: "Acciones",
    admin: "Admin",
    user: "Usuario",
    active: "Activa",
    disabled: "Desactivada",
    unknown: "Desconocido",
    thisPerson: "Esta persona",
    you: " (tú)",
    identityRemoved: "Identidad de inicio de sesión eliminada",
    actionsFor: (name) => `Acciones para ${name}`,
    removeAdmin: {
      title: "¿Quitar el acceso de administrador?",
      description: (name) => `${name} ya no podrá invitar a personas ni administrar cuentas.`,
      confirm: "Hacer usuario estándar",
    },
    makeAdmin: {
      title: "¿Hacer administrador a esta persona?",
      description: (name) =>
        `${name} podrá invitar a personas, cambiar roles y desactivar cuentas.`,
      confirm: "Hacer administrador",
    },
    disable: {
      title: "¿Desactivar esta cuenta?",
      description: (name) =>
        `${name} perderá el acceso a Sermon Tracker de inmediato. No se borra nada, y puedes reactivar la cuenta más adelante.`,
      confirm: "Desactivar cuenta",
    },
    enable: {
      title: "¿Reactivar esta cuenta?",
      description: (name) => `${name} podrá volver a usar Sermon Tracker.`,
      confirm: "Reactivar cuenta",
    },
  },
  invitations: {
    email: "Correo electrónico",
    sending: "Enviando…",
    send: "Enviar invitación",
    unavailable:
      "No se pudieron cargar las invitaciones pendientes desde el proveedor de inicio de sesión. Recarga para intentarlo de nuevo.",
    none: "No hay invitaciones pendientes. Escribe un correo arriba para enviar una.",
    pending: "Pendiente",
    sent: "Enviada el",
    resend: "Reenviar",
    resendTo: (email) => `Reenviar la invitación a ${email}`,
    revoke: "Revocar",
    revokeTo: (email) => `Revocar la invitación a ${email}`,
    revokeTitle: "¿Revocar esta invitación?",
    revokeDescription: (email) =>
      `El enlace enviado a ${email} dejará de funcionar. Puedes volver a invitar a esa persona más adelante.`,
    revokeConfirm: "Revocar invitación",
  },
  language: {
    label: "Español",
    on: "Activado",
    off: "Desactivado",
    onDetail:
      "Las personas pueden elegir el español para la interfaz, y leer, buscar y marcar la Reina-Valera Gómez.",
    offDetail:
      "Todos ven Sermon Tracker en inglés y leen la King James Version. No se borran las preferencias, los favoritos ni los resaltados de nadie; vuelven cuando se reactiva el español.",
    turnOffTitle: "¿Desactivar el español para todos?",
    turnOffDescription:
      "La interfaz en español y la Biblia Reina-Valera Gómez dejan de estar disponibles para todas las cuentas a la vez, incluida la tuya. No se borra nada: las preferencias, los favoritos y los resaltados se conservan y vuelven cuando lo reactives.",
    turnOffConfirm: "Desactivar el español",
    turnedOn: "El español está activado.",
    turnedOff: "El español está desactivado. Todos tienen ahora inglés y la King James Version.",
    notSaved: "No se pudo guardar el cambio. Inténtalo de nuevo.",
    offline: "Eso no llegó al servidor. Revisa tu conexión e inténtalo de nuevo.",
  },
  actions: {
    invalid: "Esa solicitud no era válida.",
    ownAccount: "No puedes cambiar tu propia cuenta. Pídeselo a otro administrador.",
    lastAdmin: "Siempre debe haber al menos un administrador activo.",
    userMissing: "Ese usuario ya no existe.",
    notSaved: "No se pudo guardar el cambio. Inténtalo de nuevo.",
    nowAdmin: "El usuario ahora es administrador.",
    nowUser: "El usuario ahora es un usuario estándar.",
    enabled: "Cuenta reactivada.",
    disabled: "Cuenta desactivada.",
    invalidEmail: "Escribe un correo electrónico válido.",
    invited: (email) => `Invitación enviada a ${email}.`,
    notInvited: "No se pudo enviar la invitación. Inténtalo de nuevo.",
    revoked: "Invitación revocada.",
    notRevoked: "No se pudo revocar la invitación. Inténtalo de nuevo.",
    resent: "Invitación enviada de nuevo.",
    notResent: "No se pudo reenviar la invitación. Inténtalo de nuevo.",
  },
};
