import type { Untranslated } from "../../index";
import type { common as english } from "../en/common";

export const common: Untranslated<typeof english> = {
  cancel: "Cancelar",
  close: "Cerrar",
  working: "Procesando…",
  tryAgain: "Reintentar",
  offline: "Eso no llegó al servidor. Revisa tu conexión e inténtalo de nuevo.",
  invalidRequest: "Esa solicitud no era válida.",
};
