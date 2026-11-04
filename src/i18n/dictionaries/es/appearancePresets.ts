import type { Untranslated } from "../../index";
import type { appearancePresets as english } from "../en/appearancePresets";

export const appearancePresets: Untranslated<typeof english> = {
  actions: {
    invalid: "Esa solicitud no era válida.",
    invalidAppearance: "Esa apariencia no se puede guardar como estilo predefinido.",
    tooLarge: (limit: string) =>
      `Esa apariencia supera los ${limit} que puede contener un estilo predefinido.`,
    notFound: "Ese estilo predefinido ya no existe.",
    unreadable: "Ese estilo predefinido no se puede leer.",
    conflict: "Ese estilo predefinido cambió en otro lugar. Revísalo e inténtalo de nuevo.",
    defaultConflict:
      "Tu apariencia predeterminada cambió en otro lugar. Revísala e inténtalo de nuevo.",
    duplicateName: "Ya tienes un estilo predefinido con ese nombre.",
    limitReached: (limit: string) =>
      `Puedes guardar hasta ${limit} estilos predefinidos. Elimina uno para guardar otro.`,
    operationReused: "Esa solicitud ya se usó para otra cosa. Inténtalo de nuevo.",
    accountUnavailable: "Tu cuenta no puede cambiar estilos predefinidos en este momento.",
    failed: "No se pudo guardar ese cambio. Inténtalo de nuevo.",
    created: "Estilo predefinido guardado.",
    renamed: "Estilo predefinido renombrado.",
    replaced: "Estilo predefinido actualizado.",
    deleted: "Estilo predefinido eliminado.",
    deletedDefault:
      "Estilo predefinido eliminado. Tu apariencia predeterminada ahora es Equilibrada.",
    unchanged: "No cambió nada.",
    defaultSaved: "Apariencia predeterminada guardada.",
    loaded: "Estilos predefinidos cargados.",
  },
};
