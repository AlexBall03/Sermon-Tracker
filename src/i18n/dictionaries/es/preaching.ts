import type { SuggestedContext, TimeOfDay } from "@/features/preaching/model";
import type { Untranslated } from "../../index";
import type { preaching as english } from "../en/preaching";

const suggestedContexts: Record<SuggestedContext, string> = {
  regular_service: "Servicio regular de la iglesia",
  preaching_class: "Clase de predicación",
  conference: "Conferencia / Campamento de predicación",
  special_service: "Servicio especial",
  other: "Otro",
};

const timesOfDay: Record<TimeOfDay, string> = { am: "AM", pm: "PM" };

export const preaching: Untranslated<typeof english> = {
  suggestedContexts,
  timesOfDay,
  timeOfDayMeanings: { am: "Mañana", pm: "Tarde o noche" },
  timeNotSpecified: "Sin especificar",
  actions: {
    invalid: "Esa solicitud no era válida.",
    missing: "Ese registro ya no existe.",
    missingSermon: "Ese sermón ya no existe.",
    notSermon:
      "Solo un sermón puede registrarse como predicado. Primero clasifica esta idea como sermón.",
    unknownVenue: "Ese lugar ya no existe.",
    unknownContext: "Ese contexto ya no existe.",
    recorded: "Añadido a tu historial de predicación.",
    notRecorded: "No se pudo registrar. Inténtalo de nuevo.",
    changesSaved: "Cambios guardados.",
    changesNotSaved: "No se pudieron guardar tus cambios. Inténtalo de nuevo.",
    removed: "Eliminado de tu historial de predicación.",
    notRemoved: "No se pudo eliminar. Inténtalo de nuevo.",
    duplicateVenue: "Ya tienes un lugar con ese nombre.",
    missingVenue: "Ese lugar ya no existe.",
    venueInUse: (count: number) =>
      `Ese lugar está en ${count} ${count === 1 ? "registro" : "registros"} de tu historial y no se puede eliminar.`,
    venueSaved: "Lugar guardado.",
    venueNotSaved: "No se pudo guardar el lugar. Inténtalo de nuevo.",
    venueDeleted: "Lugar eliminado.",
    venueNotDeleted: "No se pudo eliminar el lugar. Inténtalo de nuevo.",
    duplicateContext: "Ya tienes un contexto con ese nombre.",
    missingContext: "Ese contexto ya no existe.",
    contextInUse: (count: number) =>
      `Ese contexto está en ${count} ${count === 1 ? "registro" : "registros"} de tu historial y no se puede eliminar.`,
    contextSaved: "Contexto guardado.",
    contextNotSaved: "No se pudo guardar el contexto. Inténtalo de nuevo.",
    contextDeleted: "Contexto eliminado.",
    contextNotDeleted: "No se pudo eliminar el contexto. Inténtalo de nuevo.",
  },
  validation: {
    tooLong: (limit: string) => `Usa ${limit} caracteres o menos.`,
    chooseSermon: "Elige el sermón que se predicó.",
    dateRequired: "Indica la fecha en que se predicó.",
    dateInvalid: "Eso no es una fecha.",
    dateTooEarly: "Esa fecha es demasiado antigua.",
    dateInFuture: "La fecha no puede estar en el futuro.",
    durationInvalid: "Indica la duración en minutos enteros.",
    durationTooLong: "Eso es más de un día.",
    urlInvalid: "Eso no es un enlace.",
    urlNotHttps: "Usa un enlace que empiece por https://.",
    urlCredentials: "Usa un enlace sin usuario ni contraseña.",
    urlTooLong: (limit: string) => `El enlace debe tener ${limit} caracteres o menos.`,
    venueName: "Ponle un nombre al lugar.",
    venueTooLong: (limit: number) =>
      `El nombre de un lugar debe tener ${limit} caracteres o menos.`,
    contextName: "Ponle un nombre al contexto.",
    contextTooLong: (limit: number) =>
      `El nombre de un contexto debe tener ${limit} caracteres o menos.`,
    nothingToChange: "No hay nada que cambiar.",
  },
};
