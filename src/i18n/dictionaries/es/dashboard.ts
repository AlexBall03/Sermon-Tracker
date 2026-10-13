import type { Untranslated } from "../../index";
import type { dashboard as english } from "../en/dashboard";

export const dashboard: Untranslated<typeof english> = {
  metaTitle: "Inicio",
  welcome: "Te damos la bienvenida",
  welcomeNamed: (name) => `Te damos la bienvenida, ${name}`,
  description: "Retoma lo que estás desarrollando o captura lo que acaba de venirte a la mente.",
  empty: {
    title: "Empieza con una idea",
    body: "Primero captura el pensamiento. Después puedes desarrollarlo, hacerle un bosquejo y registrarlo cuando lo prediques.",
  },
  outline: {
    title: "Iniciar o abrir bosquejo",
  },
  record: {
    title: "Registrar predicación",
  },
  continue: {
    title: "Continúa trabajando",
    description: "Los sermones que has desarrollado más recientemente.",
    resume: "Retomar bosquejo",
    resumeNamed: (sermon) => `Retomar el bosquejo de ${sermon}`,
    openSermon: "Abrir sermón",
    openSermonNamed: (sermon) => `Abrir el sermón ${sermon}`,
    outline: "Bosquejo",
    noOutline: "Todavía sin bosquejo",
    none: "Todavía no hay nada en desarrollo. Agrega notas, Escritura o un bosquejo a una idea de sermón y aparecerá aquí para retomarla.",
    openLibrary: "Abrir Ideas de sermón",
  },
  revisit: {
    title: "Retoma una idea",
    description: "Ideas de sermón sin terminar en las que no trabajas desde hace tiempo.",
    all: "Ver todas las que necesitan atención",
    none: (days) =>
      `Nada te espera. Trabajaste en todas tus ideas de sermón sin terminar en los últimos ${days} días.`,
    openLibrary: "Abrir Ideas de sermón",
  },
  recent: {
    title: "Ideas recientes",
    all: "Abrir Ideas de sermón",
    updated: "Actualizada",
  },
  preaching: {
    title: "Predicación reciente",
    all: "Abrir Registro de predicación",
    none: "Todavía no hay nada registrado. Cuando prediques un sermón, regístralo aquí.",
    view: (sermon, date) => `${sermon}, predicado el ${date}: ver su registro`,
  },
  summary: {
    title: "De un vistazo",
    sermons: "Ideas de sermón",
    points: "Ideas de punto",
    developing: "En desarrollo",
    preached: "Veces predicado",
    unavailable: "No disponible",
  },
};
