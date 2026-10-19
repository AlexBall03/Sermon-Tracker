import type { Untranslated } from "../../index";
import type { legal as english } from "../en/legal";

export const legal: Untranslated<typeof english> = {
  updatedLabel: "Última actualización",
  contactPrompt: "¿Preguntas sobre esta página?",
  contactLink: "Contáctanos",
  privacy: {
    metaTitle: "Política de privacidad",
    metaDescription: "Qué recopila Sermon Tracker, dónde se guarda y cómo eliminarlo.",
    title: "Política de privacidad",
    intro:
      "Sermon Tracker es un espacio de trabajo para predicadores. Esta página explica qué información guarda, por qué, qué servicios la manejan y cómo puedes eliminarla.",
    sections: [
      {
        heading: "Lo que nos das",
        paragraphs: [
          "Tu cuenta: tu nombre, correo electrónico, foto de perfil y datos de inicio de sesión (una contraseña o una cuenta de Google). Los guarda Clerk, nuestro proveedor de inicio de sesión.",
          "Tu trabajo: ideas de sermones y puntos, etiquetas, bosquejos, referencias bíblicas, favoritos y resaltados guardados, tu registro de predicación (fechas, lugares y ocasiones) y las respuestas opcionales de iglesia, función ministerial y clase de predicación de tu perfil.",
          "Tus preferencias: idioma de la interfaz, traducción de la Biblia, opciones de notificación y ajustes similares.",
          "Soporte: los mensajes que envías por Ayuda y comentarios o por el formulario de contacto, las capturas de pantalla que adjuntes y los datos de página y navegador que incluye un informe de error. El formulario de contacto también pide un nombre y un correo para poder responder.",
        ],
      },
      {
        heading: "Lo que se registra automáticamente",
        paragraphs: [
          "Cuando se usa el formulario de contacto público, se guarda un hash unidireccional de la dirección de red del remitente para limitar el abuso. La dirección en sí no se guarda.",
          "Nuestro proveedor de alojamiento conserva registros estándar del servidor. Sermon Tracker no incluye publicidad, analítica ni scripts de seguimiento.",
        ],
      },
      {
        heading: "Cómo se usa",
        paragraphs: [
          "Para que el servicio funcione: mostrarte tu propio trabajo, mantenerlo sincronizado entre tus dispositivos, responder tus mensajes de soporte y enviar las notificaciones y correos que hayas elegido.",
          "Tus ideas, bosquejos y registro de predicación son privados de tu cuenta. Los administradores pueden ver quiénes tienen cuenta y las conversaciones de soporte que se les envían; no tienen una pantalla para leer las ideas o bosquejos de otra cuenta.",
        ],
      },
      {
        heading: "Servicios que la manejan",
        paragraphs: [
          "Clerk (inicio de sesión e identidad de la cuenta), Neon (la base de datos), Vercel (alojamiento y almacenamiento privado de capturas de soporte) y Resend (envío de correos).",
          "Si activas las notificaciones push, las entrega el servicio push de tu navegador (por ejemplo Apple, Google o Mozilla). Un mensaje push contiene solo una línea genérica y un enlace, nunca lo que alguien escribió.",
        ],
      },
      {
        heading: "En tu dispositivo",
        paragraphs: [
          "Las cookies mantienen tu sesión iniciada (Clerk) y recuerdan tu idioma. El almacenamiento de tu navegador guarda tu tema y opciones de visualización y, si usas las funciones sin conexión, el texto bíblico descargado, copias de tus ideas y bosquejos, y los cambios pendientes de enviar.",
          "Puedes borrarlos cuando quieras desde tu navegador. Si lo haces, se pierden los cambios que aún no se hayan enviado.",
        ],
      },
      {
        heading: "Correos y notificaciones",
        paragraphs: [
          "Los correos sobre respuestas y cambios de estado de tus comentarios son opcionales y se pueden desactivar en Configuración, Notificaciones. Los mensajes sobre el inicio de sesión y la seguridad de tu cuenta se envían siempre. Las notificaciones push solo se envían a los dispositivos donde las actives.",
        ],
      },
      {
        heading: "Eliminar tu cuenta",
        paragraphs: [
          "Puedes eliminar tu cuenta cuando quieras en Configuración, Cuenta y seguridad. Esto elimina para siempre tu trabajo, preferencias, conversaciones y capturas de soporte, notificaciones, dispositivos push y tu identidad de inicio de sesión. Las respuestas que un administrador escribió en la conversación de otra persona permanecen en esa conversación, sin su nombre.",
          "Los datos eliminados pueden permanecer por un tiempo limitado en las copias de seguridad de nuestros proveedores antes de sobrescribirse.",
        ],
      },
      {
        heading: "Cambios",
        paragraphs: [
          "Si esta política cambia, la nueva versión se publicará aquí con una nueva fecha.",
        ],
      },
    ],
  },
  terms: {
    metaTitle: "Términos del servicio",
    metaDescription: "Los términos para usar Sermon Tracker.",
    title: "Términos del servicio",
    intro:
      "Estos términos se aplican cuando usas Sermon Tracker. Al crear una cuenta o usar el servicio, los aceptas.",
    sections: [
      {
        heading: "Tu cuenta",
        paragraphs: [
          "Da información correcta al registrarte y no compartas tus datos de inicio de sesión. Eres responsable de lo que ocurra con tu cuenta.",
        ],
      },
      {
        heading: "Tu contenido",
        paragraphs: [
          "Lo que escribes en Sermon Tracker es tuyo. Nos permites guardarlo, procesarlo y mostrarlo solo en la medida necesaria para prestarte el servicio. Puedes eliminarlo, o eliminar tu cuenta entera, cuando quieras.",
        ],
      },
      {
        heading: "Uso aceptable",
        paragraphs: [
          "No uses el servicio para infringir la ley, dañar o acosar a otros, enviar spam o interferir con el servicio o las cuentas de otras personas. No intentes acceder a datos que no son tuyos.",
        ],
      },
      {
        heading: "Textos bíblicos",
        paragraphs: [
          "Las traducciones de la Biblia que muestra Sermon Tracker pertenecen a sus titulares de derechos y se ofrecen para lectura y estudio dentro del servicio.",
        ],
      },
      {
        heading: "El servicio",
        paragraphs: [
          "Trabajamos para que Sermon Tracker esté disponible y tu trabajo esté seguro, pero el servicio se ofrece tal como está, sin garantía de que siempre esté disponible o libre de errores. Guarda tus propias copias de lo que no puedas permitirte perder.",
          "Podemos cambiar o retirar funciones. Podemos suspender o cerrar una cuenta que incumpla estos términos.",
        ],
      },
      {
        heading: "Cambios en estos términos",
        paragraphs: [
          "Si estos términos cambian, la nueva versión se publicará aquí con una nueva fecha. Seguir usando el servicio después significa que los aceptas.",
        ],
      },
    ],
  },
};
