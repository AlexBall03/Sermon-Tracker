import type { Untranslated } from "../../index";
import type { outlines as english } from "../en/outlines";

export const outlines: Untranslated<typeof english> = {
  validation: {
    titleTooLong: (limit: number) => `Un encabezado puede tener hasta ${limit} caracteres.`,
    notesTooLong: (limit: string) => `Las notas pueden tener hasta ${limit} caracteres.`,
    tooManyReferences: (limit: number) => `Un punto puede tener hasta ${limit} pasajes.`,
    numbering: "No se pudo usar ese estilo de numeración.",
    nothingToSave: "No había nada que guardar.",
  },
  actions: {
    invalid: "Esa solicitud no era válida.",
    missing: "Ese bosquejo ya no existe.",
    missingSermon: "Ese sermón ya no existe.",
    notSermon: "Solo un sermón puede tener un bosquejo. Primero clasifica esta idea como sermón.",
    exists: "Este sermón ya tiene un bosquejo.",
    created: "Bosquejo creado.",
    notCreated: "No se pudo crear el bosquejo. Inténtalo de nuevo.",
    deleted: "Bosquejo eliminado. El sermón se conservó.",
    notDeleted: "No se pudo eliminar el bosquejo. Inténtalo de nuevo.",
    numberingSaved: "Numeración guardada.",
    notSaved: "No se pudieron guardar tus cambios. Inténtalo de nuevo.",
    missingEntry: "Esa parte del bosquejo ya no existe.",
    stale: "Este bosquejo se cambió en otro lugar. Vuelve a cargarlo para continuar.",
    staleEntry:
      "Esta parte del bosquejo se cambió en otro lugar. Vuelve a cargarla para continuar.",
    invalidParent: "Un punto solo puede colocarse bajo otro punto del mismo bosquejo.",
    introductionExists: "Este bosquejo ya tiene una introducción.",
    conclusionExists: "Este bosquejo ya tiene una conclusión.",
    sectionFixed: "La introducción y la conclusión no se pueden mover.",
    cycle: "Un punto no puede colocarse bajo sí mismo ni bajo uno de sus propios subpuntos.",
    full: (limit: number) => `Un bosquejo puede tener hasta ${limit} entradas.`,
    unknownSource: "Esa idea de punto ya no existe.",
    entryAdded: "Añadido al bosquejo.",
    entrySaved: "Guardado.",
    entryMoved: "Movido.",
    entryRemoved: "Eliminado del bosquejo.",
    referencesSaved: "Pasajes guardados.",
  },
};
