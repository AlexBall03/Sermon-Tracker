import type { Untranslated } from "../../index";
import type { tour as english } from "../en/tour";

export const tour: Untranslated<typeof english> = {
  invitation: {
    label: "Recorrido por la aplicación",
    title: "Haz un recorrido rápido",
    body: "Siete paradas breves por la aplicación real: tu inicio, cómo capturar una idea, la biblioteca, la Biblia, los bosquejos y tu registro de predicación. Toma unos dos minutos y no cambia nada.",
    optional:
      "Es opcional. Elige Más tarde y no volverá a preguntar; puedes iniciarlo cuando quieras desde Configuración.",
    start: "Hacer el recorrido",
    later: "Más tarde",
  },
  overlay: {
    label: "Recorrido por la aplicación",
    progress: (step: number, total: number) => `Paso ${step} de ${total}`,
    announce: (step: number, total: number, title: string) => `Paso ${step} de ${total}: ${title}`,
    back: "Atrás",
    next: "Siguiente",
    skip: "Saltar recorrido",
    finish: "Terminar recorrido",
    opening: "Abriendo la página…",
  },
  steps: {
    dashboard: {
      title: "Tu inicio",
      body: "Este es tu espacio de trabajo: el lugar para retomar lo que estás desarrollando y ver lo que has capturado y predicado.",
      present: "En tu inicio ahora:",
      sections: {
        "continue-working": "Continúa trabajando, los sermones que estás desarrollando",
        "revisit-ideas": "Retoma una idea, sermones sin terminar que llevan un tiempo sin tocarse",
        "recent-ideas": "Ideas recientes, lo último que capturaste",
        "recent-preaching": "Predicación reciente, las últimas veces que predicaste",
        "at-a-glance": "De un vistazo, tus ideas y tu predicación en cuatro cifras",
      },
      growing: "Aparecerán más secciones aquí a medida que captures, desarrolles y prediques.",
    },
    capture: {
      title: "Captura una idea",
      body: "Cuando llegue una idea, captúrala aquí, desde cualquier página. Guárdala como idea de sermón, idea de punto, o déjala sin decidir y elige después. Solo la idea es obligatoria.",
    },
    library: {
      title: "Tu biblioteca",
      body: "Aquí está cada idea que guardas. Busca por palabras, filtra por tipo, estado, formato y etiquetas, y ordena los resultados como necesites. Las Escrituras guardadas y tu registro de predicación también son secciones de la biblioteca.",
    },
    bible: {
      title: "La Biblia",
      body: (translations: string) =>
        `Lee aquí la ${translations}. Ve a cualquier libro, capítulo y versículo, guarda favoritos, resalta versículos y añade un pasaje a una idea de sermón o de punto.`,
      and: "y la",
    },
    outlines: {
      title: "Bosquejos",
      body: "Dale forma a un sermón: puntos principales y puntos dentro de ellos, una introducción y una conclusión, Escritura en cada uno, ideas de punto guardadas y la numeración en el estilo que prefieras.",
      note: "Un bosquejo organiza un sermón. No es un lugar para escribir el manuscrito.",
    },
    preaching: {
      title: "Registro de predicación",
      body: "Cada vez que prediques un sermón, registra la fecha, el lugar y qué tipo de ocasión fue. Un sermón sigue siendo una sola idea por muchas veces que lo prediques, y toda su historia queda con él.",
    },
    ready: {
      title: "Ya puedes comenzar.",
      body: "Captura una idea cuando llegue la inspiración y vuelve a desarrollarla cuando tengas tiempo.",
      again: "Puedes repetir este recorrido desde Configuración.",
    },
  },
  actions: {
    saved: "Guardado.",
    notSaved: "No se pudo guardar tu respuesta. Es posible que el recorrido vuelva a preguntar.",
  },
};
