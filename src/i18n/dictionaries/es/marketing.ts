import type { Untranslated } from "../../index";
import type { marketing as english } from "../en/marketing";

export const marketing: Untranslated<typeof english> = {
  meta: {
    title: "Sermon Tracker — Captura. Desarrolla. Predica.",
    description:
      "Sermon Tracker es donde los predicadores capturan ideas de sermón y de punto, las desarrollan, les hacen un bosquejo y llevan el registro de lo que han predicado.",
  },
  nav: {
    primary: "Principal",
    footer: "Pie de página",
    home: "Inicio de Sermon Tracker",
    features: "Funciones",
    how: "Cómo funciona",
    mobile: "App móvil",
    signIn: "Iniciar sesión",
    getStarted: "Comenzar",
    contact: "Contacto",
    privacy: "Privacidad",
    terms: "Términos",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    language: "Idioma",
  },
  hero: {
    eyebrow: "Para predicadores, de la primera nota al púlpito",
    title: "Del primer pensamiento al sermón terminado.",
    body: "Sermon Tracker guarda cada idea de sermón, punto reutilizable, bosquejo y registro de predicación en un solo lugar, para que nada digno de predicarse se pierda entre el momento en que llega y el día en que lo predicas.",
    getStarted: "Comenzar",
    signIn: "Iniciar sesión",
    desktopAlt:
      "El inicio de Sermon Tracker en una computadora: un saludo con acciones para capturar una idea, iniciar o abrir un bosquejo y registrar una predicación; después, los sermones en los que se trabaja, las ideas por retomar, las ideas recientes, la predicación reciente y cuatro cifras de un vistazo.",
    mobileAlt:
      "El inicio de Sermon Tracker en un teléfono: un saludo, los sermones en los que se trabaja y una barra con Inicio, Biblioteca, capturar, Bosquejos y Biblia.",
  },
  how: {
    title: "Un solo lugar para toda la vida de un sermón",
    body: "Un sermón casi nunca llega terminado. Sermon Tracker lo acompaña desde el pensamiento pasajero hasta el día en que se predica, y lo guarda donde puedas volver a encontrarlo.",
    note: "Nada de esto es un orden obligatorio. Empieza el bosquejo de un sermón que capturaste hace un minuto, o registra uno que predicaste hace años.",
    stages: {
      capture: {
        name: "Captura",
        title: "Captura ideas",
        body: "Guarda un pensamiento en segundos, desde cualquier página. Decide después si es un sermón, un punto o algo aún sin decidir.",
      },
      develop: {
        name: "Desarrolla",
        title: "Desarrolla sermones",
        body: "Agrega notas y Escritura, dale un estado, un tipo y etiquetas, y relaciónalo con los sermones y puntos con los que va.",
      },
      outline: {
        name: "Bosqueja",
        title: "Arma bosquejos",
        body: "Ordena la introducción, los puntos con sus subpuntos y la conclusión, cada uno con sus pasajes.",
      },
      preach: {
        name: "Predica",
        title: "Registra la predicación",
        body: "Anota cuándo y dónde se predicó un sermón, cada vez que se predique. El sermón sigue siendo uno solo.",
      },
      revisit: {
        name: "Retoma",
        title: "Retoma el trabajo anterior",
        body: "Las ideas sin terminar vuelven a ti después de un tiempo, y todo lo que has predicado se puede buscar.",
      },
    },
    examples: {
      captured: "Capturada ahora mismo",
      related: "Punto relacionado",
      preachedTwice: "Predicado 2 veces",
    },
  },
  features: {
    title: "Todo lo que un sermón necesita, y nada más",
    body: "Sermon Tracker no es un procesador de textos ni intenta reemplazar aquel en el que escribes. Guarda las ideas, la estructura, la Escritura y el registro.",
    library: {
      name: "Biblioteca",
      title: "Cada idea, fácil de encontrar",
      body: "Las ideas de sermón, las ideas de punto reutilizables y los pensamientos que aún no has clasificado viven en una sola biblioteca.",
      points: [
        "Busca en títulos, temas y notas",
        "Filtra por clase, estado, tipo de sermón, formato y etiquetas",
        "Relaciona un punto con cada sermón al que sirve",
      ],
      alt: "La sección Ideas de sermón de la biblioteca en una computadora: un buscador, filtros y tarjetas de ideas de sermón y de punto, cada una con su clase, estado, pasajes y fecha.",
    },
    bible: {
      name: "Biblia",
      title: "La Escritura junto al trabajo",
      body: "Lee la RVG en español o la King James en inglés, o las dos lado a lado en una pantalla ancha.",
      points: [
        "Resalta versículos en cuatro colores",
        "Guarda un versículo o un pasaje como favorito, con tus notas",
        "Agrega una selección directamente a una idea de sermón o de punto",
      ],
      alt: "El lector de la Biblia en un teléfono, abierto en 2 Corintios 12, con el versículo 9 resaltado y guardado como favorito.",
    },
    outlines: {
      name: "Bosquejos",
      title: "La forma del sermón",
      body: "Un bosquejo guarda encabezados cortos, notas breves y pasajes, con puntos anidados tan profundo como necesites. Organiza bosquejos; no es un editor de manuscritos.",
      points: [
        "Siete estilos de numeración, o uno propio",
        "Mueve los puntos arrastrándolos, desde un menú o con el teclado",
        "Trae una idea de punto guardada como copia",
      ],
      alt: "El editor de bosquejos en una computadora: una introducción, tres puntos numerados con subpuntos y pasajes, y una conclusión, con el estado de guardado en Guardado.",
    },
    preaching: {
      name: "Registro de predicación",
      title: "Cuándo y dónde se predicó",
      body: "Registra cada ocasión: la fecha, el lugar, la clase de servicio, cuánto predicaste y un enlace a la grabación.",
      points: [
        "Un sermón predicado cinco veces sigue siendo un solo sermón",
        "Busca y filtra todo tu registro de predicación",
        "Tus propios lugares y contextos",
      ],
      alt: "El Registro de predicación en un teléfono: tres ocasiones, cada una con su fecha, sermón, lugar y contexto.",
    },
    dashboard: {
      name: "Inicio",
      title: "Retoma donde lo dejaste",
      body: "El inicio se abre con los sermones que desarrollaste más recientemente, las ideas sin terminar que no tocas desde hace tiempo, tu predicación más reciente y cuatro cifras de todo tu espacio de trabajo.",
      points: [
        "Continúa trabajando sigue el trabajo real en un sermón",
        "Retoma una idea trae de vuelta lo que quedó en silencio",
        "El mismo espacio de trabajo en la computadora y en el teléfono",
      ],
      alt: "El inicio en una computadora, con el mismo inicio en un teléfono delante.",
    },
  },
  mobile: {
    title: "En tu teléfono, como una app",
    body: "Instala Sermon Tracker desde tu navegador y se abrirá desde tu pantalla de inicio, a pantalla completa, directo en tu espacio de trabajo. También se instala en una computadora, en su propia ventana. Capturar queda a un toque, al pie de cada página.",
    stepsTitle: "Instálala desde tu navegador",
    steps: [
      "Inicia sesión en Sermon Tracker en el navegador de tu teléfono.",
      "En un iPhone o iPad, toca Compartir y luego Agregar a inicio. En otros dispositivos, abre el menú del navegador (o el icono de instalar en la barra de direcciones) y elige Instalar app.",
      "Abre Sermon Tracker desde su icono e inicia sesión si te lo pide. Se abre en tu inicio.",
    ],
    signedIn:
      "La app instalada es tu propio espacio de trabajo: necesita una cuenta y conexión, y se abre en tu inicio. Una vez que inicies sesión, Configuración muestra los pasos para tu dispositivo.",
    alt: "Un teléfono con el inicio de Sermon Tracker desplazado hasta Retoma una idea, Predicación reciente y De un vistazo, junto al icono de Sermon Tracker como aparece en una pantalla de inicio.",
    iconLabel: "Sermon Tracker",
  },
  closing: {
    title: "Listo para cuando llegue la próxima idea",
    body: "Crea tu cuenta y tu espacio de trabajo estará listo: captura hoy la primera idea y encuéntrala de nuevo el día que la prediques.",
    getStarted: "Comenzar",
    signIn: "Iniciar sesión",
  },
  footer: {
    blurb: "Un solo lugar para ideas de sermón, bosquejos, Escritura y tu registro de predicación.",
    developedBy: "Desarrollado por:",
    status: "Abierto a nuevas cuentas",
  },
  preview: {
    translation: { en: "KJV", es: "RVG" },
  },
  demo: {
    firstName: "Alex",
    initials: "AB",
    sermons: {
      grace: {
        title: "Bástate mi gracia",
        subject: "La gracia en la debilidad",
        notes:
          "Pablo pidió tres veces que se le quitara el aguijón. La respuesta no fue alivio, sino gracia suficiente para llevarlo.",
      },
      story: {
        title: "La historia no ha terminado",
        subject: "La providencia",
        notes: "Los hermanos de José esperaban venganza. Él vio la mano de Dios en la cisterna.",
      },
      alone: {
        title: "No estás solo",
        subject: "La presencia de Dios",
        notes: "Tres razones para no temer, todas en un versículo.",
      },
      voice: { title: "Un silbo apacible y delicado", subject: "Oír a Dios", notes: "" },
      anchor: { title: "Un ancla del alma", subject: "La esperanza", notes: "" },
      well: {
        title: "Todo está bien",
        subject: "La fe en la pérdida",
        notes: "La sunamita lo dijo antes de verlo.",
      },
    },
    points: {
      strength: {
        title: "El poder se perfecciona en la debilidad",
        notes: "La debilidad no se quita. Se vuelve el lugar donde reposa Su poder.",
      },
      faith: { title: "La fe habla antes de ver", notes: "" },
    },
    undecided: { waiting: { title: "Lo que Dios hace mientras esperamos" } },
    tags: { suffering: "Sufrimiento", faith: "Fe", comfort: "Consuelo" },
    venues: {
      church: { name: "Iglesia Bautista Gracia", locality: "Springfield" },
      camp: { name: "Campamento Pine Ridge", locality: "" },
    },
    outline: {
      introduction: { title: "Un aguijón que no se iba", notes: "" },
      given: {
        title: "El aguijón fue dado",
        notes: "Pablo no lo llama un accidente.",
      },
      exalted: { title: "Para que no me enaltezca sobremanera", notes: "" },
      messenger: { title: "Un mensajero de Satanás, permitido por Dios", notes: "" },
      answered: { title: "La oración fue contestada", notes: "" },
      grace: { title: "No quitándolo, sino con gracia", notes: "" },
      power: {
        title: "El poder se perfecciona en la debilidad",
        notes: "La debilidad no se quita. Se vuelve el lugar donde reposa Su poder.",
      },
      conclusion: { title: "Cuando soy débil, entonces soy poderoso", notes: "" },
    },
    /** 2 Corintios 12:7–10, RVG. */
    verses: [
      "Y para que no me enaltezca desmedidamente por la grandeza de las revelaciones, me es dado un aguijón en mi carne, un mensajero de Satanás que me abofetee, para que no me enaltezca sobremanera.",
      "Por lo cual tres veces he rogado al Señor, que lo quite de mí.",
      "Y me ha dicho: Bástate mi gracia; porque mi poder se perfecciona en la debilidad. Por tanto, de buena gana me gloriaré más bien en mis debilidades, para que habite en mí el poder de Cristo.",
      "Por lo cual me gozo en las debilidades, en afrentas, en necesidades, en persecuciones, en angustias por amor a Cristo; porque cuando soy débil, entonces soy poderoso.",
    ],
  },
};
