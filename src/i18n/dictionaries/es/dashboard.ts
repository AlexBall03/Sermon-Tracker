import type { Untranslated } from "../../index";
import type { dashboard as english } from "../en/dashboard";

export const dashboard: Untranslated<typeof english> = {
  metaTitle: "Inicio",
  welcome: "Te damos la bienvenida",
  welcomeNamed: (name) => `Te damos la bienvenida, ${name}`,
  description: "Tu espacio para las ideas de sermones y para los puntos que las construyen.",
  empty: {
    title: "Todavía no hay ideas",
    body: "Captura el primer pensamiento que valga la pena guardar. Basta una línea, y después decides si es un sermón o un punto.",
  },
  recent: "Ideas recientes",
  openLibrary: "Abrir la biblioteca",
  revisit: {
    title: "Retoma una idea",
    description: "Ideas de sermón sin terminar en las que no trabajas desde hace tiempo.",
    all: "Ver todas las que necesitan atención",
    none: (days) =>
      `Nada te espera. Trabajaste en todas tus ideas de sermón sin terminar en los últimos ${days} días.`,
    openLibrary: "Abrir Ideas de sermón",
  },
  record: {
    title: "Registrar predicación",
  },
  workflow: {
    title: "Cómo funciona tu espacio",
    description:
      "El camino que recorre una idea. La captura, la biblioteca y el registro de predicación ya están abiertos.",
    stages: [
      {
        stage: "Capturar",
        title: "Primero guarda el pensamiento",
        body: "Basta una línea. No tienes que decidir si es un sermón o un punto antes de guardarlo.",
      },
      {
        stage: "Desarrollar",
        title: "Constrúyela con el tiempo",
        body: "Agrega Escritura y notas conforme lleguen, y une un punto a cada sermón al que sirve.",
      },
      {
        stage: "Predicar",
        title: "Lleva el registro",
        body: "Anota cuándo y dónde se predicó un sermón, junto a las ideas que lo produjeron.",
      },
    ],
    kinds: [
      {
        name: "Idea de sermón",
        body: "Un mensaje en formación: un título, un texto y el rumbo que lleva.",
      },
      {
        name: "Idea de punto",
        body: "Un pensamiento que se sostiene solo y puede usarse en más de un sermón.",
      },
      {
        name: "Sin decidir",
        body: "Algo que vale la pena guardar y que todavía no es ni lo uno ni lo otro. Más adelante puede volverse un sermón o un punto.",
      },
    ],
  },
  summary: {
    title: "De un vistazo",
    description:
      "Aquí irá un breve resumen de tu trabajo. Sus cifras llegan con el registro de predicación, así que todavía no se muestra ninguna.",
    stats: [
      { label: "Ideas de sermón", pending: "Cada sermón hacia el que estás trabajando." },
      { label: "Ideas de punto", pending: "Puntos reutilizables, contados una vez cada uno." },
      { label: "En desarrollo", pending: "Ideas que ya empezaste a desarrollar." },
      { label: "Veces predicado", pending: "Cada ocasión en que se predicó un sermón." },
    ],
  },
};
